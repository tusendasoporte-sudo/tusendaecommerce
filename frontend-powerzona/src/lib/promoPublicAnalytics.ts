import { request as nodeHttpRequest } from 'node:http';
import { request as nodeHttpsRequest } from 'node:https';
import { serverPocketBaseUrl } from './pocketBaseServerUrl.ts';
import type { PromoPublicProfile, PromoPublicSeo } from './promoPublicShell.ts';
import { applyPromoSecurityHeaders, promoRequestAuthority } from './promoSecurity.ts';

export const PROMO_ANALYTICS_COLLECT_CONTRACT = 'promo.analytics.collect.v1';
export const PROMO_ANALYTICS_ACCEPTED_CONTRACT = 'promo.analytics.accepted.v1';
export const PROMO_CUSTOM_ANALYTICS_PATH = '/api/promo/analytics/host';
export const PROMO_ANALYTICS_EVENT_TYPES = Object.freeze([
  'page_view', 'section_view', 'contact_activate', 'landing_qr_open',
] as const);

export type PromoAnalyticsEventType = (typeof PROMO_ANALYTICS_EVENT_TYPES)[number];

export class PromoPublicAnalyticsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 503) {
    super(code);
    this.name = 'PromoPublicAnalyticsError';
    this.code = code;
    this.status = status;
  }
}

function fail(code = 'promo_analytics_unavailable', status = 503): never {
  throw new PromoPublicAnalyticsError(code, status);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalLocale(value: unknown) {
  if (typeof value !== 'string' || value.length > 35) fail('invalid_payload', 400);
  let locale = '';
  try { locale = Intl.getCanonicalLocales(value)[0] || ''; } catch (_) { fail('invalid_payload', 400); }
  if (locale !== value) fail('invalid_payload', 400);
  return locale;
}

export function normalizePromoAnalyticsEvent(value: unknown) {
  if (!isRecord(value)) fail('invalid_payload', 400);
  const eventType = String(value.event_type || '') as PromoAnalyticsEventType;
  const expected = [
    'contract', 'event_id', 'event_type', 'locale',
    ...(eventType === 'section_view' ? ['section_key'] : []),
    ...(eventType === 'contact_activate' ? ['action_type'] : []),
  ].sort();
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])
    || value.contract !== PROMO_ANALYTICS_COLLECT_CONTRACT
    || !PROMO_ANALYTICS_EVENT_TYPES.includes(eventType)
    || typeof value.event_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.event_id)) {
    fail('invalid_payload', 400);
  }
  const locale = canonicalLocale(value.locale);
  const sectionKey = eventType === 'section_view' ? String(value.section_key || '') : '';
  const actionType = eventType === 'contact_activate' ? String(value.action_type || '') : '';
  if (eventType === 'section_view' && !/^[a-z][a-z0-9_-]{0,63}$/.test(sectionKey)) fail('invalid_payload', 400);
  if (eventType === 'contact_activate' && !['whatsapp', 'phone', 'email'].includes(actionType)) {
    fail('invalid_payload', 400);
  }
  return Object.freeze({
    contract: PROMO_ANALYTICS_COLLECT_CONTRACT,
    event_id: value.event_id,
    event_type: eventType,
    locale,
    ...(sectionKey ? { section_key: sectionKey } : {}),
    ...(actionType ? { action_type: actionType } : {}),
  });
}

function normalizedBackendOrigin() {
  let parsed: URL;
  try { parsed = new URL(serverPocketBaseUrl()); } catch (_) { fail(); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) fail();
  return parsed.origin;
}

function authoritativeHost(request: Request) {
  return promoRequestAuthority(request).authority;
}

function nodePost(url: string, host: string, origin: string, body: string) {
  return new Promise<number>((resolve, reject) => {
    const target = new URL(url);
    const send = target.protocol === 'https:' ? nodeHttpsRequest : nodeHttpRequest;
    const outgoing = send(target, {
      method: 'POST',
      headers: {
        Accept: 'application/json', 'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body), Host: host, Origin: origin,
      },
    }, (incoming) => {
      incoming.resume();
      incoming.on('end', () => resolve(incoming.statusCode || 502));
    });
    outgoing.setTimeout(8_000, () => outgoing.destroy(new Error('promo_analytics_timeout')));
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

function safeResponse(status = 202, hostScoped = false) {
  const response = new Response(JSON.stringify(status === 400
    ? { ok: false, error: 'invalid_payload' }
    : { ok: true, contract: PROMO_ANALYTICS_ACCEPTED_CONTRACT }), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      ...(hostScoped ? { Vary: 'Host' } : {}),
    },
  });
  return applyPromoSecurityHeaders(response);
}

export async function forwardPromoPublicAnalytics(input: {
  request: Request;
  publicSlug?: string;
  customHost?: boolean;
  fetcher?: typeof fetch;
}) {
  if (input.request.method !== 'POST' || new URL(input.request.url).search) return safeResponse(400, input.customHost);
  let normalized;
  try {
    const raw = await input.request.text();
    if (!raw || Buffer.byteLength(raw) > 1024) return safeResponse(400, input.customHost);
    normalized = normalizePromoAnalyticsEvent(JSON.parse(raw));
  } catch (error) {
    if (error instanceof PromoPublicAnalyticsError && error.status !== 400) return safeResponse(202, input.customHost);
    return safeResponse(400, input.customHost);
  }
  const slug = String(input.publicSlug || '');
  if (!input.customHost && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return safeResponse(400, false);
  const endpoint = input.customHost
    ? '/api/pz/promo/public/v1/analytics/host/events'
    : `/api/pz/promo/public/v1/analytics/sites/${slug}/events`;
  const body = JSON.stringify(normalized);
  try {
    const url = `${normalizedBackendOrigin()}${endpoint}`;
    const requestOrigin = input.request.headers.get('origin') || '';
    const status = input.customHost && !input.fetcher
      ? await nodePost(url, authoritativeHost(input.request), requestOrigin, body)
      : (await (input.fetcher || fetch)(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: requestOrigin },
        body,
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      })).status;
    return safeResponse(status === 400 ? 400 : 202, input.customHost);
  } catch (_) {
    return safeResponse(202, input.customHost);
  }
}

export function promoPublicAnalyticsEndpoint(profile: PromoPublicProfile, seo: PromoPublicSeo) {
  const slug = String(profile.site.public_slug || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail();
  let canonical: URL;
  try { canonical = new URL(seo.canonical_url); } catch (_) { fail(); }
  if (canonical.hostname === 'tusenda84.com') {
    if (!canonical.pathname.startsWith(`/promo/${slug}/`)) fail();
    return `/api/promo/analytics/sites/${slug}`;
  }
  if (canonical.protocol !== 'https:' || canonical.username || canonical.password || canonical.port
    || canonical.search || canonical.hash) fail();
  return PROMO_CUSTOM_ANALYTICS_PATH;
}
