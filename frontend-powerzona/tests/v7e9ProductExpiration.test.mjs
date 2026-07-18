import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  filterPublicCatalogByExpirationAccess,
  getExpirationDaysLeft,
} from '../src/lib/productExpirationCore.js';
import {
  getNotificationVisualPriority,
  isV7E9RedNotification,
} from '../src/lib/adminNotifications.js';

function compileInlineFunction(source, name, parameters) {
  const start = source.indexOf(`function ${name}(`);
  const openingBrace = source.indexOf('{', start);
  assert.ok(start >= 0 && openingBrace > start, `No se encontró ${name}`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return new Function(...parameters, source.slice(openingBrace + 1, index));
  }
  throw new Error(`No se pudo aislar ${name}`);
}

test('V7E9: fecha civil Habana bloquea desde el propio día', () => {
  assert.equal(getExpirationDaysLeft('2026-08-20', '2026-08-20T03:59:59.999Z'), 1);
  assert.equal(getExpirationDaysLeft('2026-08-20', '2026-08-20T04:00:00.000Z'), 0);
});

test('V7E9: catálogo Premium filtra fecha general y conserva Básico', () => {
  const products = [{ id: 'one', expiration_date: '2026-07-17' }];
  assert.equal(filterPublicCatalogByExpirationAccess(products, [], true, '2026-07-17T12:00:00Z').products.length, 0);
  assert.equal(filterPublicCatalogByExpirationAccess(products, [], false, '2026-07-17T12:00:00Z').products.length, 1);
});

test('V7E9: filtra una variación y bloquea el producto si todas las vendibles vencieron', () => {
  const product = { id: 'p1', has_variations: true, track_stock: true };
  const mixed = [
    { id: 'v1', product: 'p1', active: true, price_usd: 10, stock: 1, expiration_date: '2026-07-17' },
    { id: 'v2', product: 'p1', active: true, price_usd: 10, stock: 1, expiration_date: '' },
  ];
  const mixedResult = filterPublicCatalogByExpirationAccess([product], mixed, true, '2026-07-17T12:00:00Z');
  assert.deepEqual(mixedResult.variations.map((item) => item.id), ['v2']);
  const allExpired = mixed.map((item) => ({ ...item, expiration_date: '2026-07-17' }));
  assert.equal(filterPublicCatalogByExpirationAccess([product], allExpired, true, '2026-07-17T12:00:00Z').products.length, 0);
});

test('V7E9: validación viva cubre producto y variación sin revelar vencimiento', () => {
  const validator = readFileSync(new URL('../public/cart-live-validator.js', import.meta.url), 'utf8');
  assert.match(validator, /America\/Havana/);
  assert.match(validator, /expirationDateExpired\(product\.expiration_date\)/);
  assert.match(validator, /expirationDateExpired\(variation\.expiration_date\)/);
  assert.equal(validator.includes('vencido por fecha'), false);
});

test('V7E9-C2: el Resumen usa endpoint privado, carga diferida y páginas de 5', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  assert.match(dashboard, /resolveStoreCapabilityAccess\(adminContext\.store, 'product_expiration_tools_enabled'\)/);
  assert.match(dashboard, /\/api\/pz\/admin\/product-expirations/);
  assert.match(dashboard, /new IntersectionObserver/);
  assert.match(dashboard, /JSON\.stringify\(\{ view, window_days: windowDays, page, page_size: pageSize \}\)/);
  assert.match(dashboard, /postExpirationQuery\(selectedExpirationView, selectedExpirationRange, selectedExpirationPage, 5\)/);
  assert.match(dashboard, /href="\$\{escapeHtml\(`\$\{ADMIN_EXPIRATIONS_PATH\}\?view=expired`\)\}"[^>]*>Ver vencidos<\/a>/);
  assert.equal(dashboard.includes('href="#productos-proximos-vencer"'), false);
  assert.equal(dashboard.includes('.items.slice(0, 5)'), false);
  assert.match(dashboard, /Ver todos los vencimientos/);
  assert.match(dashboard, /id="expiration-pagination"/);
  assert.match(dashboard, /aria-current="page"/);
  assert.match(dashboard, /Mostrando \$\{rangeStart\}–\$\{rangeEnd\} de \$\{totalItems\}/);
  assert.match(dashboard, /selectedExpirationPage = 1/);
  assert.equal(dashboard.includes('getProductsNearExpiration'), false);
});

