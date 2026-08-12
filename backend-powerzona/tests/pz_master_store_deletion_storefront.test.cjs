'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const deletion = require('../pb_hooks/pz_master_store_deletion_lib.js');

const PUBLIC_COLLECTIONS = [
  'storefront_app_configs',
  'storefront_installations',
  'storefront_web_sessions',
  'storefront_order_links',
  'push_media',
  'push_campaigns',
  'push_campaign_deliveries',
  'push_events',
];

test('el inventario Master cuenta y verifica las ocho colecciones nuevas', () => {
  for (const collection of PUBLIC_COLLECTIONS) {
    assert.equal(deletion.COUNT_KEYS.includes(collection), true, collection);
    assert.equal(deletion.DIRECT_STORE_COLLECTIONS.includes(collection), true, collection);
  }
  assert.equal(deletion.DIRECT_STORE_COLLECTIONS.includes('store_push_devices'), false);
});

test('la eliminación explícita borra solo la tienda objetivo y respeta el orden hijos-padres', () => {
  const storeA = 'storedelete0001';
  const storeB = 'storedelete0002';
  const records = Object.fromEntries(PUBLIC_COLLECTIONS.map((collection) => [collection, [
    { id: `${collection}a`, collection, store: storeA },
    { id: `${collection}b`, collection, store: storeB },
  ]]));
  records.store_push_devices = [{ id: 'admin-device-a', collection: 'store_push_devices', store: storeA }];
  const deleteOrder = [];
  const app = {
    findRecordsByFilter(collection, _filter, _sort, _limit, _offset, params) {
      return (records[collection] || []).filter((record) => record.store === params.storeId);
    },
    delete(record) {
      deleteOrder.push(record.collection);
      records[record.collection] = records[record.collection].filter((item) => item !== record);
    },
  };
  const counts = Object.fromEntries(deletion.COUNT_KEYS.map((key) => [key, 0]));
  for (const collection of PUBLIC_COLLECTIONS) counts[collection] = 1;

  assert.equal(deletion.executeDeletionPlan(app, storeA, counts), PUBLIC_COLLECTIONS.length);
  for (const collection of PUBLIC_COLLECTIONS) {
    assert.deepEqual(records[collection].map((record) => record.store), [storeB], collection);
  }
  assert.equal(records.store_push_devices.length, 1);
  assert.deepEqual(deleteOrder.slice(0, PUBLIC_COLLECTIONS.length), [
    'push_events',
    'push_campaign_deliveries',
    'storefront_order_links',
    'storefront_web_sessions',
    'push_campaigns',
    'push_media',
    'storefront_installations',
    'storefront_app_configs',
  ]);
});

test('la detección previa incluye referencias cruzadas de toda la familia pública', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_master_store_deletion_lib.js'), 'utf8');
  const section = source.slice(source.indexOf('function findCrossStoreReferences'), source.indexOf('function hasReferences'));
  for (const collection of PUBLIC_COLLECTIONS.filter((name) => name !== 'storefront_app_configs' && name !== 'push_media')) {
    assert.equal(section.includes(`SELECT '${collection}'`), true, collection);
  }
  assert.match(section, /target_storefront_apps/);
  assert.match(section, /target_push_media/);
});
