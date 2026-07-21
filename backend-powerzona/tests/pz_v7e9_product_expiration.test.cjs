const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const expiration = require('../pb_hooks/pz_product_expiration_lib.js');

function premiumStore() {
  return { plan: 'premium', plan_started_at: '2026-01-01T00:00:00.000Z', plan_expires_at: '', plan_is_permanent: true };
}

function basicStore() {
  return { plan: 'basic', plan_started_at: '2026-01-01T00:00:00.000Z', plan_expires_at: '', plan_is_permanent: true };
}

function mutableRecord(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    set(key, value) { this[key] = value; },
  };
}

function alertApp({ stores = [], products = [], variations = [], settings = [] } = {}) {
  const tables = {
    stores: [...stores],
    products: [...products],
    product_variations: [...variations],
    settings: [...settings],
    product_expiration_cycles: [],
    store_notifications: [],
    store_activity_audit: [],
  };
  let sequence = 0;
  return {
    tables,
    findCollectionByNameOrId(name) { return { name }; },
    findRecordById(collection, id) {
      const found = (tables[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit = 200, offset = 0, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.store) rows = rows.filter((item) => item.store === params.store);
      if (params.product) rows = rows.filter((item) => item.product === params.product);
      if (params.key) rows = rows.filter((item) => item.cycle_key === params.key);
      if (params.date) rows = rows.filter((item) => item.expiration_date === params.date);
      if (params.threshold !== undefined) rows = rows.filter((item) => item.threshold === params.threshold);
      if (params.collection) rows = rows.filter((item) => item.entity_collection === params.collection);
      if (params.notification) rows = rows.filter((item) => item.notification === params.notification);
      if (params.id) rows = rows.filter((item) => item.entity_id === params.id);
      return rows.slice(offset, offset + limit);
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const found = (tables[collection] || []).find((item) => (
        (!params.store || item.store === params.store)
        && (!params.source || item.source_event_key === params.source)
      ));
      if (!found) throw new Error('not_found');
      return found;
    },
    save(item) {
      const collection = item._collectionName;
      if (!collection) return item;
      if (!item.id) item.id = `v7e9record${String(++sequence).padStart(5, '0')}`;
      if (!(tables[collection] || []).includes(item)) tables[collection].push(item);
      return item;
    },
    delete(item) {
      Object.values(tables).forEach((rows) => {
        const index = rows.indexOf(item);
        if (index >= 0) rows.splice(index, 1);
      });
    },
  };
}

function withFakePocketBaseRecord(callback) {
  const previous = global.Record;
  global.Record = class FakePocketBaseRecord {
    constructor(collection) {
      this.id = '';
      this._collectionName = collection.name;
    }
    get(key) { return this[key]; }
    set(key, value) { this[key] = value; }
  };
  try { return callback(); } finally { global.Record = previous; }
}

function civilDatePlus(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

test('acepta exclusivamente fechas civiles inequívocas', () => {
  assert.equal(expiration.normalizeCivilDate('2026-08-20', false), '2026-08-20');
  assert.equal(expiration.normalizeCivilDate('2026-02-29', false), null);
  assert.equal(expiration.normalizeCivilDate('20/08/2026', false), null);
  assert.equal(expiration.normalizeCivilDate('2026-08-20T12:00:00Z', true), null);
  assert.equal(expiration.normalizeCivilDate('2026-08-20 00:00:00.000Z', true), '2026-08-20');
  assert.equal(expiration.normalizeCivilDate(null, true), '');
  assert.equal(expiration.normalizeCivilDate('', true), '');
  assert.equal(expiration.normalizeCivilDate('   ', true), '');
});

test('bloquea a las 00:00 del propio día civil de La Habana', () => {
  assert.equal(expiration.daysUntilExpiration('2026-08-20', '2026-08-20T03:59:59.999Z'), 1);
  assert.equal(expiration.isExpired('2026-08-20', '2026-08-20T03:59:59.999Z'), false);
  assert.equal(expiration.daysUntilExpiration('2026-08-20', '2026-08-20T04:00:00.000Z'), 0);
  assert.equal(expiration.isExpired('2026-08-20', '2026-08-20T04:00:00.000Z'), true);
});

test('selecciona solo el umbral vigente 90/60/30/0 y nunca 7', () => {
  assert.equal(expiration.currentThreshold(91), null);
  assert.equal(expiration.currentThreshold(90), 90);
  assert.equal(expiration.currentThreshold(75), 90);
  assert.equal(expiration.currentThreshold(60), 60);
  assert.equal(expiration.currentThreshold(45), 60);
  assert.equal(expiration.currentThreshold(30), 30);
  assert.equal(expiration.currentThreshold(20), 30);
  assert.equal(expiration.currentThreshold(7), 30);
  assert.equal(expiration.currentThreshold(0), 0);
  assert.equal(expiration.currentThreshold(-10), 0);
  assert.deepEqual(expiration.THRESHOLDS, [90, 60, 30, 0]);
});

test('Free y Básico ignoran comercialmente fechas residuales', () => {
  const product = { expiration_date: '2020-01-01', has_variations: false };
  assert.equal(expiration.evaluateCommercialAvailability({ store: basicStore(), product, now: '2026-07-17T12:00:00Z' }).available, true);
  assert.equal(expiration.evaluateCommercialAvailability({ store: { ...basicStore(), plan: 'free', plan_is_permanent: false, plan_expires_at: '2026-08-01T00:00:00Z' }, product, now: '2026-07-17T12:00:00Z' }).available, true);
});

test('Premium bloquea fecha general vencida y conserva avisos futuros vendibles', () => {
  const expired = expiration.evaluateCommercialAvailability({ store: premiumStore(), product: { expiration_date: '2026-07-17' }, now: '2026-07-17T12:00:00Z' });
  const future = expiration.evaluateCommercialAvailability({ store: premiumStore(), product: { expiration_date: '2026-07-18' }, now: '2026-07-17T12:00:00Z' });
  assert.equal(expired.available, false);
  assert.equal(expired.reason, 'product_expired');
  assert.equal(future.available, true);
});

test('una variación sin fecha sigue vendible y una vencida se bloquea individualmente', () => {
  const product = { has_variations: true, track_stock: true, expiration_date: '' };
  const valid = { id: 'variationvalid1', active: true, price_usd: 10, stock: 2, expiration_date: '' };
  const expired = { id: 'variationexpire', active: true, price_usd: 10, stock: 2, expiration_date: '2026-07-17' };
  assert.equal(expiration.evaluateCommercialAvailability({ store: premiumStore(), product, variations: [valid, expired], variation: valid, now: '2026-07-17T12:00:00Z' }).available, true);
  assert.equal(expiration.evaluateCommercialAvailability({ store: premiumStore(), product, variations: [valid, expired], variation: expired, now: '2026-07-17T12:00:00Z' }).available, false);
  assert.equal(expiration.evaluateCommercialAvailability({ store: premiumStore(), product, variations: [valid, expired], now: '2026-07-17T12:00:00Z' }).available, true);
});

test('el producto se bloquea cuando todas sus variaciones vendibles vencieron', () => {
  const product = { has_variations: true, track_stock: true, expiration_date: '' };
  const variations = [
    { active: true, price_usd: 10, stock: 2, expiration_date: '2026-07-16' },
    { active: true, price_usd: 12, stock: 1, expiration_date: '2026-07-17' },
    { active: true, price_usd: 8, stock: 0, allow_preorder: false, expiration_date: '' },
  ];
  const result = expiration.evaluateCommercialAvailability({ store: premiumStore(), product, variations, now: '2026-07-17T12:00:00Z' });
  assert.equal(result.available, false);
  assert.equal(result.reason, 'all_sellable_variations_expired');
});

test('conteos separan vencidos y próximos por cada unidad independiente', () => {
  const summary = expiration.expirationSummary([
    { days: -1 },
    { days: 10 },
    { days: 5 },
    { days: 15 },
    { days: 31 },
  ]);
  assert.deepEqual(summary, { expired_products: 1, upcoming_30_products: 3 });
});

test('endpoint limita paginación 5/10 y normaliza la búsqueda sin abrir filtros arbitrarios', () => {
  const base = { view: 'upcoming', window_days: 60, page: 2 };
  assert.deepEqual(expiration.parseAdminQueryPayload(base), { view: 'upcoming', windowDays: 60, page: 2, pageSize: 10, query: '' });
  assert.deepEqual(expiration.parseAdminQueryPayload({ ...base, page_size: 5, query: '  glucosamina   forte  ' }), { view: 'upcoming', windowDays: 60, page: 2, pageSize: 5, query: 'glucosamina forte' });
  assert.deepEqual(expiration.parseAdminQueryPayload({ ...base, page_size: 10, query: '' }), { view: 'upcoming', windowDays: 60, page: 2, pageSize: 10, query: '' });
  [0, 1, 6, 20, '5', '10'].forEach((pageSize) => {
    assert.equal(expiration.parseAdminQueryPayload({ ...base, page_size: pageSize }), null);
  });
  assert.deepEqual(expiration.parseAdminQueryPayload({ ...base, query: 'x'.repeat(80) })?.query, 'x'.repeat(80));
  assert.equal(expiration.parseAdminQueryPayload({ ...base, query: 'x'.repeat(81) }), null);
  assert.deepEqual(expiration.parseAdminQueryPayload({ ...base, query: '  ' })?.query, '');
  assert.deepEqual(expiration.parseAdminQueryPayload({ ...base, query: 'name ~ "x" || store != ""' })?.query, 'name ~ "x" || store != ""');
  assert.equal(expiration.parseAdminQueryPayload({ view: 'upcoming', window_days: 7, page: 1 }), null);
  assert.equal(expiration.parseAdminQueryPayload({ view: 'expired', window_days: 30, page: 1, store_id: 'forbiddenstore1' }), null);
  assert.equal(expiration.parseAdminQueryPayload({ ...base, extra_filter: 'forbidden' }), null);
});

test('búsqueda privada coincide solo con nombre de producto o label de variación', () => {
  const items = [
    { name: 'Glucosamina Forte', affected_variations: [{ name: 'Tamaño: Grande' }] },
    { name: 'Vitamina C', affected_variations: [{ name: 'Sabor: Naranja' }] },
  ];
  assert.deepEqual(expiration.filterAdminExpirationItems(items, 'glucosamina'), [items[0]]);
  assert.deepEqual(expiration.filterAdminExpirationItems(items, 'naranja'), [items[1]]);
  assert.deepEqual(expiration.filterAdminExpirationItems(items, 'sin resultado'), []);
  assert.deepEqual(expiration.filterAdminExpirationItems(items, 'name ~ "x"'), []);
  assert.equal(expiration.filterAdminExpirationItems(items, ''), items);
});

test('V7E9 enumera padre o variaciones activas como unidades excluyentes y hereda solo sin fechas propias', () => {
  const store = mutableRecord('storeunits00001', { ...premiumStore(), status: 'active' });
  const parent = mutableRecord('productunits001', {
    store: store.id, name: 'Padre', active: true, has_variations: false, expiration_date: '2026-07-17',
  });
  const container = mutableRecord('productunits002', {
    store: store.id, name: 'Creatina', active: true, has_variations: true, expiration_date: '2026-08-06',
  });
  const inherited = mutableRecord('productunits003', {
    store: store.id, name: 'Proteína', active: true, has_variations: true, expiration_date: '2026-08-06',
  });
  const inactiveParent = mutableRecord('productunits004', {
    store: store.id, name: 'Oculto', active: false, has_variations: false, expiration_date: '2026-07-17',
  });
  const variations = [
    mutableRecord('variationunit01', { product: parent.id, active: true, expiration_date: '2026-07-01' }),
    mutableRecord('variationunit02', { product: container.id, active: true, variation_type: 'Sabor', value: 'Fresa', expiration_date: '2026-07-17' }),
    mutableRecord('variationunit03', { product: container.id, active: true, variation_type: 'Sabor', value: 'Vainilla', expiration_date: '2026-07-27' }),
    mutableRecord('variationunit04', { product: container.id, active: true, variation_type: 'Sabor', value: 'Chocolate', expiration_date: '' }),
    mutableRecord('variationunit05', { product: container.id, active: false, variation_type: 'Sabor', value: 'Inactiva', expiration_date: '2026-07-20' }),
    mutableRecord('variationunit06', { product: inherited.id, active: true, variation_type: 'Tamaño', value: 'Pequeño', expiration_date: '' }),
    mutableRecord('variationunit07', { product: inherited.id, active: true, variation_type: 'Tamaño', value: 'Grande', expiration_date: '' }),
    mutableRecord('variationunit08', { product: inherited.id, active: false, variation_type: 'Tamaño', value: 'Oculto', expiration_date: '2026-07-01' }),
  ];
  const app = alertApp({ stores: [store], products: [parent, container, inherited, inactiveParent], variations });
  const units = expiration.productExpirationUnits(app, store.id, '2026-07-17T12:00:00Z');

  assert.deepEqual(units.map((unit) => unit.id), [
    parent.id,
    'variationunit02',
    'variationunit03',
    'variationunit06',
    'variationunit07',
  ]);
  assert.equal(units.some((unit) => unit.id === container.id), false, 'el contenedor nunca es unidad V7E9');
  assert.equal(units.some((unit) => unit.id === 'variationunit01'), false, 'el modo padre ignora fechas retenidas');
  assert.equal(units.find((unit) => unit.id === 'variationunit06').date, '2026-08-06');
  assert.equal(units.find((unit) => unit.id === 'variationunit07').date, '2026-08-06');
  assert.deepEqual(expiration.expirationSummary(units), { expired_products: 2, upcoming_30_products: 3 });
});

test('after-create de variación activa materializa su alerta heredada aunque active use default', () => {
  withFakePocketBaseRecord(() => {
    const store = mutableRecord('screatevar00001', { ...premiumStore(), status: 'active', slug: 'crear' });
    const product = mutableRecord('pcreatevar00001', {
      store: store.id, name: 'Herencia creada', active: true, has_variations: true,
      expiration_date: '2026-08-06',
    });
    const variation = mutableRecord('vcreatevar00001', {
      product: product.id, variation_type: 'Sabor', value: 'Nueva', expiration_date: '',
    });
    const app = alertApp({ stores: [store], products: [product], variations: [variation] });
    expiration.handleExpirationRecordChange({ app, record: variation }, 'product_variations', 'create');
    assert.deepEqual(app.tables.product_expiration_cycles.map((cycle) => cycle.entity_id), [variation.id]);
    assert.equal(app.tables.store_notifications.length, 1);
  });
});

test('endpoint privado separa hermanas mixed, cuenta unidades y busca por padre o variación', () => {
  const today = expiration.havanaTodayKey(new Date());
  const store = mutableRecord('storequery00001', {
    ...premiumStore(), status: 'active', primary_admin_user: 'adminquery00001',
  });
  const auth = mutableRecord('adminquery00001', { role: 'store_admin', status: 'active', store: store.id });
  const product = mutableRecord('productquery001', {
    store: store.id, name: 'Creatina Mixed', active: true, has_variations: true, expiration_date: '',
  });
  const general = mutableRecord('productquery002', {
    store: store.id, name: 'Vitamina general', active: true, has_variations: false,
    expiration_date: civilDatePlus(today, 5),
  });
  const variations = [
    mutableRecord('variationquery1', { product: product.id, active: true, variation_type: 'Sabor', value: 'Fresa', expiration_date: civilDatePlus(today, -1) }),
    mutableRecord('variationquery2', { product: product.id, active: true, variation_type: 'Sabor', value: 'Vainilla', expiration_date: civilDatePlus(today, 10) }),
    mutableRecord('variationquery3', { product: product.id, active: true, variation_type: 'Sabor', value: 'Chocolate', expiration_date: '' }),
    mutableRecord('variationquery4', { product: product.id, active: false, variation_type: 'Sabor', value: 'Inactiva', expiration_date: civilDatePlus(today, 2) }),
  ];
  const app = alertApp({ stores: [store], products: [product, general], variations });
  const query = (view, search = '') => {
    const body = { view, window_days: 30, page: 1, page_size: 10, query: search };
    return expiration.handleAdminExpirationQuery({
      app,
      auth,
      requestInfo: () => ({ auth, body }),
      response: { header: () => ({ set() {} }) },
      json: (status, payload) => ({ status, payload }),
    });
  };

  const expired = query('expired');
  const upcoming = query('upcoming');
  assert.equal(expired.status, 200);
  assert.equal(expired.payload.total_items, 1);
  assert.equal(expired.payload.items[0].affected_variations[0].name, 'Sabor: Fresa');
  assert.equal(upcoming.payload.total_items, 2);
  assert.deepEqual(upcoming.payload.summary, { expired_products: 1, upcoming_30_products: 2 });
  assert.ok(upcoming.payload.items.some((item) => item.affected_variations[0]?.name === 'Sabor: Vainilla'));
  assert.ok(upcoming.payload.items.some((item) => item.mode === 'general'));
  assert.equal(query('upcoming', 'vainilla').payload.total_items, 1);
  assert.equal(query('expired', 'creatina').payload.total_items, 1);
  assert.equal(JSON.stringify([...expired.payload.items, ...upcoming.payload.items]).includes('Inactiva'), false);
});

test('la deduplicación persiste por tienda, entidad, fecha y umbral', () => {
  const key = expiration.cycleKey('store000000001', 'products', 'product0000001', '2026-08-20', 30);
  assert.equal(key, 'store000000001:products:product0000001:2026-08-20:30');
  assert.notEqual(key, expiration.cycleKey('store000000002', 'products', 'product0000001', '2026-08-20', 30));
  assert.notEqual(key, expiration.cycleKey('store000000001', 'products', 'product0000001', '2026-08-21', 30));
  assert.notEqual(key, expiration.cycleKey('store000000001', 'products', 'product0000001', '2026-08-20', 60));
});

test('motor crea una notificación por variación y conserva deduplicación aunque se borre la campana', () => {
  withFakePocketBaseRecord(() => {
    const store = mutableRecord('storealert00001', { ...premiumStore(), slug: 'alertas', status: 'active' });
    const product = mutableRecord('productalert001', { store: store.id, name: 'Lácteo', has_variations: true });
    const variations = [
      mutableRecord('variationalert1', { product: product.id, variation_type: 'Sabor', value: 'Fresa', expiration_date: '2026-08-06' }),
      mutableRecord('variationalert2', { product: product.id, variation_type: 'Sabor', value: 'Mango', expiration_date: '2026-08-06' }),
      mutableRecord('variationalert3', { product: product.id, variation_type: 'Sabor', value: 'Vainilla', expiration_date: '2026-08-31' }),
    ];
    const app = alertApp({ stores: [store], products: [product], variations });
    const first = expiration.processStoreExpirationAlerts(app, store, '2026-07-17T12:00:00Z');
    assert.deepEqual(first, { notifications: 3, cycles: 3 });
    assert.equal(app.tables.store_notifications.length, 3);
    assert.equal(app.tables.product_expiration_cycles.length, 3);
    assert.ok(app.tables.store_notifications.every((item) => item.metadata_json.variation_ids.length === 1));
    assert.deepEqual(
      app.tables.store_notifications.map((item) => item.metadata_json.variation_ids[0]).sort(),
      ['variationalert1', 'variationalert2', 'variationalert3'],
    );
    assert.equal(app.tables.store_notifications.find((item) => item.entity_id === 'variationalert1').priority, 'important');

    app.tables.store_notifications.length = 0;
    assert.deepEqual(expiration.processStoreExpirationAlerts(app, store, '2026-07-17T12:00:00Z'), { notifications: 0, cycles: 0 });
    assert.equal(app.tables.store_notifications.length, 0);
  });
});

test('motor genera solo 90/60/30/0 con prioridades aprobadas y nada para Básico', () => {
  withFakePocketBaseRecord(() => {
    const store = mutableRecord('storealert00002', { ...premiumStore(), slug: 'umbrales', status: 'active' });
    const products = [
      mutableRecord('productalert002', { store: store.id, name: '75 días', expiration_date: '2026-09-30' }),
      mutableRecord('productalert003', { store: store.id, name: '45 días', expiration_date: '2026-08-31' }),
      mutableRecord('productalert004', { store: store.id, name: '20 días', expiration_date: '2026-08-06' }),
      mutableRecord('productalert005', { store: store.id, name: 'Hoy', expiration_date: '2026-07-17' }),
    ];
    const app = alertApp({ stores: [store], products });
    assert.deepEqual(expiration.processStoreExpirationAlerts(app, store, '2026-07-17T12:00:00Z'), { notifications: 4, cycles: 4 });
    assert.deepEqual(app.tables.product_expiration_cycles.map((item) => item.threshold).sort((a, b) => b - a), [90, 60, 30, 0]);
    assert.deepEqual(app.tables.store_notifications.map((item) => item.priority), ['normal', 'normal', 'important', 'critical']);

    const basic = mutableRecord('storealert00003', { ...basicStore(), slug: 'basico', status: 'active' });
    const basicApp = alertApp({ stores: [basic], products: [mutableRecord('productalert006', { store: basic.id, expiration_date: '2026-07-17' })] });
    assert.deepEqual(expiration.processStoreExpirationAlerts(basicApp, basic, '2026-07-17T12:00:00Z'), { notifications: 0, cycles: 0 });
  });
});

test('cambio o borrado de fecha elimina el ciclo y la notificación anteriores', () => {
  withFakePocketBaseRecord(() => {
    const store = mutableRecord('storealert00004', { ...premiumStore(), slug: 'reinicio', status: 'active' });
    const product = mutableRecord('productalert007', { store: store.id, name: 'Ciclo', expiration_date: '2026-08-06' });
    const app = alertApp({ stores: [store], products: [product] });
    expiration.processStoreExpirationAlerts(app, store, '2026-07-17T12:00:00Z');
    assert.equal(app.tables.product_expiration_cycles.length, 1);
    assert.equal(app.tables.store_notifications.length, 1);

    app.tables.products.push(mutableRecord('productalert008', {
      store: store.id,
      name: 'Otro ciclo pendiente',
      expiration_date: '2026-08-07',
    }));

    product.original = () => mutableRecord(product.id, { store: store.id, name: 'Ciclo', expiration_date: '2026-08-06' });
    product.expiration_date = '';
    expiration.handleExpirationRecordChange({ app, record: product, requestInfo: () => ({ body: { expiration_date: '' } }) }, 'products');
    assert.equal(app.tables.product_expiration_cycles.length, 1);
    assert.equal(app.tables.product_expiration_cycles[0].entity_id, 'productalert008');
    assert.equal(app.tables.store_notifications.length, 1);
  });
});

test('borrar la última fecha individual limpia su estado sin restaurar fecha general ni crear alertas', () => {
  withFakePocketBaseRecord(() => {
    const store = mutableRecord('storealert00005', { ...premiumStore(), slug: 'variaciones', status: 'active' });
    const product = mutableRecord('productalert009', { store: store.id, name: 'Lotes', has_variations: true, expiration_date: '' });
    const variation = mutableRecord('variationalert4', {
      product: product.id,
      variation_type: 'Lote',
      value: 'A',
      expiration_date: '2026-08-06',
    });
    const app = alertApp({ stores: [store], products: [product], variations: [variation] });
    expiration.processStoreExpirationAlerts(app, store, '2026-07-17T12:00:00Z');
    assert.equal(app.tables.product_expiration_cycles.length, 1);
    assert.equal(app.tables.store_notifications.length, 1);

    variation.original = () => mutableRecord(variation.id, { product: product.id, expiration_date: '2026-08-06' });
    variation.expiration_date = '';
    expiration.handleExpirationRecordChange({ app, record: variation }, 'product_variations');

    assert.equal(product.expiration_date, '');
    assert.equal(variation.expiration_date, '');
    assert.equal(app.tables.product_expiration_cycles.length, 0);
    assert.equal(app.tables.store_notifications.length, 0);
  });
});

test('F12 rechaza fecha residual, cruce de tienda, fecha inválida y coexistencia de modos', () => {
  const storeId = 'storevalid00001';
  const productId = 'productvalid001';
  const premium = mutableRecord(storeId, { ...premiumStore(), primary_admin_user: 'adminvalidate01' });
  const basic = mutableRecord(storeId, basicStore());
  const product = mutableRecord(productId, { store: storeId, has_variations: true, expiration_date: '' });
  const variation = mutableRecord('variationvalid1', { product: productId, expiration_date: '2026-08-20' });
  const app = {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === storeId) return this.store;
      if (collection === 'products' && id === productId) return product;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection) { return collection === 'product_variations' ? [variation] : []; },
    save() {}, delete() {}, store: basic,
  };
  const event = (body, authStore = storeId) => ({
    app, record: product,
    auth: mutableRecord('adminvalidate01', { role: 'store_admin', status: 'active', store: authStore }),
    requestInfo: () => ({ body }),
  });
  assert.equal(expiration.validateDateWriteRequest(event({ expiration_date: '2026-08-20' }), 'products').code, 'expiration_premium_required');
  app.store = premium;
  assert.equal(expiration.validateDateWriteRequest(event({ expiration_date: '20/08/2026' }), 'products').code, 'invalid_expiration_date');
  assert.equal(expiration.validateDateWriteRequest(event({ expiration_date: '2026-08-20' }, 'otherstore00001'), 'products').code, 'expiration_not_found');
  assert.equal(expiration.validateDateWriteRequest(event({ expiration_date: '2026-08-20' }), 'products').code, 'expiration_modes_conflict');
});

