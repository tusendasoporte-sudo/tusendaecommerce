import type { AdminStoreContext } from './storeContext.ts';
import {
  resolveStoreCapabilityAccess,
  type StoreCapabilityAccess,
} from './storeCapabilities.ts';
import { getStoreAccessContext, type StoreAccessContext } from './storeTeam.ts';
import { hasStorePermission } from './storeTeamPermissions.ts';

export const RAFFLES_PRIVATE_NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
});

export type RafflesAdminAccess = Readonly<{
  capability: StoreCapabilityAccess;
  storeAccess: StoreAccessContext | null;
  isPrimaryAdmin: boolean;
  hasPermission: boolean;
  allowed: boolean;
}>;

export class RafflesAccessError extends Error {
  readonly status = 403;
  readonly code = 'raffles_access_denied';

  constructor() {
    super('Rifas no está disponible para este acceso.');
    this.name = 'RafflesAccessError';
  }
}

export function resolveRafflesCapability(store: unknown) {
  return resolveStoreCapabilityAccess(
    store && typeof store === 'object' ? store as Record<string, unknown> : null,
    'raffles_enabled',
    { enforceExpiration: true },
  );
}

export async function resolveRafflesAdminAccess(
  adminContext: Pick<AdminStoreContext, 'store' | 'storeId' | 'isMasterSupport'>,
  options: { baseUrl?: string; token: string },
): Promise<RafflesAdminAccess> {
  const capability = resolveRafflesCapability(adminContext?.store);
  const storeAccess = await getStoreAccessContext({
    ...options,
    supportStoreId: adminContext.isMasterSupport ? adminContext.storeId : undefined,
  }).catch(() => null);
  const isPrimaryAdmin = storeAccess?.access.is_primary_admin === true;
  const hasPermission = Boolean(storeAccess && hasStorePermission({
    permissions: storeAccess.access.permissions,
    is_primary_admin: storeAccess.access.is_primary_admin,
    blocked_by_plan: storeAccess.access.blocked_by_plan,
  }, 'raffles.manage'));

  return Object.freeze({
    capability,
    storeAccess,
    isPrimaryAdmin,
    hasPermission,
    allowed: capability.allowed && hasPermission,
  });
}

export async function requireRafflesAdminAccess(
  adminContext: Pick<AdminStoreContext, 'store' | 'storeId' | 'isMasterSupport'>,
  options: { baseUrl?: string; token: string },
) {
  const access = await resolveRafflesAdminAccess(adminContext, options);
  if (!access.allowed) throw new RafflesAccessError();
  return access;
}

export function rafflesStoreHomePath(store: { slug?: unknown } | null | undefined) {
  const slug = String(store?.slug || '').trim().toLowerCase();
  return slug ? `/t/${encodeURIComponent(slug)}` : '/';
}

export function rafflesUnavailableRedirectResponse(
  store: { slug?: unknown } | null | undefined,
) {
  return new Response(null, {
    status: 302,
    headers: {
      ...RAFFLES_PRIVATE_NO_STORE_HEADERS,
      Location: rafflesStoreHomePath(store),
    },
  });
}

export function rafflesPublicUnavailableResponse() {
  return new Response(JSON.stringify({
    ok: false,
    message: 'No se encontró la rifa.',
  }), {
    status: 404,
    headers: {
      ...RAFFLES_PRIVATE_NO_STORE_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}
