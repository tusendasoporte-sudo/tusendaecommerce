'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const privacy = require('../pb_hooks/pz_store_permission_enforcement_lib.js');
const FIELDS = 'id,category,subcategory,active';
const record = (id, values = {}) => ({ id, ...values, get(key) { return this[key]; } });
const product = (id, values = {}) => record(id, {
  store: 'store1', active: true, has_variations: false, base_price_usd: 10,
  regular_price_usd: 10, stock: 5, track_stock: true, category: 'cat1', subcategory: 'sub1', ...values,
});
function fixture(products, variations = []) {
  return {
    products, product_variations: variations,
    stores: ['store1', 'store2'].map(id => record(id, {
      status: 'active', active: true, plan: 'premium', plan_is_permanent: true, plan_started_at: '2026-01-01',
    })),
    categories: [record('cat1', { store: 'store1', active: true }), record('cat2', { store: 'store2', active: true })],
    subcategories: [record('sub1', { store: 'store1', category: 'cat1', active: true }), record('sub2', { store: 'store2', category: 'cat2', active: true })],
  };
}
function run(data, fields, { page = 1, perPage = 1000, failBatchOffset, auth = null } = {}) {
  const calls = [];
  const app = {
    findRecordById(collection, id) {
      calls.push({ collection, id });
      const found = data[collection].find(r => r.id === id);
      if (!found) throw new Error('not found');
      return found;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      calls.push({ collection, filter, sort, limit, offset, params });
      let records = data[collection];
      if (collection === 'products') records = records.filter(p => p.active === true);
      else {
        const batched = Object.hasOwn(params, 'product0');
        if (batched && offset === failBatchOffset) throw new Error('transient batch failure');
        assert.equal(sort, 'sort_order,id');
        assert.equal(limit, 500);
        const ids = Object.values(params);
        assert.ok(ids.length <= 100);
        assert.equal(filter, batched ? ids.map((_, i) => `product = {:product${i}}`).join(' || ') : 'product = {:product}');
        records = records.filter(v => ids.includes(v.product)).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id.localeCompare(b.id));
      }
      return records.slice(offset, offset + limit);
    },
  };
  const e = { app, auth, records: [], result: { page, perPage, items: [] },
    requestInfo: () => ({ query: { filter: 'active=true', fields } }) };
  privacy.filterPublicProductRead(e, 'products');
  return { calls, result: e.result, ids: e.result.items.map(p => p.id) };
}
function parity(data, options) {
  const old = run(data, '', options);
  const optimized = run(data, FIELDS, options);
  assert.deepEqual(optimized.result, old.result);
  return { old, optimized };
}

test('misma disponibilidad canónica: agotados visibles, ocultos, vencidos y precios inválidos excluidos', () => {
  const data = fixture([
    product('normal'), product('soldout', { stock: 0 }), product('hidden', { active: false }),
    product('expired', { expiration_date: '2000-01-01' }), product('free', { base_price_usd: 0, regular_price_usd: 0 }),
    product('orphan', { category: 'missing' }), product('cross', { category: 'cat2' }),
    product('other', { store: 'store2', category: 'cat2', subcategory: 'sub2' }),
    product('home', { category: '', subcategory: '' }), product('variable', { has_variations: true }),
    product('emptyVariations', { has_variations: true }),
  ], [record('v1', { product: 'variable', active: true, price_usd: 10, stock: 0 }),
    record('v2', { product: 'variable', active: false, price_usd: 10, stock: 5 })]);
  const { optimized } = parity(data);
  assert.deepEqual(optimized.ids, ['normal', 'soldout', 'other', 'home', 'variable']);
  parity(data, { page: 2, perPage: 2 });
  parity(data, { page: 10, perPage: 2 });
  data.categories[0].active = false;
  assert.deepEqual(parity(data).optimized.ids, ['other', 'home']);
  data.categories[0].active = true;
  data.subcategories[0].active = false;
  assert.deepEqual(parity(data).optimized.ids, ['other', 'home']);
  data.stores[1].status = 'suspended';
  assert.deepEqual(parity(data).optimized.ids, ['home']);
});

test('100 productos comparten 1 lectura de tienda/categoría/subcategoría y 1 de variaciones', () => {
  const data = fixture(Array.from({ length: 100 }, (_, i) => product(`p${i}`)));
  const { old, optimized } = parity(data);
  assert.equal(old.calls.length, 401);
  assert.equal(optimized.calls.length, 5);
  assert.equal(optimized.result.totalItems, 100);
  // No snapshot survives a request, including a changed price or visibility.
  data.products[0].base_price_usd = data.products[0].regular_price_usd = 0;
  assert.equal(parity(data).optimized.result.totalItems, 99);
});

test('lotes limitados, múltiples páginas de productos/variaciones y variaciones inactivas', () => {
  const products = Array.from({ length: 510 }, (_, i) => product(`p${i}`, { has_variations: true }));
  const vars = Array.from({ length: 650 }, (_, i) => record(`v${String(i).padStart(4, '0')}`, {
    product: products[i % 100].id, active: i % 4 !== 0, price_usd: 10, stock: 5,
    sort_order: i % 3, expiration_date: i % 2 ? '2999-01-01' : '2000-01-01',
  }));
  const { optimized } = parity(fixture(products, vars));
  assert.ok(optimized.calls.some(c => c.collection === 'product_variations' && c.offset === 500));
  assert.equal(optimized.calls.filter(c => c.collection === 'products').length, 2);
});

test('fallo de lote inicial o parcial vuelve a la lectura anterior sin usar resultados incompletos', () => {
  const data = fixture([product('p', { has_variations: true })], Array.from({ length: 501 }, (_, i) => record(`v${String(i).padStart(4, '0')}`, {
    product: 'p', active: true, price_usd: 10, stock: 1, expiration_date: i === 500 ? '2999-01-01' : '2000-01-01',
  })));
  for (const failBatchOffset of [0, 500]) {
    const { optimized } = parity(data, { failBatchOffset });
    assert.deepEqual(optimized.ids, ['p']);
    assert.ok(optimized.calls.some(c => c.params?.product === 'p'));
  }
});

test('solo la proyección exacta opta al lote; no cambia listado general, personal ni detalles', () => {
  const data = fixture([product('p1'), product('p2')]);
  for (const fields of ['', 'id,name', `${FIELDS},stock`, 'id,category,subcategory']) {
    assert.equal(run(data, fields).calls.filter(c => Object.hasOwn(c.params || {}, 'product0')).length, 0);
  }
  assert.equal(run(data, 'active, subcategory, category, id').calls.length, 5);
  assert.equal(run(data, FIELDS, { auth: record('admin', { role: 'store_admin' }) }).calls.length, 0);
  assert.equal(parity(fixture([])).optimized.calls.length, 1);
});
