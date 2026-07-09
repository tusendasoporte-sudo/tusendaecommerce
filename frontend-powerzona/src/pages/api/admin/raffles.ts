import type { APIRoute } from 'astro';
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import {
  DEFAULT_RAFFLE_WINNER_MESSAGE,
  RAFFLE_PRIZE_DISPLAY_MODES,
  RAFFLE_STATUSES,
  ensureRaffleSlotsForStore,
  escapePocketBaseValue,
  getCalculatedRaffleStatus,
  getEffectiveRafflePrizeDisplayMode,
  getRaffleSlotByNumber,
  getRaffleSlotBySlug,
  isValidRaffleNumber,
  normalizeFileList,
  normalizeAccessCode,
  normalizeRaffleSlug,
} from '../../../lib/raffles';

const ALLOWED_STATUSES = new Set([
  'draft',
  'active',
  'selection_closed',
  'result_pending',
  'winner_published',
  'no_winner_published',
  'finalized',
  'archived',
]);
const ALLOWED_PRIZE_DISPLAY_MODES = new Set(['fixed', 'carousel']);
const RESULT_LOCKED_STATUSES = new Set(['winner_published', 'no_winner_published', 'finalized']);
const RAFFLE_PRIZE_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const RAFFLE_PRIZE_IMAGE_MAX_SIZE = 900;
const RAFFLE_PRIZE_WEBP_QUALITY = 86;
const ADMIN_RAFFLE_PERMISSION_MESSAGE = 'No se pudo guardar la rifa. Revisa los permisos de la colección o tu sesión de administrador.';
const ADMIN_RAFFLE_SCHEMA_MESSAGE = 'La estructura de Rifas en PocketBase no está actualizada. Ejecuta la migración nueva de Rifas.';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getAdminRaffleError(error: any, fallback: string) {
  const statusCode = Number(error?.status || error?.response?.status || 0);
  const rawMessage = String(error?.message || error?.response?.message || '');
  const detailText = (() => {
    try {
      return JSON.stringify(error?.response?.data || {});
    } catch (_) {
      return '';
    }
  })();
  const combinedMessage = `${rawMessage} ${detailText}`;
  if (statusCode === 401 || statusCode === 403 || /forbidden|unauthori[sz]ed|permission|permiso|auth/i.test(rawMessage)) {
    return { message: ADMIN_RAFFLE_PERMISSION_MESSAGE, status: 403 };
  }
  if (/access_code_hash|winner_message/i.test(combinedMessage) || (/access_code/i.test(combinedMessage) && /unknown|schema|field/i.test(combinedMessage))) {
    return { message: ADMIN_RAFFLE_SCHEMA_MESSAGE, status: 500 };
  }
  if (/failed to (create|update|delete) record/i.test(rawMessage)) {
    return { message: fallback, status: 400 };
  }

  const message = rawMessage || fallback;
  const status = /sesion|permiso|tienda|usuario|auth/i.test(message) ? 403 : 400;
  return { message, status };
}

function cleanText(value: unknown, max = 0) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return max > 0 ? text.slice(0, max) : text;
}

function cleanLongText(value: unknown, max = 0) {
  const text = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return max > 0 ? text.slice(0, max) : text;
}

function normalizeWinnerMessage(value: unknown) {
  const text = cleanLongText(value, 1800);
  return text || DEFAULT_RAFFLE_WINNER_MESSAGE;
}

