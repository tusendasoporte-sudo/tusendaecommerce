'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1787292100_manual_coupon_lifecycle.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeFields extends Array {
  getByName(name) {
    const field = this.find((item) => item.name === name);
    if (!field) throw new Error('field_not_found');
    return field;
  }
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function appFixture() {
  const collections = new Map([
    ['manual_coupons', {
      name: 'manual_coupons',
      fields: new FakeFields({ name: 'code', min: 2, max: 40, pattern: '^[A-Za-z0-9_-]+$' }),
    }],
    ['manual_coupon_usages', {
      name: 'manual_coupon_usages',
      fields: new FakeFields({ name: 'coupon', required: true, minSelect: 1, cascadeDelete: false }),
    }],
  ]);
  return {
    collections,
    findCollectionByNameOrId(name) { return collections.get(name); },
    save(collection) { collections.set(collection.name, collection); },
  };
}

test('limita códigos a ocho ASCII visibles y conserva usos al eliminar el cupón', () => {
  const { up, down } = loadMigration();
  const app = appFixture();
  up(app);

  const code = app.collections.get('manual_coupons').fields.getByName('code');
  assert.equal(code.min, 2);
  assert.equal(code.max, 8);
  assert.equal(code.pattern, '^[\\x20-\\x7E]{2,8}$');

  const coupon = app.collections.get('manual_coupon_usages').fields.getByName('coupon');
  assert.equal(coupon.required, false);
  assert.equal(coupon.minSelect, 0);
  assert.equal(coupon.cascadeDelete, false);

  down(app);
  assert.equal(code.max, 40);
  assert.equal(code.pattern, '^[A-Za-z0-9_-]+$');
  assert.equal(coupon.required, true);
  assert.equal(coupon.minSelect, 1);
});
