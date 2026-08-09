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
    security_ip_reputation_usage: [],
    security_tor_exit_nodes: [],
    security_tor_feed_state: [],
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
      } else if (name === 'security_ip_reputation_usage') {
        found = rows.find((item) => item.get('provider') === params.provider && item.get('utc_day') === params.utcDay);
      } else if (name === 'security_tor_feed_state') {
        found = rows.find((item) => item.get('state_key') === params.stateKey);
      } else if (name === 'security_tor_exit_nodes') {
        found = rows.find((item) => item.get('batch_id') === params.batchId && item.get('ip_address') === params.ipAddress);
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

test('VPN-POLICY: red contextual queda en observacion y nunca bloquea', () => {
  const data = fixture('block', 'protection');
  const apiKey = 'free-api-key-for-tests';
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), {
    now: new Date('2026-08-09T18:00:00.000Z'),
    apiKey,
    send: (request) => {
      assert.deepEqual(JSON.parse(request.body), { q: '8.8.8.8', key: apiKey });
      return {
        statusCode: 200,
        json: {
          is_vpn: false,
          is_proxy: false,
          is_tor: false,
          is_datacenter: true,
          is_abuser: false,
          is_crawler: false,
          is_mobile: false,
        },
      };
    },
  });

  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'network_suspected');
  assert.equal(decision.result.detected, false);
  assert.equal(decision.result.suspected, true);
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'network_suspected');
  const persisted = JSON.stringify(data.tables);
  assert.doesNotMatch(persisted, new RegExp(apiKey));
});

test('VPN-POLICY: crawler de datacenter no se presenta como red sospechosa', () => {
  const result = reputation._test.normalizeProviderResponse({
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_datacenter: true,
    is_abuser: false,
    is_crawler: true,
  }, '2026-08-09T18:00:00.000Z');
  assert.equal(result.verdict, 'clean');
  assert.equal(result.suspected, false);
});

test('VPN-POLICY: proxycheck exige confianza alta para confirmar VPN proxy o Tor', () => {
  const checkedAt = '2026-08-09T18:00:00.000Z';
  const highConfidence = reputation._test.normalizeProxycheckResponse({
    status: 'ok',
    '8.8.8.8': {
      network: { type: 'Hosting' },
      detections: {
        vpn: true,
        proxy: false,
        tor: false,
        hosting: true,
        compromised: false,
        scraper: false,
        confidence: 96,
      },
    },
  }, '8.8.8.8', checkedAt);
  assert.equal(highConfidence.available, true);
  assert.equal(highConfidence.detected, true);
  assert.equal(highConfidence.is_vpn, true);
  assert.equal(highConfidence.confidence, 96);

  const lowConfidence = reputation._test.normalizeProxycheckResponse({
    status: 'ok',
    '8.8.8.8': {
      network: { type: 'Hosting' },
      detections: {
        vpn: false,
        proxy: true,
        tor: false,
        hosting: true,
        compromised: false,
        scraper: false,
        confidence: 82,
      },
    },
  }, '8.8.8.8', checkedAt);
  assert.equal(lowConfidence.available, true);
  assert.equal(lowConfidence.detected, false);
  assert.equal(lowConfidence.suspected, true);
  assert.equal(lowConfidence.is_proxy, false);
  assert.equal(lowConfidence.verdict, 'network_suspected');
});

test('STRICT-NETWORK: AbuseIPDB bloquea desde 25 solo con un reporte reciente', () => {
  const checkedAt = '2026-08-09T18:00:00.000Z';
  const below = reputation._test.normalizeAbuseIpDbResponse({
    data: {
      ipAddress: '8.8.8.8',
      abuseConfidenceScore: 24,
      totalReports: 3,
      numDistinctUsers: 2,
      lastReportedAt: '2026-08-08T12:00:00.000Z',
      isTor: false,
    },
  }, '8.8.8.8', checkedAt);
  assert.equal(below.available, true);
  assert.equal(below.abuse_block_candidate, false);
  assert.equal(below.verdict, 'clean');

  const threshold = reputation._test.normalizeAbuseIpDbResponse({
    data: {
      ipAddress: '8.8.8.8',
      abuseConfidenceScore: 25,
      totalReports: 1,
      numDistinctUsers: 1,
      lastReportedAt: '2026-08-08T12:00:00.000Z',
      isTor: false,
    },
  }, '8.8.8.8', checkedAt);
  assert.equal(threshold.available, true);
  assert.equal(threshold.abusive, true);
  assert.equal(threshold.abuse_block_candidate, true);
  assert.equal(threshold.verdict, 'abusive_ip');

  const noRecentReport = reputation._test.normalizeAbuseIpDbResponse({
    data: {
      ipAddress: '8.8.8.8',
      abuseConfidenceScore: 100,
      totalReports: 0,
      numDistinctUsers: 0,
      lastReportedAt: null,
      isTor: false,
    },
  }, '8.8.8.8', checkedAt);
  assert.equal(noRecentReport.abuse_block_candidate, false);

  const staleReport = reputation._test.normalizeAbuseIpDbResponse({
    data: {
      ipAddress: '8.8.8.8',
      abuseConfidenceScore: 100,
      totalReports: 9,
      numDistinctUsers: 4,
      lastReportedAt: '2026-06-01T12:00:00.000Z',
      isTor: false,
    },
  }, '8.8.8.8', checkedAt);
  assert.equal(staleReport.abuse_block_candidate, false);
});

