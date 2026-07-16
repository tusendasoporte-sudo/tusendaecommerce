import type PocketBase from 'pocketbase';
import { isMasterAdmin, USER_ROLES } from './auth';
import { pb } from './pocketbase';

export type StoreUserRole = typeof USER_ROLES.STORE_ADMIN | typeof USER_ROLES.STORE_STAFF;

export type MasterStoreUser = {
  id: string;
  email: string;
  display_name?: string;
  role: StoreUserRole | string;
  store: string;
  status: string;
  phone?: string;
  created?: string;
  updated?: string;
  must_change_password?: boolean;
  temporary_password_state?: 'none' | 'pending' | 'expired';
  temporary_password_issued_at?: string;
  temporary_password_expires_at?: string;
  last_admin_activity_at?: string;
  is_last_active_admin?: boolean;
  authorized_device_count?: number;
  device_limit?: number;
};

export type MasterStoreUserPlan = {
  code: 'free' | 'basic' | 'premium' | string;
  state: string;
  is_permanent: boolean;
  is_configured: boolean;
  is_expired: boolean;
  max_active_users: number;
  active_users: number;
  active_admins: number;
  active_staff: number;
  over_limit: boolean;
  store_authorized_device_count: number;
  max_store_devices: number;
  max_devices_per_user: number;
  security_enabled: boolean;
  raffles_enabled: boolean;
  landing_qr_enabled: boolean;
};

export type MasterStoreUserPagination = {
  page: number;
  per_page: number;
  total_items: number;
  total_pages: number;
};

export type MasterStoreUserAudit = {
  id: string;
  action: string;
  actor_name: string;
  actor_role: string;
  previous_email: string;
  new_email: string;
  previous_display_name: string;
  new_display_name: string;
  previous_phone: string;
  new_phone: string;
  previous_role: string;
  new_role: string;
  previous_status: string;
  new_status: string;
  sessions_revoked: boolean;
  reason: string;
  created: string;
};

export type DeleteMasterStoreUserResponse = {
  ok: true;
  user_deleted: true;
  user_id: string;
  sessions_revoked: true;
};

export type MasterStoreUserInput = {
  store: string;
  email: string;
  password: string;
  display_name?: string;
  phone?: string;
  role?: string;
  status?: string;
  reason?: string;
};

export type MasterStoreUserSummaryItem = {
  store_id: string;
  total_users: number;
  active_users: number;
  active_admins: number;
  active_staff: number;
};

export type MasterStoreUserSummary = {
  ok: true;
  total_users: number;
  stores: MasterStoreUserSummaryItem[];
};

function requireMasterClient(client: PocketBase) {
  if (!isMasterAdmin(client.authStore.record as any)) {
    throw new Error('No tienes permisos para gestionar usuarios de tienda.');
  }
}

function normalizeStoreUserRole(value: string | undefined): StoreUserRole {
  if (value === USER_ROLES.STORE_ADMIN || value === USER_ROLES.STORE_STAFF) return value;
  throw new Error('El rol seleccionado no es valido.');
}

function normalizeUserStatus(value: string | undefined) {
  const status = String(value || 'active').toLowerCase();
  if (status === 'active' || status === 'suspended') return status;
  throw new Error('El estado seleccionado no es valido.');
}

function mapMasterStoreUser(user: any): MasterStoreUser {
  return {
    id: user.id || '',
    email: user.email || '',
    display_name: user.display_name || '',
    role: user.role || '',
    store: Array.isArray(user.store) ? String(user.store[0] || '') : String(user.store || ''),
    status: user.status || '',
    phone: user.phone || '',
    created: user.created || '',
    updated: user.updated || '',
    must_change_password: user.must_change_password === true,
    temporary_password_state: ['pending', 'expired'].includes(user.temporary_password_state)
      ? user.temporary_password_state
      : 'none',
    temporary_password_issued_at: user.temporary_password_issued_at || '',
    temporary_password_expires_at: user.temporary_password_expires_at || '',
    last_admin_activity_at: user.last_admin_activity_at || '',
    is_last_active_admin: user.is_last_active_admin === true,
    authorized_device_count: Math.max(0, Number(user.authorized_device_count || 0)),
    device_limit: Math.max(0, Number(user.device_limit || 0)),
  };
}

