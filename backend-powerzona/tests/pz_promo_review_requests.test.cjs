const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contracts = require('../pb_hooks/pz_promo_review_requests_lib.js');
const audit = require('../pb_hooks/pz_promo_audit_lib.js');

const PHOTO_IDS = ['photoaaaaaaaaaa', 'photobbbbbbbbbb', 'photocccccccccc'];

test('solicitud privada acepta 0–3 fotos ordenadas y rechaza tenant o una cuarta foto', () => {
  const parsed = contracts.parsePrivateCreate({
    contract: 'promo.review-requests.create.v1', locale: 'es', customer_label: 'Ana',
    work_label: 'Trabajo de alfombra', expires_days: 30, photo_asset_ids: PHOTO_IDS,
  });
  assert.deepEqual(parsed.photoAssetIds, PHOTO_IDS);
  assert.equal(parsed.expiresDays, 30);
  assert.throws(() => contracts.parsePrivateCreate({
    contract: 'promo.review-requests.create.v1', locale: 'es', customer_label: '', work_label: '',
    expires_days: 30, photo_asset_ids: [...PHOTO_IDS, 'photodddddddddd'],
  }), /invalid_payload/);
  assert.throws(() => contracts.parsePrivateCreate({
    contract: 'promo.review-requests.create.v1', locale: 'es', customer_label: '', work_label: '',
    expires_days: 30, photo_asset_ids: [], site_id: 'siteaaaaaaaaaaa',
  }), /invalid_payload/);
});

test('envío público es exacto, moderado, con honeypot, tiempo mínimo y texto sin URL', () => {
  const parsed = contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v1', name: 'Ana', rating: 5, comment: 'Excelente trabajo artesanal.',
    honeypot: '', rendered_at: Date.now() - 3000, request_token: '', photo_consent: false,
  });
  assert.equal(parsed.rating, 5);
  assert.equal(parsed.requestToken, '');
  assert.throws(() => contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v1', name: 'Ana', rating: 5, comment: 'Visita https://spam.example',
    honeypot: '', rendered_at: Date.now() - 3000, request_token: '', photo_consent: false,
  }), /unsafe_review_content/);
  assert.throws(() => contracts.parsePublicSubmission({
    contract: 'promo.review.submit.v1', name: 'Ana', rating: 5, comment: 'Excelente trabajo artesanal.',
    honeypot: 'robot', rendered_at: Date.now() - 3000, request_token: '', photo_consent: false,
  }), /invalid_payload/);
});

test('proyección pública separa verificación de compra y limita fotos consentidas a tres', () => {
  const projected = contracts.publicReview({
    id: 'reviewaaaaaaaaa', type: 'store', status: 'approved', rating: 5,
    customer_name: 'Ana', comment: 'Impecable', featured: true, created: '2026-08-25T10:00:00Z',
  }, {
    verified: true,
    photos: PHOTO_IDS.map((id) => ({
      url: `/api/pz/promo/public/v1/reviews/sites/demo/photos/${id}/${'a'.repeat(64)}/review.webp`,
      width: 800, height: 600,
    })),
  });
  assert.equal(projected.service_verified, true);
  assert.equal(projected.photos.length, 3);
  assert.equal(Object.hasOwn(projected, 'verified_purchase'), false);
  assert.equal(Object.hasOwn(projected, 'id'), false);
});

test('rutas separan público, fotos privadas por POST y acciones Admin autenticadas', () => {
  const hook = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_review_requests.pb.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_review_requests_api_lib.js'), 'utf8');
  assert.match(hook, /reviews\/sites\/\{publicSlug\}\/submit/);
  assert.match(hook, /reviews\/sites\/\{publicSlug\}\/request-photo/);
  assert.match(hook, /reviews\/requests\/create[\s\S]*?\$apis\.requireAuth\(\)/);
  assert.match(api, /record\.set\("token_sha256", secret\.digest\)/);
  assert.doesNotMatch(api, /record\.set\("token"/);
  assert.match(api, /photo_consent = true/);
  assert.match(api, /status", 20\) !== "approved"/);
  assert.match(api, /RATE_MAX_SUBMISSIONS = 3/);
  assert.match(api, /e\.realIP\(\)/);
});

test('migración mantiene colección cerrada, token hash único y relación máxima de tres fotos', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../pb_migrations/1787698800_promo_review_requests.js'), 'utf8');
  assert.match(migration, /"promo_review_requests"/);
  assert.match(migration, /listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null/);
  assert.match(migration, /"photo_assets"[\s\S]*?false, false, 3/);
  assert.match(migration, /UNIQUE INDEX `ux_promo_review_request_token`/);
  assert.match(migration, /REVIEW_MEDIA_PURPOSE = "review"/);
});

test('migración de logo añade un propósito reversible y bloquea rollback con assets usados', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../pb_migrations/1787698900_promo_brand_logo.js'), 'utf8');
  assert.match(migration, /LOGO_MEDIA_PURPOSE = "logo"/);
  assert.match(migration, /PURPOSE_FIELD_ID = "select1787521204"/);
  assert.match(migration, /unsafe_rollback_promo_logo_media/);
  assert.match(migration, /purpose\.values\.filter/);
});

test('crear y revocar solicitudes dejan auditoría saneada sin token, cliente ni fotos', () => {
  for (const action of ['promo.reviews.request.create', 'promo.reviews.request.revoke']) {
    assert.deepEqual(audit.ACTION_CATALOG[action].resources, ['promo_review_request']);
  }
  const values = audit.buildPromoAuditValues({
    site: { id: 'siteaaaaaaaaaaa' },
    actor: { id: 'useraaaaaaaaaaa', role: 'store_admin', status: 'active', display_name: 'Admin' },
    is_master: false,
  }, {
    action: 'promo.reviews.request.create', resourceType: 'promo_review_request', resourceId: 'requestaaaaaaaa',
    changedPaths: ['/status', '/locale', '/photo_count', '/expires_at'],
    previousValues: { status: '', locale: '', photo_count: 0, expires: false },
    newValues: { status: 'pending', locale: 'es', photo_count: 3, expires: true },
    sourceEventKey: 'promo.reviews.request.create.requestaaaaaaaa',
  });
  assert.deepEqual(values.new_values_json, { status: 'pending', locale: 'es', photo_count: 3, expires: true });
  assert.doesNotMatch(JSON.stringify(values), /token|customer|photo_asset|work_label/i);
});
