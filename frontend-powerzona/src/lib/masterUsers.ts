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
};

export type MasterStoreUserInput = {
  store: string;
  email: string;
  password: string;
  display_name?: string;
  phone?: string;
  role?: string;
  status?: string;
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

function getStoreUserPayload(input: MasterStoreUserInput) {
  const store = String(input.store || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const displayName = String(input.display_name || '').trim();

  if (!store) throw new Error('Selecciona la tienda del usuario.');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un email valido.');
  if (password.length < 8) throw new Error('La contrasena debe tener al menos 8 caracteres.');
  if (!displayName) throw new Error('Escribe el nombre del usuario.');

  const payload: Record<string, any> = {
    email,
    emailVisibility: true,
    password,
    passwordConfirm: password,
    display_name: displayName,
    role: normalizeStoreUserRole(input.role),
    store,
    status: normalizeUserStatus(input.status),
  };

  const phone = String(input.phone || '').trim();
  if (phone) payload.phone = phone;

  return payload;
}

export function getStoreUserCreateErrorMessage(error: any) {
  const data = error?.data?.data || error?.data || {};
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || error?.response?.status || 0);
  const emailCode = String(data?.email?.code || data?.email?.message || '').toLowerCase();
  const passwordCode = String(data?.password?.code || data?.password?.message || '').toLowerCase();
  const storeCode = String(data?.store?.code || data?.store?.message || '').toLowerCase();
  const roleCode = String(data?.role?.code || data?.role?.message || '').toLowerCase();
  const statusCode = String(data?.status?.code || data?.status?.message || '').toLowerCase();
  const verifiedCode = String(data?.verified?.code || data?.verified?.message || '').toLowerCase();
  const emailVisibilityCode = String(data?.emailVisibility?.code || data?.emailVisibility?.message || '').toLowerCase();
  const permissionCode = String(data?.permission?.code || data?.permission?.message || '').toLowerCase();

  if (status === 403 || message.includes('forbidden')) return 'No tienes permisos para crear usuarios de tienda.';

  if (emailCode.includes('validation_not_unique') || emailCode.includes('unique')) return 'Este email ya existe.';
  if (passwordCode.includes('min') || message.includes('password')) return 'La contrasena debe tener al menos 8 caracteres.';
  if (message.includes('confirm')) return 'Las contrasenas no coinciden.';
  if (storeCode || message.includes('store')) return 'No se pudo asignar la tienda al usuario.';
  if (roleCode) return 'El rol seleccionado no es valido.';
  if (statusCode) return 'El estado seleccionado no es valido.';
  if (verifiedCode) return 'PocketBase rechazó el campo: verified.';
  if (emailVisibilityCode) return 'PocketBase rechazó el campo: emailVisibility.';
  if (permissionCode || message.includes('permission')) return 'No tienes permisos para crear usuarios de tienda.';

  const rejectedField = Object.keys(data || {}).find((field) => {
    const value = data[field];
    return value && typeof value === 'object';
  });
  if (rejectedField) return `PocketBase rechazó el campo: ${rejectedField}.`;

  return 'No se pudo crear el usuario. Revisa los datos e intentalo otra vez.';
}

export async function getStoreUsersForMaster(client = pb): Promise<MasterStoreUser[]> {
  requireMasterClient(client);

  const users = await client.collection('users').getFullList({
    fields: 'id,email,display_name,role,store,status,phone,created,updated',
    filter: `role="${USER_ROLES.STORE_ADMIN}" || role="${USER_ROLES.STORE_STAFF}"`,
    sort: 'store,display_name,email',
  });

  return users.map((user: any) => ({
    id: user.id || '',
    email: user.email || '',
    display_name: user.display_name || '',
    role: user.role || '',
    store: Array.isArray(user.store) ? String(user.store[0] || '') : String(user.store || ''),
    status: user.status || '',
    phone: user.phone || '',
    created: user.created || '',
    updated: user.updated || '',
  }));
}

export async function createStoreUserFromMaster(input: MasterStoreUserInput, client = pb) {
  requireMasterClient(client);
  const payload = getStoreUserPayload(input);
  console.debug('Create store user payload', {
    email: payload.email,
    display_name: payload.display_name,
    role: payload.role,
    store: payload.store,
    status: payload.status,
    tienePassword: Boolean(payload.password),
    tienePasswordConfirm: Boolean(payload.passwordConfirm),
  });

  return client.collection('users').create(payload);
}