test('Store Staff con permiso conserva el guardado Premium y V7E9 bloquea suspensión o cruce de tienda', () => {
  const storeId = 'storestaff00001';
  const staff = mutableRecord('staffvalidate01', { role: 'store_staff', status: 'active', store: storeId });
  const product = mutableRecord('productstaff001', { store: storeId, expiration_date: '' });
  const variation = mutableRecord('variationstaff1', { product: product.id, expiration_date: '' });
  let permissionEnabled = true;
  const app = {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === storeId) return mutableRecord(storeId, { ...premiumStore(), primary_admin_user: 'primarystaff001' });
      if (collection === 'products' && id === product.id) return product;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection) { return collection === 'users' ? [staff] : []; },
    findFirstRecordByFilter(collection) {
      if (collection === 'store_user_access' && permissionEnabled) {
        return mutableRecord('accessstaff0001', {
          store: storeId,
          user: 'staffvalidate01',
          template_code: 'custom',
          permissions_json: ['catalog.expirations.manage'],
        });
      }
      throw new Error('not_found');
    },
    save() {},
    delete() {},
  };
  const event = (record, body, status = 'active', authStore = storeId, role = 'store_staff') => ({
    app,
    record,
    auth: role === 'store_staff' && status === 'active' && authStore === storeId
      ? staff
      : mutableRecord('staffvalidate01', { role, status, store: authStore }),
    requestInfo: () => ({ body }),
  });

  assert.equal(expiration.validateDateWriteRequest(event(product, { name: 'Sin cambiar fecha' }), 'products'), null);
  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20' }), 'products'), null);
  assert.equal(product.expiration_date, '2026-08-20');
  product.expiration_date = '';
  assert.equal(expiration.validateDateWriteRequest(event(variation, { expiration_date: '2026-08-21' }), 'product_variations'), null);

  for (const emptyValue of [null, '', '   ']) {
    product.expiration_date = '2026-08-20';
    assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: emptyValue }), 'products'), null);
    assert.equal(product.expiration_date, '', `normaliza ${String(emptyValue)} como ausencia`);
  }
  product.expiration_date = '2026-08-20';
  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20T12:00:00Z' }), 'products').code, 'invalid_expiration_date');
  assert.equal(product.expiration_date, '2026-08-20', 'un valor inválido no muta el registro');

  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20' }, 'suspended'), 'products').code, 'expiration_unauthorized');
  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20' }, 'active', 'otherstore00001'), 'products').code, 'expiration_not_found');
  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20' }, 'active', storeId, 'customer'), 'products').code, 'permission_denied');
  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20' }, 'active', '', 'master_admin'), 'products').code, 'expiration_unauthorized');
  permissionEnabled = false;
  assert.equal(expiration.validateDateWriteRequest(event(product, { expiration_date: '2026-08-20' }), 'products').code, 'permission_denied');
});

