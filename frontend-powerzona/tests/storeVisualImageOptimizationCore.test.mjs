import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STORE_VISUAL_IMAGE_WEBP_QUALITY,
  buildStoreVisualWebpFilename,
  getStoreVisualImageDimensions,
  optimizeStoreVisualImageFile,
  shouldConvertStoreVisualImageType,
  shouldUseStoreVisualWebp,
} from '../src/lib/storeVisualImageOptimizationCore.js';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const organization = read('../src/pages/admin/organization.astro');
const promos = read('../src/pages/admin/promos.astro');
const storeSettings = read('../src/pages/admin/store-settings.astro');

test('solo JPEG y PNG son candidatos; WebP no se vuelve a convertir', () => {
  assert.equal(shouldConvertStoreVisualImageType('image/jpeg'), true);
  assert.equal(shouldConvertStoreVisualImageType('image/jpg'), true);
  assert.equal(shouldConvertStoreVisualImageType('IMAGE/PNG'), true);
  assert.equal(shouldConvertStoreVisualImageType('image/webp'), false);
  assert.equal(shouldConvertStoreVisualImageType('image/gif'), false);
  assert.equal(shouldConvertStoreVisualImageType('image/svg+xml'), false);
});

test('limita a 1200x675 sin recortar, ampliar ni cambiar proporcion', () => {
  assert.deepEqual(getStoreVisualImageDimensions(1600, 900), { width: 1200, height: 675 });
  assert.deepEqual(getStoreVisualImageDimensions(1024, 1024), { width: 675, height: 675 });
  assert.deepEqual(getStoreVisualImageDimensions(750, 728), { width: 695, height: 675 });
  assert.deepEqual(getStoreVisualImageDimensions(600, 400), { width: 600, height: 400 });
  assert.deepEqual(getStoreVisualImageDimensions(0, 400), { width: 0, height: 0 });
});

test('solo usa WebP cuando reduce bytes y mantiene un nombre seguro', () => {
  assert.equal(shouldUseStoreVisualWebp(1000, 999), true);
  assert.equal(shouldUseStoreVisualWebp(1000, 1000), false);
  assert.equal(shouldUseStoreVisualWebp(1000, 1001), false);
  assert.equal(buildStoreVisualWebpFilename(' Promo Principal.PNG '), 'promo_principal_visual.webp');
});

test('optimiza un visual grande conservando proporcion y cerrando el decoder', async () => {
  let closed = false;
  let encodeOptions = null;
  const original = { name: 'Acceso rápido.png', type: 'image/png', size: 1318575 };
  const result = await optimizeStoreVisualImageFile(original, {
    decodeImage: async () => ({ width: 1024, height: 1024, close: () => { closed = true; } }),
    encodeWebp: async (_decoded, options) => {
      encodeOptions = options;
      return { size: 41438, type: 'image/webp' };
    },
    createFile: (blob, name, options) => ({ blob, name, ...options, size: blob.size }),
    now: () => 1234,
  });

  assert.deepEqual(encodeOptions, { width: 675, height: 675, quality: STORE_VISUAL_IMAGE_WEBP_QUALITY });
  assert.equal(result.name, 'acceso_r_pido_visual.webp');
  assert.equal(result.size, 41438);
  assert.equal(result.lastModified, 1234);
  assert.equal(closed, true);
});

test('conserva el original ante WebP mayor, formato incorrecto o fallo', async () => {
  const original = { name: 'visual.jpg', type: 'image/jpeg', size: 100 };
  const larger = await optimizeStoreVisualImageFile(original, {
    decodeImage: async () => ({ width: 200, height: 100 }),
    encodeWebp: async () => ({ size: 100, type: 'image/webp' }),
  });
  const wrongFormat = await optimizeStoreVisualImageFile(original, {
    decodeImage: async () => ({ width: 200, height: 100 }),
    encodeWebp: async () => ({ size: 50, type: 'image/png' }),
  });
  const failed = await optimizeStoreVisualImageFile(original, {
    decodeImage: async () => { throw new Error('decoder'); },
  });

  assert.equal(larger, original);
  assert.equal(wrongFormat, original);
  assert.equal(failed, original);
});

test('los tres paneles usan el optimizador visual compartido', () => {
  for (const source of [organization, promos, storeSettings]) {
    assert.match(source, /storeVisualImageOptimizationCore\.js/);
    assert.match(source, /pzStoreVisualImageOptimizer/);
    assert.match(source, /optimizeStoreVisualImageFile\(file\)/);
  }
});
