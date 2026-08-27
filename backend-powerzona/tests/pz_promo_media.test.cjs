const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const media = require('../pb_hooks/pz_promo_media_lib.js');
const api = require('../pb_hooks/pz_promo_media_api_lib.js');
const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');
const i18n = require('../pb_hooks/pz_promo_i18n_lib.js');

function webpBytes(width = 1200, height = 630) {
  const bytes = new Uint8Array(30);
  Buffer.from('RIFF').copy(bytes, 0);
  bytes[4] = 22;
  Buffer.from('WEBP').copy(bytes, 8);
  Buffer.from('VP8 ').copy(bytes, 12);
  bytes[16] = 10;
  bytes[23] = 0x9d;
  bytes[24] = 0x01;
  bytes[25] = 0x2a;
  bytes[26] = width & 255;
  bytes[27] = (width >> 8) & 255;
  bytes[28] = height & 255;
  bytes[29] = (height >> 8) & 255;
  return bytes;
}

function uploadedFile(bytes, name) {
  return {
    originalName: name,
    name,
    size: bytes.length,
    reader: {
      open() {
        let offset = 0;
        return {
          read(target) {
            if (offset >= bytes.length) return 0;
            const count = Math.min(target.length, bytes.length - offset);
            for (let index = 0; index < count; index += 1) target[index] = bytes[offset + index];
            offset += count;
            return count;
          },
          close() {},
        };
      },
    },
  };
}

function writeU32(buffer, offset, value) {
  buffer.writeUInt32BE(value >>> 0, offset);
}

function box(type, payload) {
  const result = Buffer.alloc(payload.length + 8);
  writeU32(result, 0, result.length);
  result.write(type, 4, 4, 'ascii');
  payload.copy(result, 8);
  return result;
}

function mp4Bytes(width = 1280, height = 720, durationMs = 5000) {
  const ftypPayload = Buffer.alloc(16);
  ftypPayload.write('isom', 0, 4, 'ascii');
  const ftyp = box('ftyp', ftypPayload);
  const mvhdPayload = Buffer.alloc(100);
  writeU32(mvhdPayload, 12, 1000);
  writeU32(mvhdPayload, 16, durationMs);
  const mvhd = box('mvhd', mvhdPayload);
  const tkhdPayload = Buffer.alloc(84);
  writeU32(tkhdPayload, 76, width * 65536);
  writeU32(tkhdPayload, 80, height * 65536);
  const tkhd = box('tkhd', tkhdPayload);
  const hdlrPayload = Buffer.alloc(24);
  hdlrPayload.write('vide', 8, 4, 'ascii');
  const hdlr = box('hdlr', hdlrPayload);
  const mdia = box('mdia', hdlr);
  const trak = box('trak', Buffer.concat([tkhd, mdia]));
  const moov = box('moov', Buffer.concat([mvhd, trak]));
  return Buffer.concat([ftyp, moov, box('mdat', Buffer.alloc(32, 1))]);
}

function record(id, values) {
  const data = { id, ...values };
  return {
    id,
    get(key) { return data[key]; },
    getString(key) { return String(data[key] ?? ''); },
  };
}

function validImagePayload(bytes, overrides = {}) {
  return {
    contract: media.MEDIA_UPLOAD_CONTRACT,
    kind: 'image',
    purpose: 'hero',
    mime: 'image/webp',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: String(bytes.length),
    width: '1200',
    height: '630',
    duration_ms: '0',
    poster_asset_id: '',
    ...overrides,
  };
}

test('contratos MEDIA son exactos y aplican límites por propósito y tipo', () => {
  const bytes = webpBytes();
  assert.deepEqual(media.parseUploadPayload(validImagePayload(bytes)), {
    bytes: bytes.length,
    durationMs: 0,
    height: 630,
    kind: 'image',
    mime: 'image/webp',
    posterAssetId: '',
    purpose: 'hero',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    width: 1200,
  });
  assert.equal(media.parseUploadPayload({ ...validImagePayload(bytes), store_id: 'store00000000001' }), null);
  assert.equal(media.parseUploadPayload(validImagePayload(bytes, { sha256: 'A'.repeat(64) })), null);
  assert.equal(media.parseUploadPayload(validImagePayload(bytes, { mime: 'image/svg+xml' })), null);
  assert.equal(media.parseUploadPayload(validImagePayload(bytes, { width: '639' })), null);
  assert.equal(media.parseUploadPayload(validImagePayload(bytes, { bytes: String(media.MAX_IMAGE_BYTES + 1) })), null);
  assert.deepEqual(media.parseListPayload({ contract: media.MEDIA_LIST_CONTRACT }), {});
  assert.equal(media.parseListPayload({ contract: media.MEDIA_LIST_CONTRACT, filter: 'site != ""' }), null);
  assert.deepEqual(media.parseRetirePayload({
    contract: media.MEDIA_RETIRE_CONTRACT,
    asset_id: 'asset0000000001',
    expected_status: 'ready',
  }), { assetId: 'asset0000000001', expectedStatus: 'ready' });
});

