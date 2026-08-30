const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contracts = require('../pb_hooks/pz_promo_review_requests_lib.js');
const audit = require('../pb_hooks/pz_promo_audit_lib.js');

test('solicitud privada no acepta campos de fotos ni tenant enviados por el cliente', () => {
  const parsed = contracts.parsePrivateCreate({
    contract: 'promo.review-requests.create.v2', locale: 'es', customer_label: 'Ana',
    work_label: 'Trabajo de alfombra', expires_days: 30,
  });
  assert.equal(parsed.expiresDays, 30);
  assert.throws(() => contracts.parsePrivateCreate({
    contract: 'promo.review-requests.create.v2', locale: 'es', customer_label: '', work_label: '',
    expires_days: 30, photo_asset_ids: [],
  }), /invalid_payload/);
  assert.throws(() => contracts.parsePrivateCreate({
    contract: 'promo.review-requests.create.v2', locale: 'es', customer_label: '', work_label: '',
    expires_days: 30, site_id: 'siteaaaaaaaaaaa',
  }), /invalid_payload/);
  assert.equal(contracts.parsePrivateReveal({
    contract: 'promo.review-requests.reveal.v1', request_id: 'requestaaaaaaaa',
  }).requestId, 'requestaaaaaaaa');
  assert.equal(contracts.parsePrivateDelete({
    contract: 'promo.review-requests.delete.v1', request_id: 'requestaaaaaaaa',
  }).requestId, 'requestaaaaaaaa');
  assert.throws(() => contracts.parsePrivateDelete({
    contract: 'promo.review-requests.delete.v1', request_id: 'requestaaaaaaaa', store_id: 'storeaaaaaaaaaa',
  }), /invalid_payload/);
});

test('envío público es exacto, moderado, con honeypot, tiempo mínimo y texto sin URL', () => {
  const parsed = contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v2', name: 'Ana', rating: 5, comment: 'Excelente trabajo artesanal.',
    honeypot: '', rendered_at: Date.now() - 3000, request_token: '',
  });
  assert.equal(parsed.rating, 5);
  assert.equal(parsed.requestToken, '');
  assert.equal(contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v2', name: 'Ana', rating: 5, comment: 'good',
    honeypot: '', rendered_at: Date.now() - 3000, request_token: '',
  }).comment, 'good');
  assert.throws(() => contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v2', name: 'Ana', rating: 5, comment: 'Visita https://spam.example',
    honeypot: '', rendered_at: Date.now() - 3000, request_token: '',
  }), /unsafe_review_content/);
  assert.throws(() => contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v2', name: 'Ana', rating: 5, comment: 'Excelente trabajo artesanal.',
    honeypot: 'robot', rendered_at: Date.now() - 3000, request_token: '',
  }), /invalid_payload/);
  assert.throws(() => contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v2', name: 'Ana', rating: 5, comment: 'Excelente.',
    honeypot: '', rendered_at: Date.now() - 3000, request_token: '', photo_consent: false,
  }), /invalid_payload/);
});

test('proyección pública conserva verificación sin exponer IDs ni fotos', () => {
  const projected = contracts.publicReview({
    id: 'reviewaaaaaaaaa', type: 'store', status: 'approved', rating: 5,
    customer_name: 'Ana', comment: 'Impecable', featured: true, created: '2026-08-25T10:00:00Z',
  }, { verified: true });
  assert.equal(projected.service_verified, true);
  assert.equal(Object.hasOwn(projected, 'photos'), false);
  assert.equal(Object.hasOwn(projected, 'verified_purchase'), false);
  assert.equal(Object.hasOwn(projected, 'id'), false);
});

