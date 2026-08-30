const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const reviews = require('../pb_hooks/pz_promo_reviews_lib.js');
const audit = require('../pb_hooks/pz_promo_audit_lib.js');

const STORE_A = 'storeaaaaaaaaaa';
const STORE_B = 'storebbbbbbbbbb';

function review(overrides = {}) {
  return {
    id: 'reviewaaaaaaaaa',
    store: STORE_A,
    type: 'store',
    rating: 5,
    customer_name: 'Ana',
    comment: 'Trabajo impecable.',
    status: 'approved',
    featured: true,
    approved_at: '2026-08-24T10:00:00Z',
    created: '2026-08-23T10:00:00Z',
    updated: '2026-08-24T10:00:00Z',
    ...overrides,
  };
}

test('adapter público exige flag publicado y sección store_rating exacta', () => {
  const projection = {
    adapters: { store_rating: { enabled: true } },
    sections: [{ key: 'reviews-main', type: 'store_rating' }],
  };
  assert.equal(reviews.ratingAdapterEnabled(projection), true);
  assert.equal(reviews.ratingAdapterEnabled({ ...projection, adapters: { store_rating: { enabled: false } } }), false);
  assert.equal(reviews.ratingAdapterEnabled({ ...projection, sections: [{ type: 'services' }] }), false);
});

test('proyección pública usa solo reseñas aprobadas de tienda y omite IDs, pedidos y verificación', () => {
  const output = reviews.projectPublicRating(STORE_A, [
    review(),
    review({ id: 'reviewbbbbbbbbb', rating: 4, customer_name: 'Luis', featured: false }),
    review({ id: 'reviewccccccccc', store: STORE_B }),
    review({ id: 'reviewddddddddd', type: 'product' }),
    review({ id: 'revieweeeeeeeee', status: 'pending' }),
  ], { count: 2, total_rating: 9 });
  assert.equal(output.contract, 'promo.store-rating.v1');
  assert.deepEqual(output.summary, { average: 4.5, count: 2 });
  assert.equal(output.reviews.length, 2);
  assert.deepEqual(output.reviews[0], {
    rating: 5, name: 'Ana', comment: 'Trabajo impecable.', date: '2026-08-23',
  });
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /reviewaaaa|order|product|verified|source|featured|storeaaaa/);
});

test('moderación soporta aprobar, rechazar, ocultar y destacar solo reseñas aprobadas', () => {
  assert.deepEqual(reviews.moderationState({ status: 'pending', featured: false }, 'approve', 'now'), {
    status: 'approved', featured: false, approved_at: 'now',
  });
  assert.deepEqual(reviews.moderationState({ status: 'approved', featured: true }, 'hide', 'now'), {
    status: 'hidden', featured: false, approved_at: 'now',
  });
  assert.deepEqual(reviews.moderationState({ status: 'approved', featured: false }, 'feature', 'now'), {
    status: 'approved', featured: true, approved_at: 'now',
  });
  assert.throws(
    () => reviews.moderationState({ status: 'pending', featured: false }, 'feature', ''),
    /invalid_review_transition/,
  );
});

test('contratos privados son exactos y no aceptan tenant, filtros PocketBase ni payloads Commerce', () => {
  assert.equal(reviews.PRIVATE_PAGE_SIZE, 10);
  assert.deepEqual(reviews.parseList({ contract: 'promo.reviews.list.v1', status: 'pending', page: 1 }), {
    status: 'pending', page: 1,
  });
  assert.deepEqual(reviews.parseModeration({
    contract: 'promo.reviews.moderate.v1', review_id: 'reviewaaaaaaaaa', action: 'approve',
    expected_updated: '2026-08-24T10:00:00Z',
  }), {
    reviewId: 'reviewaaaaaaaaa', action: 'approve', expectedUpdated: '2026-08-24T10:00:00Z',
  });
  for (const key of ['store_id', 'site_id', 'filter', 'sort', 'fields', 'expand', 'order_id', 'product_id']) {
    assert.throws(() => reviews.parseList({
      contract: 'promo.reviews.list.v1', status: 'all', page: 1, [key]: 'x',
    }), /invalid_payload/);
  }
});

test('API registra rutas privadas y consulta tenant/type/status de forma server-side', () => {
  const hook = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_reviews.pb.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_promo_reviews_api_lib.js'), 'utf8');
  assert.match(hook, /\/promo\/private\/v1\/reviews\/list/);
  assert.match(hook, /\/promo\/private\/v1\/reviews\/moderate/);
  assert.match(hook, /\$apis\.requireAuth\(\)/);
  assert.match(api, /promo\.requirePromoAction[\s\S]*?"promo\.reviews\.manage"/);
  assert.match(api, /store = \{:store\}[\s\S]*?type = 'store'[\s\S]*?status = 'approved'/);
  assert.doesNotMatch(api, /findRecordById\("orders"|findRecordById\("products"|collection\("orders"/);
});

test('moderación usa el writer AUDIT Promo con snapshot sin nombre ni comentario', () => {
  const definition = audit.ACTION_CATALOG['promo.reviews.moderate'];
  assert.equal(definition.module, 'reviews');
  assert.deepEqual(definition.resources, ['promo_store_review']);
  const values = audit.buildPromoAuditValues({
    site: { id: 'siteaaaaaaaaaaa' },
    actor: { id: 'useraaaaaaaaaaa', role: 'store_admin', status: 'active', display_name: 'Admin' },
    is_master: false,
  }, {
    action: 'promo.reviews.moderate', resourceType: 'promo_store_review', resourceId: 'reviewaaaaaaaaa',
    changedPaths: ['/status', '/featured'],
    previousValues: { status: 'pending', featured: false, approved: false },
    newValues: { status: 'approved', featured: true, approved: true },
    sourceEventKey: 'promo.reviews.reviewaaaaaaaaa.approve',
  });
  assert.deepEqual(values.new_values_json, { status: 'approved', featured: true, approved: true });
  assert.doesNotMatch(JSON.stringify(values), /Ana|Trabajo impecable|customer|comment/);
});

test('migración habilita el módulo reviews en AUDIT y bloquea rollback con eventos existentes', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../pb_migrations/1787699000_promo_audit_reviews_module.js'),
    'utf8',
  );
  assert.match(migration, /MODULE_FIELD_ID = "select1787523107"/);
  assert.match(migration, /moduleField\.values\.push\(REVIEWS_MODULE\)/);
  assert.match(migration, /module = \{\:module\}/);
  assert.match(migration, /unsafe_rollback_promo_reviews_audit/);
});
