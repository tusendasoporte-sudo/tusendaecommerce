import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';
import {
  normalizePromoCmsDraftResponse,
  parsePromoCmsUpdate,
  PromoCmsError,
  promoCmsSameOriginMutation,
  promoCmsStoreSlug,
} from '../../../lib/promoCms';

const READ_PATH = '/api/pz/promo/private/v1/live/read';
const UPDATE_PATH = '/api/pz/promo/private/v1/live/update';
const MAX_REQUEST_BYTES = 1024 * 1024 + 4096;
const BACKEND_REQUEST_TIMEOUT_MS = 120_000;
const SAFE_ERROR_CODES = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload',
  'invalid_promo_document', 'unsafe_promo_document_value', 'unknown_promo_contract',
  'unknown_promo_theme_token', 'unsupported_promo_action', 'invalid_promo_media_reference',
  'invalid_promo_contact_reference', 'incomplete_promo_locale', 'promo_live_conflict',
  'promo_live_unavailable', 'promo_draft_unavailable', 'promo_translation_unavailable',
  'promo_translation_invalid_response', 'promo_pubcfg_unavailable',
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

function exactStoreQuery(request: Request) {
  const parameters = Array.from(new URL(request.url).searchParams.entries());
  if (parameters.length !== 1 || parameters[0]?.[0] !== 'store') throw new PromoCmsError('invalid_payload', 400);
  const slug = promoCmsStoreSlug(parameters[0][1]);
  if (!slug) throw new PromoCmsError('invalid_payload', 400);
  return slug;
}

async function requestContext(request: Request) {
  const storeSlug = exactStoreQuery(request);
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !authPb.authStore.token) {
    throw new PromoCmsError('unauthorized', 401);
  }
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug });
  if (String(context.store.slug || '').trim().toLowerCase() !== storeSlug) {
    throw new PromoCmsError('promo_not_found', 404);
  }
  return { authPb, context };
}

async function backendRequest(
  path: string,
  token: string,
  body: Record<string, unknown>,
  supportStoreId: string,
) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new PromoCmsError('promo_pubcfg_unavailable', 503);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(BACKEND_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if ((error as { name?: string })?.name === 'TimeoutError') {
      throw new PromoCmsError('promo_pubcfg_unavailable', 503);
    }
    throw new PromoCmsError('promo_pubcfg_unavailable', 503);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = String(result?.error || result?.code || 'promo_pubcfg_unavailable');
    throw new PromoCmsError(SAFE_ERROR_CODES.has(code) ? code : 'promo_pubcfg_unavailable', response.status || 503);
  }
  return result;
}

function errorResponse(error: unknown) {
  if (error instanceof PromoCmsError) {
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503;
    const code = SAFE_ERROR_CODES.has(error.code) || error.code === 'invalid_origin'
      ? error.code
      : 'promo_cms_unavailable';
    return json({ ok: false, error: code }, status);
  }
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401) return json({ ok: false, error: 'unauthorized' }, 401);
  if (status === 403) return json({ ok: false, error: 'promo_permission_denied' }, 403);
  if (status === 404) return json({ ok: false, error: 'promo_not_found' }, 404);
  return json({ ok: false, error: 'promo_cms_unavailable' }, 503);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, context } = await requestContext(request);
    const result = await backendRequest(
      READ_PATH,
      authPb.authStore.token,
      { contract: 'promo.live.read.v1' },
      context.isMasterSupport ? context.storeId : '',
    );
    const draft = normalizePromoCmsDraftResponse({
      ok: result.ok,
      contract: result.contract,
      draft: result.live,
    });
    return json({
      ok: true,
      contract: 'promo.live.v1',
      draft: {
        schema_version: 2,
        version: draft.version,
        generation: Number(result.live?.generation || 0),
        public_state: String(result.live?.public_state || 'inactive'),
        document: draft.document,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const PUT: APIRoute = async ({ request }) => {
  if (!promoCmsSameOriginMutation(request)) {
    return json({ ok: false, error: 'invalid_origin' }, 403);
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: 'invalid_payload' }, 413);
  }
  try {
    const { authPb, context } = await requestContext(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, error: 'invalid_payload' }, 413);
    }
    const parsed = parsePromoCmsUpdate(JSON.parse(raw));
    const result = await backendRequest(
      UPDATE_PATH,
      authPb.authStore.token,
      {
        contract: 'promo.live.update.v1',
        expected_version: parsed.expectedVersion,
        document: parsed.document,
      },
      context.isMasterSupport ? context.storeId : '',
    );
    const draft = normalizePromoCmsDraftResponse({
      ok: result.ok,
      contract: result.contract,
      draft: result.live,
    });
    return json({
      ok: true,
      contract: 'promo.live.v1',
      changed: result.changed === true,
      draft: {
        schema_version: 2,
        version: draft.version,
        generation: Number(result.live?.generation || 0),
        public_state: String(result.live?.public_state || 'inactive'),
        document: draft.document,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};
