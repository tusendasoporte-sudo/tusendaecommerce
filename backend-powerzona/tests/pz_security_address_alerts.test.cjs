'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const STORE_ID = 'store0000000001';
const OTHER_STORE_ID = 'store0000000002';
const CUSTOMER_ID = 'cust00000000001';
const OTHER_CUSTOMER_ID = 'cust00000000002';
const ZONE_ID = 'zone00000000001';
const BLOCK_ID = 'block0000000001';
const SETTINGS_ID = 'setts0000000001';
const SECRET = 'a'.repeat(48);

const previousGlobals = {
  __hooks: global.__hooks,
  $app: global.$app,
  $os: global.$os,
  $security: global.$security,
  Record: global.Record,
};

global.__hooks = path.resolve(__dirname, '../pb_hooks').replace(/\\/g, '/');
global.$os = { getenv: (name) => name === 'PZ_SECURITY_HMAC_SECRET' ? SECRET : '' };
global.$security = {
  hs256: (value, secret) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex'),
  sha256: (value) => crypto.createHash('sha256').update(String(value)).digest('hex'),
};

class MockRecord {
  constructor(collection, values = {}) {
    this._collection = collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  getBool(key) { return this.get(key) === true; }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
  collection() { return this._collection; }
}
global.Record = MockRecord;

const monitoring = require('../pb_hooks/pz_security_monitoring_lib.js');

function record(collection, values) {
  return new MockRecord({ name: collection, fields: { getByName: () => ({}) } }, values);
}

function fixture() {
  const store = record('stores', { id: STORE_ID, slug: 'powerzona' });
  const otherStore = record('stores', { id: OTHER_STORE_ID, slug: 'otra' });
  const customer = record('store_customers', { id: CUSTOMER_ID, store: STORE_ID, merged_into: '' });
  const otherCustomer = record('store_customers', { id: OTHER_CUSTOMER_ID, store: STORE_ID, merged_into: '' });
  const zone = record('shipping_zones', { id: ZONE_ID, store: STORE_ID, municipality: 'Plaza de la Revolución', zone: 'Vedado' });
  const settings = record('store_security_settings', { id: SETTINGS_ID, store: STORE_ID, mode: 'protection' });
  const tables = {
    stores: [store, otherStore],
    store_customers: [customer, otherCustomer],
    shipping_zones: [zone],
    store_security_settings: [settings],
    orders: [],
    store_security_blocks: [],
    store_security_block_addresses: [],
    store_security_events: [],
    store_notifications: [],
  };
  const collections = {};
  let sequence = 0;
  const collection = (name) => {
    collections[name] = collections[name] || { name, fields: { getByName: () => ({}) } };
    return collections[name];
  };
  const app = {
    findCollectionByNameOrId(name) {
      if (!Object.prototype.hasOwnProperty.call(tables, name)) throw new Error(`collection_not_found:${name}`);
      return collection(name);
    },
    findRecordById(name, id) {
      const found = (tables[name] || []).find((item) => item.id === id);
      if (!found) throw new Error(`not_found:${name}:${id}`);
      return found;
    },
    findFirstRecordByFilter(name, _filter, params = {}) {
      let rows = (tables[name] || []).slice();
      if (params.eventKey) rows = rows.filter((item) => item.get('event_key') === params.eventKey);
      if (params.store) rows = rows.filter((item) => item.get('store') === params.store);
      if (params.order) rows = rows.filter((item) => item.get('entity_id') === params.order);
      const found = rows[0];
      if (!found) throw new Error(`not_found:${name}`);
      return found;
    },
    findRecordsByFilter(name, _filter, _sort, limit = 200, offset = 0, params = {}) {
      let rows = (tables[name] || []).slice();
      if (params.store) rows = rows.filter((item) => item.get('store') === params.store);
      if (params.parent) rows = rows.filter((item) => item.get('merged_into') === params.parent);
      if (params.addressHmac) rows = rows.filter((item) => item.get('address_hmac') === params.addressHmac);
      const customerIds = Object.keys(params).filter((key) => /^customer\d+$/.test(key)).map((key) => params[key]);
      if (customerIds.length) rows = rows.filter((item) => customerIds.includes(item.get('customer')));
      rows.sort((left, right) => String(right.get('created') || '').localeCompare(String(left.get('created') || '')));
      return rows.slice(offset, offset + limit);
    },
    save(saved) {
      const name = saved.collection().name;
      tables[name] = tables[name] || [];
      if (!saved.id) saved.id = `addr${String(++sequence).padStart(11, '0')}`;
      if (!tables[name].includes(saved)) tables[name].push(saved);
      return saved;
    },
    logger() { return { warn() {}, error() {} }; },
  };
  return { app, store, customer, otherCustomer, zone, settings, tables };
}

function order(values) {
  return record('orders', {
    store: STORE_ID,
    customer: CUSTOMER_ID,
    delivery_method: 'delivery',
    shipping_zone: ZONE_ID,
    status: 'pending',
    ...values,
  });
}

function loadMigrationFixture() {
  class MockField { constructor(options) { Object.assign(this, options); } }
  class MockFields {
    constructor(fields = []) { this.items = fields.map((field) => new MockField(field)); }
    getByName(name) {
      const found = this.items.find((field) => field.name === name);
      if (!found) throw new Error(`field_not_found:${name}`);
      return found;
    }
  }
  class MockCollection {
    constructor(options) {
      Object.assign(this, options);
      this.fields = new MockFields(options.fields || []);
    }
  }
  const collections = new Map([
    ['stores', new MockCollection({ id: 'stores_collection', name: 'stores', fields: [] })],
    ['store_customers', new MockCollection({ id: 'customers_collection', name: 'store_customers', fields: [] })],
    ['orders', new MockCollection({ id: 'orders_collection', name: 'orders', fields: [] })],
    ['store_security_blocks', new MockCollection({ id: 'blocks_collection', name: 'store_security_blocks', fields: [] })],
    ['store_security_events', new MockCollection({ id: 'events_collection', name: 'store_security_events', fields: [{ name: 'event_type', values: ['blocked_attempt'] }] })],
    ['store_notifications', new MockCollection({ id: 'notifications_collection', name: 'store_notifications', fields: [{ name: 'type', values: ['new_order'] }] })],
  ]);
  const app = {
    findCollectionByNameOrId(name) {
      const found = collections.get(name);
      if (!found) throw new Error(`collection_not_found:${name}`);
      return found;
    },
    findRecordsByFilter() { return []; },
    save(value) {
      if (value instanceof MockCollection) collections.set(value.name, value);
      return value;
    },
    delete(value) { collections.delete(value.name); },
  };
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1786237200_security_block_address_alerts.js');
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up;
  let down;
  vm.runInNewContext(source, {
    migrate(upFn, downFn) { up = upFn; down = downFn; },
    Collection: MockCollection,
  }, { filename: migrationPath });
  return { app, collections, up, down };
}

test.after(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

test('ADDRESS-ALERT: normaliza acentos, puntuacion y variantes de numero sin conservar texto', () => {
  const first = monitoring._test.deliveryAddressFingerprint('Plaza de la Revolución', 'Calle 5, No. 10');
  const second = monitoring._test.deliveryAddressFingerprint('PLAZA DE LA REVOLUCION', 'calle 5 #10');
  assert.equal(first, second);
  assert.equal(first, 'plaza de la revolucion|calle 5 numero 10');
  assert.equal(monitoring._test.deliveryAddressFingerprint('X', '123'), '');
});

test('ADDRESS-ALERT: ofrece direcciones unicas de la misma tienda y preselecciona la mas reciente', () => {
  const data = fixture();
  data.tables.orders.push(
    order({ id: 'order0000000001', customer_address: 'Calle 5, No. 10', created: '2026-08-07T13:00:00.000Z' }),
    order({ id: 'order0000000002', customer_address: 'calle 5 #10', created: '2026-08-07T12:00:00.000Z' }),
    order({ id: 'order0000000003', customer_address: 'Avenida 23 numero 15', created: '2026-08-07T11:00:00.000Z' }),
    order({ id: 'order0000000004', store: OTHER_STORE_ID, customer_address: 'Calle ajena 4', created: '2026-08-07T14:00:00.000Z' }),
    order({ id: 'order0000000005', delivery_method: 'pickup', customer_address: 'No aplica', created: '2026-08-07T15:00:00.000Z' }),
  );
  const candidates = monitoring._test.buildCustomerAddressCandidates(data.app, STORE_ID, CUSTOMER_ID);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].order_id, 'order0000000001');
  assert.equal(candidates[0].uses_count, 2);
  assert.equal(candidates[0].preselected, true);
  assert.equal(candidates[1].preselected, false);
});

