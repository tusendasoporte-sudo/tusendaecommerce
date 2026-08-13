'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1786579500_e003_product_visibility_permission.js');

function loadMigration() {
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up;
  let down;
  vm.runInNewContext(source, {
    Error,
    JSON,
    Object,
    migrate(upFn, downFn) { up = upFn; down = downFn; },
  }, { filename: migrationPath });
  return { source, up, down };
}

function record(templateCode, permissions) {
  return {
    values: { template_code: templateCode, permissions_json: permissions },
    get(key) { return this.values[key]; },
    set(key, value) { this.values[key] = value; },
  };
}

test('E003: repara visibilidad solo en plantillas de administración de catálogo', () => {
  const migration = loadMigration();
  const records = [
    record('secondary_admin', ['catalog.view', 'catalog.products.edit', 'catalog.products.stock']),
    record('catalog_inventory', JSON.stringify(['catalog.view', 'catalog.products.edit'])),
    record('custom', ['catalog.view', 'catalog.products.edit']),
    record('read_only', ['catalog.view']),
    record('secondary_admin', ['catalog.view', 'catalog.products.visibility']),
  ];
  let saves = 0;
  const app = {
    findCollectionByNameOrId(name) {
      assert.equal(name, 'store_user_access');
      return { name };
    },
    findRecordsByFilter(_collection, _filter, _sort, _limit, offset) {
      return offset ? [] : records;
    },
    save() { saves += 1; },
  };

  migration.up(app);
  assert.equal(records[0].values.permissions_json.includes('catalog.products.visibility'), true);
  assert.equal(records[1].values.permissions_json.includes('catalog.products.visibility'), true);
  assert.equal(records[2].values.permissions_json.includes('catalog.products.visibility'), false);
  assert.equal(records[3].values.permissions_json.includes('catalog.products.visibility'), false);
  assert.equal(records[4].values.permissions_json.filter((item) => item === 'catalog.products.visibility').length, 1);
  assert.equal(saves, 2);

  migration.up(app);
  assert.equal(saves, 2, 'la reparación debe ser idempotente');
  assert.doesNotThrow(() => migration.down(app));
});