test('STRICT-NETWORK: consulta AbuseIPDB sin verbose y nunca coloca la clave en la URL', () => {
  const apiKey = 'abuseipdb-free-key-for-tests';
  const result = reputation._test.sendAbuseIpDbRequest('8.8.8.8', (request) => {
    assert.equal(request.method, 'GET');
    assert.equal(request.timeout, 2);
    assert.match(request.url, /^https:\/\/api\.abuseipdb\.com\/api\/v2\/check\?/);
    assert.match(request.url, /ipAddress=8\.8\.8\.8/);
    assert.match(request.url, /maxAgeInDays=30/);
    assert.doesNotMatch(request.url, /verbose|abuseipdb-free-key-for-tests/);
    assert.equal(request.headers.key, apiKey);
    return {
      statusCode: 200,
      json: {
        data: {
          ipAddress: '8.8.8.8',
          abuseConfidenceScore: 25,
          totalReports: 1,
          numDistinctUsers: 1,
          lastReportedAt: '2026-08-08T12:00:00.000Z',
          isTor: false,
        },
      },
    };
  }, { apiKey });
  assert.equal(result.abuse_block_candidate, true);
});

test('VPN-POLICY: proxycheck complementa un resultado limpio de ipapi y conserva la cache', () => {
  const data = fixture('block', 'protection');
  const ipapiKey = 'ipapi-free-key-for-tests';
  const proxycheckKey = 'proxycheck-free-key-for-tests';
  let calls = 0;
  const send = (request) => {
    calls += 1;
    if (request.url === 'https://api.ipapi.is') {
      assert.deepEqual(JSON.parse(request.body), { q: '8.8.8.8', key: ipapiKey });
      return {
        statusCode: 200,
        json: { is_vpn: false, is_proxy: false, is_tor: false, is_datacenter: false },
      };
    }
    assert.equal(request.method, 'GET');
    assert.equal(request.timeout, 2);
    assert.match(request.url, /^https:\/\/proxycheck\.io\/v3\/8\.8\.8\.8\?/);
    assert.match(request.url, /tag=0/);
    assert.match(request.url, /p=0/);
    assert.match(request.url, /ver=24-June-2026/);
    return {
      statusCode: 200,
      json: {
        status: 'ok',
        '8.8.8.8': {
          network: { type: 'Hosting' },
          detections: {
            vpn: true,
            proxy: false,
            tor: false,
            hosting: true,
            compromised: false,
            scraper: false,
            confidence: 97,
          },
        },
      },
    };
  };
  const first = reputation.evaluate(data.app, data.store, data.settings, signals('e'), normalizedIp(), {
    now: new Date('2026-08-09T20:00:00.000Z'),
    apiKey: ipapiKey,
    proxycheckApiKey: proxycheckKey,
    send,
  });
  const second = reputation.evaluate(data.app, data.store, data.settings, signals('e'), normalizedIp(), {
    now: new Date('2026-08-09T20:01:00.000Z'),
    apiKey: ipapiKey,
    proxycheckApiKey: proxycheckKey,
    send: () => { throw new Error('must_use_cache'); },
  });

  assert.equal(first.blocked, true);
  assert.equal(first.result.is_vpn, true);
  assert.equal(first.result.provider, 'ipapi_is:proxycheck_io');
  assert.equal(second.blocked, true);
  assert.equal(second.result.source, 'cache');
  assert.equal(calls, 2);
  assert.deepEqual(data.tables.security_ip_reputation_usage.map((row) => row.get('provider')).sort(), [
    'ipapi_is',
    'proxycheck_io',
  ]);
  assert.equal(data.tables.store_security_events[0].get('metadata_json').provider_confidence, 97);
  const persisted = JSON.stringify(data.tables);
  assert.doesNotMatch(persisted, new RegExp(ipapiKey));
  assert.doesNotMatch(persisted, new RegExp(proxycheckKey));
});

