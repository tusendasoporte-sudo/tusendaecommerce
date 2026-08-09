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
    range: 'today',
    fullHistory: false,
    networkPage: 1,
  });
  assert.equal(monitoring._test.parseVisitorDetailPayload({
    store_id: STORE_ID,
    visitor_session_id: VISITOR_ID,
    page: 1,
  }), null);
});

test('VISITOR-HISTORY: acepta el historial completo con paginacion de red estricta', () => {
  assert.deepEqual(monitoring._test.parseVisitorDetailPayload({
    store_id: STORE_ID,
    visitor_session_id: VISITOR_ID,
    page: 2,
    orders_page: 3,
    range: 'days_7',
    full_history: true,
    network_page: 4,
  }), {
    storeId: STORE_ID,
    visitorSessionId: VISITOR_ID,
    page: 2,
    ordersPage: 3,
    range: 'days_7',
    fullHistory: true,
    networkPage: 4,
  });

  assert.equal(monitoring._test.parseVisitorDetailPayload({
    store_id: STORE_ID,
    visitor_session_id: VISITOR_ID,
    page: 1,
    orders_page: 1,
    range: 'today',
    full_history: 'true',
    network_page: 1,
  }), null);
});

test('VISITOR-RANGE: acepta solo hoy, 7 dias o 30 dias y calcula ventanas inclusivas', () => {
  assert.deepEqual(monitoring._test.parseVisitorsPagePayload({
    store_id: STORE_ID,
    page: 2,
    range: 'days_7',
  }), {
    storeId: STORE_ID,
    page: 2,
    range: 'days_7',
    legacyDay: '',
  });
  assert.equal(monitoring._test.normalizeVisitorRange('invalid'), 'today');
  assert.equal(monitoring._test.visitorRangeCutoffDay('2026-08-09', 'today'), '2026-08-09');
  assert.equal(monitoring._test.visitorRangeCutoffDay('2026-08-09', 'days_7'), '2026-08-03');
  assert.equal(monitoring._test.visitorRangeCutoffDay('2026-08-09', 'days_30'), '2026-07-11');
});

test('VISITOR-RANGE: agrupa el mismo dispositivo entre dias y suma su actividad', () => {
  const sharedDevice = 's'.repeat(64);
  const sessions = [
    new MockRecord({
      id: VISITOR_ID,
      store: STORE_ID,
      day: '2026-08-08',
      browser_token_hmac: sharedDevice,
      first_seen_at: '2026-08-08 10:00:00.000Z',
      last_seen_at: '2026-08-08 10:15:00.000Z',
      entry_path: '/t/powerzona',
      last_path: '/t/powerzona/producto/a',
      pageviews_count: 2,
    }),
    new MockRecord({
      id: 'visitsession002',
      store: STORE_ID,
      day: '2026-08-09',
      browser_token_hmac: sharedDevice,
      first_seen_at: '2026-08-09 11:00:00.000Z',
      last_seen_at: '2026-08-09 11:30:00.000Z',
      entry_path: '/t/powerzona',
      last_path: '/t/powerzona/checkout',
      pageviews_count: 4,
    }),
    new MockRecord({
      id: 'visitsession003',
      store: STORE_ID,
      day: '2026-08-09',
      browser_token_hmac: 'o'.repeat(64),
      first_seen_at: '2026-08-09 09:00:00.000Z',
      last_seen_at: '2026-08-09 09:05:00.000Z',
      pageviews_count: 1,
    }),
  ];

  const groups = monitoring._test.groupVisitorSessions(sessions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].representative.id, 'visitsession002');
  assert.equal(groups[0].pageviewsCount, 6);
  assert.equal(groups[0].firstSeenAt, '2026-08-08 10:00:00.000Z');
  assert.equal(groups[0].lastSeenAt, '2026-08-09 11:30:00.000Z');
});

