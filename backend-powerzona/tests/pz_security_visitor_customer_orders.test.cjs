'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const STORE_ID = 'visitstore00001';
const CUSTOMER_ID = 'visitcustomer01';
const VISITOR_ID = 'visitsession001';

for (const id of [STORE_ID, CUSTOMER_ID, VISITOR_ID]) assert.equal(id.length, 15);

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