test('primera fecha de variación elimina fecha general y deja un único evento central seguro', () => {
  withFakePocketBaseRecord(() => {
    const storeId = 'storevalid00002';
    const product = mutableRecord('productvalid002', {
      store: storeId,
      name: 'Producto con fecha general',
      has_variations: true,
      expiration_date: '2026-09-01',
      updated: '2026-07-20 10:00:00.000Z',
    });
    const variation = mutableRecord('variationvalid2', { product: product.id, expiration_date: '2026-08-20' });
    const saved = [];
    const app = {
      findCollectionByNameOrId(name) { return { name }; },
      findRecordById(collection, id) {
        if (collection === 'stores' && id === storeId) return mutableRecord(storeId, { ...premiumStore(), primary_admin_user: 'adminvalidate02' });
        if (collection === 'products' && id === product.id) return product;
        throw new Error('not_found');
      },
      findRecordsByFilter() { return []; },
      findFirstRecordByFilter(collection, _filter, params = {}) {
        if (collection === 'store_activity_audit') {
          const found = saved.find((item) => item._collectionName === collection
            && item.store === params.store && item.source_event_key === params.source);
          if (found) return found;
        }
        throw new Error('not_found');
      },
      save(item) { saved.push(item); return item; },
      delete() {},
    };
    const event = {
      app, record: variation,
      auth: mutableRecord('adminvalidate02', { role: 'store_admin', status: 'active', store: storeId, display_name: 'Administradora' }),
      requestInfo: () => ({ body: { expiration_date: '2026-08-20' } }),
    };
    assert.equal(expiration.validateDateWriteRequest(event, 'product_variations'), null);
    assert.equal(product.expiration_date, '');
    assert.equal(saved[0], product);
    const central = saved[1];
    assert.equal(central._collectionName, 'store_activity_audit');
    assert.equal(central.action, 'product_expiration_cleared_for_variation');
    assert.equal(central.module, 'catalog');
    assert.equal(central.resource_type, 'product');
    assert.equal(central.resource_id_snapshot, product.id);
    assert.deepEqual(central.changed_fields_json, ['expiration_date']);
    assert.deepEqual(central.previous_values_json, { expiration_date: '2026-09-01' });
    assert.deepEqual(central.new_values_json, { expiration_date: '' });
    assert.doesNotMatch(JSON.stringify(central), /password|token|cookie|full_ip|ip_address/i);

    assert.equal(expiration.validateDateWriteRequest(event, 'product_variations'), null);
    assert.equal(saved.length, 2, 'el producto ya limpio no genera un evento duplicado');
  });
});