test('ADDRESS-ALERT: guarda solo HMAC seleccionado y rechaza un pedido fuera de la ficha', () => {
  const data = fixture();
  const source = order({ id: 'order0000000001', customer_address: 'Calle 5 No. 10', created: '2026-08-07T13:00:00.000Z' });
  const unrelated = order({ id: 'order0000000002', customer: OTHER_CUSTOMER_ID, customer_address: 'Calle ajena 9', created: '2026-08-07T12:00:00.000Z' });
  data.tables.orders.push(source, unrelated);
  const selected = monitoring._test.selectedAddressSignals(data.app, STORE_ID, CUSTOMER_ID, [source.id], SECRET);
  assert.equal(selected.error, undefined);
  assert.equal(selected.values.length, 1);
  assert.match(selected.values[0].addressHmac, /^[a-f0-9]{64}$/);
  const invalid = monitoring._test.selectedAddressSignals(data.app, STORE_ID, CUSTOMER_ID, [unrelated.id], SECRET);
  assert.equal(invalid.error, 'address_order_ids');
  const empty = monitoring._test.selectedAddressSignals(data.app, STORE_ID, CUSTOMER_ID, [], SECRET);
  assert.equal(empty.error, 'address_order_ids');

  const block = record('store_security_blocks', {
    id: BLOCK_ID,
    store: STORE_ID,
    customer: CUSTOMER_ID,
    status: 'active',
    expires_at: '2099-12-31T23:59:59.000Z',
  });
  data.tables.store_security_blocks.push(block);
  monitoring._test.createBlockAddressSignals(data.app, STORE_ID, block, CUSTOMER_ID, selected.values);
  assert.equal(data.tables.store_security_block_addresses.length, 1);
  assert.doesNotMatch(JSON.stringify(data.tables.store_security_block_addresses[0].values), /calle|plaza|revoluci/i);
});

