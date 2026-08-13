import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const astroConfig = read('../astro.config.mjs');
const middleware = read('../src/middleware.ts');
const sidebar = read('../src/components/admin/AdminSidebar.astro');
const dashboard = read('../src/pages/admin/index.astro');
const tenantDashboard = read('../src/pages/t/[storeSlug]/admin.astro');
const orders = read('../src/pages/admin/orders.astro');
const shipping = read('../src/pages/admin/shipping.astro');
const products = read('../src/pages/admin/products.astro');
const catalog = read('../src/pages/admin/catalog.astro');
const storeSettings = read('../src/pages/admin/store-settings.astro');
const gifts = read('../src/pages/admin/gifts.astro');
const promos = read('../src/pages/admin/promos.astro');
const organization = read('../src/pages/admin/organization.astro');
const team = read('../src/pages/admin/team.astro');
const tenantAccount = read('../src/pages/t/[storeSlug]/admin/account.astro');
const tenantSecurity = read('../src/pages/t/[storeSlug]/admin/security.astro');

test('el middleware comparte autenticacion, tienda y permisos durante la misma peticion', () => {
  assert.match(middleware, /context\.locals\.adminAuthPb = authPb/);
  assert.match(middleware, /context\.locals\.adminContext = adminContext/);
  assert.match(middleware, /context\.locals\.storeAccessContext = storeAccess/);
  assert.match(middleware, /Server-Timing/);
  assert.match(middleware, /pz-admin-total/);

  [dashboard, orders, shipping, products, catalog, storeSettings, gifts, promos, organization, team].forEach((source) => {
    assert.match(source, /Astro\.locals\.adminAuthPb/);
    assert.match(source, /Astro\.locals\.adminContext/);
    assert.match(source, /Astro\.locals\.storeAccessContext/);
  });

  [dashboard, orders, shipping].forEach((source) => {
    assert.match(source, /storeAccessContext=\{storeAccessContext\}/);
  });

  [tenantDashboard, tenantAccount, tenantSecurity].forEach((source) => {
    assert.match(source, /Astro\.locals\.adminAuthPb/);
    assert.match(source, /Astro\.locals\.adminContext/);
  });

  assert.match(sidebar, /Astro\.locals\.storeAccessContext/);
});

test('el panel precarga destinos administrativos seguros sin convertir formularios en SPA', () => {
  assert.match(astroConfig, /prefetchAll:\s*false/);
  assert.match(sidebar, /const fastAdminNavigationPaths = new Set/);
  assert.match(sidebar, /adminOverviewPath/);
  assert.match(sidebar, /adminCatalogPath/);
  assert.match(sidebar, /adminProductsPath/);
  assert.match(sidebar, /adminOrdersPath/);
  assert.match(sidebar, /adminStoreSettingsPath/);
  assert.match(sidebar, /adminGiftsPath/);
  assert.match(sidebar, /adminShippingPath/);
  assert.match(sidebar, /adminPromosPath/);
  assert.match(sidebar, /adminSecurityPath/);
  assert.match(sidebar, /adminAccountPath/);
  assert.match(sidebar, /adminTeamPath/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminOverviewPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminCatalogPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminProductsPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminOrdersPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminGiftsPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminShippingPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminSecurityPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminAccountPath\)\}/);
  assert.match(sidebar, /data-astro-prefetch=\{fastPrefetchStrategy\(adminTeamPath\)\}/);
  assert.match(sidebar, /mobile \? 'tap' : 'hover'/);
  assert.doesNotMatch(sidebar, /ClientRouter/);
});