test('hook de fecha abre una sola transacción y restaura el app original', () => {
  let transactions = 0;
  let nestedTransactions = 0;
  let appSeenByNext = null;
  const txApp = {
    isTransactional() { return true; },
    runInTransaction() { nestedTransactions += 1; },
  };
  const app = {
    isTransactional() { return false; },
    runInTransaction(callback) { transactions += 1; callback(txApp); },
  };
  const event = {
    app,
    record: mutableRecord('productvalid003', {}),
    requestInfo: () => ({ body: {} }),
    next() { appSeenByNext = this.app; return 'saved'; },
  };
  assert.equal(expiration.handleDateWriteRequest(event, 'products'), 'saved');
  assert.equal(transactions, 1);
  assert.equal(nestedTransactions, 0);
  assert.equal(appSeenByNext, txApp);
  assert.equal(event.app, app);
});

test('transición true→false conserva variaciones, acepta stock cero y limpia solo su estado comercial', () => {
  withFakePocketBaseRecord(() => {
    const today = expiration.havanaTodayKey(new Date());
    const store = mutableRecord('smodetest000001', {
      ...premiumStore(), status: 'active', slug: 'modo', primary_admin_user: 'amodetest000001',
    });
    const product = mutableRecord('pmodetest000001', {
      store: store.id,
      name: 'Producto modo',
      active: false,
      has_variations: true,
      track_stock: true,
      base_price_usd: 25,
      cost_usd: 0,
      stock: 0,
      expiration_date: '',
    });
    const variations = [
      mutableRecord('vmodetest000001', { product: product.id, active: true, price_usd: 10, cost_usd: 0, stock: 0, expiration_date: today }),
      mutableRecord('vmodetest000002', { product: product.id, active: true, price_usd: 12, cost_usd: 2, stock: 2, expiration_date: civilDatePlus(today, 10) }),
      mutableRecord('vmodetest000003', { product: product.id, active: false, price_usd: 15, stock: 3, expiration_date: civilDatePlus(today, 5) }),
    ];
    const app = alertApp({ stores: [store], products: [product], variations });
    const auth = mutableRecord('amodetest000001', { role: 'store_admin', status: 'active', store: store.id });

    product.active = true;
    expiration.processStoreExpirationAlerts(app, store, new Date());
    assert.equal(app.tables.product_expiration_cycles.length, 2);
    assert.equal(app.tables.store_notifications.length, 2);

    const enabledSnapshot = mutableRecord(product.id, { ...product, has_variations: true });
    product.has_variations = false;
    product.active = false;
    product.original = () => enabledSnapshot;
    const disabled = expiration.handleDateWriteRequest({
      app,
      record: product,
      auth,
      requestInfo: () => ({ body: { has_variations: false, active: false } }),
      next: () => 'disabled',
    }, 'products');
    assert.equal(disabled, 'disabled');
    assert.equal(product.has_variations, false);
    assert.equal(product.active, false, 'la visibilidad inactiva es configuración padre válida');
    assert.equal(product.stock, 0, 'stock cero es configuración válida');
    assert.deepEqual(variations.map((variation) => variation.expiration_date), [today, civilDatePlus(today, 10), civilDatePlus(today, 5)]);
    assert.equal(app.tables.product_expiration_cycles.length, 0);
    assert.equal(app.tables.store_notifications.length, 0);
    assert.equal(app.tables.store_activity_audit.at(-1).action, 'product_variations_disabled');

    const disabledSnapshot = mutableRecord(product.id, { ...product, has_variations: false, expiration_date: civilDatePlus(today, 20) });
    product.has_variations = true;
    product.active = true;
    product.expiration_date = civilDatePlus(today, 20);
    product.original = () => disabledSnapshot;
    const enabled = expiration.handleDateWriteRequest({
      app,
      record: product,
      auth,
      requestInfo: () => ({ body: { has_variations: true, active: true, expiration_date: civilDatePlus(today, 20) } }),
      next: () => 'enabled',
    }, 'products');
    assert.equal(enabled, 'enabled');
    assert.equal(product.expiration_date, '', 'fechas propias activas limpian la fecha del contenedor al reactivar');
    assert.equal(app.tables.product_expiration_cycles.length, 2);
    assert.equal(app.tables.store_notifications.length, 2);
    assert.equal(app.tables.store_activity_audit.at(-1).action, 'product_variations_enabled');
    assert.deepEqual(expiration.processStoreExpirationAlerts(app, store, new Date()), { notifications: 0, cycles: 0 });
  });
});

