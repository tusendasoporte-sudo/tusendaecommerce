import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const mainActivity = read('../../mobile-admin/app/src/main/java/com/tusenda84/admin/MainActivity.java');
const sidebar = read('../src/components/admin/AdminSidebar.astro');
const products = read('../src/pages/admin/products.astro');
const catalog = read('../src/pages/admin/catalog.astro');
const category = read('../src/pages/admin/catalog/category/[id].astro');
const orders = read('../src/pages/admin/orders.astro');
const shipping = read('../src/pages/admin/shipping.astro');
const organization = read('../src/pages/admin/organization.astro');
const gifts = read('../src/pages/admin/gifts.astro');
const promos = read('../src/pages/admin/promos.astro');
const storeSettings = read('../src/pages/admin/store-settings.astro');
const productHistory = read('../src/pages/admin/products/[productId]/history.astro');
const teamActivity = read('../src/pages/admin/team/[userId]/activity.astro');
const accountHistory = read('../src/pages/t/[storeSlug]/admin/account/history.astro');
const visitorDetail = read('../src/pages/t/[storeSlug]/admin/security/visitors/[visitorSessionId].astro');
const notifications = read('../src/pages/admin/notifications.astro');
const pageviews = read('../src/pages/admin/pageviews.astro');
const profits = read('../src/pages/admin/profits.astro');
const raffles = read('../src/pages/admin/promos/raffles.astro');

test('Android consulta primero la jerarquia activa y conserva historial o salida como respaldo', () => {
  assert.match(mainActivity, /ADMIN_BACK_SCRIPT/);
  assert.match(mainActivity, /window\.PZAdminBackNavigation/);
  assert.match(mainActivity, /pz:admin-back-request/);
  assert.match(mainActivity, /webView\.evaluateJavascript\(ADMIN_BACK_SCRIPT/);
  assert.match(mainActivity, /backNavigationPending/);
  assert.match(mainActivity, /if \(webView\.canGoBack\(\)\) \{\s*webView\.goBack\(\);\s*\} else \{\s*finishAfterTransition\(\);/);
});

test('el shell global cierra capas, consulta la vista y usa el padre explicito en ese orden', () => {
  assert.match(sidebar, /window\.PZAdminBackNavigation = Object\.freeze/);
  assert.match(sidebar, /\[data-pz-admin-mobile-back\]/);
  assert.match(sidebar, /\[role="dialog"\], dialog\[open\]/);
  assert.match(sidebar, /pz-admin-dialog-overlay/);
  assert.match(sidebar, /window\.addEventListener\('pz:admin-back-request'/);

  const handler = sidebar.slice(
    sidebar.indexOf('const handleAdminBackNavigation'),
    sidebar.indexOf('window.PZAdminBackNavigation'),
  );
  assert.ok(handler.indexOf('closeSharedAdminDialog()') < handler.indexOf('closeTopVisibleDialog()'));
  assert.ok(handler.indexOf("new CustomEvent('pz:admin-back-request'") < handler.indexOf('followExplicitMobileBack()'));
});

test('productos vuelve por niveles y protege el editor con cambios sin guardar', () => {
  assert.match(products, /function requestCloseProductEditor/);
  assert.match(products, /if \(hasProductChanges\(\)\)/);
  assert.match(products, /getOpenQuickCreatePanel\(\)/);
  assert.match(products, /closeQuickCreatePanelsAndRestoreSelects\(\)/);
  assert.match(products, /closeExtraInfoEditor\(\)/);
  assert.match(products, /window\.addEventListener\('pz:admin-back-request'/);
});

test('catalogo y pedidos regresan de sus vistas internas antes de abandonar la seccion', () => {
  assert.match(catalog, /contentNavigation\?\.type === 'subcategory'/);
  assert.match(catalog, /showCategoryContent\(contentNavigation\.parentCategoryId\)/);
  assert.match(catalog, /closeContentView\(\)/);
  assert.match(category, /function requestCloseCategoryEditPanel/);
  assert.match(category, /if \(hasCategoryChanges\(\)\)/);
  assert.match(orders, /if \(selectedOrder\) \{\s*event\.preventDefault\(\);\s*clearDetail\(\);/);
  assert.match(orders, /setAddProductPanel\(false\)/);
  assert.match(orders, /setEditOrderPanel\(false\)/);
});

test('las rutas de detalle declaran su padre aunque se abran desde enlace directo o notificacion', () => {
  assert.match(orders, /mobileBackHref=\{isOrderDetailPage \? adminOrdersPath : ''\}/);
  assert.match(productHistory, /mobileBackHref=\{returnPath\}/);
  assert.match(teamActivity, /mobileBackHref=\{teamPath\}/);
  assert.match(visitorDetail, /mobileBackHref=\{visitorsBackHref\}/);
  assert.match(notifications, /mobileBackHref=\{adminBasePath\}/);
  assert.match(pageviews, /mobileBackHref=\{adminBasePath\}/);
  assert.match(profits, /mobileBackHref=\{adminBasePath\}/);
  assert.match(raffles, /mobileBackHref=\{adminPromosPath\}/);
  assert.match(accountHistory, /mobileBackHref=\{accountPath\}/);
  assert.match(accountHistory, /mobileBackLabel="Volver a Mi cuenta"/);
});

test('formularios administrativos consumen Atrás y conservan sus guardas de cambios', () => {
  const guardedSources = [
    [shipping, 'requestCloseMainForm', 'hasFormChanges'],
    [organization, 'requestCloseVisualForm', 'visualFormHasChanges'],
    [gifts, 'requestCloseGiftModal', 'hasGiftChanges'],
    [gifts, 'requestCloseGiftsCategoryInlineCard', 'hasGiftsCategoryChanges'],
    [promos, 'requestCloseCouponForm', 'couponFormHasChanges'],
    [promos, 'requestClosePromotionForm', 'promotionFormHasChanges'],
    [category, 'requestCloseCategoryEditPanel', 'hasCategoryChanges'],
  ];

  guardedSources.forEach(([source, closeFunction, dirtyFunction]) => {
    assert.match(source, new RegExp(`function ${closeFunction}`));
    assert.match(source, new RegExp(`${dirtyFunction}\\(\\)`));
    assert.match(source, /Salir sin guardar/);
  });

  [shipping, organization, gifts, promos, category, storeSettings].forEach((source) => {
    assert.match(source, /window\.addEventListener\('pz:admin-back-request'/);
  });
});