test('ADDRESS-ALERT: pedido coincidente crea una sola alerta idempotente sin bloquear ni exponer direccion', () => {
  const data = fixture();
  const source = order({ id: 'order0000000001', customer_address: 'Calle 5 No. 10', created: '2026-08-07T13:00:00.000Z' });
  data.tables.orders.push(source);
  const block = record('store_security_blocks', {
    id: BLOCK_ID,
    store: STORE_ID,
    customer: CUSTOMER_ID,
    status: 'active',
    expires_at: '2099-12-31T23:59:59.000Z',
  });
  data.tables.store_security_blocks.push(block);
  const selected = monitoring._test.selectedAddressSignals(data.app, STORE_ID, CUSTOMER_ID, [source.id], SECRET);
  monitoring._test.createBlockAddressSignals(data.app, STORE_ID, block, CUSTOMER_ID, selected.values);

  const nextOrder = order({
    id: 'order0000000002',
    customer: OTHER_CUSTOMER_ID,
    order_number: 'PZ-200',
    customer_address: 'calle 5 #10',
    created: '2026-08-07T14:00:00.000Z',
  });
  data.tables.orders.push(nextOrder);
  const first = monitoring.recordBlockedAddressMatchForOrder(data.app, nextOrder, data.otherCustomer, data.settings, SECRET);
  const second = monitoring.recordBlockedAddressMatchForOrder(data.app, nextOrder, data.otherCustomer, data.settings, SECRET);

  assert.equal(first.matched, true);
  assert.equal(second.matched, true);
  assert.equal(data.tables.store_security_events.length, 1);
  assert.equal(data.tables.store_notifications.length, 1);
  const event = data.tables.store_security_events[0];
  const notification = data.tables.store_notifications[0];
  assert.equal(event.get('event_type'), 'blocked_address_match');
  assert.equal(event.get('decision'), 'monitored');
  assert.equal(notification.get('type'), 'security_address_match');
  assert.equal(notification.get('entity_id'), nextOrder.id);
  assert.match(notification.get('target_url'), /\/admin\/orders\/order0000000002$/);
  const protectedWrites = JSON.stringify({ event: event.values, notification: notification.values, address: data.tables.store_security_block_addresses[0].values });
  assert.doesNotMatch(protectedWrites, /calle|plaza|revoluci/i);
  assert.equal(nextOrder.get('status'), 'pending');
});