function getStoreUserPayload(input: MasterStoreUserInput) {
  const store = String(input.store || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const displayName = String(input.display_name || '').trim();

  if (!store) throw new Error('Selecciona la tienda del usuario.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un email valido.');
  if (password.length < 8) throw new Error('La contrasena debe tener al menos 8 caracteres.');
  if (!displayName) throw new Error('Escribe el nombre del usuario.');

  const payload = {
    store_id: store,
    email,
    password,
    display_name: displayName,
    phone: String(input.phone || '').trim(),
    role: normalizeStoreUserRole(input.role),
    status: normalizeUserStatus(input.status),
    reason: String(input.reason || '').trim(),
  };

  return payload;
}

async function postMasterStoreUsers<T>(client: PocketBase, action: string, body: Record<string, unknown>, signal?: AbortSignal) {
  return client.send<T>(`/api/pz/master/store-users/${action}`, {
    method: 'POST',
    body,
    requestKey: null,
    signal,
  });
}

async function getStoreUsersPage(client: PocketBase, storeId: string, page: number) {
  return postMasterStoreUsers<{
    ok: true;
    users: any[];
    pagination: { page: number; total_pages: number };
  }>(client, 'list', {
    store_id: storeId,
    page,
    per_page: 50,
    search: '',
    role: 'all',
    status: 'all',
  });
}

async function getAllUsersForStore(client: PocketBase, storeId: string) {
  const first = await getStoreUsersPage(client, storeId, 1);
  const users = [...first.users];
  for (let page = 2; page <= first.pagination.total_pages; page += 1) {
    users.push(...(await getStoreUsersPage(client, storeId, page)).users);
  }
  return users.map((user) => mapMasterStoreUser({ ...user, store: storeId }));
}

export function getStoreUserCreateErrorMessage(error: any) {
  const data = error?.data?.data || error?.data || {};
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || error?.response?.status || 0);
  const errorCode = String(error?.data?.error || data?.error || '').toLowerCase();
  const emailCode = String(data?.email?.code || data?.email?.message || '').toLowerCase();
  const passwordCode = String(data?.password?.code || data?.password?.message || '').toLowerCase();
  const storeCode = String(data?.store?.code || data?.store?.message || '').toLowerCase();
  const roleCode = String(data?.role?.code || data?.role?.message || '').toLowerCase();
  const statusCode = String(data?.status?.code || data?.status?.message || '').toLowerCase();
  const verifiedCode = String(data?.verified?.code || data?.verified?.message || '').toLowerCase();
  const emailVisibilityCode = String(data?.emailVisibility?.code || data?.emailVisibility?.message || '').toLowerCase();
  const permissionCode = String(data?.permission?.code || data?.permission?.message || '').toLowerCase();

  if (errorCode === 'email_exists') return 'Este email ya existe.';
  if (errorCode === 'active_user_limit_reached') return 'La tienda alcanzo el limite de usuarios activos de su plan.';
  if (errorCode === 'invalid_role') return 'El rol seleccionado no es valido.';
  if (errorCode === 'invalid_status') return 'El estado seleccionado no es valido.';
  if (errorCode === 'invalid_email') return 'Escribe un email valido.';
  if (errorCode === 'invalid_password') return 'La contrasena debe tener al menos 8 caracteres.';
  if (errorCode === 'store_not_found') return 'No se encontro la tienda seleccionada.';
  if (errorCode === 'user_management_unavailable') return 'La gestion de usuarios no esta disponible temporalmente.';
  if (errorCode === 'unauthorized' || status === 403 || message.includes('forbidden')) {
    return 'No tienes permisos para crear usuarios de tienda.';
  }

  if (emailCode.includes('validation_not_unique') || emailCode.includes('unique')) return 'Este email ya existe.';
  if (passwordCode.includes('min') || message.includes('password')) return 'La contrasena debe tener al menos 8 caracteres.';
  if (message.includes('confirm')) return 'Las contrasenas no coinciden.';
  if (storeCode || message.includes('store')) return 'No se pudo asignar la tienda al usuario.';
  if (roleCode) return 'El rol seleccionado no es valido.';
  if (statusCode) return 'El estado seleccionado no es valido.';
  if (verifiedCode) return 'La plataforma rechazó el campo: verified.';
  if (emailVisibilityCode) return 'La plataforma rechazó el campo: emailVisibility.';
  if (permissionCode || message.includes('permission')) return 'No tienes permisos para crear usuarios de tienda.';

  const rejectedField = Object.keys(data || {}).find((field) => {
    const value = data[field];
    return value && typeof value === 'object';
  });
  if (rejectedField) return `La plataforma rechazó el campo: ${rejectedField}.`;

  return 'No se pudo crear el usuario. Revisa los datos e intentalo otra vez.';
}