test('rutas separan público y acciones Admin autenticadas sin endpoints de fotos', () => {
  const hook = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_review_requests.pb.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_review_requests_api_lib.js'), 'utf8');
  assert.match(hook, /reviews\/sites\/\{publicSlug\}\/submit/);
  assert.doesNotMatch(hook, /request-photo|\/photos\//);
  assert.match(hook, /reviews\/requests\/create[\s\S]*?\$apis\.requireAuth\(\)/);
  assert.match(api, /record\.set\("token_sha256", secret\.digest\)/);
  assert.match(api, /record\.set\("token_encrypted", encryptToken\(secret\.token\)\)/);
  assert.match(hook, /reviews\/requests\/reveal[\s\S]*?\$apis\.requireAuth\(\)/);
  assert.match(hook, /reviews\/requests\/delete[\s\S]*?\$apis\.requireAuth\(\)/);
  assert.doesNotMatch(api, /record\.set\("token"/);
  assert.doesNotMatch(api, /photo_assets|photo_consent|review_photo_not_found/);
  assert.match(api, /RATE_MAX_SUBMISSIONS = 3/);
  assert.match(api, /e\.realIP\(\)/);
});

test('migración final conserva solicitudes y elimina campos y propósito de fotos de reseña', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../pb_migrations/1787698800_promo_review_requests.js'), 'utf8');
  const removal = fs.readFileSync(path.join(__dirname, '../pb_migrations/1787699300_promo_reviews_without_photos.js'), 'utf8');
  const secureSharing = fs.readFileSync(path.join(__dirname, '../pb_migrations/1787699400_promo_review_request_secure_sharing.js'), 'utf8');
  assert.match(migration, /"promo_review_requests"/);
  assert.match(migration, /listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null/);
  assert.match(migration, /UNIQUE INDEX `ux_promo_review_request_token`/);
  assert.match(removal, /fields\.removeById\(photoAssets\.id\)/);
  assert.match(removal, /fields\.removeById\(photoConsent\.id\)/);
  assert.match(removal, /purpose\.values\.filter\(\(value\) => value !== REVIEW_MEDIA_PURPOSE\)/);
  assert.match(removal, /app\.delete\(record\)/);
  assert.match(secureSharing, /name: FIELD_NAME/);
  assert.match(secureSharing, /hidden: true/);
  assert.match(secureSharing, /unsafe_rollback_promo_review_request_secure_sharing/);
});

test('migración de logo añade un propósito reversible y bloquea rollback con assets usados', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../pb_migrations/1787698900_promo_brand_logo.js'), 'utf8');
  assert.match(migration, /LOGO_MEDIA_PURPOSE = "logo"/);
  assert.match(migration, /PURPOSE_FIELD_ID = "select1787521204"/);
  assert.match(migration, /unsafe_rollback_promo_logo_media/);
  assert.match(migration, /purpose\.values\.filter/);
});

test('crear, recuperar, revocar y borrar solicitudes dejan auditoría saneada sin token ni cliente', () => {
  for (const action of [
    'promo.reviews.request.create', 'promo.reviews.request.reveal',
    'promo.reviews.request.revoke', 'promo.reviews.request.delete',
  ]) {
    assert.deepEqual(audit.ACTION_CATALOG[action].resources, ['promo_review_request']);
  }
  const values = audit.buildPromoAuditValues({
    site: { id: 'siteaaaaaaaaaaa' },
    actor: { id: 'useraaaaaaaaaaa', role: 'store_admin', status: 'active', display_name: 'Admin' },
    is_master: false,
  }, {
    action: 'promo.reviews.request.create', resourceType: 'promo_review_request', resourceId: 'requestaaaaaaaa',
    changedPaths: ['/status', '/locale', '/expires_at'],
    previousValues: { status: '', locale: '', expires: false },
    newValues: { status: 'pending', locale: 'es', expires: true },
    sourceEventKey: 'promo.reviews.request.create.requestaaaaaaaa',
  });
  assert.deepEqual(values.new_values_json, { status: 'pending', locale: 'es', expires: true });
  assert.doesNotMatch(JSON.stringify(values), /token|customer|photo_asset|work_label/i);
});
