import PocketBase from 'pocketbase';
import { pb } from './pocketbase';

export const AUTH_COLLECTION = 'users';
export const AUTH_COOKIE_NAME = 'pb_auth';

export const USER_ROLES = {
  MASTER_ADMIN: 'master_admin',
  STORE_ADMIN: 'store_admin',
  STORE_STAFF: 'store_staff',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
  display_name?: string;
  role?: UserRole | string;
  store?: string | string[];
  status?: 'active' | 'suspended' | string;
  collectionName?: string;
  [key: string]: unknown;
};

function getPocketBaseUrl() {
  const pocketbaseUrl = import.meta.env.PUBLIC_POCKETBASE_URL;
  if (!pocketbaseUrl) {
    throw new Error('Falta PUBLIC_POCKETBASE_URL en el archivo .env');
  }
  return pocketbaseUrl;
}

export function createAuthClient() {
  const authPb = new PocketBase(getPocketBaseUrl());
  authPb.autoCancellation(false);
  return authPb;
}

export function loadAuthClientFromCookie(cookieHeader = '') {
  const authPb = createAuthClient();
  authPb.authStore.loadFromCookie(cookieHeader || '', AUTH_COOKIE_NAME);
  return authPb;
}

export async function refreshAuthFromCookie(cookieHeader = '') {
  const authPb = loadAuthClientFromCookie(cookieHeader);

  try {
    if (authPb.authStore.isValid) {
      await authPb.collection(AUTH_COLLECTION).authRefresh();
    }
  } catch (_) {
    authPb.authStore.clear();
  }

  return authPb;
}

export function getCurrentUser(authPb = pb): AuthUser | null {
  const record = authPb.authStore.record as AuthUser | null;
  if (!authPb.authStore.isValid || !record) return null;
  if (record.collectionName && record.collectionName !== AUTH_COLLECTION) return null;
  return record;
}

export function getCurrentUserRole(user: AuthUser | null = getCurrentUser()) {
  return user?.role ? String(user.role) : '';
}

export function isActiveUser(user: AuthUser | null | undefined) {
  return !!user && String(user.status || 'active').toLowerCase() !== 'suspended';
}

export function isMasterAdmin(user: AuthUser | null | undefined) {
  return isActiveUser(user) && getCurrentUserRole(user || null) === USER_ROLES.MASTER_ADMIN;
}

export function isStoreAdmin(user: AuthUser | null | undefined) {
  return isActiveUser(user) && getCurrentUserRole(user || null) === USER_ROLES.STORE_ADMIN;
}

export function isStoreStaff(user: AuthUser | null | undefined) {
  return isActiveUser(user) && getCurrentUserRole(user || null) === USER_ROLES.STORE_STAFF;
}

export function isStoreUser(user: AuthUser | null | undefined) {
  return isStoreAdmin(user) || isStoreStaff(user);
}

export function getUserStoreId(user: AuthUser | null | undefined) {
  const store = user?.store;
  if (Array.isArray(store)) return String(store[0] || '');
  return store ? String(store) : '';
}

export function getCurrentUserStoreId(user: AuthUser | null | undefined = getCurrentUser()) {
  return getUserStoreId(user);
}

export function requireMasterAdmin(user: AuthUser | null = getCurrentUser()) {
  return isMasterAdmin(user) ? user : null;
}

export function requireAdminAuth(user: AuthUser | null = getCurrentUser()) {
  return isMasterAdmin(user) || isStoreUser(user) ? user : null;
}

export function requireStoreAdminAuth(user: AuthUser | null = getCurrentUser()) {
  return isStoreUser(user) ? user : null;
}

export function requireStoreAccess(user: AuthUser | null = getCurrentUser(), storeId?: string) {
  if (!isStoreUser(user)) return false;
  const userStoreId = getUserStoreId(user);
  if (!storeId) return !!userStoreId;
  return userStoreId === storeId;
}

export function getRedirectPathForRole(user: AuthUser | null | undefined) {
  if (isMasterAdmin(user)) return '/master';
  if (isStoreAdmin(user) || isStoreStaff(user)) return '/admin';
  return '/login';
}

export async function loginWithPassword(email: string, password: string) {
  const result = await pb.collection(AUTH_COLLECTION).authWithPassword(email, password);
  return result.record as AuthUser;
}

export function exportAuthCookie(authPb = pb) {
  return authPb.authStore.exportToCookie({
    httpOnly: false,
    sameSite: 'Lax',
    secure: false,
    path: '/',
  }, AUTH_COOKIE_NAME);
}

export function logout(authPb = pb) {
  authPb.authStore.clear();
}
