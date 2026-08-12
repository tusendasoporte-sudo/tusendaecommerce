import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STORE_PERMISSION_DEPENDENCIES,
  STORE_PERMISSION_TEMPLATES,
  resolvePermissionDependencies,
} from '../src/lib/storeTeamPermissions.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('M7U2-C3: Marketing y analytics no heredan catálogo o pedidos y read_only es exacto', () => {
  assert.equal(STORE_PERMISSION_DEPENDENCIES['analytics.view'], undefined);
  assert.equal(STORE_PERMISSION_DEPENDENCIES['promotions.manage'], undefined);
  assert.equal(STORE_PERMISSION_DEPENDENCIES['coupons.manage'], undefined);
  assert.deepEqual(resolvePermissionDependencies(['analytics.view']), ['analytics.view']);
  assert.deepEqual(STORE_PERMISSION_TEMPLATES.marketing_promotions.permissions, [
    'promotions.manage',
    'coupons.manage',
    'gifts.manage',
    'raffles.manage',
    'marketing.push.manage',
    'analytics.view',
    'landing_qr.manage',
  ]);
  assert.deepEqual(STORE_PERMISSION_TEMPLATES.read_only.permissions, [
    'catalog.view',
    'orders.view',
    'analytics.view',
  ]);
  assert.equal(STORE_PERMISSION_TEMPLATES.read_only.permissions.includes('security.view'), false);
});

