import { normalizePromoCmsDocument } from './promoCms.ts';

export const PROMO_REVIEWS_API_PATH = '/api/admin/promo-reviews';
export const PROMO_REVIEWS_LIST_CONTRACT = 'promo.reviews.page.v1';
export const PROMO_REVIEWS_MODERATION_CONTRACT = 'promo.reviews.moderation.v1';
export const PROMO_REVIEWS_FILTERS = Object.freeze(['all', 'pending', 'approved', 'hidden', 'rejected'] as const);
export const PROMO_REVIEWS_ACTIONS = Object.freeze(['approve', 'reject', 'hide', 'feature', 'unfeature'] as const);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const STORE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;
const REVIEW_SECTION_KEY = 'store-rating-main';
const REVIEW_COPY = Object.freeze({
  en: Object.freeze({ navigation: 'Reviews', heading: 'What our customers say' }),
  es: Object.freeze({ navigation: 'Reseñas', heading: 'Lo que dicen nuestros clientes' }),
});

type JsonRecord = Record<string, any>;
export type PromoReviewsFilter = (typeof PROMO_REVIEWS_FILTERS)[number];
export type PromoReviewsAction = (typeof PROMO_REVIEWS_ACTIONS)[number];

export type PromoReview = Readonly<{
  id: string;
  rating: number;
  name: string;
  comment: string;
  status: Exclude<PromoReviewsFilter, 'all'>;
  featured: boolean;
  created: string;
  updated: string;
}>;

export type PromoReviewsPage = Readonly<{
  filter: PromoReviewsFilter;
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  summary: Readonly<{
    total: number;
    pending: number;
    approved: number;
    hidden: number;
    rejected: number;
    approvedAverage: number;
  }>;
  reviews: readonly PromoReview[];
}>;

export class PromoReviewsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_reviews_unavailable', status = 503) {
    super('No se pudo completar la operación de reseñas Promo.');
    this.name = 'PromoReviewsError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoReviewsError(code, status);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return value;
}

function safeText(value: unknown, max: number, required = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)
    || (required && !value.trim())) fail();
  return value;
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) fail();
  return Number(value);
}

function normalizeReview(value: unknown): PromoReview {
  const review = exactRecord(value, ['id', 'rating', 'name', 'comment', 'status', 'featured', 'created', 'updated']);
  if (!RECORD_ID_PATTERN.test(String(review.id || ''))
    || !PROMO_REVIEWS_FILTERS.slice(1).includes(review.status)
    || typeof review.featured !== 'boolean') fail();
  return Object.freeze({
    id: review.id,
    rating: safeInteger(review.rating, 1, 5),
    name: safeText(review.name, 120, true),
    comment: safeText(review.comment, 1200),
    status: review.status,
    featured: review.featured,
    created: safeText(review.created, 80),
    updated: safeText(review.updated, 80, true),
  });
}

export function normalizePromoReviewsPage(value: unknown): PromoReviewsPage {
  const response = exactRecord(value, [
    'ok', 'contract', 'filter', 'page', 'per_page', 'total_items', 'total_pages', 'summary', 'reviews',
  ]);
  if (response.ok !== true || response.contract !== PROMO_REVIEWS_LIST_CONTRACT
    || !PROMO_REVIEWS_FILTERS.includes(response.filter) || !Array.isArray(response.reviews)) fail();
  const summary = exactRecord(response.summary, [
    'total', 'pending', 'approved', 'hidden', 'rejected', 'approved_average',
  ]);
  const approvedAverage = Number(summary.approved_average);
  if (!Number.isFinite(approvedAverage) || approvedAverage < 0 || approvedAverage > 5) fail();
  return Object.freeze({
    filter: response.filter,
    page: safeInteger(response.page, 1, 100000),
    perPage: safeInteger(response.per_page, 1, 50),
    totalItems: safeInteger(response.total_items, 0, 1_000_000),
    totalPages: safeInteger(response.total_pages, 1, 100000),
    summary: Object.freeze({
      total: safeInteger(summary.total, 0, 1_000_000),
      pending: safeInteger(summary.pending, 0, 1_000_000),
      approved: safeInteger(summary.approved, 0, 1_000_000),
      hidden: safeInteger(summary.hidden, 0, 1_000_000),
      rejected: safeInteger(summary.rejected, 0, 1_000_000),
      approvedAverage,
    }),
    reviews: Object.freeze(response.reviews.map(normalizeReview)),
  });
}

