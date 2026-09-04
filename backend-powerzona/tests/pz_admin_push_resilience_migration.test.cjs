'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(
  __dirname,
  '../pb_migrations/1788448300_admin_push_resilience.js',
);
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeField {
  constructor(values) {
    Object.assign(this, values);
  }
}

class FakeFields {
  constructor(values = []) {
    this.values = values.map((value) => value instanceof FakeField ? value : new FakeField(value));
  }
  getByName(name) {
    const field = this.values.find((candidate) => candidate.name === name);
    if (!field) throw new Error('field_not_found');
    return field;
  }
  add(field) {
    this.values.push(field);
  }
  removeById(id) {
    this.values = this.values.filter((field) => field.id !== id);
  }
}

class FakeCollection {
  constructor(values) {
    Object.assign(this, values);
    this.fields = values.fields instanceof FakeFields ? values.fields : new FakeFields(values.fields || []);
    this.indexes = Array.from(values.indexes || []);
  }
  getIndex(name) {
    const index = this.indexes.find((candidate) =>
      candidate.name === name || String(candidate).includes(name));
    if (!index) throw new Error('index_not_found');
    return index;
  }
  addIndex(name, unique, columns, where) {
    this.indexes.push({ name, unique, columns, where });
  }
  removeIndex(name) {
    this.indexes = this.indexes.filter((candidate) =>
      candidate.name !== name && !String(candidate).includes(name));
  }
}

class FakeRecord {
  constructor(id, values = {}) {
    this.id = id;
    this.values = { ...values };
  }
  get(key) {
    return key === 'id' ? this.id : this.values[key];
  }
  getString(key) {
    return String(this.get(key) ?? '');
  }
  set(key, value) {
    this.values[key] = value;
  }
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Field: FakeField,
    Error,
    migrate(forward, rollback) {
      up = forward;
      down = rollback;
    },
  }, { filename: migrationPath });
  return { up, down };
}

function collection(id, name, fields = [], indexes = []) {
  return new FakeCollection({ id, name, fields, indexes });
}

function createApp() {
  const collections = new Map([
    ['stores', collection('pbc_stores', 'stores')],
    ['users', collection('pbc_users', 'users')],
    ['store_user_devices', collection('pbc_admin_devices', 'store_user_devices')],
    ['store_notifications', collection('pbc_notifications', 'store_notifications')],
    ['store_push_devices', collection('pbc_push_devices', 'store_push_devices', [
      { id: 'installation_id_field', name: 'installation_id', required: true, min: 1 },
      { id: 'installation_digest_field', name: 'installation_digest', required: true, min: 1 },
    ], [{
      name: 'idx_store_push_devices_installation',
      unique: true,
      columns: 'installation_digest',
      where: '',
    }])],
  ]);
  const records = new Map([
    ['store_push_devices', [new FakeRecord('device000000001', {
      installation_id: 'abcdefghijklmnop',
      installation_digest: 'a'.repeat(64),
      notifications_enabled: false,
    })]],
  ]);
  return {
    collections,
    records,
    findCollectionByNameOrId(value) {
      if (collections.has(value)) return collections.get(value);
      for (const item of collections.values()) if (item.id === value) return item;
      throw new Error('collection_not_found');
    },
    findRecordsByFilter(name, filter, _sort, limit, offset = 0) {
      let values = Array.from(records.get(name) || []);
      const expression = String(filter || '');
      if (name === 'store_push_devices' && expression.includes('installation_uuid_digest')) {
        values = values.filter((record) =>
          record.getString('installation_uuid_digest')
            || record.getString('credential_digest')
            || !record.getString('installation_id'));
      }
      return values.slice(offset, offset + limit);
    },
    save(value) {
      if (value instanceof FakeCollection) {
        collections.set(value.name, value);
        if (!records.has(value.name)) records.set(value.name, []);
      }
      return value;
    },
    delete(value) {
      collections.delete(value.name);
      records.delete(value.name);
    },
  };
}

test('la migración conserva FID legado y agrega identidad y recibos privados', () => {
  const { up, down } = loadMigration();
  const app = createApp();
  up(app);

  const devices = app.collections.get('store_push_devices');
  assert.equal(devices.fields.getByName('installation_id').required, false);
  assert.equal(devices.fields.getByName('installation_digest').required, false);
  assert.equal(devices.fields.getByName('installation_uuid_digest').hidden, true);
  assert.equal(devices.fields.getByName('credential_digest').hidden, true);
  assert.equal(devices.getIndex('idx_store_push_devices_installation').where, "installation_digest != ''");
  assert.equal(devices.getIndex('idx_store_push_devices_native_uuid').unique, true);
  assert.equal(app.records.get('store_push_devices')[0].get('notifications_enabled'), true);

  const receipts = app.collections.get('admin_push_delivery_receipts');
  assert.ok(receipts);
  assert.equal(receipts.listRule, null);
  assert.equal(receipts.createRule, null);
  assert.equal(receipts.fields.getByName('device').hidden, true);
  assert.equal(receipts.fields.getByName('notification').cascadeDelete, true);

  down(app);
  assert.equal(app.collections.has('admin_push_delivery_receipts'), false);
  assert.equal(devices.fields.getByName('installation_id').required, true);
  assert.equal(devices.getIndex('idx_store_push_devices_installation').where, '');
  assert.throws(() => devices.fields.getByName('credential_digest'), /field_not_found/);
});

test('rollback falla cerrado después de crear identidad local o recibos', () => {
  for (const mutate of [
    (app) => app.records.get('store_push_devices')[0]
      .set('installation_uuid_digest', 'b'.repeat(64)),
    (app) => app.records.get('admin_push_delivery_receipts')
      .push(new FakeRecord('receipt00000001')),
  ]) {
    const { up, down } = loadMigration();
    const app = createApp();
    up(app);
    mutate(app);
    assert.throws(() => down(app), /unsafe_rollback_admin_push_resilience/);
  }
});
