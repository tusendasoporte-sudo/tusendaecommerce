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
  return value === USER_ROLES.STORE_STAFF ? USER_ROLES.STORE_STAFF : USER_ROLES.STORE_ADMIN;
}

function normalizeUserStatus(value: string | undefined) {
  return String(value || 'active').toLowerCase() === 'suspended' ? 'suspended' : 'active';
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

  return {
    email,
    emailVisibility: true,
    verified: true,
    password,
    passwordConfirm: password,
    display_name: displayName,
    phone: String(input.phone || '').trim(),
    role: normalizeStoreUserRole(input.role),
    store,
    status: normalizeUserStatus(input.status),
  };
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

  return client.collection('users').create(payload);
}