export function normalizePromoReviewModeration(value: unknown) {
  const response = exactRecord(value, ['ok', 'contract', 'changed', 'review']);
  if (response.ok !== true || response.contract !== PROMO_REVIEWS_MODERATION_CONTRACT
    || typeof response.changed !== 'boolean') fail();
  return Object.freeze({ changed: response.changed, review: normalizeReview(response.review) });
}

export function promoReviewsStoreSlug(value: unknown) {
  const slug = String(value || '').trim().toLowerCase();
  return STORE_SLUG_PATTERN.test(slug) ? slug : '';
}

function copyForLocale(locale: string) {
  const copy = REVIEW_COPY[locale as keyof typeof REVIEW_COPY];
  if (!copy) fail('promo_system_locale_unavailable', 400);
  return copy;
}

function safeHeading(value: unknown) {
  const heading = safeText(value, 160, true).trim();
  if (/<\/?[a-z][^>]*>/i.test(heading) || /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(heading)
    || /\b[a-z][a-z0-9+.-]*:\/\//i.test(heading)) fail('unsafe_promo_document_value', 400);
  return heading;
}

export function buildPromoReviewsDisplayDocument(
  value: unknown,
  settings: Readonly<{ enabled: boolean; heading: string }>,
) {
  const document = normalizePromoCmsDocument(value);
  if (typeof settings.enabled !== 'boolean') fail();
  const defaultLocale = String(document.locales.default || '');
  const defaultCopy = copyForLocale(defaultLocale);
  const heading = safeHeading(settings.heading || defaultCopy.heading);
  let section = document.sections.find((item: JsonRecord) => item.type === 'store_rating');
  if (!section) {
    if (document.sections.some((item: JsonRecord) => item.key === REVIEW_SECTION_KEY)) fail('invalid_payload', 400);
    section = {
      key: REVIEW_SECTION_KEY,
      type: 'store_rating',
      variant: 'default',
      visible: settings.enabled,
      config: {},
      media_use_keys: [],
    };
    const insertionIndex = document.sections.findIndex((item: JsonRecord) => ['contact', 'footer'].includes(item.type));
    const target = insertionIndex < 0 ? document.sections.length : insertionIndex;
    document.sections.splice(target, 0, section);
    document.section_order.splice(target, 0, section.key);
  }
  section.visible = settings.enabled;
  document.adapters.store_rating.enabled = settings.enabled;
  for (const locale of Object.keys(document.content_by_locale)) {
    const localized = document.content_by_locale[locale];
    const copy = copyForLocale(locale);
    localized.navigation[section.key] = String(localized.navigation[section.key] || copy.navigation);
    localized.sections[section.key] = {
      ...(isRecord(localized.sections[section.key]) ? localized.sections[section.key] : {}),
      heading: locale === defaultLocale
        ? heading
        : String(localized.sections[section.key]?.heading || copy.heading),
    };
  }
  return document;
}

export function promoReviewsErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'Tu sesión terminó. Vuelve a iniciar sesión.',
    session_revoked: 'Tu sesión ya no está vigente. Vuelve a iniciar sesión.',
    blocked_by_plan: 'El plan actual bloquea la gestión de este sitio.',
    promo_capability_denied: 'La capacidad Promo necesaria no está disponible.',
    promo_permission_denied: 'Tu sesión no tiene permiso para gestionar reseñas.',
    promo_reviews_conflict: 'La reseña cambió en otra sesión. Recarga la lista.',
    invalid_review_transition: 'Esa acción ya no es válida para el estado actual de la reseña.',
    invalid_origin: 'La solicitud no proviene del panel administrativo.',
    promo_draft_conflict: 'La configuración cambió en otra sesión. Recárgala antes de guardar.',
    incomplete_promo_locale: 'Completa los textos de todos los idiomas antes de publicar.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
