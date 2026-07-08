import { randomBytes } from 'node:crypto';
import { pb, getPocketBaseFileUrl } from './pocketbase';

export const CUBAN_PHONE_ERROR_ES = 'Escribe un número cubano válido de 8 dígitos.';
export const NUMBER_TAKEN_ERROR = 'Este número acaba de ser reservado. Escoge otro número disponible.';

export const RAFFLE_STATUSES = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  SELECTION_CLOSED: 'selection_closed',
  RESULT_PENDING: 'result_pending',
  WINNER_PUBLISHED: 'winner_published',
  NO_WINNER_PUBLISHED: 'no_winner_published',
  FINALIZED: 'finalized',
  ARCHIVED: 'archived',
} as const;

export type RaffleStatus = (typeof RAFFLE_STATUSES)[keyof typeof RAFFLE_STATUSES];

export const RAFFLE_FIXED_SLOTS = [
  { slotNumber: 1, slug: 'rifa-1', label: 'Rifa 1' },
  { slotNumber: 2, slug: 'rifa-2', label: 'Rifa 2' },
  { slotNumber: 3, slug: 'rifa-3', label: 'Rifa 3' },
] as const;

export const RAFFLE_FIXED_SLUGS = RAFFLE_FIXED_SLOTS.map((slot) => slot.slug);

export const RAFFLE_PRIZE_DISPLAY_MODES = {
  FIXED: 'fixed',
  CAROUSEL: 'carousel',
} as const;

export const RAFFLE_FIXED_PRIZE_LIMIT = 3;

export const DEFAULT_RAFFLE_WINNER_MESSAGE = [
  'Felicidades {nombre_cliente}',
  '',
  'Tu numero {numero_ganador} salio ganador en la rifa de {nombre_tienda}.',
  '',
  'Rifa: {nombre_rifa}',
  'Premio: {premios}',
  '',
  'Por favor contactanos para coordinar la entrega de tu premio.',
  '',
  'Link de la rifa:',
  '{link_rifa}',
].join('\n');

export type RafflePrizeDisplayMode = (typeof RAFFLE_PRIZE_DISPLAY_MODES)[keyof typeof RAFFLE_PRIZE_DISPLAY_MODES];

export type RafflePrize = {
  id: string;
  name: string;
  description: string;
  image?: string;
};

export type RafflePrizeCard = RafflePrize & {
  label: string;
  imageUrl: string;
};

export type RaffleRecord = {
  id: string;
  store: string;
  title: string;
  slug: string;
  slot_number?: number;
  is_configured?: boolean;
  description?: string;
  conditions?: string;
  access_code?: string;
  access_code_hash?: string;
  images?: string[] | string;
  prizes_json?: RafflePrize[] | string;
  prizes_display_mode?: RafflePrizeDisplayMode | string;
  winner_message?: string;
  starts_at?: string;
  closes_at?: string;
  draw_at?: string;
  status?: RaffleStatus | string;
  winner_number?: string;
  no_winner_number?: string;
  result_published_at?: string;
  no_winner_expires_at?: string;
  finalized_at?: string;
  link_enabled?: boolean;
  show_in_store?: boolean;
  visible?: boolean;
  selection_manually_closed?: boolean;
  reset_at?: string;
  created?: string;
  updated?: string;
  [key: string]: any;
};

export type RaffleEntryRecord = {
  id: string;
  store: string;
  raffle: string;
  phone: string;
  chosen_number: string;
  receipt_code: string;
  status: 'active' | 'cancelled' | string;
  cancelled_at?: string;
  cancelled_reason?: string;
  can_reenter?: boolean;
  reentry_allowed_at?: string;
  created?: string;
  updated?: string;
  [key: string]: any;
};

export function escapePocketBaseValue(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function normalizeRaffleSlug(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90);
}

export function isFixedRaffleSlug(value: unknown) {
  return RAFFLE_FIXED_SLUGS.includes(normalizeRaffleSlug(String(value || '')) as any);
}

export function getRaffleSlotBySlug(value: unknown) {
  const slug = normalizeRaffleSlug(String(value || ''));
  return RAFFLE_FIXED_SLOTS.find((slot) => slot.slug === slug) || null;
}

export function getRaffleSlotByNumber(value: unknown) {
  const number = Number(value);
  return RAFFLE_FIXED_SLOTS.find((slot) => slot.slotNumber === number) || null;
}

export function getRaffleSlotLabel(raffle: Partial<RaffleRecord> | null | undefined) {
  const slot = getRaffleSlotByNumber(raffle?.slot_number) || getRaffleSlotBySlug(raffle?.slug);
  return slot?.label || 'Rifa';
}

export function isRaffleConfigured(raffle: Partial<RaffleRecord> | null | undefined) {
  return Boolean(raffle?.is_configured);
}

