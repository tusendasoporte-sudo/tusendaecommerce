import type { APIRoute } from 'astro';
import { refreshAuthFromCookie, requireMasterAdmin } from '../../../lib/auth';
import {
  deleteMasterUserDevice,
  getMasterDeviceErrorCode,
  getMasterUserDeviceAudit,
  listMasterUserDevices,
  revokeMasterUserDevice,
} from '../../../lib/masterUserDevices';

const MAX_BODY_BYTES = 4096;
const ACTION_KEYS = Object.freeze({
  list: ['action', 'store_id', 'user_id', 'page', 'per_page', 'status'],
  revoke: ['action', 'store_id', 'user_id', 'device_id', 'reason'],
  delete: ['action', 'store_id', 'user_id', 'device_id', 'reason'],
  audit: ['action', 'store_id', 'user_id', 'page', 'per_page'],
});

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
}

function hasExactKeys(body: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(body).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

function errorStatus(code: string) {
  if (code === 'unauthorized') return 403;
  if (['store_not_found', 'user_not_found', 'device_not_found'].includes(code)) return 404;
  if (['device_revoked', 'device_must_be_revoked'].includes(code)) return 409;
  if (code === 'invalid_payload') return 400;
  return 503;
}

export const POST: APIRoute = async ({ request }) => {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'invalid_payload' });
  }

  const rawBody = await request.text();
  if (!rawBody || new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json(400, { ok: false, error: 'invalid_payload' });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_payload');
    body = parsed;
  } catch (_) {
    return json(400, { ok: false, error: 'invalid_payload' });
  }

  const action = String(body.action || '') as keyof typeof ACTION_KEYS;
  if (!ACTION_KEYS[action] || !hasExactKeys(body, ACTION_KEYS[action])) {
    return json(400, { ok: false, error: 'invalid_payload' });
  }

  const authPb = await refreshAuthFromCookie(request.headers.get('cookie') || '');
  if (!authPb.authStore.isValid || !requireMasterAdmin(authPb.authStore.record as any)) {
    return json(403, { ok: false, error: 'unauthorized' });
  }

  try {
    if (action === 'list') {
      const result = await listMasterUserDevices(
        String(body.store_id || ''),
        String(body.user_id || ''),
        {
          page: Number(body.page),
          perPage: Number(body.per_page),
          status: String(body.status || '') as 'authorized' | 'revoked' | 'all',
        },
        authPb,
      );
      return json(200, result);
    }
    if (action === 'revoke') {
      const result = await revokeMasterUserDevice(
        String(body.store_id || ''),
        String(body.user_id || ''),
        String(body.device_id || ''),
        String(body.reason || ''),
        authPb,
      );
      return json(200, result);
    }
    if (action === 'delete') {
      const result = await deleteMasterUserDevice(
        String(body.store_id || ''),
        String(body.user_id || ''),
        String(body.device_id || ''),
        String(body.reason || ''),
        authPb,
      );
      return json(200, result);
    }
    const result = await getMasterUserDeviceAudit(
      String(body.store_id || ''),
      String(body.user_id || ''),
      { page: Number(body.page), perPage: Number(body.per_page) },
      authPb,
    );
    return json(200, result);
  } catch (error) {
    const fallback = action === 'list'
      ? 'device_list_failed'
      : action === 'revoke'
        ? 'device_revocation_failed'
        : action === 'delete'
          ? 'device_delete_failed'
          : 'audit_load_failed';
    const code = getMasterDeviceErrorCode(error) || fallback;
    return json(errorStatus(code), { ok: false, error: code });
  }
};