test('validación de modo comprueba estructura, no visibilidad, stock disponible ni vencimiento', () => {
  const creating = mutableRecord('pnewmode0000001', { has_variations: true });
  creating.isNew = () => true;
  creating.original = () => mutableRecord(creating.id, { has_variations: false });
  assert.equal(expiration.validateVariationModeTransition({
    app: { findRecordsByFilter() { return []; } },
    record: creating,
    requestInfo: () => ({ body: { has_variations: true } }),
  }, 'products'), null, 'crear el contenedor no exige variaciones antes de poder guardarlo');

  const product = mutableRecord('pvalidmode00001', {
    store: 'svalidmode00001', active: false, has_variations: false,
    track_stock: true, base_price_usd: 0, stock: 0,
  });
  product.original = () => mutableRecord(product.id, { ...product, has_variations: true });
  const variations = [];
  const app = {
    findRecordsByFilter(collection) { return collection === 'product_variations' ? variations : []; },
  };
  const event = (body) => ({ app, record: product, requestInfo: () => ({ body }) });
  assert.equal(expiration.validateVariationModeTransition(event({ has_variations: false }), 'products').code, 'parent_commerce_invalid');

  product.base_price_usd = 10;
  assert.equal(expiration.validateVariationModeTransition(event({ has_variations: false }), 'products'), null);

  product.has_variations = true;
  product.original = () => mutableRecord(product.id, { ...product, has_variations: false });
  variations.push(mutableRecord('vvalidmode00001', {
    product: product.id, active: true, price_usd: 7, stock: 0, expiration_date: '2000-01-01',
  }));
  assert.equal(expiration.validateVariationModeTransition(event({ has_variations: true }), 'products'), null);
  variations[0].active = false;
  assert.equal(expiration.validateVariationModeTransition(event({ has_variations: true }), 'products').code, 'valid_variation_required');
});

