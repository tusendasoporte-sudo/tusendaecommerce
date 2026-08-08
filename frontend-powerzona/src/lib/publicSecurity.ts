import { isIP } from 'node:net';
import { serverPocketBaseUrl } from './pocketBaseServerUrl.ts';

export type PublicSecurityResolver =
  | Readonly<{ store_slug: string }>
  | Readonly<{ order_number: string; receipt_token: string }>
  | Readonly<{ review_token: string }>;

export type PublicAccessDecision = Readonly<{
  allowed: boolean;
  reason: 'allowed' | 'vpn_or_proxy_detected' | 'unavailable';
}>;

const DEVICE_COOKIE = 'pz_client_device';
const DEVICE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SAFE_IP_PATTERN = /^[0-9a-fA-F:.]{2,64}$/;
const MAX_FORWARDED_FOR_BYTES = 2048;
const MAX_DIAGNOSTIC_FORWARDED_ENTRIES = 20;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,120}$/;
const LEGACY_STORE_PATH = /^\/(?:buscar(?:\/|$)|categoria(?:\/|$)|subcategoria(?:\/|$)|producto(?:\/|$)|checkout(?:\/|$)|regalos(?:\/|$)|qr(?:\/|$)|links(?:\/|$))/;

function decodedSegment(value: string) {
  try { return decodeURIComponent(value || '').trim(); } catch (_) { return ''; }
}

function safeStoreSlug(value: string) {
  const slug = decodedSegment(value).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 ? slug : '';
}

function safeToken(value: string) {
  const token = decodedSegment(value);
  return SAFE_TOKEN_PATTERN.test(token) ? token : '';
}

export function publicSecurityResolverForPath(pathname: string): PublicSecurityResolver | null {
  const path = String(pathname || '').split('?')[0].replace(/\/{2,}/g, '/');
  if (path === '/admin' || path.startsWith('/admin/')
    || path === '/master' || path.startsWith('/master/')
    || path === '/login' || path === '/master-login') return null;

  const storeRoute = path.match(/^\/t\/([^/]+)(?:\/|$)/);
  if (storeRoute) {
    if (/^\/t\/[^/]+\/admin(?:\/|$)/.test(path)) return null;
    const storeSlug = safeStoreSlug(storeRoute[1]);
    if (!storeSlug) return null;
    const reviewRoute = path.match(/^\/t\/[^/]+\/review\/order\/([^/]+)\/?$/);
    const reviewToken = reviewRoute ? safeToken(reviewRoute[1]) : '';
    return reviewToken ? { review_token: reviewToken } : { store_slug: storeSlug };
  }

  const receiptRoute = path.match(/^\/orden\/([^/]+)\/([^/]+)\/?$/);
  if (receiptRoute) {
    const orderNumber = decodedSegment(receiptRoute[1]).slice(0, 80);
    const receiptToken = safeToken(receiptRoute[2]);
    return orderNumber && receiptToken ? { order_number: orderNumber, receipt_token: receiptToken } : null;
  }

  const legacyReview = path.match(/^\/review\/order\/([^/]+)\/?$/);
  if (legacyReview) {
    const reviewToken = safeToken(legacyReview[1]);
    return reviewToken ? { review_token: reviewToken } : null;
  }

  const ogRoute = path.match(/^\/api\/og\/producto\/([^/]+)\/[^/]+\.(?:png|jpg)$/);
  if (ogRoute) {
    const storeSlug = safeStoreSlug(ogRoute[1]);
    return storeSlug ? { store_slug: storeSlug } : null;
  }

  return path === '/' || LEGACY_STORE_PATH.test(path) ? { store_slug: 'powerzona' } : null;
}

function deviceCookieHeader(request: Request) {
  const rawCookie = request.headers.get('cookie') || '';
  if (!rawCookie || rawCookie.length > 8192) return '';
  const prefix = `${DEVICE_COOKIE}=`;
  const part = rawCookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
  if (!part) return '';
  const token = part.slice(prefix.length);
  return DEVICE_TOKEN_PATTERN.test(token) ? `${DEVICE_COOKIE}=${token}` : '';
}

function normalizedIp(value: unknown) {
  const candidate = String(value || '').trim();
  return SAFE_IP_PATTERN.test(candidate) && isIP(candidate) ? candidate : '';
}

function isPrivateProxyAddress(value: string) {
  const ip = normalizedIp(value).toLowerCase();
  const family = isIP(ip);
  if (!family) return false;

  if (family === 4) {
    const [first, second] = ip.split('.').map(Number);
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }

  if (ip === '::' || ip === '::1') return true;
  if (ip.startsWith('::ffff:')) return isPrivateProxyAddress(ip.slice('::ffff:'.length));
  return ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip);
}

type ProxyIpClass = 'missing' | 'public' | 'private' | 'invalid';

function proxyIpClass(value: unknown): ProxyIpClass {
  const candidate = String(value || '').trim();
  if (!candidate) return 'missing';
  const ip = normalizedIp(candidate);
  if (!ip) return 'invalid';
  return isPrivateProxyAddress(ip) ? 'private' : 'public';
}

function resolvedClientAddress(request: Request, clientAddress?: string) {
  const runtimeAddress = normalizedIp(clientAddress);
  if (!runtimeAddress || !isPrivateProxyAddress(runtimeAddress)) return runtimeAddress;

  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  if (!forwardedFor || forwardedFor.length > MAX_FORWARDED_FOR_BYTES) return runtimeAddress;

  const forwardedAddresses = forwardedFor
    .split(',')
    .map(normalizedIp)
    .filter(Boolean);
  return forwardedAddresses.findLast((address) => !isPrivateProxyAddress(address)) || runtimeAddress;
}

