'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(
  __dirname,
  '../pb_migrations/1788448000_storefront_delivery_transport_observability.js',
);
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeField { constructor(values) { Object.assign(this, values); } }

class FakeFields extends Array {
  getByName(name) {
    const value = this.find((field) => field.name === name);
    if (!value) throw new Error('field_not_found');
    return value;
  }
  add(field) { this.push(field); }
  removeById(id) {
    const index = this.findIndex((field) => field.id === id);
    if (index >= 0) this.splice(index, 1);
  }
}

class FakeCollection {
  constructor() {
    this.name = 'push_campaign_deliveries';
    this.fields = new FakeFields(
      { id: 'native_delivered_at', name: 'native_delivered_at', type: 'date' },
      { id: 'fcm_received_at', name: 'fcm_received_at', type: 'date' },
    );
    this.indexes = [];
  }
  getIndex(name) {
    const value = this.indexes.find((index) => index.name === name);
    if (!value) throw new Error('index_not_found');
    return value;
  }
  addIndex(name, unique, columns, where) { this.indexes.push({ name, unique, columns, where }); }
  removeIndex(name) { this.indexes = this.indexes.filter((index) => index.name !== name); }
}

class FakeRecord {
  constructor(id, values = {}) { this.id = id; this.values = { ...values }; }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  set(key, value) { this.values[key] = value; }
  getString(key) { return String(this.get(key) ?? ''); }
}

function loadMigration() {
  let up; let down;
  vm.runInNewContext(source, {
    Date,
    Error,
    Field: FakeField,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function fixture(withRecords = true) {
  const collection = new FakeCollection();
  const rows = withRecords ? [
    new FakeRecord('deliveryfcm0001', {
      fcm_received_at: '2026-09-03T13:05:31.603Z',
      native_delivered_at: '2026-09-03T13:05:31.610Z',
    }),
    new FakeRecord('deliverynative1', {
      native_delivered_at: '2026-09-03T13:06:00.000Z',
    }),
    new FakeRecord('deliveryempty01'),
  ] : [];
  return {
    collection,
    rows,
    findCollectionByNameOrId(name) {
      if (name !== collection.name) throw new Error('collection_not_found');
      return collection;
    },
    findRecordsByFilter(_name, filter, _sort, limit, offset = 0) {
      let result = rows;
      if (String(filter).includes('delivery_trigger')) {
        result = rows.filter((row) => row.getString('delivery_trigger') || row.getString('displayed_at'));
      }
      return result.slice(offset, offset + limit);
    },
    save() {},
  };
}

test('añade el canal efectivo y migra las confirmaciones anteriores', () => {
  const app = fixture();
  const { up, down } = loadMigration();
  up(app);

  const trigger = app.collection.fields.getByName('delivery_trigger');
  assert.equal(trigger.type, 'select');
  assert.deepEqual(Array.from(trigger.values), [
    'fcm', 'websocket_sync', 'foreground_poll', 'resume_sync', 'workmanager',
    'native_sync_legacy',
  ]);
  assert.equal(app.collection.fields.getByName('displayed_at').type, 'date');
  assert.deepEqual(app.collection.getIndex('idx_push_deliveries_store_created'), {
    name: 'idx_push_deliveries_store_created',
    unique: false,
    columns: 'store, created',
    where: '',
  });
  assert.equal(app.rows[0].getString('displayed_at'), '2026-09-03T13:05:31.610Z');
  assert.equal(app.rows[0].getString('delivery_trigger'), 'fcm');
  assert.equal(app.rows[1].getString('delivery_trigger'), 'native_sync_legacy');
  assert.equal(app.rows[2].getString('delivery_trigger'), '');
  assert.throws(() => down(app), /unsafe_rollback_storefront_delivery_transport_observability/);
});

test('permite rollback únicamente antes de almacenar la nueva trazabilidad', () => {
  const app = fixture(false);
  const { up, down } = loadMigration();
  up(app);
  down(app);
  assert.throws(() => app.collection.fields.getByName('delivery_trigger'), /field_not_found/);
  assert.throws(() => app.collection.fields.getByName('displayed_at'), /field_not_found/);
  assert.throws(() => app.collection.getIndex('idx_push_deliveries_store_created'), /index_not_found/);
});