test('M7U2-C3: rutas de analytics usan pageviews agregado y profits exige pedidos', () => {
  const middleware = read('../src/middleware.ts');
  assert.match(middleware, /if \(!normalized\) return \{ all: \['analytics\.view', 'orders\.view', 'catalog\.view'\] \}/);
  assert.match(middleware, /if \(normalized === 'pageviews'\) return \{ any: \['analytics\.view'\] \}/);
  assert.match(middleware, /if \(normalized === 'profits'\) return \{ all: \['orders\.view', 'catalog\.view'\] \}/);
  assert.match(middleware, /\['analytics\.view', 'pageviews'\]/);
  assert.match(middleware, /\['catalog\.expirations\.manage', 'expirations'\]/);
  assert.match(middleware, /accessRule\.all\.every\(\(permission\) => hasStorePermission/);

  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  assert.match(sidebar, /const adminOverviewPath = canShowOperationalOverview \? adminBasePath : adminPageviewsPath/);
  assert.match(sidebar, /const adminOverviewLabel = canShowOperationalOverview \? 'Resumen' : 'Analíticas'/);
  assert.match(sidebar, /canShowOverviewNav && <a class=\{navClass\('overview'\)\} href=\{adminOverviewPath\}/);
  assert.match(sidebar, /const canViewSecurity = canShowModule\('security\.view'\)/);
  assert.match(sidebar, /if \(securityAccess\.allowed && canViewSecurity\) \{[\s\S]*?getStoreSecuritySettingsForToken/);
  assert.match(sidebar, /canShowProductVisibilityNav && <a[\s\S]*?href=\{adminOrganizationPath\}/);
});

test('M7U2-C3: pageviews consume solo el resumen privado sin colecciones crudas', () => {
  const source = read('../src/pages/admin/pageviews.astro');
  assert.match(source, /apiRequest\('\/api\/pz\/store\/analytics\/summary', \{/);
  assert.match(source, /method: 'POST'/);
  assert.match(source, /body: JSON\.stringify\(\{[\s\S]*?range: normalizeRange\(selectedRange\),[\s\S]*?pages_page: pageviewsCurrentPage/);
  assert.match(source, /analyticsSummary = result/);
  assert.match(source, /analyticsSummary\?\.pages\?\.items/);
  assert.doesNotMatch(source, /\/api\/collections\//);
  assert.doesNotMatch(source, /store_analytics_events|manual_coupon_usages|loadAllRecords|settingsRecord|currencies/);
});

test('M7U2-C3: Marketing usa selectores saneados y no solicita historial o catálogo crudo', () => {
  const promos = read('../src/pages/admin/promos.astro');
  assert.match(promos, /apiRequest\('\/api\/pz\/store\/marketing\/selectors', \{/);
  assert.match(promos, /body: JSON\.stringify\(payload\)/);
  assert.match(promos, /if \(search\) payload\.search = search/);
  assert.match(promos, /if \(refs\.length\) payload\.refs = refs/);
  assert.match(promos, /payload\.taxonomy_page = taxonomyPage/);
  assert.match(promos, /payload\.taxonomy_per_page = taxonomyPerPage/);
  assert.match(promos, /async function loadAllMarketingSelectors\(\)[\s\S]*?result\?\.taxonomy\?\.has_more !== true/);
  assert.match(promos, /if \(CAN_MANAGE_PROMOTIONS \|\| CAN_MANAGE_COUPONS\) \{[\s\S]*?await loadAllMarketingSelectors\(\)/);
  assert.match(promos, /scheduleMarketingProductSearch\(promotionProductSearch, renderPromotionProductResults\)/);
  assert.match(promos, /scheduleMarketingProductSearch\(couponProductSearch, renderCouponProductResults\)/);
  assert.match(promos, /await hydrateReferencedMarketingSelectors\(\)/);
  assert.match(promos, /thumbnail_url: String\(item\.thumbnail_url \|\| ''\)/);
  assert.match(promos, /if \(thumbnail\.startsWith\('\/'\)\) return `\$\{POCKETBASE_URL\}\$\{thumbnail\}`/);
  assert.match(promos, /if \(\/\^https:\\\/\\\/\/i\.test\(thumbnail\)\) return thumbnail/);
  assert.match(promos, /if \(!thumbnail\) return '';[\s\S]*?return '';/);
  assert.match(promos, /category: String\(item\.category_ref \|\| ''\)/);
  assert.doesNotMatch(promos, /loadAllRecords\('(products|categories|subcategories|manual_coupon_usages)'/);
  assert.doesNotMatch(promos, /manualCouponUsages|customer_name|order_number|base_price_usd|internal_ref|\bstock\b|\bsku\b/);
  assert.match(promos, /El historial individual está protegido y no se expone desde Marketing/);

  const organization = read('../src/pages/admin/organization.astro');
  assert.match(organization, /if \(CAN_MANAGE_PROMOTIONS\) \{[\s\S]*?categories = await loadMarketingCategories\(\)/);
  assert.match(organization, /apiRequest\('\/api\/pz\/store\/marketing\/selectors', \{/);
  assert.match(organization, /taxonomy_page: taxonomyPage, taxonomy_per_page: 100/);
  assert.match(organization, /result\?\.taxonomy\?\.categories_has_more !== true/);
});

test('M7U2-C3: dashboard redirige perfiles incompletos y oculta Landing QR sin permiso', () => {
  const source = read('../src/pages/admin/index.astro');
  assert.match(source, /const canViewDashboardOrders = hasStorePermission/);
  assert.match(source, /const canViewDashboardCatalog = hasStorePermission/);
  assert.match(source, /if \(!canViewDashboardOrders \|\| !canViewDashboardCatalog\) \{[\s\S]*?return Astro\.redirect\(adminPageviewsPath\)/);
  assert.match(source, /const landingQrAnalyticsVisible = hasStorePermission\(dashboardPermissionContext, 'landing_qr\.manage'\)/);
  assert.match(source, /\{landingQrAnalyticsVisible && <button[^>]+data-analytics-tab="landingqr"/);
  assert.match(source, /apiRequest\('\/api\/pz\/store\/analytics\/summary', \{/);
  assert.match(source, /top_viewed_products/);
  assert.match(source, /landing\?\.top_buttons/);
  assert.doesNotMatch(source, /store_analytics_events|analyticsEvents|visitor_id|session_id/);
  assert.doesNotMatch(source, /loadAllRecords\('settings'/);
});

test('M7U2-C3: Landing QR reserva metadatos para create y usa PATCH granular', () => {
  const source = read('../src/components/admin/LandingQrSettings.astro');
  assert.match(source, /const landingPayload = \{[\s\S]*?landing_qr_enabled:[\s\S]*?landing_qr_links:/);
  assert.match(source, /const basePayload = targetSettingsId[\s\S]*?\? landingPayload[\s\S]*?: \{[\s\S]*?store: CURRENT_STORE_ID,[\s\S]*?active: true,[\s\S]*?store_name: CURRENT_STORE_NAME,[\s\S]*?\.\.\.landingPayload/);
  assert.match(source, /targetSettingsId[\s\S]*?method: 'PATCH', body: JSON\.stringify\(basePayload\)/);
});

test('M7U2-C3: V7E9 usa su permiso propio y limita el historial granular en backend', () => {
  const source = read('../src/pages/admin/expirations.astro');
  assert.match(source, /const expirationPermissionGranted = hasStorePermission\(expirationPermissionContext, 'catalog\.expirations\.manage'\)/);
  assert.match(source, /const canEditExpirationProducts = expirationPermissionGranted/);
  assert.match(source, /const canViewExpirationHistory = expirationPermissionGranted/);
  assert.match(source, /CAN_EDIT_EXPIRATION_PRODUCTS[\s\S]*?Editar producto/);
  assert.match(source, /CAN_VIEW_EXPIRATION_HISTORY[\s\S]*?Historial/);
  assert.match(source, /productHistoryPath\(item\?\.product_id, isVariationUnit \? variation\?\.id : ''\)/);
  assert.doesNotMatch(source, /activityHistoryPath/);
  assert.match(source, /const lastModificationMarkup = CAN_VIEW_EXPIRATION_HISTORY/);
});
