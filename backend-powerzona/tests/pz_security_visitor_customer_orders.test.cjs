'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const STORE_ID = 'visitstore00001';
const CUSTOMER_ID = 'visitcustomer01';
const VISITOR_ID = 'visitsession001';
const BLOCK_ID = 'activeblock0001';

for (const id of [STORE_ID, CUSTOMER_ID, VISITOR_ID, BLOCK_ID]) assert.equal(id.length, 15);

const previousGlobals = {
  __hooks: global.__hooks,
  $os: global.$os,
  $security: global.$security,
  Record: global.Record,
};

global.__hooks = path.resolve(__dirname, '../pb_hooks').replace(/\\/g, '/');
global.$os = { getenv: () => '' };
global.$security = { sha256: () => '', hs256: () => '' };

class MockRecord {
  constructor(values) {
    this.values = { ...values };
    this.id = String(values.id || '');
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  getBool(key) { return this.get(key) === true; }
}

global.Record = MockRecord;

const monitoring = require('../pb_hooks/pz_security_monitoring_lib.js');

test.after(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

function order(index, overrides = {}) {
  return new MockRecord({
    id: `visitorder${String(index).padStart(5, '0')}`,
    store: STORE_ID,
    customer: CUSTOMER_ID,
    order_number: `PZ-${1000 + index}`,
    status: index % 2 === 0 ? 'confirmed' : 'delivered',
    total: index,
    usd_total: index * 2,
    delivery_method: 'delivery',
    created: `2026-08-${String(20 - index).padStart(2, '0')} 12:00:00.000Z`,
    ...overrides,
  });
}

function fixture() {
  const rows = [1, 2, 3, 4, 5, 6].map((index) => order(index));
  rows.push(order(7, { id: 'otherorder00001', store: 'otherstore00001' }));
  return {
    findRecordsByFilter(name, _filter, _sort, limit, offset, params) {
      assert.equal(name, 'orders');
      const filtered = rows.filter((item) => item.get('store') === params.store && item.get('customer') === params.customer);
      return filtered.slice(offset, offset + limit);
    },
  };
}

test('VISITOR-ORDERS: detalle exige pagina independiente de pedidos', () => {
  const parsed = monitoring._test.parseVisitorDetailPayload({
    store_id: STORE_ID,
    visitor_session_id: VISITOR_ID,
    page: 1,
    orders_page: 2,
  });

  assert.deepEqual(parsed, {
    storeId: STORE_ID,
    visitorSessionId: VISITOR_ID,
    page: 1,
    ordersPage: 2,
  });
  assert.equal(monitoring._test.parseVisitorDetailPayload({
    store_id: STORE_ID,
    visitor_session_id: VISITOR_ID,
    page: 1,
  }), null);
});

test('VISITOR-ORDERS: pagina de pedidos contiene maximo cinco y queda aislada por tienda', () => {
  assert.equal(monitoring._test.visitorCustomerOrdersPerPage, 5);
  const first = monitoring._test.buildVisitorCustomerOrdersDetail(fixture(), STORE_ID, CUSTOMER_ID, 1);
  const second = monitoring._test.buildVisitorCustomerOrdersDetail(fixture(), STORE_ID, CUSTOMER_ID, 2);

  assert.equal(first.perPage, 5);
  assert.equal(first.totalItems, 6);
  assert.equal(first.totalPages, 2);
  assert.equal(first.items.length, 5);
  assert.equal(second.page, 2);
  assert.equal(second.items.length, 1);
  assert.equal(second.items[0].order_number, 'PZ-1006');
});

test('VISITOR-VPN: detalle relaciona la deteccion por dispositivo y no por IP compartida', () => {
  const browserTokenHmac = 'v'.repeat(43);
  const visitor = new MockRecord({ id: VISITOR_ID, browser_token_hmac: browserTokenHmac });
  const app = {
    findRecordsByFilter(name, filter, sort, limit, offset, params) {
      assert.equal(name, 'store_security_events');
      assert.match(filter, /browser_token_hmac = \{:browserTokenHmac\}/);
      assert.doesNotMatch(filter, /ip_hmac|ip_masked|resolved_ip/);
      assert.equal(sort, '-occurred_at,-created');
      assert.equal(limit, 50);
      assert.equal(offset, 0);
      assert.equal(params.store, STORE_ID);
      assert.equal(params.browserTokenHmac, browserTokenHmac);
      return [
        new MockRecord({
          event_type: 'vpn_check_unavailable',
          decision: 'monitored',
          risk_level: 'observation',
          occurred_at: '2026-08-08 18:00:00.000Z',
        }),
        new MockRecord({
          event_type: 'vpn_blocked',
          decision: 'blocked',
          risk_level: 'blocked',
          occurred_at: '2026-08-08 17:00:00.000Z',
        }),
      ];
    },
  };

  assert.deepEqual(monitoring._test.buildVisitorVpnInfo(app, STORE_ID, visitor), {
    status: 'blocked',
    event_type: 'vpn_blocked',
    decision: 'blocked',
    risk_level: 'blocked',
    observed_at: '2026-08-08 17:00:00.000Z',
  });

  assert.deepEqual(
    monitoring._test.buildVisitorVpnInfo(app, STORE_ID, new MockRecord({ id: VISITOR_ID })),
    { status: 'none', event_type: '', decision: '', risk_level: '', observed_at: '' },
  );
});

test('VISITOR-VPN-IP: cada IP conserva solo su estado seguro sin exponer la huella protegida', () => {
  const firstIpHmac = 'a'.repeat(64);
  const currentIpHmac = 'b'.repeat(64);
  const outsiderIpHmac = 'c'.repeat(64);
  const visitor = new MockRecord({ id: VISITOR_ID, latest_ip_hmac: currentIpHmac });
  const sources = [
    { capture: { ip_hmac: firstIpHmac } },
    { capture: { ip_hmac: currentIpHmac } },
  ];
  const events = [
    new MockRecord({ event_type: 'vpn_check_unavailable', ip_hmac: firstIpHmac, occurred_at: '2026-08-08 19:00:00.000Z' }),
    new MockRecord({ event_type: 'vpn_blocked', ip_hmac: firstIpHmac, occurred_at: '2026-08-08 18:00:00.000Z' }),
    new MockRecord({ event_type: 'vpn_check_unavailable', ip_hmac: currentIpHmac, occurred_at: '2026-08-08 17:00:00.000Z' }),
    new MockRecord({ event_type: 'vpn_detected', ip_hmac: outsiderIpHmac, occurred_at: '2026-08-08 16:00:00.000Z' }),
  ];

  const state = monitoring._test.buildVisitorNetworkState(visitor, sources, events);

  assert.deepEqual(state.summary, {
    ip_count: 2,
    vpn_ip_count: 1,
    unavailable_ip_count: 1,
    current_ip_status: 'unavailable',
    current_ip_observed_at: '2026-08-08 17:00:00.000Z',
  });
  assert.equal(state.statusByIpHmac[firstIpHmac].status, 'blocked');
  assert.equal(state.statusByIpHmac[currentIpHmac].status, 'unavailable');
  assert.equal(state.statusByIpHmac[outsiderIpHmac], undefined);
  assert.doesNotMatch(JSON.stringify(state.summary), /a{32}|b{32}|c{32}/);
});

test('VISITOR-STATUS: prioriza bloqueos activos y usa observacion solo para senales que requieren atencion', () => {
  const now = new Date('2026-08-08T20:00:00.000Z');
  const visitor = new MockRecord({
    id: VISITOR_ID,
    browser_token_hmac: 'd'.repeat(64),
    latest_ip_hmac: 'i'.repeat(64),
  });
  const vpnNone = { status: 'none' };
  const activeIpBlock = new MockRecord({
    status: 'active',
    starts_at: '2026-08-08T19:00:00.000Z',
    expires_at: '2026-08-09T19:00:00.000Z',
    match_phone: false,
    match_device: false,
    match_ip: true,
    match_mode: 'any',
    ip_hmac_values: ['i'.repeat(64)],
    device_hmac_values: [],
  });
  const expiredIpBlock = new MockRecord({
    ...activeIpBlock.values,
    expires_at: '2026-08-08T19:30:00.000Z',
  });
  const incompleteAllBlock = new MockRecord({
    ...activeIpBlock.values,
    match_phone: true,
    match_mode: 'all',
  });

  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, vpnNone, [], now), 'normal');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, { status: 'watch' }, vpnNone, [], now), 'watch');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, { status: 'detected' }, [], now), 'watch');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, { status: 'unavailable' }, [], now), 'watch');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, { status: 'blocked' }, [], now), 'blocked');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, { status: 'blocked' }, vpnNone, [], now), 'blocked');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, vpnNone, [activeIpBlock], now), 'blocked');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, vpnNone, [expiredIpBlock], now), 'normal');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, vpnNone, [incompleteAllBlock], now), 'normal');
});