test('VISITOR-RETENTION: conserva 30 dias de paginas y 90 dias de resumen', () => {
  assert.equal(monitoring._test.visitorPageviewRetentionDays, 30);
  assert.equal(monitoring._test.visitorSessionRetentionDays, 90);
  assert.deepEqual(monitoring._test.visitorRetentionCutoffs('2026-08-09'), {
    pageviews: '2026-07-11',
    sessions: '2026-05-12',
  });

  const settings = new MockRecord({ id: 'visitsettings01', store: STORE_ID, enabled: false, mode: 'disabled' });
  const pageviews = [
    new MockRecord({ id: 'oldpageview001', store: STORE_ID, day: '2000-01-01' }),
    new MockRecord({ id: 'newpageview001', store: STORE_ID, day: '2099-01-01' }),
  ];
  const sessions = [
    new MockRecord({ id: 'oldsession0001', store: STORE_ID, day: '2000-01-01' }),
    new MockRecord({ id: 'newsession0001', store: STORE_ID, day: '2099-01-01' }),
  ];
  const tables = {
    store_security_settings: [settings],
    store_visitor_pageviews: pageviews,
    store_visitor_sessions: sessions,
  };
  const app = {
    findRecordsByFilter(name, _filter, _sort, limit, offset, params = {}) {
      const rows = tables[name] || [];
      const filtered = params.cutoffDay
        ? rows.filter((row) => row.get('store') === params.store && row.get('day') < params.cutoffDay)
        : rows;
      return filtered.slice(offset, offset + limit);
    },
    delete(record) {
      Object.keys(tables).forEach((name) => {
        tables[name] = tables[name].filter((row) => row !== record);
      });
    },
  };

  monitoring._test.cleanupVisitors(app);
  assert.deepEqual(tables.store_visitor_pageviews.map((row) => row.id), ['newpageview001']);
  assert.deepEqual(tables.store_visitor_sessions.map((row) => row.id), ['newsession0001']);
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

test('VISITOR-VPN: detalle relaciona la deteccion con el dispositivo y su IP actual', () => {
  const browserTokenHmac = 'v'.repeat(43);
  const currentIpHmac = 'z'.repeat(64);
  const historicalIpHmac = 'y'.repeat(64);
  const visitor = new MockRecord({ id: VISITOR_ID, browser_token_hmac: browserTokenHmac, latest_ip_hmac: currentIpHmac });
  const events = [
    new MockRecord({
      event_type: 'vpn_blocked',
      ip_hmac: historicalIpHmac,
      decision: 'blocked',
      risk_level: 'blocked',
      occurred_at: '2026-08-08 19:00:00.000Z',
    }),
    new MockRecord({
      event_type: 'vpn_blocked',
      ip_hmac: currentIpHmac,
      decision: 'blocked',
      risk_level: 'blocked',
      occurred_at: '2026-08-08 18:00:00.000Z',
      metadata_json: {
        provider: 'ipapi_is:proxycheck_io',
        provider_confidence: 97,
        hosting_consensus: true,
      },
    }),
    new MockRecord({
      event_type: 'vpn_check_unavailable',
      ip_hmac: currentIpHmac,
      decision: 'monitored',
      risk_level: 'observation',
      occurred_at: '2026-08-08 17:00:00.000Z',
    }),
  ];
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
      assert.equal(params.currentIpHmac, undefined);
      return events;
    },
  };

  assert.deepEqual(monitoring._test.buildVisitorVpnInfo(app, STORE_ID, visitor), {
    status: 'blocked',
    event_type: 'vpn_blocked',
    decision: 'blocked',
    risk_level: 'blocked',
    observed_at: '2026-08-08 18:00:00.000Z',
    provider: 'ipapi_is:proxycheck_io',
    provider_confidence: 97,
    hosting_consensus: true,
    abuse_available: false,
    abuse_score: null,
    abuse_total_reports: 0,
    abuse_distinct_users: 0,
    abuse_last_reported_at: '',
    block_reason: '',
  });

  const network = monitoring._test.buildVisitorNetworkState(
    visitor,
    [{ capture: { ip_hmac: historicalIpHmac } }, { capture: { ip_hmac: currentIpHmac } }],
    events,
  );
  assert.equal(network.summary.current_ip_status, 'blocked');
  assert.equal(network.summary.vpn_ip_count, 2);
  assert.equal(network.statusByIpHmac[historicalIpHmac].status, 'blocked');

  assert.deepEqual(
    monitoring._test.buildVisitorVpnInfo(app, STORE_ID, new MockRecord({ id: VISITOR_ID })),
    {
      status: 'none',
      event_type: '',
      decision: '',
      risk_level: '',
      observed_at: '',
      provider: '',
      provider_confidence: null,
      hosting_consensus: false,
      abuse_available: false,
      abuse_score: null,
      abuse_total_reports: 0,
      abuse_distinct_users: 0,
      abuse_last_reported_at: '',
      block_reason: '',
    },
  );
});

