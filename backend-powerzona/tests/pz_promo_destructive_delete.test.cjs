const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const audit = require('../pb_hooks/pz_promo_audit_lib.js');
const media = require('../pb_hooks/pz_promo_media_lib.js');
const mediaDelete = require('../pb_hooks/pz_promo_media_delete_api_lib.js');
const reviewDelete = require('../pb_hooks/pz_promo_review_delete_api_lib.js');

test('contrato de borrado físico de medios es exacto y no acepta tenant del cliente', () => {
  const valid = {
    contract: media.MEDIA_DELETE_CONTRACT,
    asset_id: 'asset0000000001',
    expected_status: 'ready',
  };
  assert.deepEqual(media.parseDeletePayload(valid), {
    assetId: 'asset0000000001', expectedStatus: 'ready',
  });
  assert.equal(media.parseDeletePayload({ ...valid, site_id: 'site00000000001' }), null);
  assert.equal(media.parseDeletePayload({ ...valid, expected_status: 'retired' }), null);
  assert.equal(media.parseDeletePayload({ ...valid, asset_id: 'invalid' }), null);
});

test('borrado de medios falla cerrado ante referencias draft, live, video o reseña', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_media_delete_api_lib.js'), 'utf8');
  assert.match(source, /promo\.requirePromoAction[\s\S]*?"promo\.media\.manage"/);
  assert.match(source, /draftReferencesAsset[\s\S]*activeRevisionReferencesAsset/);
  assert.match(source, /poster_asset = \{:asset\}/);
  assert.match(source, /promo_review_requests[\s\S]*photo_assets \?= \{:asset\}/);
  assert.match(source, /mediaIsInUse[\s\S]*promo_media_in_use/);
  assert.match(source, /app\.delete\(record\)/);
  assert.equal(mediaDelete.SAFE_ERRORS.has('promo_media_in_use'), true);
});

test('contrato de eliminación de reseñas usa CAS y rechaza campos adicionales', () => {
  const valid = {
    contract: reviewDelete.DELETE_CONTRACT,
    review_id: 'reviewaaaaaaaaa',
    expected_updated: '2026-08-27T12:00:00Z',
  };
  assert.deepEqual(reviewDelete.parseDelete(valid), {
    reviewId: 'reviewaaaaaaaaa', expectedUpdated: '2026-08-27T12:00:00Z',
  });
  assert.throws(() => reviewDelete.parseDelete({ ...valid, store_id: 'storeaaaaaaaaaa' }), /invalid_payload/);
  assert.throws(() => reviewDelete.parseDelete({ ...valid, expected_updated: '' }), /invalid_payload/);
});

test('eliminación de reseña queda tenant-scoped y limpia solicitud y fotos privadas', () => {
  const source = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_review_delete_api_lib.js'), 'utf8');
  assert.match(source, /promo\.requirePromoAction[\s\S]*?"promo\.reviews\.manage"/);
  assert.match(source, /relationId\(review, "store"\) !== storeId/);
  assert.match(source, /recordString\(review, "updated"\) !== parsed\.expectedUpdated/);
  assert.match(source, /promo_review_requests[\s\S]*photo_assets/);
  assert.match(source, /app\.delete\(request\)/);
  assert.match(source, /app\.delete\(asset\)/);
  assert.match(source, /app\.delete\(review\)/);
});

test('rutas destructivas requieren autenticación y auditoría crítica', () => {
  const mediaHook = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_media_delete.pb.js'), 'utf8');
  const reviewHook = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_review_delete.pb.js'), 'utf8');
  assert.match(mediaHook, /\/promo\/private\/v1\/media\/delete/);
  assert.match(reviewHook, /\/promo\/private\/v1\/reviews\/delete/);
  assert.match(mediaHook, /\$apis\.requireAuth\(\)/);
  assert.match(reviewHook, /\$apis\.requireAuth\(\)/);
  assert.equal(audit.ACTION_CATALOG['promo.media.delete'].severity, 'critical');
  assert.equal(audit.ACTION_CATALOG['promo.reviews.delete'].severity, 'critical');
});
