import type { APIRoute } from 'astro';
import { publicSecurityProxyHeaders } from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 8192;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,120}$/;
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

export const POST: APIRoute = async ({ request, url, clientAddress }) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json({ message: 'Solicitud inválida.' }, 413);
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json({ message: 'Solicitud inválida.' }, 400);
  try { JSON.parse(body); } catch (_) { return json({ message: 'Solicitud inválida.' }, 400); }

  const reviewToken = String(url.searchParams.get('review_token') || '').trim();
  if (reviewToken && !TOKEN_PATTERN.test(reviewToken)) return json({ message: 'Solicitud inválida.' }, 400);
  const baseUrl = String(import.meta.env.PUBLIC_POCKETBASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) return json({ message: 'No se pudo completar la solicitud.' }, 503);
  const target = `${baseUrl}/api/collections/reviews/records${reviewToken ? `?review_token=${encodeURIComponent(reviewToken)}` : ''}`;
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: publicSecurityProxyHeaders(request, clientAddress),
      cache: 'no-store',
      body,
    });
    const responseBody = await response.text();
    return new Response(responseBody || JSON.stringify({ message: 'No se pudo completar la solicitud.' }), {
      status: response.status,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (_) {
    return json({ message: 'No se pudo completar la solicitud.' }, 503);
  }
};
