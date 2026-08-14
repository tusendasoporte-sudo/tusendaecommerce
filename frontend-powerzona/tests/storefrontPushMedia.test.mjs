import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';

import {
  buildStorefrontPushMediaPublicUrl,
  optimizeStorefrontPushMediaUpload,
  randomStorefrontPushMediaFilename,
  STOREFRONT_PUSH_MEDIA_INPUT_MAX_BYTES,
  STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_BYTES,
  STOREFRONT_PUSH_MEDIA_MAX_CONCURRENT_CONVERSIONS,
  StorefrontPushMediaError,
  storefrontPushMediaSameOriginMutation,
  withStorefrontPushMediaConversionSlot,
} from '../src/lib/storefrontPushMedia.ts';

function fileLike(buffer, name, type, size = buffer.byteLength) {
  return {
    name,
    type,
    size,
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

function assertCode(code) {
  return (error) => error instanceof StorefrontPushMediaError && error.code === code;
}

test('PNG válido termina como WebP acotado, sin nombre original y con SHA-256', async () => {
  const png = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: '#2458b8' },
  }).png().toBuffer();
  const result = await optimizeStorefrontPushMediaUpload(
    fileLike(png, 'oferta verano.png', 'image/png'),
    { randomSource: () => Buffer.alloc(16, 0xab) },
  );
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(result.filename, `${'ab'.repeat(16)}.webp`);
  assert.equal(result.mime, 'image/webp');
  assert.equal(result.sourceFormat, 'png');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1120);
  assert.equal(metadata.height, 630);
  assert.equal(result.bytes <= STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_BYTES, true);
  assert.equal(STOREFRONT_PUSH_MEDIA_OUTPUT_MAX_BYTES, 100 * 1024);
  assert.equal(result.quality <= 82 && result.quality >= 28, true);
});

test('una foto ruidosa tambien queda en WebP de 100 KiB o menos', async () => {
  const pixels = randomBytes(1600 * 900 * 3);
  const jpeg = await sharp(pixels, {
    raw: { width: 1600, height: 900, channels: 3 },
  }).jpeg({ quality: 95 }).toBuffer();
  const result = await optimizeStorefrontPushMediaUpload(
    fileLike(jpeg, 'foto compleja.jpg', 'image/jpeg'),
  );
  assert.equal(result.bytes <= 100 * 1024, true);
  assert.equal((await sharp(result.buffer).metadata()).format, 'webp');
});

test('serializa conversiones para proteger CPU y memoria del servidor', async () => {
  assert.equal(STOREFRONT_PUSH_MEDIA_MAX_CONCURRENT_CONVERSIONS, 1);
  let releaseFirst;
  let active = 0;
  let peak = 0;
  const first = withStorefrontPushMediaConversionSlot(async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => { releaseFirst = resolve; });
    active -= 1;
    return 'first';
  });
  const second = withStorefrontPushMediaConversionSlot(async () => {
    active += 1;
    peak = Math.max(peak, active);
    active -= 1;
    return 'second';
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 1);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.equal(peak, 1);
});

test('corrige orientación al recodificar y elimina EXIF/metadatos', async () => {
  const jpeg = await sharp({
    create: { width: 400, height: 800, channels: 3, background: '#ffffff' },
  }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const sourceMetadata = await sharp(jpeg).metadata();
  assert.equal(sourceMetadata.orientation, 6);

  const result = await optimizeStorefrontPushMediaUpload(
    fileLike(jpeg, 'vertical.jpg', 'image/jpeg'),
  );
  const outputMetadata = await sharp(result.buffer).metadata();
  assert.equal(outputMetadata.width, 800);
  assert.equal(outputMetadata.height, 400);
  assert.equal(outputMetadata.orientation, undefined);
  assert.equal(outputMetadata.exif, undefined);
  assert.equal(outputMetadata.icc, undefined);
});

test('rechaza corruptos, SVG disfrazado y extensión/MIME falsificados', async () => {
  await assert.rejects(
    optimizeStorefrontPushMediaUpload(fileLike(Buffer.from('not-an-image'), 'oferta.png', 'image/png')),
    assertCode('media_corrupt'),
  );
  await assert.rejects(
    optimizeStorefrontPushMediaUpload(fileLike(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      'oferta.png',
      'image/png',
    )),
    (error) => ['media_corrupt', 'media_type_invalid'].includes(error.code),
  );
  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#000000' },
  }).jpeg().toBuffer();
  await assert.rejects(
    optimizeStorefrontPushMediaUpload(fileLike(jpeg, 'oferta.png', 'image/png')),
    assertCode('media_type_mismatch'),
  );
  await assert.rejects(
    optimizeStorefrontPushMediaUpload(fileLike(jpeg, 'oferta.jpg', 'image/webp')),
    assertCode('media_type_mismatch'),
  );
});

