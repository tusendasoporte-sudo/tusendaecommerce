'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

class FakeRecord {
  constructor(collection, values = {}) {
    this.collectionName = collection?.name || collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
}

global.Record = FakeRecord;

const budget = require('../pb_hooks/pz_store_storage_budget_lib.js');

function createApp(objects) {
  const cache = new Map();
  const notifications = [];
  const masters = [new FakeRecord('users', {
    id: 'masterstorage01', role: 'master_admin', status: 'active',
  })];
  let scans = 0;
  let closes = 0;
  const app = {
    notifications,
    counters: () => ({ scans, closes }),
    store() {
      return {
        get: (key) => cache.get(key),
        set: (key, value) => cache.set(key, value),
        remove: (key) => cache.delete(key),
      };
    },
    newFilesystem() {
      scans += 1;
      return {
        list: () => objects,
        close: () => { closes += 1; },
      };
    },
    findCollectionByNameOrId(name) {
      if (name !== 'master_notifications') throw new Error('collection_not_found');
      return { name };
    },
    findRecordsByFilter(collection, _filter, _sort, _limit, _offset, params = {}) {
      if (collection === 'users') return masters;
      if (collection === 'master_notifications') {
        return notifications.filter((item) => (
          item.getString('recipient') === params.recipientId
          && item.getString('group_key') === params.groupKey
          && item.getString('status') === 'unread'
        ));
      }
      return [];
    },
    save(record) {
      if (!record.id) record.id = `notice${String(notifications.length + 1).padStart(9, '0')}`;
      if (!notifications.includes(record)) notifications.push(record);
      return record;
    },
    logger() { return { error() {} }; },
  };
  return app;
}

test('mide todos los archivos fisicos, ignora directorios y cierra el filesystem', () => {
  const app = createApp([
    { key: 'pbc/a.webp', size: 100, isDir: false },
    { key: 'pbc/thumbs/', size: 0, isDir: true },
    { key: 'pbc/b.webp', size: 250, isDir: false },
  ]);
  assert.deepEqual(
    budget.scanStoreStorageUsage(app, new Date('2026-08-12T12:00:00.000Z')),
    { bytes: 350, objects: 2, measuredAt: 1786536000000 },
  );
  assert.deepEqual(app.counters(), { scans: 1, closes: 1 });
});

test('alerta al Master desde 35 GiB sin duplicar la notificacion abierta', () => {
  const app = createApp([{
    key: 'stores/all.bin', size: budget.STORE_STORAGE_CRITICAL_BYTES, isDir: false,
  }]);
  const first = budget.assertStoreStorageBudget(app, 0, {
    now: new Date('2026-08-12T12:00:00.000Z'), force: true,
  });
  assert.equal(first.critical, true);
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].getString('type'), 'store_storage_critical');
  assert.equal(app.notifications[0].getString('tone'), 'critical');
  budget.assertStoreStorageBudget(app, 1, {
    now: new Date('2026-08-12T13:00:00.000Z'), force: true,
  });
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].get('event_count'), 2);
});

test('bloquea la carga que superaria 40 GiB y falla cerrado si no puede medir', () => {
  const fullApp = createApp([{
    key: 'stores/all.bin', size: budget.STORE_STORAGE_HARD_LIMIT_BYTES, isDir: false,
  }]);
  assert.throws(
    () => budget.assertStoreStorageBudget(fullApp, 1, { force: true }),
    (error) => error.code === 'store_storage_full',
  );

  const unavailableApp = createApp([{ key: 'bad', size: -1, isDir: false }]);
  assert.throws(
    () => budget.assertStoreStorageBudget(unavailableApp, 1, { force: true }),
    (error) => error.code === 'store_storage_unavailable',
  );
});

test('usa cache breve, registra aumentos y vuelve a medir tras invalidar', () => {
  const objects = [{ key: 'stores/a.webp', size: 100, isDir: false }];
  const app = createApp(objects);
  const now = new Date('2026-08-12T12:00:00.000Z');
  assert.equal(budget.storeStorageUsage(app, { now }).bytes, 100);
  assert.equal(budget.storeStorageUsage(app, { now }).bytes, 100);
  assert.equal(app.counters().scans, 1);
  budget.recordStoreStorageIncrease(app, 50, now);
  assert.equal(budget.storeStorageUsage(app, { now }).bytes, 150);
  objects.push({ key: 'stores/b.webp', size: 50, isDir: false });
  budget.invalidateStoreStorageUsage(app);
  assert.equal(budget.storeStorageUsage(app, { now }).bytes, 150);
  assert.equal(app.counters().scans, 2);
});

test('el limite global protege cargas push y cargas de productos', () => {
  const push = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_storefront_media_lib.js'),
    'utf8',
  );
  const products = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_product_image_limits_lib.js'),
    'utf8',
  );
  const productHooks = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_product_image_limits.pb.js'),
    'utf8',
  );
  assert.match(push, /assertStoreStorageBudget\(app, request\.payload\.bytes/);
  assert.match(products, /assertStoreStorageBudget\(event\.app, incomingBytes/);
  assert.match(productHooks, /onRecordAfterCreateSuccess\(continueAndInvalidateStoreStorage/);
  assert.match(productHooks, /onRecordAfterUpdateSuccess\(continueAndInvalidateStoreStorage/);
  assert.match(productHooks, /onRecordAfterDeleteSuccess\(continueAndInvalidateStoreStorage/);
});
