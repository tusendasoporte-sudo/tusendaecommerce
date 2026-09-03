import type { AdminStoreContext } from './storeContext.ts';
import {
  resolveStoreCapabilityAccess,
  type StoreCapabilityAccess,
} from './storeCapabilities.ts';
import { getStoreAccessContext, type StoreAccessContext } from './storeTeam.ts';
import { hasStorePermission } from './storeTeamPermissions.ts';

export type SecurityAdminAccess = Readonly<{
  capability: StoreCapabilityAccess;
  storeAccess: StoreAccessContext | null;
  isPrimaryAdmin: boolean;
  canView: boolean;
  canManage: boolean;
  allowed: boolean;
}>;

export function resolveSecurityCapability(store: unknown, optionalCapabilityEnabled = false) {
  return resolveStoreCapabilityAccess(
    store && typeof store === 'object' ? store as Record<string, unknown> : null,
    'security_enabled',
    { enforceExpiration: true, optionalCapabilityEnabled },
  );
}

export async function resolveSecurityAdminAccess(
  adminContext: Pick<AdminStoreContext, 'store' | 'storeId' | 'isMasterSupport'>,
  options: { baseUrl?: string; token: string },
): Promise<SecurityAdminAccess> {
  const storeAccess = await getStoreAccessContext({
    ...options,
    supportStoreId: adminContext.isMasterSupport ? adminContext.storeId : undefined,
  }).catch(() => null);
  const permissionContext = storeAccess
    ? {
        permissions: storeAccess.access.permissions,
        is_primary_admin: storeAccess.access.is_primary_admin,
        blocked_by_plan: storeAccess.access.blocked_by_plan,
      }
    : { permissions: [], blocked_by_plan: true };
  const isPrimaryAdmin = storeAccess?.access.is_primary_admin === true;
  const canView = Boolean(storeAccess && hasStorePermission(permissionContext, 'security.view'));
  const canManage = Boolean(storeAccess && hasStorePermission(permissionContext, 'security.manage'));
  const capability = resolveSecurityCapability(adminContext?.store, canView);

  return Object.freeze({
    capability,
    storeAccess,
    isPrimaryAdmin,
    canView,
    canManage,
    allowed: capability.allowed && canView,
  });
}