test('ACTIVITY-ACTION: prioriza el bloqueo activo y usa historial solo con una sesion verificable', () => {
  const browserTokenHmac = 'h'.repeat(64);
  const event = new MockRecord({
    id: 'activityevent01',
    customer: CUSTOMER_ID,
    browser_token_hmac: browserTokenHmac,
    occurred_at: '2026-08-08 18:00:00.000Z',
  });
  const activeBlock = new MockRecord({
    id: BLOCK_ID,
    store: STORE_ID,
    customer: CUSTOMER_ID,
    status: 'active',
    starts_at: '2026-08-08 16:00:00.000Z',
    expires_at: '2026-08-09 16:00:00.000Z',
    revoked_at: '',
  });
  const expiredBlock = new MockRecord({
    ...activeBlock.values,
    expires_at: '2026-08-08 17:00:00.000Z',
  });
  const visitor = new MockRecord({
    id: VISITOR_ID,
    store: STORE_ID,
    day: '2026-08-08',
    browser_token_hmac: browserTokenHmac,
    first_seen_at: '2026-08-08 17:59:00.000Z',
    last_seen_at: '2026-08-08 18:01:00.000Z',
  });
  let block = activeBlock;
  const app = {
    findCollectionByNameOrId() { return {}; },
    findRecordsByFilter(name, filter, _sort, _limit, _offset, params) {
      if (name === 'store_security_blocks') {
        assert.match(filter, /customer = \{:customer\}/);
        assert.equal(params.customer, CUSTOMER_ID);
        return block ? [block] : [];
      }
      if (name === 'store_visitor_sessions') {
        assert.match(filter, /browser_token_hmac = \{:browserTokenHmac\}/);
        assert.equal(params.browserTokenHmac, browserTokenHmac);
        return [visitor];
      }
      return [];
    },
  };

  assert.deepEqual(
    monitoring._test.buildActivityNavigation(app, STORE_ID, event, new Date('2026-08-08T18:30:00.000Z')),
    { kind: 'block', target_id: BLOCK_ID },
  );

  block = expiredBlock;
  assert.deepEqual(
    monitoring._test.buildActivityNavigation(app, STORE_ID, event, new Date('2026-08-08T18:30:00.000Z')),
    { kind: 'visitor', target_id: VISITOR_ID },
  );

  const noIdentityEvent = new MockRecord({ id: 'activityevent02', occurred_at: '2026-08-08 18:00:00.000Z' });
  assert.deepEqual(
    monitoring._test.buildActivityNavigation(app, STORE_ID, noIdentityEvent),
    { kind: 'none', target_id: '' },
  );
});
