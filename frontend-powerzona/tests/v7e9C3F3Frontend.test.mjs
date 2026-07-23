import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatCivilDate,
  getEffectiveProductStatus,
  getVariationEffectiveStatus,
} from '../src/lib/adminStoreProducts.ts';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');
const NOW = '2026-07-21T16:00:00.000Z';

test('helpers frontend exponen textos exactos y fecha civil amigable', () => {
  const parent = { id: 'productc3f30001', active: true, has_variations: true, expiration_date: '' };
  const active = { id: 'variationc3f3001', product: parent.id, active: true, expiration_date: '2026-08-01' };
  const expired = { ...active, id: 'variationc3f3002', expiration_date: '2026-07-20' };
  const hidden = { ...expired, id: 'variationc3f3003', active: false };
  const variations = [active, expired, hidden];
  assert.equal(getVariationEffectiveStatus(parent, active, variations, NOW).effective_status_label, 'Activa');
  assert.equal(getVariationEffectiveStatus(parent, expired, variations, NOW).effective_status_label, 'Vencida');
  assert.equal(getVariationEffectiveStatus(parent, hidden, variations, NOW).effective_status_label, 'Oculta');
  parent.has_variations = false;
  assert.equal(getVariationEffectiveStatus(parent, active, variations, NOW).effective_status_label, 'Conservada');
  assert.equal(formatCivilDate('2026-07-21'), '21/07/2026');
});

test('estado del padre muestra VENCIDO sin convertir ocultación manual', () => {
  assert.equal(getEffectiveProductStatus({
    active: true, has_variations: false, expiration_date: '2026-07-20',
  }, NOW).effective_status_label, 'VENCIDO');
  assert.equal(getEffectiveProductStatus({
    active: false, has_variations: false, expiration_date: '2026-07-20',
  }, NOW).effective_status_label, 'OCULTO');
  assert.equal(getEffectiveProductStatus({
    active: true, has_variations: false, expiration_date: '2026-08-01',
  }, NOW).effective_status_label, 'VISIBLE');
});

test('editores separan intención manual del estado efectivo', async () => {
  const products = await source('src/pages/admin/products.astro');
  assert.match(products, /let productManualActive = true/);
  assert.match(products, /let variationManualActive = true/);
  assert.match(products, /getProductEditorVisibilityState/);
  assert.match(products, /getVariationEditorVisibilityState/);
  assert.match(products, /productActiveInput\.checked = state\.checked === true/);
  assert.match(products, /variationActiveInput\.checked = state\.checked === true/);
  assert.match(products, /formData\.append\('active', productManualActive \? 'true' : 'false'\)/);
  assert.match(products, /formData\.append\('active', variationManualActive \? 'true' : 'false'\)/);
  assert.match(products, /Esta variación no está visible porque su fecha de vencimiento ya pasó/);
  assert.doesNotMatch(products, /Oculta por vencimiento|Oculta manualmente/);
});

test('fecha de variación ocupa una fila legible y usa DD/MM/AAAA', async () => {
  const products = await source('src/pages/admin/products.astro');
  assert.match(products, /\.variation-field-expiration\s*\{[\s\S]*?grid-column:\s*1 \/ 3/);
  assert.match(products, /\.variation-field-ref\s*\{[\s\S]*?grid-column:\s*3 \/ 7/);
  assert.match(products, /@media \(max-width: 720px\)[\s\S]*?\.variation-field-expiration,[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(products, /Vence: \$\{escapeHtml\(dateForDisplay\(variation\.expiration_date\)\)\}/);
  assert.match(products, /input\[type="date"\][^}]*min-height:\s*48px/);
});

test('listado deja sólo kebab y mueve historial/visibilidad al menú por estado', async () => {
  const products = await source('src/pages/admin/products.astro');
  const rowActions = products.slice(products.indexOf('<div class="row-actions">'), products.indexOf('${CAN_DELETE_PRODUCTS && pendingDeleteProductId'));
  assert.match(rowActions, /js-actions-trigger/);
  assert.match(rowActions, /actions-menu/);
  assert.match(rowActions, /js-product-history/);
  assert.match(rowActions, /js-product-toggle/);
  assert.match(rowActions, /Oculto por vencimiento/);
  assert.match(rowActions, /aria-disabled="true"/);
  assert.match(rowActions, /Corrige o elimina la fecha de vencimiento antes de mostrar este producto/);
  assert.doesNotMatch(rowActions, /<a class="mini-btn[^>]*js-product-history/);
  assert.doesNotMatch(rowActions, /<button class="mini-btn[^>]*js-product-toggle/);
  assert.match(products, /const effectiveLabel = effectiveExpired \? 'VENCIDO'/);
  assert.match(products, /grid-template-columns:[^;]*72px/);
  assert.match(products, /product-title[^}]*text-overflow:\s*ellipsis/);
});
