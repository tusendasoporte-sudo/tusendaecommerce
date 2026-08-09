'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

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

const torFeed = require('../pb_hooks/pz_security_tor_feed_lib.js');

function fixture() {
  const collections = {
    security_tor_exit_nodes: { name: 'security_tor_exit_nodes' },
    security_tor_feed_state: { name: 'security_tor_feed_state' },
  };
  const tables = {
    security_tor_exit_nodes: [],
    security_tor_feed_state: [],
  };
  let sequence = 0;
  const app = {
    findCollectionByNameOrId(name) {
      if (!collections[name]) throw new Error(`collection_not_found:${name}`);
      return collections[name];
    },
    findFirstRecordByFilter(name, _filter, params = {}) {
      let found = null;
      if (name === 'security_tor_feed_state') {
        found = tables[name].find((row) => row.get('state_key') === params.stateKey);
      } else if (name === 'security_tor_exit_nodes') {
        found = tables[name].find((row) => row.get('batch_id') === params.batchId && row.get('ip_address') === params.ipAddress);
      }
      if (!found) throw new Error(`not_found:${name}`);
      return found;
    },
    findRecordsByFilter(name, _filter, _sort, _limit, _offset, params = {}) {
      if (name !== 'security_tor_exit_nodes') return [];
      return tables[name].filter((row) => row.get('batch_id') !== params.batchId);
    },
    save(record) {
      const name = record.collection().name;
      if (!record.id) record.id = `tor${String(++sequence).padStart(12, '0')}`;
      if (!tables[name].includes(record)) tables[name].push(record);
      return record;
    },
    delete(record) {
      const name = record.collection().name;
      tables[name] = tables[name].filter((candidate) => candidate !== record);
    },
  };
  return { app, tables };
}

function feedPayload(count) {
  const relays = [];
  for (let index = 1; index <= count; index += 1) {
    const third = Math.floor(index / 250);
    const fourth = (index % 250) + 1;
    relays.push({ exit_addresses: [`198.51.${third}.${fourth}`] });
  }
  return {
    relays_published: '2026-08-09T19:00:00.000Z',
    relays,
  };
}

test.after(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

test('TOR-FEED: normaliza IPv4 e IPv6 y elimina duplicados', () => {
  const rows = torFeed._test.parseExitAddresses({
    relays: [
      { exit_addresses: ['198.51.100.7', '2001:db8::1'] },
      { exit_addresses: ['198.51.100.007', 'invalid'] },
    ],
  });
  assert.deepEqual(rows, [
    { ip_address: '198.51.100.7', ip_family: 'ipv4' },
    { ip_address: '2001:0db8:0000:0000:0000:0000:0000:0001', ip_family: 'ipv6' },
  ]);
});

test('TOR-FEED: publica lote completo y lo consulta localmente', () => {
  const data = fixture();
  const now = new Date('2026-08-09T20:00:00.000Z');
  const result = torFeed.refresh(data.app, {
    now,
    send: (request) => {
      assert.equal(request.url, torFeed._test.constants.sourceUrl);
      assert.equal(request.method, 'GET');
      return { statusCode: 200, json: feedPayload(100) };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.count, 100);
  assert.equal(data.tables.security_tor_exit_nodes.length, 100);
  assert.equal(data.tables.security_tor_feed_state[0].get('status'), 'valid');

  const detected = torFeed.lookup(data.app, '198.51.0.2', new Date('2026-08-09T21:00:00.000Z'));
  assert.equal(detected.detected, true);
  assert.equal(detected.provider, 'tor_project_onionoo');

  const stale = torFeed.lookup(
    data.app,
    '198.51.0.2',
    new Date(now.getTime() + torFeed._test.constants.maxValidAgeMs + 1),
  );
  assert.equal(stale.detected, false);
});

test('TOR-FEED: una descarga invalida conserva el ultimo lote valido', () => {
  const data = fixture();
  const first = torFeed.refresh(data.app, {
    now: new Date('2026-08-09T20:00:00.000Z'),
    send: () => ({ statusCode: 200, json: feedPayload(100) }),
  });
  const failed = torFeed.refresh(data.app, {
    now: new Date('2026-08-10T20:00:00.000Z'),
    send: () => ({ statusCode: 200, json: { relays: [] } }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'invalid_entry_count');
  assert.equal(data.tables.security_tor_feed_state[0].get('active_batch_id'), first.batch_id);
  assert.equal(data.tables.security_tor_feed_state[0].get('status'), 'stale');
  assert.equal(torFeed.lookup(data.app, '198.51.0.2', new Date('2026-08-10T21:00:00.000Z')).detected, true);
});
