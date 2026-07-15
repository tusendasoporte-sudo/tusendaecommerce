const assert = require('node:assert/strict');
const test = require('node:test');

const management = require('../pb_hooks/pz_store_plan_management_lib.js');

const STORE_ID = 'storetestp7m200';

test('acepta un cambio temporal válido de 1 a 12 meses', () => {
  assert.deepEqual(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'basic',
    is_permanent: false,
    duration_months: 3,
    reason: 'Renovación comercial',
  }), {
    storeId: STORE_ID,
    plan: 'basic',
    isPermanent: false,
    durationMonths: 3,
    reason: 'Renovación comercial',
  });
});

test('acepta Premium permanente solo con duración cero', () => {
  assert.deepEqual(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'premium',
    is_permanent: true,
    duration_months: 0,
    reason: '',
  }), {
    storeId: STORE_ID,
    plan: 'premium',
    isPermanent: true,
    durationMonths: 0,
    reason: '',
  });
});

test('rechaza Free permanente y campos inesperados', () => {
  assert.equal(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'free',
    is_permanent: true,
    duration_months: 0,
    reason: '',
  }), null);
  assert.equal(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'basic',
    is_permanent: false,
    duration_months: 1,
    reason: '',
    actor_id: 'forbiddenfield1',
  }), null);
});

test('la renovación exige de 1 a 12 meses y motivo acotado', () => {
  assert.deepEqual(management.parseRenewPayload({ store_id: STORE_ID, months: 12, reason: 'Extensión' }), {
    storeId: STORE_ID,
    months: 12,
    reason: 'Extensión',
  });
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 0, reason: '' }), null);
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 13, reason: '' }), null);
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 1, reason: 'x'.repeat(501) }), null);
});
