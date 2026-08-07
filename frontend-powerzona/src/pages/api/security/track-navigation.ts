import type { APIRoute } from 'astro';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl.ts';
import {
  publicSecurityProxyDiagnostics,
  publicSecurityProxyHeaders,
} from '../../../lib/publicSecurity';

const MAX_BODY_BYTES = 8192;
const STAGING_DIAGNOSTIC_HOST = 'mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io';
const PROXY_DIAGNOSTIC_HEADER = 'x-pz-proxy-diagnostics';
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

function isStagingProxyDiagnostic(request: Request) {
  try {
    return new URL(request.url).hostname === STAGING_DIAGNOSTIC_HOST
      && request.headers.get(PROXY_DIAGNOSTIC_HEADER) === 'classify';
  } catch (_) {
    return false;
  }
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (isStagingProxyDiagnostic(request)) {
    return new Response(JSON.stringify(publicSecurityProxyDiagnostics(request, clientAddress)), {
      status: 200,
      headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return json(413);
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) return json(400);
  try { JSON.parse(body); } catch (_) { return json(400); }

  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return json(503);
  try {
    const response = await fetch(`${baseUrl}/api/pz/security/track-navigation`, {
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
