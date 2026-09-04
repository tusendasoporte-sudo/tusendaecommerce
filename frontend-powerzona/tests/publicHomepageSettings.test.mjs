import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = path.resolve(ROOT, '..');
const read = (relative) => fs.readFileSync(path.join(PROJECT_ROOT, relative), 'utf8');
const migration = read('backend-powerzona/pb_migrations/1788447900_public_homepage_settings.js');
const storeLabelMigration = read('backend-powerzona/pb_migrations/1788448100_homepage_store_label.js');
const settingsLib = read('frontend-powerzona/src/lib/publicHomepageSettings.ts');
const masterPage = read('frontend-powerzona/src/pages/master/homepage.astro');
const masterView = read('frontend-powerzona/src/components/master/MasterHomepageSettingsView.astro');
const masterApi = read('frontend-powerzona/src/pages/api/master/homepage-settings.ts');
const sidebar = read('frontend-powerzona/src/components/master/MasterSidebar.astro');

test('la migración crea una configuración pública de portada con escritura exclusiva Master', () => {
  assert.match(migration, /public_homepage_settings/);
  assert.match(migration, /listRule: ""/);
  assert.match(migration, /viewRule: ""/);
  assert.match(migration, /updateRule: MASTER_ADMIN_RULE/);
  assert.match(migration, /stores_section_enabled/);
  assert.match(migration, /faq_section_enabled/);
  assert.match(migration, /faqs_json/);
});

test('la etiqueta Tienda actualiza únicamente el texto predeterminado de las preguntas', () => {
  assert.match(storeLabelMigration, /Promocional y Tienda/);
  assert.match(storeLabelMigration, /next\[field\] === previous\[field\]/);
  assert.match(storeLabelMigration, /En la modalidad Tienda es una capacidad opcional/);
  assert.match(storeLabelMigration, /settings\.set\("faqs_json", updated\)/);
});

test('Master ofrece visibilidad, selección de tiendas y edición completa de preguntas', () => {
  assert.match(masterPage, /getPublicHomepageSettings/);
  assert.match(masterPage, /getAllStoresForMaster/);
  assert.match(masterView, /data-homepage-stores-enabled/);
  assert.match(masterView, /data-homepage-featured-store/);
  assert.match(masterView, /data-homepage-faq-enabled/);
  assert.match(masterView, /data-homepage-faq-question/);
  assert.match(masterView, /data-homepage-faq-answer/);
  assert.match(masterView, /data-homepage-faq-add/);
  assert.match(sidebar, /href="\/master\/homepage"/);
});

test('el selector de tiendas es desplegable, muestra logos y pagina de diez en diez', () => {
  assert.match(masterPage, /logoUrl: store\.logoUrl/);
  assert.match(masterView, /STORE_PAGE_SIZE = 10/);
  assert.match(masterView, /data-homepage-store-picker/);
  assert.match(masterView, /data-homepage-store-search/);
  assert.match(masterView, /data-homepage-store-option/);
  assert.match(masterView, /store\.logoUrl \? <img src=\{store\.logoUrl\}/);
  assert.match(masterView, /data-homepage-store-page-prev/);
  assert.match(masterView, /data-homepage-store-page-next/);
  assert.match(masterView, /filtered\.slice\(pageStart, pageStart \+ storePageSize\)/);
  assert.match(masterView, /data-homepage-featured-store]:checked/);
});

test('el guardado valida origen, rol Master, claves exactas y tiendas activas', () => {
  assert.match(masterApi, /sameOrigin\(request\)/);
  assert.match(masterApi, /requireMasterAdmin/);
  assert.match(masterApi, /exactKeys\(body\)/);
  assert.match(masterApi, /status="active"/);
  assert.match(masterApi, /invalid_store_selection/);
  assert.match(masterApi, /featured_order/);
  assert.match(settingsLib, /MAX_HOMEPAGE_FAQS = 10/);
  assert.match(settingsLib, /validateHomepageFaqs/);
});
