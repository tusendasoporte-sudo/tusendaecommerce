import type { APIRoute } from 'astro';
import { pb } from '../../../lib/pocketbase';
import {
  CUBAN_PHONE_ERROR_ES,
  NUMBER_TAKEN_ERROR,
  buildRaffleWhatsappReceiptHref,
  cleanWhatsappNumber,
  createReceiptCode,
  escapePocketBaseValue,
  isFixedRaffleSlug,
  isRaffleConfigured,
  isRaffleLinkEnabled,
  isValidRaffleNumber,
  normalizeAccessCode,
  normalizeCubanPhone,
  normalizeRaffleSlug,
  raffleAcceptsEntries,
} from '../../../lib/raffles';

const MAX_BODY_BYTES = 4096;

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

async function firstActiveEntry(client: any, filter: string) {
  try {
    return await client.collection('raffle_entries').getFirstListItem(filter, { fields: 'id,chosen_number,phone,receipt_code,created,status,can_reenter' });
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function cancelledEntriesForPhone(client: any, raffleId: string, phone: string) {
  try {
    return await client.collection('raffle_entries').getFullList({
      filter: `raffle="${escapePocketBaseValue(raffleId)}" && phone="${escapePocketBaseValue(phone)}" && status="cancelled"`,
      fields: 'id,can_reenter',
      sort: '-updated,-created',
      raffle: raffleId,
      phone,
    });
  } catch (error: any) {
    if (error?.status === 404) return [];
    throw error;
  }
}

async function consumeReentryPermission(client: any, entries: any[], raffleId: string, phone: string) {
  await Promise.all(entries
    .filter((entry) => entry?.can_reenter === true)
    .map((entry) => client.collection('raffle_entries').update(entry.id, {
      raffle: raffleId,
      phone,
      can_reenter: false,
      reentry_allowed_at: '',
    })));
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

function receiptPayload(entry: any, raffle: any, raffleUrl: string, whatsappHref = '') {
  return {
    chosen_number: entry.chosen_number,
    phone: entry.phone,
    receipt_code: entry.receipt_code || '',
    created: entry.created,
    raffle_title: raffle.title,
    raffle_url: raffleUrl,
    whatsapp_url: whatsappHref,
  };
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
    const accessCode = normalizeAccessCode(cleanText(body.access_code, 80));
    const chosenNumber = cleanText(body.chosen_number, 2);
    const phone = normalizeCubanPhone(body.phone);

    if (!storeSlug || !raffleSlug) {
      return json({ ok: false, message: 'No se encontró la rifa.' }, 404);
    }

    if (!isFixedRaffleSlug(raffleSlug)) {
      return json({ ok: false, message: 'No se encontró la rifa.' }, 404);
    }

    if (!isValidRaffleNumber(chosenNumber)) {
      return json({ ok: false, message: 'Escoge un número disponible antes de confirmar.' }, 400);
    }

    if (!phone) {
      return json({ ok: false, message: CUBAN_PHONE_ERROR_ES }, 400);
    }

    if (!accessCode) {
      return json({ ok: false, message: 'Introduce el código exclusivo del grupo de WhatsApp.' }, 400);
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

    if (!raffleAcceptsEntries(raffle as any)) {
      return json({ ok: false, message: 'La selección de números no está disponible para esta rifa.' }, 409);
    }

    const raffleAccessCode = normalizeAccessCode(raffle.access_code);
    if (!raffleAccessCode) {
      return json({ ok: false, message: 'Esta rifa necesita actualizar su código del grupo.' }, 409);
    }

    if (accessCode !== raffleAccessCode) {
      return json({ ok: false, message: 'Código del grupo incorrecto.' }, 403);
    }

    const raffleUrl = new URL(`/t/${encodeURIComponent(store.slug)}/rifa/${encodeURIComponent(raffle.slug)}`, request.url).toString();
    const whatsapp = await getActiveSettingsWhatsapp(pb, store.id) || cleanWhatsappNumber(store.owner_phone);
    const raffleFilter = `raffle="${escapePocketBaseValue(raffle.id)}" && status="active"`;
    const existingPhone = await firstActiveEntry(pb, `${raffleFilter} && phone="${escapePocketBaseValue(phone)}"`);
    if (existingPhone) {
      const whatsappHref = buildRaffleWhatsappReceiptHref({
        whatsapp,
        storeName: store.name || 'PowerZona',
        raffleTitle: raffle.title || 'Rifa',
        chosenNumber: existingPhone.chosen_number,
        phone,
        receiptCode: existingPhone.receipt_code,
        raffleUrl,
      });
      return json({
        ok: false,
        message: 'Ya tienes una participación registrada en esta rifa.',
        reservedNumber: existingPhone.chosen_number,
        receipt: receiptPayload(existingPhone, raffle, raffleUrl, whatsappHref),
      }, 409);
    }

    const cancelledEntries = await cancelledEntriesForPhone(pb, raffle.id, phone);
    const hasReentryPermission = cancelledEntries.some((entry: any) => entry?.can_reenter === true);
    if (cancelledEntries.length && !hasReentryPermission) {
      return json({
        ok: false,
        message: 'Tu participación fue cancelada por la tienda. Contacta con la tienda si crees que fue un error.',
        participationBlocked: true,
      }, 403);
    }

    const existingNumber = await firstActiveEntry(pb, `${raffleFilter} && chosen_number="${escapePocketBaseValue(chosenNumber)}"`);
    if (existingNumber) {
      return json({ ok: false, message: NUMBER_TAKEN_ERROR, occupiedNumber: chosenNumber }, 409);
    }

    let entry: any = null;
    try {
      entry = await pb.collection('raffle_entries').create({
        store: store.id,
        raffle: raffle.id,
        phone,
        chosen_number: chosenNumber,
        receipt_code: createReceiptCode(store.slug),
        status: 'active',
      });
    } catch (error) {
      const phoneAfterConflict = await firstActiveEntry(pb, `${raffleFilter} && phone="${escapePocketBaseValue(phone)}"`);
      if (phoneAfterConflict) {
        const whatsappHref = buildRaffleWhatsappReceiptHref({
          whatsapp,
          storeName: store.name || 'PowerZona',
          raffleTitle: raffle.title || 'Rifa',
          chosenNumber: phoneAfterConflict.chosen_number,
          phone,
          receiptCode: phoneAfterConflict.receipt_code,
          raffleUrl,
        });
        return json({
          ok: false,
          message: 'Ya tienes una participación registrada en esta rifa.',
          reservedNumber: phoneAfterConflict.chosen_number,
          receipt: receiptPayload(phoneAfterConflict, raffle, raffleUrl, whatsappHref),
        }, 409);
      }

      const numberAfterConflict = await firstActiveEntry(pb, `${raffleFilter} && chosen_number="${escapePocketBaseValue(chosenNumber)}"`);
      if (numberAfterConflict) {
        return json({ ok: false, message: NUMBER_TAKEN_ERROR, occupiedNumber: chosenNumber }, 409);
      }

      throw error;
    }

    if (cancelledEntries.length) {
      await consumeReentryPermission(pb, cancelledEntries, raffle.id, phone);
    }

    const whatsappHref = buildRaffleWhatsappReceiptHref({
      whatsapp,
      storeName: store.name || 'PowerZona',
      raffleTitle: raffle.title || 'Rifa',
      chosenNumber,
      phone,
      receiptCode: entry.receipt_code,
      raffleUrl,
    });

    try {
      await pb.collection('store_notifications').create({
        store: store.id,
        type: 'raffle_entry_created',
        title: 'Nueva participación en rifa',
        message: `Nueva participación en rifa: número ${chosenNumber}`,
        status: 'unread',
        priority: 'normal',
        target_url: `/t/${encodeURIComponent(store.slug)}/admin/promos/raffles`,
        entity_collection: 'raffle_entries',
        entity_id: entry.id,
        metadata_json: {
          raffle_id: raffle.id,
          chosen_number: chosenNumber,
          source: 'public_raffle',
        },
      });
    } catch (_) {
    }

    return json({
      ok: true,
      message: 'Número reservado correctamente.',
      selected_number: entry.chosen_number,
      store_slug: store.slug,
      raffle_slug: raffle.slug,
      entry: {
        selected_number: entry.chosen_number,
        raffle_slug: raffle.slug,
        store_slug: store.slug,
      },
      receipt: receiptPayload(entry, raffle, raffleUrl, whatsappHref),
      occupiedNumber: chosenNumber,
    });
  } catch (error: any) {
    const status = error?.status === 404 ? 404 : 500;
    const message = status === 404
      ? 'No se encontró la rifa.'
      : 'No se pudo reservar el número. Intenta nuevamente.';

    return json({ ok: false, message }, status);
  }
};