function isIsoWithTimezone(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function cleanPrizeText(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanRafflePrizeWebpName(name: unknown) {
  const cleanBaseName = String(name || 'premio-rifa')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90);

  return `${cleanBaseName || 'premio-rifa'}.webp`;
}

async function optimizeRafflePrizeUpload(file: File): Promise<File> {
  const type = String(file?.type || '').toLowerCase();
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error('Selecciona una imagen valida para el premio.');
  }
  if (!RAFFLE_PRIZE_ALLOWED_IMAGE_TYPES.has(type)) {
    throw new Error('Solo se aceptan imagenes JPG, PNG o WebP para premios de rifa.');
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const webpBuffer = await sharp(inputBuffer)
      .rotate()
      .resize({
        width: RAFFLE_PRIZE_IMAGE_MAX_SIZE,
        height: RAFFLE_PRIZE_IMAGE_MAX_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: RAFFLE_PRIZE_WEBP_QUALITY })
      .toBuffer();

    if (!webpBuffer.length) throw new Error('No se pudo crear el WebP del premio.');

    return new File([new Uint8Array(webpBuffer)], cleanRafflePrizeWebpName(file.name), {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch (_) {
    throw new Error('No se pudo optimizar la imagen del premio. Sube un JPG, PNG o WebP valido.');
  }
}

function normalizeDateField(value: unknown, label: string) {
  const text = cleanText(value, 40);
  if (!text) return '';
  const dateText = isIsoWithTimezone(text)
    ? text
    : text.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, '$1T$2');
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} no tiene una fecha válida.`);
  }
  return date.toISOString();
}

function appendIfPresent(payload: FormData, key: string, value: string) {
  payload.append(key, value || '');
}

function sanitizeRaffleResponse(record: any) {
  if (!record || typeof record !== 'object') return record;
  const safeRecord = { ...record };
  delete safeRecord.access_code_hash;
  return safeRecord;
}

async function getAdminContext(request: Request) {
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  const adminContext = await requireCurrentStoreForAdmin(authPb);
  return { authPb, adminContext };
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, adminContext } = await getAdminContext(request);
    const slots = await ensureRaffleSlotsForStore(adminContext.storeId, authPb);
    return json({ ok: true, raffles: slots.map(sanitizeRaffleResponse) });
  } catch (error: any) {
    const adminError = getAdminRaffleError(error, 'No se pudieron cargar las rifas.');
    return json({ ok: false, message: adminError.message }, adminError.status);
  }
};

function isFixedSlotRaffle(raffle: any) {
  return Boolean(getRaffleSlotBySlug(raffle?.slug) || getRaffleSlotByNumber(raffle?.slot_number));
}

function getPersistedStatusForSave(raffle: any, nextDates: { starts_at?: string; closes_at?: string; draw_at?: string; link_enabled?: boolean }) {
  const existingStatus = String(raffle?.status || '');
  if (existingStatus === RAFFLE_STATUSES.WINNER_PUBLISHED || existingStatus === RAFFLE_STATUSES.NO_WINNER_PUBLISHED || existingStatus === RAFFLE_STATUSES.FINALIZED) {
    return existingStatus;
  }

  const calculated = getCalculatedRaffleStatus({
    ...(raffle || {}),
    ...nextDates,
    is_configured: true,
  } as any);

  if (calculated === RAFFLE_STATUSES.SCHEDULED) return RAFFLE_STATUSES.ACTIVE;
  if (calculated === RAFFLE_STATUSES.DRAFT) return RAFFLE_STATUSES.ACTIVE;
  return ALLOWED_STATUSES.has(String(calculated)) ? String(calculated) : RAFFLE_STATUSES.ACTIVE;
}

function assertCanPublishResult(raffle: any) {
  const status = getCalculatedRaffleStatus(raffle);
  if (status === RAFFLE_STATUSES.FINALIZED || RESULT_LOCKED_STATUSES.has(String(raffle?.status || '')) || raffle?.result_published_at || raffle?.finalized_at) {
    throw new Error('Esta rifa ya tiene resultado publicado o está finalizada.');
  }
}

function assertDrawDateReached(raffle: any) {
  const drawDate = dateTime(raffle?.draw_at);
  if (!drawDate) {
    throw new Error('Configura la fecha del sorteo antes de publicar resultado.');
  }
  if (drawDate.getTime() > Date.now()) {
    throw new Error('Todavía no ha llegado la fecha del sorteo.');
  }
}

function parsePrizePayload(formData: FormData) {
  const raw = String(formData.get('prizes_json') || '').trim();
  let items: unknown[] = [];

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch (_) {
      throw new Error('La lista de regalos no es válida.');
    }
  }

  return items.slice(0, 12).map((item, index) => {
    const prize = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const id = normalizeRaffleSlug(String(prize.id || `premio-${index + 1}`)) || `premio-${index + 1}`;
    const uploadKey = normalizeRaffleSlug(String(prize.upload_key || id)) || id;

    return {
      id,
      uploadKey,
      name: cleanPrizeText(prize.name, 80),
      description: cleanPrizeText(prize.description, 180),
      image: normalizeFileList(prize.image)[0] || '',
    };
  }).filter((prize) => {
    const file = formData.get(`prize_image_${prize.uploadKey}`);
    return prize.name || prize.description || prize.image || (file instanceof File && file.size > 0);
  });
}

async function assertRaffleBelongsToStore(client: any, raffleId: string, storeId: string) {
  const raffle = await client.collection('raffles').getOne(raffleId);
  if (String(raffle.store || '') !== storeId) {
    throw new Error('Esta rifa no pertenece a tu tienda.');
  }
  if (!isFixedSlotRaffle(raffle)) {
    throw new Error('Esta rifa no pertenece a los 3 espacios fijos de la tienda.');
  }
  return raffle;
}

async function assertEntryBelongsToRaffle(client: any, entryId: string, raffleId: string, storeId: string) {
  const entry = await client.collection('raffle_entries').getOne(entryId);
  if (String(entry.raffle || '') !== raffleId || String(entry.store || '') !== storeId) {
    throw new Error('Esta participación no pertenece a tu tienda.');
  }
  return entry;
}

function dateTime(value: unknown) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isResultLocked(raffle: any) {
  return RESULT_LOCKED_STATUSES.has(String(raffle?.status || ''))
    || Boolean(raffle?.result_published_at)
    || getCalculatedRaffleStatus(raffle) === RAFFLE_STATUSES.FINALIZED;
}

function hasPublishedResult(raffle: any) {
  return Boolean(raffle?.winner_number || raffle?.no_winner_number || raffle?.result_published_at)
    || String(raffle?.status || '') === RAFFLE_STATUSES.WINNER_PUBLISHED
    || String(raffle?.status || '') === RAFFLE_STATUSES.NO_WINNER_PUBLISHED;
}

async function deleteRaffleEntries(client: any, raffleId: string) {
  const entries = await client.collection('raffle_entries').getFullList({
    filter: `raffle="${escapePocketBaseValue(raffleId)}"`,
    fields: 'id',
  }).catch((error: any) => {
    if (error?.status === 404) return [];
    throw error;
  });

  await Promise.all(entries.map((entry: any) => (
    client.collection('raffle_entries').delete(entry.id)
  )));
}

async function resetRaffleContent(client: any, raffle: any) {
  const fixedSlot = getRaffleSlotByNumber(raffle.slot_number) || getRaffleSlotBySlug(raffle.slug);
  if (!fixedSlot) throw new Error('Selecciona un espacio válido de rifa.');

  await deleteRaffleEntries(client, raffle.id);
  return client.collection('raffles').update(raffle.id, {
    store: raffle.store,
    title: 'Nueva rifa',
    slug: fixedSlot.slug,
    slot_number: fixedSlot.slotNumber,
    is_configured: false,
    description: '',
    conditions: '',
    winner_message: '',
    access_code: '',
    images: [],
    prizes_json: [],
    prizes_display_mode: RAFFLE_PRIZE_DISPLAY_MODES.FIXED,
    starts_at: '',
    closes_at: '',
    draw_at: '',
    status: RAFFLE_STATUSES.DRAFT,
    winner_number: '',
    no_winner_number: '',
    result_published_at: '',
    no_winner_expires_at: '',
    finalized_at: '',
    link_enabled: false,
    show_in_store: false,
    visible: false,
    selection_manually_closed: false,
    reset_at: new Date().toISOString(),
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const { authPb, adminContext } = await getAdminContext(request);
    const formData = await request.formData();
    const id = cleanText(formData.get('id'), 80);
    const title = cleanText(formData.get('title'), 140);
    const accessCode = normalizeAccessCode(cleanText(formData.get('access_code'), 80));
    const startsAt = normalizeDateField(formData.get('starts_at'), 'El inicio');
    const closesAt = normalizeDateField(formData.get('closes_at'), 'El cierre de selección');
    const drawAt = normalizeDateField(formData.get('draw_at'), 'El sorteo');
    const linkEnabled = formData.get('link_enabled') === 'true';
    const showInStore = formData.get('show_in_store') === 'true';
    const winnerMessage = normalizeWinnerMessage(formData.get('winner_message'));
    const prizes = parsePrizePayload(formData);
    const requestedPrizeDisplayMode = cleanText(formData.get('prizes_display_mode'), 40);
    const prizesDisplayMode = getEffectiveRafflePrizeDisplayMode(
      ALLOWED_PRIZE_DISPLAY_MODES.has(requestedPrizeDisplayMode) ? requestedPrizeDisplayMode : 'fixed',
      prizes.length
    );

    if (!id) return json({ ok: false, message: 'Selecciona uno de los 3 espacios de rifa.' }, 400);
    if (!accessCode) return json({ ok: false, message: 'El código del grupo es obligatorio para guardar la rifa.' }, 400);
    if (!title) return json({ ok: false, message: 'Escribe el título de la rifa.' }, 400);

    await ensureRaffleSlotsForStore(adminContext.storeId, authPb);
    const existingRaffle = await assertRaffleBelongsToStore(authPb, id, adminContext.storeId);
    const fixedSlot = getRaffleSlotByNumber(existingRaffle.slot_number) || getRaffleSlotBySlug(existingRaffle.slug);
    if (!fixedSlot) return json({ ok: false, message: 'Selecciona un espacio válido de rifa.' }, 400);

    if (startsAt && closesAt && new Date(startsAt).getTime() > new Date(closesAt).getTime()) {
      return json({ ok: false, message: 'El inicio debe ser antes del cierre de selección.' }, 400);
    }
    if (closesAt && drawAt && new Date(closesAt).getTime() > new Date(drawAt).getTime()) {
      return json({ ok: false, message: 'El cierre de selección debe ser antes o igual que el sorteo.' }, 400);
    }

    const status = getPersistedStatusForSave(existingRaffle, {
      starts_at: startsAt,
      closes_at: closesAt,
      draw_at: drawAt,
      link_enabled: linkEnabled,
    });

    const payload = new FormData();
    payload.append('store', adminContext.storeId);
    payload.append('title', title);
    payload.append('slug', fixedSlot.slug);
    payload.append('slot_number', String(fixedSlot.slotNumber));
    payload.append('is_configured', 'true');
    appendIfPresent(payload, 'description', cleanLongText(formData.get('description'), 0));
    appendIfPresent(payload, 'conditions', cleanLongText(formData.get('conditions'), 0));
    appendIfPresent(payload, 'winner_message', winnerMessage);
    appendIfPresent(payload, 'starts_at', startsAt);
    appendIfPresent(payload, 'closes_at', closesAt);
    appendIfPresent(payload, 'draw_at', drawAt);
    payload.append('status', String(status));
    payload.append('link_enabled', String(linkEnabled));
    payload.append('show_in_store', String(showInStore));
    payload.append('visible', String(linkEnabled));
    payload.append('selection_manually_closed', String(Boolean(existingRaffle.selection_manually_closed)));
    if (status === 'finalized' && !existingRaffle?.finalized_at) {
      payload.append('finalized_at', new Date().toISOString());
    } else if (status !== 'finalized') {
      payload.append('finalized_at', '');
    }

    payload.append('access_code', accessCode);

    const uploadedPrizeIds: string[] = [];
    for (const prize of prizes) {
      const file = formData.get(`prize_image_${prize.uploadKey}`);
      if (file instanceof File && file.size > 0) {
        const optimizedFile = await optimizeRafflePrizeUpload(file);
        payload.append('images', optimizedFile);
        uploadedPrizeIds.push(prize.id);
      }
    }

    const record = await authPb.collection('raffles').update(id, payload);

    const savedImages = normalizeFileList(record.images);
    const uploadedNames = uploadedPrizeIds.length ? savedImages.slice(-uploadedPrizeIds.length) : [];
    let uploadedIndex = 0;
    const finalPrizes = prizes.map((prize) => {
      const nextImage = uploadedPrizeIds.includes(prize.id)
        ? (uploadedNames[uploadedIndex++] || prize.image)
        : prize.image;

      return {
        id: prize.id,
        name: prize.name,
        description: prize.description,
        image: nextImage,
      };
    });

    const finalPayload: Record<string, unknown> = {
      prizes_json: JSON.stringify(finalPrizes),
      prizes_display_mode: prizesDisplayMode,
    };
    if (!finalPrizes.length) finalPayload.images = [];

    const finalRecord = await authPb.collection('raffles').update(record.id, finalPayload);

    return json({ ok: true, raffle: sanitizeRaffleResponse(finalRecord) });
  } catch (error: any) {
    const adminError = getAdminRaffleError(error, 'No se pudo guardar la rifa. Verifica el código del grupo, las fechas y los premios.');
    return json({ ok: false, message: adminError.message }, adminError.status);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const { authPb, adminContext } = await getAdminContext(request);
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ ok: false, message: 'Solicitud inválida.' }, 400);
    }

    const body = payload as Record<string, unknown>;
    const id = cleanText(body.id, 80);
    const action = cleanText(body.action, 40);
    if (!id) return json({ ok: false, message: 'No se encontró la rifa.' }, 400);
    const currentRaffle = await assertRaffleBelongsToStore(authPb, id, adminContext.storeId);

    if (action === 'publish_winner') {
      assertCanPublishResult(currentRaffle);
      assertDrawDateReached(currentRaffle);
      const number = cleanText(body.number, 2);
      if (!isValidRaffleNumber(number)) return json({ ok: false, message: 'Escribe un número entre 00 y 99.' }, 400);

      const entry = await authPb.collection('raffle_entries').getFirstListItem(
        `raffle="${escapePocketBaseValue(id)}" && chosen_number="${escapePocketBaseValue(number)}" && status="active"`,
        { fields: 'id,phone,chosen_number,receipt_code,created,status' }
      ).catch((error: any) => {
        if (error?.status === 404) return null;
        throw error;
      });

      if (!entry) {
        return json({ ok: false, message: 'Ese número no tiene participante activo. Puedes marcar No hubo ganador.' }, 409);
      }

      const raffle = await authPb.collection('raffles').update(id, {
        status: 'winner_published',
        winner_number: number,
        no_winner_number: '',
        result_published_at: new Date().toISOString(),
        no_winner_expires_at: '',
        finalized_at: '',
      });
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle), winnerEntry: entry });
    }

    if (action === 'publish_no_winner') {
      assertCanPublishResult(currentRaffle);
      assertDrawDateReached(currentRaffle);
      const number = cleanText(body.number, 2);
      if (!isValidRaffleNumber(number)) return json({ ok: false, message: 'Escribe un número entre 00 y 99.' }, 400);

      const entry = await authPb.collection('raffle_entries').getFirstListItem(
        `raffle="${escapePocketBaseValue(id)}" && chosen_number="${escapePocketBaseValue(number)}" && status="active"`,
        { fields: 'id' }
      ).catch((error: any) => {
        if (error?.status === 404) return null;
        throw error;
      });

      if (entry) {
        return json({ ok: false, message: 'Este número tiene participante activo. Publica ganador o selecciona otro número.' }, 409);
      }

      const now = new Date();
      const raffle = await authPb.collection('raffles').update(id, {
        status: 'no_winner_published',
        winner_number: '',
        no_winner_number: number,
        result_published_at: now.toISOString(),
        no_winner_expires_at: '',
        finalized_at: '',
      });
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle) });
    }

    if (action === 'cancel_entry') {
      const entryId = cleanText(body.entryId, 80);
      const reason = cleanText(body.reason, 220);
      if (!entryId) return json({ ok: false, message: 'No se encontró la participación.' }, 400);
      const entry = await assertEntryBelongsToRaffle(authPb, entryId, id, adminContext.storeId);
      if (String(entry.status || 'active') !== 'active') {
        return json({ ok: false, message: 'Esta participación ya no está activa.' }, 409);
      }
      const updatedEntry = await authPb.collection('raffle_entries').update(entryId, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_reason: reason,
        can_reenter: false,
        reentry_allowed_at: '',
      });
      return json({ ok: true, entry: updatedEntry });
    }

    if (action === 'allow_entry_reenter') {
      const entryId = cleanText(body.entryId, 80);
      if (!entryId) return json({ ok: false, message: 'No se encontró la participación.' }, 400);
      const entry = await assertEntryBelongsToRaffle(authPb, entryId, id, adminContext.storeId);
      if (String(entry.status || '') !== 'cancelled') {
        return json({ ok: false, message: 'Solo se puede autorizar una participación cancelada.' }, 409);
      }
      const activeEntry = await authPb.collection('raffle_entries').getFirstListItem(
        `raffle="${escapePocketBaseValue(id)}" && phone="${escapePocketBaseValue(String(entry.phone || ''))}" && status="active"`,
        { fields: 'id' }
      ).catch((error: any) => {
        if (error?.status === 404) return null;
        throw error;
      });
      if (activeEntry) {
        return json({ ok: false, message: 'Este cliente ya participo nuevamente.' }, 409);
      }
      const updatedEntry = await authPb.collection('raffle_entries').update(entryId, {
        can_reenter: true,
        reentry_allowed_at: new Date().toISOString(),
      });
      return json({ ok: true, entry: updatedEntry });
    }

    if (action === 'close_selection') {
      if (!currentRaffle.is_configured) return json({ ok: false, message: 'Configura la rifa antes de cerrar selección.' }, 409);
      if (isResultLocked(currentRaffle)) return json({ ok: false, message: 'Esta rifa ya tiene resultado publicado o está finalizada.' }, 409);
      const raffle = await authPb.collection('raffles').update(id, {
        selection_manually_closed: true,
        status: RAFFLE_STATUSES.SELECTION_CLOSED,
      });
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle) });
    }

    if (action === 'open_selection') {
      if (!currentRaffle.is_configured) return json({ ok: false, message: 'Configura la rifa antes de abrir selección.' }, 409);
      if (isResultLocked(currentRaffle)) {
        return json({ ok: false, message: 'Esta rifa ya tiene resultado publicado o está finalizada. Para iniciar otra, restablece el espacio de rifa.' }, 409);
      }

      const now = new Date();
      const currentClose = dateTime(currentRaffle.closes_at);
      const currentDraw = dateTime(currentRaffle.draw_at);
      const updatePayload: Record<string, unknown> = {
        selection_manually_closed: false,
        status: RAFFLE_STATUSES.ACTIVE,
      };

      if (!currentClose || currentClose.getTime() <= now.getTime()) {
        const nextClose = normalizeDateField(body.closes_at, 'El nuevo cierre de selección');
        if (!nextClose) return json({ ok: false, message: 'Escribe un nuevo cierre de selección.' }, 400);
        const nextCloseDate = dateTime(nextClose);
        if (!nextCloseDate || nextCloseDate.getTime() <= now.getTime()) {
          return json({ ok: false, message: 'El nuevo cierre debe ser futuro.' }, 400);
        }

        let nextDraw = normalizeDateField(body.draw_at, 'La nueva fecha del sorteo');
        const mustUpdateDraw = !currentDraw || currentDraw.getTime() <= nextCloseDate.getTime() || currentDraw.getTime() <= now.getTime();
        if (mustUpdateDraw && !nextDraw) {
          return json({ ok: false, message: 'Escribe una nueva fecha del sorteo posterior al cierre.' }, 400);
        }
        if (!nextDraw) nextDraw = currentRaffle.draw_at || '';

        const nextDrawDate = dateTime(nextDraw);
        if (!nextDrawDate || nextDrawDate.getTime() <= nextCloseDate.getTime()) {
          return json({ ok: false, message: 'El sorteo debe ser posterior al cierre de selección.' }, 400);
        }

        updatePayload.closes_at = nextClose;
        updatePayload.draw_at = nextDraw;
      }

      const raffle = await authPb.collection('raffles').update(id, updatePayload);
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle) });
    }

    if (action === 'finalize') {
      const raffle = await authPb.collection('raffles').update(id, {
        status: RAFFLE_STATUSES.FINALIZED,
        finalized_at: new Date().toISOString(),
        selection_manually_closed: true,
      });
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle) });
    }

    if (action === 'open_raffle') {
      if (!currentRaffle.is_configured) return json({ ok: false, message: 'Configura la rifa antes de abrirla.' }, 409);
      if (hasPublishedResult(currentRaffle)) {
        return json({ ok: false, message: 'Esta rifa ya tiene resultado publicado o está finalizada. Para iniciar otra, restablece el espacio de rifa.' }, 409);
      }

      const now = new Date();
      const currentClose = dateTime(currentRaffle.closes_at);
      const currentDraw = dateTime(currentRaffle.draw_at);
      const updatePayload: Record<string, unknown> = {
        status: RAFFLE_STATUSES.ACTIVE,
        finalized_at: '',
        selection_manually_closed: false,
      };

      if (!currentClose || currentClose.getTime() <= now.getTime()) {
        const nextClose = normalizeDateField(body.closes_at, 'El nuevo cierre de selección');
        if (!nextClose) return json({ ok: false, message: 'Escribe un nuevo cierre de selección.' }, 400);
        const nextCloseDate = dateTime(nextClose);
        if (!nextCloseDate || nextCloseDate.getTime() <= now.getTime()) {
          return json({ ok: false, message: 'El nuevo cierre debe ser futuro.' }, 400);
        }

        let nextDraw = normalizeDateField(body.draw_at, 'La nueva fecha del sorteo');
        const mustUpdateDraw = !currentDraw || currentDraw.getTime() <= nextCloseDate.getTime() || currentDraw.getTime() <= now.getTime();
        if (mustUpdateDraw && !nextDraw) {
          return json({ ok: false, message: 'Escribe una nueva fecha del sorteo posterior al cierre.' }, 400);
        }
        if (!nextDraw) nextDraw = currentRaffle.draw_at || '';

        const nextDrawDate = dateTime(nextDraw);
        if (!nextDrawDate || nextDrawDate.getTime() <= nextCloseDate.getTime()) {
          return json({ ok: false, message: 'El sorteo debe ser posterior al cierre de selección.' }, 400);
        }

        updatePayload.closes_at = nextClose;
        updatePayload.draw_at = nextDraw;
      }

      const raffle = await authPb.collection('raffles').update(id, updatePayload);
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle) });
    }

    if (action === 'reset') {
      const raffle = await resetRaffleContent(authPb, currentRaffle);
      return json({ ok: true, raffle: sanitizeRaffleResponse(raffle) });
    }

    return json({ ok: false, message: 'Acción no válida.' }, 400);
  } catch (error: any) {
    const adminError = getAdminRaffleError(error, 'No se pudo actualizar la rifa.');
    return json({ ok: false, message: adminError.message }, adminError.status);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { authPb, adminContext } = await getAdminContext(request);
    const url = new URL(request.url);
    const id = cleanText(url.searchParams.get('id'), 80);
    if (!id) return json({ ok: false, message: 'No se encontró la rifa.' }, 400);
    const raffle = await assertRaffleBelongsToStore(authPb, id, adminContext.storeId);
    const resetRaffle = await resetRaffleContent(authPb, raffle);
    return json({ ok: true, raffle: sanitizeRaffleResponse(resetRaffle) });
  } catch (error: any) {
    const adminError = getAdminRaffleError(error, 'No se pudo restablecer la rifa.');
    return json({ ok: false, message: adminError.message }, adminError.status);
  }
};
