import type { APIRoute } from 'astro';

import { refreshAuthFromCookie, requireMasterAdmin } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import {
  normalizeStorefrontAppBrandAsset,
  STOREFRONT_APP_BRAND_MULTIPART_MAX_BYTES,
  StorefrontAppBrandAssetError,
  storefrontAppBrandSameOriginMutation,
  withStorefrontAppBrandConversionSlot,
} from '../../../lib/storefrontAppBrandAssets';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const FILE_NAME_PATTERN = /^(?:icon|splash)[-_][a-f0-9]{32}(?:_[A-Za-z0-9]{6,32})?\.png$/;
const UPLOAD_PATH = '/api/pz/master/storefront-app-builds/brand-assets/upload';
const FILE_PATH = '/api/pz/master/storefront-app-builds/brand-assets/file';

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
  const actual = [...new Set(Array.from(formData.keys()))].sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

async function masterContext(request: Request) {
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !requireMasterAdmin(authPb.authStore.record as any)) {
    throw Object.assign(new Error('unauthorized'), { status: 403 });
  }
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw Object.assign(new Error('app_builds_unavailable'), { status: 503 });
  return { authPb, baseUrl: baseUrl.replace(/\/$/, '') };
}

function errorResponse(error: any) {
  if (error instanceof StorefrontAppBrandAssetError) {
    const status = error.code === 'brand_asset_input_too_large' || error.code === 'brand_asset_output_too_large'
      ? 413
      : error.code === 'brand_asset_busy' ? 429 : 400;
    return json({ ok: false, error: error.code }, status);
  }
  const status = Number(error?.status || 0);
  const code = String(error?.code || error?.message || 'brand_asset_upload_failed');
  if ([400, 403, 404, 409, 413, 429, 503].includes(status)) {
    return json({ ok: false, error: code }, status);
  }
  return json({ ok: false, error: 'brand_asset_upload_failed' }, 500);
}

export const POST: APIRoute = async ({ request }) => {
  if (!storefrontAppBrandSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > STOREFRONT_APP_BRAND_MULTIPART_MAX_BYTES) {
    return json({ ok: false, error: 'brand_asset_input_too_large' }, 413);
  }
  try {
    const { authPb, baseUrl } = await masterContext(request);
    const formData = await request.formData();
    if (!exactFormData(formData, ['file', 'kind', 'store_id'])) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const storeId = String(formData.get('store_id') || '').trim();
    const kind = String(formData.get('kind') || '').trim() as 'icon' | 'splash';
    if (!RECORD_ID_PATTERN.test(storeId) || !['icon', 'splash'].includes(kind)) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const normalized = await withStorefrontAppBrandConversionSlot(
      () => normalizeStorefrontAppBrandAsset(formData.get('file'), kind),
    );
    const payload = new FormData();
    payload.append('store_id', storeId);
    payload.append('kind', kind);
    payload.append('sha256', normalized.sha256);
    payload.append('width', String(normalized.width));
    payload.append('height', String(normalized.height));
    payload.append('bytes', String(normalized.bytes));
    payload.append('source_format', normalized.sourceFormat);
    payload.append('source_width', String(normalized.sourceWidth));
    payload.append('source_height', String(normalized.sourceHeight));
    payload.append('normalizer_version', normalized.normalizerVersion);
    payload.append('file', new Blob([new Uint8Array(normalized.buffer)], { type: normalized.mime }), normalized.filename);
    const response = await fetch(`${baseUrl}${UPLOAD_PATH}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authPb.authStore.token}`, Accept: 'application/json' },
      body: payload,
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw Object.assign(new Error(String(result?.error || 'brand_asset_upload_failed')), {
        status: response.status,
        code: String(result?.error || 'brand_asset_upload_failed'),
      });
    }
    if (result.asset?.sha256 !== normalized.sha256
      || Number(result.asset?.width) !== normalized.width
      || Number(result.asset?.height) !== normalized.height
      || Number(result.asset?.bytes) !== normalized.bytes) {
      throw new Error('brand_asset_backend_mismatch');
    }
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
};

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, baseUrl } = await masterContext(request);
    const search = new URL(request.url).searchParams;
    const assetId = String(search.get('asset_id') || '').trim();
    const fileName = String(search.get('file_name') || '').trim();
    if (!RECORD_ID_PATTERN.test(assetId) || !FILE_NAME_PATTERN.test(fileName)) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const response = await fetch(`${baseUrl}${FILE_PATH}/${assetId}/${encodeURIComponent(fileName)}`, {
      headers: { Authorization: `Bearer ${authPb.authStore.token}`, Accept: 'image/png' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return json({ ok: false, error: 'brand_asset_not_found' }, response.status === 404 ? 404 : 503);
    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
};
