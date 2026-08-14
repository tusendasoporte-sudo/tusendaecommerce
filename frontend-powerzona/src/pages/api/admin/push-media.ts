import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import {
  buildStorefrontPushMediaPublicUrl,
  optimizeStorefrontPushMediaUpload,
  STOREFRONT_PUSH_MEDIA_MULTIPART_MAX_BYTES,
  StorefrontPushMediaError,
  storefrontPushMediaErrorStatus,
  storefrontPushMediaSameOriginMutation,
  withStorefrontPushMediaConversionSlot,
} from '../../../lib/storefrontPushMedia';
import {
  requireStorefrontPushMediaAccess,
  StorefrontPushMediaAccessError,
} from '../../../lib/storefrontPushMediaAccess';

const POCKETBASE_UPLOAD_PATH = '/api/pz/storefront/v1/media/upload';
const POCKETBASE_LIST_PATH = '/api/pz/storefront/v1/media/list';
const POCKETBASE_DELETE_PATH = '/api/pz/storefront/v1/media/delete';

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

function mediaPublicOrigin() {
  const runtime = typeof process !== 'undefined'
    ? process.env?.PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN
    : '';
  return String(
    runtime
    || import.meta.env.PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN
    || import.meta.env.PUBLIC_POCKETBASE_URL
    || '',
  ).trim();
}

function exactFormData(formData: FormData, expected: readonly string[]) {
  const actual = [...new Set(Array.from(formData.keys()))].sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function exactObject(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function safeMediaId(value: unknown) {
  const id = String(value || '').trim();
  return /^[a-z0-9]{15}$/.test(id) ? id : '';
}

async function adminContext(request: Request) {
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  const supportStoreSlug = String(new URL(request.url).searchParams.get('store') || '')
    .trim()
    .toLowerCase();
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug: supportStoreSlug });
  await requireStorefrontPushMediaAccess(context, {
    baseUrl: import.meta.env.PUBLIC_POCKETBASE_URL,
    token: authPb.authStore.token,
  });
  return { authPb, context };
}

async function pocketBaseRequest(
  path: string,
  token: string,
  body: BodyInit,
  contentType: string | null,
  supportStoreId = '',
) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new Error('media_backend_unavailable');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...(supportStoreId ? { 'X-PZ-Support-Store': supportStoreId } : {}),
    },
    body,
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const error = new Error(String(result?.error || 'media_backend_failed')) as Error & {
      status?: number;
      code?: string;
    };
    error.status = response.status;
    error.code = String(result?.error || 'media_backend_failed');
    throw error;
  }
  return result;
}

function publicMedia(record: any) {
  const id = safeMediaId(record?.id);
  const filename = String(record?.file || '').trim();
  return {
    ...record,
    url: buildStorefrontPushMediaPublicUrl(mediaPublicOrigin(), id, filename),
  };
}

function errorResponse(error: any, fallback: string) {
  if (error instanceof StorefrontPushMediaError) {
    return json({ ok: false, error: error.code }, storefrontPushMediaErrorStatus(error));
  }
  if (error instanceof StorefrontPushMediaAccessError) {
    return json({ ok: false, error: error.code }, error.status);
  }
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.message || '');
  if (status === 401 || status === 403 || /auth|permission|plan_not_available|access_denied/i.test(code)) {
    return json({ ok: false, error: 'push_media_access_denied' }, 403);
  }
  if ([400, 404, 409, 413, 429, 503, 507].includes(status)) {
    return json({ ok: false, error: code || fallback }, status);
  }
  return json({ ok: false, error: fallback }, 500);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, context } = await adminContext(request);
    const result = await pocketBaseRequest(
      POCKETBASE_LIST_PATH,
      authPb.authStore.token,
      JSON.stringify({}),
      'application/json',
      context.isMasterSupport ? context.storeId : '',
    );
    return json({
      ...result,
      media: Array.isArray(result.media) ? result.media.map(publicMedia) : [],
    });
  } catch (error) {
    return errorResponse(error, 'media_list_failed');
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!storefrontPushMediaSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > STOREFRONT_PUSH_MEDIA_MULTIPART_MAX_BYTES) {
    return json({ ok: false, error: 'media_input_too_large' }, 413);
  }
  try {
    const { authPb, context } = await adminContext(request);
    const formData = await request.formData();
    if (!exactFormData(formData, ['file'])) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const optimized = await withStorefrontPushMediaConversionSlot(
      () => optimizeStorefrontPushMediaUpload(formData.get('file')),
    );
    const payload = new FormData();
    payload.append('sha256', optimized.sha256);
    payload.append('width', String(optimized.width));
    payload.append('height', String(optimized.height));
    payload.append('bytes', String(optimized.bytes));
    payload.append(
      'file',
      new Blob([new Uint8Array(optimized.buffer)], { type: optimized.mime }),
      optimized.filename,
    );
    const result = await pocketBaseRequest(
      POCKETBASE_UPLOAD_PATH,
      authPb.authStore.token,
      payload,
      null,
      context.isMasterSupport ? context.storeId : '',
    );
    const media = publicMedia(result.media);
    if (media.sha256 !== optimized.sha256
      || Number(media.bytes) !== optimized.bytes
      || Number(media.width) !== optimized.width
      || Number(media.height) !== optimized.height) {
      throw new Error('media_backend_mismatch');
    }
    return json({ ok: true, media, quota: result.quota, storage: result.storage }, 201);
  } catch (error) {
    return errorResponse(error, 'media_upload_failed');
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  if (!storefrontPushMediaSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  try {
    const { authPb, context } = await adminContext(request);
    const body = await request.json().catch(() => null);
    if (!exactObject(body, ['media_id']) || !safeMediaId((body as any).media_id)) {
      return json({ ok: false, error: 'invalid_payload' }, 400);
    }
    const result = await pocketBaseRequest(
      POCKETBASE_DELETE_PATH,
      authPb.authStore.token,
      JSON.stringify({ media_id: (body as any).media_id }),
      'application/json',
      context.isMasterSupport ? context.storeId : '',
    );
    return json(result);
  } catch (error) {
    return errorResponse(error, 'media_delete_failed');
  }
};
