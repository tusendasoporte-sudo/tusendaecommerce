'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(
  __dirname,
  '../pb_migrations/1788440400_storefront_resilient_installations.js',
);
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeField { constructor(values) { Object.assign(this, values); } }

class FakeFields {
  constructor(values = []) { this.values = values.map((value) => new FakeField(value)); }
  getByName(name) {
    const value = this.values.find((field) => field.name === name);
    if (!value) throw new Error('field_not_found');
    return value;
  }
  add(value) { this.values.push(value); }
  removeById(id) { this.values = this.values.filter((field) => field.id !== id); }
}

class FakeCollection {
  constructor(values) {
    Object.assign(this, values);
    this.fields = values.fields instanceof FakeFields ? values.fields : new FakeFields(values.fields || []);
    this.indexes = Array.from(values.indexes || []);
  }
  getIndex(name) {
    const value = this.indexes.find((index) => index.name === name || String(index).includes(`\`${name}\``));
    if (!value) throw new Error('index_not_found');
    return value;
  }
  addIndex(name, unique, columns, where) { this.indexes.push({ name, unique, columns, where }); }
  removeIndex(name) {
    this.indexes = this.indexes.filter((index) => index.name !== name && !String(index).includes(`\`${name}\``));
  }
}

class FakeRecord {
  constructor(collection, id, values = {}) {
    this.collection = collection;
    this.id = id;
    this.values = { ...values };
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) { this.values[key] = value; }
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Field: FakeField,
    Date,
    Error,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function collection(id, name, fields = [], indexes = []) {
  return new FakeCollection({ id, name, fields, indexes });
}

function createApp() {
  const collections = new Map([
    ['stores', collection('pbc_stores', 'stores')],
    ['storefront_app_configs', collection('pbc_configs', 'storefront_app_configs')],
    ['storefront_installations', collection('pbc_installations', 'storefront_installations', [
      { id: 'fid_field', name: 'fid', type: 'text', required: true, min: 1 },
      { id: 'fid_digest_field', name: 'fid_digest', type: 'text', required: true, min: 1 },
    ], [{
      name: 'idx_storefront_installations_app_fid', unique: true,
      columns: 'app_config, fid_digest', where: '',
    }])],
    ['push_campaign_deliveries', collection('pbc_deliveries', 'push_campaign_deliveries')],
  ]);
  const records = new Map([
    ['storefront_installations', [new FakeRecord('storefront_installations', 'install00000001', {
      fid: 'abcdefghijklmnop', fid_digest: 'a'.repeat(64),
      last_seen_at: '2026-08-31T12:00:00.000Z',
    })]],
    ['push_campaign_deliveries', [new FakeRecord('push_campaign_deliveries', 'delivery0000001', {
      status: 'accepted', inbox_read_at: '',
      inbox_expires_at: '2026-09-20T12:00:00.000Z',
    })]],
  ]);
  return {
    collections,
    records,
    findCollectionByNameOrId(value) {
      const direct = collections.get(value);
      if (direct) return direct;
      for (const item of collections.values()) if (item.id === value) return item;
      throw new Error('collection_not_found');
    },
    findRecordsByFilter(name, filter, _sort, limit, offset = 0) {
      let values = Array.from(records.get(name) || []);
      const expression = String(filter || '');
      if (name === 'storefront_installations' && expression.includes('installation_uuid_digest')) {
        values = values.filter((item) => item.getString('installation_uuid_digest') || !item.getString('fid_digest'));
      }
      if (name === 'push_campaign_deliveries' && expression.includes('native_status = "delivered"')) {
        values = values.filter((item) => ['delivered', 'read'].includes(item.getString('native_status'))
          || item.getString('fcm_status') === 'received');
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

test('la migración desacopla FID, preserva filas y no reenvía campañas antiguas', () => {
  const { up, down } = loadMigration();
  const app = createApp();
  up(app);

  const installations = app.collections.get('storefront_installations');
  const fid = installations.fields.getByName('fid');
  const fidDigest = installations.fields.getByName('fid_digest');
  assert.equal(fid.required, false);
  assert.equal(fidDigest.required, false);
  assert.equal(installations.fields.getByName('installation_uuid_digest').hidden, true);
  assert.equal(installations.getIndex('idx_storefront_installations_app_fid').where, "fid_digest != ''");
  assert.equal(installations.getIndex('idx_storefront_installations_app_uuid').unique, true);

  const legacyInstallation = app.records.get('storefront_installations')[0];
  assert.equal(legacyInstallation.getString('identity_source'), 'firebase_fid');
  assert.equal(legacyInstallation.getString('trust_level'), 'firebase_verified');
  assert.equal(legacyInstallation.getString('firebase_status'), 'registered');
  assert.equal(legacyInstallation.getString('last_heartbeat_at'), '2026-08-31T12:00:00.000Z');

  const legacyDelivery = app.records.get('push_campaign_deliveries')[0];
  assert.equal(legacyDelivery.getString('fcm_status'), 'accepted');
  assert.equal(legacyDelivery.getString('native_status'), 'expired');
  assert.equal(legacyDelivery.getString('delivery_expires_at'), '2026-09-20T12:00:00.000Z');

  const diagnostics = app.collections.get('storefront_installation_diagnostics');
  assert.ok(diagnostics);
  assert.equal(diagnostics.listRule, null);
  assert.equal(diagnostics.fields.getByName('installation').hidden, true);

  down(app);
  assert.equal(app.collections.has('storefront_installation_diagnostics'), false);
  assert.equal(installations.fields.getByName('fid').required, true);
  assert.equal(installations.getIndex('idx_storefront_installations_app_fid').where, '');
  assert.throws(() => installations.fields.getByName('installation_uuid_digest'), /field_not_found/);
});

test('rollback falla cerrado al existir identidad UUID, diagnóstico o recepción nativa', () => {
  for (const mutate of [
    (app) => app.records.get('storefront_installations')[0].set('installation_uuid_digest', 'b'.repeat(64)),
    (app) => app.records.get('storefront_installation_diagnostics').push(
      new FakeRecord('storefront_installation_diagnostics', 'diagnostic00001'),
    ),
    (app) => app.records.get('push_campaign_deliveries')[0].set('native_status', 'delivered'),
  ]) {
    const { up, down } = loadMigration();
    const app = createApp();
    up(app);
    mutate(app);
    assert.throws(() => down(app), /unsafe_rollback_storefront_resilient_installations/);
  }
});

test('los datos sensibles permanecen privados y ninguna relación usa cascada', () => {
  assert.match(source, /installation_uuid_digest/);
  assert.match(source, /firebase_last_error/);
  assert.match(source, /storefront_installation_diagnostics/);
  assert.match(source, /native_status/);
  assert.doesNotMatch(source, /cascadeDelete:\s*true/);
  assert.doesNotMatch(source, /listRule:\s*""|viewRule:\s*""/);
});