test('PocketBase verifica bytes, SHA-256, MIME real y metadata de imagen', () => {
  const bytes = webpBytes();
  const parsed = media.parseUploadPayload(validImagePayload(bytes));
  assert.equal(media.sha256Bytes(bytes), crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(media.probeWebp(bytes), {
    mime: 'image/webp', width: 1200, height: 630, duration_ms: 0,
  });
  assert.equal(media.validateUploadedFile(
    uploadedFile(bytes, `${'a'.repeat(32)}.webp`),
    parsed,
  ).probe.width, 1200);
  assert.throws(
    () => media.validateUploadedFile(uploadedFile(bytes, 'foto-original.webp'), parsed),
    /promo_media_filename_invalid/,
  );
  assert.throws(
    () => media.validateUploadedFile(uploadedFile(bytes, `${'a'.repeat(32)}.webp`), {
      ...parsed, sha256: 'b'.repeat(64),
    }),
    /promo_media_digest_mismatch/,
  );
  const metadata = Buffer.concat([Buffer.from(bytes), Buffer.from('EXIF\u0004\u0000\u0000\u0000PII!')]);
  metadata.writeUInt32LE(metadata.length - 8, 4);
  assert.equal(media.probeWebp(metadata), null, 'rechaza EXIF y datos añadidos al WebP normalizado');
});

test('probe MP4 deriva dimensiones y duración del contenedor, no del body', () => {
  const bytes = mp4Bytes();
  assert.deepEqual(media.probeMp4(bytes), {
    mime: 'video/mp4', width: 1280, height: 720, duration_ms: 5000,
  });
  assert.equal(media.probeMp4(Buffer.from('<svg><script>alert(1)</script></svg>')), null);
  assert.equal(media.probeMp4(Buffer.concat([bytes, box('uuid', Buffer.from('PII'))])), null);
  const payload = media.parseUploadPayload({
    contract: media.MEDIA_UPLOAD_CONTRACT,
    kind: 'video',
    purpose: 'gallery',
    mime: 'video/mp4',
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: String(bytes.length),
    width: '1280',
    height: '720',
    duration_ms: '5000',
    poster_asset_id: 'poster000000001',
  });
  assert.ok(payload);
  assert.equal(media.validateUploadedFile(
    uploadedFile(bytes, `${'b'.repeat(32)}.mp4`),
    payload,
  ).probe.duration_ms, 5000);
  assert.throws(
    () => media.validateUploadedFile(uploadedFile(bytes, `${'b'.repeat(32)}.mp4`), {
      ...payload, width: 1279,
    }),
    /promo_media_metadata_mismatch/,
  );
});

test('descriptores públicos son content-addressed, responsivos y accesibles por contrato', () => {
  const sha = 'c'.repeat(64);
  const image = media.publicAssetDescriptor({
    key: 'hero_main', kind: 'image', purpose: 'hero', mime: 'image/webp', sha256: sha,
    width: 1200, height: 630, duration_ms: 0,
  }, 'promo-a');
  assert.equal(image.delivery.src.includes('/promo-a/media/hero_main/'), true);
  assert.deepEqual(image.delivery.srcset.map((item) => item.width), [480, 1200]);
  assert.deepEqual(
    media.variantManifest('hero', 1920, 1080).map((item) => item.width),
    [480, 768, 1920],
    'solo deriva miniaturas de hasta la mitad del ancho original',
  );
  assert.equal(image.delivery.loading, 'eager');
  assert.equal(JSON.stringify(image).includes('asset_id'), false);
  const secondaryHero = media.publicAssetDescriptor({
    key: 'hero_secondary', kind: 'image', purpose: 'hero', mime: 'image/webp', sha256: sha,
    width: 1200, height: 630, duration_ms: 0,
  }, 'promo-a', { priority: false });
  assert.equal(secondaryHero.delivery.loading, 'lazy');

  const video = media.publicAssetDescriptor({
    key: 'gallery_video', kind: 'video', purpose: 'gallery', mime: 'video/mp4', sha256: 'd'.repeat(64),
    width: 1280, height: 720, duration_ms: 5000,
    poster: {
      purpose: 'video_poster', kind: 'image', mime: 'image/webp', sha256: 'e'.repeat(64),
      width: 1280, height: 720, duration_ms: 0,
    },
  }, 'promo-a');
  assert.equal(video.delivery.autoplay, false);
  assert.equal(video.delivery.controls_required, true);
  assert.equal(video.delivery.preload, 'none');
  assert.match(video.delivery.poster.src, /poster-original\.webp$/);
});

test('I18N adjunta alt/decorative del único locale efectivo sin mezclar idiomas', () => {
  const projection = {
    ok: true,
    contract: pubcfg.PUBLIC_CONTRACT,
    site: { public_slug: 'promo-a' },
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es'] },
    theme: {}, section_order: [], sections: [], contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    media: [{ key: 'hero_main', purpose: 'hero', kind: 'image', width: 1200, height: 630, duration_ms: 0, delivery: {} }],
    content_by_locale: {
      es: { identity: {}, navigation: {}, sections: {}, contact: {}, media_alt: { hero_main: { alt: 'Alfombra artesanal', decorative: false } }, seo: {} },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
  const localized = i18n.localizePublicProjection(projection, { effective: 'es', source: 'url' });
  assert.deepEqual(localized.media[0].accessibility, { alt: 'Alfombra artesanal', decorative: false });
  assert.equal(JSON.stringify(localized).includes('asset000'), false);
});

test('cuotas se calculan por tenant y fallan cerradas al superar entitlement', () => {
  const entitlement = record('entitlement0001', {
    source: 'contract', promo_site_enabled: true, max_storage_bytes: 1000,
    video_enabled: true, max_videos: 1, valid_from: '', valid_until: '',
  });
  const decision = { entitlement };
  assert.deepEqual(api.assertQuota(decision, { images: 0, videos: 0, bytes: 0 }, {
    kind: 'image', bytes: 900,
  }), { images: 1, videos: 0, bytes: 900 });
  assert.throws(
    () => api.assertQuota(decision, { images: 1, videos: 0, bytes: 900 }, { kind: 'image', bytes: 101 }),
    (error) => error.code === 'promo_media_storage_exceeded',
  );
  assert.throws(
    () => api.assertQuota(decision, { images: 0, videos: 1, bytes: 0 }, { kind: 'video', bytes: 100 }),
    (error) => error.code === 'promo_media_count_exceeded',
  );
});

test('video exige poster ready del mismo tenant y propósito exacto', () => {
  const poster = record('poster000000001', {
    site: 'site00000000001', kind: 'image', purpose: 'video_poster', status: 'ready',
    file: `${'f'.repeat(32)}.webp`, mime_detected: 'image/webp', sha256: 'e'.repeat(64),
    bytes: 1000, width: 1280, height: 720, duration_ms: 0, poster_asset: '',
  });
  const app = { findRecordById() { return poster; } };
  assert.equal(api.assertPoster(app, 'site00000000001', {
    kind: 'video', posterAssetId: poster.id,
  }), poster);
  assert.throws(
    () => api.assertPoster(app, 'site00000000002', { kind: 'video', posterAssetId: poster.id }),
    (error) => error.code === 'promo_media_poster_required',
  );
  assert.equal(api.posterHasDependentVideo({
    findRecordsByFilter() { return [record('video0000000001', { poster_asset: poster.id, status: 'ready' })]; },
  }, 'site00000000001', poster.id), true);
});

test('rutas MEDIA mantienen auth privada, file directo cerrado y serving público revision-scoped', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_promo_media.pb.js'), 'utf8');
  assert.match(routes, /\/media\/upload/);
  assert.match(routes, /\/media\/list/);
  assert.match(routes, /\/media\/retire/);
  assert.match(routes, /public\/v1\/sites\/\{publicSlug\}\/media\/\{useKey\}\/\{digest\}/);
  assert.equal((routes.match(/\$apis\.requireAuth\(\)/g) || []).length, 4);
  assert.match(routes, /onFileDownloadRequest[\s\S]*promo_media_assets/);
  assert.equal(api.parsedDeliveryFile(' original.webp', false), null);
  assert.doesNotMatch(routes, /Cloudflare|Coolify|products|orders|cart|checkout/);
});
