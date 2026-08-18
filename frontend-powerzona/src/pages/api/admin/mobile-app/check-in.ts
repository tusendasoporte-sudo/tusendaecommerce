import type { APIRoute } from 'astro';

import { refreshAuthFromCookie, isStoreAdmin } from '../../../../lib/auth';
import { readAdminDeviceToken } from '../../../../lib/adminDevice';
import { checkInAdminApp } from '../../../../lib/mobileAdminReleases';
import { serverPocketBaseUrl } from '../../../../lib/pocketBaseServerUrl';

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return json({ ok: false, error: 'invalid_origin' }, 403);
    } catch (_) { return json({ ok: false, error: 'invalid_origin' }, 403); }
  }
  const cookie = request.headers.get('cookie') || '';
  const authPb = await refreshAuthFromCookie(cookie);
  if (!authPb.authStore.isValid || !isStoreAdmin(authPb.authStore.record as any)) return json({ ok: false, error: 'unauthorized' }, 403);
  const deviceToken = readAdminDeviceToken(cookie);
  const body = await request.json().catch(() => null);
  const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [];
  if (keys.join(',') !== 'package_name,version_code,version_name') return json({ ok: false, error: 'invalid_payload' }, 400);
  const input = {
    package_name: String((body as any).package_name || '').trim(),
    version_code: Number((body as any).version_code),
    version_name: String((body as any).version_name || '').trim(),
  };
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(input.package_name)
    || !Number.isSafeInteger(input.version_code) || input.version_code < 1
    || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(input.version_name)) return json({ ok: false, error: 'invalid_payload' }, 400);
  const baseUrl = serverPocketBaseUrl();
  if (!deviceToken) return json({ ok: false, error: 'device_not_authorized' }, 403);
  if (!baseUrl) return json({ ok: false, error: 'unavailable' }, 503);
  const result = await checkInAdminApp(baseUrl, authPb.authStore.token, deviceToken, input);
  return result.available && result.data ? json(result.data) : json({ ok: false, error: result.error }, result.status || 503);
};
