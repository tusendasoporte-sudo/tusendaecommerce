import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import { promoCmsSameOriginMutation } from '../../../lib/promoCms';
import {
  normalizePromoReviewModeration,
  normalizePromoReviewsPage,
  PromoReviewsError,
  PROMO_REVIEWS_ACTIONS,
  PROMO_REVIEWS_FILTERS,
  promoReviewsStoreSlug,
} from '../../../lib/promoReviews';

const LIST_PATH = '/api/pz/promo/private/v1/reviews/list';
const MODERATE_PATH = '/api/pz/promo/private/v1/reviews/moderate';
const SAFE_ERROR_CODES = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload', 'invalid_origin',
  'invalid_review_transition', 'promo_reviews_conflict', 'promo_reviews_unavailable',
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

function exactQuery(request: Request, operation: 'list' | 'moderate') {
  const parameters = Array.from(new URL(request.url).searchParams.entries());
  const expected = operation === 'list' ? ['page', 'status', 'store'] : ['store'];
  if (parameters.length !== expected.length
    || parameters.map(([key]) => key).sort().some((key, index) => key !== expected[index])) {
    throw new PromoReviewsError('invalid_payload', 400);
  }
  const values = Object.fromEntries(parameters);
  const storeSlug = promoReviewsStoreSlug(values.store);
  if (!storeSlug) throw new PromoReviewsError('invalid_payload', 400);
  if (operation === 'moderate') return { storeSlug };
  const page = Number(values.page);
  if (!PROMO_REVIEWS_FILTERS.includes(values.status as any) || !Number.isSafeInteger(page) || page < 1) {
    throw new PromoReviewsError('invalid_payload', 400);
  }
  return { storeSlug, status: values.status, page };
}

async function requestContext(request: Request, operation: 'list' | 'moderate') {
  const query = exactQuery(request, operation);
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !authPb.authStore.token) throw new PromoReviewsError('unauthorized', 401);
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug: query.storeSlug });
  if (String(context.store.slug || '').trim().toLowerCase() !== query.storeSlug) {
    throw new PromoReviewsError('promo_not_found', 404);
  }
  return { authPb, context, query };
}

async function backendRequest(path: string, token: string, body: Record<string, unknown>, supportStoreId: string) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new PromoReviewsError('promo_reviews_unavailable', 503);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json',
        ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
      },
      body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
  } catch (_) { throw new PromoReviewsError('promo_reviews_unavailable', 503); }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = String(result?.error || 'promo_reviews_unavailable');
    throw new PromoReviewsError(SAFE_ERROR_CODES.has(code) ? code : 'promo_reviews_unavailable', response.status || 503);
  }
  return result;
}

function errorResponse(error: unknown) {
  if (error instanceof PromoReviewsError) {
    const status = [400, 401, 403, 404, 409, 413, 503].includes(error.status) ? error.status : 503;
    return json({ ok: false, error: SAFE_ERROR_CODES.has(error.code) ? error.code : 'promo_reviews_unavailable' }, status);
  }
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401) return json({ ok: false, error: 'unauthorized' }, 401);
  if (status === 403) return json({ ok: false, error: 'promo_permission_denied' }, 403);
  if (status === 404) return json({ ok: false, error: 'promo_not_found' }, 404);
  return json({ ok: false, error: 'promo_reviews_unavailable' }, 503);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, context, query } = await requestContext(request, 'list');
    const result = await backendRequest(LIST_PATH, authPb.authStore.token, {
      contract: 'promo.reviews.list.v1', status: query.status, page: query.page,
    }, context.isMasterSupport ? context.storeId : '');
    const page = normalizePromoReviewsPage(result);
    return json(result, page ? 200 : 503);
  } catch (error) { return errorResponse(error); }
};

export const PATCH: APIRoute = async ({ request }) => {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const { authPb, context } = await requestContext(request, 'moderate');
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).sort().join('|') !== 'action|expected_updated|review_id'
      || !PROMO_REVIEWS_ACTIONS.includes(body.action)) throw new PromoReviewsError('invalid_payload', 400);
    const result = await backendRequest(MODERATE_PATH, authPb.authStore.token, {
      contract: 'promo.reviews.moderate.v1', review_id: body.review_id,
      action: body.action, expected_updated: body.expected_updated,
    }, context.isMasterSupport ? context.storeId : '');
    normalizePromoReviewModeration(result);
    return json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};
