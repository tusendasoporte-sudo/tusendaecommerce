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

function fixture() {
  const events = new MockCollection({
    name: 'store_security_events',
    fields: [{ id: 'event_type', name: 'event_type', values: ['vpn_detected', 'vpn_blocked', 'network_suspected'] }],
  });
  const cache = new MockCollection({
    name: 'store_security_ip_reputation_cache',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [{ id: 'verdict', name: 'verdict', values: ['clean', 'vpn_or_proxy', 'network_suspected', 'unavailable'] }],
  });
  const collections = new Map([
    [events.name, events],
    [cache.name, cache],
  ]);
  const app = {
    findCollectionByNameOrId(name) {
      const found = collections.get(name);
      if (!found) throw new Error(`collection_not_found:${name}`);
      return found;
    },
    findRecordsByFilter() { return []; },
    save(value) { collections.set(value.name, value); return value; },
    delete() {},
  };
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1786356000_security_strict_network_abuse.js');
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up;
  let down;
  vm.runInNewContext(source, {
    migrate(upFn, downFn) { up = upFn; down = downFn; },
    Field: MockField,
  }, { filename: migrationPath });
  return { app, cache, down, events, up };
}

test('STRICT-NETWORK-MIGRATION: agrega campos privados y eventos de forma reversible', () => {
  const data = fixture();
  data.up(data.app);
  data.up(data.app);

  const eventValues = data.events.fields.getByName('event_type').values;
  ['hosting_blocked', 'abusive_ip_detected', 'abusive_ip_blocked'].forEach((eventType) => {
    assert.equal(eventValues.filter((value) => value === eventType).length, 1);
  });
  assert.equal(data.cache.fields.getByName('verdict').values.filter((value) => value === 'abusive_ip').length, 1);
  [
    'hosting_consensus',
    'provider_confidence',
    'abuse_available',
    'abuse_score',
    'abuse_total_reports',
    'abuse_distinct_users',
    'abuse_last_reported_at',
    'abuse_block_candidate',
    'classifier_version',
  ].forEach((field) => assert.ok(data.cache.fields.getByName(field)));
  assert.equal(data.cache.listRule, null);
  assert.equal(data.cache.viewRule, null);
  assert.equal(data.cache.createRule, null);
  assert.equal(data.cache.updateRule, null);
  assert.equal(data.cache.deleteRule, null);

  data.down(data.app);
  ['hosting_blocked', 'abusive_ip_detected', 'abusive_ip_blocked'].forEach((eventType) => {
    assert.equal(data.events.fields.getByName('event_type').values.includes(eventType), false);
  });
  assert.equal(data.cache.fields.getByName('verdict').values.includes('abusive_ip'), false);
  assert.throws(() => data.cache.fields.getByName('classifier_version'), /field_not_found/);
});
