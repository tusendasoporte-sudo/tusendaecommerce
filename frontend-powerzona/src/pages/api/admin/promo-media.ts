import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import {
  preparePromoMedia,
  PROMO_MEDIA_MULTIPART_MAX_BYTES,
  PromoMediaError,
  promoMediaErrorStatus,
} from '../../../lib/promoMedia';
import { promoCmsStoreSlug } from '../../../lib/promoCms';
import { storefrontPushMediaSameOriginMutation, withStorefrontPushMediaConversionSlot } from '../../../lib/storefrontPushMedia';

const UPLOAD_PATH = '/api/pz/promo/private/v1/media/upload';
const LIST_PATH = '/api/pz/promo/private/v1/media/list';
const RETIRE_PATH = '/api/pz/promo/private/v1/media/retire';
const SAFE_ERROR_CODES = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload', 'promo_media_unavailable',
  'promo_media_file_required', 'promo_media_size_invalid', 'promo_media_filename_invalid',
  'promo_media_digest_mismatch', 'promo_media_metadata_mismatch', 'promo_media_image_dimensions_invalid',
  'promo_media_video_dimensions_invalid', 'promo_media_video_bitrate_invalid', 'promo_media_poster_required',
  'promo_media_duplicate', 'promo_media_count_exceeded', 'promo_media_storage_exceeded',
  'promo_media_in_use', 'promo_media_conflict', 'promo_media_not_found', 'promo_media_variant_invalid',
  'invalid_origin',
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

function exactFormData(formData: FormData, expected: readonly string[]) {
  const actual = Array.from(formData.keys()).sort();
  const target = [...expected].sort();
  return actual.length === target.length && actual.every((key, index) => key === target[index]);
}

function exactObject(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const target = [...expected].sort();
  return actual.length === target.length && actual.every((key, index) => key === target[index]);
}

function exactMediaQuery(request: Request, allowAsset = false) {
  const entries = Array.from(new URL(request.url).searchParams.entries());
  const expected = allowAsset ? ['asset', 'store'] : ['store'];
  if (entries.length !== expected.length
    || entries.map(([key]) => key).sort().some((key, index) => key !== expected[index])) {
    const error = new Error('invalid_payload') as Error & { status?: number; code?: string };
    error.status = 400;
    error.code = 'invalid_payload';
    throw error;
  }
  const parameters = new Map(entries);
  const storeSlug = promoCmsStoreSlug(parameters.get('store'));
  const assetId = String(parameters.get('asset') || '');
  if (!storeSlug || (allowAsset && !/^[a-z0-9]{15}$/.test(assetId))) {
    const error = new Error('invalid_payload') as Error & { status?: number; code?: string };
    error.status = 400;
    error.code = 'invalid_payload';
    throw error;
  }
  return { storeSlug, assetId };
}

async function adminContext(request: Request, storeSlug: string) {
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug });
  if (String(context.store.slug || '').trim().toLowerCase() !== storeSlug) {
    const error = new Error('promo_not_found') as Error & { status?: number; code?: string };
    error.status = 404;
    error.code = 'promo_not_found';
    throw error;
  }
  return { authPb, context };
}

async function backendRequest(
  path: string,
  token: string,
  body: BodyInit,
  contentType: string | null,
  supportStoreId: string,
) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new Error('promo_media_unavailable');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const error = new Error(String(result?.error || 'promo_media_unavailable')) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = String(result?.error || 'promo_media_unavailable');
    throw error;
  }
  return result;
}

function errorResponse(error: any, fallback: string) {
  if (error instanceof PromoMediaError) return json({ ok: false, error: error.code }, promoMediaErrorStatus(error));
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.message || '');
  if ([400, 403, 404, 409, 413, 429, 503].includes(status)) {
    return json({ ok: false, error: SAFE_ERROR_CODES.has(code) ? code : fallback }, status);
  }
  return json({ ok: false, error: fallback }, 500);
}