test('activar modo variaciones pagina hasta encontrar una unidad valida fuera del primer lote', () => {
  const product = mutableRecord('ppagedmode00001', {
    store: 'spagedmode00001',
    active: true,
    has_variations: true,
    track_stock: true,
    base_price_usd: 10,
    stock: 1,
  });
  product.original = () => mutableRecord(product.id, { ...product, has_variations: false });
  const filler = mutableRecord('vpagedmode00001', {
    product: product.id,
    active: false,
    price_usd: 0,
    stock: 0,
  });
  const valid = mutableRecord('vpagedmode00002', {
    product: product.id,
    active: true,
    price_usd: 11,
    stock: 0,
    expiration_date: '2000-01-01',
  });
  const calls = [];
  const app = {
    findRecordsByFilter(collection, _filter, sort, limit, offset, params = {}) {
      if (collection !== 'product_variations' || params.product !== product.id) return [];
      calls.push({ sort, limit, offset });
      if (offset === 0) return new Array(500).fill(filler);
      if (offset === 500) return [valid];
      return [];
    },
  };

  assert.equal(expiration.validateVariationModeTransition({
    app,
    record: product,
    requestInfo: () => ({ body: { has_variations: true } }),
  }, 'products'), null);
  assert.deepEqual(calls, [
    { sort: 'sort_order,id', limit: 500, offset: 0 },
    { sort: 'sort_order,id', limit: 500, offset: 500 },
  ]);
});

