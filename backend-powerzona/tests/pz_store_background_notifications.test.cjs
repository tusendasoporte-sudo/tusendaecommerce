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

test('el ciclo del plan crea avisos no duplicados para vencimiento, gracia y expiración', () => withFakeRecord(() => {
  const store = mutableRecord('storeplanlife01', {
    slug: 'tienda-plan', status: 'active', plan: 'basic',
    plan_started_at: '2026-08-01T12:00:00.000Z',
    plan_expires_at: '2026-09-10T12:00:00.000Z',
    plan_is_permanent: false, free_trial_used: true,
  });
  const app = fakeApp({ stores: [store] });

  assert.ok(notifications.processStorePlanLifecycle(app, store, new Date('2026-09-03T12:00:00.000Z')));
  assert.equal(app.tables.store_notifications[0].type, 'plan_expiring_soon');
  assert.equal(notifications.processStorePlanLifecycle(app, store, new Date('2026-09-03T12:05:00.000Z')), null);

  assert.ok(notifications.processStorePlanLifecycle(app, store, new Date('2026-09-10T12:00:00.000Z')));
  assert.equal(app.tables.store_notifications[1].type, 'plan_grace_period');
  assert.match(app.tables.store_notifications[1].message, /datos permanecen conservados/);

  assert.ok(notifications.processStorePlanLifecycle(app, store, new Date('2026-09-13T12:00:00.000Z')));
  assert.equal(app.tables.store_notifications[2].type, 'plan_expired');
  assert.equal(app.tables.store_notifications[2].metadata_json.data_preserved, true);
}));

test('la prueba Free vence sin gracia y llama a contratar un plan pagado', () => withFakeRecord(() => {
  const store = mutableRecord('storeplanfree01', {
    slug: 'tienda-free', status: 'active', plan: 'free',
    plan_started_at: '2026-08-01T12:00:00.000Z',
    plan_expires_at: '2026-08-31T12:00:00.000Z',
    plan_is_permanent: false, free_trial_used: true,
  });
  const app = fakeApp({ stores: [store] });
  const notice = notifications.processStorePlanLifecycle(app, store, new Date('2026-09-01T12:00:00.000Z'));
  assert.equal(notice.type, 'plan_expired');
  assert.match(notice.message, /Contrata un plan Básico o Premium/);
}));

test('un cambio de plan no reutiliza el ciclo aunque conserve la misma fecha de vencimiento', () => {
  const store = { id: 'storeplancycle01' };
  const shared = {
    plan_started_at: '2026-08-01T12:00:00.000Z',
    plan_expires_at: '2026-09-01T12:00:00.000Z',
  };
  const freeCycle = notifications.storePlanCycleId(store, { ...shared, plan: 'free' });
  const basicCycle = notifications.storePlanCycleId(store, {
    ...shared,
    plan: 'basic',
    plan_started_at: '2026-08-02T12:00:00.000Z',
  });
  assert.notEqual(freeCycle, basicCycle);
});

test('renovar o cambiar de plan archiva avisos anteriores sin borrarlos', () => withFakeRecord(() => {
  const notification = mutableRecord('planwarning0001', {
    store: 'storeplanlife01', type: 'plan_expiring_critical', status: 'unread',
    entity_collection: 'stores', entity_id: 'storeplanlife01_20260910120000000',
  });
  const unrelated = mutableRecord('stockwarning001', {
    store: 'storeplanlife01', type: 'low_stock', status: 'unread',
  });
  const app = fakeApp({ store_notifications: [notification, unrelated] });
  assert.equal(notifications.archiveStorePlanNotifications(app, 'storeplanlife01', new Date('2026-09-03T12:00:00Z')), 1);
  assert.equal(notification.status, 'archived');
  assert.equal(unrelated.status, 'unread');
  assert.equal(app.tables.store_notifications.length, 2);
}));

test('el hook registra eventos de servidor y cron cada cinco minutos', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_background_notifications.pb.js'), 'utf8');
  const implementation = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_background_notifications_lib.js'), 'utf8');
  assert.match(source, /"products"/);
  assert.match(source, /"product_variations"/);
  assert.match(source, /"reviews"/);
  assert.match(source, /"raffles"/);
  assert.match(source, /"\*\/5 \* \* \* \*"/);
  assert.match(source, /processAllTimedNotifications/);
  assert.match(implementation, /plan_lifecycle/);
});

test('la migración agrega los cuatro tipos de aviso sin borrar registros', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_migrations/1788447700_store_plan_lifecycle_notifications.js'), 'utf8');
  for (const type of notifications.STORE_PLAN_NOTIFICATION_TYPES) assert.match(source, new RegExp(type));
  assert.doesNotMatch(source, /app\.delete\(/);
});
