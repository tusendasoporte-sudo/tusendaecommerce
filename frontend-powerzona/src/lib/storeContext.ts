import type PocketBase from 'pocketbase';
import {
  getCurrentUser,
  getCurrentUserStoreId,
  isMasterAdmin,
  isStoreAdmin,
  isStoreStaff,
  isStoreUser,
  type AuthUser,
} from './auth';
import { ACTIVE_STORE_STATUS, type PublicStore } from './stores';
import { pb } from './pocketbase';

export const STORE_CONTEXT_ERRORS = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  MASTER_ADMIN: 'MASTER_ADMIN',
  NOT_STORE_USER: 'NOT_STORE_USER',
  USER_SUSPENDED: 'USER_SUSPENDED',
  MISSING_STORE: 'MISSING_STORE',
  STORE_NOT_FOUND: 'STORE_NOT_FOUND',
  STORE_SUSPENDED: 'STORE_SUSPENDED',
} as const;

export type StoreContextErrorCode = (typeof STORE_CONTEXT_ERRORS)[keyof typeof STORE_CONTEXT_ERRORS];

export class StoreContextError extends Error {
  code: StoreContextErrorCode;

  constructor(code: StoreContextErrorCode, message: string) {
    super(message);
    this.name = 'StoreContextError';
    this.code = code;
  }
}

export type AdminStoreContext = {
  user: AuthUser;
  store: PublicStore;
  storeId: string;
  roleLabel: 'Administrador' | 'Colaborador';
};

function escapePocketBaseValue(value: string) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isSuspended(value: unknown) {
  return String(value || 'active').trim().toLowerCase() === 'suspended';
}

function normalizeStoreId(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

export function getStoreAdminRoleLabel(user: AuthUser | null | undefined) {
  return isStoreAdmin(user) ? 'Administrador' : 'Colaborador';
}

export async function getCurrentStoreForAdmin(client: PocketBase = pb) {
  const user = getCurrentUser(client);
  if (!user) return null;
  if (!isStoreUser(user)) return null;

  const storeId = normalizeStoreId(getCurrentUserStoreId(user));
  if (!storeId) return null;

  try {
    return await client.collection('stores').getOne(storeId) as PublicStore;
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function requireCurrentStoreForAdmin(client: PocketBase = pb): Promise<AdminStoreContext> {
  const user = getCurrentUser(client);

  if (!user) {
    throw new StoreContextError(STORE_CONTEXT_ERRORS.UNAUTHENTICATED, 'Inicia sesion para entrar al panel.');
  }

  if (isSuspended(user.status)) {
    throw new StoreContextError(STORE_CONTEXT_ERRORS.USER_SUSPENDED, 'Tu usuario esta suspendido. Contacta al administrador principal.');
  }

  if (isMasterAdmin(user)) {
    throw new StoreContextError(STORE_CONTEXT_ERRORS.MASTER_ADMIN, 'El panel principal del Master Admin esta en /master.');
  }

  if (!isStoreUser(user)) {
    throw new StoreContextError(STORE_CONTEXT_ERRORS.NOT_STORE_USER, 'Tu usuario no tiene un rol administrativo activo.');
  }

  const storeId = normalizeStoreId(getCurrentUserStoreId(user));
  if (!storeId) {
    throw new StoreContextError(
      STORE_CONTEXT_ERRORS.MISSING_STORE,
      'Tu usuario no tiene una tienda asignada. Contacta al administrador principal.'
    );
  }

  let store: PublicStore | null = null;
  try {
    store = await client.collection('stores').getOne(storeId) as PublicStore;
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }

  if (!store) {
    throw new StoreContextError(
      STORE_CONTEXT_ERRORS.STORE_NOT_FOUND,
      'Tu usuario no tiene una tienda asignada. Contacta al administrador principal.'
    );
  }

  if (String(store.status || '').trim().toLowerCase() !== ACTIVE_STORE_STATUS) {
    throw new StoreContextError(
      STORE_CONTEXT_ERRORS.STORE_SUSPENDED,
      'Esta tienda esta suspendida. Contacta al administrador principal.'
    );
  }

  return {
    user,
    store,
    storeId,
    roleLabel: isStoreStaff(user) ? 'Colaborador' : getStoreAdminRoleLabel(user),
  };
}

export async function requireStoreContext(client: PocketBase = pb) {
  return requireCurrentStoreForAdmin(client);
}

export async function getCurrentStoreIdForAdmin(client: PocketBase = pb) {
  const context = await requireCurrentStoreForAdmin(client);
  return context.storeId;
}

export async function getStoreFilterForAdmin(fieldName = 'store', client: PocketBase = pb) {
  const storeId = await getCurrentStoreIdForAdmin(client);
  return `${fieldName}="${escapePocketBaseValue(storeId)}"`;
}
