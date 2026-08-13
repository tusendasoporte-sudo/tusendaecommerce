import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { addVariationPriceSummary } from '../src/lib/publicProductAvailability.ts';

const productsAdmin = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

test('E003: el menú y el editor conservan las dos vías autorizadas de visibilidad', () => {
  assert.match(productsAdmin, /catalog\.products\.visibility/);
  assert.match(productsAdmin, /product\.active \? 'Ocultar producto' : 'Mostrar producto'/);
  assert.match(productsAdmin, /id="product-active" type="checkbox" checked disabled=\{!canManageProductVisibility\}/);
  assert.match(productsAdmin, /savedProductWasActive !== productManualActive[\s\S]*?formData\.append\('active', productManualActive \? 'true' : 'false'\)/);
});

test('E003: marcar agotado modifica únicamente stock y nunca oculta el producto', () => {
  const soldoutBranch = productsAdmin.slice(
    productsAdmin.indexOf('if (soldoutConfirmBtn)'),
    productsAdmin.indexOf('if (deleteConfirmBtn)'),
  );
  assert.match(soldoutBranch, /formData\.append\('stock', '0'\)/);
  assert.doesNotMatch(soldoutBranch, /append\('active'|set\('active'|active\s*:/);
});

test('E003: un producto simple con stock cero permanece en el catálogo', () => {
  const product = { id: 'simple', active: true, stock: 0, track_stock: true, has_variations: false };
  assert.deepEqual(addVariationPriceSummary([product], []), [product]);
});

test('E003: un producto con todas sus variaciones agotadas permanece visible como agotado', () => {
  const product = { id: 'variable', active: true, track_stock: true, has_variations: true };
  const result = addVariationPriceSummary([product], [
    { product: 'variable', active: true, price_usd: 12, stock: 0, allow_preorder: false, variation_type: 'Sabor', value: 'Vainilla' },
    { product: 'variable', active: true, price_usd: 14, stock: 0, allow_preorder: false, variation_type: 'Sabor', value: 'Chocolate' },
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].variation_public_available, false);
  assert.equal(result[0].variation_public_stock, 0);
  assert.equal(result[0].public_price_usd, 12);
  assert.deepEqual(result[0].variation_public_labels, ['Sabor: Vainilla', 'Sabor: Chocolate']);
});

test('E003: productos con variaciones sin precio público siguen fuera del catálogo', () => {
  const product = { id: 'invalid', active: true, track_stock: true, has_variations: true };
  const result = addVariationPriceSummary([product], [
    { product: 'invalid', active: true, price_usd: 0, stock: 0, allow_preorder: false },
  ]);
  assert.deepEqual(result, []);
});
