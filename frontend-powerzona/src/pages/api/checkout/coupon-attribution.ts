import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl.ts';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const SESSION_PATTERN = /^pzws_v1_[A-Za-z0-9]{64}$/;
const MAX_BODY_BYTES = 65536;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Content-Type': 'application/json',
};

function response(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: PRIVATE_HEADERS });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return response({ ok: false, error: 'invalid_order' }, 400);
  }
  try { JSON.parse(body); } catch (_) { return response({ ok: false, error: 'invalid_order' }, 400); }
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return response({ ok: true, attributed: false }, 200);
  const headers = publicSecurityProxyHeaders(request, clientAddress);
  const rawCookie = request.headers.get('cookie') || '';
  const sessionPart = rawCookie.length <= 8192
    ? rawCookie.split(';').map((item) => item.trim()).find((item) => item.startsWith('pz_storefront_session='))
    : '';
  const token = sessionPart ? sessionPart.slice('pz_storefront_session='.length) : '';
  if (SESSION_PATTERN.test(token)) {
    headers.Cookie = [headers.Cookie, `pz_storefront_session=${token}`].filter(Boolean).join('; ');
  }
  try {
    const upstream = await fetch(`${baseUrl}/api/pz/checkout/coupon-attribution`, {
      method: 'POST', headers, cache: 'no-store', body,
    });
    const payload = await upstream.text();
    return new Response(payload || JSON.stringify({ ok: true, attributed: false }), {
      status: upstream.status,
      headers: PRIVATE_HEADERS,
    });
  } catch (_) {
    return response({ ok: true, attributed: false }, 200);
  }
};
