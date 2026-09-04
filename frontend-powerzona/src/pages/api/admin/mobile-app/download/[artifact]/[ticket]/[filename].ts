import type { APIRoute } from 'astro';

import { refreshAuthFromCookie, isStoreAdmin } from '../../../../../../../lib/auth';
import { ADMIN_DEVICE_HEADER_NAME, readAdminDeviceToken } from '../../../../../../../lib/adminDevice';
import { parseNativeAdminAppUserAgent } from '../../../../../../../lib/mobileAdminReleases';
import { serverPocketBaseUrl } from '../../../../../../../lib/pocketBaseServerUrl';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]+$/;
const LEGACY_WEBVIEW_HANDOFF = 'legacy-webview';

function unavailable(status = 404) {
  return new Response(JSON.stringify({ ok: false, error: 'apk_not_found' }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
  });
}

function isLegacyWebViewHandoff(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get('handoff') !== LEGACY_WEBVIEW_HANDOFF) return false;
  if (!parseNativeAdminAppUserAgent(request.headers.get('user-agent') || '')) return false;
  const fetchMode = String(request.headers.get('sec-fetch-mode') || '').toLowerCase();
  const fetchDest = String(request.headers.get('sec-fetch-dest') || '').toLowerCase();
  const accept = String(request.headers.get('accept') || '').toLowerCase();
  return fetchMode === 'navigate' || fetchDest === 'document' || accept.includes('text/html');
}

function legacyWebViewHandoff(filename: string) {
  return new Response(new Uint8Array([0]), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': '1',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-PZ-Download-Handoff': 'android-download-manager',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
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
  // La APK 1.0.2 no tiene el puente de actualización. WebView inspecciona primero
  // el adjunto y DownloadManager repite después la URL. Esta respuesta de relevo
  // evita consumir el ticket en la inspección; la segunda petición sirve la APK.
  if (isLegacyWebViewHandoff(request)) return legacyWebViewHandoff(filename);
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
