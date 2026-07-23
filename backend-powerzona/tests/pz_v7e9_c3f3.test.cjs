'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const commerce = require('../pb_hooks/pz_product_commerce_lib.js');
const expiration = require('../pb_hooks/pz_product_expiration_lib.js');

const NOW = new Date('2026-07-21T16:00:00.000Z');

function record(id, values = {}, before = null) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    original() { return before; },
  };
}

function store(values = {}) {
  return record('storec3f3000001', {
    status: 'active', active: true, plan: 'premium', plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z', plan_expires_at: '',
    ...values,
  });
}

function product(values = {}, before = null) {
  return record('productc3f30001', {
    store: 'storec3f3000001', name: 'Producto C3F3', active: true,
    has_variations: false, base_price_usd: 10, track_stock: true, stock: 8,
    expiration_date: '', ...values,
  }, before);
}

function variation(id, values = {}, before = null) {
  return record(id, {
    product: 'productc3f30001', active: true, price_usd: 12, stock: 4,
    expiration_date: '', ...values,
  }, before);
}

function app(parent, variations = [], premiumStore = store()) {
  return {
    findRecordById(collection, id) {
      if (collection === 'products' && id === parent.id) return parent;
      if (collection === 'stores' && id === premiumStore.id) return premiumStore;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection) {
      return collection === 'product_variations' ? variations : [];
    },
  };
}

function event(finalRecord, parent, variations, body) {
  return { app: app(parent, variations), record: finalRecord, requestInfo: () => ({ body }) };
}

test('helpers centrales derivan los cuatro estados de variación con etiquetas exactas', () => {
  const parent = product({ has_variations: true });
  const active = variation('variationc3f3001', { expiration_date: '2026-08-01' });
  const expired = variation('variationc3f3002', { expiration_date: '2026-07-20' });
  const hiddenFuture = variation('variationc3f3003', { active: false, expiration_date: '2026-08-01' });
  const hiddenExpired = variation('variationc3f3004', { active: false, expiration_date: '2026-07-20' });
  const units = [active, expired, hiddenFuture, hiddenExpired];

  assert.equal(commerce.variationEffectiveStatus(parent, active, units, NOW).effective_status_label, 'Activa');
  assert.equal(commerce.variationEffectiveStatus(parent, expired, units, NOW).effective_status_label, 'Vencida');
  assert.equal(commerce.variationEffectiveStatus(parent, hiddenFuture, units, NOW).effective_status_label, 'Oculta');
  assert.equal(commerce.variationEffectiveStatus(parent, hiddenExpired, units, NOW).effective_status_label, 'Oculta');
  parent.has_variations = false;
  assert.equal(commerce.variationEffectiveStatus(parent, expired, units, NOW).effective_status_label, 'Conservada');
});

test('helper del padre prioriza intención manual y sólo vence la unidad general', () => {
  assert.deepEqual(
    commerce.productEffectiveStatus(product({ active: true, expiration_date: '2026-07-20' }), NOW),
    {
      effective_status: 'expired', effective_status_label: 'VENCIDO',
      effective_status_reason: 'expiration_date_passed', manual_active: true,
      effective_visible: false, can_activate: false, expired: true,
      expiration_date: '2026-07-20',
    },
  );
  assert.equal(commerce.productEffectiveStatus(
    product({ active: false, expiration_date: '2026-07-20' }), NOW,
  ).effective_status_label, 'OCULTO');
  assert.equal(commerce.productEffectiveStatus(
    product({ active: true, expiration_date: '2026-08-01' }), NOW,
  ).effective_status_label, 'VISIBLE');
  assert.equal(commerce.productEffectiveStatus(
    product({ active: true, has_variations: true, expiration_date: '2026-07-20' }), NOW,
  ).effective_status_label, 'VISIBLE');
});

test('backend bloquea mostrar padre vencido y permite guardar stock o corregir fecha', () => {
  const hidden = product({ active: false, expiration_date: '2026-07-20' });
  const shownExpired = product({ active: true, expiration_date: '2026-07-20' }, hidden);
  const blocked = expiration.validateProductActivationState(
    event(shownExpired, shownExpired, [], { active: true }), 'products', NOW,
  );
  assert.equal(blocked.code, 'product_expired_cannot_show');
  assert.equal(blocked.status, 409);

  const alreadyActive = product({ active: true, expiration_date: '2026-07-20' });
  const stockSave = product({ active: true, expiration_date: '2026-07-20', stock: 9 }, alreadyActive);
  assert.equal(expiration.validateProductActivationState(
    event(stockSave, stockSave, [], { stock: 9 }), 'products', NOW,
  ), null);
  assert.equal(stockSave.active, true);

  const corrected = product({ active: true, expiration_date: '2026-08-01' }, hidden);
  assert.equal(expiration.validateProductActivationState(
    event(corrected, corrected, [], { active: true, expiration_date: '2026-08-01' }), 'products', NOW,
  ), null);
});

test('backend de variaciones conserva active en guardados ajenos y acepta corrección combinada', () => {
  const parent = product({ has_variations: true });
  const alreadyActive = variation('variationc3f3005', { active: true, expiration_date: '2026-07-20' });
  const stockSave = variation(alreadyActive.id, { active: true, expiration_date: '2026-07-20', stock: 7 }, alreadyActive);
  assert.equal(expiration.validateVariationActivationState(
    event(stockSave, parent, [alreadyActive], { stock: 7 }), 'product_variations', NOW,
  ), null);
  assert.equal(stockSave.active, true);

  const hiddenExpired = variation('variationc3f3006', { active: false, expiration_date: '2026-07-20' });
  const shownExpired = variation(hiddenExpired.id, { active: true, expiration_date: '2026-07-20' }, hiddenExpired);
  assert.equal(expiration.validateVariationActivationState(
    event(shownExpired, parent, [hiddenExpired], { active: true }), 'product_variations', NOW,
  ).code, 'variation_expired_cannot_activate');

  const corrected = variation(hiddenExpired.id, { active: true, expiration_date: '' }, hiddenExpired);
  assert.equal(expiration.validateVariationActivationState(
    event(corrected, parent, [hiddenExpired], { active: true, expiration_date: '' }), 'product_variations', NOW,
  ), null);
});

test('auditoría usa acciones manuales explícitas y correcciones sin activaciones ficticias', () => {
  const auditSource = readFileSync(path.join(__dirname, '../pb_hooks/pz_store_activity_audit_lib.js'), 'utf8');
  const expirationSource = readFileSync(path.join(__dirname, '../pb_hooks/pz_product_expiration_lib.js'), 'utf8');
  for (const action of [
    'product_manual_hidden', 'product_manual_shown',
    'variation_manual_hidden', 'variation_manual_shown',
  ]) assert.match(auditSource, new RegExp(action));
  assert.match(expirationSource, /product_expiration_corrected/);
  assert.match(expirationSource, /variation_expiration_corrected/);
  assert.doesNotMatch(auditSource, /variation_manual_activated/);
  assert.doesNotMatch(expirationSource, /product_unit_reactivated/);
});
