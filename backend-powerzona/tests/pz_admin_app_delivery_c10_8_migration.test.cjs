'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1787184000_admin_app_delivery_c10_8.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeFields extends Array {
  getByName(name) {
    const value = this.find((field) => field.name === name);
    if (!value) throw new Error('field_not_found');
    return value;
  }
}
class FakeField { constructor(values) { Object.assign(this, values); } }
class FakeCollection {
  constructor(values) {
    if (typeof values === 'string') {
      this.id = values; this.name = values; this.fields = new FakeFields();
    } else {
      Object.assign(this, values); this.fields = new FakeFields(...(values.fields || []));
    }
  }
}

function loadMigration() {
  let up; let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection, Field: FakeField, Error,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function fixture() {
  const collections = new Map([
    ['stores', new FakeCollection('stores')],
    ['users', new FakeCollection('users')],
    ['store_user_devices', new FakeCollection('store_user_devices')],
  ]);
  const rows = new Map();
  return {
    collections, rows,
    findCollectionByNameOrId(name) {
      const value = collections.get(name);
      if (!value) throw new Error(`missing:${name}`);
      return value;
    },
    findRecordsByFilter(name) { return rows.get(name) || []; },
    save(collection) { if (collection?.name) collections.set(collection.name, collection); },
    delete(collection) { collections.delete(collection.name); },
  };
}

test('C10.8 crea un dominio privado separado y un APK protegido', () => {
  const app = fixture();
  const { up } = loadMigration();
  up(app);
  const expected = [
    'admin_app_release_profiles', 'admin_app_build_jobs', 'admin_app_artifacts',
    'admin_app_release_assignments', 'admin_app_download_tickets', 'admin_app_release_events',
  ];
  expected.forEach((name) => {
    const collection = app.collections.get(name);
    assert.ok(collection, name);
    assert.equal(collection.listRule, null);
    assert.equal(collection.viewRule, null);
    assert.equal(collection.createRule, null);
    assert.equal(collection.updateRule, null);
    assert.equal(collection.deleteRule, null);
  });
  const file = app.collections.get('admin_app_artifacts').fields.getByName('file');
  assert.equal(file.protected, true);
  assert.equal(file.hidden, true);
  assert.equal(file.maxSize, 100 * 1024 * 1024);
  assert.equal(file.mimeTypes.includes('application/zip'), true);
  const grant = app.collections.get('admin_app_release_assignments').fields.getByName('grant_digest');
  const ticket = app.collections.get('admin_app_download_tickets').fields.getByName('token_digest');
  assert.equal(grant.hidden, true);
  assert.equal(ticket.hidden, true);
  assert.equal(app.collections.get('admin_app_release_assignments').fields.getByName('wave').required, false);
  assert.equal(app.collections.get('admin_app_release_profiles').fields.getByName('minimum_supported_version_code').min, 0);
});

test('rollback C10.8 solo elimina colecciones vacías y falla cerrado con datos', () => {
  const app = fixture();
  const { up, down } = loadMigration();
  up(app);
  app.rows.set('admin_app_release_assignments', [{ id: 'assignmentc1081' }]);
  assert.throws(() => down(app), /unsafe_rollback_admin_app_delivery_c10_8/);
  assert.ok(app.collections.has('admin_app_release_assignments'));
  app.rows.clear();
  down(app);
  assert.equal(app.collections.has('admin_app_release_profiles'), false);
  assert.equal(app.collections.has('admin_app_release_events'), false);
});
