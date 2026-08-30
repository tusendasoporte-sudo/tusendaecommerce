export const PROMO_REVIEW_REQUESTS_API_PATH = '/api/admin/promo-review-requests';
export const PROMO_PUBLIC_REVIEWS_LIST_CONTRACT = 'promo.reviews.public-page.v2';
export const PROMO_PUBLIC_REVIEW_SUBMISSION_CONTRACT = 'promo.review.submission.v2';
export const PROMO_PUBLIC_REVIEW_REQUEST_CONTEXT_CONTRACT = 'promo.review-request.context-response.v2';
export const PROMO_REVIEW_REQUEST_CREATED_CONTRACT = 'promo.review-requests.created.v2';
export const PROMO_REVIEW_REQUESTS_PAGE_CONTRACT = 'promo.review-requests.page.v2';
export const PROMO_REVIEW_REQUEST_REVOKED_CONTRACT = 'promo.review-requests.revoked.v2';
export const PROMO_REVIEW_REQUEST_REVEALED_CONTRACT = 'promo.review-requests.revealed.v1';
export const PROMO_REVIEW_REQUEST_DELETED_CONTRACT = 'promo.review-requests.deleted.v1';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,96}$/;
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const REQUEST_STATUSES = Object.freeze(['pending', 'received', 'expired', 'revoked'] as const);

type JsonRecord = Record<string, any>;
export type PromoReviewRequestStatus = (typeof REQUEST_STATUSES)[number];

export type PromoPublicReview = Readonly<{
  rating: number;
  name: string;
  comment: string;
  date: string;
  featured: boolean;
  serviceVerified: boolean;
}>;

export type PromoPublicReviewsPage = Readonly<{
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  reviews: readonly PromoPublicReview[];
}>;

export type PromoReviewRequest = Readonly<{
  id: string;
  status: PromoReviewRequestStatus;
  locale: string;
  customerLabel: string;
  workLabel: string;
  reviewId: string;
  expiresAt: string;
  created: string;
  shareable: boolean;
}>;

export type PromoReviewRequestsPage = Readonly<{
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  summary: Readonly<Record<PromoReviewRequestStatus, number>>;
  requests: readonly PromoReviewRequest[];
}>;

export class PromoReviewRequestsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code = 'promo_reviews_unavailable', status = 503) {
    super(code);
    this.name = 'PromoReviewRequestsError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'invalid_payload', status = 400): never {
  throw new PromoReviewRequestsError(code, status);
}

function record(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  const parsed = value as JsonRecord;
  const actual = Object.keys(parsed).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return parsed;
}

function stringValue(value: unknown, maximum: number, required = false) {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())
    || /[\u0000-\u001f\u007f]/.test(value)) fail();
  return value;
}

function int(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) fail();
  return Number(value);
}

function requestValue(value: unknown): PromoReviewRequest {
  const item = record(value, [
    'id', 'status', 'locale', 'customer_label', 'work_label',
    'review_id', 'expires_at', 'created', 'shareable',
  ]);
  if (!RECORD_ID_PATTERN.test(String(item.id || '')) || !REQUEST_STATUSES.includes(item.status)
    || !LOCALE_PATTERN.test(String(item.locale || ''))
    || (item.review_id && !RECORD_ID_PATTERN.test(String(item.review_id)))
    || typeof item.shareable !== 'boolean' || (item.status !== 'pending' && item.shareable)) fail();
  return Object.freeze({
    id: item.id,
    status: item.status,
    locale: item.locale,
    customerLabel: stringValue(item.customer_label, 120),
    workLabel: stringValue(item.work_label, 240),
    reviewId: String(item.review_id || ''),
    expiresAt: stringValue(item.expires_at, 80, true),
    created: stringValue(item.created, 80, true),
    shareable: item.shareable,
  });
}

function publicReview(value: unknown): PromoPublicReview {
  const item = record(value, ['rating', 'name', 'comment', 'date', 'featured', 'service_verified']);
  if (typeof item.featured !== 'boolean' || typeof item.service_verified !== 'boolean'
    || (item.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.date))) fail();
  return Object.freeze({
    rating: int(item.rating, 1, 5),
    name: stringValue(item.name, 80, true),
    comment: stringValue(item.comment, 1000),
    date: item.date,
    featured: item.featured,
    serviceVerified: item.service_verified,
  });
}

export function normalizePromoPublicReviewsPage(value: unknown): PromoPublicReviewsPage {
  const response = record(value, ['ok', 'contract', 'page', 'per_page', 'total_items', 'total_pages', 'reviews']);
  if (response.ok !== true || response.contract !== PROMO_PUBLIC_REVIEWS_LIST_CONTRACT
    || !Array.isArray(response.reviews)) fail();
  return Object.freeze({
    page: int(response.page, 1, 100000),
    perPage: int(response.per_page, 1, 50),
    totalItems: int(response.total_items, 0, 1_000_000),
    totalPages: int(response.total_pages, 1, 100000),
    reviews: Object.freeze(response.reviews.map(publicReview)),
  });
}

export function normalizePromoPublicReviewSubmission(value: unknown) {
  const response = record(value, ['ok', 'contract', 'status', 'service_verified']);
  if (response.ok !== true || response.contract !== PROMO_PUBLIC_REVIEW_SUBMISSION_CONTRACT
    || response.status !== 'pending' || typeof response.service_verified !== 'boolean') fail();
  return Object.freeze({ status: 'pending' as const, serviceVerified: response.service_verified });
}

