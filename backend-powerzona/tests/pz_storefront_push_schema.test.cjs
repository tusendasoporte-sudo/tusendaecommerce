'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const schema = require('../pb_hooks/pz_storefront_push_schema_lib.js');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1786579200_storefront_push_foundation.js');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

function loadMigration() {
  let forward;
  let rollback;
  class FakeCollection {
    constructor(values) { Object.assign(this, values); }
  }
  vm.runInNewContext(migrationSource, {
    Collection: FakeCollection,
    Error,
    migrate(up, down) { forward = up; rollback = down; },
  }, { filename: migrationPath });
  return { forward, rollback };
}

function cleanMigrationApp() {
  const collections = new Map([
    ['stores', { id: 'pbc_stores', name: 'stores' }],
    ['users', { id: 'pbc_users', name: 'users' }],
    ['products', { id: 'pbc_products', name: 'products' }],
    ['categories', { id: 'pbc_categories', name: 'categories' }],
    ['orders', { id: 'pbc_orders', name: 'orders' }],
    ['raffles', { id: 'pbc_raffles', name: 'raffles' }],
    ['manual_coupons', { id: 'pbc_coupons', name: 'manual_coupons' }],
  ]);
  return {
    collections,
    findCollectionByNameOrId(value) {
      const direct = collections.get(value);
      if (direct) return direct;
      for (const collection of collections.values()) if (collection.id === value) return collection;
      throw new Error('collection_not_found');
    },
    findRecordsByFilter() { return []; },
    save(collection) {
      collections.set(collection.name, collection);
      return collection;
    },
    delete(collection) { collections.delete(collection.name); },
  };
}

test('la migración crea y revierte de forma reproducible las ocho colecciones privadas', () => {
  const { forward, rollback } = loadMigration();
  const app = cleanMigrationApp();
  forward(app);

  const created = schema.STOREFRONT_PUSH_COLLECTIONS.map((name) => app.collections.get(name));
  assert.equal(created.every(Boolean), true);
  for (const collection of created) schema.assertCollectionRulesClosed(collection);
  assert.equal(app.collections.has('push_daily_stats'), false);
  assert.equal(app.collections.has('push_batches'), false);
  assert.equal(app.collections.has('store_push_devices'), false);
  assert.equal(app.collections.has('store_notifications'), false);

  rollback(app);
  assert.equal(schema.STOREFRONT_PUSH_COLLECTIONS.some((name) => app.collections.has(name)), false);
  forward(app);
  assert.equal(schema.STOREFRONT_PUSH_COLLECTIONS.every((name) => app.collections.has(name)), true);
});

test('el rollback falla cerrado si alguna colección C02 ya contiene datos', () => {
  const { forward, rollback } = loadMigration();
  const app = cleanMigrationApp();
  forward(app);
  app.findRecordsByFilter = (name) => (name === 'push_campaigns' ? [{ id: 'campaign0000001' }] : []);
  assert.throws(() => rollback(app), /unsafe_rollback_storefront_push_data/);
  assert.equal(schema.STOREFRONT_PUSH_COLLECTIONS.every((name) => app.collections.has(name)), true);
});

test('todas las relaciones son sin cascada y las restricciones cubren duplicados previsibles', () => {
  const { forward } = loadMigration();
  const app = cleanMigrationApp();
  forward(app);
  for (const name of schema.STOREFRONT_PUSH_COLLECTIONS) {
    const relations = app.collections.get(name).fields.filter((field) => field.type === 'relation');
    assert.equal(relations.every((field) => field.cascadeDelete === false), true, name);
  }

  const indexes = schema.STOREFRONT_PUSH_COLLECTIONS.flatMap((name) => app.collections.get(name).indexes);
  for (const fragment of [
    'storefront_app_configs_app_key',
    'storefront_app_configs_package',
    'storefront_installations_app_fid',
    'storefront_installations_credential',
    'storefront_web_sessions_digest',
    'storefront_order_links_installation_order',
    'push_deliveries_campaign_installation',
    'push_events_installation_idempotency',
  ]) {
    assert.equal(indexes.some((index) => index.includes('CREATE UNIQUE INDEX') && index.includes(fragment)), true, fragment);
  }
});

