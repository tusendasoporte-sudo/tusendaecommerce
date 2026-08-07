import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl.ts';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 4096;
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function json(status: number) {
  return new Response(JSON.stringify({ ok: false }), {
    status,
    headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413);
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json(400);
  try { JSON.parse(body); } catch (_) { return json(400); }

  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return json(503);
  try {
    const response = await fetch(`${baseUrl}/api/pz/security/register-order`, {
      method: 'POST',
      headers: publicSecurityProxyHeaders(request, clientAddress),
      cache: 'no-store',
      body,
    });
    return new Response(null, { status: response.ok ? 204 : response.status, headers: PRIVATE_HEADERS });
  } catch (_) {
    return json(503);
  }
};