export function normalizePromoPublicRequestContext(value: unknown) {
  const response = record(value, [
    'ok', 'contract', 'locale', 'customer_label', 'work_label', 'expires_at',
  ]);
  if (response.ok !== true || response.contract !== PROMO_PUBLIC_REVIEW_REQUEST_CONTEXT_CONTRACT
    || !LOCALE_PATTERN.test(String(response.locale || ''))) fail();
  return Object.freeze({
    locale: response.locale,
    customerLabel: stringValue(response.customer_label, 120),
    workLabel: stringValue(response.work_label, 240),
    expiresAt: stringValue(response.expires_at, 80, true),
  });
}

export function normalizePromoReviewRequestsPage(value: unknown): PromoReviewRequestsPage {
  const response = record(value, [
    'ok', 'contract', 'page', 'per_page', 'total_items', 'total_pages', 'summary', 'requests',
  ]);
  if (response.ok !== true || response.contract !== PROMO_REVIEW_REQUESTS_PAGE_CONTRACT
    || !Array.isArray(response.requests)) fail();
  const summary = record(response.summary, REQUEST_STATUSES);
  return Object.freeze({
    page: int(response.page, 1, 100000),
    perPage: int(response.per_page, 1, 50),
    totalItems: int(response.total_items, 0, 1_000_000),
    totalPages: int(response.total_pages, 1, 100000),
    summary: Object.freeze({
      pending: int(summary.pending, 0, 1_000_000),
      received: int(summary.received, 0, 1_000_000),
      expired: int(summary.expired, 0, 1_000_000),
      revoked: int(summary.revoked, 0, 1_000_000),
    }),
    requests: Object.freeze(response.requests.map(requestValue)),
  });
}

export function normalizePromoReviewRequestCreated(value: unknown) {
  const response = record(value, ['ok', 'contract', 'token', 'request']);
  if (response.ok !== true || response.contract !== PROMO_REVIEW_REQUEST_CREATED_CONTRACT
    || !TOKEN_PATTERN.test(String(response.token || ''))) fail();
  return Object.freeze({ token: response.token as string, request: requestValue(response.request) });
}

export function normalizePromoReviewRequestRevoked(value: unknown) {
  const response = record(value, ['ok', 'contract', 'request']);
  if (response.ok !== true || response.contract !== PROMO_REVIEW_REQUEST_REVOKED_CONTRACT) fail();
  const request = requestValue(response.request);
  if (request.status !== 'revoked') fail();
  return request;
}

export function normalizePromoReviewRequestRevealed(value: unknown) {
  const response = record(value, ['ok', 'contract', 'token', 'request']);
  if (response.ok !== true || response.contract !== PROMO_REVIEW_REQUEST_REVEALED_CONTRACT
    || !TOKEN_PATTERN.test(String(response.token || ''))) fail();
  const request = requestValue(response.request);
  if (request.status !== 'pending' || !request.shareable) fail();
  return Object.freeze({ token: response.token as string, request });
}

export function normalizePromoReviewRequestDeleted(value: unknown) {
  const response = record(value, ['ok', 'contract', 'request_id']);
  if (response.ok !== true || response.contract !== PROMO_REVIEW_REQUEST_DELETED_CONTRACT
    || !RECORD_ID_PATTERN.test(String(response.request_id || ''))) fail();
  return Object.freeze({ requestId: response.request_id as string });
}

export function promoPublicReviewsPath(publicSlug: unknown, suffix = '') {
  const slug = String(publicSlug || '');
  if (!PUBLIC_SLUG_PATTERN.test(slug) || (suffix && suffix !== 'request')) fail();
  return `/api/promo/reviews/sites/${slug}${suffix ? `/${suffix}` : ''}`;
}

export function promoPublicPageLink(publicSlug: unknown, locale: unknown, origin: unknown) {
  const slug = String(publicSlug || '');
  const normalizedLocale = String(locale || '');
  if (!PUBLIC_SLUG_PATTERN.test(slug) || !LOCALE_PATTERN.test(normalizedLocale)) fail();
  let url: URL;
  try { url = new URL(`/promo/${slug}/${normalizedLocale}`, String(origin || '')); }
  catch (_) { return fail(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail();
  return url.toString();
}

export function promoReviewRequestLink(publicSlug: unknown, locale: unknown, token: unknown, origin: unknown) {
  const normalizedToken = String(token || '');
  if (!TOKEN_PATTERN.test(normalizedToken)) fail();
  const url = new URL(promoPublicPageLink(publicSlug, locale, origin));
  url.hash = `review-request=${normalizedToken}`;
  return url.toString();
}

export function promoReviewRequestsErrorMessage(code: unknown) {
  const messages: Record<string, string> = {
    invalid_payload: 'Revisa los datos de la solicitud.',
    invalid_origin: 'La solicitud no proviene de esta página.',
    unsafe_review_content: 'El texto no puede incluir enlaces, HTML ni código.',
    review_submission_too_fast: 'Espera unos segundos antes de enviar la reseña.',
    review_rate_limited: 'Se alcanzó el límite de reseñas para este dispositivo por hoy.',
    invalid_review_request: 'Este enlace de reseña no es válido.',
    review_request_used: 'Este enlace ya fue utilizado.',
    review_request_expired: 'Este enlace de reseña venció.',
    review_request_revoked: 'Este enlace fue revocado.',
    review_request_link_unavailable: 'Este enlace anterior no puede recuperarse. Revócalo o bórralo y crea uno nuevo.',
    promo_permission_denied: 'Tu sesión no tiene permiso para gestionar solicitudes.',
  };
  return messages[String(code || '')] || 'No se pudo completar la operación. Intenta nuevamente.';
}