async function privatePreviewResponse(
  result: any,
  assetId: string,
  token: string,
  supportStoreId: string,
  rangeHeader: string,
) {
  const asset = Array.isArray(result?.assets)
    ? result.assets.find((candidate: any) => candidate?.asset_id === assetId)
    : null;
  const previewPath = String(asset?.preview?.url || '');
  const escapedAssetId = assetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (asset?.status !== 'ready'
    || !(new RegExp(`^/api/pz/promo/private/v1/media/${escapedAssetId}/[a-f0-9]{64}/original\\.(?:webp|mp4|webm)$`)).test(previewPath)) {
    const error = new Error('promo_media_not_found') as Error & { status?: number; code?: string };
    error.status = 404;
    error.code = 'promo_media_not_found';
    throw error;
  }
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new Error('promo_media_unavailable');
  if (rangeHeader && (rangeHeader.length > 80 || !/^bytes=[0-9]*-[0-9]*$/.test(rangeHeader))) {
    const error = new Error('invalid_payload') as Error & { status?: number; code?: string };
    error.status = 400;
    error.code = 'invalid_payload';
    throw error;
  }
  const response = await fetch(`${baseUrl}${previewPath}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'image/webp,video/mp4,video/webm',
      ...(rangeHeader ? { Range: rangeHeader } : {}),
      ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (![200, 206].includes(response.status) || !response.body
    || !['image/webp', 'video/mp4', 'video/webm'].includes(contentType)) {
    const error = new Error('promo_media_not_found') as Error & { status?: number; code?: string };
    error.status = 404;
    error.code = 'promo_media_not_found';
    throw error;
  }
  const contentRange = String(response.headers.get('content-range') || '');
  const acceptRanges = String(response.headers.get('accept-ranges') || '').toLowerCase();
  const contentLength = String(response.headers.get('content-length') || '');
  if ((response.status === 206 && !/^bytes [0-9]+-[0-9]+\/[0-9]+$/.test(contentRange))
    || (contentLength && !/^[0-9]{1,12}$/.test(contentLength))) {
    const error = new Error('promo_media_not_found') as Error & { status?: number; code?: string };
    error.status = 404;
    error.code = 'promo_media_not_found';
    throw error;
  }
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': contentType,
      ...(contentRange ? { 'Content-Range': contentRange } : {}),
      ...(acceptRanges === 'bytes' ? { 'Accept-Ranges': 'bytes' } : {}),
      ...(contentLength ? { 'Content-Length': contentLength } : {}),
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const fetchSite = String(request.headers.get('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite && fetchSite !== 'same-origin') {
      const error = new Error('invalid_origin') as Error & { status?: number; code?: string };
      error.status = 403;
      error.code = 'invalid_origin';
      throw error;
    }
    const url = new URL(request.url);
    const hasAsset = url.searchParams.has('asset');
    const query = exactMediaQuery(request, hasAsset);
    const { authPb, context } = await adminContext(request, query.storeSlug);
    const result = await backendRequest(
      LIST_PATH,
      authPb.authStore.token,
      JSON.stringify({ contract: 'promo.media.list.v1' }),
      'application/json',
      context.isMasterSupport ? context.storeId : '',
    );
    if (hasAsset) {
      return privatePreviewResponse(
        result,
        query.assetId,
        authPb.authStore.token,
        context.isMasterSupport ? context.storeId : '',
        String(request.headers.get('range') || '').trim(),
      );
    }
    return json(result);
  } catch (error) {
    return errorResponse(error, 'promo_media_list_failed');
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!storefrontPushMediaSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > PROMO_MEDIA_MULTIPART_MAX_BYTES) {
    return json({ ok: false, error: 'promo_media_size_invalid' }, 413);
  }
  try {
    const query = exactMediaQuery(request);
    const { authPb, context } = await adminContext(request, query.storeSlug);
    const formData = await request.formData();
    if (!exactFormData(formData, ['file', 'poster_asset_id', 'purpose'])) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const prepared = await withStorefrontPushMediaConversionSlot(() => preparePromoMedia(
      formData.get('file'),
      formData.get('purpose'),
      formData.get('poster_asset_id'),
    ));
    const payload = new FormData();
    payload.append('contract', 'promo.media.upload.v1');
    payload.append('kind', prepared.kind);
    payload.append('purpose', prepared.purpose);
    payload.append('mime', prepared.mime);
    payload.append('sha256', prepared.sha256);
    payload.append('bytes', String(prepared.bytes));
    payload.append('width', String(prepared.width));
    payload.append('height', String(prepared.height));
    payload.append('duration_ms', String(prepared.durationMs));
    payload.append('poster_asset_id', prepared.posterAssetId);
    payload.append('file', new Blob([new Uint8Array(prepared.buffer)], { type: prepared.mime }), prepared.filename);
    const result = await backendRequest(
      UPLOAD_PATH,
      authPb.authStore.token,
      payload,
      null,
      context.isMasterSupport ? context.storeId : '',
    );
    const asset = result?.asset;
    if (asset?.kind !== prepared.kind || asset?.purpose !== prepared.purpose || asset?.mime !== prepared.mime
      || Number(asset?.bytes) !== prepared.bytes || Number(asset?.width) !== prepared.width
      || Number(asset?.height) !== prepared.height || Number(asset?.duration_ms) !== prepared.durationMs) {
      throw new Error('promo_media_backend_mismatch');
    }
    return json(result, 201);
  } catch (error) {
    return errorResponse(error, 'promo_media_upload_failed');
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!storefrontPushMediaSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const query = exactMediaQuery(request);
    const { authPb, context } = await adminContext(request, query.storeSlug);
    const body = await request.json().catch(() => null) as any;
    if (!exactObject(body, ['asset_id']) || !/^[a-z0-9]{15}$/.test(String(body?.asset_id || ''))) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const result = await backendRequest(
      RETIRE_PATH,
      authPb.authStore.token,
      JSON.stringify({ contract: 'promo.media.retire.v1', asset_id: body.asset_id, expected_status: 'ready' }),
      'application/json',
      context.isMasterSupport ? context.storeId : '',
    );
    return json(result);
  } catch (error) {
    return errorResponse(error, 'promo_media_retire_failed');
  }
};
