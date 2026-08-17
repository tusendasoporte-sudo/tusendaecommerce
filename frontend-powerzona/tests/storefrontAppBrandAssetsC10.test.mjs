import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import {
  normalizeStorefrontAppBrandAsset,
  STOREFRONT_APP_BRAND_NORMALIZER_VERSION,
  StorefrontAppBrandAssetError,
} from '../src/lib/storefrontAppBrandAssets.ts';

function fileLike(buffer, name, type) {
  return {
    name,
    type,
    size: buffer.byteLength,
    async arrayBuffer() { return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength); },
  };
}

const deterministicRandom = () => Buffer.alloc(16, 0xab);

test('normaliza icono a PNG 1024x1024 reproducible sin recortar', async () => {
  const source = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#155EEB' },
  }).jpeg({ quality: 91 }).toBuffer();
  const first = await normalizeStorefrontAppBrandAsset(
    fileLike(source, 'marca.jpg', 'image/jpeg'),
    'icon',
    { randomSource: deterministicRandom },
  );
  const second = await normalizeStorefrontAppBrandAsset(
    fileLike(source, 'marca.jpg', 'image/jpeg'),
    'icon',
    { randomSource: deterministicRandom },
  );
  const metadata = await sharp(first.buffer).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 1024);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.filename, `icon-${'ab'.repeat(16)}.png`);
  assert.equal(first.normalizerVersion, STOREFRONT_APP_BRAND_NORMALIZER_VERSION);
});

test('normaliza splash a PNG vertical 1080x1920 opaco', async () => {
  const source = await sharp({
    create: { width: 700, height: 700, channels: 4, background: { r: 104, g: 71, b: 232, alpha: 0.6 } },
  }).webp().toBuffer();
  const result = await normalizeStorefrontAppBrandAsset(
    fileLike(source, 'splash.webp', 'image/webp'),
    'splash',
    { randomSource: deterministicRandom },
  );
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1920);
  assert.equal(metadata.hasAlpha, false);
  assert.equal(result.sourceWidth, 700);
  assert.equal(result.sourceHeight, 700);
});

test('rechaza extensiones, MIME y contenido que no coinciden', async () => {
  const png = await sharp({
    create: { width: 100, height: 100, channels: 3, background: '#FFFFFF' },
  }).png().toBuffer();
  await assert.rejects(
    normalizeStorefrontAppBrandAsset(fileLike(png, 'icono.jpg', 'image/jpeg'), 'icon'),
    (error) => error instanceof StorefrontAppBrandAssetError && error.code === 'brand_asset_type_mismatch',
  );
  await assert.rejects(
    normalizeStorefrontAppBrandAsset(fileLike(png, '../icono.png', 'image/png'), 'icon'),
    (error) => error instanceof StorefrontAppBrandAssetError && error.code === 'brand_asset_name_invalid',
  );
});
