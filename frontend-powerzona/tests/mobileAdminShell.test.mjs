import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const sidebar = readFileSync(
  new URL('../src/components/admin/AdminSidebar.astro', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('../src/pages/admin/index.astro', import.meta.url),
  'utf8',
);
const categoryEditor = readFileSync(
  new URL('../src/pages/admin/catalog/category/[id].astro', import.meta.url),
  'utf8',
);
const launcher = readFileSync(
  new URL('../../mobile-admin/app/src/main/res/mipmap-anydpi/ic_launcher.xml', import.meta.url),
  'utf8',
);
const mainActivity = readFileSync(
  new URL('../../mobile-admin/app/src/main/java/com/tusenda84/admin/MainActivity.java', import.meta.url),
  'utf8',
);

test('las barras moviles globales quedan ancladas a los bordes seguros', () => {
  const marker = sidebar.indexOf('PZ-MOBILE-DOCKED-NAV-001');
  assert.notEqual(marker, -1);
  const dockedStyles = sidebar.slice(marker);

  assert.match(dockedStyles, /\.pz-admin-mobile-topbar\s*\{[\s\S]*?top:\s*0\s*!important;[\s\S]*?left:\s*0\s*!important;[\s\S]*?right:\s*0\s*!important;/);
  assert.match(dockedStyles, /\.pz-admin-mobile-bottom-nav\s*\{[\s\S]*?left:\s*0\s*!important;[\s\S]*?right:\s*0\s*!important;[\s\S]*?bottom:\s*0\s*!important;/);
  assert.match(dockedStyles, /border-radius:\s*0 0 24px 24px\s*!important/);
  assert.match(dockedStyles, /border-radius:\s*24px 24px 0 0\s*!important/);
  assert.match(dockedStyles, /\.pz-admin-content\s*\{[\s\S]*?padding-top:[\s\S]*?padding-bottom:/);
  assert.match(dockedStyles, /html\.pz-android-app \.pz-admin-mobile-topbar/);
  assert.match(dockedStyles, /html\.pz-android-app \.pz-admin-mobile-bottom-nav/);
  assert.match(sidebar, /\.pz-admin-mobile-back-link\s*\{[\s\S]*?position:\s*fixed\s*!important;[\s\S]*?z-index:\s*2995\s*!important;/);
});

test('el editor de categoria muestra un solo regreso al catalogo en movil', () => {
  assert.match(categoryEditor, /mobileBackHref=\{adminCatalogPath\}/);
  assert.match(categoryEditor, /mobileBackLabel="Volver a Categorías"/);
  assert.doesNotMatch(categoryEditor, /class="square-back"/);
  assert.doesNotMatch(categoryEditor, /\.square-back\s*\{/);
});

test('los listados internos usan solo el regreso superior fijo en movil', () => {
  assert.match(categoryEditor, /@media \(max-width: 1023px\)\s*\{\s*\.category-management-back-row \{ display: none; \}/);
  assert.match(categoryEditor, /id="category-subcategories-view"[\s\S]*?data-category-list-back/);
  assert.match(categoryEditor, /id="category-products-view"[\s\S]*?data-category-list-back/);
});

test('Resumen ofrece una tarjeta contextual que activa el permiso Android', () => {
  assert.match(dashboard, /data-pz-native-push-onboarding/);
  assert.match(dashboard, /Activa las alertas de pedidos y seguridad/);
  assert.match(dashboard, /data-pz-native-push-onboarding-action/);

  assert.match(sidebar, /nativePushOnboarding\.hidden = isActive/);
  assert.match(sidebar, /nativeBridge\.requestPermission\?\.\(\)/);
  assert.match(sidebar, /nativeBridge\.openSettings\?\.\(\)/);
  assert.match(sidebar, /permission === 'granted' && notificationsEnabled/);
});

test('el registro Firebase posterior al permiso no bloquea el hilo principal', () => {
  assert.match(mainActivity, /Executors\.newSingleThreadExecutor\(\)/);
  assert.match(mainActivity, /pushRegistrationExecutor\.execute\(\(\) ->/);
  assert.match(mainActivity, /messaging\.setAutoInitEnabled\(true\)/);
  assert.match(mainActivity, /emitPushStateToWeb\(\);/);
});

test('Android usa el emblema oficial y genera un icono de Play de 512 px', async () => {
  assert.match(launcher, /@drawable\/ic_launcher_brand_foreground/);
  assert.match(launcher, /@drawable\/ic_launcher_brand_monochrome/);
  assert.match(launcher, /@color\/app_white/);

  const foreground = await sharp(fileURLToPath(new URL(
    '../../mobile-admin/app/src/main/res/drawable-nodpi/ic_launcher_brand_foreground.png',
    import.meta.url,
  ))).metadata();
  const playIcon = await sharp(fileURLToPath(new URL(
    '../../mobile-admin/store-assets/tu-senda-84-admin-icon-512.png',
    import.meta.url,
  ))).metadata();

  assert.equal(foreground.width, 432);
  assert.equal(foreground.height, 432);
  assert.equal(foreground.hasAlpha, true);
  assert.equal(playIcon.width, 512);
  assert.equal(playIcon.height, 512);
});
