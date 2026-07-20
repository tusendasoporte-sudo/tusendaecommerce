'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1784595700_store_granular_permission_rules.js');

function mutableRecord(id, values = {}) {
  return {
    id,
    values: { ...values },
    getString(key) { return String(this.values[key] ?? ''); },
    get(key) { return this.values[key]; },
    set(key, value) { this.values[key] = value; },
  };
}

function loadMigration() {
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up;
  let down;
  vm.runInNewContext(source, {
    migrate(upFn, downFn) { up = upFn; down = downFn; },
  }, { filename: migrationPath });
  return { source, up, down };
}

function fixture() {
  const previousCreateRule = '(@request.auth.id = "" && @request.body.store != "") || (@request.auth.role = "master_admin") || ((@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && @request.body.store = @request.auth.store)';
  const notificationsCollection = {
    name: 'store_notifications',
    listRule: '@request.auth.role = "store_admin" && store = @request.auth.store',
    viewRule: '@request.auth.role = "store_admin" && store = @request.auth.store',
    createRule: previousCreateRule,
    updateRule: '@request.auth.role = "store_admin" && store = @request.auth.store',
    deleteRule: '@request.auth.role = "store_admin" && store = @request.auth.store',
  };
  const stores = new Map([
    ['storeone0000001', mutableRecord('storeone0000001', { slug: 'tienda-uno' })],
    ['storetwo0000001', mutableRecord('storetwo0000001', { slug: 'tienda-dos' })],
  ]);
  const records = [
    mutableRecord('notifysafe00001', {
      store: 'storeone0000001',
      target_url: '/t/tienda-uno/admin/orders/abc?tab=items#total',
    }),
    mutableRecord('notifyjs0000001', { store: 'storeone0000001', target_url: 'javascript:alert(1)' }),
    mutableRecord('notifyext000001', { store: 'storeone0000001', target_url: 'https://evil.example/phish' }),
    mutableRecord('notifytenant001', { store: 'storeone0000001', target_url: '/t/tienda-dos/admin/orders' }),
    mutableRecord('notifyencoded01', { store: 'storetwo0000001', target_url: '/t/tienda-dos/admin/%2e%2e/public' }),
    mutableRecord('notifyrawdot001', { store: 'storetwo0000001', target_url: '/t/tienda-dos/admin/../public' }),
    mutableRecord('notifydouble001', { store: 'storetwo0000001', target_url: '/t/tienda-dos/admin/%252e%252e/public' }),
    mutableRecord('notifystoreless', { store: 'missingstore001', target_url: 'javascript:alert(1)' }),
  ];
  let recordSaveCount = 0;
  const app = {
    findCollectionByNameOrId(name) {
      if (name === 'store_notifications') return notificationsCollection;
      throw new Error('collection_not_found');
    },
    findRecordsByFilter(name, _filter, _sort, limit, offset) {
      assert.equal(name, 'store_notifications');
      return records.slice(offset, offset + limit);
    },
    findRecordById(name, id) {
      if (name === 'stores' && stores.has(id)) return stores.get(id);
      throw new Error('record_not_found');
    },
    save(value) {
      if (value !== notificationsCollection) recordSaveCount += 1;
      return value;
    },
  };
  return {
    app,
    notificationsCollection,
    previousCreateRule,
    records,
    recordSaveCount: () => recordSaveCount,
  };
}

test('la migración limita las altas públicas a eventos verificables y conserva el rollback exacto', () => {
  const migration = loadMigration();
  const current = fixture();

  migration.up(current.app);
  assert.match(current.notificationsCollection.createRule, /@request\.auth\.id\s*=\s*""/);
  assert.match(current.notificationsCollection.createRule, /review_pending/);
  assert.match(current.notificationsCollection.createRule, /entity_collection\s*=\s*"reviews"/);
  assert.match(current.notificationsCollection.createRule, /entity_collection\s*=\s*"orders"/);
  assert.match(current.notificationsCollection.createRule, /raffle_entry_created/);
  assert.match(current.notificationsCollection.createRule, /entity_collection\s*=\s*"raffle_entries"/);
  assert.doesNotMatch(
    current.notificationsCollection.createRule,
    /@request\.auth\.id\s*=\s*""\s*&&\s*@request\.body\.store\s*!=\s*""\s*\)\s*\|\|/,
  );
  assert.match(current.notificationsCollection.createRule, /master_admin/);
  assert.match(current.notificationsCollection.createRule, /store_staff/);
  assert.match(current.notificationsCollection.createRule, /@request\.body\.store\s*=\s*@request\.auth\.store/);

  migration.down(current.app);
  assert.equal(current.notificationsCollection.createRule, current.previousCreateRule);
});

test('el scrub histórico conserva rutas del tenant y reemplaza destinos peligrosos de forma idempotente', () => {
  const migration = loadMigration();
  const current = fixture();

  migration.up(current.app);
  assert.equal(current.records[0].values.target_url, '/t/tienda-uno/admin/orders/abc?tab=items#total');
  for (const index of [1, 2, 3]) {
    assert.equal(current.records[index].values.target_url, '/t/tienda-uno/admin/notifications');
  }
  assert.equal(current.records[4].values.target_url, '/t/tienda-dos/admin/notifications');
  for (const index of [4, 5, 6]) {
    assert.equal(current.records[index].values.target_url, '/t/tienda-dos/admin/notifications');
  }
  assert.equal(current.records[7].values.target_url, '');
  assert.equal(current.recordSaveCount(), 7);

  migration.up(current.app);
  assert.equal(current.recordSaveCount(), 7);
});