test('VPN-POLICY: proxycheck con confianza baja solo genera sospecha y nunca bloquea', () => {
  const data = fixture('block', 'protection');
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('f'), normalizedIp(), {
    now: new Date('2026-08-09T20:00:00.000Z'),
    proxycheckApiKey: 'proxycheck-free-key-for-tests',
    send: (request) => {
      if (request.url === 'https://api.ipapi.is') {
        return { statusCode: 200, json: { is_vpn: false, is_proxy: false, is_tor: false } };
      }
      return {
        statusCode: 200,
        json: {
          status: 'ok',
          '8.8.8.8': {
            network: { type: 'Hosting' },
            detections: {
              vpn: false,
              proxy: true,
              tor: false,
              hosting: true,
              compromised: false,
              scraper: false,
              confidence: 75,
            },
          },
        },
      };
    },
  });
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'network_suspected');
  assert.equal(decision.result.detected, false);
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'network_suspected');
});

test('STRICT-NETWORK: umbral AbuseIPDB 25 bloquea y conserva metadatos sin secretos', () => {
  const data = fixture('block', 'protection');
  const abuseKey = 'abuseipdb-free-key-for-tests';
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('i'), normalizedIp(), {
    now: new Date('2026-08-09T21:00:00.000Z'),
    abuseIpDbApiKey: abuseKey,
    send: (request) => {
      calls += 1;
      if (request.url === 'https://api.ipapi.is') {
        return { statusCode: 200, json: { is_vpn: false, is_proxy: false, is_tor: false } };
      }
      assert.match(request.url, /^https:\/\/api\.abuseipdb\.com\/api\/v2\/check\?/);
      assert.equal(request.headers.key, abuseKey);
      return {
        statusCode: 200,
        json: {
          data: {
            ipAddress: '8.8.8.8',
            abuseConfidenceScore: 25,
            totalReports: 1,
            numDistinctUsers: 1,
            lastReportedAt: '2026-08-09T20:00:00.000Z',
            isTor: false,
          },
        },
      };
    },
  });

  assert.equal(calls, 2);
  assert.equal(decision.blocked, true);
  assert.equal(decision.reason, 'abusive_ip_detected');
  assert.equal(decision.result.verdict, 'abusive_ip');
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'abusive_ip_blocked');
  assert.equal(data.tables.store_security_events[0].get('metadata_json').abuse_score, 25);
  assert.equal(data.tables.store_security_events[0].get('metadata_json').block_reason, 'abusive_ip_detected');
  assert.equal(data.tables.store_security_ip_reputation_cache[0].get('classifier_version'), reputation._test.constants.classifierVersion);
  assert.equal(data.tables.store_security_ip_reputation_cache[0].get('abuse_score'), 25);
  assert.doesNotMatch(JSON.stringify(data.tables), new RegExp(abuseKey));
});

test('STRICT-NETWORK: modo monitor registra IP abusiva pero nunca bloquea', () => {
  const data = fixture('monitor', 'protection');
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('j'), normalizedIp(), {
    now: new Date('2026-08-09T21:00:00.000Z'),
    abuseIpDbApiKey: 'abuseipdb-free-key-for-tests',
    send: (request) => request.url === 'https://api.ipapi.is'
      ? { statusCode: 200, json: { is_vpn: false, is_proxy: false, is_tor: false } }
      : {
        statusCode: 200,
        json: {
          data: {
            ipAddress: '8.8.8.8',
            abuseConfidenceScore: 80,
            totalReports: 8,
            numDistinctUsers: 4,
            lastReportedAt: '2026-08-09T20:00:00.000Z',
            isTor: false,
          },
        },
      },
  });
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'abusive_ip_detected');
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'abusive_ip_detected');
  assert.equal(data.tables.store_security_events[0].get('decision'), 'monitored');
});