export async function getStoreUsersForMaster(client = pb): Promise<MasterStoreUser[]> {
  requireMasterClient(client);
  const stores = await client.collection('stores').getFullList({ fields: 'id', sort: 'id' });
  const users = await Promise.all(stores.map((store) => getAllUsersForStore(client, store.id)));
  return users.flat();
}

export async function getStoreUsersForMasterStoreIds(client: PocketBase, storeIds: string[]): Promise<MasterStoreUser[]> {
  requireMasterClient(client);
  const normalizedIds = [...new Set(storeIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 100);
  if (!normalizedIds.length) return [];
  const users = await Promise.all(normalizedIds.map((storeId) => getAllUsersForStore(client, storeId)));
  return users.flat();
}

export async function getMasterStoreUserSummary(client: PocketBase, storeIds: string[] = []) {
  requireMasterClient(client);
  const normalizedIds = [...new Set(storeIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 100);
  return postMasterStoreUsers<MasterStoreUserSummary>(client, 'summary', { store_ids: normalizedIds });
}

export async function getMasterStoreUserCount(client: PocketBase) {
  const result = await getMasterStoreUserSummary(client);
  return Math.max(0, Number(result.total_users || 0));
}

export async function createStoreUserFromMaster(input: MasterStoreUserInput, client = pb) {
  requireMasterClient(client);
  const payload = getStoreUserPayload(input);
  const result = await postMasterStoreUsers<{ ok: true; user: any }>(client, 'create', payload);
  return mapMasterStoreUser({ ...result.user, store: payload.store_id });
}

export function getMasterStoreUserErrorCode(error: unknown) {
  const candidate = error as any;
  return String(candidate?.data?.error || candidate?.response?.error || candidate?.response?.data?.error || '');
}

export function getMasterStoreUserErrorMessage(error: unknown) {
  const messages: Record<string, string> = {
    unauthorized: 'No tienes permisos para gestionar usuarios.',
    store_not_found: 'No se encontró la tienda.',
    user_not_found: 'No se encontró el usuario en esta tienda.',
    email_exists: 'Este email ya está registrado.',
    invalid_email: 'Escribe un email válido.',
    invalid_password: 'La contraseña no cumple la política de seguridad.',
    invalid_role: 'Selecciona un rol válido.',
    invalid_status: 'Selecciona un estado válido.',
    active_user_limit_reached: 'La tienda alcanzó el límite de usuarios activos de su plan.',
    last_active_admin_required: 'Debe existir al menos un Administrador activo.',
    user_management_unavailable: 'La gestión de usuarios no está disponible temporalmente.',
    user_create_failed: 'No se pudo crear el usuario.',
    user_update_failed: 'No se pudo actualizar el usuario.',
    temporary_password_issue_failed: 'No se pudo generar la contraseña temporal.',
    password_change_failed: 'No se pudo actualizar el acceso.',
    session_revocation_failed: 'No se pudieron cerrar las sesiones.',
    audit_load_failed: 'No se pudo cargar la auditoría.',
    delete_confirmation_mismatch: 'El email de confirmación no coincide con el usuario.',
    delete_reason_required: 'Escribe el motivo interno de la eliminación.',
    user_delete_failed: 'No se pudo eliminar el usuario permanentemente.',
  };
  return messages[getMasterStoreUserErrorCode(error)] || 'No se pudo completar la operación.';
}

export function listMasterStoreUsers(
  storeId: string,
  options: { page?: number; perPage?: number; search?: string; role?: 'all' | StoreUserRole; status?: 'all' | 'active' | 'suspended'; signal?: AbortSignal } = {},
  client = pb,
) {
  requireMasterClient(client);
  return postMasterStoreUsers<{
    ok: true;
    store: { id: string; name: string; slug: string; status: string };
    plan: MasterStoreUserPlan;
    users: MasterStoreUser[];
    pagination: MasterStoreUserPagination;
  }>(client, 'list', {
    store_id: storeId,
    page: options.page || 1,
    per_page: options.perPage || 10,
    search: String(options.search || '').trim(),
    role: options.role || 'all',
    status: options.status || 'all',
  }, options.signal);
}

export function getMasterStoreUserDetail(storeId: string, userId: string, client = pb) {
  requireMasterClient(client);
  return postMasterStoreUsers<{
    ok: true;
    store: { id: string; name: string; slug: string; status: string };
    plan: MasterStoreUserPlan;
    user: MasterStoreUser;
    protection: { last_active_admin: boolean };
  }>(client, 'detail', { store_id: storeId, user_id: userId });
}

export function updateMasterStoreUser(
  storeId: string,
  userId: string,
  input: { email: string; display_name: string; phone?: string; role: StoreUserRole; status: 'active' | 'suspended'; reason: string },
  client = pb,
) {
  requireMasterClient(client);
  return postMasterStoreUsers<{ ok: true; user: MasterStoreUser; plan: MasterStoreUserPlan; sessions_revoked: boolean }>(client, 'update', {
    store_id: storeId,
    user_id: userId,
    email: String(input.email || '').trim().toLowerCase(),
    display_name: String(input.display_name || '').trim(),
    phone: String(input.phone || '').trim(),
    role: input.role,
    status: input.status,
    reason: String(input.reason || '').trim(),
  });
}

export function issueMasterTemporaryPassword(
  storeId: string,
  userId: string,
  password: string,
  reason: string,
  client = pb,
) {
  requireMasterClient(client);
  return postMasterStoreUsers<{
    ok: true;
    user_id: string;
    temporary_password_issued: true;
    must_change_password: true;
    temporary_password_expires_at: string;
    sessions_revoked: true;
  }>(client, 'change-password', {
    store_id: storeId,
    user_id: userId,
    password,
    reason: String(reason || '').trim(),
  });
}

export function revokeMasterStoreUserSessions(storeId: string, userId: string, reason: string, client = pb) {
  requireMasterClient(client);
  return postMasterStoreUsers<{ ok: true; user_id: string; sessions_revoked: true }>(client, 'revoke-sessions', {
    store_id: storeId,
    user_id: userId,
    reason: String(reason || '').trim(),
  });
}

export function deleteMasterStoreUser(
  storeId: string,
  userId: string,
  confirmationEmail: string,
  reason: string,
  client = pb,
) {
  requireMasterClient(client);
  return postMasterStoreUsers<DeleteMasterStoreUserResponse>(client, 'delete', {
    store_id: String(storeId || '').trim(),
    user_id: String(userId || '').trim(),
    confirmation_email: String(confirmationEmail || '').trim().toLowerCase(),
    reason: String(reason || '').trim(),
  });
}

export function getMasterStoreUserAudit(
  storeId: string,
  userId: string,
  options: { page?: number; perPage?: number } = {},
  client = pb,
) {
  requireMasterClient(client);
  return postMasterStoreUsers<{ ok: true; audit: MasterStoreUserAudit[]; pagination: MasterStoreUserPagination }>(client, 'audit', {
    store_id: storeId,
    user_id: userId,
    page: options.page || 1,
    per_page: options.perPage || 20,
  });
}
