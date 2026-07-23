import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('M7U2: Productos deriva flags SSR y filtra campos antes de cualquier mutacion', () => {
  const source = read('../src/pages/admin/products.astro');

  for (const permission of [
    'catalog.products.create',
    'catalog.products.edit',
    'catalog.products.delete',
    'catalog.products.visibility',
    'catalog.products.price',
    'catalog.products.stock',
    'catalog.products.images',
    'catalog.categories.manage',
    'catalog.expirations.manage',
  ]) {
    assert.ok(source.includes(`hasStorePermission(productPermissionContext, '${permission}')`), permission);
  }

  const inlineVars = [...source.matchAll(/<script define:vars=\{\{([\s\S]*?)\}\}>/g)];
  assert.ok(inlineVars.length > 0);
  assert.ok(inlineVars.every((match) => !match[1].includes('adminAuthToken')));
  assert.equal(source.includes('const ADMIN_AUTH_TOKEN'), false);

  assert.match(source, /function filterProductMutationBodyForAccess\(body, \{ create = false \} = \{\}\)/);
  assert.match(source, /function assertProductMutationAllowed\(path, options = \{\}\)/);
  assert.match(source, /assertProductMutationAllowed\(path, options\);[\s\S]*?fetch\(`/);
  assert.match(source, /return filterProductMutationBodyForAccess\(formData, \{ create: !isEditing \}\)/);
  assert.match(source, /CAN_MANAGE_PRODUCT_VISIBILITY \? \(effectiveState\.expired[\s\S]*?js-product-expiration-locked[\s\S]*?js-product-toggle/);
  assert.doesNotMatch(source, /<button class="mini-btn pz-admin-action-btn js-product-toggle"/);
  assert.match(source, /CAN_MANAGE_PRODUCT_STOCK && !variationMode \? `<button class="pz-admin-dropdown-item danger-action js-product-soldout"/);
  assert.match(source, /CAN_DELETE_PRODUCTS \? `<button class="pz-admin-dropdown-item danger-action js-product-delete"/);
  assert.match(source, /mobileActionLabel=\{canCreateProducts \? 'Nuevo producto' : ''\}/);
});

test('M7U2: Pedidos separa permisos por accion y usa transicion atomica', () => {
  const source = read('../src/pages/admin/orders.astro');

  for (const permission of [
    'orders.status.manage',
    'orders.items.manage',
    'orders.price_adjustment',
    'orders.cancel_delete',
    'orders.contact_customer',
    'reviews.manage',
    'shipping.manage',
  ]) {
    assert.ok(source.includes(`hasStorePermission(orderPermissionContext, '${permission}')`), permission);
  }

  const inlineVars = [...source.matchAll(/<script define:vars=\{\{([\s\S]*?)\}\}>/g)];
  assert.ok(inlineVars.length > 0);
  assert.ok(inlineVars.every((match) => !match[1].includes('adminAuthToken')));
  assert.equal(source.includes('const ADMIN_AUTH_TOKEN'), false);

  assert.match(source, /function orderPatchFieldAllowed\(key\)/);
  assert.match(source, /function filterOrderPatchPayload\(payload\)/);
  assert.match(source, /function assertOrderMutationAllowed\(path, options = \{\}\)/);
  assert.match(source, /assertOrderMutationAllowed\(path, options\);[\s\S]*?fetch\(`/);
  assert.match(source, /\/api\/pz\/admin\/orders\/\$\{selectedOrder\.id\}\/transition/);
  assert.match(source, /body: JSON\.stringify\(\{ status: nextStatus \}\)/);
  assert.match(source, /\/api\/pz\/admin\/orders\/\$\{selectedOrder\.id\}\/receipt-token/);
  assert.match(source, /\/api\/pz\/admin\/orders\/\$\{selectedOrder\.id\}\/review-token/);
  assert.match(source, /apiRequest\(`\/api\/pz\/admin\/orders\/\$\{orderId\}`, \{ method: 'DELETE' \}\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{ (?:receipt|review)_token:/);
  assert.doesNotMatch(source, /apiRequest\(`\/api\/collections\/orders\/records\/\$\{orderId\}`, \{ method: 'DELETE'/);
  assert.match(source, /const quantityDisabled = !CAN_MANAGE_ORDER_ITEMS \|\| productsLocked \|\| isGiftItem/);
  assert.match(source, /CAN_ADJUST_ORDER_PRICE && !isGiftItem \? `<button class="btn btn-secondary adjust-price-btn"/);
  assert.match(source, /CAN_MANAGE_ORDER_ITEMS \? `<button class="btn btn-danger delete-item-btn"/);
});

test('M7U2: bottom-nav mantiene cuatro destinos autorizados por perfil', () => {
  const source = read('../src/components/admin/AdminSidebar.astro');
  const start = source.indexOf('<nav class="pz-admin-mobile-bottom-nav"');
  const end = source.indexOf('</nav>', start);
  const bottom = source.slice(start, end);

  assert.match(source, /const mobileBottomCandidates: Array<MobileBottomItem \| false> = \[/);
  for (const gate of [
    'canShowOverviewNav', 'canShowOrdersNav', 'canShowShippingNav', 'canShowSettingsGroup',
    'canShowCatalogNav', 'canShowGiftsNav', 'canShowMarketingGroup', 'canShowSecurityNav',
  ]) assert.match(source, new RegExp(`${gate} && \\{`));
  assert.match(source, /const mobileBottomItems = mobileBottomCandidates[\s\S]*?\.slice\(0, 4\)/);
  assert.match(bottom, /mobileBottomItems\.map\(\(item\) => <a/);
  assert.match(bottom, /href=\{item\.href\}/);
  assert.equal(/data-[^=]*(permission|token)/i.test(bottom), false);
});

test('M7U2: Catalogo separa mutaciones de categorias de crear y editar productos', () => {
  for (const relative of [
    '../src/pages/admin/catalog.astro',
    '../src/pages/admin/catalog/category/[id].astro',
  ]) {
    const source = read(relative);
    for (const permission of [
      'catalog.categories.manage',
      'catalog.products.create',
      'catalog.products.edit',
    ]) {
      assert.ok(source.includes(`'${permission}'`), `${relative}: ${permission}`);
    }
    const inlineVars = [...source.matchAll(/<script define:vars=\{\{([\s\S]*?)\}\}>/g)];
    assert.ok(inlineVars.length > 0);
    assert.ok(inlineVars.every((match) => !match[1].includes('adminAuthToken')));
    assert.equal(source.includes('const ADMIN_AUTH_TOKEN'), false);
    assert.match(source, /CAN_MANAGE_CATEGORIES = canManageCategories === true/);
    assert.match(source, /CAN_CREATE_PRODUCTS = canCreateProducts === true/);
    assert.match(source, /CAN_EDIT_PRODUCTS = canEditProducts === true/);
    assert.match(source, /assert(?:Catalog|Category)MutationAllowed\(path, options\);[\s\S]*?fetch\(`/);
  }

  const catalog = read('../src/pages/admin/catalog.astro');
  assert.match(catalog, /mobileActionLabel=\{canManageCategories \? 'Nueva categoria' : ''\}/);
  assert.match(catalog, /CAN_CREATE_PRODUCTS \? '<button class="mini-btn primary js-product-create-soon"/);
  assert.match(catalog, /CAN_EDIT_PRODUCTS \? '<button class="mini-btn js-product-edit-soon"/);

  const category = read('../src/pages/admin/catalog/category/[id].astro');
  assert.match(category, /!canManageCategories && 'permission-hidden'/);
  assert.match(category, /!canCreateProducts && 'permission-hidden'/);
  assert.match(category, /CAN_EDIT_PRODUCTS \? `<button class="pz-admin-btn pz-admin-btn--ghost pz-admin-btn--compact js-product-edit"/);
});

test('M7U2: Promos aisla promociones, cupones, rifas y destacados', () => {
  const source = read('../src/pages/admin/promos.astro');
  for (const permission of [
    'promotions.manage',
    'coupons.manage',
    'raffles.manage',
    'catalog.products.visibility',
  ]) {
    assert.ok(source.includes(`hasStorePermission(marketingPermissionContext, '${permission}')`), permission);
  }

  const inlineVars = [...source.matchAll(/<script define:vars=\{\{([\s\S]*?)\}\}>/g)];
  assert.ok(inlineVars.length > 0);
  assert.ok(inlineVars.every((match) => !match[1].includes('adminAuthToken')));
  assert.equal(source.includes('const ADMIN_AUTH_TOKEN'), false);
  assert.match(source, /function assertMarketingMutationAllowed\(path, options = \{\}\)/);
  assert.match(source, /assertMarketingMutationAllowed\(path, options\);[\s\S]*?fetch\(`/);
  assert.match(source, /apiRequest\('\/api\/pz\/store\/marketing\/selectors',[\s\S]*?body: JSON\.stringify\(payload\)/);
  assert.match(source, /scheduleMarketingProductSearch\(promotionProductSearch, renderPromotionProductResults\)/);
  assert.match(source, /await hydrateReferencedMarketingSelectors\(\)/);
  assert.match(source, /if \(CAN_MANAGE_PROMOTIONS\) try \{[\s\S]*?loadAllRecords\('automatic_promotions'/);
  assert.match(source, /if \(CAN_MANAGE_COUPONS\) try \{[\s\S]*?loadAllRecords\('manual_coupons'/);
  assert.doesNotMatch(source, /loadAllRecords\('(products|categories|subcategories|manual_coupon_usages)'/);
  assert.doesNotMatch(source, /base_price_usd|internal_ref|\bstock\b|\bsku\b|customer_name|order_number/);
  assert.match(source, /canManageRaffles && <a class="tab-btn"/);
  assert.match(source, /!canManagePromotions && 'permission-hidden'/);
});

test('M7U2: Organizacion no mezcla promociones con visibilidad de productos', () => {
  const source = read('../src/pages/admin/organization.astro');
  assert.ok(source.includes("hasStorePermission(organizationPermissionContext, 'promotions.manage')"));
  assert.ok(source.includes("hasStorePermission(organizationPermissionContext, 'catalog.products.visibility')"));
  const inlineVars = [...source.matchAll(/<script define:vars=\{\{([\s\S]*?)\}\}>/g)];
  assert.ok(inlineVars.length > 0);
  assert.ok(inlineVars.every((match) => !match[1].includes('adminAuthToken')));
  assert.equal(source.includes('const ADMIN_AUTH_TOKEN'), false);
  assert.match(source, /function assertOrganizationMutationAllowed\(path, options = \{\}\)/);
  assert.match(source, /assertOrganizationMutationAllowed\(path, options\);[\s\S]*?fetch\(`/);
  assert.match(source, /products = CAN_MANAGE_PRODUCT_VISIBILITY[\s\S]*?loadAllRecords\('products'/);
  assert.match(source, /if \(CAN_MANAGE_PROMOTIONS\) \{[\s\S]*?categories = await loadMarketingCategories\(\)/);
  assert.match(source, /body: JSON\.stringify\(\{ taxonomy_page: taxonomyPage, taxonomy_per_page: 100 \}\)/);
  assert.match(source, /result\?\.taxonomy\?\.categories_has_more !== true/);
  assert.match(source, /if \(CAN_MANAGE_PROMOTIONS\) \{[\s\S]*?loadAllRecords\('store_visual_items'/);
  assert.match(source, /!canManageProductVisibility && 'permission-hidden'/);
  assert.match(source, /!canManagePromotions && 'permission-hidden'/);
});

test('M7U2: Ajustes separa settings, reviews y landing y genera review token en backend', () => {
  const source = read('../src/pages/admin/store-settings.astro');
  assert.ok(source.includes("'store.settings.manage'"));
  assert.ok(source.includes("'reviews.manage'"));
  assert.ok(source.includes("'landing_qr.manage'"));
  assert.match(source, /if \(canManageSettings !== true\) return;/);
  assert.match(source, /if \(canManageReviews !== true\) return;/);
  assert.match(source, /\{canManageLanding && <LandingQrSettings/);
  const inlineVars = [...source.matchAll(/<script define:vars=\{\{([\s\S]*?)\}\}>/g)];
  assert.ok(inlineVars.every((match) => !match[1].includes('adminAuthToken')));
  assert.match(source, /\/api\/pz\/admin\/orders\/' \+ encodeURIComponent\(order\.id\) \+ '\/review-token'/);
  assert.match(source, /method: 'POST',[\s\S]*?body: JSON\.stringify\(\{\}\)/);
  assert.doesNotMatch(source, /generateReviewToken/);
  assert.doesNotMatch(source, /patchOrder\(order\.id, \{ review_token:/);

  const reviewsScript = source.slice(source.indexOf('if (canManageReviews !== true) return;'), source.indexOf('<script define:vars={{ pocketbaseUrl, currentStoreId, canManageSettings }}', source.indexOf('if (canManageReviews !== true) return;')));
  assert.equal(reviewsScript.includes("/api/collections/currencies/records"), false);
  assert.equal(reviewsScript.includes('payload.default_currency'), false);
});

test('M7U2: Resumen no muta analitica y no consulta reseñas sin permiso', () => {
  const source = read('../src/pages/admin/index.astro');
  assert.ok(source.includes("hasStorePermission(\n  dashboardPermissionContext,\n  'reviews.manage',"));
  assert.match(source, /if \(!canViewDashboardOrders \|\| !canViewDashboardCatalog\) \{[\s\S]*?Astro\.redirect\(adminPageviewsPath\)/);
  assert.match(source, /\{landingQrAnalyticsVisible && <button[^>]+data-analytics-tab="landingqr"/);
  assert.doesNotMatch(source, /loadAllRecords\('settings'/);
  assert.match(source, /\{reviewsFeatureVisible && <section class="dashboard-block" aria-labelledby="dashboard-reviews-title">/);
  assert.match(source, /if \(ratingSummaryGrid\) await loadRatingSupportData\(\);/);
  assert.doesNotMatch(source, /deleteOldAnalyticsEvents|runAnalyticsCleanupIfNeeded|analytics_cleanup_last_run_at/);
  assert.doesNotMatch(source, /store_analytics_events\/records\/\$\{encodeURIComponent\(id\)\}[\s\S]{0,120}method: 'DELETE'/);
});
