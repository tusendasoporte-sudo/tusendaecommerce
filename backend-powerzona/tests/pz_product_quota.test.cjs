const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const quota = require(path.join(root, 'pb_hooks', 'pz_product_quota_lib.js'));

function record(values, originalValues) {
  return {
    id: values.id,
    get(key) { return values[key]; },
    original() { return originalValues ? record(originalValues) : null; },
  };
}

function quotaApp({ plan = 'free', products = 0, promo = false } = {}) {
  const store = record({
    id: 'store0000000001',
    plan,
    plan_is_permanent: true,
    plan_expires_at: '',
  });
  const state = { products, locks: 0, nextCalls: 0 };
  const app = {
    isTransactional() { return true; },
    findCollectionByNameOrId() {
      return { fields: { getByName() { return {}; } } };
    },
    findRecordById(collection, id) {
      if (collection !== 'stores' || id !== store.id) throw new Error('not_found');
      return store;
    },
    findRecordsByFilter(collection) {
      if (collection === 'promo_sites') return promo ? [record({ id: 'promo0000000001', store: store.id })] : [];
      return [];
    },
    db() {
      return {
        newQuery(sql) {
          return {
            bind() { return this; },
            one(row) {
              assert.match(sql, /FROM products/);
              row.total = state.products;
            },
            execute() {
              assert.match(sql, /UPDATE stores/);
              state.locks += 1;
            },
          };
        },
      };
    },
  };
  return { app, state, store };
}

function product(values = {}, originalValues) {
  return record({ id: 'product0000001', store: 'store0000000001', ...values }, originalValues);
}

test('los límites provienen exclusivamente del catálogo comercial v1 para los tres planes', () => {
  assert.equal(quota.limitForPlan('free'), 100);
  assert.equal(quota.limitForPlan('basic'), 700);
  assert.equal(quota.limitForPlan('premium'), 1600);
  assert.equal(quota.quotaForPlan('free', 99).can_create, true);
  assert.equal(quota.quotaForPlan('free', 100).can_create, false);
  assert.equal(quota.quotaForPlan('basic', 699).can_create, true);
  assert.equal(quota.quotaForPlan('basic', 700).can_create, false);
  assert.equal(quota.quotaForPlan('premium', 1599).can_create, true);
  assert.equal(quota.quotaForPlan('premium', 1600).can_create, false);
});

test('los estados distinguen cercanía, límite y reducción de plan sin mutar existentes', () => {
  assert.equal(quota.quotaForPlan('free', 79).state, 'available');
  assert.equal(quota.quotaForPlan('free', 80).state, 'near_limit');
  assert.equal(quota.quotaForPlan('free', 100).state, 'limit_reached');
  const downgraded = quota.quotaForPlan('free', 101);
  assert.equal(downgraded.state, 'over_limit');
  assert.equal(downgraded.over_by, 1);
  assert.equal(downgraded.can_create, false);
});

test('cuenta todos los productos principales sin filtrar visibilidad ni sumar variantes', () => {
  const { app, store } = quotaApp({ plan: 'basic', products: 643 });
  const view = quota.productQuotaView(app, store);
  assert.equal(view.used, 643);
  assert.equal(view.limit, 700);
  const source = fs.readFileSync(path.join(root, 'pb_hooks', 'pz_product_quota_lib.js'), 'utf8');
  const count = source.slice(source.indexOf('function countStoreProducts'), source.indexOf('function productQuotaView(app'));
  assert.match(count, /FROM products/);
  assert.match(count, /WHERE store = \{:\s*storeId\}/);
  assert.doesNotMatch(count, /active\s*=|product_variations/);
});

test('el hook de modelo bloquea cualquier creación al límite y libera cupo tras eliminar', () => {
  const { app, state } = quotaApp({ products: 100 });
  const event = {
    app,
    record: product(),
    next() { state.nextCalls += 1; state.products += 1; },
  };
  assert.throws(() => quota.handleProductCreate(event), (error) => error.code === 'product_limit_reached');
  assert.equal(state.nextCalls, 0);
  state.products -= 1;
  quota.handleProductCreate(event);
  assert.equal(state.products, 100);
  assert.equal(state.nextCalls, 1);
  assert.equal(state.locks, 2);
});

test('edita productos al límite, pero impide moverlos entre tiendas para evadir el cupo', () => {
  const { app, state } = quotaApp({ products: 100 });
  quota.handleProductUpdate({
    app,
    record: product({ name: 'Editado' }, { id: 'product0000001', store: 'store0000000001' }),
    next() { state.nextCalls += 1; },
  });
  assert.equal(state.nextCalls, 1);
  assert.throws(() => quota.handleProductUpdate({
    app,
    record: product({ store: 'store0000000002' }, { id: 'product0000001', store: 'store0000000001' }),
    next() { state.nextCalls += 1; },
  }), (error) => error.code === 'product_store_immutable');
});

test('Tienda Promocional conserva sus creaciones y actualizaciones sin aplicar esta cuota', () => {
  const { app, state, store } = quotaApp({ products: 5000, promo: true });
  const event = { app, record: product(), next() { state.nextCalls += 1; } };
  quota.handleProductCreate(event);
  quota.handleProductUpdate({
    ...event,
    record: product({ store: 'legacy000000001' }, { id: 'product0000001', store: store.id }),
  });
  assert.equal(state.nextCalls, 2);
  assert.equal(state.locks, 0);
  assert.equal(quota.productQuotaView(app, store), null);
});

test('registros históricos y permanentes dependen del plan, pero un plan ilegible falla cerrado', () => {
  const historical = record({ id: 'store0000000001', plan: 'premium', plan_is_permanent: true, plan_expires_at: '' });
  assert.equal(quota.productQuotaViewFromUsage(historical, 1500).can_create, true);
  const invalid = quota.productQuotaViewFromUsage(record({ id: 'store0000000001', plan: 'legacy' }), 5);
  assert.equal(invalid.state, 'unavailable');
  assert.equal(invalid.can_create, false);
  assert.throws(() => quota.limitForPlan('legacy'), (error) => error.code === 'product_quota_unavailable');
});

test('la garantía de concurrencia vive en hook de modelo, transacción y bloqueo previo al conteo', () => {
  const hook = fs.readFileSync(path.join(root, 'pb_hooks', 'pz_product_quota.pb.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'pb_hooks', 'pz_product_quota_lib.js'), 'utf8');
  assert.match(hook, /onRecordCreate[\s\S]*"products"/);
  assert.match(source, /runInTransaction/);
  assert.match(source, /UPDATE stores[\s\S]*SET id = id/);
  assert.ok(source.indexOf('acquireStoreQuotaLock(app, storeId)') < source.indexOf('assertProductCreationAllowed(app, lockedStore)'));
});
