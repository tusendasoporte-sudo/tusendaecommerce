import type { APIRoute } from 'astro';
import { refreshAuthFromCookie, requireMasterAdmin } from '../../../lib/auth';
import { serverPocketBaseUrl } from '../../../lib/pocketBaseServerUrl';

const REQUEST_TIMEOUT_MS = 5000;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function finiteInteger(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeMetric(value: any) {
  const totalBytes = finiteInteger(value?.total_bytes);
  const usedBytes = Math.min(totalBytes, finiteInteger(value?.used_bytes));
  const availableBytes = Math.min(totalBytes, finiteInteger(value?.available_bytes));
  if (!totalBytes) return null;
  return {
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    available_bytes: availableBytes,
    percent: Math.round(Math.min(100, Math.max(0, usedBytes / totalBytes * 100)) * 10) / 10,
  };
}

export const GET: APIRoute = async ({ request }) => {
  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !requireMasterAdmin(authPb.authStore.record as any)) {
    return json(403, { ok: false, error: 'unauthorized' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${serverPocketBaseUrl()}/api/pz/master/server-metrics`, {
      method: 'GET',
      headers: { Authorization: authPb.authStore.token },
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const memory = normalizeMetric(payload?.memory);
    const disk = normalizeMetric(payload?.disk);
    const sampledAt = String(payload?.sampled_at || '');
    if (!response.ok || payload?.ok !== true || !memory || !disk || !Number.isFinite(new Date(sampledAt).getTime())) {
      return json(response.status === 403 ? 403 : 503, {
        ok: false,
        error: response.status === 403 ? 'unauthorized' : 'metrics_unavailable',
      });
    }
    return json(200, { ok: true, sampled_at: sampledAt, memory, disk });
  } catch (_) {
    return json(503, { ok: false, error: 'metrics_unavailable' });
  } finally {
    clearTimeout(timeout);
  }
};
