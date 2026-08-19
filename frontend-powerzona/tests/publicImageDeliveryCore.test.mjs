import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getPublicImageDeliveryOptions } from '../src/lib/publicImageDeliveryCore.js';

const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');

test('WebP optimizado se entrega directamente', () => {
  assert.deepEqual(getPublicImageDeliveryOptions('producto.webp', '300x300'), {});
  assert.deepEqual(getPublicImageDeliveryOptions('PRODUCTO.WEBP', '300x300'), {});
  assert.deepEqual(getPublicImageDeliveryOptions(' producto.webp ', '300x300'), {});
});

test('formatos heredados conservan la miniatura solicitada', () => {
  assert.deepEqual(getPublicImageDeliveryOptions('producto.jpg', '300x300'), { thumb: '300x300' });
  assert.deepEqual(getPublicImageDeliveryOptions('producto.jpeg', '300x300'), { thumb: '300x300' });
  assert.deepEqual(getPublicImageDeliveryOptions('producto.png', '300x300'), { thumb: '300x300' });
  assert.deepEqual(getPublicImageDeliveryOptions('producto.webp.png', '300x300'), { thumb: '300x300' });
});

test('detalle sin miniatura conserva cualquier formato original', () => {
  assert.deepEqual(getPublicImageDeliveryOptions('producto.jpg', ''), {});
  assert.deepEqual(getPublicImageDeliveryOptions('producto.png', null), {});
});

test('listados publicos de productos aplican la decision por archivo', () => {
  assert.match(api, /getPocketBaseFileUrl\('products', product\.id, filename, getPublicImageDeliveryOptions\(filename, thumb\)\)/);
  assert.match(api, /\.map\(\(product\) => addProductImages\(product, options, PUBLIC_PRODUCT_THUMB\)\)/);
  assert.match(api, /const PUBLIC_PRODUCT_THUMB = '300x300'/);
});

test('tarjetas de taxonomia evitan miniaturas PNG para WebP optimizado', () => {
  assert.match(
    api,
    /getPocketBaseFileUrl\(\s*'categories',\s*category\.id,\s*image,\s*getPublicImageDeliveryOptions\(image, PUBLIC_TAXONOMY_CARD_THUMB\)/
  );
  assert.match(
    api,
    /getPocketBaseFileUrl\(\s*'subcategories',\s*subcategory\.id,\s*image,\s*getPublicImageDeliveryOptions\(image, PUBLIC_TAXONOMY_CARD_THUMB\)/
  );
});
