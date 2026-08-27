import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPromoUploadImageFilename,
  getPromoUploadImageDimensions,
  optimizePromoUploadImageFile,
  PROMO_UPLOAD_IMAGE_TARGET_BYTES,
} from '../src/lib/promoImageOptimizationCore.js';

test('calcula dimensiones de transporte sin deformar cada uso Promo', () => {
  assert.deepEqual(getPromoUploadImageDimensions('hero', 2048, 1365), { width: 1620, height: 1080 });
  assert.deepEqual(getPromoUploadImageDimensions('gallery', 2400, 1800), { width: 1600, height: 1200 });
  assert.deepEqual(getPromoUploadImageDimensions('owner', 1600, 2000), { width: 1200, height: 1500 });
  assert.deepEqual(getPromoUploadImageDimensions('video_poster', 1920, 1080), { width: 1600, height: 900 });
});

test('normaliza el nombre del archivo convertido', () => {
  assert.equal(buildPromoUploadImageFilename('Foto de sala FINAL.png'), 'foto_de_sala_final_promo.webp');
});

test('convierte una imagen pesada antes de transportarla al servidor', async () => {
  const original = { name: 'portada.png', type: 'image/png', size: 3 * 1024 * 1024 };
  const calls = [];
  let closed = false;
  const result = await optimizePromoUploadImageFile(original, 'hero', {
    decodeImage: async () => ({ width: 2048, height: 1365, close: () => { closed = true; } }),
    encodeWebp: async (_decoded, options) => {
      calls.push(options);
      return { type: 'image/webp', size: 420 * 1024 };
    },
    createFile: (blob, name, options) => ({ blob, name, ...options, size: blob.size }),
    now: () => 123,
  });

  assert.equal(result.type, 'image/webp');
  assert.equal(result.name, 'portada_promo.webp');
  assert.ok(result.size <= PROMO_UPLOAD_IMAGE_TARGET_BYTES);
  assert.deepEqual(calls[0], { width: 1620, height: 1080, quality: 0.84 });
  assert.equal(closed, true);
});

test('conserva una imagen pequeña que ya cabe en transporte y política', async () => {
  const original = { name: 'lista.webp', type: 'image/webp', size: 120 * 1024 };
  const result = await optimizePromoUploadImageFile(original, 'gallery', {
    decodeImage: async () => ({ width: 1200, height: 900, close() {} }),
  });
  assert.equal(result, original);
});
