import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productDetail = readFileSync(
  new URL('../src/pages/producto/[slug].astro', import.meta.url),
  'utf8',
);

test('detalle móvil muestra el valor de cada variación sin truncarlo', () => {
  assert.match(productDetail, /const variationType = String\(variation\.variation_type \|\| ''\)\.trim\(\)/);
  assert.match(productDetail, /const variationValue = String\(variation\.value \|\| ''\)\.trim\(\)/);
  assert.match(productDetail, /\{variation\.variationType \|\| 'Opción'\}/);
  assert.match(productDetail, /\{variation\.variationValue \|\| variation\.variationLabel\}/);
  assert.match(productDetail, /whitespace-normal break-words/);
  assert.match(productDetail, /inline-flex shrink-0 items-center whitespace-nowrap/);
  assert.match(productDetail, /\{variations\.length\} \{variations\.length === 1 \? 'opción' : 'opciones'\}/);

  const checkboxView = productDetail.slice(
    productDetail.indexOf('id="variation-checkbox-list"'),
    productDetail.indexOf('id="variation-options"'),
  );
  assert.equal(checkboxView.includes('truncate'), false);
});
