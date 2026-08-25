import type { APIRoute } from 'astro';
import { refreshAuthFromCookie } from '../../../lib/auth';
import { normalizePromoAnalyticsSummary, PROMO_ANALYTICS_RANGES, PromoAnalyticsError } from '../../../lib/promoAnalytics';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';
import { requireCurrentStoreForAdmin } from '../../../lib/storeContext';

const SAFE_ERRORS = new Set([
  'unauthorized', 'session_revoked', 'user_inactive', 'blocked_by_plan', 'promo_not_found',
  'store_not_promo', 'store_inactive', 'promo_site_inactive', 'promo_store_context_required',
  'promo_capability_denied', 'promo_permission_denied', 'invalid_payload', 'promo_analytics_unavailable',
]);

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function query(request: Request) {
  const entries = Array.from(new URL(request.url).searchParams.entries());
  if (entries.length !== 2 || entries.map(([key]) => key).sort().join('|') !== 'range|store') {
    throw new PromoAnalyticsError('invalid_payload', 400);
  }
  const values = Object.fromEntries(entries);
  const range = Number(values.range);
  const storeSlug = String(values.store || '').trim().toLowerCase();
  if (!PROMO_ANALYTICS_RANGES.includes(range as any) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug)) {
    throw new PromoAnalyticsError('invalid_payload', 400);
  }
  return { range, storeSlug };
}

function errorResponse(error: unknown) {
  const raw = error instanceof PromoAnalyticsError ? error.code
    : String((error as { code?: string })?.code || 'promo_analytics_unavailable');
  const code = SAFE_ERRORS.has(raw) ? raw : 'promo_analytics_unavailable';
  const explicit = error instanceof PromoAnalyticsError ? error.status : Number((error as { status?: number })?.status || 0);
  const status = [400, 401, 403, 404, 503].includes(explicit) ? explicit
    : code === 'unauthorized' ? 401 : code === 'promo_not_found' || code === 'store_not_promo' ? 404
      : code === 'promo_analytics_unavailable' ? 503 : 403;
  return json({ ok: false, error: code }, status);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const parsed = query(request);
    const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
    if (!authPb.authStore.isValid || !authPb.authStore.token) throw new PromoAnalyticsError('unauthorized', 401);
    const context = await requireCurrentStoreForAdmin(authPb, { storeSlug: parsed.storeSlug });
    if (String(context.store.slug || '').trim().toLowerCase() !== parsed.storeSlug) {
      throw new PromoAnalyticsError('promo_not_found', 404);
    }
    const baseUrl = serverPocketBaseUrl();
    if (!baseUrl) throw new PromoAnalyticsError('promo_analytics_unavailable', 503);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/pz/promo/private/v1/analytics/summary`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authPb.authStore.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(context.isMasterSupport ? { 'X-PZ-Promo-Store': context.storeId } : {}),
        },
        body: JSON.stringify({ contract: 'promo.analytics.summary.read.v1', range_days: parsed.range }),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (_) { throw new PromoAnalyticsError('promo_analytics_unavailable', 503); }
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true) {
      const code = String(body?.error || 'promo_analytics_unavailable');
      throw new PromoAnalyticsError(SAFE_ERRORS.has(code) ? code : 'promo_analytics_unavailable', response.status || 503);
    }
    normalizePromoAnalyticsSummary(body);
    return json(body);
  } catch (error) { return errorResponse(error); }
};
