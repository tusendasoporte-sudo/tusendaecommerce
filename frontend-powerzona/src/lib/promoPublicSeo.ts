import {
  PromoPublicShellError,
  requestPromoPublicJson,
} from './promoPublicShell.ts';
import { applyPromoSecurityHeaders } from './promoSecurity.ts';

export const PROMO_PUBLIC_SEO_RESOURCE_CONTRACT = 'promo.public.seo.resource.v1';
export type PromoSeoResource = 'robots' | 'sitemap';

type SeoIdentity = Readonly<{
  source: 'platform' | 'custom';
  origin: string;
  sitemap_url: string;
  x_default: string;
  locales: readonly Readonly<{ locale: string; url: string }>[];
}>;

export type PromoSeoResourceResult = Readonly<{
  resource: PromoSeoResource;
  route: Readonly<{
    source: 'platform' | 'custom';
    action: 'serve' | 'redirect';
    location?: string;
  }>;
  identity?: SeoIdentity;
}>;

function fail(status = 503): never {
  throw new PromoPublicShellError('promo_seo_unavailable', status);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactRecord(value: unknown, keys: readonly string[]) {
  if (!isRecord(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return value;
}

function canonicalLocale(value: unknown) {
  if (typeof value !== 'string' || value.length > 80) fail();
  let canonical = '';
  try { canonical = Intl.getCanonicalLocales(value)[0] || ''; } catch (_) { fail(); }
  if (canonical !== value) fail();
  return canonical;
}

function normalizedHttps(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) fail();
  let parsed: URL;
  try { parsed = new URL(value); } catch (_) { fail(); }
  const serialized = parsed.pathname === '/' && value === parsed.origin ? parsed.origin : parsed.origin + parsed.pathname;
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
    || parsed.search || parsed.hash || serialized !== value
    || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(parsed.hostname)
    || parsed.hostname.includes('..')) fail();
  return parsed;
}

function expectedFilename(resource: PromoSeoResource) {
  return resource === 'sitemap' ? 'sitemap.xml' : 'robots.txt';
}

export function normalizePromoSeoResource(
  value: unknown,
  expected: Readonly<{ resource: PromoSeoResource; publicSlug?: string; customHostname?: string }>,
): PromoSeoResourceResult {
  const envelope = exactRecord(value, [
    'ok', 'contract', 'resource', 'route',
    ...(isRecord(value) && Object.hasOwn(value, 'identity') ? ['identity'] : []),
  ]);
  if (envelope.ok !== true || envelope.contract !== PROMO_PUBLIC_SEO_RESOURCE_CONTRACT
    || envelope.resource !== expected.resource) fail();
  const route = exactRecord(envelope.route, [
    'source', 'action',
    ...(isRecord(envelope.route) && Object.hasOwn(envelope.route, 'location') ? ['location'] : []),
  ]);
  if (!['platform', 'custom'].includes(route.source) || !['serve', 'redirect'].includes(route.action)) fail();
  if (route.action === 'redirect') {
    if (route.source !== 'custom' || Object.hasOwn(envelope, 'identity')) fail();
    const location = normalizedHttps(route.location);
    if (location.pathname !== `/${expectedFilename(expected.resource)}`) fail();
    return { resource: expected.resource, route: { source: 'custom', action: 'redirect', location: location.toString() } };
  }
  if (Object.hasOwn(route, 'location') || !Object.hasOwn(envelope, 'identity')) fail();
  const identity = exactRecord(envelope.identity, ['source', 'origin', 'sitemap_url', 'x_default', 'locales']);
  if (identity.source !== route.source) fail();
  const origin = normalizedHttps(identity.origin);
  if (origin.pathname !== '/' || identity.origin !== origin.origin) fail();
  if (route.source === 'platform') {
    if (!expected.publicSlug || origin.origin !== 'https://tusenda84.com') fail();
  } else if (!expected.customHostname || origin.hostname !== expected.customHostname) fail();
  if (!Array.isArray(identity.locales) || !identity.locales.length || identity.locales.length > 10) fail();
  const locales = identity.locales.map((raw: unknown) => {
    const entry = exactRecord(raw, ['locale', 'url']);
    const locale = canonicalLocale(entry.locale);
    const url = normalizedHttps(entry.url);
    const expectedPath = route.source === 'platform'
      ? `/promo/${expected.publicSlug}/${locale}`
      : `/${locale}`;
    if (url.origin !== origin.origin || url.pathname !== expectedPath) fail();
    return { locale, url: url.toString() };
  });
  if (new Set(locales.map((entry) => entry.locale)).size !== locales.length) fail();
  const xDefault = normalizedHttps(identity.x_default).toString();
  if (!locales.some((entry) => entry.url === xDefault)) fail();
  const sitemap = normalizedHttps(identity.sitemap_url);
  const sitemapPath = route.source === 'platform'
    ? `/promo/${expected.publicSlug}/sitemap.xml`
    : '/sitemap.xml';
  if (sitemap.origin !== origin.origin || sitemap.pathname !== sitemapPath) fail();
  return {
    resource: expected.resource,
    route: { source: route.source, action: 'serve' },
    identity: {
      source: route.source,
      origin: origin.origin,
      sitemap_url: sitemap.toString(),
      x_default: xDefault,
      locales,
    },
  };
}

export async function readPlatformPromoSeo(
  request: Request,
  publicSlug: string,
  resource: PromoSeoResource,
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(publicSlug)) fail(404);
  const body = await requestPromoPublicJson({
    endpoint: `/api/pz/promo/public/v1/seo/sites/${publicSlug}/${resource}`,
    request,
  });
  return normalizePromoSeoResource(body, { resource, publicSlug });
}

export async function readCustomHostPromoSeo(
  request: Request,
  customHostname: string,
  resource: PromoSeoResource,
) {
  const body = await requestPromoPublicJson({
    endpoint: `/api/pz/promo/public/v1/seo/host/${resource}`,
    request,
    host: customHostname,
  });
  return normalizePromoSeoResource(body, { resource, customHostname });
}

function xmlEscape(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

export function renderPromoSitemap(identity: SeoIdentity) {
  const links = () => [
    ...identity.locales.map((alternate) => `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alternate.locale)}" href="${xmlEscape(alternate.url)}" />`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(identity.x_default)}" />`,
  ].join('\n');
  const entries = identity.locales.map((entry) => [
    '  <url>',
    `    <loc>${xmlEscape(entry.url)}</loc>`,
    links(),
    '  </url>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`;
}

export function renderPromoRobots(identity: SeoIdentity) {
  const lines = identity.source === 'custom'
    ? ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /master', 'Disallow: /api/']
    : ['User-agent: *', `Allow: ${new URL(identity.locales[0].url).pathname.replace(/\/[^/]+$/, '/')}`];
  return `${[...lines, `Sitemap: ${identity.sitemap_url}`].join('\n')}\n`;
}

export function promoSeoResourceResponse(result: PromoSeoResourceResult) {
  if (result.route.action === 'redirect' && result.route.location) {
    return applyPromoSecurityHeaders(new Response(null, {
      status: 308,
      headers: {
        Location: result.route.location,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...(result.route.source === 'custom' ? { Vary: 'Host' } : {}),
      },
    }));
  }
  if (!result.identity) fail();
  const sitemap = result.resource === 'sitemap';
  return applyPromoSecurityHeaders(new Response(sitemap ? renderPromoSitemap(result.identity) : renderPromoRobots(result.identity), {
    status: 200,
    headers: {
      'Content-Type': sitemap ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...(result.route.source === 'custom' ? { Vary: 'Host' } : {}),
    },
  }));
}
