import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import { promoCmsSameOriginMutation } from '../../../lib/promoCms';
import {
  normalizePromoReviewRequestCreated,
  normalizePromoReviewRequestDeleted,
  normalizePromoReviewRequestRevealed,
  normalizePromoReviewRequestRevoked,
  normalizePromoReviewRequestsPage,
  PromoReviewRequestsError,
} from '../../../lib/promoReviewRequests';
import { promoReviewsStoreSlug } from '../../../lib/promoReviews';

const CREATE_PATH = '/api/pz/promo/private/v1/reviews/requests/create';
const LIST_PATH = '/api/pz/promo/private/v1/reviews/requests/list';
const REVOKE_PATH = '/api/pz/promo/private/v1/reviews/requests/revoke';
const REVEAL_PATH = '/api/pz/promo/private/v1/reviews/requests/reveal';
const DELETE_PATH = '/api/pz/promo/private/v1/reviews/requests/delete';
const SAFE_ERRORS = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload', 'invalid_origin',
  'unsafe_review_content', 'invalid_review_request', 'review_request_used', 'review_request_expired',
  'review_request_revoked', 'promo_reviews_unavailable',
  'review_request_link_unavailable',
]);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function exactObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function query(request: Request, includePage: boolean) {
  const entries = Array.from(new URL(request.url).searchParams.entries());
  const expected = includePage ? ['page', 'store'] : ['store'];
  if (entries.length !== expected.length
    || entries.map(([key]) => key).sort().some((key, index) => key !== expected[index])) {
    throw new PromoReviewRequestsError('invalid_payload', 400);
  }
  const values = Object.fromEntries(entries);
  const storeSlug = promoReviewsStoreSlug(values.store);
  const page = includePage ? Number(values.page) : 1;
  if (!storeSlug || !Number.isSafeInteger(page) || page < 1) throw new PromoReviewRequestsError('invalid_payload', 400);
  return { storeSlug, page };
}

async function context(request: Request, includePage: boolean) {
  const parsed = query(request, includePage);
  const pb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!pb.authStore.isValid || !pb.authStore.token) throw new PromoReviewRequestsError('unauthorized', 401);
  const current = await requireCurrentStoreForAdmin(pb, { storeSlug: parsed.storeSlug });
  if (String(current.store.slug || '').trim().toLowerCase() !== parsed.storeSlug) {
    throw new PromoReviewRequestsError('promo_not_found', 404);
  }
  return { parsed, pb, current };
}

async function backend(path: string, token: string, body: Record<string, unknown>, supportStoreId: string) {
  const base = serverPocketBaseUrl();
  if (!base) throw new PromoReviewRequestsError('promo_reviews_unavailable', 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
        ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
      },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20_000),
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
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503;
    return json({ ok: false, error: SAFE_ERRORS.has(error.code) ? error.code : 'promo_reviews_unavailable' }, status);
  }
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401) return json({ ok: false, error: 'unauthorized' }, 401);
  if (status === 403) return json({ ok: false, error: 'promo_permission_denied' }, 403);
  if (status === 404) return json({ ok: false, error: 'promo_not_found' }, 404);
  return json({ ok: false, error: 'promo_reviews_unavailable' }, 503);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { parsed, pb, current } = await context(request, true);
    const result = await backend(LIST_PATH, pb.authStore.token, {
      contract: 'promo.review-requests.list.v2', page: parsed.page,
    }, current.isMasterSupport ? current.storeId : '');
    normalizePromoReviewRequestsPage(result);
    return json(result);
  } catch (error) { return errorResponse(error); }
};

export const POST: APIRoute = async ({ request }) => {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const { pb, current } = await context(request, false);
    const body = await request.json();
    if (!exactObject(body, ['locale', 'customer_label', 'work_label', 'expires_days'])) {
      throw new PromoReviewRequestsError('invalid_payload', 400);
    }
    const result = await backend(CREATE_PATH, pb.authStore.token, {
      contract: 'promo.review-requests.create.v2',
      locale: body.locale,
      customer_label: body.customer_label,
      work_label: body.work_label,
      expires_days: body.expires_days,
    }, current.isMasterSupport ? current.storeId : '');
    normalizePromoReviewRequestCreated(result);
    return json(result, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const { pb, current } = await context(request, false);
    const body = await request.json();
    if (!exactObject(body, ['request_id'])) throw new PromoReviewRequestsError('invalid_payload', 400);
    const result = await backend(REVEAL_PATH, pb.authStore.token, {
      contract: 'promo.review-requests.reveal.v1', request_id: body.request_id,
    }, current.isMasterSupport ? current.storeId : '');
    normalizePromoReviewRequestRevealed(result);
    return json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const { pb, current } = await context(request, false);
    const body = await request.json();
    if (!exactObject(body, ['action', 'request_id']) || !['revoke', 'delete'].includes(body.action)) {
      throw new PromoReviewRequestsError('invalid_payload', 400);
    }
    const deleting = body.action === 'delete';
    const result = await backend(deleting ? DELETE_PATH : REVOKE_PATH, pb.authStore.token, {
      contract: deleting ? 'promo.review-requests.delete.v1' : 'promo.review-requests.revoke.v2',
      request_id: body.request_id,
    }, current.isMasterSupport ? current.storeId : '');
    if (deleting) normalizePromoReviewRequestDeleted(result);
    else normalizePromoReviewRequestRevoked(result);
    return json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};
