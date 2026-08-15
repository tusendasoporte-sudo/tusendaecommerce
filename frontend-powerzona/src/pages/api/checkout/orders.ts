import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl.ts';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 65536;
const STOREFRONT_SESSION_PATTERN = /^pzws_v1_[A-Za-z0-9]{64}$/;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
  });
}

function checkoutProxyHeaders(request: Request, clientAddress?: string) {
  const headers = publicSecurityProxyHeaders(request, clientAddress);
  const raw = request.headers.get('cookie') || '';
  if (!raw || raw.length > 8192) return headers;
  const part = raw.split(';').map((item) => item.trim())
    .find((item) => item.startsWith('pz_storefront_session='));
  const token = part?.slice('pz_storefront_session='.length) || '';
  if (!STOREFRONT_SESSION_PATTERN.test(token)) return headers;
  headers.Cookie = [headers.Cookie, `pz_storefront_session=${token}`].filter(Boolean).join('; ');
  return headers;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ ok: false, error: 'invalid_order' }, 413);
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json({ ok: false, error: 'invalid_order' }, 400);
  try { JSON.parse(body); } catch (_) { return json({ ok: false, error: 'invalid_order' }, 400); }

  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return json({ ok: false, error: 'order_creation_failed' }, 503);
  try {
    const response = await fetch(`${baseUrl}/api/pz/checkout/orders`, {
      method: 'POST',
      headers: checkoutProxyHeaders(request, clientAddress),
      cache: 'no-store',
      body,
    });
    const responseBody = await response.text();
    return new Response(responseBody || JSON.stringify({ ok: false, error: 'order_creation_failed' }), {
      status: response.status,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (_) {
    return json({ ok: false, error: 'order_creation_failed' }, 503);
  }
};
