export const PROMO_SECURITY_CONTRACT = 'promo.security.v1';

export const PROMO_PUBLIC_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://tusenda84.com",
  "media-src 'self' https://tusenda84.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "worker-src 'none'",
  "manifest-src 'self'",
].join('; ');

const DEFAULT_PLATFORM_HOSTS = Object.freeze([
  'tusenda84.com',
  'www.tusenda84.com',
  'api.tusenda84.com',
  'mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io',
  'localhost',
  '127.0.0.1',
  '::1',
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CUSTOM_ANALYTICS_PATH = '/api/promo/analytics/host';
const LOCALE_PATH = /^\/[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const CUSTOM_SERVICE_PATH = /^\/[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*\/servicios\/[a-z][a-z0-9_-]{0,119}\/?$/;

export class PromoSecurityError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = 'PromoSecurityError';
    this.code = code;
    this.status = status;
  }
}

function fail(code: string, status: number): never {
  throw new PromoSecurityError(code, status);
}

function ipv4(value: string) {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9][0-9]{0,2})$/.test(part)
    && Number(part) >= 0 && Number(part) <= 255);
}

function validIpv6(value: string) {
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)
    || (value.match(/::/g) || []).length > 1 || value.includes(':::')) return false;
  const sides = value.split('::');
  const groups = sides.reduce((total, side) => total + (side ? side.split(':').length : 0), 0);
  const validGroups = sides.every((side) => !side || side.split(':').every((group) => /^[0-9a-f]{1,4}$/i.test(group)));
  return validGroups && (sides.length === 1 ? groups === 8 : groups < 8);
}

