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

test('V7E9: el admin usa endpoint privado y carga diferida solo con capacidad Premium', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  assert.match(dashboard, /resolveStoreCapabilityAccess\(adminContext\.store, 'product_expiration_tools_enabled'\)/);
  assert.match(dashboard, /\/api\/pz\/admin\/product-expirations/);
  assert.match(dashboard, /new IntersectionObserver/);
  assert.match(dashboard, /JSON\.stringify\(\{ view, window_days: windowDays, page \}\)/);
  assert.match(dashboard, /href="\$\{escapeHtml\(`\$\{ADMIN_EXPIRATIONS_PATH\}\?view=expired`\)\}"[^>]*>Ver vencidos<\/a>/);
  assert.equal(dashboard.includes('href="#productos-proximos-vencer"'), false);
  assert.match(dashboard, /\.items\.slice\(0, 5\)/);
  assert.match(dashboard, /Ver todos los vencimientos/);
  assert.equal(dashboard.includes('id="expiration-pagination"'), false);
  assert.equal(dashboard.includes('getProductsNearExpiration'), false);
});

test('V7E9-C1: página independiente usa gate SSR, endpoint privado, contexto seguro y paginación de 10', () => {
  const page = readFileSync(new URL('../src/pages/admin/expirations.astro', import.meta.url), 'utf8');
  const wrapper = readFileSync(new URL('../src/pages/t/[storeSlug]/admin/expirations.astro', import.meta.url), 'utf8');
  assert.match(wrapper, /import AdminExpirations from '\.\.\/\.\.\/\.\.\/admin\/expirations\.astro'/);
  assert.match(page, /resolveStoreCapabilityAccess\(adminContext\.store, 'product_expiration_tools_enabled'\)/);
  assert.match(page, /expirationToolsEnabled \? \(/);
  assert.match(page, /if \(expirationToolsEnabled !== true\) return/);
  assert.match(page, /\/api\/pz\/admin\/product-expirations/);
  assert.match(page, /JSON\.stringify\(\{ view, window_days: windowDays, page \}\)/);
  assert.match(page, /Se muestran hasta 10 por página/);
  assert.match(page, /Editar producto/);
  assert.match(page, /Volver al Resumen/);
  assert.match(page, /recordIdPattern = \/\^\[a-z0-9\]\{15\}\$\//);
  assert.match(page, /overflow-x: hidden/);
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

test('V7E9: gate y listado conservan contrato responsive compacto sin imágenes', () => {
  const dashboard = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8');
  const gate = readFileSync(new URL('../src/components/shared/StoreCapabilityGate.astro', import.meta.url), 'utf8');
  assert.match(gate, /compact\?: boolean/);
  assert.match(gate, /store-capability-gate--compact/);
  assert.match(gate, /@media \(max-width: 640px\)/);
  assert.match(dashboard, /@media \(max-width: 760px\) \{[\s\S]*?\.expiration-item \{[\s\S]*?grid-template-columns: 14px minmax\(0, 1fr\)/);
  assert.match(dashboard, /\.expiration-tabs \{[\s\S]*?overflow-x: auto/);
  const sectionStart = dashboard.indexOf('id="productos-proximos-vencer"');
  const sectionEnd = dashboard.indexOf('</section>', sectionStart);
  assert.ok(sectionStart >= 0 && sectionEnd > sectionStart);
  assert.equal(dashboard.slice(sectionStart, sectionEnd).includes('<img'), false);
  assert.equal(dashboard.slice(sectionStart, sectionEnd).includes('expiration-pagination'), false);
});