test('bloquea traversal, dobles extensiones, ejecutables y consumo por tamaño', async () => {
  const jpeg = await sharp({
    create: { width: 20, height: 20, channels: 3, background: '#000000' },
  }).jpeg().toBuffer();
  for (const name of [
    '../oferta.jpg',
    '..\\oferta.jpg',
    'factura.pdf.exe.jpg',
    'oferta.jpg.exe',
    '.hidden.jpg',
  ]) {
    await assert.rejects(
      optimizeStorefrontPushMediaUpload(fileLike(jpeg, name, 'image/jpeg')),
      assertCode('media_name_invalid'),
      name,
    );
  }

  let bodyRead = false;
  await assert.rejects(
    optimizeStorefrontPushMediaUpload({
      name: 'grande.jpg',
      type: 'image/jpeg',
      size: STOREFRONT_PUSH_MEDIA_INPUT_MAX_BYTES + 1,
      async arrayBuffer() { bodyRead = true; return new ArrayBuffer(0); },
    }),
    assertCode('media_input_too_large'),
  );
  assert.equal(bodyRead, false);
});

test('rechaza dimensiones superiores a 6000 px aunque el archivo pese poco', async () => {
  const oversized = await sharp({
    create: { width: 6001, height: 1, channels: 3, background: '#ffffff' },
  }).png().toBuffer();
  await assert.rejects(
    optimizeStorefrontPushMediaUpload(fileLike(oversized, 'panorama.png', 'image/png')),
    assertCode('media_dimensions_too_large'),
  );
});

test('nombre de 128 bits y URL pública nunca aceptan rutas manipuladas', () => {
  assert.equal(
    randomStorefrontPushMediaFilename(() => Buffer.alloc(16, 0xcd)),
    `${'cd'.repeat(16)}.webp`,
  );
  assert.equal(
    buildStorefrontPushMediaPublicUrl(
      'https://media.tusenda84.com',
      'media0000000001',
      `${'ab'.repeat(16)}_x1y2z3.webp`,
    ),
    `https://media.tusenda84.com/api/pz/storefront/v1/media/file/media0000000001/${'ab'.repeat(16)}_x1y2z3.webp`,
  );
  assert.throws(
    () => buildStorefrontPushMediaPublicUrl('https://media.tusenda84.com', 'media0000000001', '../evil.webp'),
    assertCode('media_record_invalid'),
  );
  assert.throws(
    () => buildStorefrontPushMediaPublicUrl('https://user:pass@example.com', 'media0000000001', 'safe.webp'),
    assertCode('media_origin_invalid'),
  );
  assert.throws(
    () => buildStorefrontPushMediaPublicUrl('http://media.example.com', 'media0000000001', 'safe.webp'),
    assertCode('media_origin_invalid'),
  );
});

test('origen administrativo acepta HTTPS directo o proxy coherente y rechaza cruces', () => {
  assert.equal(storefrontPushMediaSameOriginMutation(new Request('https://staging.example/api/admin/push-media', {
    method: 'POST',
    headers: { origin: 'https://staging.example', 'sec-fetch-site': 'same-origin' },
  })), true);
  assert.equal(storefrontPushMediaSameOriginMutation(new Request('http://staging.example/api/admin/push-media', {
    method: 'POST',
    headers: {
      origin: 'https://staging.example',
      'sec-fetch-site': 'same-origin',
      'x-forwarded-host': 'staging.example',
      'x-forwarded-proto': 'https',
    },
  })), true);
  assert.equal(storefrontPushMediaSameOriginMutation(new Request('http://staging.example/api/admin/push-media', {
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      'x-forwarded-host': 'staging.example',
      'x-forwarded-proto': 'https',
    },
  })), false);
  assert.equal(storefrontPushMediaSameOriginMutation(new Request('http://staging.example/api/admin/push-media', {
    method: 'POST',
    headers: {
      origin: 'https://staging.example',
      'x-forwarded-host': 'evil.example',
      'x-forwarded-proto': 'https',
    },
  })), false);
});

test('API SSR impone origen, payload exacto, auth y nunca escribe en disco efímero', () => {
  const apiSource = readFileSync(
    new URL('../src/pages/api/admin/push-media.ts', import.meta.url),
    'utf8',
  );
  const coreSource = readFileSync(
    new URL('../src/lib/storefrontPushMedia.ts', import.meta.url),
    'utf8',
  );
  assert.match(apiSource, /storefrontPushMediaSameOriginMutation/);
  assert.match(apiSource, /exactFormData\(formData, \['file'\]\)/);
  assert.match(apiSource, /requireStorefrontPushMediaAccess/);
  assert.match(apiSource, /searchParams\.get\('store'\)/);
  assert.match(apiSource, /requireCurrentStoreForAdmin\(authPb, \{ storeSlug: supportStoreSlug \}\)/);
  assert.match(apiSource, /serverPocketBaseUrl/);
  assert.match(apiSource, /\/api\/pz\/storefront\/v1\/media\/upload/);
  assert.doesNotMatch(apiSource, /writeFile|createWriteStream|mkdtemp|\.collection\(['"]push_media/);
  assert.match(coreSource, /\.rotate\(\)/);
  assert.match(coreSource, /\.webp\(\{ quality/);
  assert.doesNotMatch(coreSource, /withMetadata\(/);
});
