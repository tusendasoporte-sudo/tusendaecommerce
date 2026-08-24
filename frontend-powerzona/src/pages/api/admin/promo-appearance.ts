import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import {
  normalizePromoAppearanceCatalog,
  PromoAppearanceError,
} from '../../../lib/promoAppearance';
import { promoCmsStoreSlug } from '../../../lib/promoCms';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';

const CATALOG_PATH = '/api/pz/promo/private/v1/themes/catalog';
const SAFE_ERROR_CODES = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload',
  'promo_theme_unavailable',
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
  if (parameters.length !== 1 || parameters[0]?.[0] !== 'store') {
    throw new PromoAppearanceError('invalid_payload', 400);
  }
  const storeSlug = promoCmsStoreSlug(parameters[0][1]);
  if (!storeSlug) throw new PromoAppearanceError('invalid_payload', 400);
  return storeSlug;
}

async function requestContext(request: Request) {
  const storeSlug = exactStoreQuery(request);
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !authPb.authStore.token) {
    throw new PromoAppearanceError('unauthorized', 401);
  }
  const context = await requireCurrentStoreForAdmin(authPb, { storeSlug });
  if (String(context.store.slug || '').trim().toLowerCase() !== storeSlug) {
    throw new PromoAppearanceError('promo_not_found', 404);
  }
  return { authPb, context };
}

async function readCatalog(token: string, supportStoreId: string) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) throw new PromoAppearanceError('promo_theme_unavailable', 503);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${CATALOG_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(supportStoreId ? { 'X-PZ-Promo-Store': supportStoreId } : {}),
      },
      body: JSON.stringify({ contract: 'promo.theme.catalog.read.v1' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (_) {
    throw new PromoAppearanceError('promo_theme_unavailable', 503);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const code = String(result?.error || 'promo_theme_unavailable');
    throw new PromoAppearanceError(
      SAFE_ERROR_CODES.has(code) ? code : 'promo_theme_unavailable',
      response.status || 503,
    );
  }
  return normalizePromoAppearanceCatalog(result);
}

function errorResponse(error: unknown) {
  if (error instanceof PromoAppearanceError) {
    const status = [400, 401, 403, 404, 409, 413, 429, 503].includes(error.status)
      ? error.status
      : 503;
    const code = SAFE_ERROR_CODES.has(error.code) ? error.code : 'promo_appearance_unavailable';
    return json({ ok: false, error: code }, status);
  }
  const status = Number((error as { status?: number })?.status || 0);
  if (status === 401) return json({ ok: false, error: 'unauthorized' }, 401);
  if (status === 403) return json({ ok: false, error: 'promo_permission_denied' }, 403);
  if (status === 404) return json({ ok: false, error: 'promo_not_found' }, 404);
  return json({ ok: false, error: 'promo_appearance_unavailable' }, 503);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const { authPb, context } = await requestContext(request);
    const catalog = await readCatalog(
      authPb.authStore.token,
      context.isMasterSupport ? context.storeId : '',
    );
    return json({
      ok: true,
      contract: 'promo.theme.catalog.v1',
      current: {
        source: catalog.current.source,
        status: catalog.current.status,
        theme_id: catalog.current.themeId,
        version: catalog.current.version,
        tokens: catalog.current.tokens,
        ...(catalog.current.source === 'selected'
          ? { override_keys: catalog.current.overrideKeys }
          : {}),
      },
      fallback: {
        source: catalog.fallback.source,
        theme_id: catalog.fallback.themeId,
        version: catalog.fallback.version,
        tokens: catalog.fallback.tokens,
        selectable: catalog.fallback.selectable,
      },
      themes: catalog.themes.map((theme) => ({
        theme_id: theme.themeId,
        version: theme.version,
        renderer_key: theme.rendererKey,
        contract_version: theme.contractVersion,
        tokens: Object.fromEntries(Object.entries(theme.tokens).map(([key, definition]) => [key, {
          type: definition.type,
          values: definition.values,
          default: definition.default,
        }])),
        default_tokens: theme.defaultTokens,
        section_variants: theme.sectionVariants,
        accessibility: {
          normal_text_contrast_min: theme.accessibility.normalTextContrastMin,
          large_text_contrast_min: theme.accessibility.largeTextContrastMin,
          focus_contrast_min: theme.accessibility.focusContrastMin,
          reduced_motion_supported: theme.accessibility.reducedMotionSupported,
        },
        performance: {
          css_budget_kib: theme.performance.cssBudgetKib,
          initial_js_budget_kib: theme.performance.initialJsBudgetKib,
          third_party_scripts: theme.performance.thirdPartyScripts,
        },
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
};