test('STRICT-NETWORK: consenso ipapi datacenter y proxycheck hosting bloquea sin llamarlo VPN', () => {
  const data = fixture('block', 'protection');
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('k'), normalizedIp(), {
    now: new Date('2026-08-09T21:00:00.000Z'),
    proxycheckApiKey: 'proxycheck-free-key-for-tests',
    send: (request) => {
      calls += 1;
      if (request.url === 'https://api.ipapi.is') {
        return {
          statusCode: 200,
          json: {
            is_vpn: false,
            is_proxy: false,
            is_tor: false,
            is_datacenter: true,
            is_crawler: false,
            is_mobile: false,
          },
        };
      }
      return {
        statusCode: 200,
        json: {
          status: 'ok',
          '8.8.8.8': {
            network: { type: 'Hosting' },
            detections: {
              vpn: false,
              proxy: false,
              tor: false,
              hosting: true,
              compromised: false,
              scraper: false,
              confidence: 100,
            },
          },
        },
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(decision.blocked, true);
  assert.equal(decision.reason, 'hosting_datacenter_detected');
  assert.equal(decision.result.detected, false);
  assert.equal(decision.result.hosting_consensus, true);
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'hosting_blocked');
});

test('STRICT-NETWORK: una VPN confirmada evita la consulta adicional de abuso', () => {
  const data = fixture('block', 'protection');
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('l'), normalizedIp(), {
    now: new Date('2026-08-09T21:00:00.000Z'),
    abuseIpDbApiKey: 'abuseipdb-free-key-for-tests',
    send: () => {
      calls += 1;
      return { statusCode: 200, json: { is_vpn: true, is_proxy: false, is_tor: false } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(decision.blocked, true);
  assert.equal(decision.reason, 'vpn_or_proxy_detected');
  assert.equal(decision.result.provider, 'ipapi_is');
});

test('STRICT-NETWORK: una red movil evita AbuseIPDB y nunca se bloquea por abuso compartido', () => {
  const data = fixture('block', 'protection');
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('n'), normalizedIp(), {
    now: new Date('2026-08-09T21:00:00.000Z'),
    abuseIpDbApiKey: 'abuseipdb-free-key-for-tests',
    send: (request) => {
      calls += 1;
      assert.equal(request.url, 'https://api.ipapi.is');
      return {
        statusCode: 200,
        json: {
          is_vpn: false,
          is_proxy: false,
          is_tor: false,
          is_mobile: true,
        },
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'clean');
  assert.equal(decision.result.is_mobile, true);
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
  const ipCapture = {
    ip_hmac: 'a'.repeat(64),
    ip_masked: '8.8.8.xxx',
    ip_encrypted: 'ciphertext:v1',
    ip_family: 'ipv4',
    capture_status: 'complete',
  };
  const first = reputation.evaluate(data.app, data.store, data.settings, signals(), normalizedIp(), { now, send, ipCapture });
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
  assert.equal(data.tables.store_security_events[0].get('ip_masked'), '8.8.8.xxx');
  assert.equal(data.tables.store_security_events[0].get('ip_encrypted'), 'ciphertext:v1');
  assert.equal(data.tables.store_security_events[0].get('capture_status'), 'complete');
  const persisted = JSON.stringify({ cache: data.tables.store_security_ip_reputation_cache[0].values, event: data.tables.store_security_events[0].values });
  assert.doesNotMatch(persisted, /8\.8\.8\.8/);
  assert.match(data.tables.store_security_ip_reputation_cache[0].get('ip_hmac'), /^[a-z0-9]{64}$/);
});

test('VPN-POLICY: la misma IP registra una observacion por navegador sin repetir proveedores', () => {
  const data = fixture('monitor');
  let calls = 0;
  const send = () => {
    calls += 1;
    return {
      statusCode: 200,
      json: {
        is_vpn: false,
        is_proxy: false,
        is_tor: false,
        is_datacenter: true,
        is_abuser: false,
        is_crawler: false,
      },
    };
  };
  const sharedIpSignals = signals('h');
  const firstBrowser = { ...sharedIpSignals, device: '1'.repeat(64) };
  const secondBrowser = { ...sharedIpSignals, device: '2'.repeat(64) };
  const now = new Date('2026-08-09T21:20:00.000Z');

  const first = reputation.evaluate(data.app, data.store, data.settings, firstBrowser, normalizedIp(), { now, send });
  const second = reputation.evaluate(data.app, data.store, data.settings, secondBrowser, normalizedIp(), {
    now: new Date('2026-08-09T21:21:00.000Z'),
    send,
  });
  reputation.evaluate(data.app, data.store, data.settings, secondBrowser, normalizedIp(), {
    now: new Date('2026-08-09T21:22:00.000Z'),
    send,
  });

  assert.equal(first.reason, 'network_suspected');
  assert.equal(second.reason, 'network_suspected');
  assert.equal(second.result.source, 'cache');
  assert.equal(calls, 1);
  assert.equal(data.tables.store_security_ip_reputation_cache.length, 1);
  assert.equal(data.tables.store_security_events.length, 2);
  assert.equal(new Set(data.tables.store_security_events.map((event) => event.get('event_key'))).size, 2);
  assert.deepEqual(data.tables.store_security_events.map((event) => event.get('browser_token_hmac')).sort(), [
    '1'.repeat(64),
    '2'.repeat(64),
  ]);
  assert.ok(data.tables.store_security_events.every((event) => event.get('event_type') === 'network_suspected'));
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

test('VPN-POLICY: presupuesto anonimo reserva 90 consultas y luego falla abierto', () => {
  const data = fixture('monitor');
  data.tables.security_ip_reputation_usage.push(record('security_ip_reputation_usage', {
    provider: 'ipapi_is',
    utc_day: '2026-08-09',
    requests: reputation._test.constants.anonymousDailyBudget,
  }));
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('b'), normalizedIp('1.1.1.1'), {
    now: new Date('2026-08-09T20:00:00.000Z'),
    send: () => { calls += 1; return { statusCode: 200, json: {} }; },
  });
  assert.equal(calls, 0);
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'unavailable');
  assert.equal(decision.result.source, 'budget');
});

test('VPN-POLICY: presupuesto proxycheck de 300 conserva el resultado valido de ipapi', () => {
  const data = fixture('block', 'protection');
  data.tables.security_ip_reputation_usage.push(record('security_ip_reputation_usage', {
    provider: reputation._test.constants.proxycheckProviderName,
    utc_day: '2026-08-09',
    requests: reputation._test.constants.proxycheckDailyBudget,
  }));
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('g'), normalizedIp(), {
    now: new Date('2026-08-09T20:00:00.000Z'),
    proxycheckApiKey: 'proxycheck-free-key-for-tests',
    send: (request) => {
      calls += 1;
      assert.equal(request.url, 'https://api.ipapi.is');
      return { statusCode: 200, json: { is_vpn: false, is_proxy: false, is_tor: false } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'clean');
  assert.equal(decision.result.available, true);
  assert.equal(decision.result.provider, 'ipapi_is:proxycheck_io');
});

test('STRICT-NETWORK: presupuesto AbuseIPDB de 800 conserva el resultado de red y falla abierto', () => {
  const data = fixture('block', 'protection');
  data.tables.security_ip_reputation_usage.push(record('security_ip_reputation_usage', {
    provider: reputation._test.constants.abuseIpDbProviderName,
    utc_day: '2026-08-09',
    requests: reputation._test.constants.abuseIpDbDailyBudget,
  }));
  let calls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('m'), normalizedIp(), {
    now: new Date('2026-08-09T21:00:00.000Z'),
    abuseIpDbApiKey: 'abuseipdb-free-key-for-tests',
    send: (request) => {
      calls += 1;
      assert.equal(request.url, 'https://api.ipapi.is');
      return { statusCode: 200, json: { is_vpn: false, is_proxy: false, is_tor: false } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, 'clean');
  assert.equal(decision.result.available, true);
  assert.equal(decision.result.abuse_available, false);
  assert.equal(decision.result.provider, 'ipapi_is:abuseipdb');
});

test('VPN-POLICY: sin contador de cuota no llama al proveedor ni bloquea', () => {
  const reservation = reputation._test.reserveProviderRequest({
    findCollectionByNameOrId() { throw new Error('collection_unavailable'); },
  }, new Date('2026-08-09T20:00:00.000Z'), true);
  assert.deepEqual(reservation, {
    allowed: false,
    tracked: false,
    limit: reputation._test.constants.authenticatedDailyBudget,
    used: 0,
  });
});

test('VPN-POLICY: Tor local se resuelve antes del proveedor y conserva bloqueo explicito', () => {
  const data = fixture('block', 'protection');
  let providerCalls = 0;
  const decision = reputation.evaluate(data.app, data.store, data.settings, signals('c'), normalizedIp('203.0.113.9'), {
    now: new Date('2026-08-09T20:00:00.000Z'),
    lookupTor: () => ({
      detected: true,
      provider: 'tor_project_onionoo',
      checked_at: '2026-08-09T19:30:00.000Z',
    }),
    send: () => { providerCalls += 1; throw new Error('must_not_run'); },
  });
  assert.equal(providerCalls, 0);
  assert.equal(decision.blocked, true);
  assert.equal(decision.result.is_tor, true);
  assert.equal(decision.result.provider, 'tor_project_onionoo');
  assert.equal(data.tables.store_security_events[0].get('event_type'), 'vpn_blocked');
});
