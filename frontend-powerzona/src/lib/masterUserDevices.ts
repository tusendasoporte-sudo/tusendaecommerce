import type PocketBase from 'pocketbase';
import { isMasterAdmin } from './auth';
import { pb } from './pocketbase';

export type MasterDeviceStatus = 'authorized' | 'revoked' | 'all';

export type MasterUserDevice = {
  id: string;
  label: string;
  browser_name: string;
  os_name: string;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  status: 'authorized' | 'revoked';
  first_seen_at: string;
  last_seen_at: string;
  revoked_at: string;
};

export type MasterDeviceAudit = {
  id: string;
  action: 'device_authorized' | 'device_revoked' | 'device_deleted' | string;
  device_id: string;
  device_label: string;
  browser_name: string;
  os_name: string;
  device_type: string;
  actor_name: string;
  actor_role: string;
  sessions_revoked: boolean;
  reason: string;
  created: string;
};

export type Pagination = {
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
};

function requireMaster(client: PocketBase) {
  if (!isMasterAdmin(client.authStore.record as any)) throw new Error('unauthorized');
}

async function postThroughSameOrigin<T>(action: string, body: Record<string, unknown>) {
  const response = await fetch('/api/master/store-user-devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ action, ...body }),
  });
  const payload = await response.json().catch(() => ({
    ok: false,
    error: 'device_authorization_unavailable',
  }));
  if (!response.ok || payload?.ok !== true) {
    const code = getMasterDeviceErrorCode(payload) || 'device_authorization_unavailable';
    throw Object.assign(new Error(code), {
      code,
      data: payload,
      response: { status: response.status, data: payload },
    });
  }
  return payload as T;
}

function post<T>(client: PocketBase, action: string, body: Record<string, unknown>) {
  if (client === pb && typeof window !== 'undefined') {
    return postThroughSameOrigin<T>(action, body);
  }
  requireMaster(client);
  return client.send<T>(`/api/pz/master/store-user-devices/${action}`, {
    method: 'POST',
    body,
    requestKey: null,
  });
}

const MASTER_DEVICE_ERROR_CODES = new Set([
  'unauthorized',
  'invalid_payload',
  'store_not_found',
  'user_not_found',
  'device_not_found',
  'device_revoked',
  'device_must_be_revoked',
  'device_authorization_unavailable',
  'device_list_failed',
  'device_revocation_failed',
  'device_delete_failed',
  'audit_load_failed',
]);

export function getMasterDeviceErrorCode(error: unknown) {
  const candidate = error as any;
  const code = String(
    candidate?.error
      || candidate?.data?.error
      || candidate?.response?.error
      || candidate?.response?.data?.error
      || candidate?.code
      || candidate?.message
      || '',
  );
  return MASTER_DEVICE_ERROR_CODES.has(code) ? code : '';
}

export function getMasterDeviceErrorMessage(error: unknown) {
  const code = getMasterDeviceErrorCode(error);
  const messages: Record<string, string> = {
    unauthorized: 'No tienes permisos para gestionar dispositivos.',
    store_not_found: 'No se encontró la tienda.',
    user_not_found: 'No se encontró el usuario en esta tienda.',
    device_not_found: 'No se encontró el dispositivo.',
    device_revoked: 'Este dispositivo ya está revocado.',
    device_must_be_revoked: 'Solo se pueden borrar dispositivos revocados.',
    device_list_failed: 'No se pudieron cargar los dispositivos.',
    device_revocation_failed: 'No se pudo revocar el dispositivo.',
    device_delete_failed: 'No se pudo borrar el dispositivo revocado.',
    audit_load_failed: 'No se pudo cargar la auditoría de dispositivos.',
  };
  return messages[code] || 'No se pudo completar la operación de dispositivos.';
}

export function listMasterUserDevices(
  storeId: string,
  userId: string,
  options: { page?: number; perPage?: number; status?: MasterDeviceStatus } = {},
  client = pb,
) {
  return post<{
    ok: true;
    devices: MasterUserDevice[];
    authorized_for_user: number;
    user_limit: number;
    distinct_authorized_for_store: number;
    store_limit: number;
    pagination: Pagination;
  }>(client, 'list', {
    store_id: storeId,
    user_id: userId,
    page: options.page || 1,
    per_page: options.perPage || 10,
    status: options.status || 'authorized',
  });
}

export function revokeMasterUserDevice(
  storeId: string,
  userId: string,
  deviceId: string,
  reason: string,
  client = pb,
) {
  return post<{
    ok: true;
    device: MasterUserDevice;
    already_revoked: boolean;
    sessions_revoked_for_user: boolean;
    push_devices_disabled: number;
  }>(client, 'revoke', {
    store_id: storeId,
    user_id: userId,
    device_id: deviceId,
    reason: String(reason || '').trim(),
  });
}

export function deleteMasterUserDevice(
  storeId: string,
  userId: string,
  deviceId: string,
  reason: string,
  client = pb,
) {
  return post<{
    ok: true;
    deleted: true;
    device_id: string;
    push_devices_disabled: number;
  }>(client, 'delete', {
    store_id: storeId,
    user_id: userId,
    device_id: deviceId,
    reason: String(reason || '').trim(),
  });
}

export function getMasterUserDeviceAudit(
  storeId: string,
  userId: string,
  options: { page?: number; perPage?: number } = {},
  client = pb,
) {
  return post<{ ok: true; audit: MasterDeviceAudit[]; pagination: Pagination }>(client, 'audit', {
    store_id: storeId,
    user_id: userId,
    page: options.page || 1,
    per_page: options.perPage || 20,
  });
}
