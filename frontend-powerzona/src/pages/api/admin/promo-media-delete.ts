import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { promoCmsStoreSlug } from '../../../lib/promoCms';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import { storefrontPushMediaSameOriginMutation } from '../../../lib/storefrontPushMedia';

const BACKEND_PATH = '/api/pz/promo/private/v1/media/delete';
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SAFE_ERRORS = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload', 'invalid_origin',
  'promo_media_unavailable', 'promo_media_in_use', 'promo_media_conflict', 'promo_media_not_found',
]);

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function fail(code: string, status: number) {
  const error = new Error(code) as Error & { code: string; status: number };
  error.code = code;
  error.status = status;
  throw error;
}

function exactStoreQuery(request: Request) {
  const entries = Array.from(new URL(request.url).searchParams.entries());
  if (entries.length !== 1 || entries[0]?.[0] !== 'store') fail('invalid_payload', 400);
  const storeSlug = promoCmsStoreSlug(entries[0]?.[1]);
  if (!storeSlug) fail('invalid_payload', 400);
  return storeSlug;
}

function exactDeleteBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).join('|') !== 'asset_id') fail('invalid_payload', 400);
  const assetId = String((value as { asset_id?: unknown }).asset_id || '');
  if (!RECORD_ID_PATTERN.test(assetId)) fail('invalid_payload', 400);
  return assetId;
}

function errorResponse(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown; status?: unknown };
  const code = String(candidate?.code || candidate?.message || 'promo_media_unavailable');
  const status = Number(candidate?.status || 0);
  const safeStatus = [400, 401, 403, 404, 409, 413, 429, 503].includes(status) ? status : 503;
  return json({ ok: false, error: SAFE_ERRORS.has(code) ? code : 'promo_media_unavailable' }, safeStatus);
}

export const DELETE: APIRoute = async ({ request }) => {
  if (!storefrontPushMediaSameOriginMutation(request)) {
    return json({ ok: false, error: 'invalid_origin' }, 403);
  }
  try {
    const storeSlug = exactStoreQuery(request);
    const assetId = exactDeleteBody(await request.json());
    const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
    if (!authPb.authStore.isValid || !authPb.authStore.token) fail('unauthorized', 401);
    const context = await requireCurrentStoreForAdmin(authPb, { storeSlug });
    if (String(context.store.slug || '').trim().toLowerCase() !== storeSlug) fail('promo_not_found', 404);
    const baseUrl = serverPocketBaseUrl();
    if (!baseUrl) fail('promo_media_unavailable', 503);
    const response = await fetch(`${baseUrl}${BACKEND_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authPb.authStore.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(context.isMasterSupport ? { 'X-PZ-Promo-Store': context.storeId } : {}),
      },
      body: JSON.stringify({
        contract: 'promo.media.delete.v1',
        asset_id: assetId,
        expected_status: 'ready',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || result?.contract !== 'promo.media.deleted.v1') {
      fail(String(result?.error || 'promo_media_unavailable'), response.status || 503);
    }
    return json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};
