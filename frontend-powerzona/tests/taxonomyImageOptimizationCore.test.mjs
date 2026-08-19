import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TAXONOMY_IMAGE_WEBP_QUALITY,
  buildTaxonomyWebpFilename,
  getPreservedTaxonomyImageDimensions,
  isTaxonomyWebpBlob,
  optimizeTaxonomyImageFile,
  shouldConvertTaxonomyImageType,
  shouldUseTaxonomyWebp,
} from '../src/lib/taxonomyImageOptimizationCore.js';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const adminCatalog = read('../src/pages/admin/catalog.astro');
const adminCategory = read('../src/pages/admin/catalog/category/[id].astro');
const adminProducts = read('../src/pages/admin/products.astro');

test('solo JPEG y PNG son candidatos a conversion', () => {
  assert.equal(shouldConvertTaxonomyImageType('image/jpeg'), true);
  assert.equal(shouldConvertTaxonomyImageType('image/jpg'), true);
  assert.equal(shouldConvertTaxonomyImageType('IMAGE/PNG'), true);
  assert.equal(shouldConvertTaxonomyImageType('image/webp'), false);
  assert.equal(shouldConvertTaxonomyImageType('image/gif'), false);
  assert.equal(shouldConvertTaxonomyImageType('image/svg+xml'), false);
});

test('las dimensiones y la proporcion se conservan sin recorte ni ampliacion', () => {
  assert.deepEqual(getPreservedTaxonomyImageDimensions(748, 350), { width: 748, height: 350 });
  assert.deepEqual(getPreservedTaxonomyImageDimensions(1024, 1024), { width: 1024, height: 1024 });
  assert.deepEqual(getPreservedTaxonomyImageDimensions(1080, 1080), { width: 1080, height: 1080 });
});

test('WebP se selecciona unicamente cuando reduce bytes', () => {
  assert.equal(isTaxonomyWebpBlob({ type: 'image/webp' }), true);
  assert.equal(isTaxonomyWebpBlob({ type: 'image/png' }), false);
  assert.equal(shouldUseTaxonomyWebp(1000, 999), true);
  assert.equal(shouldUseTaxonomyWebp(1000, 1000), false);
  assert.equal(shouldUseTaxonomyWebp(1000, 1001), false);
  assert.equal(shouldUseTaxonomyWebp(0, 1), false);
});

test('el nombre WebP no promete dimensiones fijas', () => {
  assert.equal(buildTaxonomyWebpFilename(' Foto de Aminos.JPEG '), 'foto_de_aminos_catalogo.webp');
  assert.equal(buildTaxonomyWebpFilename('***.png'), 'catalogo_catalogo.webp');
});

test('la optimizacion conserva dimensiones y crea WebP menor', async () => {
  let closed = false;
  let encodeOptions = null;
  const original = { name: 'Mass Gainer.png', type: 'image/png', size: 620600 };
  const result = await optimizeTaxonomyImageFile(original, {
    decodeImage: async () => ({ width: 1024, height: 1024, close: () => { closed = true; } }),
    encodeWebp: async (_decoded, options) => {
      encodeOptions = options;
      return { size: 41292, type: 'image/webp' };
    },
    createFile: (blob, name, options) => ({ blob, name, ...options, size: blob.size }),
    now: () => 1234,
  });

  assert.deepEqual(encodeOptions, { width: 1024, height: 1024, quality: TAXONOMY_IMAGE_WEBP_QUALITY });
  assert.equal(result.name, 'mass_gainer_catalogo.webp');
  assert.equal(result.type, 'image/webp');
  assert.equal(result.size, 41292);
  assert.equal(result.lastModified, 1234);
  assert.equal(closed, true);
});

test('conserva el original cuando la salida no es WebP, no es menor o la conversion falla', async () => {
  const original = { name: 'ligera.jpg', type: 'image/jpeg', size: 100 };
  const wrongFormat = await optimizeTaxonomyImageFile(original, {
    decodeImage: async () => ({ width: 200, height: 100 }),
    encodeWebp: async () => ({ size: 50, type: 'image/png' }),
  });
  const larger = await optimizeTaxonomyImageFile(original, {
    decodeImage: async () => ({ width: 200, height: 100 }),
    encodeWebp: async () => ({ size: 100, type: 'image/webp' }),
  });
  const failed = await optimizeTaxonomyImageFile(original, {
    decodeImage: async () => { throw new Error('decoder'); },
  });

  assert.equal(wrongFormat, original);
  assert.equal(larger, original);
  assert.equal(failed, original);
});

test('los tres flujos de taxonomia usan el optimizador compartido', () => {
  for (const source of [adminCatalog, adminCategory, adminProducts]) {
    assert.match(source, /taxonomyImageOptimizationCore\.js/);
    assert.match(source, /pzTaxonomyImageOptimizer/);
  }

  assert.match(adminCatalog, /formData\.append\('image', await optimizeCatalogImageFile\(/);
  assert.match(adminCategory, /formData\.append\('image', await optimizeCatalogImageFile\(/);
  assert.match(adminProducts, /optimizeTaxonomyImageFile\(quickCategoryImage\.files\[0\]\)/);
  assert.match(adminProducts, /optimizeTaxonomyImageFile\(quickSubcategoryImage\.files\[0\]\)/);
  assert.match(adminProducts, /optimizeCatalogLikeImageFile\(variationImageInput\.files\[0\]\)/);
});
