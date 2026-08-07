import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl.ts';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 65536;
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
      headers: publicSecurityProxyHeaders(request, clientAddress),
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
