import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import sharp from 'sharp';

import {
  optimizePromoImage,
  preparePromoMedia,
  probePromoMp4,
  PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES,
  PromoMediaError,
  validatePromoVideo,
} from '../src/lib/promoMedia.ts';

function fileLike(buffer, name, type, size = buffer.byteLength) {
  return {
    name, type, size,
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

function box(type, payload) {
  const result = Buffer.alloc(payload.length + 8);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, 'ascii');
  payload.copy(result, 8);
  return result;
}

function mp4Bytes(width = 1280, height = 720, durationMs = 5000) {
  const ftypPayload = Buffer.alloc(16);
  ftypPayload.write('isom', 0, 4, 'ascii');
  const mvhdPayload = Buffer.alloc(100);
  mvhdPayload.writeUInt32BE(1000, 12);
  mvhdPayload.writeUInt32BE(durationMs, 16);
  const tkhdPayload = Buffer.alloc(84);
  tkhdPayload.writeUInt32BE(width * 65536, 76);
  tkhdPayload.writeUInt32BE(height * 65536, 80);
  const hdlrPayload = Buffer.alloc(24);
  hdlrPayload.write('vide', 8, 4, 'ascii');
  return Buffer.concat([
    box('ftyp', ftypPayload),
    box('moov', Buffer.concat([
      box('mvhd', mvhdPayload),
      box('trak', Buffer.concat([box('tkhd', tkhdPayload), box('mdia', box('hdlr', hdlrPayload))])),
    ])),
    box('mdat', Buffer.alloc(32, 1)),
  ]);
}

function code(expected) {
  return (error) => error instanceof PromoMediaError && error.code === expected;
}

test('Hero JPEG se normaliza a WebP <=100 KiB, sin EXIF ni nombre original', async () => {
  const jpeg = await sharp({
    create: { width: 1800, height: 1000, channels: 3, background: '#9b7734' },
  }).jpeg({ quality: 94 }).withMetadata({ orientation: 1 }).toBuffer();
  const result = await optimizePromoImage(
    fileLike(jpeg, 'Hero del negocio.jpg', 'image/jpeg'),
    'hero',
    { randomSource: () => Buffer.alloc(16, 0xab) },
  );
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(result.filename, `${'ab'.repeat(16)}.webp`);
  assert.equal(result.kind, 'image');
  assert.equal(result.purpose, 'hero');
  assert.equal(result.bytes <= PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES, true);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.deepEqual([result.width, result.height], [959, 540]);
  assert.equal(Math.floor(result.width / 2) < 480, true, 'PocketBase no debe derivar w480');
});

test('perfiles visuales respetan dimensiones y evitan miniaturas PNG de PocketBase', async () => {
  const cases = [
    ['service', 1200, 1200, 639, 639, 320],
    ['gallery', 1600, 1200, 959, 720, 480],
    ['owner', 900, 1400, 639, 852, 320],
    ['footer', 1600, 800, 959, 480, 480],
    ['social', 1200, 630, 1199, 630, 600],
    ['video_poster', 1600, 900, 959, 540, 480],
  ];
  for (const [purpose, width, height, expectedWidth, expectedHeight, firstVariant] of cases) {
    const png = await sharp({ create: { width, height, channels: 3, background: '#202020' } }).png().toBuffer();
    const result = await optimizePromoImage(fileLike(png, `${purpose}.png`, 'image/png'), purpose);
    assert.equal(result.purpose, purpose);
    assert.equal(result.bytes <= 100 * 1024, true);
    assert.deepEqual([result.width, result.height], [expectedWidth, expectedHeight]);
    assert.equal(Math.floor(result.width / 2) < firstVariant, true);
  }
});

test('AVIF detectado por contenido se normaliza a WebP sin metadata heredada', async () => {
  const avif = await sharp({
    create: { width: 1200, height: 630, channels: 3, background: '#4d3824' },
  }).avif({ quality: 70 }).toBuffer();
  const result = await optimizePromoImage(fileLike(avif, 'portada.avif', 'image/avif'), 'hero');
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(result.mime, 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});

test('logo y QR pequeños se normalizan sin recorte ni rechazo por dimensiones', async () => {
  const logo = await sharp({
    create: { width: 96, height: 48, channels: 4, background: { r: 196, g: 154, b: 62, alpha: 0.5 } },
  }).png().toBuffer();
  const normalizedLogo = await optimizePromoImage(fileLike(logo, 'logo-pequeno.png', 'image/png'), 'logo');
  const logoMetadata = await sharp(normalizedLogo.buffer).metadata();
  assert.equal(normalizedLogo.width, 511);
  assert.equal(normalizedLogo.height, 256);
  assert.equal(logoMetadata.hasAlpha, true);
  assert.equal(normalizedLogo.bytes <= PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES, true);

  const qr = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#ffffff' },
  }).png().toBuffer();
  const normalizedQr = await optimizePromoImage(fileLike(qr, 'qr-pequeno.png', 'image/png'), 'qr');
  assert.equal(normalizedQr.width, 512);
  assert.equal(normalizedQr.height, 512);
  assert.equal(normalizedQr.bytes <= PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES, true);
});

