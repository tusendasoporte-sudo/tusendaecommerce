import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { addVariationPriceSummary } from '../src/lib/publicProductAvailability.ts';
import { calculateProductActionsMenuPosition } from '../src/lib/adminProductActionsMenu.ts';

const productsAdmin = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

test('E003: primary admin and visibility events keep the control usable', () => {
  assert.match(
    productsAdmin,
    /isCurrentPrimaryProductAdmin[\s\S]*?hasStorePermission\(productPermissionContext, 'catalog\.products\.visibility'\)/,
  );
  assert.match(
    productsAdmin,
    /productForm\?\.addEventListener\('input',[\s\S]*?event\.target === productActiveInput \|\| event\.target === variationActiveInput\) return;[\s\S]*?updateProductFormState\(\)/,
  );
  assert.match(
    productsAdmin,
    /productActiveInput\?\.addEventListener\('input', syncProductManualVisibilityFromControl\);[\s\S]*?productActiveInput\?\.addEventListener\('change', syncProductManualVisibilityFromControl\)/,
  );
  assert.match(productsAdmin, /freshProductForEditor[\s\S]*?cache: 'no-store'[\s\S]*?await freshProductForEditor\(productId\)/);
});

test('E003: la acción de visibilidad no se oculta en móvil y el menú evita las barras fijas', () => {
  assert.doesNotMatch(productsAdmin, /\.row-actions \.js-product-toggle\s*\{\s*display:\s*none/);
  assert.match(productsAdmin, /position:\s*fixed !important;[\s\S]*?--pz-product-actions-max-height/);
  assert.match(
    productsAdmin,
    /\.products-table-card,[\s\S]*?\.list-card[\s\S]*?backdrop-filter:\s*none !important;[\s\S]*?overflow:\s*visible !important;/,
    'la tarjeta opaca no debe crear un bloque contenedor que saque el menú fixed del viewport',
  );

  const nearBottom = calculateProductActionsMenuPosition({
    triggerRect: { top: 650, right: 404, bottom: 694 },
    menuWidth: 210,
    menuHeight: 260,
    viewportWidth: 420,
    viewportHeight: 800,
    topReserved: 96,
    bottomReserved: 98,
  });
  assert.equal(nearBottom.openAbove, true);
  assert.ok(nearBottom.top >= 96);
  assert.ok(nearBottom.top + nearBottom.maxHeight <= 702);
  assert.ok(nearBottom.left >= 12);

  const oversized = calculateProductActionsMenuPosition({
    triggerRect: { top: 310, right: 220, bottom: 354 },
    menuWidth: 500,
    menuHeight: 900,
    viewportWidth: 420,
    viewportHeight: 800,
    topReserved: 96,
    bottomReserved: 98,
  });
  assert.ok(oversized.maxHeight <= 606);
  assert.ok(oversized.top >= 96);
  assert.ok(oversized.top + oversized.maxHeight <= 702);
});

test('E003: el menú y el editor conservan las dos vías autorizadas de visibilidad', () => {
  assert.match(productsAdmin, /catalog\.products\.visibility/);
  assert.match(productsAdmin, /product\.active \? 'Ocultar producto' : 'Mostrar producto'/);
  assert.match(productsAdmin, /id="product-active" type="checkbox" checked disabled=\{!canManageProductVisibility\}/);
  assert.match(productsAdmin, /savedProductWasActive !== productManualActive[\s\S]*?formData\.append\('active', productManualActive \? 'true' : 'false'\)/);
  assert.match(
    productsAdmin,
    /const expirationDate = dateForInput\(productExpirationDateInput\.value\);[\s\S]*?const savedExpirationDate = dateForInput\(savedProduct\?\.expiration_date\);[\s\S]*?isEditing && expirationDate !== savedExpirationDate[\s\S]*?formData\.append\('expiration_date', expirationDate\)/,
    'cambiar visibilidad no debe reenviar un vencimiento sin cambios',
  );
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
