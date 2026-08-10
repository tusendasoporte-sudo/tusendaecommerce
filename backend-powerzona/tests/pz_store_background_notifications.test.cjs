const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const notifications = require('../pb_hooks/pz_store_background_notifications_lib.js');

function mutableRecord(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] ?? ''); },
    set(key, value) { this[key] = value; },
  };
}

function fakeApp(seed = {}) {
  const tables = {
    stores: [], settings: [], products: [], product_variations: [], orders: [], reviews: [],
    raffles: [], raffle_entries: [], store_notifications: [],
    ...Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, [...value]])),
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
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const found = (tables[collection] || []).find((item) => (
        (!params.store || item.store === params.store)
        && (!params.type || item.type === params.type)
        && (!params.collection || item.entity_collection === params.collection)
        && (!params.entity || item.entity_id === params.entity)
      ));
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit = 200, offset = 0, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.store) rows = rows.filter((item) => item.store === params.store || item.product_store === params.store);
      if (params.product) rows = rows.filter((item) => item.product === params.product);
      if (params.order) rows = rows.filter((item) => item.order === params.order);
      if (params.raffle) rows = rows.filter((item) => item.raffle === params.raffle);
      if (params.type) rows = rows.filter((item) => item.type === params.type);
      if (params.collection) rows = rows.filter((item) => item.entity_collection === params.collection);
      if (params.entity) rows = rows.filter((item) => item.entity_id === params.entity);
      return rows.slice(offset, offset + limit);
    },
    save(item) {
      const collection = item._collectionName;
      if (!collection) return item;
      if (!item.id) item.id = `background${String(++sequence).padStart(5, '0')}`;
      if (!item.created) item.created = new Date(Date.UTC(2026, 7, 10, 12, sequence)).toISOString();
      item.updated = item.created;
      if (!tables[collection].includes(item)) tables[collection].push(item);
      return item;
    },
    logger() { return { error() {} }; },
  };
}

function withFakeRecord(callback) {
  const previous = global.Record;
  global.Record = class FakePocketBaseRecord {
    constructor(collection) { this.id = ''; this._collectionName = collection.name; }
    get(key) { return this[key]; }
    getString(key) { return String(this[key] ?? ''); }
    set(key, value) { this[key] = value; }
  };
  try { return callback(); } finally { global.Record = previous; }
}

function baseSeed() {
  const store = mutableRecord('storebackground1', { slug: 'tienda-demo', status: 'active' });
  const settings = mutableRecord('settingsback001', {
    store: store.id,
    notifications_enabled: true,
    notify_low_stock: true,
    notify_out_of_stock: true,
    low_stock_threshold: 3,
    notify_pending_order: true,
    pending_order_hours: 2,
    notify_review_pending: true,
  });
  return { store, settings };
}

test('clasifica stock bajo y agotado para productos y variaciones', () => {
  const { settings } = baseSeed();
  const low = mutableRecord('productlow0001', { name: 'Proteína', stock: 2, track_stock: true, active: true });
  const out = mutableRecord('productout0001', { name: 'Creatina', stock: 0, track_stock: true, active: true });
  assert.equal(notifications.productInventoryAlert(low, settings).type, 'low_stock');
  assert.equal(notifications.productInventoryAlert(out, settings).type, 'out_of_stock');

  const parent = mutableRecord('productparent01', { name: 'Vitaminas', has_variations: true, track_stock: true, active: true });
  const variation = mutableRecord('variationlow001', { product: parent.id, variation_type: 'Tamaño', value: 'Grande', stock: 1, active: true });
  assert.equal(notifications.productInventoryAlert(parent, settings), null);
  assert.equal(notifications.variationInventoryAlert(variation, parent, settings).type, 'low_stock');
});

test('crea el push de inventario en backend y no duplica mientras siga sin leer', () => withFakeRecord(() => {
  const { store, settings } = baseSeed();
  const product = mutableRecord('productstock001', {
    store: store.id, name: 'Glucosamina', stock: 2, track_stock: true, active: true,
    updated: '2026-08-10T10:00:00.000Z',
  });
  const app = fakeApp({ stores: [store], settings: [settings], products: [product] });
  assert.ok(notifications.processProductInventory(app, product, new Date('2026-08-10T10:00:01Z')));
  assert.equal(app.tables.store_notifications.length, 1);
  assert.equal(app.tables.store_notifications[0].type, 'low_stock');
  assert.equal(notifications.processProductInventory(app, product, new Date('2026-08-10T10:01:00Z')), null);
  assert.equal(app.tables.store_notifications.length, 1);
}));

