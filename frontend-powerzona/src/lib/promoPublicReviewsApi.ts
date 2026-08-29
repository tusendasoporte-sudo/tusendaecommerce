import { serverPocketBaseUrl } from './pocketBaseServerUrl';
import { promoCmsSameOriginMutation } from './promoCms';
import {
  normalizePromoPublicRequestContext,
  normalizePromoPublicReviewsPage,
  normalizePromoPublicReviewSubmission,
  promoPublicReviewsPath,
  PromoReviewRequestsError,
} from './promoReviewRequests';

const SAFE_ERRORS = new Set([
  'invalid_payload', 'invalid_origin', 'unsafe_review_content', 'review_submission_too_fast',
  'review_rate_limited', 'invalid_review_request', 'review_request_used', 'review_request_expired',
  'review_request_revoked', 'promo_not_found', 'promo_reviews_unavailable',
]);

function headers(contentType = 'application/json') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: headers() });
}

function exact(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function safeSlug(value: unknown) {
  const slug = String(value || '');
  promoPublicReviewsPath(slug);
  return slug;
}

async function backendJson(path: string, init: RequestInit) {
  const base = serverPocketBaseUrl();
  if (!base) throw new PromoReviewRequestsError('promo_reviews_unavailable', 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (_) { throw new PromoReviewRequestsError('promo_reviews_unavailable', 503); }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = String(result?.error || 'promo_reviews_unavailable');
    throw new PromoReviewRequestsError(SAFE_ERRORS.has(code) ? code : 'promo_reviews_unavailable', response.status || 503);
  }
  return result;
}

function errorResponse(error: unknown) {
  if (error instanceof PromoReviewRequestsError) {
    const status = [400, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503;
    return json({ ok: false, error: SAFE_ERRORS.has(error.code) ? error.code : 'promo_reviews_unavailable' }, status);
  }
  return json({ ok: false, error: 'promo_reviews_unavailable' }, 503);
}

function backendPath(slug: string, suffix = '') {
  return `/api/pz/promo/public/v1/reviews/sites/${slug}${suffix ? `/${suffix}` : ''}`;
}

export async function publicReviewsList(request: Request, publicSlug: unknown) {
  try {
    const slug = safeSlug(publicSlug);
    const entries = Array.from(new URL(request.url).searchParams.entries());
    if (entries.length !== 2 || entries.map(([key]) => key).sort().join('|') !== 'locale|page') {
      throw new PromoReviewRequestsError('invalid_payload', 400);
    }
    const values = Object.fromEntries(entries);
    const target = new URL(`${serverPocketBaseUrl()}${backendPath(slug)}`);
    target.searchParams.set('contract', 'promo.reviews.public-list.v2');
    target.searchParams.set('locale', values.locale);
    target.searchParams.set('page', values.page);
    const result = await backendJson(target.pathname + target.search, { method: 'GET' });
    normalizePromoPublicReviewsPage(result);
    return json(result);
  } catch (error) { return errorResponse(error); }
}

export async function publicReviewSubmit(request: Request, publicSlug: unknown) {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const slug = safeSlug(publicSlug);
    const body = await request.json();
    if (!exact(body, ['name', 'rating', 'comment', 'honeypot', 'rendered_at', 'request_token'])) {
      throw new PromoReviewRequestsError('invalid_payload', 400);
    }
    const result = await backendJson(`${backendPath(slug, 'submit')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract: 'promo.review.submit.v2', ...body }),
    });
    normalizePromoPublicReviewSubmission(result);
    return json(result, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
}

export async function publicReviewRequestContext(request: Request, publicSlug: unknown) {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const slug = safeSlug(publicSlug);
    const body = await request.json();
    if (!exact(body, ['token'])) throw new PromoReviewRequestsError('invalid_payload', 400);
    const result = await backendJson(`${backendPath(slug, 'request')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract: 'promo.review-request.context.v2', token: body.token }),
    });
    normalizePromoPublicRequestContext(result);
    return json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
}