test('VISITOR-STRICT-NETWORK: prioriza abuso y hosting bloqueados con motivo preciso', () => {
  const currentIpHmac = 'r'.repeat(64);
  const visitor = new MockRecord({ id: VISITOR_ID, browser_token_hmac: 'w'.repeat(43), latest_ip_hmac: currentIpHmac });
  const events = [
    new MockRecord({
      event_type: 'abusive_ip_blocked',
      ip_hmac: currentIpHmac,
      decision: 'blocked',
      risk_level: 'blocked',
      occurred_at: '2026-08-09 21:00:00.000Z',
      metadata_json: {
        provider: 'ipapi_is:abuseipdb',
        abuse_available: true,
        abuse_score: 25,
        abuse_total_reports: 1,
        abuse_distinct_users: 1,
        abuse_last_reported_at: '2026-08-09 20:00:00.000Z',
        block_reason: 'abusive_ip_detected',
      },
    }),
  ];
  const info = monitoring._test.buildVisitorVpnInfo({}, STORE_ID, visitor, events);
  assert.equal(info.status, 'blocked');
  assert.equal(info.event_type, 'abusive_ip_blocked');
  assert.equal(info.provider, 'ipapi_is:abuseipdb');
  assert.equal(info.abuse_score, 25);
  assert.equal(info.abuse_total_reports, 1);
  assert.equal(info.block_reason, 'abusive_ip_detected');

  const firstIpHmac = 'q'.repeat(64);
  const state = monitoring._test.buildVisitorNetworkState(
    new MockRecord({ id: VISITOR_ID, latest_ip_hmac: firstIpHmac }),
    [{ capture: { ip_hmac: firstIpHmac } }],
    [new MockRecord({ event_type: 'hosting_blocked', ip_hmac: firstIpHmac, occurred_at: '2026-08-09 21:00:00.000Z' })],
  );
  assert.equal(state.summary.current_ip_status, 'blocked');
  assert.equal(state.summary.vpn_ip_count, 1);
});