test('un pedido pendiente genera recordatorio aunque ya tenga el aviso de pedido nuevo', () => withFakeRecord(() => {
  const { store, settings } = baseSeed();
  const order = mutableRecord('orderpending001', {
    store: store.id, status: 'pending', order_number: '104', subtotal: 75,
    created: '2026-08-10T07:00:00.000Z',
  });
  const newOrder = mutableRecord('notificationnew1', {
    store: store.id, type: 'new_order', entity_collection: 'orders', entity_id: order.id,
    status: 'unread', created: '2026-08-10T07:00:01.000Z',
  });
  const app = fakeApp({ stores: [store], settings: [settings], orders: [order], store_notifications: [newOrder] });
  assert.equal(notifications.processStorePendingOrders(app, store.id, new Date('2026-08-10T12:00:00Z')), 1);
  assert.equal(app.tables.store_notifications.filter((item) => item.type === 'pending_order').length, 1);
  assert.equal(notifications.processStorePendingOrders(app, store.id, new Date('2026-08-10T12:05:00Z')), 0);
}));

test('una reseña se convierte en notificación desde el hook del servidor', () => withFakeRecord(() => {
  const { store, settings } = baseSeed();
  const review = mutableRecord('reviewpending01', {
    store: store.id, status: 'pending', type: 'store', source: 'public_store',
    customer_name: 'Ana', rating: 5, created: '2026-08-10T11:00:00.000Z',
  });
  const app = fakeApp({ stores: [store], settings: [settings], reviews: [review] });
  const created = notifications.processPendingReview(app, review, new Date('2026-08-10T11:00:01Z'));
  assert.ok(created);
  assert.equal(created.type, 'review_pending');
  assert.equal(created.entity_collection, 'reviews');
  assert.equal(app.tables.store_notifications.length, 1);
}));

test('agrupa las reseñas de un mismo pedido en un solo aviso no leído', () => withFakeRecord(() => {
  const { store, settings } = baseSeed();
  const order = mutableRecord('orderreview0001', { store: store.id, order_number: '205' });
  const first = mutableRecord('revieworder001', {
    store: store.id, order: order.id, status: 'pending', source: 'order_review_link', customer_name: 'Luis', rating: 5,
  });
  const second = mutableRecord('revieworder002', {
    store: store.id, order: order.id, status: 'pending', source: 'order_review_link', customer_name: 'Luis', rating: 4,
  });
  const app = fakeApp({ stores: [store], settings: [settings], orders: [order], reviews: [first] });
  notifications.processPendingReview(app, first, new Date('2026-08-10T11:00:00Z'));
  app.tables.reviews.push(second);
  notifications.processPendingReview(app, second, new Date('2026-08-10T11:01:00Z'));
  assert.equal(app.tables.store_notifications.length, 1);
  assert.match(app.tables.store_notifications[0].message, /2 reseñas/);
}));

test('una rifa vencida avisa una sola vez por fecha de sorteo', () => withFakeRecord(() => {
  const { store, settings } = baseSeed();
  const raffle = mutableRecord('raffledue00001', {
    store: store.id, title: 'Rifa de agosto', slot_number: 1, is_configured: true,
    status: 'result_pending', draw_at: '2026-08-10T10:00:00.000Z',
  });
  const entry = mutableRecord('raffleentry001', { store: store.id, raffle: raffle.id, status: 'active' });
  const app = fakeApp({ stores: [store], settings: [settings], raffles: [raffle], raffle_entries: [entry] });
  assert.ok(notifications.processDueRaffle(app, raffle, new Date('2026-08-10T12:00:00Z')));
  assert.equal(app.tables.store_notifications[0].metadata_json.subtype, 'raffle_result_due');
  assert.equal(notifications.processDueRaffle(app, raffle, new Date('2026-08-10T12:05:00Z')), null);
  assert.equal(app.tables.store_notifications.length, 1);
}));

test('el hook registra eventos de servidor y cron cada cinco minutos', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_background_notifications.pb.js'), 'utf8');
  assert.match(source, /"products"/);
  assert.match(source, /"product_variations"/);
  assert.match(source, /"reviews"/);
  assert.match(source, /"raffles"/);
  assert.match(source, /"\*\/5 \* \* \* \*"/);
  assert.match(source, /processAllTimedNotifications/);
});
