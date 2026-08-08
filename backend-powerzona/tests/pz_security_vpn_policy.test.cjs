'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const previousGlobals = {
  $security: global.$security,
  Record: global.Record,
};

global.$security = {
  sha256: (value) => crypto.createHash('sha256').update(String(value)).digest('hex'),
};

class MockRecord {
  constructor(collection, values = {}) {
    this._collection = collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
  collection() { return this._collection; }
}
global.Record = MockRecord;

const reputation = require('../pb_hooks/pz_security_ip_reputation_lib.js');

function record(collection, values) {
  return new MockRecord({ name: collection }, values);
}

function fixture(policy = 'monitor', mode = 'protection') {
  const store = record('stores', { id: 'storevpn0000001' });
  const settings = record('store_security_settings', {
    id: 'vpnsettings0001',
    store: store.id,
    enabled: true,
    mode,
    vpn_policy: policy,
  });
  const tables = {
    store_security_ip_reputation_cache: [],
    store_security_events: [],
  };
  const collections = {};
  let sequence = 0;
  const collection = (name) => {
    collections[name] = collections[name] || { name };
    return collections[name];
  };
  const app = {
    findCollectionByNameOrId(name) { return collection(name); },
    findFirstRecordByFilter(name, _filter, params = {}) {
      const rows = tables[name] || [];
      let found = null;
      if (name === 'store_security_ip_reputation_cache') {
        found = rows.find((item) => item.get('store') === params.store && item.get('ip_hmac') === params.ipHmac);
      } else if (name === 'store_security_events') {
        found = rows.find((item) => item.get('event_key') === params.eventKey);
      }
      if (!found) throw new Error(`not_found:${name}`);
      return found;
    },
    save(saved) {
      const name = saved.collection().name;
      tables[name] = tables[name] || [];
      if (!saved.id) saved.id = `vpn${String(++sequence).padStart(12, '0')}`;
      if (!tables[name].includes(saved)) tables[name].push(saved);
      return saved;
    },
  };
  return { app, settings, store, tables };
}

function signals(seed = 'a') {
  return {
    ip: seed.repeat(64),
    ipFamily: 'ipv4',
    device: 'd'.repeat(64),
  };
}

function normalizedIp(value = '8.8.8.8') {
  return { valid: true, canonical: value };
}

function loadMigrationFixture() {
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
  const collections = new Map([
    ['stores', new MockCollection({ id: 'stores_collection', name: 'stores', fields: [] })],
    ['store_security_settings', new MockCollection({
      id: 'settings_collection', name: 'store_security_settings', fields: [],
    })],
    ['store_security_events', new MockCollection({
      id: 'events_collection', name: 'store_security_events',
      fields: [{ id: 'events_type', name: 'event_type', values: ['blocked_attempt'] }],
    })],
    ['store_security_audit', new MockCollection({
      id: 'audit_collection', name: 'store_security_audit',
      fields: [{ id: 'audit_action', name: 'action', values: ['block_created'] }],
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
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1786233600_security_vpn_policy.js');
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

test.after(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

test('VPN-POLICY: solo acepta las tres banderas explicitas del proveedor', () => {
  const checkedAt = '2026-08-07T12:00:00.000Z';
  const detected = reputation._test.normalizeProviderResponse({
    is_vpn: true,
    is_proxy: false,
    is_tor: false,
    is_datacenter: true,
  }, checkedAt);
  assert.equal(detected.available, true);
  assert.equal(detected.detected, true);
  assert.equal(detected.verdict, 'vpn_or_proxy');

  const incomplete = reputation._test.normalizeProviderResponse({ is_vpn: false }, checkedAt);
  assert.equal(incomplete.available, false);
  assert.equal(incomplete.verdict, 'unavailable');
});

test('VPN-POLICY: migracion es aditiva, privada, idempotente y reversible', () => {
  const migration = loadMigrationFixture();
  migration.up(migration.app);
  migration.up(migration.app);

  const settings = migration.collections.get('store_security_settings');
  assert.deepEqual(Array.from(settings.fields.getByName('vpn_policy').values), ['off', 'monitor', 'block']);
  const events = migration.collections.get('store_security_events').fields.getByName('event_type').values;
  assert.equal(events.filter((value) => value === 'vpn_detected').length, 1);
  assert.equal(events.filter((value) => value === 'vpn_blocked').length, 1);
  assert.equal(events.filter((value) => value === 'vpn_check_unavailable').length, 1);

  const cache = migration.collections.get('store_security_ip_reputation_cache');
  assert.ok(cache);
  assert.equal(cache.listRule, null);
  assert.equal(cache.viewRule, null);
  assert.equal(cache.createRule, null);
  assert.equal(cache.updateRule, null);
  assert.equal(cache.deleteRule, null);
  assert.equal(cache.fields.getByName('store').cascadeDelete, true);
  assert.equal(cache.fields.getByName('ip_hmac').hidden, true);
  assert.ok(cache.indexes.some((index) => index.includes('(`store`, `ip_hmac`)')));

  migration.down(migration.app);
  assert.equal(migration.collections.has('store_security_ip_reputation_cache'), false);
  assert.throws(() => settings.fields.getByName('vpn_policy'), /field_not_found/);
  assert.equal(migration.collections.get('store_security_events').fields.getByName('event_type').values.includes('vpn_detected'), false);
  assert.equal(migration.collections.get('store_security_audit').fields.getByName('action').values.includes('vpn_policy_updated'), false);
});

test('VPN-POLICY: off no consulta proveedor ni crea datos', () => {
  const data = fixture('off');
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), {
    now: new Date('2026-08-07T12:00:00.000Z'),
    send: () => { calls += 1; throw new Error('must_not_run'); },
  });
  assert.equal(decision.enabled, false);
  assert.equal(decision.blocked, false);
  assert.equal(calls, 0);
  assert.equal(data.tables.store_security_ip_reputation_cache.length, 0);
  assert.equal(data.tables.store_security_events.length, 0);
});

test('VPN-POLICY: monitor detecta, cachea por HMAC y nunca conserva la IP plana', () => {
  const data = fixture('monitor');
  let calls = 0;
  const send = (request) => {
    calls += 1;
    assert.equal(request.url, 'https://api.ipapi.is');
    assert.equal(request.method, 'POST');
    assert.equal(request.timeout, 2);
    assert.deepEqual(JSON.parse(request.body), { q: '8.8.8.8' });
    return { statusCode: 200, json: { is_vpn: true, is_proxy: false, is_tor: false } };
  };
  const now = new Date('2026-08-07T12:00:00.000Z');
  const first = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), { now, send });
  const second = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), {
    now: new Date('2026-08-07T12:01:00.000Z'),
    send,
  });

  assert.equal(first.blocked, false);
  assert.equal(first.reason, 'detected');
  assert.equal(second.result.source, 'cache');
  assert.equal(calls, 1);
  assert.equal(data.tables.store_security_ip_reputation_cache.length, 1);
  assert.equal(data.tables.store_security_events.length, 1);
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'vpn_detected');
  const persisted = JSON.stringify({ cache: data.tables.store_security_ip_reputation_cache[0].values, event: data.tables.store_security_events[0].values });
  assert.doesNotMatch(persisted, /8\.8\.8\.8/);
  assert.match(data.tables.store_security_ip_reputation_cache[0].get('ip_hmac'), /^[a-z0-9]{64}$/);
});

test('VPN-POLICY: block solo bloquea una deteccion en modo proteccion', () => {
  const send = () => ({ statusCode: 200, json: { is_vpn: false, is_proxy: true, is_tor: false } });
  const protection = fixture('block', 'protection');
  const blocked = reputation.evaluate(protection.app, protection.store, protection.settings, signals(), normalizedIp(), {
    now: new Date('2026-08-07T12:00:00.000Z'), send,
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, 'vpn_or_proxy_detected');
  assert.equal(protection.tables.store_security_events[0].get('event_type'), 'vpn_blocked');

  const monitoring = fixture('block', 'monitoring');
  const observed = reputation.evaluate(monitoring.app, monitoring.store, monitoring.settings, signals(), normalizedIp(), {
    now: new Date('2026-08-07T12:00:00.000Z'), send,
  });
  assert.equal(observed.blocked, false);
  assert.equal(observed.reason, 'detected');
  assert.equal(monitoring.tables.store_security_events[0].get('event_type'), 'vpn_detected');
});

test('VPN-POLICY: proveedor no disponible falla abierto y cachea solo cinco minutos', () => {
  const data = fixture('block');
  let calls = 0;
  const send = () => { calls += 1; return { statusCode: 429, json: { error: true } }; };
  const now = new Date('2026-08-07T12:00:00.000Z');
  const first = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), { now, send });
  const second = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), {
    now: new Date('2026-08-07T12:04:00.000Z'), send,
  });
  assert.equal(first.blocked, false);
  assert.equal(first.reason, 'unavailable');
  assert.equal(second.blocked, false);
  assert.equal(second.result.source, 'cache');
  assert.equal(calls, 1);
  assert.equal(data.tables.store_security_events.length, 1);
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'vpn_check_unavailable');
  const expiresAt = Date.parse(data.tables.store_security_ip_reputation_cache[0].get('expires_at'));
  assert.equal(expiresAt - now.getTime(), reputation._test.constants.unavailableTtlMs);
});

test('VPN-POLICY: la cache queda aislada por tienda aunque coincida el HMAC', () => {
  const data = fixture('monitor');
  let calls = 0;
  const send = () => {
    calls += 1;
    return { statusCode: 200, json: { is_vpn: false, is_proxy: false, is_tor: false } };
  };
  const now = new Date('2026-08-07T12:00:00.000Z');
  reputation._test.lookup(data.app, data.store.id, '8.8.8.8', 'a'.repeat(64), { now, send });
  reputation._test.lookup(data.app, 'storevpn0000002', '8.8.8.8', 'a'.repeat(64), { now, send });
  assert.equal(calls, 2);
  assert.equal(data.tables.store_security_ip_reputation_cache.length, 2);
  assert.deepEqual(data.tables.store_security_ip_reputation_cache.map((row) => row.get('store')).sort(), [
    'storevpn0000001',
    'storevpn0000002',
  ]);
});