test('los secretos, datos sensibles y fechas de retención están explícitos', () => {
  assert.deepEqual(schema.RETENTION_POLICY, {
    installation_full_ip_days: 30,
    web_session_days_after_expiration: 30,
    delivery_days: 180,
    event_days: 180,
    campaign_months: 24,
    daily_aggregate_months: 36,
  });
  assert.equal(schema.SENSITIVE_FIELDS.storefront_installations.includes('fid'), true);
  assert.equal(schema.SENSITIVE_FIELDS.storefront_installations.includes('credential_digest'), true);
  assert.equal(schema.SENSITIVE_FIELDS.push_campaign_deliveries.includes('firebase_message_id'), true);
});

test('rechaza relaciones cruzadas entre dos tiendas y permite el grafo del mismo tenant', () => {
  const storeA = 'storetenant0001';
  const storeB = 'storetenant0002';
  const records = new Map([
    ['storefront_app_configs:appa00000000001', { id: 'appa00000000001', store: storeA }],
    ['storefront_app_configs:appb00000000001', { id: 'appb00000000001', store: storeB }],
    ['storefront_installations:insta0000000001', { id: 'insta0000000001', store: storeA, app_config: 'appa00000000001' }],
    ['storefront_installations:instb0000000001', { id: 'instb0000000001', store: storeB, app_config: 'appb00000000001' }],
    ['push_campaigns:campa0000000001', { id: 'campa0000000001', store: storeA }],
    ['orders:ordera000000001', { id: 'ordera000000001', store: storeA }],
    ['orders:orderb000000001', { id: 'orderb000000001', store: storeB }],
  ]);
  const app = {
    findRecordById(collection, id) {
      const record = records.get(`${collection}:${id}`);
      if (!record) throw new Error('not_found');
      return record;
    },
  };

  assert.equal(schema.assertTenantIsolation(app, 'storefront_installations', {
    store: storeA, app_config: 'appa00000000001',
  }), true);
  assert.throws(
    () => schema.assertTenantIsolation(app, 'storefront_installations', {
      store: storeA, app_config: 'appb00000000001',
    }),
    (error) => error.code === 'cross_store_relation' && error.field === 'app_config',
  );
  assert.equal(schema.assertTenantIsolation(app, 'storefront_order_links', {
    store: storeA, installation: 'insta0000000001', order: 'ordera000000001',
  }), true);
  assert.throws(
    () => schema.assertTenantIsolation(app, 'storefront_order_links', {
      store: storeA, installation: 'insta0000000001', order: 'orderb000000001',
    }),
    (error) => error.code === 'cross_store_relation' && error.field === 'order',
  );
  assert.throws(
    () => schema.assertTenantIsolation(app, 'push_campaign_deliveries', {
      store: storeA, campaign: 'campa0000000001', installation: 'instb0000000001',
    }),
    (error) => error.code === 'cross_store_relation' && error.field === 'installation',
  );
});

test('los estados y destinos tipados fallan cerrados', () => {
  assert.equal(schema.isValidState('push_campaigns', 'scheduled'), true);
  assert.equal(schema.isValidState('push_campaigns', 'published'), false);
  assert.equal(schema.assertCampaignTarget({ target_type: 'home' }), true);
  assert.equal(schema.assertCampaignTarget({ target_type: 'section', target_section: 'search' }), true);
  assert.equal(schema.assertCampaignTarget({ target_type: 'product', target_product: 'product00000001' }), true);
  assert.throws(
    () => schema.assertCampaignTarget({ target_type: 'product', target_category: 'category0000001' }),
    (error) => error.code === 'invalid_campaign_target',
  );
});
