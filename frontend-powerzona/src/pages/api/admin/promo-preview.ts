import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { promoCmsSameOriginMutation } from '../../../lib/promoCms';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import {
  normalizePromoCandidateResponse,
  normalizePromoPreviewContext,
  normalizePromoPreviewResponse,
  parsePromoPreviewAdminRequest,
  PromoPreviewError,
  promoPreviewStoreSlug,
  rewritePromoPreviewMedia,
} from '../../../lib/promoPreview';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';

const CONTEXT_PATH = '/api/pz/promo/private/v1/publication/preview/context';
const CANDIDATE_PATH = '/api/pz/promo/private/v1/publication/candidates/create';
const PREVIEW_PATH = '/api/pz/promo/private/v1/publication/preview';
const MAX_REQUEST_BYTES = 4096;
const SAFE_ERROR_CODES = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload', 'invalid_origin',
  'promo_draft_conflict', 'promo_draft_unavailable', 'promo_candidate_not_found',
  'promo_candidate_unavailable', 'promo_preview_unavailable', 'promo_publication_validation_failed',
  'incomplete_promo_locale', 'invalid_promo_document', 'unsafe_promo_document_value',
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
  const entries = Array.from(new URL(request.url).searchParams.entries());
  if (entries.length !== 1 || entries[0]?.[0] !== 'store') throw new PromoPreviewError('invalid_payload', 400);
  const storeSlug = promoPreviewStoreSlug(entries[0][1]);
  if (!storeSlug) throw new PromoPreviewError('invalid_payload', 400);
  return storeSlug;
}

async function requestContext(request: Request) {
  const storeSlug = exactStoreQuery(request);
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !authPb.authStore.token) throw new PromoPreviewError('unauthorized', 401);
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug });
  if (String(context.store.slug || '').trim().toLowerCase() !== storeSlug) {
    throw new PromoPreviewError('promo_not_found', 404);
  }
  return { authPb, context, storeSlug };
}

async function backendRequest(
  path: string,
  token: string,
  body: Record<string, unknown>,
  supportStoreId: string,
) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new PromoPreviewError('promo_preview_unavailable', 503);
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
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_) {
    throw new PromoPreviewError('promo_preview_unavailable', 503);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = String(result?.error || result?.code || 'promo_preview_unavailable');
    throw new PromoPreviewError(
      SAFE_ERROR_CODES.has(code) ? code : 'promo_preview_unavailable',
      response.status || 503,
    );
  }
  return result;
}

function errorResponse(error: unknown) {
  if (error instanceof PromoPreviewError) {
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status) ? error.status : 503;
    return json({ ok: false, error: SAFE_ERROR_CODES.has(error.code) ? error.code : 'promo_preview_unavailable' }, status);
  }
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401) return json({ ok: false, error: 'unauthorized' }, 401);
  if (status === 403) return json({ ok: false, error: 'promo_permission_denied' }, 403);
  if (status === 404) return json({ ok: false, error: 'promo_not_found' }, 404);
  return json({ ok: false, error: 'promo_preview_unavailable' }, 503);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, context } = await requestContext(request);
    const result = await backendRequest(
      CONTEXT_PATH,
      authPb.authStore.token,
      { contract: 'promo.preview.context.read.v1' },
      context.isMasterSupport ? context.storeId : '',
    );
    normalizePromoPreviewContext(result);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!promoCmsSameOriginMutation(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ ok: false, error: 'invalid_payload' }, 413);
  }
  try {
    const { authPb, context, storeSlug } = await requestContext(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json({ ok: false, error: 'invalid_payload' }, 413);
    }
    const input = parsePromoPreviewAdminRequest(JSON.parse(raw));
    let revisionId = input.operation === 'read' ? input.revisionId : '';
    if (input.operation === 'prepare') {
      const candidateResult = await backendRequest(
        CANDIDATE_PATH,
        authPb.authStore.token,
        {
          contract: 'promo.candidate.create.v1',
          expected_draft_version: input.expectedDraftVersion,
        },
        context.isMasterSupport ? context.storeId : '',
      );
      const candidate = normalizePromoCandidateResponse(candidateResult);
      if (candidate.sourceDraftVersion !== input.expectedDraftVersion) {
        throw new PromoPreviewError('promo_candidate_unavailable', 503);
      }
      revisionId = candidate.revisionId;
    }
    const result = await backendRequest(
      PREVIEW_PATH,
      authPb.authStore.token,
      {
        contract: 'promo.preview.read.v1',
        candidate_revision_id: revisionId,
        locale: input.locale,
      },
      context.isMasterSupport ? context.storeId : '',
    );
    const preview = normalizePromoPreviewResponse(result, 'private');
    if (preview.candidate.revisionId !== revisionId) {
      throw new PromoPreviewError('promo_preview_unavailable', 503);
    }
    return json(rewritePromoPreviewMedia(result, storeSlug));
  } catch (error) {
    if (error instanceof SyntaxError) return json({ ok: false, error: 'invalid_payload' }, 400);
    return errorResponse(error);
  }
};
