import type { APIRoute } from 'astro';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 16384;
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
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ ok: false }, 413);
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json({ ok: false }, 400);
  try { JSON.parse(body); } catch (_) { return json({ ok: false }, 400); }

  const baseUrl = String(import.meta.env.PUBLIC_POCKETBASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) return json({ ok: false }, 503);
  try {
    const response = await fetch(`${baseUrl}/api/collections/store_analytics_events/records`, {
      method: 'POST',
      headers: publicSecurityProxyHeaders(request, clientAddress),
      cache: 'no-store',
      body,
    });
    return new Response(null, { status: response.ok ? 204 : response.status, headers: PRIVATE_HEADERS });
  } catch (_) {
    return json({ ok: false }, 503);
  }
};
