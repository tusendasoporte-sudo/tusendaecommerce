import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const products = readFileSync(new URL('../src/pages/admin/products.astro', import.meta.url), 'utf8');

test('editor permite elegir una moneda activa y conserva importes fuente', () => {
  assert.match(products, /id="product-price-currency"/);
  assert.match(products, /loadAllRecords\('currencies', withStoreFilter/);
  assert.match(products, /formData\.append\('price_currency', priceCurrency\.id\)/);
  assert.match(products, /formData\.append\('regular_price_amount'/);
  assert.match(products, /formData\.append\('offer_price_amount'/);
  assert.match(products, /formData\.append\('cost_amount'/);
});

test('cambio de moneda confirma, convierte y mantiene Solo USD como regla separada', () => {
  assert.match(products, /title: 'Cambiar moneda del producto'/);
  assert.match(products, /confirmText: 'Convertir y continuar'/);
  assert.match(products, /amountToUsd\(input\.value, previousCurrency\)/);
  assert.match(products, /usdToAmount\([^\n]+nextCurrency\)/);
  assert.match(products, /Cobrar solo en USD/);
  assert.match(products, /no cambia la moneda en que fijaste el precio/);
});

test('variaciones heredan la moneda y envian sus importes originales', () => {
  assert.match(products, /Esta variación hereda \$\{code\} del producto/);
  assert.match(products, /formData\.append\('price_amount'/);
  assert.match(products, /variationPriceAmount\(variation\)/);
  assert.match(products, /price_currency: nextCurrency\.id/);
});