test('V7E9-C2: página independiente usa gate SSR, búsqueda segura y paginación de 10', () => {
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL('../src/pages/t/[storeSlug]/admin/expirations.astro', import.meta.url), 'utf8');
  assert.match(wrapper, /import AdminExpirations from '\.\.\/\.\.\/\.\.\/admin\/expirations\.astro'/);
  assert.match(page, /resolveStoreCapabilityAccess\(adminContext\.store, 'product_expiration_tools_enabled'\)/);
  assert.match(page, /expirationToolsEnabled \? \(/);
  assert.match(page, /if \(expirationToolsEnabled !== true\) return/);
  assert.match(page, /\/api\/pz\/admin\/product-expirations/);
  assert.match(page, /JSON\.stringify\(\{ view, window_days: windowDays, page, page_size: 10, query \}\)/);
  assert.match(page, /Mostrando \$\{rangeStart\}–\$\{rangeEnd\} de \$\{total\}/);
  assert.match(page, /Buscar producto o variación/);
  assert.match(page, /maxlength="80"/);
  assert.match(page, /Editar producto/);
  assert.match(page, /← Volver al Resumen/);
  assert.match(page, /recordIdPattern = \/\^\[a-z0-9\]\{15\}\$\//);
  assert.match(page, /overflow-x: hidden/);
  assert.match(page, /aria-current="page"/);
  assert.equal(page.includes('Registro privado de vencimiento'), false);
  assert.equal(page.includes('<img'), false);
});

test('V7E9: Free y Básico no leen ni envían fechas desde formularios administrativos', () => {
  const products = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../src/pages/admin/store-settings.astro', import.meta.url), 'utf8');
  assert.match(products, /if \(EXPIRATION_TOOLS_ENABLED\) formData\.append\('expiration_date'/);
  assert.match(products, /expiration_date: _ignoredExpirationDate/);
  assert.match(settings, /EXPIRATION_TOOLS_ENABLED \? \{ notify_expiration_alerts:/);
  assert.match(settings, /if \(EXPIRATION_TOOLS_ENABLED\) data\.append\('notify_expiration_alerts'/);
});

test('V7E9: el sidebar conserva stock sin detectar vencimientos en el navegador', () => {
  const sidebar = readFileSync(new URL('../src/components/admin/AdminSidebar.astro', import.meta.url), 'utf8');
  assert.match(sidebar, /detectProductStockNotifications/);
  assert.match(sidebar, /detectVariationStockNotifications/);
  assert.equal(sidebar.includes('expiration_date'), false);
  assert.equal(sidebar.includes('detectExpiration'), false);
});

test('V7E9: el downgrade exige confirmación y presenta conteos irreversibles', () => {
  const planView = readFileSync(new URL('../src/components/master/MasterStorePlanView.astro', import.meta.url), 'utf8');
  const planClient = readFileSync(new URL('../src/lib/masterStorePlans.ts', import.meta.url), 'utf8');
  const masterStyles = readFileSync(new URL('../src/styles/master-ui.css', import.meta.url), 'utf8');
  assert.match(planView, /name="confirm_expiration_cleanup"/);
  assert.match(planView, /confirm_expiration_cleanup: needsCleanup/);
  assert.match(planView, /if \(button\.disabled\) return/);
  assert.match(masterStyles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(masterStyles, /\.master-dialog__body \{[^}]*overflow-x: hidden; overflow-y: auto/);
  assert.match(masterStyles, /env\(safe-area-inset-bottom/);
  assert.match(planClient, /expiration_cleanup: \{ products: number; variations: number; notifications: number; cycles: number \}/);
});

test('V7E9-C1: 30 días y vencido se pintan rojos sin alterar otras notificaciones importantes', () => {
  assert.equal(isV7E9RedNotification({ type: 'product_expiring_critical' }), true);
  assert.equal(isV7E9RedNotification({ type: 'variation_expired' }), true);
  assert.equal(getNotificationVisualPriority({ type: 'product_expiring_critical', priority: 'important' }), 'critical');
  assert.equal(getNotificationVisualPriority({ type: 'new_order', priority: 'important' }), 'important');
  assert.equal(getNotificationVisualPriority({ type: 'product_expiring_soon', priority: 'normal' }), 'normal');
  const sidebar = readFileSync(new URL('../src/components/admin/AdminSidebar.astro', import.meta.url), 'utf8');
  const notifications = readFileSync(new URL('../src/pages/admin/notifications.astro', import.meta.url), 'utf8');
  assert.match(sidebar, /hasV7E9Red \? 'critical'/);
  assert.match(sidebar, /isV7E9RedNotification\(item\) \? 'error' : 'info'/);
  assert.match(notifications, /getNotificationVisualPriority\(item\)/);
  assert.match(notifications, /Alerta de 30 días/);
});

test('V7E9-C1: la prueba portable no importa TypeScript ni requiere loaders', () => {
  const source = readFileSync(new URL('./v7e9ProductExpiration.test.mjs', import.meta.url), 'utf8');
  assert.match(source, /productExpirationCore\.js/);
  assert.equal(source.includes(['productExpiration', '.ts'].join('')), false);
  assert.equal(source.includes(['experimental-strip', '-types'].join('')), false);
});

test('V7E9-C2: gate y listados conservan contrato responsive compacto sin imágenes', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const gate = readFileSync(new URL('../src/components/shared/StoreCapabilityGate.astro', import.meta.url), 'utf8');
  assert.match(gate, /compact\?: boolean/);
  assert.match(gate, /store-capability-gate--compact/);
  assert.match(gate, /@media \(max-width: 640px\)/);
  assert.match(dashboard, /@media \(max-width: 760px\) \{[\s\S]*?\.expiration-item \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(dashboard, /\.expiration-tabs \{[\s\S]*?overflow-x: auto/);
  const sectionStart = dashboard.indexOf('id="productos-proximos-vencer"');
  const sectionEnd = dashboard.indexOf('</section>', sectionStart);
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  assert.equal(dashboard.slice(sectionStart, sectionEnd).includes('<img'), false);
  assert.equal(page.includes('<img'), false);
  assert.match(dashboard, /\.expiration-item\.expired \{[\s\S]*?border-color: #ef4444/);
  assert.match(page, /\.expiration-row\.is-expired \{[\s\S]*?border-color: #ef4444/);
  assert.match(page, /@media \(max-width: 520px\)/);
  assert.equal(dashboard.includes('Registro privado de vencimiento'), false);
});

test('V7E9-C3: el Resumen limita el frasco dinamico y conserva filas compactas', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const standalone = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const sharedIcon = readFileSync(new URL('../src/components/admin/productExpirationBottleIcon.js', import.meta.url), 'utf8');
  const globalStyleStart = dashboard.indexOf('<style is:global>');
  const globalStyleEnd = dashboard.indexOf('</style>', globalStyleStart);
  const globalStyles = dashboard.slice(globalStyleStart, globalStyleEnd);
  const rendererStart = dashboard.indexOf('function renderExpirationProducts()');
  const rendererEnd = dashboard.indexOf('async function loadExpirationDetails()', rendererStart);
  const renderer = dashboard.slice(rendererStart, rendererEnd);

  assert.ok(globalStyleStart >= 0 && globalStyleEnd > globalStyleStart);
  assert.ok(rendererStart >= 0 && rendererEnd > rendererStart);
  assert.match(globalStyles, /#expiration-products-list \.expiration-item \{[\s\S]*?grid-template-columns: minmax\(220px, 1\.45fr\) minmax\(155px, \.78fr\) minmax\(118px, \.58fr\) auto;[\s\S]*?overflow: hidden;/);
  assert.match(globalStyles, /#expiration-products-list \.expiration-product-icon \{[\s\S]*?width: 48px;[\s\S]*?height: 48px;[\s\S]*?flex: 0 0 48px;/);
  assert.match(globalStyles, /#expiration-products-list \.expiration-product-icon svg \{[\s\S]*?width: 24px;[\s\S]*?height: 24px;[\s\S]*?max-width: 24px;[\s\S]*?max-height: 24px;/);
  assert.equal(/#expiration-products-list[^\{]*svg\s*\{[^}]*width:\s*100%/.test(globalStyles), false);
  assert.match(globalStyles, /#expiration-products-list \.expiration-item\.expired \{[\s\S]*?border-color: #ef4444;/);
  assert.match(globalStyles, /@media \(max-width: 760px\) \{[\s\S]*?#expiration-products-list \.expiration-item \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(renderer, /PRODUCT_EXPIRATION_BOTTLE_ICON_SVG/);
  assert.match(sharedIcon, /class="expiration-product-icon-svg" width="24" height="24"/);
  assert.match(sharedIcon, /M9 3h6v3H9/);
  assert.equal(renderer.includes('<img'), false);
  assert.match(dashboard, /postExpirationQuery\(selectedExpirationView, selectedExpirationRange, selectedExpirationPage, 5\)/);
  assert.match(standalone, /class="expiration-list-card"/);
});

test('V7E9-C4: controles alineados e icono de frasco compartido en ambas vistas', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL('../src/pages/t/[storeSlug]/admin/expirations.astro', import.meta.url), 'utf8');
  const sharedIcon = readFileSync(new URL('../src/components/admin/productExpirationBottleIcon.js', import.meta.url), 'utf8');
  const dashboardRenderer = dashboard.slice(dashboard.indexOf('function renderExpirationProducts()'), dashboard.indexOf('async function loadExpirationDetails()'));
  const pageRenderer = page.slice(page.indexOf('function render(result)'), page.indexOf('async function load()'));

  assert.match(dashboard, /class="expiration-preview-actions"[\s\S]*?class="expiration-summary-filters"/);
  assert.match(dashboard, /\.expiration-summary-filters \{[\s\S]*?display: flex;/);
  assert.match(dashboard, /\.expiration-summary-filters \.expiration-btn \{[\s\S]*?min-height: 40px;/);
  assert.match(dashboard, /\.expiration-tabs \{\s*overflow-x: visible;/);

  assert.match(page, /\.expiration-toolbar \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(page, /\.expiration-controls \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(page, /\.expiration-filter \{[\s\S]*?min-height: 40px;/);
  assert.match(page, /<div class="expiration-controls">[\s\S]*?data-expiration-ranges[\s\S]*?<\/div>[\s\S]*?<form class="expiration-search"/);
  assert.match(page, /ranges\.hidden = view === 'expired'/);
  assert.match(page, /@media \(max-width: 820px\) \{[\s\S]*?\.expiration-controls \{[\s\S]*?display: grid;[\s\S]*?\.expiration-ranges \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);

  assert.match(dashboard, /productExpirationBottleIcon\.js/);
  assert.match(page, /productExpirationBottleIcon\.js/);
  assert.match(dashboardRenderer, /PRODUCT_EXPIRATION_BOTTLE_ICON_SVG/);
  assert.match(pageRenderer, /PRODUCT_EXPIRATION_BOTTLE_ICON_SVG/);
  assert.equal(dashboardRenderer.includes('<svg'), false);
  assert.equal(pageRenderer.includes('<svg'), false);
  assert.equal((sharedIcon.match(/<svg/g) || []).length, 1);
  assert.match(sharedIcon, /M9 3h6v3H9/);
  assert.match(wrapper, /<AdminExpirations \/>/);
  assert.match(dashboard, /selectedExpirationPage, 5\)/);
  assert.match(page, /page_size: 10/);
});

test('V7E9-C5: filtros compactos y accion global dentro del encabezado del Resumen', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const sharedIcon = readFileSync(new URL('../src/components/admin/productExpirationBottleIcon.js', import.meta.url), 'utf8');
  const sectionStart = dashboard.indexOf('<section id="productos-proximos-vencer"');
  const sectionEnd = dashboard.indexOf('</section>', sectionStart);
  const section = dashboard.slice(sectionStart, sectionEnd);
  const desktopStart = dashboard.indexOf('.expiration-preview-actions {');
  const desktopEnd = dashboard.indexOf('.expiration-summary-ranges[hidden]', desktopStart);
  const desktopCss = dashboard.slice(desktopStart, desktopEnd);
  const mobileStart = dashboard.indexOf('@media (max-width: 760px)', desktopEnd);
  const mobileEnd = dashboard.indexOf('.expiration-summary-table-head', mobileStart);
  const mobileCss = dashboard.slice(mobileStart, mobileEnd);

  assert.match(section, /class="dashboard-block-head expiration-summary-head"[\s\S]*?Vencimiento de productos[\s\S]*?class="expiration-preview-all[^"]*"[\s\S]*?Ver todos los vencimientos →[\s\S]*?<\/div>[\s\S]*?class="expiration-preview-actions"/);
  assert.equal(section.includes('expiration-preview-link-row'), false);
  assert.match(desktopCss, /\.expiration-summary-filters \{[\s\S]*?display: flex;[\s\S]*?width: fit-content;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(desktopCss, /\.expiration-summary-filters \.expiration-summary-control-group \{[\s\S]*?display: inline-flex;[\s\S]*?width: fit-content;[\s\S]*?flex: 0 0 auto;/);
  assert.equal(/\.expiration-summary-control-group[^}]*(?:^|[;{])\s*width:\s*100%/m.test(desktopCss), false);
  assert.equal(/\.expiration-summary-control-group[^}]*flex:\s*1/.test(desktopCss), false);
  assert.equal(/grid-template-columns:\s*1fr/.test(desktopCss), false);
  assert.match(mobileCss, /\.expiration-summary-filters \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;/);
  assert.match(mobileCss, /\.expiration-summary-filters \.expiration-summary-control-group \{[\s\S]*?display: inline-flex;[\s\S]*?width: fit-content;/);
  assert.equal(/overflow-x:\s*auto/.test(mobileCss), false);
  assert.match(dashboard, /postExpirationQuery\(selectedExpirationView, selectedExpirationRange, selectedExpirationPage, 5\)/);
  assert.match(dashboard, /productExpirationBottleIcon\.js/);
  assert.match(sharedIcon, /M9 3h6v3H9/);
  assert.equal(page.includes('expiration-summary-head'), false);
});

test('V7E9-C6: filtros en línea en PC y wrap exclusivo del breakpoint móvil', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const desktopStart = dashboard.indexOf('.expiration-preview-actions {');
  const desktopEnd = dashboard.indexOf('.expiration-summary-ranges[hidden]', desktopStart);
  const desktopCss = dashboard.slice(desktopStart, desktopEnd);
  const mobileStart = dashboard.indexOf('@media (max-width: 760px)', desktopEnd);
  const mobileEnd = dashboard.indexOf('.expiration-summary-table-head', mobileStart);
  const mobileCss = dashboard.slice(mobileStart, mobileEnd);
  const section = dashboard.slice(
    dashboard.indexOf('<section id="productos-proximos-vencer"'),
    dashboard.indexOf('</section>', dashboard.indexOf('<section id="productos-proximos-vencer"')),
  );

  assert.match(section, /class="expiration-summary-filters"[\s\S]*?class="expiration-tabs expiration-summary-control-group"[\s\S]*?class="expiration-summary-ranges expiration-summary-control-group"/);
  assert.match(desktopCss, /\.expiration-summary-filters \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?gap: 10px;[\s\S]*?flex-wrap: nowrap;/);
  assert.equal(/\.expiration-summary-control-group[^}]*(?:^|[;{])\s*width:\s*100%/m.test(desktopCss), false);
  assert.equal(/\.expiration-summary-control-group[^}]*flex:\s*1/.test(desktopCss), false);
  assert.equal(/\.expiration-summary-filters[^}]*grid-template-columns/.test(desktopCss), false);
  assert.match(mobileCss, /\.expiration-summary-filters \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;/);
  assert.equal(/overflow-x:\s*auto/.test(`${desktopCss}\n${mobileCss}`), false);
});

test('V7E9-C6: borde crítico cubre 30 días o menos en Resumen y página independiente', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const dashboardStatus = compileInlineFunction(dashboard, 'getExpirationStatus', ['item', 'getExpirationDaysText']);
  const pageStatus = compileInlineFunction(page, 'statusFor', ['item']);
  const scenarios = [
    { days: 90, critical: false, expired: false },
    { days: 60, critical: false, expired: false },
    { days: 31, critical: false, expired: false },
    { days: 30, critical: true, expired: false },
    { days: 15, critical: true, expired: false },
    { days: 2, critical: true, expired: false },
    { days: 1, critical: true, expired: false },
    { days: 0, critical: true, expired: true },
  ];

  for (const mode of ['general', 'variations']) {
    for (const scenario of scenarios) {
      const item = { days_left: scenario.days, mode, affected_variations: mode === 'variations' ? [{ days_left: scenario.days }] : [] };
      const dashboardResult = dashboardStatus(item, (days) => `Faltan ${days} días`);
      const pageResult = pageStatus(item);
      assert.equal(dashboardResult.rowClassName === 'is-expiration-critical', scenario.critical, `Resumen ${mode}: ${scenario.days} días`);
      assert.equal(pageResult.rowClassName === 'is-expiration-critical', scenario.critical, `Página ${mode}: ${scenario.days} días`);
      if (scenario.expired) {
        assert.equal(dashboardResult.label, 'Vencido');
        assert.equal(pageResult.label, 'Vencido');
      }
    }
  }

  assert.match(dashboard, /#expiration-products-list \.expiration-item\.is-expiration-critical \{[\s\S]*?border-color: #ef4444;[\s\S]*?background: #fff7f7;/);
  assert.match(page, /\.expiration-row\.is-expiration-critical \{[\s\S]*?border-color: #ef4444;[\s\S]*?background: #fff7f7;/);
  assert.match(dashboard, /<article class="expiration-item \$\{status\.className\} \$\{status\.rowClassName\}">/);
  assert.match(page, /<article class="expiration-row \$\{status\.className\} \$\{status\.rowClassName\}/);
  assert.match(dashboard, /@media \(max-width: 760px\) \{[\s\S]*?#expiration-products-list \.expiration-item\.is-expiration-critical/);
  assert.match(page, /@media \(max-width: 820px\) \{[\s\S]*?\.expiration-row\.is-expiration-critical/);
});

test('V7E9-C6: 30 días o menos continúa vendible hasta la fecha civil exacta', () => {
  const futureDates = ['2026-08-17', '2026-08-02', '2026-07-20', '2026-07-19'];
  const now = '2026-07-18T16:00:00.000Z';
  const products = futureDates.map((expiration_date, index) => ({ id: `p${index}`, expiration_date }));
  const variationProduct = { id: 'variation-product', has_variations: true, track_stock: true };
  const variations = futureDates.map((expiration_date, index) => ({
    id: `v${index}`,
    product: variationProduct.id,
    active: true,
    price_usd: 10,
    stock: 1,
    expiration_date,
  }));

  assert.deepEqual(futureDates.map((date) => getExpirationDaysLeft(date, now)), [30, 15, 2, 1]);
  assert.equal(filterPublicCatalogByExpirationAccess(products, [], true, now).products.length, 4);
  assert.equal(filterPublicCatalogByExpirationAccess([variationProduct], variations, true, now).variations.length, 4);
});

test('V7E9-C2: paginadores cubren cortes 0/1/5/6/12 y 10/11 sin render masivo', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  assert.match(dashboard, /if \(total <= 1\) \{[\s\S]*?expirationPagination\.hidden = true/);
  assert.match(dashboard, /Math\.min\(selectedExpirationPage \* 5, totalItems\)/);
  assert.match(dashboard, /items = Array\.isArray\(expirationDetails\.items\) \? expirationDetails\.items : \[\]/);
  assert.match(page, /if \(total <= 1\) \{[\s\S]*?pagination\.hidden = true/);
  assert.match(page, /Math\.min\(page \* 10, total\)/);
  assert.match(page, /page = 1;[\s\S]*?syncControls\(\);[\s\S]*?load\(\)/);
});