test('activar la primera variación con fecha propia limpia general y recalcula herencia sin reaparición', () => {
  withFakePocketBaseRecord(() => {
    const today = expiration.havanaTodayKey(new Date());
    const store = mutableRecord('sactivevar00001', {
      ...premiumStore(), status: 'active', slug: 'activar', primary_admin_user: 'aactivevar00001',
    });
    const auth = mutableRecord('aactivevar00001', { role: 'store_admin', status: 'active', store: store.id });
    const product = mutableRecord('pactivevar00001', {
      store: store.id, name: 'Herencia mutable', active: true, has_variations: true,
      track_stock: true, expiration_date: civilDatePlus(today, 20),
    });
    const inherited = mutableRecord('vactivevar00001', {
      product: product.id, active: true, price_usd: 10, stock: 1,
      variation_type: 'Lote', value: 'Heredado', expiration_date: '',
    });
    const retained = mutableRecord('vactivevar00002', {
      product: product.id, active: false, price_usd: 12, stock: 0,
      variation_type: 'Lote', value: 'Retenido', expiration_date: today,
    });
    const app = alertApp({ stores: [store], products: [product], variations: [inherited, retained] });
    expiration.processStoreExpirationAlerts(app, store, new Date());
    assert.deepEqual(app.tables.product_expiration_cycles.map((cycle) => cycle.entity_id), [inherited.id]);

    retained.active = true;
    retained.original = () => mutableRecord(retained.id, { ...retained, active: false });
    assert.throws(() => expiration.handleDateWriteRequest({
      app,
      record: retained,
      auth,
      requestInfo: () => ({ body: { active: true } }),
      next: () => 'invalid-activation',
    }, 'product_variations'), /variation_expired_cannot_activate/);
    retained.active = false;
    retained.expiration_date = civilDatePlus(today, 10);
    retained.original = () => mutableRecord(retained.id, { ...retained, active: false, expiration_date: today });
    retained.active = true;
    expiration.handleDateWriteRequest({
      app,
      record: retained,
      auth,
      requestInfo: () => ({ body: { active: true, expiration_date: retained.expiration_date } }),
      next: () => 'activated-after-correction',
    }, 'product_variations');
    assert.equal(product.expiration_date, '');
    assert.deepEqual(app.tables.product_expiration_cycles.map((cycle) => cycle.entity_id), [retained.id]);
    assert.equal(app.tables.store_activity_audit.some((item) => item.action === 'product_expiration_cleared_for_variation'), true);

    retained.original = () => mutableRecord(retained.id, { ...retained, active: true });
    retained.active = false;
    expiration.handleDateWriteRequest({
      app,
      record: retained,
      auth,
      requestInfo: () => ({ body: { active: false } }),
      next: () => 'deactivated',
    }, 'product_variations');
    assert.equal(product.expiration_date, '', 'desactivar no restaura la fecha general anterior');
    assert.equal(app.tables.product_expiration_cycles.length, 0);
    assert.equal(app.tables.store_notifications.length, 0);
  });
});

test('mutaciones administrativas exitosas registran unidad vencida y reactivada una sola vez', () => {
  withFakePocketBaseRecord(() => {
    const today = expiration.havanaTodayKey(new Date());
    const store = mutableRecord('sunitact0000001', {
      ...premiumStore(), status: 'active', slug: 'actividad', primary_admin_user: 'aunitact0000001',
    });
    const auth = mutableRecord('aunitact0000001', { role: 'store_admin', status: 'active', store: store.id });
    const product = mutableRecord('punitact0000001', {
      store: store.id, name: 'Unidad auditable', active: true, has_variations: false,
      track_stock: false, base_price_usd: 10, expiration_date: today,
    });
    const app = alertApp({ stores: [store], products: [product] });
    product.original = () => mutableRecord(product.id, { ...product, expiration_date: civilDatePlus(today, 10) });
    expiration.handleDateWriteRequest({
      app,
      record: product,
      auth,
      requestInfo: () => ({ body: { expiration_date: today } }),
      next: () => 'expired',
    }, 'products');
    assert.equal(app.tables.store_activity_audit.filter((item) => item.action === 'product_unit_expired').length, 1);

    product.original = () => mutableRecord(product.id, { ...product, expiration_date: today });
    product.expiration_date = '';
    expiration.handleDateWriteRequest({
      app,
      record: product,
      auth,
      requestInfo: () => ({ body: { expiration_date: '' } }),
      next: () => 'reactivated',
    }, 'products');
    const unitEvents = app.tables.store_activity_audit.filter((item) => item.action.startsWith('product_unit_'));
    assert.deepEqual(unitEvents.map((item) => item.action), ['product_unit_expired', 'product_unit_reactivated']);
    assert.deepEqual(unitEvents.map((item) => item.changed_fields_json), [['expiration_date'], ['expiration_date']]);
    assert.doesNotMatch(JSON.stringify(unitEvents), /password|token|cookie|full_ip|ip_address/i);

    product.has_variations = true;
    const hiddenVariation = mutableRecord('vunitact0000001', {
      store: store.id,
      product: product.id,
      variation_type: 'Sabor',
      value: 'Oculta',
      active: false,
      price_usd: 12,
      stock: 2,
      expiration_date: civilDatePlus(today, 9),
    });
    hiddenVariation.original = () => mutableRecord(hiddenVariation.id, { ...hiddenVariation, expiration_date: today });
    app.tables.product_variations.push(hiddenVariation);
    expiration.handleDateWriteRequest({
      app,
      record: hiddenVariation,
      auth,
      requestInfo: () => ({ body: { expiration_date: hiddenVariation.expiration_date } }),
      next: () => 'corrected-while-hidden',
    }, 'product_variations');
    assert.equal(hiddenVariation.active, false, 'corregir fecha no altera la intención manual');
    assert.equal(app.tables.store_activity_audit.filter((item) => item.action === 'variation_expiration_corrected').length, 1);
  });
});

test('orden directa resuelve relaciones reales, devuelve error genérico y omite bloqueo en Básico', () => {
  const storeId = 'storecheckout01';
  const order = mutableRecord('ordercheckout01', { store: storeId });
  const product = mutableRecord('productorder001', {
    store: storeId, name: 'Nombre real', active: true, has_variations: false,
    track_stock: false, expiration_date: '2000-01-01', only_usd: true,
  });
  const item = mutableRecord('orderitem000001', { order: order.id, product: product.id, product_name: 'Manipulado' });
  const store = mutableRecord(storeId, premiumStore());
  const app = {
    findRecordById(collection, id) {
      if (collection === 'orders' && id === order.id) return order;
      if (collection === 'stores' && id === store.id) return store;
      if (collection === 'products' && id === product.id) return product;
      throw new Error('not_found');
    },
    findRecordsByFilter() { return []; },
  };
  const blocked = expiration.validateOrderItemRequest({ app, record: item });
  assert.equal(blocked.code, 'product_unavailable');
  assert.equal(blocked.message, 'Este producto ya no está disponible.');

  Object.assign(store, basicStore());
  assert.equal(expiration.validateOrderItemRequest({ app, record: item }), null);
});

