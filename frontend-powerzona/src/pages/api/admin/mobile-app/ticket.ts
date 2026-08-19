import type { APIRoute } from 'astro';

import { refreshAuthFromCookie, isStoreAdmin } from '../../../../lib/auth';
import { readAdminDeviceToken } from '../../../../lib/adminDevice';
import { createAdminAppDownloadTicket } from '../../../../lib/mobileAdminReleases';
import { serverPocketBaseUrl } from '../../../../lib/pocketBaseServerUrl';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return json({ ok: false, error: 'invalid_origin' }, 403);
  const cookie = request.headers.get('cookie') || '';
  const authPb = await refreshAuthFromCookie(cookie);
  if (!authPb.authStore.isValid || !isStoreAdmin(authPb.authStore.record as any)) {
    return json({ ok: false, error: 'unauthorized' }, 403);
  }
  const deviceToken = readAdminDeviceToken(cookie);
  if (!deviceToken) return json({ ok: false, error: 'device_not_authorized' }, 403);
  const body = await request.json().catch(() => null);
  const expectedKeys = ['channel', 'grant', 'package_name'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).sort().join('|') !== expectedKeys.join('|')) {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }
  const grant = String((body as any).grant || '').trim();
  const packageName = String((body as any).package_name || '').trim();
  const channel = String((body as any).channel || '').trim();
  if ((grant && !TOKEN_PATTERN.test(grant)) || (packageName && !PACKAGE_PATTERN.test(packageName))
    || !['staging', 'production'].includes(channel)) return json({ ok: false, error: 'invalid_payload' }, 400);
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return json({ ok: false, error: 'unavailable' }, 503);
  const result = await createAdminAppDownloadTicket(baseUrl, authPb.authStore.token, deviceToken, {
    grant, package_name: packageName, channel: channel as 'staging' | 'production',
  });
  if (!result.available || !result.data) return json({ ok: false, error: result.error }, result.status || 503);
  const artifact = result.data.artifact;
  return json({
    ok: true,
    ticket: result.data.ticket,
    expires_at: result.data.expires_at,
    artifact,
    download_url: `/api/admin/mobile-app/download/${artifact.id}/${result.data.ticket}/${encodeURIComponent(artifact.file_name)}`,
  }, 201);
};
