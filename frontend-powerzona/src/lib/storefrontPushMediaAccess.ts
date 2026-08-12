import type { AdminStoreContext } from './storeContext.ts';
import { resolveStoreCapabilityAccess } from './storeCapabilities.ts';
import { getStoreAccessContext, type StoreAccessContext } from './storeTeam.ts';
import { hasStorePermission } from './storeTeamPermissions.ts';

export class StorefrontPushMediaAccessError extends Error {
  readonly status = 403;
  readonly code = 'push_media_access_denied';

  constructor() {
    super('Los medios de campañas push no están disponibles para este acceso.');
    this.name = 'StorefrontPushMediaAccessError';
  }
}

export async function resolveStorefrontPushMediaAccess(
  adminContext: Pick<AdminStoreContext, 'store' | 'storeId' | 'isMasterSupport'>,
  options: { baseUrl?: string; token: string },
) {
  const capability = resolveStoreCapabilityAccess(
    adminContext?.store && typeof adminContext.store === 'object'
      ? adminContext.store as Record<string, unknown>
      : null,
    'push_campaigns_enabled',
    { enforceExpiration: true },
  );
  const storeAccess: StoreAccessContext | null = await getStoreAccessContext({
    ...options,
    supportStoreId: adminContext.isMasterSupport ? adminContext.storeId : undefined,
  }).catch(() => null);
  const permissionAllowed = Boolean(storeAccess && hasStorePermission({
    permissions: storeAccess.access.permissions,
    is_primary_admin: storeAccess.access.is_primary_admin,
    blocked_by_plan: storeAccess.access.blocked_by_plan,
  }, 'marketing.push.manage'));
  return Object.freeze({
    capability,
    storeAccess,
    allowed: capability.allowed && permissionAllowed,
  });
}

export async function requireStorefrontPushMediaAccess(
  adminContext: Pick<AdminStoreContext, 'store' | 'storeId' | 'isMasterSupport'>,
  options: { baseUrl?: string; token: string },
) {
  const access = await resolveStorefrontPushMediaAccess(adminContext, options);
  if (!access.allowed) throw new StorefrontPushMediaAccessError();
  return access;
}
