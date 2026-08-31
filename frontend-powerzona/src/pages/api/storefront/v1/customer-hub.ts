import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../../lib/pocketBaseServerUrl.ts';
import { publicSecurityProxyHeaders } from '../../../../lib/publicSecurity';

const SESSION_PATTERN = /^pzws_v1_[A-Za-z0-9]{64}$/;
const MAX_BODY_BYTES = 4096;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Content-Type': 'application/json',
};

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: PRIVATE_HEADERS });
}

function proxyHeaders(request: Request, clientAddress?: string) {
  const headers = publicSecurityProxyHeaders(request, clientAddress);
  const raw = request.headers.get('cookie') || '';
  if (!raw || raw.length > 8192) return headers;
  const pair = raw.split(';').map((item) => item.trim())
    .find((item) => item.startsWith('pz_storefront_session='));
  const token = pair?.slice('pz_storefront_session='.length) || '';
  if (SESSION_PATTERN.test(token)) {
    headers.Cookie = [headers.Cookie, `pz_storefront_session=${token}`].filter(Boolean).join('; ');
  }
  return headers;
}

async function relay(request: Request, clientAddress: string | undefined, body?: string) {
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return json({ ok: false, error: 'customer_hub_unavailable' }, 503);
  try {
    const upstream = await fetch(`${baseUrl}/api/pz/storefront/v1/customer-hub`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: proxyHeaders(request, clientAddress),
      cache: 'no-store',
      body,
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await upstream.text();
    return new Response(payload || JSON.stringify({ ok: false, error: 'customer_hub_unavailable' }), {
      status: upstream.status,
      headers: PRIVATE_HEADERS,
    });
  } catch (_) {
    return json({ ok: false, error: 'customer_hub_unavailable' }, 503);
  }
}

export const GET: APIRoute = async ({ request, clientAddress }) => relay(request, clientAddress);

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'invalid_payload' }, 413);
  }
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }
  try { JSON.parse(body); } catch (_) { return json({ ok: false, error: 'invalid_payload' }, 400); }
  return relay(request, clientAddress, body);
};