test('limpieza de downgrade audita cada recurso, se limita a la tienda y propaga fallos', () => {
  withFakePocketBaseRecord(() => {
    const storeId = 'storecleanup001';
    const actor = mutableRecord('mastercleanup01', { role: 'master_admin', display_name: 'Master QA' });
    const auditContext = { actor, planAuditId: 'auditcleanup001' };
    const targetProduct = mutableRecord('productclean001', {
      store: storeId, name: 'Producto objetivo', expiration_date: '2026-08-20',
    });
    const otherProduct = mutableRecord('productclean002', {
      store: 'storecleanup002', name: 'Producto ajeno', expiration_date: '2026-08-20',
    });
    const targetVariation = mutableRecord('variationclean1', {
      product: targetProduct.id, variation_type: 'Sabor', value: 'Fresa', expiration_date: '2026-08-21',
    });
    const otherVariation = mutableRecord('variationclean2', {
      product: otherProduct.id, expiration_date: '2026-08-20',
    });
    const cycle = mutableRecord('cyclecleanup001', { store: storeId });
    const expirationNotification = mutableRecord('notifcleanup001', { store: storeId, type: 'product_expired' });
    const stockNotification = mutableRecord('notifcleanup002', { store: storeId, type: 'product_low_stock' });
    const deleted = [];
    const saved = [];
    const app = {
      findCollectionByNameOrId(name) { return { name }; },
      findRecordsByFilter(collection, _filter, _sort, _limit, _offset, params = {}) {
        if (collection === 'products') return params.store === storeId ? [targetProduct] : [];
        if (collection === 'product_variations') return [targetVariation, otherVariation];
        if (collection === 'product_expiration_cycles') return [cycle];
        if (collection === 'store_notifications') return [expirationNotification, stockNotification];
        return [];
      },
      findFirstRecordByFilter(collection, _filter, params = {}) {
        if (collection === 'store_activity_audit') {
          const found = saved.find((item) => item._collectionName === collection
            && item.store === params.store && item.source_event_key === params.source);
          if (found) return found;
        }
        throw new Error('not_found');
      },
      save(item) { saved.push(item); return item; },
      delete(item) { deleted.push(item); },
      db() { throw new Error('preview_not_available_in_unit_mock'); },
    };
    expiration.cleanupStoreExpirationData(app, storeId, auditContext);
    assert.equal(targetProduct.expiration_date, '');
    assert.equal(targetVariation.expiration_date, '');
    assert.equal(otherVariation.expiration_date, '2026-08-20');
    assert.deepEqual(deleted, [cycle, expirationNotification]);

    const centralEvents = saved.filter((item) => item._collectionName === 'store_activity_audit');
    assert.equal(centralEvents.length, 2);
    assert.deepEqual(
      centralEvents.map((item) => item.action),
      [
        'product_expiration_cleared_for_plan_downgrade',
        'product_variation_expiration_cleared_for_plan_downgrade',
      ],
    );
    assert.deepEqual(centralEvents.map((item) => item.resource_type), ['product', 'product_variation']);
    assert.deepEqual(centralEvents.map((item) => item.previous_values_json.expiration_date), ['2026-08-20', '2026-08-21']);
    assert.ok(centralEvents.every((item) => item.new_values_json.expiration_date === ''));
    assert.ok(centralEvents.every((item) => item.actor === actor.id && item.origin === 'master_admin'));
    assert.equal(new Set(centralEvents.map((item) => item.source_event_key)).size, 2);
    assert.doesNotMatch(JSON.stringify(centralEvents), /password|token|cookie|full_ip|ip_address/i);

    targetProduct.expiration_date = '2026-08-20';
    expiration.cleanupStoreExpirationData(app, storeId, auditContext);
    assert.equal(
      saved.filter((item) => item._collectionName === 'store_activity_audit').length,
      2,
      'reintento de la misma operación reutiliza el evento por recurso',
    );

    const unauditedProduct = mutableRecord('productclean004', { store: storeId, expiration_date: '2026-08-20' });
    const unauditedApp = {
      ...app,
      findRecordsByFilter(collection) { return collection === 'products' ? [unauditedProduct] : []; },
    };
    assert.throws(
      () => expiration.cleanupStoreExpirationData(unauditedApp, storeId),
      /expiration_cleanup_audit_context_required/,
    );
    assert.equal(unauditedProduct.expiration_date, '2026-08-20');

    const failingProduct = mutableRecord('productclean003', { store: storeId, expiration_date: '2026-08-20' });
    const failingApp = {
      ...app,
      findRecordsByFilter(collection) { return collection === 'products' ? [failingProduct] : []; },
      save() { throw new Error('forced_cleanup_failure'); },
    };
    assert.throws(
      () => expiration.cleanupStoreExpirationData(failingApp, storeId, auditContext),
      /forced_cleanup_failure/,
    );
  });
});

test('contratos V7E9 conectan hooks, cron, endpoint privado y downgrade atómico', () => {
  const root = path.resolve(__dirname, '..');
  const hooks = readFileSync(path.join(root, 'pb_hooks', 'pz_product_expiration.pb.js'), 'utf8');
  const management = readFileSync(path.join(root, 'pb_hooks', 'pz_store_plan_management_lib.js'), 'utf8');
  const expirationLib = readFileSync(path.join(root, 'pb_hooks', 'pz_product_expiration_lib.js'), 'utf8');
  const migration = readFileSync(path.join(root, 'pb_migrations', '1784304000_v7e9_product_expiration_cycles.js'), 'utf8');
  const zeroDayMigration = readFileSync(path.join(root, 'pb_migrations', '1784596000_v7e9_c3_zero_day_threshold.js'), 'utf8');
  assert.match(hooks, /\/api\/pz\/admin\/product-expirations/);
  assert.match(hooks, /onRecordCreateRequest\([\s\S]*order_items/);
  assert.match(hooks, /cronAdd\([\s\S]*8 \* \* \* \*/);
  assert.doesNotMatch(hooks, /^function\s+/m);
  assert.match(hooks, /raiseExpirationRequestError/);
  assert.match(management, /runInTransaction/);
  assert.match(management, /confirmExpirationCleanup !== true/);
  assert.match(
    management,
    /const audit = createAudit[\s\S]*cleanupStoreExpirationData\(txApp, store\.id, \{[\s\S]*actor,[\s\S]*planAuditId: audit\.id[\s\S]*createPlanActivity/,
  );
  assert.match(migration, /UNIQUE INDEX[\s\S]*cycle_key/i);
  assert.match(zeroDayMigration, /field\.required = false/);
  assert.match(zeroDayMigration, /field\.required = true/);
  assert.doesNotMatch(hooks, /(?:threshold|expiration)[^\n]{0,40}\b7\b/i);
  assert.match(expirationLib, /teamPermissions\.hasStorePermission\([\s\S]*?"catalog\.expirations\.manage"/);
  assert.doesNotMatch(expirationLib, /\["store_admin",\s*"store_staff"\]/);
  assert.match(expirationLib, /e\.record\.set\("expiration_date", normalized \|\| ""\)/);
  assert.match(expirationLib, /commerce\.buildProductUnits/);
  assert.match(expirationLib, /product_variations_disabled/);
  assert.match(expirationLib, /product_unit_reactivated/);
});
