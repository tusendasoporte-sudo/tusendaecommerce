'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class MockField {
  constructor(options) { Object.assign(this, options); }
}

class MockFields {
  constructor(fields = []) { this.items = fields.map((field) => new MockField(field)); }
  getByName(name) {
    const found = this.items.find((field) => field.name === name);
    if (!found) throw new Error(`field_not_found:${name}`);
    return found;
  }
  add(field) { this.items.push(field); }
  removeById(id) { this.items = this.items.filter((field) => field.id !== id); }
}

class MockCollection {
  constructor(options) {
    Object.assign(this, options);
    this.fields = new MockFields(options.fields || []);
  }
}

function loadMigration() {
  const collections = new Map([
    ['store_security_events', new MockCollection({
      id: 'events_collection',
      name: 'store_security_events',
      fields: [{ id: 'event_type', name: 'event_type', values: ['vpn_detected', 'vpn_blocked', 'vpn_check_unavailable'] }],
    })],
    ['store_security_ip_reputation_cache', new MockCollection({
      id: 'cache_collection',
      name: 'store_security_ip_reputation_cache',
      fields: [
        { id: 'verdict', name: 'verdict', values: ['clean', 'vpn_or_proxy', 'unavailable'] },
        { id: 'vpn', name: 'is_vpn' },
        { id: 'proxy', name: 'is_proxy' },
        { id: 'tor', name: 'is_tor' },
      ],
    })],
  ]);
  const app = {
    findCollectionByNameOrId(name) {
      const found = collections.get(name);
      if (!found) throw new Error(`collection_not_found:${name}`);
      return found;
    },
    findRecordsByFilter() { return []; },
    save(value) {
      if (value instanceof MockCollection) collections.set(value.name, value);
      return value;
    },
    delete(value) { collections.delete(value.name); },
  };
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1786320000_security_free_network_intelligence.js');
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up;
  let down;
  vm.runInNewContext(source, {
    migrate(upFn, downFn) { up = upFn; down = downFn; },
    Field: MockField,
    Collection: MockCollection,
  }, { filename: migrationPath });
  return { app, collections, up, down };
}

test('FREE-NETWORK: migracion aditiva, privada, idempotente y reversible', () => {
  const migration = loadMigration();
  migration.up(migration.app);
  migration.up(migration.app);

  const events = migration.collections.get('store_security_events');
  assert.equal(events.fields.getByName('event_type').values.filter((value) => value === 'network_suspected').length, 1);

  const cache = migration.collections.get('store_security_ip_reputation_cache');
  assert.equal(cache.fields.getByName('verdict').values.filter((value) => value === 'network_suspected').length, 1);
  for (const field of ['provider', 'is_datacenter', 'is_abuser', 'is_crawler', 'is_mobile']) {
    assert.ok(cache.fields.getByName(field));
  }

  for (const name of ['security_ip_reputation_usage', 'security_tor_exit_nodes', 'security_tor_feed_state']) {
    const collection = migration.collections.get(name);
    assert.ok(collection);
    assert.equal(collection.listRule, null);
    assert.equal(collection.viewRule, null);
    assert.equal(collection.createRule, null);
    assert.equal(collection.updateRule, null);
    assert.equal(collection.deleteRule, null);
  }
  assert.ok(migration.collections.get('security_ip_reputation_usage').indexes.some((index) => index.includes('provider`, `utc_day')));
  assert.ok(migration.collections.get('security_tor_exit_nodes').indexes.some((index) => index.includes('batch_id`, `ip_address')));

  migration.down(migration.app);
  assert.equal(migration.collections.has('security_ip_reputation_usage'), false);
  assert.equal(migration.collections.has('security_tor_exit_nodes'), false);
  assert.equal(migration.collections.has('security_tor_feed_state'), false);
  assert.equal(events.fields.getByName('event_type').values.includes('network_suspected'), false);
  assert.equal(cache.fields.getByName('verdict').values.includes('network_suspected'), false);
  assert.throws(() => cache.fields.getByName('provider'), /field_not_found/);
});
