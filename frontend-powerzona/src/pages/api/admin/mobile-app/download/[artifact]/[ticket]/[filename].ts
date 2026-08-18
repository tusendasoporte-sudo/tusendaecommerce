import type { APIRoute } from 'astro';

import { refreshAuthFromCookie, isStoreAdmin } from '../../../../../../../lib/auth';
import { ADMIN_DEVICE_HEADER_NAME, readAdminDeviceToken } from '../../../../../../../lib/adminDevice';
import { serverPocketBaseUrl } from '../../../../../../../lib/pocketBaseServerUrl';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]+$/;

function unavailable(status = 404) {
  return new Response(JSON.stringify({ ok: false, error: 'apk_not_found' }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
  });
}

export const GET: APIRoute = async ({ request, params }) => {
  const artifact = String(params.artifact || '').trim();
  const ticket = String(params.ticket || '').trim();
  const filename = String(params.filename || '').trim();
  if (!RECORD_ID_PATTERN.test(artifact) || !TOKEN_PATTERN.test(ticket) || !FILE_PATTERN.test(filename)) return unavailable();
  const cookie = request.headers.get('cookie') || '';
  const authPb = await refreshAuthFromCookie(cookie);
  const deviceToken = readAdminDeviceToken(cookie);
  if (!authPb.authStore.isValid || !isStoreAdmin(authPb.authStore.record as any) || !deviceToken) return unavailable();
  const baseUrl = serverPocketBaseUrl();
  if (!baseUrl) return unavailable(503);
  const response = await fetch(`${baseUrl}/api/pz/admin-app-downloads/${artifact}/${ticket}/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${authPb.authStore.token}`, [ADMIN_DEVICE_HEADER_NAME]: deviceToken, Accept: 'application/vnd.android.package-archive' },
    cache: 'no-store', signal: AbortSignal.timeout(120_000),
  }).catch(() => null);
  if (!response?.ok || !response.body) return unavailable(response?.status === 404 ? 404 : 503);
  const headers = new Headers({
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
  });
  ['x-pz-apk-sha256', 'x-pz-apk-version-code', 'x-pz-apk-version-name', 'content-length'].forEach((name) => {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  });
  return new Response(response.body, { status: 200, headers });
};
