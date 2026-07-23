'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const commerce = require('../pb_hooks/pz_product_commerce_lib.js');
const expiration = require('../pb_hooks/pz_product_expiration_lib.js');
const history = require('../pb_hooks/pz_product_history_lib.js');

function record(id, values = {}, original = null) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    original() { return original; },
  };
}

function premiumStore(values = {}) {
  return record('storehistory001', {
    status: 'active', active: true, plan: 'premium', plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z', plan_expires_at: '',
    ...values,
  });
}

function product(values = {}) {
  return record('producthistory1', {
    store: 'storehistory001', active: true, has_variations: true,
    base_price_usd: 10, track_stock: true, stock: 10, expiration_date: '',
    ...values,
  });
}

function variation(id, values = {}, original = null) {
  return record(id, {
    product: 'producthistory1', active: true, price_usd: 12, stock: 4,
    expiration_date: '', ...values,
  }, original);
}

test('estado efectivo conserva intencion manual y separa vencimiento y modo padre', () => {
  const parent = product();
  const future = variation('variationhist01', { expiration_date: '2026-08-10' });
  const blank = variation('variationhist02');
  const expired = variation('variationhist03', { expiration_date: '2026-07-20' });
  const manual = variation('variationhist04', { active: false, expiration_date: '2026-07-20' });
  const variations = [future, blank, expired, manual];
  const now = '2026-07-21T16:00:00.000Z';

  assert.equal(commerce.variationEffectiveStatus(parent, future, variations, now).effective_status, 'active');
  assert.equal(commerce.variationEffectiveStatus(parent, blank, variations, now).effective_status, 'active');
  assert.equal(commerce.variationEffectiveStatus(parent, expired, variations, now).effective_status, 'hidden_expired');
  assert.deepEqual(
    commerce.variationEffectiveStatus(parent, manual, variations, now),
    {
      effective_status: 'hidden_manual', effective_status_label: 'Oculta',
      effective_status_reason: 'manual_and_expired', can_activate: false, expired: true,
      effective_expiration_date: '2026-07-20',
    },
  );

  const general = product({ has_variations: false });
  assert.equal(commerce.variationEffectiveStatus(general, expired, variations, now).effective_status, 'disabled_by_parent_mode');
  assert.equal(expired.active, true, 'derivar estado no sobrescribe active');
  assert.equal(manual.active, false, 'corregir estado no activa una variacion manualmente oculta');
});

function activationApp(parent, storedVariation, store = premiumStore()) {
  return {
    findRecordById(collection, id) {
      if (collection === 'products' && id === parent.id) return parent;
      if (collection === 'stores' && id === store.id) return store;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection) {
      return collection === 'product_variations' ? [storedVariation] : [];
    },
  };
}

function activationEvent(finalVariation, storedVariation, parent, body) {
  return {
    app: activationApp(parent, storedVariation),
    record: finalVariation,
    requestInfo: () => ({ body }),
  };
}

test('backend evalua el estado final y bloquea activacion vencida', () => {
  const parent = product();
  const previous = variation('variationhist05', { active: false, expiration_date: '2026-07-20' });
  const finalExpired = variation(previous.id, { active: true, expiration_date: '2026-07-20' }, previous);
  const blocked = expiration.validateVariationActivationState(
    activationEvent(finalExpired, previous, parent, { active: true }),
    'product_variations',
    new Date('2026-07-21T16:00:00.000Z'),
  );
  assert.equal(blocked.code, 'variation_expired_cannot_activate');
  assert.equal(blocked.status, 409);

  const finalFuture = variation(previous.id, { active: true, expiration_date: '2026-08-01' }, previous);
  assert.equal(expiration.validateVariationActivationState(
    activationEvent(finalFuture, previous, parent, { active: true, expiration_date: '2026-08-01' }),
    'product_variations', new Date('2026-07-21T16:00:00.000Z'),
  ), null);

  const finalBlank = variation(previous.id, { active: true, expiration_date: '' }, previous);
  assert.equal(expiration.validateVariationActivationState(
    activationEvent(finalBlank, previous, parent, { active: true, expiration_date: '' }),
    'product_variations', new Date('2026-07-21T16:00:00.000Z'),
  ), null);
});

test('redaccion del historial respeta permisos granulares', () => {
  const context = (granted) => ({ granted });
  assert.equal(history.fieldAllowed('price_usd', context(['catalog.view'])), false);
  assert.equal(history.fieldAllowed('price_usd', context(['catalog.view', 'catalog.products.price'])), true);
  assert.equal(history.fieldAllowed('stock', context(['catalog.view', 'catalog.products.price'])), false);
  assert.equal(history.fieldAllowed('expiration_date', context(['catalog.view', 'catalog.expirations.manage'])), true);
  assert.equal(history.forcedExpirationOnly(context(['catalog.view', 'catalog.expirations.manage'])), true);
  assert.match(history.detailVisibilityClause(context(['catalog.view', 'catalog.expirations.manage'])), /expiration/i);
  assert.match(history.detailVisibilityClause(context(['catalog.view'])), /NOT LIKE/);
  assert.equal(history.detailVisibilityClause(context(['catalog.view', 'catalog.products.price', 'catalog.expirations.manage'])), '1 = 1');
  assert.deepEqual(
    history.redactProductSnapshot({ image_url: '/private.jpg', category: 'Privada', name: 'Producto' }, context(['catalog.view'])),
    { image_url: '', category: '', name: 'Producto' },
  );
});
