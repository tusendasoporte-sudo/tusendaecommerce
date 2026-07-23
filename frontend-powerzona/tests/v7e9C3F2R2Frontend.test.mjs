import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getSellableProductVariations,
  getVariationEffectiveStatus,
  productUsesVariations,
} from '../src/lib/adminStoreProducts.ts';

const root = new URL('../', import.meta.url);
const source = async (path) => readFile(new URL(path, root), 'utf8');

test('helper frontend deriva estados y unidades vendibles sin inferir el modo', () => {
  const product = { id: 'producthistory1', active: true, has_variations: false, track_stock: true, expiration_date: '', stock: 10 };
  const retained = { id: 'variationhist01', product: product.id, active: true, price_usd: 12, stock: 4, expiration_date: '2026-08-01' };
  assert.equal(productUsesVariations(product), false);
  assert.equal(getSellableProductVariations(product, [retained], '2026-07-21T12:00:00.000Z').length, 0);
  assert.equal(getVariationEffectiveStatus(product, retained, [retained], '2026-07-21T12:00:00.000Z').effective_status, 'disabled_by_parent_mode');

  product.has_variations = true;
  const expired = { ...retained, id: 'variationhist02', expiration_date: '2026-07-20' };
  const hidden = { ...retained, id: 'variationhist03', active: false, expiration_date: '2026-07-20' };
  const sellable = getSellableProductVariations(product, [retained, expired, hidden], '2026-07-21T12:00:00.000Z');
  assert.deepEqual(sellable.map((item) => item.id), [retained.id]);
  assert.equal(getVariationEffectiveStatus(product, expired, [retained, expired, hidden], '2026-07-21T12:00:00.000Z').effective_status, 'hidden_expired');
  assert.equal(getVariationEffectiveStatus(product, hidden, [retained, expired, hidden], '2026-07-21T12:00:00.000Z').can_activate, false);
});

test('Pedidos Admin usa has_variations y omite variation_id para el padre', async () => {
  const orders = await source('src/pages/admin/orders.astro');
  assert.match(orders, /function productUsesVariationMode[\s\S]*Boolean\(product\?\.has_variations\)/);
  assert.match(orders, /const usesVariations = productUsesVariationMode\(product\)/);
  assert.match(orders, /if \(usesVariations && variation\) payload\.variation_id = variation\.id/);
  assert.doesNotMatch(orders, /variation_id:\s*variation\?\.id\s*\|\|\s*''/);
  assert.match(orders, /getSellableVariationsForProduct/);
  assert.match(orders, /Producto no disponible: no tiene variaciones activas, vigentes y vendibles/);
  const selectorFlow = orders.slice(orders.indexOf('function selectAddProduct'), orders.indexOf('function handleAddVariationChange'));
  assert.match(selectorFlow, /addProductVariationSelect\.value = ''/);
  assert.match(selectorFlow, /else if \(usesVariations\)[\s\S]*Producto no disponible/);
  const summaryFlow = orders.slice(orders.indexOf('function buildOrderSummary'), orders.indexOf('async function copyOrderSummary'));
  assert.doesNotMatch(summaryFlow, /usesVariations|addProductVariationWrap|addProductVariationSelect/);
});

test('Productos muestra estados efectivos y bloquea activacion vencida', async () => {
  const [products, helper] = await Promise.all([
    source('src/pages/admin/products.astro'),
    source('src/lib/adminStoreProducts.ts'),
  ]);
  assert.doesNotMatch(products, /Oculta manualmente|Oculta por vencimiento/);
  assert.match(products, /effective_status_label: variation\.active === false \? 'Oculta' : 'Activa'/);
  assert.match(products, /hidden_expired/);
  assert.match(helper, /effective_status_label: 'Conservada'/);
  assert.match(products, /Corrige o elimina la fecha de vencimiento antes de activar esta variacion/);
  assert.match(products, /data-variation-action="correct-expiration"/);
  assert.match(products, /state\.effective_status === 'hidden_expired' \|\| \(!active && !state\.can_activate\)/);
});

test('historial individual reemplaza Mi equipo y abre variaciones contextuales', async () => {
  const [products, expirations, historyPage, middleware] = await Promise.all([
    source('src/pages/admin/products.astro'),
    source('src/pages/admin/expirations.astro'),
    source('src/pages/admin/products/[productId]/history.astro'),
    source('src/middleware.ts'),
  ]);
  assert.match(products, /\/history\?from=products/);
  assert.doesNotMatch(products, /adminTeamActivityPath|tab=activity/);
  assert.match(expirations, /productHistoryPath\(item\?\.product_id, isVariationUnit \? variation\?\.id : ''\)/);
  assert.doesNotMatch(expirations, /activityHistoryPath/);
  assert.doesNotMatch(expirations, /adminTeamActivityPath|tab=activity/);
  assert.match(historyPage, /Todo el producto/);
  assert.match(historyPage, /per_page:20/);
  assert.match(historyPage, /Valor anterior|Antes/);
  assert.doesNotMatch(historyPage, /localStorage|sessionStorage/);
  assert.match(middleware, /normalized\.startsWith\('products\/'\)/);
});

test('Actividad del equipo usa acciones compactas y destino individual', async () => {
  const [view, css, client] = await Promise.all([
    source('src/components/admin/StoreActivityView.astro'),
    source('src/styles/store-activity.css'),
    source('src/lib/storeActivity.ts'),
  ]);
  assert.doesNotMatch(view, />Abrir<\/a>/);
  assert.doesNotMatch(view, />Abrir \$\{escapeHtml\(event\.resource\.label/);
  assert.doesNotMatch(view, /aria-label="Abrir \$\{escapeHtml\(event\.resource\.label/);
  assert.match(view, />Ver historial<\/a>/);
  assert.match(view, /buildTeamActivityProductHistoryPath/);
  assert.match(client, /history_path/);
  assert.match(css, /store-activity-item__actions[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*store-activity-item__actions[^}]*flex-wrap:\s*wrap/);
});
