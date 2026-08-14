import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  resolveStorefrontPushAdminAccess,
  STOREFRONT_PUSH_DAILY_LIMIT,
  STOREFRONT_PUSH_MONTHLY_LIMIT,
} from '../src/lib/storefrontPushAdmin.ts';

const premiumStore = {
  id: 'store0000000001',
  plan: 'premium',
  plan_is_permanent: true,
  plan_expires_at: '',
  status: 'active',
};
const freeStore = { ...premiumStore, plan: 'free', plan_is_permanent: false };

function access(permissions, primary = false, blockedByPlan = false) {
  return {
    access: {
      permissions,
      is_primary_admin: primary,
      blocked_by_plan: blockedByPlan,
    },
  };
}

test('C08 exige simultáneamente Premium y marketing.push.manage', async () => {
  const allowed = await resolveStorefrontPushAdminAccess(
    { store: premiumStore, storeId: premiumStore.id, isMasterSupport: false },
    { token: 'token', storeAccess: access(['marketing.push.manage']) },
  );
  assert.equal(allowed.capability.allowed, true);
  assert.equal(allowed.hasPermission, true);
  assert.equal(allowed.allowed, true);

  const missingPermission = await resolveStorefrontPushAdminAccess(
    { store: premiumStore, storeId: premiumStore.id, isMasterSupport: false },
    { token: 'token', storeAccess: access([]) },
  );
  assert.equal(missingPermission.allowed, false);

  const missingPlan = await resolveStorefrontPushAdminAccess(
    { store: freeStore, storeId: freeStore.id, isMasterSupport: false },
    { token: 'token', storeAccess: access(['marketing.push.manage'], true, true) },
  );
  assert.equal(missingPlan.capability.allowed, false);
  assert.equal(missingPlan.allowed, false);
});

test('Master soporte respeta Premium pero no depende de un permiso de colaborador', async () => {
  const premium = await resolveStorefrontPushAdminAccess(
    { store: premiumStore, storeId: premiumStore.id, isMasterSupport: true },
    { token: 'token', storeAccess: access([]) },
  );
  assert.equal(premium.isPrimaryAdmin, true);
  assert.equal(premium.hasPermission, true);
  assert.equal(premium.allowed, true);

  const free = await resolveStorefrontPushAdminAccess(
    { store: freeStore, storeId: freeStore.id, isMasterSupport: true },
    { token: 'token', storeAccess: access([]) },
  );
  assert.equal(free.allowed, false);
});

test('middleware, rutas y sidebar aplican la puerta de C08 sin abrir C09', () => {
  const middleware = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');
  const sidebar = readFileSync(new URL('../src/components/admin/AdminSidebar.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/push-campaigns.astro', import.meta.url), 'utf8');
  const tenantPage = readFileSync(new URL('../src/pages/t/[storeSlug]/admin/push-campaigns.astro', import.meta.url), 'utf8');

  assert.match(middleware, /normalized === 'push-campaigns'.*'marketing\.push\.manage'/);
  assert.match(middleware, /primaryAdminCanReachPushCampaignsGate/);
  assert.match(middleware, /\['marketing\.push\.manage', 'push-campaigns'\]/);
  assert.match(sidebar, /Campañas push/);
  assert.match(sidebar, /push_campaigns_enabled/);
  assert.match(sidebar, /marketing\.push\.manage/);
  assert.match(page, /resolveStorefrontPushAdminAccess/);
  assert.match(page, /StoreCapabilityGate/);
  assert.match(page, /showPremiumGate/);
  assert.match(tenantPage, /AdminPushCampaigns/);
  assert.doesNotMatch(page, /push_daily_stats|push_events|storefrontPushMetrics/);
});

test('la interfaz conserva las cuotas permanentes y no serializa el token en su componente', () => {
  const view = readFileSync(new URL('../src/components/admin/PushCampaignsView.astro', import.meta.url), 'utf8');
  assert.equal(STOREFRONT_PUSH_DAILY_LIMIT, 10);
  assert.equal(STOREFRONT_PUSH_MONTHLY_LIMIT, 310);
  assert.match(view, /10 diarios y 310 mensuales/);
  assert.match(view, /Firebase aceptado no significa entregado o leído/);
  assert.match(view, /readStorefrontPushAdminAuthToken\(document\.cookie\)/);
  assert.doesNotMatch(view, /data-auth-token|data-fid|google-services\.json|PZ_PUSH_RELAY_SECRET/);
});
