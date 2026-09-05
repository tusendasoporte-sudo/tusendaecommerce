import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const mainActivity = read('../../mobile-admin/app/src/main/java/com/tusenda84/admin/MainActivity.java');
const sidebar = read('../src/components/admin/AdminSidebar.astro');
const products = read('../src/pages/admin/products.astro');
const catalog = read('../src/pages/admin/catalog.astro');
const category = read('../src/pages/admin/catalog/category/[id].astro');
const subcategory = read('../src/pages/admin/catalog/category/[categoryId]/subcategory/[subcategoryId].astro');
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
const visualEditor = read('../src/pages/admin/promos/visuals/[visualId].astro');

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
  assert.match(category, /if \(activeCategoryView !== 'summary'\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?closeCategoryView\(\)/);
  assert.match(subcategory, /href=\{parentCategoryPath\} data-subcategory-back/);
  assert.doesNotMatch(subcategory, /mobileBackHref=\{parentCategoryPath\}/);
  assert.match(sidebar, /pz-admin-mobile-back-link\.is-plain-end/);
  assert.match(subcategory, /function hasChanges\(\)/);
  assert.match(subcategory, /window\.addEventListener\('pz:admin-back-request'/);
  assert.match(orders, /if \(selectedOrder\) \{\s*event\.preventDefault\(\);\s*clearDetail\(\);/);
  assert.match(orders, /setAddProductPanel\(false\)/);
  assert.match(orders, /setEditOrderPanel\(false\)/);
});

test('las rutas de detalle declaran su padre aunque se abran desde enlace directo o notificacion', () => {
  assert.match(orders, /class="action-btn detail-back-link" href=\{adminOrdersPath\}/);
  assert.match(orders, /if \(IS_ORDER_DETAIL_PAGE\) \{\s*event\.preventDefault\(\);\s*window\.location\.assign\(ADMIN_ORDERS_PATH\);\s*return;/);
  assert.match(productHistory, /mobileBackHref=\{returnPath\}/);
  assert.match(teamActivity, /mobileBackHref=\{teamPath\}/);
  assert.match(visitorDetail, /mobileBackHref=\{visitorsBackHref\}/);
  assert.match(visualEditor, /data-back-path=\{adminPromosVisualsPath\}/);
  assert.match(visualEditor, /class="visual-editor-back" href=\{adminPromosVisualsPath\}/);
  assert.match(notifications, /mobileBackHref=\{adminBasePath\}/);
  assert.match(pageviews, /mobileBackHref=\{adminBasePath\}/);
  assert.match(profits, /mobileBackHref=\{adminBasePath\}/);
  assert.doesNotMatch(raffles, /mobileBackLabel="Volver a Promociones"/);
  assert.match(raffles, /const ADMIN_PROMOS_PATH = String\(adminPromosPath/);
  assert.match(raffles, /window\.addEventListener\('pz:admin-back-request'[\s\S]*?window\.location\.assign\(ADMIN_PROMOS_PATH\)/);
  assert.match(accountHistory, /class="pz-account-heading__back" href=\{backPath\}/);
  assert.match(accountHistory, /← \{backLabel\}/);
  assert.match(accountHistory, /backPath = returnToTeam \? getStoreAdminPath\(storeSlug, 'team'\) : accountPath/);
});

test('el detalle de pedidos conserva un solo regreso sin la tarjeta movil duplicada', () => {
  assert.doesNotMatch(orders, /mobileBackHref=|mobileBackLabel=/);
  assert.doesNotMatch(orders, /has-pz-admin-mobile-back|data-pz-admin-mobile-back/);
  assert.equal((orders.match(/class="action-btn detail-back-link"/g) || []).length, 1);
  assert.match(orders, /isOrderDetailPage && <a class="action-btn detail-back-link" href=\{adminOrdersPath\}>← Volver a pedidos<\/a>/);
});

test('Atrás de Android conserva el padre de pedidos sin depender de la tarjeta eliminada', () => {
  const match = orders.match(/window\.addEventListener\('pz:admin-back-request', \(event\) => \{([\s\S]*?)\n      \}\);/);
  assert.ok(match, 'El detalle debe seguir atendiendo el regreso de Android.');

  for (const scenario of [
    { detail: true, selected: null, prevented: false, expected: 'navigate' },
    { detail: true, selected: { id: 'order' }, prevented: false, expected: 'navigate' },
    { detail: true, selected: null, prevented: true, expected: null },
    { detail: false, selected: { id: 'order' }, prevented: false, expected: 'clear' },
    { detail: false, selected: null, prevented: false, expected: null },
  ]) {
    const calls = [];
    const ordersPath = '/t/powerzona/admin/orders';
    const handler = runInNewContext(`(event) => {${match[1]}}`, {
      IS_ORDER_DETAIL_PAGE: scenario.detail,
      ADMIN_ORDERS_PATH: ordersPath,
      window: { location: { assign: (path) => calls.push(['navigate', path]) } },
      addProductPanel: null,
      editOrderPanel: null,
      cleanupOrdersPanel: null,
      selectedOrder: scenario.selected,
      clearDetail: () => calls.push(['clear']),
    });
    let consumed = false;
    handler({
      defaultPrevented: scenario.prevented,
      preventDefault: () => { consumed = true; },
    });
    assert.equal(consumed, Boolean(scenario.expected));
    assert.deepEqual(calls, scenario.expected === 'navigate'
      ? [['navigate', ordersPath]]
      : scenario.expected === 'clear' ? [['clear']] : []);
  }
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