test('VISITOR-CURRENT-IP: una IP normal actual no hereda un bloqueo historico', () => {
  const blockedIpHmac = 'o'.repeat(64);
  const currentIpHmac = 'n'.repeat(64);
  const visitor = new MockRecord({
    id: VISITOR_ID,
    browser_token_hmac: 'x'.repeat(43),
    latest_ip_hmac: currentIpHmac,
  });
  const events = [
    new MockRecord({
      event_type: 'vpn_blocked',
      ip_hmac: blockedIpHmac,
      decision: 'blocked',
      risk_level: 'blocked',
      occurred_at: '2026-08-09 20:00:00.000Z',
    }),
  ];

  const info = monitoring._test.buildVisitorVpnInfo({}, STORE_ID, visitor, events);
  const state = monitoring._test.buildVisitorNetworkState(
    visitor,
    [{ capture: { ip_hmac: blockedIpHmac } }, { capture: { ip_hmac: currentIpHmac } }],
    events,
  );

  assert.equal(info.status, 'none');
  assert.equal(state.summary.current_ip_status, 'normal');
  assert.equal(state.summary.vpn_ip_count, 1);
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, state.summary.current_ip_status, [], new Date()), 'normal');
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
    suspected_ip_count: 0,
    unavailable_ip_count: 1,
    current_ip_status: 'unavailable',
    current_ip_observed_at: '2026-08-08 17:00:00.000Z',
  });
  assert.equal(state.statusByIpHmac[firstIpHmac].status, 'blocked');
  assert.equal(state.statusByIpHmac[currentIpHmac].status, 'unavailable');
  assert.equal(state.statusByIpHmac[outsiderIpHmac], undefined);
  assert.doesNotMatch(JSON.stringify(state.summary), /a{32}|b{32}|c{32}/);

  const suspected = monitoring._test.buildVisitorNetworkState(visitor, sources, [
    new MockRecord({ event_type: 'network_suspected', ip_hmac: currentIpHmac, occurred_at: '2026-08-08 20:00:00.000Z' }),
  ]);
  assert.equal(suspected.summary.suspected_ip_count, 1);
  assert.equal(suspected.summary.vpn_ip_count, 0);
  assert.equal(suspected.summary.current_ip_status, 'suspected');
});

test('VISITOR-HISTORY-IP: serializa el historial sin exponer huellas protegidas', () => {
  const firstIpHmac = 'h'.repeat(64);
  const secondIpHmac = 'j'.repeat(64);
  const settings = new MockRecord({ ip_visibility: 'partial' });
  const sources = [
    {
      kind: 'session',
      record: new MockRecord({ latest_ip_masked: '203.0.113.x' }),
      capture: { ip_hmac: firstIpHmac },
      first_seen_at: '2026-08-01 10:00:00.000Z',
      last_seen_at: '2026-08-09 10:00:00.000Z',
      sightings_count: 6,
    },
    {
      kind: 'pageview',
      record: new MockRecord({ ip_masked: '198.51.100.x' }),
      capture: { ip_hmac: secondIpHmac },
      first_seen_at: '2026-08-02 10:00:00.000Z',
      last_seen_at: '2026-08-08 10:00:00.000Z',
      sightings_count: 3,
    },
  ];
  const history = monitoring._test.buildVisitorNetworkHistory(sources, {
    statusByIpHmac: {
      [firstIpHmac]: { status: 'detected', observed_at: '2026-08-09 10:00:00.000Z' },
    },
  }, settings);

  assert.equal(history.length, 2);
  assert.deepEqual(history[0], {
    ip_display: '203.0.113.x',
    ip_resolution_status: 'masked',
    network_status: 'detected',
    network_observed_at: '2026-08-09 10:00:00.000Z',
    first_seen_at: '2026-08-01 10:00:00.000Z',
    last_seen_at: '2026-08-09 10:00:00.000Z',
    sightings_count: 6,
  });
  assert.equal(history[1].network_status, 'normal');
  assert.doesNotMatch(JSON.stringify(history), /h{32}|j{32}|ip_hmac/);
});

test('VISITOR-STATUS: prioriza bloqueos activos y usa observacion solo para senales que requieren atencion', () => {
  const now = new Date('2026-08-08T20:00:00.000Z');
  const visitor = new MockRecord({
    id: VISITOR_ID,
    browser_token_hmac: 'd'.repeat(64),
    latest_ip_hmac: 'i'.repeat(64),
  });
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

  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'normal', [], now), 'normal');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, { status: 'watch' }, 'normal', [], now), 'watch');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'detected', [], now), 'watch');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'unavailable', [], now), 'watch');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'blocked', [], now), 'blocked');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, { status: 'blocked' }, 'normal', [], now), 'blocked');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'normal', [activeIpBlock], now), 'blocked');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'normal', [expiredIpBlock], now), 'normal');
  assert.equal(monitoring._test.buildVisitorSecurityStatus(visitor, null, 'normal', [incompleteAllBlock], now), 'normal');
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