test('foto compleja de QR usa compresión progresiva cuando la variante lossless supera 100 KiB', async () => {
  const width = 1400;
  const height = 900;
  const pixels = Buffer.alloc(width * height * 3);
  let state = 0x12345678;
  for (let index = 0; index < pixels.length; index += 1) {
    state = ((state * 1664525) + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  const photo = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const lossless = await sharp(photo)
    .resize({ width: 512, height: 512, fit: 'contain', background: '#ffffff' })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  assert.equal(lossless.byteLength > PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES, true);

  const normalized = await optimizePromoImage(fileLike(photo, 'foto-del-qr.png', 'image/png'), 'qr');
  assert.equal(normalized.width, 512);
  assert.equal(normalized.height, 512);
  assert.equal(normalized.bytes <= PROMO_MEDIA_IMAGE_OUTPUT_MAX_BYTES, true);
});

test('imagen rechaza SVG disfrazado, MIME/extensión cruzados y dimensiones insuficientes', async () => {
  await assert.rejects(
    optimizePromoImage(fileLike(Buffer.from('<svg><script>alert(1)</script></svg>'), 'hero.png', 'image/png'), 'hero'),
    (error) => ['promo_media_corrupt', 'promo_media_type_mismatch'].includes(error.code),
  );
  const jpeg = await sharp({ create: { width: 800, height: 400, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  await assert.rejects(optimizePromoImage(fileLike(jpeg, 'hero.png', 'image/png'), 'hero'), code('promo_media_type_mismatch'));
  const tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  await assert.rejects(optimizePromoImage(fileLike(tiny, 'hero.jpg', 'image/jpeg'), 'hero'), code('promo_media_dimensions_invalid'));
});

test('video MP4 usa metadata real, exige poster y conserva bytes optimizados', async () => {
  const mp4 = mp4Bytes();
  assert.deepEqual(probePromoMp4(mp4), { mime: 'video/mp4', width: 1280, height: 720, durationMs: 5000 });
  assert.equal(probePromoMp4(Buffer.concat([mp4, box('uuid', Buffer.from('PII'))])), null);
  const result = await validatePromoVideo(
    fileLike(mp4, 'trabajo.mp4', 'video/mp4'),
    'gallery',
    'poster000000001',
    { randomSource: () => Buffer.alloc(16, 0xcd) },
  );
  assert.equal(result.filename, `${'cd'.repeat(16)}.mp4`);
  assert.equal(result.durationMs, 5000);
  assert.equal(result.posterAssetId, 'poster000000001');
  assert.deepEqual(result.buffer, mp4);
  await assert.rejects(
    validatePromoVideo(fileLike(mp4, 'trabajo.mp4', 'video/mp4'), 'gallery', ''),
    code('promo_media_poster_required'),
  );
  await assert.rejects(
    validatePromoVideo(fileLike(Buffer.from('<html>'), 'trabajo.mp4', 'video/mp4'), 'gallery', 'poster000000001'),
    code('promo_media_corrupt'),
  );
});

test('dispatcher separa imágenes y video sin aceptar tipos activos', async () => {
  const poster = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#000' } }).png().toBuffer();
  assert.equal((await preparePromoMedia(fileLike(poster, 'poster.png', 'image/png'), 'video_poster', '')).kind, 'image');
  await assert.rejects(
    preparePromoMedia(fileLike(Buffer.from('<svg/>'), 'asset.svg', 'image/svg+xml'), 'hero', ''),
    code('promo_media_type_invalid'),
  );
});

test('API SSR aplica auth central, origen, payload exacto y delega al backend Promo', () => {
  const source = readFileSync(new URL('../src/pages/api/admin/promo-media.ts', import.meta.url), 'utf8');
  assert.match(source, /refreshAuthFromCookie/);
  assert.match(source, /requireCurrentStoreForAdmin/);
  assert.match(source, /storefrontPushMediaSameOriginMutation/);
  assert.match(source, /exactFormData\(formData, \['file', 'poster_asset_id', 'purpose'\]\)/);
  assert.match(source, /\/api\/pz\/promo\/private\/v1\/media\/upload/);
  assert.match(source, /X-PZ-Promo-Store/);
  assert.doesNotMatch(source, /writeFile|createWriteStream|mkdtemp|Cloudflare|Coolify/);
});
