'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1786752100_storefront_order_origin_unique.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeCollection {
  constructor() {
    this.name = 'storefront_order_links';
    this.indexes = [{
      name: 'idx_storefront_order_links_order_unique',
      unique: true,
      columns: 'order',
      where: "attribution_source != 'none'",
    }];
  }
  addIndex(name, unique, columns, where) { this.indexes.push({ name, unique, columns, where }); }
  removeIndex(name) { this.indexes = this.indexes.filter((item) => item.name !== name); }
  getIndex(name) {
    const index = this.indexes.find((item) => item.name === name);
    if (!index) throw new Error('index_not_found');
    return index;
  }
}

class FakeRecord {
  constructor(id, order) { this.id = id; this.order = order; }
  getString(field) { return String(this[field] || ''); }
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    Error,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function createApp(records = []) {
  const collection = new FakeCollection();
  return {
    collection,
    findCollectionByNameOrId(name) {
      if (name !== 'storefront_order_links') throw new Error('collection_not_found');
      return collection;
    },
    findRecordsByFilter(name, _filter, _sort, limit, offset) {
      if (name !== 'storefront_order_links') throw new Error('collection_not_found');
      return records.slice(offset, offset + limit);
    },
    save(value) { return value; },
  };
}

test('origen app exige una sola instalación por pedido y rollback conserva C09', () => {
  const { up, down } = loadMigration();
  const app = createApp([
    new FakeRecord('linkorigin00001', 'orderorigin0001'),
    new FakeRecord('linkorigin00002', 'orderorigin0002'),
  ]);
  up(app);
  const unique = app.collection.getIndex('idx_storefront_order_links_order_unique');
  assert.equal(unique.unique, true);
  assert.equal(unique.columns, 'order');
  assert.equal(unique.where, '');

  down(app);
  assert.equal(
    app.collection.getIndex('idx_storefront_order_links_order_unique').where,
    "attribution_source != 'none'",
  );
});

test('migración falla cerrada si un pedido ya apunta a varias instalaciones', () => {
  const { up } = loadMigration();
  const app = createApp([
    new FakeRecord('linkorigin00001', 'orderorigin0001'),
    new FakeRecord('linkorigin00002', 'orderorigin0001'),
  ]);
  assert.throws(() => up(app), /duplicate_storefront_order_origin/);
  assert.equal(
    app.collection.getIndex('idx_storefront_order_links_order_unique').where,
    "attribution_source != 'none'",
  );
});

test('la migración no elimina relaciones ni vuelve pública la colección', () => {
  assert.doesNotMatch(source, /app\.delete|listRule|viewRule|createRule|updateRule|deleteRule/);
  assert.match(source, /assertOneInstallationPerOrder/);
  assert.match(source, /links\.addIndex\(ORDER_UNIQUE_INDEX, true, "order", ""\)/);
});
