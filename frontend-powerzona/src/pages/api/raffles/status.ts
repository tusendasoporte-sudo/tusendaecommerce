import type { APIRoute } from 'astro';
import { pb } from '../../../lib/pocketbase';
import {
  buildRaffleWhatsappReceiptHref,
  cleanWhatsappNumber,
  escapePocketBaseValue,
  isFixedRaffleSlug,
  isRaffleConfigured,
  isRaffleLinkEnabled,
  normalizeCubanPhone,
  normalizeRaffleSlug,
} from '../../../lib/raffles';

const MAX_BODY_BYTES = 2048;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function firstActiveEntry(client: any, raffleId: string, phone: string) {
  try {
    return await client.collection('raffle_entries').getFirstListItem(
      `raffle="${escapePocketBaseValue(raffleId)}" && phone="${escapePocketBaseValue(phone)}" && status="active"`,
      { fields: 'chosen_number,phone,receipt_code,created,status' }
    );
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function cancelledEntriesForPhone(client: any, raffleId: string, phone: string) {
  try {
    return await client.collection('raffle_entries').getFullList({
      filter: `raffle="${escapePocketBaseValue(raffleId)}" && phone="${escapePocketBaseValue(phone)}" && status="cancelled"`,
      fields: 'can_reenter,cancelled_at,cancelled_reason,updated',
      sort: '-updated,-created',
      raffle: raffleId,
      phone,
    });
  } catch (error: any) {
    if (error?.status === 404) return [];
    throw error;
  }
}

async function getActiveSettingsWhatsapp(client: any, storeId: string) {
  try {
    const settings = await client.collection('settings').getFirstListItem(
      `store="${escapePocketBaseValue(storeId)}" && active=true`,
      { fields: 'whatsapp_number', sort: '-updated,-created' }
    );
    return cleanWhatsappNumber(settings?.whatsapp_number);
  } catch (_) {
    return '';
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const length = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
      return json({ ok: false, message: 'Solicitud demasiado grande.' }, 413);
    }

    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ ok: false, message: 'Solicitud inválida.' }, 400);
    }

    const body = payload as Record<string, unknown>;
    const storeSlug = normalizeRaffleSlug(cleanText(body.storeSlug, 90));
    const raffleSlug = normalizeRaffleSlug(cleanText(body.raffleSlug, 90));
    const phone = normalizeCubanPhone(body.phone);

    if (!storeSlug || !raffleSlug || !isFixedRaffleSlug(raffleSlug)) {
      return json({ ok: false, message: 'No se encontró la rifa.' }, 404);
    }

    if (!phone) {
      return json({ ok: false, message: 'Escribe un número cubano válido de 8 dígitos.' }, 400);
    }

    const store = await pb.collection('stores').getFirstListItem(
      `slug="${escapePocketBaseValue(storeSlug)}" && status="active"`
    );

    const raffle = await pb.collection('raffles').getFirstListItem(
      `store="${escapePocketBaseValue(store.id)}" && slug="${escapePocketBaseValue(raffleSlug)}" && is_configured=true && link_enabled=true`
    );

    if (!isRaffleConfigured(raffle as any) || !isRaffleLinkEnabled(raffle as any)) {
      return json({ ok: false, message: 'Esta rifa no está activa en este momento.' }, 403);
    }

    const activeEntry = await firstActiveEntry(pb, raffle.id, phone);
    const raffleUrl = new URL(`/t/${encodeURIComponent(store.slug)}/rifa/${encodeURIComponent(raffle.slug)}`, request.url).toString();
    const whatsapp = await getActiveSettingsWhatsapp(pb, store.id) || cleanWhatsappNumber(store.owner_phone);

    if (activeEntry) {
      const whatsappHref = buildRaffleWhatsappReceiptHref({
        whatsapp,
        storeName: store.name || 'PowerZona',
        raffleTitle: raffle.title || 'Rifa',
        chosenNumber: activeEntry.chosen_number,
        phone,
        receiptCode: activeEntry.receipt_code,
        raffleUrl,
      });

      return json({
        ok: true,
        status: 'active',
        message: 'Ya tienes una participación registrada en esta rifa.',
        receipt: {
          chosen_number: activeEntry.chosen_number,
          phone: activeEntry.phone,
          receipt_code: activeEntry.receipt_code,
          created: activeEntry.created,
          raffle_title: raffle.title,
          raffle_url: raffleUrl,
          whatsapp_url: whatsappHref,
        },
      });
    }

    const cancelledEntries = await cancelledEntriesForPhone(pb, raffle.id, phone);
    const hasReentryPermission = cancelledEntries.some((entry: any) => entry?.can_reenter === true);
    if (cancelledEntries.length && hasReentryPermission) {
      return json({
        ok: true,
        status: 'reentry_allowed',
        message: 'Puedes participar nuevamente. Escoge un número disponible.',
      });
    }

    if (cancelledEntries.length) {
      const latest = cancelledEntries[0] || {};
      return json({
        ok: true,
        status: 'cancelled',
        message: 'Tu participación fue cancelada por la tienda. Contacta con la tienda si crees que fue un error.',
        cancelled_at: latest.cancelled_at || latest.updated || '',
        participationBlocked: true,
      });
    }

    return json({ ok: true, status: 'none' });
  } catch (error: any) {
    const status = error?.status === 404 ? 404 : 500;
    const message = status === 404
      ? 'No se encontró la rifa.'
      : 'No se pudo validar tu participación. Intenta nuevamente.';

    return json({ ok: false, message }, status);
  }
};
