import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import {
  PromoPreviewError,
  promoPreviewStoreSlug,
  resolvePromoPreviewMediaSource,
} from '../../../lib/promoPreview';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';

const PREVIEW_PATH = '/api/pz/promo/private/v1/publication/preview';
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,79}$/;
const VARIANT_PATTERN = /^(?:original|w[0-9]+)$/;
const SAFE_ERROR_CODES = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload',
  'promo_candidate_not_found', 'promo_candidate_unavailable', 'promo_preview_unavailable',
  'promo_preview_media_not_found', 'promo_publication_validation_failed',
]);

function privateHeaders(contentType = 'application/json') {
  return {
    'Content-Type': contentType,
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: privateHeaders() });
}

function canonicalLocale(value: string) {
  if (!/^[a-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value)) return '';
  try { return Intl.getCanonicalLocales(value)[0] === value ? value : ''; } catch (_) { return ''; }
}

function exactQuery(request: Request) {
  const entries = Array.from(new URL(request.url).searchParams.entries());
  const expected = ['store', 'revision', 'locale', 'media', 'resource', 'variant'];
  if (entries.length !== expected.length || entries.some(([key], index) => key !== expected[index])) {
    throw new PromoPreviewError('invalid_payload', 400);
  }
  const input = Object.fromEntries(entries);
  const storeSlug = promoPreviewStoreSlug(input.store);
  if (!storeSlug || !RECORD_ID_PATTERN.test(input.revision) || !canonicalLocale(input.locale)
    || !USE_KEY_PATTERN.test(input.media) || !['source', 'poster'].includes(input.resource)
    || !VARIANT_PATTERN.test(input.variant)) throw new PromoPreviewError('invalid_payload', 400);
  return {
    storeSlug,
    revisionId: input.revision,
    locale: input.locale,
    mediaKey: input.media,
    resource: input.resource as 'source' | 'poster',
    variant: input.variant,
  };
}

async function backendPreview(token: string, supportStoreId: string, revisionId: string, locale: string) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new PromoPreviewError('promo_preview_unavailable', 503);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${PREVIEW_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
      },
      body: JSON.stringify({
        contract: 'promo.preview.read.v1',
        candidate_revision_id: revisionId,
        locale,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_) {
    throw new PromoPreviewError('promo_preview_unavailable', 503);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = String(result?.error || 'promo_preview_unavailable');
    throw new PromoPreviewError(SAFE_ERROR_CODES.has(code) ? code : 'promo_preview_unavailable', response.status || 503);
  }
  return result;
}

function errorResponse(error: unknown) {
  if (error instanceof PromoPreviewError) {
    const status = [400, 401, 403, 404, 409, 429, 503].includes(error.status) ? error.status : 503;
    return json({ ok: false, error: SAFE_ERROR_CODES.has(error.code) ? error.code : 'promo_preview_unavailable' }, status);
  }
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401) return json({ ok: false, error: 'unauthorized' }, 401);
  if (status === 403) return json({ ok: false, error: 'promo_permission_denied' }, 403);
  if (status === 404) return json({ ok: false, error: 'promo_preview_media_not_found' }, 404);
  return json({ ok: false, error: 'promo_preview_unavailable' }, 503);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const fetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite && fetchSite !== 'same-origin') throw new PromoPreviewError('invalid_payload', 400);
    const input = exactQuery(request);
    const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
    if (!authPb.authStore.isValid || !authPb.authStore.token) throw new PromoPreviewError('unauthorized', 401);
    const context = await requireCurrentStoreForAdmin(authPb, { storeSlug: input.storeSlug });
    if (String(context.store.slug || '').trim().toLowerCase() !== input.storeSlug) {
      throw new PromoPreviewError('promo_not_found', 404);
    }
    const preview = await backendPreview(
      authPb.authStore.token,
      context.isMasterSupport ? context.storeId : '',
      input.revisionId,
      input.locale,
    );
    const source = resolvePromoPreviewMediaSource(preview, {
      mediaKey: input.mediaKey,
      resource: input.resource,
      variant: input.variant,
    });
    const range = String(request.headers.get('range') || '').trim();
    if (range && (source.kind !== 'video' || range.length > 80 || !/^bytes=[0-9]*-[0-9]*$/.test(range))) {
      throw new PromoPreviewError('invalid_payload', 400);
    }
    const baseUrl = serverPocketBaseUrl();
    if (!baseUrl) throw new PromoPreviewError('promo_preview_unavailable', 503);
    const response = await fetch(`${baseUrl}${source.path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authPb.authStore.token}`,
        Accept: source.mime,
        ...(range ? { Range: range } : {}),
        ...(context.isMasterSupport ? { 'X-PZ-Promo-Store': context.storeId } : {}),
      },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (![200, 206].includes(response.status) || !response.body || contentType !== source.mime) {
      throw new PromoPreviewError('promo_preview_media_not_found', 404);
    }
    const headers = new Headers(privateHeaders(contentType));
    const contentLength = String(response.headers.get('content-length') || '').trim();
    const contentRange = String(response.headers.get('content-range') || '').trim();
    const acceptRanges = String(response.headers.get('accept-ranges') || '').trim().toLowerCase();
    if (/^[0-9]{1,20}$/.test(contentLength)) headers.set('Content-Length', contentLength);
    if (/^bytes [0-9]+-[0-9]+\/(?:[0-9]+|\*)$/.test(contentRange)) headers.set('Content-Range', contentRange);
    if (acceptRanges === 'bytes') headers.set('Accept-Ranges', 'bytes');
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    return errorResponse(error);
  }
};
