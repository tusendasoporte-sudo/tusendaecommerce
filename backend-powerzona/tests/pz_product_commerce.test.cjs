'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const commerce = require('../pb_hooks/pz_product_commerce_lib.js');

function record(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
  };
}

function store(values = {}) {
  return record('storecommerce01', {
    status: 'active',
    active: true,
    plan: 'premium',
    plan_started_at: '2026-01-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: true,
    ...values,
  });
}

function product(values = {}) {
  return record('productcommerc1', {
    store: 'storecommerce01',
    active: true,
    has_variations: false,
    base_price_usd: 10,
    regular_price_usd: 10,
    stock: 5,
    track_stock: true,
    category: '',
    subcategory: '',
    expiration_date: '2026-12-31',
    ...values,
  });
}

function variation(id, values = {}) {
  return record(id, {
    product: 'productcommerc1',
    active: true,
    price_usd: 12,
    stock: 3,
    allow_preorder: false,
    expiration_date: '',
    ...values,
  });
}

test('has_variations=false conserva solo el padre e ignora variaciones almacenadas', () => {
  const parent = product({ has_variations: false, expiration_date: '2026-11-15' });
  const retained = variation('variationcomm01', { expiration_date: '2026-08-01' });
  const units = commerce.buildProductUnits(parent, [retained]);
  assert.equal(commerce.usesVariations(parent), false);
  assert.equal(units.length, 1);
  assert.equal(units[0].kind, 'product');
  assert.equal(units[0].variation_id, '');
  assert.equal(units[0].effective_expiration_date, '2026-11-15');
  assert.equal(commerce.effectiveUnitExpirationDate(parent, units[0], [retained]), '2026-11-15');
});

test('has_variations=true enumera solo variaciones activas y activa el modo de fechas individuales', () => {
  const parent = product({ has_variations: true, expiration_date: '2026-12-31' });
  const dated = variation('variationcomm01', { expiration_date: '2026-09-10' });
  const blank = variation('variationcomm02');
  const inactive = variation('variationcomm03', { active: false, expiration_date: '2026-08-01' });
  const foreign = variation('variationcomm04', { product: 'productforeign01', expiration_date: '2026-07-01' });
  const units = commerce.buildProductUnits(parent, [dated, blank, inactive, foreign]);
  assert.deepEqual(units.map((unit) => unit.variation_id), ['variationcomm01', 'variationcomm02']);
  assert.deepEqual(units.map((unit) => unit.effective_expiration_date), ['2026-09-10', '']);
});

test('variaciones activas heredan la fecha general cuando ninguna tiene fecha propia', () => {
  const parent = product({ has_variations: true, expiration_date: '2026-10-20' });
  const first = variation('variationcomm01');
  const second = variation('variationcomm02');
  const units = commerce.buildProductUnits(parent, [first, second]);
  assert.deepEqual(units.map((unit) => unit.effective_expiration_date), ['2026-10-20', '2026-10-20']);
});

test('availability aplica precio, stock/preorder, vencimiento y modo canónicos', () => {
  const premium = store();
  const parent = product({ has_variations: false, expiration_date: '2026-08-01' });
  const retained = variation('variationcomm01');
  const parentUnit = commerce.buildProductUnits(parent, [retained])[0];
  assert.equal(commerce.evaluateUnitAvailability({
    store: premium, product: parent, variations: [retained], unit: parentUnit, quantity: 2, now: '2026-07-21T12:00:00.000Z',
  }).available, true);
  assert.equal(commerce.evaluateUnitAvailability({
    store: premium, product: parent, variations: [retained], variation: retained, quantity: 1, now: '2026-07-21T12:00:00.000Z',
  }).reason, 'invalid_unit');
  assert.equal(commerce.evaluateUnitAvailability({
    store: premium, product: parent, variations: [retained], unit: parentUnit, quantity: 1, now: '2026-08-01T04:00:00.000Z',
  }).reason, 'expired');

  const variable = product({ has_variations: true, expiration_date: '', stock: 99 });
  const empty = variation('variationcomm02', { stock: 0 });
  const preorder = variation('variationcomm03', { stock: 0, allow_preorder: true });
  const [emptyUnit, preorderUnit] = commerce.buildProductUnits(variable, [empty, preorder]);
  assert.equal(commerce.evaluateUnitAvailability({ store: premium, product: variable, variations: [empty, preorder], unit: emptyUnit }).reason, 'stock_unavailable');
  assert.equal(commerce.evaluateUnitAvailability({ store: premium, product: variable, variations: [empty, preorder], unit: preorderUnit }).available, true);
});

test('planes sin capability ignoran fechas, pero nunca tenant, taxonomía ni precio', () => {
  const freeStore = store({ plan: 'free', plan_started_at: '', plan_is_permanent: false });
  const expired = product({ expiration_date: '2025-01-01' });
  const unit = commerce.buildProductUnits(expired, [])[0];
  assert.equal(commerce.evaluateUnitAvailability({
    store: freeStore, product: expired, variations: [], unit, now: '2026-07-21T12:00:00.000Z',
  }).available, true);

  const zero = product({ base_price_usd: 0, regular_price_usd: 0, expiration_date: '' });
  assert.equal(commerce.evaluateUnitAvailability({
    store: freeStore, product: zero, variations: [], unit: commerce.buildProductUnits(zero, [])[0],
  }).reason, 'price_unavailable');

  assert.equal(commerce.evaluateUnitAvailability({
    store: store({ id: 'storecommerce02' }), product: expired, variations: [], unit,
  }).reason, 'tenant_mismatch');

  const categorized = product({ category: 'categorycommer1', expiration_date: '' });
  const categorizedUnit = commerce.buildProductUnits(categorized, [])[0];
  assert.equal(commerce.evaluateUnitAvailability({
    store: freeStore, product: categorized, variations: [], unit: categorizedUnit,
  }).reason, 'taxonomy_unavailable');
  assert.equal(commerce.evaluateUnitAvailability({
    store: freeStore,
    product: categorized,
    variations: [],
    unit: categorizedUnit,
    category: record('categorycommer1', { store: freeStore.id, active: true }),
  }).available, true);
});

test('vencimiento cambia en medianoche civil de La Habana y no en medianoche UTC', () => {
  const premium = store();
  const parent = product({ expiration_date: '2026-07-21' });
  const unit = commerce.buildProductUnits(parent, [])[0];
  assert.equal(commerce.evaluateUnitAvailability({
    store: premium,
    product: parent,
    variations: [],
    unit,
    now: '2026-07-21T03:59:59.000Z',
  }).available, true);
  assert.equal(commerce.evaluateUnitAvailability({
    store: premium,
    product: parent,
    variations: [],
    unit,
    now: '2026-07-21T04:00:00.000Z',
  }).reason, 'expired');
});