export function parsePromoRequestHost(value: unknown) {
  const raw = String(value ?? '');
  if (!raw || raw.length > 280 || raw !== raw.trim()
    || /[\u0000-\u0020\u007f,\/@\\?#%]/.test(raw) || raw.includes('://')) {
    fail('promo_host_unavailable', 421);
  }
  if (raw.startsWith('[')) {
    const match = raw.match(/^\[([0-9a-fA-F:]+)\](?::([0-9]{1,5}))?$/);
    if (!match || !validIpv6(match[1])) fail('promo_host_unavailable', 421);
    const port = match[2] ? Number(match[2]) : null;
    if (port !== null && (port < 1 || port > 65535)) fail('promo_host_unavailable', 421);
    return Object.freeze({
      hostname: match[1].toLowerCase(),
      port,
      authority: `[${match[1].toLowerCase()}]${port === null ? '' : `:${port}`}`,
    });
  }
  const parts = raw.split(':');
  if (parts.length > 2) fail('promo_host_unavailable', 421);
  const hostname = parts[0].toLowerCase();
  const port = parts.length === 2 ? Number(parts[1]) : null;
  if (!hostname || (port !== null && (!/^[0-9]{1,5}$/.test(parts[1]) || port < 1 || port > 65535))) {
    fail('promo_host_unavailable', 421);
  }
  const local = hostname === 'localhost' || ipv4(hostname);
  if (!local) {
    if (hostname.length > 253 || hostname.includes('..')) fail('promo_host_unavailable', 421);
    if (!hostname.split('.').every((label) => label.length >= 1 && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) fail('promo_host_unavailable', 421);
  }
  return Object.freeze({ hostname, port, authority: `${hostname}${port === null ? '' : `:${port}`}` });
}

function parseOrigin(value: string) {
  if (!value || value.length > 512 || value !== value.trim() || value === 'null'
    || /[\u0000-\u0020\u007f,]/.test(value)) fail('promo_origin_forbidden', 403);
  const match = value.match(/^(https?):\/\/([^/]+)$/i);
  if (!match) fail('promo_origin_forbidden', 403);
  const host = parsePromoRequestHost(match[2]);
  const protocol = match[1].toLowerCase();
  const origin = `${protocol}://${host.authority}`;
  if (origin !== value.toLowerCase()) fail('promo_origin_forbidden', 403);
  return Object.freeze({ ...host, protocol, origin });
}

function configuredPlatformHosts() {
  const values = String(typeof process !== 'undefined' ? process.env?.PZ_PROMO_PLATFORM_HOSTS || '' : '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const result = [...DEFAULT_PLATFORM_HOSTS];
  for (const value of values) {
    try {
      const parsed = parsePromoRequestHost(value);
      if (parsed.port === null && !result.includes(parsed.hostname)) result.push(parsed.hostname);
    } catch (_) {}
  }
  return Object.freeze(result.sort());
}

function platformPromoPath(pathname: string) {
  return pathname === '/promo-shell-internal'
    || pathname === '/promo-analytics-admin-internal'
    || pathname === '/promo'
    || pathname.startsWith('/promo/')
    || pathname === '/admin/promo'
    || pathname.startsWith('/admin/promo/')
    || /^\/t\/[^/]+\/admin\/promo(?:\/|$)/.test(pathname)
    || pathname.startsWith('/api/promo/analytics/')
    || pathname === '/api/admin/promo'
    || pathname.startsWith('/api/admin/promo-');
}

function customPublicPath(pathname: string) {
  return pathname === '/' || pathname === '/sitemap.xml' || pathname === '/robots.txt'
    || LOCALE_PATH.test(pathname) || CUSTOM_SERVICE_PATH.test(pathname);
}

export function promoRequestAuthority(request: Request) {
  let requestUrl: URL;
  try { requestUrl = new URL(request.url); } catch (_) { fail('promo_host_unavailable', 421); }
  const host = parsePromoRequestHost(request.headers.get('host') || requestUrl.host);
  const urlHost = parsePromoRequestHost(requestUrl.host);
  const urlDefaultPort = requestUrl.protocol === 'https:' ? 443 : requestUrl.protocol === 'http:' ? 80 : null;
  if (host.hostname !== urlHost.hostname
    || (host.port ?? urlDefaultPort) !== (urlHost.port ?? urlDefaultPort)) fail('promo_host_unavailable', 421);
  const forwarded = request.headers.get('x-forwarded-host') || '';
  if (forwarded && (forwarded.length > 280 || forwarded !== forwarded.trim()
    || forwarded.includes(',') || /[\u0000-\u001f\u007f]/.test(forwarded))) {
    fail('promo_host_unavailable', 421);
  }
  if (forwarded) parsePromoRequestHost(forwarded); // Sintáctico solamente: nunca es autoridad.
  return host;
}

function localHostname(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function isPromoPlatformHostRequest(request: Request) {
  try {
    return configuredPlatformHosts().includes(promoRequestAuthority(request).hostname);
  } catch (_) {
    return false;
  }
}

export function validatePromoFrontendRequest(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const urlAuthority = parsePromoRequestHost(url.host);
  const platformHosts = configuredPlatformHosts();
  if (platformHosts.includes(urlAuthority.hostname) && !platformPromoPath(pathname)) {
    return Object.freeze({ relevant: false, platform: true, hostname: urlAuthority.hostname });
  }
  const authority = promoRequestAuthority(request);
  const platform = platformHosts.includes(authority.hostname);
  const method = request.method.toUpperCase();
  const safeMethod = SAFE_METHODS.has(method);
  if (platform && pathname === CUSTOM_ANALYTICS_PATH) fail('promo_host_unavailable', 404);
  if (!platform && !customPublicPath(pathname) && !(pathname === CUSTOM_ANALYTICS_PATH && method === 'POST')) {
    fail('promo_host_unavailable', 404);
  }
  if (!safeMethod) {
    const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
    if (fetchSite === 'cross-site') fail('promo_origin_forbidden', 403);
    const origin = parseOrigin(request.headers.get('origin') || '');
    const localHttp = localHostname(origin.hostname) && origin.protocol === 'http';
    const defaultPort = origin.protocol === 'https' ? 443 : 80;
    if ((!localHttp && origin.protocol !== 'https') || origin.hostname !== authority.hostname
      || (origin.port ?? defaultPort) !== (authority.port ?? defaultPort)) fail('promo_origin_forbidden', 403);
  }
  return Object.freeze({ relevant: true, platform, hostname: authority.hostname });
}

export function applyPromoSecurityHeaders(response: Response) {
  response.headers.set('Content-Security-Policy', PROMO_PUBLIC_CSP);
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return response;
}

export function promoSecurityUnavailable(error: unknown, pathname: string) {
  const rejected = error instanceof PromoSecurityError ? error : new PromoSecurityError('promo_security_unavailable', 503);
  const api = pathname.startsWith('/api/');
  const response = api
    ? new Response(JSON.stringify({ ok: false, error: rejected.status === 403 ? 'promo_origin_forbidden' : 'promo_host_unavailable' }), {
        status: rejected.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0' },
      })
    : new Response('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Sitio no disponible</title><style>html{font-family:system-ui,sans-serif;color:#172033;background:#f5f7fb}body{min-height:100vh;display:grid;place-items:center;margin:0;padding:24px}main{max-width:36rem}h1{font-size:clamp(1.75rem,5vw,2.5rem)}p{line-height:1.6;color:#667085}</style></head><body><main><h1>Sitio no disponible</h1><p>No pudimos mostrar este sitio en este momento.</p></main></body></html>', {
        status: rejected.status,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0' },
      });
  response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return applyPromoSecurityHeaders(response);
}
