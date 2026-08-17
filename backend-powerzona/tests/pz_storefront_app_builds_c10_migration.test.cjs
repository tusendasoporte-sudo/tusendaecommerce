'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1786838400_storefront_app_builds_c10.js');
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
  constructor(values) { Object.assign(this, values); this.fields = new FakeFields(...(values.fields || [])); }
}
class FakeField { constructor(values) { Object.assign(this, values); } }

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Field: FakeField,
    Error,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function appFixture() {
  const collections = new Map([
    ['stores', new FakeCollection({ id: 'pbc_stores', name: 'stores', fields: [] })],
    ['users', new FakeCollection({ id: 'pbc_users', name: 'users', fields: [] })],
    ['storefront_app_configs', new FakeCollection({
      id: 'pbc_1786579201', name: 'storefront_app_configs', fields: [], indexes: [],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    })],
  ]);
  return {
    collections,
    findCollectionByNameOrId(value) {
      const found = collections.get(value) || [...collections.values()].find((collection) => collection.id === value);
      if (!found) throw new Error('collection_not_found');
      return found;
    },
    findRecordsByFilter() { return []; },
    save(collection) { collections.set(collection.name, collection); return collection; },
    delete(collection) { collections.delete(collection.name); },
  };
}

test('migración C10 es aditiva, privada y reversible sin datos', () => {
  const { up, down } = loadMigration();
  const app = appFixture();
  up(app);
  const appConfigs = app.collections.get('storefront_app_configs');
  assert.equal(appConfigs.fields.getByName('firebase_project_id').hidden, false);
  assert.equal(appConfigs.fields.getByName('firebase_project_number').hidden, true);
  for (const name of ['storefront_app_build_profiles', 'storefront_app_build_jobs', 'storefront_app_artifacts']) {
    const collection = app.collections.get(name);
    assert.ok(collection, name);
    assert.equal(collection.listRule, null);
    assert.equal(collection.viewRule, null);
    assert.equal(collection.createRule, null);
    assert.equal(collection.updateRule, null);
    assert.equal(collection.deleteRule, null);
    assert.equal(collection.fields.filter((field) => field.type === 'relation').every((field) => field.cascadeDelete === false), true);
  }
  const profiles = app.collections.get('storefront_app_build_profiles');
  const jobs = app.collections.get('storefront_app_build_jobs');
  assert.equal(profiles.fields.getByName('current_engine_version').pattern, '^[0-9]+\\.[0-9]+\\.[0-9]+$');
  assert.equal(profiles.fields.getByName('current_engine_revision').pattern, '^[a-f0-9]{40}$');
  assert.deepEqual(Array.from(jobs.fields.getByName('delivery_status').values), ['pending', 'marked_sent']);
  assert.equal(jobs.fields.getByName('delivery_sender_whatsapp').hidden, true);
  assert.equal(jobs.fields.getByName('delivery_recipient_whatsapp').hidden, true);
  assert.equal(jobs.fields.getByName('delivery_message_sha256').pattern, '^[a-f0-9]{64}$');
  assert.ok(jobs.indexes.some((index) => index.includes('delivery_status')));
  assert.ok(profiles.indexes.some((index) => index.includes('UNIQUE') && index.includes('package')));
  assert.ok(profiles.indexes.some((index) => index.includes('UNIQUE') && index.includes('project')));
  down(app);
  assert.equal(app.collections.has('storefront_app_build_profiles'), false);
  assert.throws(() => appConfigs.fields.getByName('firebase_project_id'), /field_not_found/);
});

test('rollback falla cerrado si existen perfiles, jobs o artefactos', () => {
  const { up, down } = loadMigration();
  const app = appFixture();
  up(app);
  app.findRecordsByFilter = (name) => name === 'storefront_app_build_jobs' ? [{ id: 'jobc10test0001' }] : [];
  assert.throws(() => down(app), /unsafe_rollback_storefront_app_build_data/);
  assert.equal(app.collections.has('storefront_app_build_jobs'), true);
});