export function normalizeAccessCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase();
}

export function normalizeCubanPhone(value: unknown) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) return `53${digits}`;
  if (/^53\d{8}$/.test(digits)) return digits;
  return '';
}

export function isValidRaffleNumber(value: unknown) {
  return /^[0-9]{2}$/.test(String(value ?? ''));
}

export function formatRaffleNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 99) return '';
  return String(number).padStart(2, '0');
}

export function normalizeFileList(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  const single = String(value || '').trim();
  return single ? [single] : [];
}

export function raffleImageUrls(raffle: RaffleRecord) {
  return normalizeFileList(raffle?.images).map((filename) => (
    getPocketBaseFileUrl('raffles', raffle.id, filename)
  ));
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function cleanPrizeText(value: unknown, max: number) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function normalizeRafflePrizeDisplayMode(value: unknown): RafflePrizeDisplayMode {
  return value === RAFFLE_PRIZE_DISPLAY_MODES.CAROUSEL
    ? RAFFLE_PRIZE_DISPLAY_MODES.CAROUSEL
    : RAFFLE_PRIZE_DISPLAY_MODES.FIXED;
}

export function shouldForceRafflePrizeCarousel(prizeCount: unknown) {
  return Number(prizeCount || 0) > RAFFLE_FIXED_PRIZE_LIMIT;
}

export function getEffectiveRafflePrizeDisplayMode(value: unknown, prizeCount: unknown): RafflePrizeDisplayMode {
  return shouldForceRafflePrizeCarousel(prizeCount)
    ? RAFFLE_PRIZE_DISPLAY_MODES.CAROUSEL
    : normalizeRafflePrizeDisplayMode(value);
}

export function parseRafflePrizes(raffle: Partial<RaffleRecord> | null | undefined, storeName = 'PowerZona') {
  const structured = parseJsonArray(raffle?.prizes_json)
    .map((item, index) => {
      const prize = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const id = normalizeRaffleSlug(String(prize.id || `premio-${index + 1}`)) || `premio-${index + 1}`;
      const name = cleanPrizeText(prize.name, 80);
      const prizeDescription = cleanPrizeText(prize.description, 180);
      const image = normalizeFileList(prize.image)[0] || '';

      return { id, name, description: prizeDescription, image };
    })
    .filter((prize) => prize.name || prize.description || prize.image);

  if (structured.length) return structured;

  return normalizeFileList(raffle?.images).map((image, index) => ({
    id: `legacy-${index + 1}`,
    name: `Premio ${index + 1}`,
    description: cleanPrizeText(raffle?.description, 180) || `Premio de ${storeName}`,
    image,
  }));
}

export function rafflePrizeImageUrl(raffle: RaffleRecord, image: unknown) {
  const filename = normalizeFileList(image)[0] || '';
  return filename ? getPocketBaseFileUrl('raffles', raffle.id, filename) : '';
}

export function rafflePrizeCards(raffle: RaffleRecord, storeName = 'PowerZona', fallbackDescription = ''): RafflePrizeCard[] {
  const prizes = parseRafflePrizes(raffle, storeName);
  const cards = prizes.map((prize, index) => ({
    ...prize,
    label: `Premio ${index + 1}`,
    imageUrl: rafflePrizeImageUrl(raffle, prize.image),
  }));

  if (cards.length) return cards;

  return [{
    id: 'premio',
    label: 'Premio',
    name: raffle.title || `Rifa ${storeName}`,
    description: cleanPrizeText(fallbackDescription || raffle.description, 180) || `La tienda anunciará los detalles del premio en el grupo de WhatsApp.`,
    image: '',
    imageUrl: '',
  }];
}

export function hasStarted(raffle: RaffleRecord, now = new Date()) {
  if (!raffle.starts_at) return true;
  const startsAt = new Date(raffle.starts_at);
  return Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= now.getTime();
}

export function closesInFuture(raffle: RaffleRecord, now = new Date()) {
  if (!raffle.closes_at) return false;
  const closesAt = new Date(raffle.closes_at);
  return !Number.isNaN(closesAt.getTime()) && closesAt.getTime() > now.getTime();
}

export function isRaffleLinkEnabled(raffle: Partial<RaffleRecord> | null | undefined) {
  if (!raffle) return false;
  if (typeof raffle.link_enabled === 'boolean') return raffle.link_enabled;
  return raffle.visible !== false;
}

export function isRaffleShownInStore(raffle: Partial<RaffleRecord> | null | undefined) {
  return Boolean(raffle?.show_in_store);
}

export function addHours(dateValue: unknown, hours: number) {
  const date = new Date(String(dateValue || ''));
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function getCalculatedRaffleStatus(raffle: Partial<RaffleRecord> | null | undefined, now = new Date()): RaffleStatus | string {
  if (!raffle) return RAFFLE_STATUSES.ARCHIVED;
  if (!isRaffleConfigured(raffle)) return RAFFLE_STATUSES.DRAFT;

  const status = String(raffle.status || RAFFLE_STATUSES.ACTIVE);
  if (status === RAFFLE_STATUSES.ARCHIVED) return RAFFLE_STATUSES.ARCHIVED;
  if (status === RAFFLE_STATUSES.FINALIZED) return RAFFLE_STATUSES.FINALIZED;

  const finalizedAt = raffle.finalized_at ? new Date(raffle.finalized_at) : null;
  if (finalizedAt && !Number.isNaN(finalizedAt.getTime()) && finalizedAt.getTime() <= now.getTime()) {
    return RAFFLE_STATUSES.FINALIZED;
  }

  if (status === RAFFLE_STATUSES.WINNER_PUBLISHED || status === RAFFLE_STATUSES.NO_WINNER_PUBLISHED) {
    const autoFinalizedAt = addHours(raffle.result_published_at, 24);
    if (autoFinalizedAt && autoFinalizedAt.getTime() <= now.getTime()) {
      return RAFFLE_STATUSES.FINALIZED;
    }
    return status;
  }

  const drawAt = raffle.draw_at ? new Date(raffle.draw_at) : null;
  if (drawAt && !Number.isNaN(drawAt.getTime()) && drawAt.getTime() <= now.getTime()) {
    return RAFFLE_STATUSES.RESULT_PENDING;
  }

  if (raffle.selection_manually_closed) return RAFFLE_STATUSES.SELECTION_CLOSED;

  const closesAt = raffle.closes_at ? new Date(raffle.closes_at) : null;
  if (closesAt && !Number.isNaN(closesAt.getTime()) && closesAt.getTime() <= now.getTime()) {
    return RAFFLE_STATUSES.SELECTION_CLOSED;
  }

  if (status === RAFFLE_STATUSES.SELECTION_CLOSED || status === RAFFLE_STATUSES.RESULT_PENDING) return status;

  const startsAt = raffle.starts_at ? new Date(raffle.starts_at) : null;
  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt.getTime() > now.getTime()) {
    return RAFFLE_STATUSES.SCHEDULED;
  }

  return RAFFLE_STATUSES.ACTIVE;
}

export function raffleAcceptsEntries(raffle: RaffleRecord, now = new Date()) {
  return isRaffleConfigured(raffle)
    && getCalculatedRaffleStatus(raffle, now) === RAFFLE_STATUSES.ACTIVE
    && isRaffleLinkEnabled(raffle)
    && hasStarted(raffle, now)
    && closesInFuture(raffle, now)
    && !raffle.selection_manually_closed;
}

export function createReceiptCode(storeSlug = '') {
  const storeCode = normalizeRaffleSlug(storeSlug)
    .split('-')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'PZ';
  const randomCode = randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
  return `RF-${storeCode}-${randomCode}`;
}

export function cleanWhatsappNumber(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

export function buildRaffleWhatsappReceiptHref({
  whatsapp,
  storeName,
  raffleTitle,
  chosenNumber,
  phone,
  receiptCode,
  raffleUrl,
}: {
  whatsapp: string;
  storeName: string;
  raffleTitle: string;
  chosenNumber: string;
  phone: string;
  receiptCode: string;
  raffleUrl: string;
}) {
  const number = cleanWhatsappNumber(whatsapp);
  if (!number) return '';

  const message = [
    `Hola ${storeName}, confirmo mi participación en la rifa.`,
    '',
    `Rifa: ${raffleTitle}`,
    `Número escogido: ${chosenNumber}`,
    `Teléfono: ${phone}`,
    `Comprobante: ${receiptCode}`,
    `Link de la rifa: ${raffleUrl}`,
    '',
    'Gracias.',
  ].join('\n');

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export async function getVisibleRaffleBySlug(storeId: string, raffleSlug: string, client = pb) {
  const slug = normalizeRaffleSlug(raffleSlug);
  if (!storeId || !isFixedRaffleSlug(slug)) return null;

  try {
    return await client.collection('raffles').getFirstListItem(
      `store="${escapePocketBaseValue(storeId)}" && slug="${escapePocketBaseValue(slug)}" && is_configured=true && link_enabled=true`
    ) as RaffleRecord;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function getFirstVisibleRaffle(storeId: string, client = pb) {
  if (!storeId) return null;

  try {
    const result = await client.collection('raffles').getList(1, 1, {
      filter: `store="${escapePocketBaseValue(storeId)}" && is_configured=true && link_enabled=true && show_in_store=true && status!="archived" && (slug="rifa-1" || slug="rifa-2" || slug="rifa-3")`,
      sort: 'slot_number,-updated,-created',
    });
    return (result.items?.[0] || null) as RaffleRecord | null;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function getOccupiedRaffleNumbers(raffleId: string) {
  if (!raffleId) return [];

  try {
    const entries = await pb.collection('raffle_entries').getFullList({
      filter: `raffle="${escapePocketBaseValue(raffleId)}" && status="active"`,
      fields: 'chosen_number',
      sort: 'chosen_number',
    });
    return entries.map((entry: any) => String(entry.chosen_number || '')).filter(isValidRaffleNumber);
  } catch (_) {
    return [];
  }
}

function hasLegacyRaffleContent(raffle: Partial<RaffleRecord> | null | undefined) {
  if (!raffle) return false;
  return Boolean(
    cleanPrizeText(raffle.title, 140).replace(/^Nueva rifa$/i, '')
    || cleanPrizeText(raffle.access_code, 80)
    || cleanPrizeText(raffle.description, 20)
    || cleanPrizeText(raffle.conditions, 20)
    || raffle.starts_at
    || raffle.closes_at
    || raffle.draw_at
    || parseRafflePrizes(raffle as RaffleRecord).length
  );
}

export async function ensureRaffleSlotsForStore(storeId: string, client = pb) {
  if (!storeId) return [];

  const filter = `store="${escapePocketBaseValue(storeId)}"`;
  const existing = await client.collection('raffles').getFullList({
    filter,
    sort: 'slot_number,created',
  }) as RaffleRecord[];

  const fixedBySlug = new Map<string, RaffleRecord>();
  const legacy = [] as RaffleRecord[];

  existing.forEach((raffle) => {
    const slug = normalizeRaffleSlug(raffle.slug || '');
    if (isFixedRaffleSlug(slug)) {
      fixedBySlug.set(slug, raffle);
    } else {
      legacy.push(raffle);
    }
  });

  const slots: RaffleRecord[] = [];

  for (const slot of RAFFLE_FIXED_SLOTS) {
    const current = fixedBySlug.get(slot.slug);
    if (current) {
      const payload: Record<string, unknown> = {};
      if (Number(current.slot_number) !== slot.slotNumber) payload.slot_number = slot.slotNumber;
      if (current.slug !== slot.slug) payload.slug = slot.slug;
      if (typeof current.is_configured !== 'boolean') payload.is_configured = hasLegacyRaffleContent(current);
      if (!current.title) payload.title = 'Nueva rifa';
      const updated = Object.keys(payload).length
        ? await client.collection('raffles').update(current.id, payload)
        : current;
      slots.push(updated as RaffleRecord);
      continue;
    }

    const legacyIndex = legacy.findIndex((raffle) => hasLegacyRaffleContent(raffle));
    const legacyRaffle = legacyIndex >= 0 ? legacy.splice(legacyIndex, 1)[0] : null;
    if (legacyRaffle) {
      const updated = await client.collection('raffles').update(legacyRaffle.id, {
        slug: slot.slug,
        slot_number: slot.slotNumber,
        is_configured: true,
        link_enabled: Boolean(legacyRaffle.link_enabled),
        show_in_store: Boolean(legacyRaffle.show_in_store),
        visible: Boolean(legacyRaffle.link_enabled),
      });
      slots.push(updated as RaffleRecord);
      continue;
    }

    const created = await client.collection('raffles').create({
      store: storeId,
      title: 'Nueva rifa',
      slug: slot.slug,
      slot_number: slot.slotNumber,
      is_configured: false,
      status: RAFFLE_STATUSES.DRAFT,
      access_code: '',
      description: '',
      conditions: '',
      winner_message: DEFAULT_RAFFLE_WINNER_MESSAGE,
      starts_at: '',
      closes_at: '',
      draw_at: '',
      winner_number: '',
      no_winner_number: '',
      result_published_at: '',
      no_winner_expires_at: '',
      finalized_at: '',
      link_enabled: false,
      show_in_store: false,
      visible: false,
      selection_manually_closed: false,
      prizes_json: [],
      prizes_display_mode: RAFFLE_PRIZE_DISPLAY_MODES.FIXED,
      images: [],
    });
    slots.push(created as RaffleRecord);
  }

  await Promise.all(legacy.map((raffle) => (
    client.collection('raffles').update(raffle.id, {
      link_enabled: false,
      show_in_store: false,
      visible: false,
      status: raffle.status === RAFFLE_STATUSES.ARCHIVED ? raffle.status : RAFFLE_STATUSES.ARCHIVED,
    }).catch(() => null)
  )));

  return slots.sort((a, b) => Number(a.slot_number || 0) - Number(b.slot_number || 0));
}
