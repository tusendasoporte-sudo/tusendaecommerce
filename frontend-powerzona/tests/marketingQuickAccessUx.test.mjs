import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const promos = readFileSync(new URL('../src/pages/admin/promos.astro', import.meta.url), 'utf8');
const promotionCreate = readFileSync(new URL('../src/pages/admin/promos/new.astro', import.meta.url), 'utf8');
const promotionCreateWrapper = readFileSync(new URL('../src/pages/t/[storeSlug]/admin/promos/new.astro', import.meta.url), 'utf8');
const middleware = readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');

test('Marketing evita repetir el encabezado de accesos rápidos antes de Crear tarjeta', () => {
  const quickPanel = promos.slice(
    promos.indexOf('<div class="marketing-featured-panel marketing-quick-panel">'),
    promos.indexOf('<form id="visual-form"'),
  );

  assert.match(quickPanel, /id="open-visual-form-btn"[\s\S]*?>Crear tarjeta<|pz-admin-btn__label">Crear tarjeta/);
  assert.doesNotMatch(quickPanel, /<h2>Accesos rápidos<\/h2>/);
  assert.doesNotMatch(quickPanel, /Tarjetas visuales para WhatsApp, enlaces, categorías o archivos\./);
});

test('Nueva promoción vive dentro del panel de promociones y no en la cabecera global', () => {
  const header = promos.slice(
    promos.indexOf('<AdminSectionHeader'),
    promos.indexOf('<section id="marketing-summary-card"'),
  );
  const promotionsPanel = promos.slice(
    promos.indexOf('<div class="marketing-featured-panel marketing-promos-panel">'),
    promos.indexOf('<form id="promotion-form"'),
  );

  assert.doesNotMatch(header, /id="promotion-new-btn"/);
  assert.match(promotionsPanel, /id="promotion-new-link"[\s\S]*?href=\{adminPromosNewPath\}[\s\S]*?pz-admin-btn__label">Nueva promoción/);
  assert.match(promotionsPanel, /id="promotion-readme-btn"/);
});

test('los estados de promociones se filtran desde un selector desplegable', () => {
  assert.match(promos, /<select id="promotion-filter-select" aria-label="Filtrar promociones actuales">/);
  assert.match(promos, /<option value="all">Todas<\/option>[\s\S]*?<option value="active">Activas<\/option>[\s\S]*?<option value="inactive">Inactivas<\/option>[\s\S]*?<option value="expired">Vencidas<\/option>/);
  assert.match(promos, /promotionFilterSelect\?\.addEventListener\('change'/);
  assert.doesNotMatch(promos, /data-promotion-filter=/);
});

test('crear promoción abre una página dedicada y regresa a la lista al cerrar', () => {
  assert.match(promotionCreate, /<AdminPromos promotionCreatePage=\{true\} \/>/);
  assert.match(promotionCreateWrapper, /<AdminPromotionCreate \/>/);
  assert.match(middleware, /normalized === 'promos\/new'[\s\S]*?'promotions\.manage'/);
  assert.match(promos, /PROMOTION_CREATE_PAGE = promotionCreatePage === true/);
  assert.match(promos, /window\.location\.assign\(`\$\{ADMIN_PROMOS_PATH\}#promociones`\)/);
  assert.match(promos, /if \(PROMOTION_CREATE_PAGE\) openPromotionForm\(\)/);
  assert.match(promos, /data-promotion-create-back[\s\S]*?requestClosePromotionForm\(\)/);
});

test('el producto de una promoción se elige desde una lista desplegable compacta', () => {
  assert.match(promos, /data-promotion-product-combobox/);
  assert.match(promos, /id="promotion-product-search"[\s\S]*?role="combobox"[\s\S]*?aria-controls="promotion-product-results"/);
  assert.match(promos, /id="promotion-product-results" class="promotion-product-dropdown hidden" role="listbox"/);
  assert.match(promos, /class="promotion-product-option js-promotion-product-select"[\s\S]*?role="option"/);
  assert.match(promos, /setPromotionProductDropdown\(false\)/);
  assert.doesNotMatch(promos, /featured-result-row[\s\S]{0,500}js-promotion-product-select/);
});