export function publicSecurityProxyDiagnostics(request: Request, clientAddress?: string) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const oversized = forwardedFor.length > MAX_FORWARDED_FOR_BYTES;
  const forwardedEntries = forwardedFor && !oversized
    ? forwardedFor.split(',').map((entry) => entry.trim())
    : [];
  const runtimeAddress = normalizedIp(clientAddress);
  const resolvedAddress = resolvedClientAddress(request, clientAddress);
  const forwardedProto = String(request.headers.get('x-forwarded-proto') || '').trim().toLowerCase();

  return {
    runtime: proxyIpClass(clientAddress),
    resolved: proxyIpClass(resolvedAddress),
    resolved_source: resolvedAddress
      ? (runtimeAddress && resolvedAddress === runtimeAddress ? 'runtime' : 'x-forwarded-for')
      : 'none',
    forwarded_for: {
      present: Boolean(forwardedFor),
      oversized,
      count: forwardedEntries.length,
      classes: forwardedEntries
        .slice(0, MAX_DIAGNOSTIC_FORWARDED_ENTRIES)
        .map(proxyIpClass),
      truncated: forwardedEntries.length > MAX_DIAGNOSTIC_FORWARDED_ENTRIES,
    },
    x_real_ip: proxyIpClass(request.headers.get('x-real-ip')),
    forwarded_host_present: Boolean(String(request.headers.get('x-forwarded-host') || '').trim()),
    forwarded_proto: forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : (forwardedProto ? 'other' : 'missing'),
  } as const;
}

export function publicSecurityProxyHeaders(request: Request, clientAddress?: string, includeJson = true) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Cache-Control': 'no-store',
    'X-Request-Id': crypto.randomUUID(),
  };
  if (includeJson) headers['Content-Type'] = 'application/json';
  const cookie = deviceCookieHeader(request);
  if (cookie) headers.Cookie = cookie;
  const serverAddress = resolvedClientAddress(request, clientAddress);
  if (serverAddress) headers['X-Forwarded-For'] = serverAddress;
  return headers;
}

export async function publicAccessDecision(
  request: Request,
  clientAddress: string | undefined,
  resolver: PublicSecurityResolver,
): Promise<PublicAccessDecision> {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return { allowed: false, reason: 'unavailable' };
  try {
    const response = await fetch(`${baseUrl}/api/pz/security/public-access`, {
      method: 'POST',
      headers: publicSecurityProxyHeaders(request, clientAddress),
      cache: 'no-store',
      body: JSON.stringify(resolver),
    });
    if (response.status === 204 || (response.status === 200 && response.ok)) {
      return { allowed: true, reason: 'allowed' };
    }
    if (response.status === 403) {
      try {
        const payload = await response.json();
        if (payload?.error === 'vpn_or_proxy_detected') {
          return { allowed: false, reason: 'vpn_or_proxy_detected' };
        }
      } catch (_) {}
    }
    return { allowed: false, reason: 'unavailable' };
  } catch (_) {
    return { allowed: false, reason: 'unavailable' };
  }
}

export async function publicAccessAllowed(
  request: Request,
  clientAddress: string | undefined,
  resolver: PublicSecurityResolver,
) {
  return (await publicAccessDecision(request, clientAddress, resolver)).allowed;
}

export function renderPublicUnavailable() {
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página no disponible</title><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">
<style>:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(520px,100%);padding:30px;border:1px solid #dbe2ec;border-radius:18px;background:#fff;box-shadow:0 18px 52px rgba(15,23,42,.08)}h1{margin:0;font-size:28px}p{margin:12px 0 0;color:#64748b;line-height:1.55}button{margin-top:20px;min-height:42px;border:0;border-radius:10px;background:#172033;color:#fff;padding:0 16px;font-weight:800;cursor:pointer}</style>
</head><body><main><h1>Página no disponible</h1><p>No fue posible mostrar este contenido. Intenta nuevamente más tarde.</p><form method="get"><button type="submit">Reintentar</button></form></main></body></html>`, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}

function vpnRetryHref(requestUrl: string) {
  try {
    const parsed = new URL(String(requestUrl || ''));
    return `${parsed.pathname}${parsed.search}`
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  } catch (_) {
    return '';
  }
}

export function renderVpnUnavailable(requestUrl = '') {
  const retryHref = vpnRetryHref(requestUrl);
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desactiva la VPN</title><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer">
<style>:root{font-family:Inter,system-ui,sans-serif;color:#172033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(540px,100%);padding:30px;border:1px solid #dbe2ec;border-radius:18px;background:#fff;box-shadow:0 18px 52px rgba(15,23,42,.08)}h1{margin:0;font-size:28px}p{margin:12px 0 0;color:#64748b;line-height:1.55}a{display:inline-grid;place-items:center;margin-top:20px;min-height:42px;border-radius:10px;background:#172033;color:#fff;padding:0 16px;font-weight:800;text-decoration:none}</style>
</head><body><main><h1>Desactiva la VPN o el proxy</h1><p>Para entrar, desactiva temporalmente la VPN o el proxy de tu dispositivo y vuelve a intentarlo.</p><a href="${retryHref}">Volver a intentar</a></main></body></html>`, {
    status: 403,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
