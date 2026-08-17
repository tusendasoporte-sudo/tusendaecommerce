'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1786845600_storefront_app_brand_assets_c10.js');
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
  constructor(values) {
    Object.assign(this, values);
    this.fields = new FakeFields(...(values.fields || []));
  }
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
    ['storefront_app_build_profiles', new FakeCollection({
      id: 'pbc_1786838401', name: 'storefront_app_build_profiles', fields: [], indexes: [],
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

test('migración de marca C10 crea archivos privados versionados y relaciones de perfil', () => {
  const { up, down } = loadMigration();
  const app = appFixture();
  up(app);
  const assets = app.collections.get('storefront_app_brand_assets');
  const profiles = app.collections.get('storefront_app_build_profiles');
  assert.ok(assets);
  assert.equal(assets.listRule, null);
  assert.deepEqual(Array.from(assets.fields.getByName('kind').values), ['icon', 'splash']);
  assert.equal(assets.fields.getByName('file').protected, true);
  assert.deepEqual(Array.from(assets.fields.getByName('file').mimeTypes), ['image/png']);
  assert.equal(assets.fields.getByName('file').maxSize, 8 * 1024 * 1024);
  assert.equal(assets.fields.getByName('sha256').pattern, '^[a-f0-9]{64}$');
  assert.ok(assets.indexes.some((index) => index.includes('UNIQUE') && index.includes("'active'")));
  assert.equal(profiles.fields.getByName('icon_asset').collectionId, assets.id);
  assert.equal(profiles.fields.getByName('splash_asset').collectionId, assets.id);
  down(app);
  assert.equal(app.collections.has('storefront_app_brand_assets'), false);
  assert.throws(() => profiles.fields.getByName('icon_asset'), /field_not_found/);
});

test('rollback de marca C10 falla cerrado si existen recursos', () => {
  const { up, down } = loadMigration();
  const app = appFixture();
  up(app);
  app.findRecordsByFilter = (name) => name === 'storefront_app_brand_assets' ? [{ id: 'assetc10test001' }] : [];
  assert.throws(() => down(app), /unsafe_rollback_storefront_app_brand_assets/);
  assert.equal(app.collections.has('storefront_app_brand_assets'), true);
});