test('ADDRESS-ALERT: bloqueo revocado o tienda distinta no generan alerta', () => {
  const data = fixture();
  const source = order({ id: 'order0000000001', customer_address: 'Calle 5 No. 10', created: '2026-08-07T13:00:00.000Z' });
  data.tables.orders.push(source);
  const block = record('store_security_blocks', { id: BLOCK_ID, store: STORE_ID, customer: CUSTOMER_ID, status: 'revoked' });
  data.tables.store_security_blocks.push(block);
  const selected = monitoring._test.selectedAddressSignals(data.app, STORE_ID, CUSTOMER_ID, [source.id], SECRET);
  monitoring._test.createBlockAddressSignals(data.app, STORE_ID, block, CUSTOMER_ID, selected.values);
  const nextOrder = order({ id: 'order0000000002', customer: OTHER_CUSTOMER_ID, customer_address: 'Calle 5 #10', created: '2026-08-07T14:00:00.000Z' });
  data.tables.orders.push(nextOrder);
  const result = monitoring.recordBlockedAddressMatchForOrder(data.app, nextOrder, data.otherCustomer, data.settings, SECRET);
  assert.equal(result.matched, false);
  assert.equal(data.tables.store_security_events.length, 0);
  assert.equal(data.tables.store_notifications.length, 0);
});

test('ADDRESS-ALERT: migracion es privada, aditiva, idempotente y reversible', () => {
  const migration = loadMigrationFixture();
  migration.up(migration.app);
  migration.up(migration.app);
  const collection = migration.collections.get('store_security_block_addresses');
  assert.ok(collection);
  assert.equal(collection.listRule, null);
  assert.equal(collection.viewRule, null);
  assert.equal(collection.createRule, null);
  assert.equal(collection.updateRule, null);
  assert.equal(collection.deleteRule, null);
  assert.equal(collection.fields.getByName('address_hmac').hidden, true);
  assert.ok(collection.indexes.some((index) => index.includes('UNIQUE INDEX')));
  const eventValues = migration.collections.get('store_security_events').fields.getByName('event_type').values;
  const notificationValues = migration.collections.get('store_notifications').fields.getByName('type').values;
  assert.equal(eventValues.filter((value) => value === 'blocked_address_match').length, 1);
  assert.equal(notificationValues.filter((value) => value === 'security_address_match').length, 1);

  migration.down(migration.app);
  assert.equal(migration.collections.has('store_security_block_addresses'), false);
  assert.equal(migration.collections.get('store_security_events').fields.getByName('event_type').values.includes('blocked_address_match'), false);
  assert.equal(migration.collections.get('store_notifications').fields.getByName('type').values.includes('security_address_match'), false);
});
