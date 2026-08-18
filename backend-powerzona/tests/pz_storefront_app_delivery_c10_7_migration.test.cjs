'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1787097600_storefront_app_delivery_c10_7.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeFields extends Array {
  getByName(name) {
    const field = this.find((item) => item.name === name);
    if (!field) throw new Error('field_not_found');
    return field;
  }
  add(field) { this.push(field); }
  removeById(id) {
    const index = this.findIndex((field) => field.id === id);
    if (index >= 0) this.splice(index, 1);
  }
}

class FakeCollection {
  constructor(name, fields) {
    this.name = name;
    this.fields = new FakeFields(...fields);
  }
}
class FakeField { constructor(values) { Object.assign(this, values); } }

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    Field: FakeField,
    Error,
    Set,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function fixture() {
  const collections = new Map([
    ['storefront_app_build_profiles', new FakeCollection('storefront_app_build_profiles', [])],
    ['storefront_app_artifacts', new FakeCollection('storefront_app_artifacts', [{
      id: 'sel17869248002', name: 'lifecycle_status', type: 'select', values: ['available', 'deletion_queued', 'deleted'],
    }])],
  ]);
  return {
    collections,
    findCollectionByNameOrId(name) { return collections.get(name); },
    findRecordsByFilter() { return []; },
    save() {},
  };
}

test('migración C10.7 añade nonce privado, archivo protegido y estado staged', () => {
  const app = fixture();
  const { up, down } = loadMigration();
  up(app);
  const nonce = app.collections.get('storefront_app_build_profiles').fields.getByName('download_nonce');
  const file = app.collections.get('storefront_app_artifacts').fields.getByName('file');
  const lifecycle = app.collections.get('storefront_app_artifacts').fields.getByName('lifecycle_status');
  assert.equal(nonce.hidden, true);
  assert.equal(nonce.pattern, '^[A-Za-z0-9_-]{43}$');
  assert.equal(file.type, 'file');
  assert.equal(file.protected, true);
  assert.equal(file.hidden, true);
  assert.equal(file.required, false);
  assert.equal(file.maxSize, 100 * 1024 * 1024);
  assert.deepEqual(Array.from(lifecycle.values), ['staged', 'available', 'deletion_queued', 'deleted']);
  down(app);
  assert.throws(() => app.collections.get('storefront_app_build_profiles').fields.getByName('download_nonce'), /field_not_found/);
  assert.throws(() => app.collections.get('storefront_app_artifacts').fields.getByName('file'), /field_not_found/);
  assert.deepEqual(Array.from(lifecycle.values), ['available', 'deletion_queued', 'deleted']);
});

test('rollback C10.7 falla cerrado si ya existen nonces, archivos o cargas staged', () => {
  const app = fixture();
  const { up, down } = loadMigration();
  up(app);
  app.findRecordsByFilter = (collection, filter) => (
    collection === 'storefront_app_artifacts' && filter.includes("lifecycle_status = 'staged'") ? [{ id: 'artifactc107001' }] : []
  );
  assert.throws(() => down(app), /unsafe_rollback_storefront_app_delivery_c10_7/);
  assert.ok(app.collections.get('storefront_app_artifacts').fields.getByName('file'));
});
