'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');

const STORE_ID = 'mipstore0000001';
const MASTER_ID = 'mipmaster000001';
const SETTINGS_ID = 'mipsettings0001';
const HMAC_SECRET = 's'.repeat(48);

for (const id of [STORE_ID, MASTER_ID, SETTINGS_ID]) assert.equal(id.length, 15);

const previousGlobals = {
  __hooks: global.__hooks,
  $app: global.$app,
  $os: global.$os,
  $security: global.$security,
  Record: global.Record,
};

global.__hooks = path.resolve(__dirname, '../pb_hooks').replace(/\\/g, '/');
global.$os = { getenv: (name) => name === 'PZ_SECURITY_HMAC_SECRET' ? HMAC_SECRET : '' };
global.$security = {
  sha256: (value) => crypto.createHash('sha256').update(String(value)).digest('hex'),
  hs256: (value, secret) => crypto.createHmac('sha256', secret).update(String(value)).digest('hex'),
};

class MockRecord {
  constructor(collection, values = {}) {
    this._collection = collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  getBool(key) { return this.get(key) === true; }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
  collection() { return this._collection; }
}
global.Record = MockRecord;

const activity = require('../pb_hooks/pz_store_activity_audit_lib.js');
const activityWrites = [];
let failActivityWrite = false;
activity.createActivity = (_app, input) => {
  if (failActivityWrite) throw new Error('central_audit_failed');
  const row = { id: `activity${activityWrites.length + 1}`, ...input };
  activityWrites.push(row);
  return row;
};
const monitoring = require('../pb_hooks/pz_security_monitoring_lib.js');

function record(collection, values) {
  return new MockRecord({ name: collection, fields: { getByName: () => ({}) } }, values);
}

function fixture() {
  const store = record('stores', {
    id: STORE_ID,
    slug: 'manual-ip',
    status: 'active',
    plan: 'premium',
    plan_is_permanent: true,
  });
  const master = record('users', { id: MASTER_ID, role: 'master_admin', status: 'active' });
  const settings = record('store_security_settings', {
    id: SETTINGS_ID,
    store: STORE_ID,
    enabled: true,
    mode: 'protection',
    manual_blocking_enabled: true,
    full_access_blocking_enabled: true,
    permanent_blocks_enabled: true,
    ip_visibility: 'partial',
  });
  const tables = {
    stores: [store],
    users: [master],
    store_security_settings: [settings],
    store_security_blocks: [],
    store_security_block_device_candidates: [],
    store_security_block_addresses: [],
    store_security_events: [],
    store_customer_devices: [],
    store_visitor_sessions: [],
    store_visitor_pageviews: [],
    store_security_audit: [],
  };
  let sequence = 0;
  const collections = {};
  const collection = (name) => {
    collections[name] = collections[name] || { name, fields: { getByName: () => ({}) } };
    return collections[name];
  };
  const app = {
    findCollectionByNameOrId(name) { return collection(name); },
    findRecordById(name, id) {
      const found = (tables[name] || []).find((item) => item.id === id);
      if (!found) throw new Error(`not_found:${name}`);
      return found;
    },
    findFirstRecordByFilter(name, _filter, params = {}) {
      let rows = (tables[name] || []).slice();
      if (params.store) rows = rows.filter((item) => item.get('store') === params.store || item.id === params.store);
      if (params.block) rows = rows.filter((item) => item.get('block') === params.block);
      if (params.device) rows = rows.filter((item) => item.get('device_hmac') === params.device);
      const found = rows[0];
      if (!found) throw new Error(`not_found:${name}`);
      return found;
    },
    findRecordsByFilter(name, _filter, _sort, limit = 200, offset = 0, params = {}) {
      let rows = (tables[name] || []).slice();
      if (params.store) rows = rows.filter((item) => item.get('store') === params.store);
      if (params.ipHmac) rows = rows.filter((item) => item.get('latest_ip_hmac') === params.ipHmac);
      if (params.visitorSession) rows = rows.filter((item) => item.get('visitor_session') === params.visitorSession);
      if (params.customer) rows = rows.filter((item) => item.get('customer') === params.customer);
      if (params.device) rows = rows.filter((item) => item.get('browser_token_hmac') === params.device);
      if (params.block) rows = rows.filter((item) => item.get('block') === params.block || item.get('block_record_id') === params.block);
      return rows.slice(offset, offset + limit);
    },
    save(saved) {
      const name = saved.collection().name;
      tables[name] = tables[name] || [];
      if (!saved.id) saved.id = `rec${String(++sequence).padStart(12, '0')}`;
      if (!tables[name].includes(saved)) tables[name].push(saved);
      return saved;
    },
    delete(deleted) {
      const name = deleted.collection().name;
      tables[name] = (tables[name] || []).filter((item) => item !== deleted);
    },
    runInTransaction(callback) {
      const tableSnapshot = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.slice()]));
      const recordSnapshot = new Map();
      Object.values(tables).flat().forEach((item) => recordSnapshot.set(item, { id: item.id, values: { ...item.values } }));
      try {
        return callback(app);
      } catch (error) {
        Object.keys(tables).forEach((name) => { tables[name] = (tableSnapshot[name] || []).slice(); });
        recordSnapshot.forEach((snapshot, item) => {
          item.id = snapshot.id;
          item.values = { ...snapshot.values };
        });
        throw error;
      }
    },
    logger() { return { warn() {}, error() {} }; },
  };
  return { app, master, settings, store, tables };
}

function endpointEvent(app, auth, body) {
  global.$app = app;
  const headers = new Map();
  return {
    requestInfo: () => ({ auth, body }),
    response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
    json: (status, payload) => ({ status, payload, headers }),
  };
}

test.after(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

test('MANUAL-IP: solo acepta IPv4/IPv6 publicas exactas', () => {
  for (const value of ['10.0.1.1', '127.0.0.1', '192.168.1.8', '100.64.1.2', '198.51.100.8', '203.0.113.9', '::1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
    const normalized = monitoring._test.normalizeIpAddress(value);
    assert.equal(monitoring._test.isPublicIpAddress(normalized), false, value);
  }
  for (const value of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    const normalized = monitoring._test.normalizeIpAddress(value);
    assert.equal(monitoring._test.isPublicIpAddress(normalized), true, value);
  }
});

test('MANUAL-IP: sin historial crea bloqueo IP-only, con HMAC y sin conservar la IP plana', () => {
  activityWrites.length = 0;
  const data = fixture();
  const response = monitoring.handleSecurityBlockAction(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    action: 'create_manual_ip',
    scope: 'orders',
    duration: 'hours_24',
    ip: '8.8.8.8',
    visitor_session_id: '',
    ip_source_ids: [],
    device_session_ids: [],
    reason: 'Abuso confirmado',
  }));

  assert.equal(response.status, 200);
  assert.equal(data.tables.store_security_blocks.length, 1);
  const block = data.tables.store_security_blocks[0];
  assert.equal(block.get('customer'), '');
  assert.equal(block.get('manual_ip'), true);
  assert.equal(block.get('review_device_candidates'), true);
  assert.equal(block.get('match_device'), false);
  assert.equal(block.get('match_ip'), true);
  assert.equal(block.get('match_mode'), 'any');
  assert.equal(Array.isArray(block.get('ip_hmac_values')), true);
  assert.equal(block.get('ip_hmac_values').length, 1);
  assert.doesNotMatch(JSON.stringify(block.values), /8\.8\.8\.8/);
  assert.equal(response.payload.block.manual_ip_display, '8.8.***.8');
  assert.doesNotMatch(JSON.stringify(response.payload), /ip_hmac|device_hmac|reason_internal/i);
  assert.equal(data.tables.store_security_audit.some((row) => row.get('action') === 'block_created'), true);
});

test('MANUAL-IP: permite seleccionar uno, varios o todos los dispositivos y los bloquea desde la creacion', () => {
  const data = fixture();
  const ipHmac = global.$security.hs256(`ip|${STORE_ID}|8.8.8.8`, HMAC_SECRET);
  const first = record('store_visitor_sessions', {
    id: 'mipsession00001',
    store: STORE_ID,
    latest_ip_hmac: ipHmac,
    latest_ip_masked: '8.8.***.8',
    latest_ip_family: 'ipv4',
    latest_capture_status: 'partial',
    browser_token_hmac: 'd'.repeat(64),
    last_seen_at: '2026-08-07T12:00:00.000Z',
  });
  const second = record('store_visitor_sessions', {
    id: 'mipsession00002',
    store: STORE_ID,
    latest_ip_hmac: ipHmac,
    latest_ip_masked: '8.8.***.8',
    latest_ip_family: 'ipv4',
    latest_capture_status: 'partial',
    browser_token_hmac: 'e'.repeat(64),
    last_seen_at: '2026-08-07T12:01:00.000Z',
  });
  data.tables.store_visitor_sessions.push(first, second);

  const lookup = monitoring.handleManualIpDeviceLookup(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    ip: '8.8.8.8',
    visitor_session_id: '',
  }));
  assert.equal(lookup.status, 200);
  assert.equal(lookup.payload.candidates.length, 2);
  assert.doesNotMatch(JSON.stringify(lookup.payload), /device_hmac|d{32,}|e{32,}/i);

  const response = monitoring.handleSecurityBlockAction(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    action: 'create_manual_ip',
    scope: 'full_access',
    duration: 'days_7',
    ip: '8.8.8.8',
    visitor_session_id: '',
    ip_source_ids: [],
    device_session_ids: [first.id, second.id],
    reason: 'Abuso confirmado en ambos dispositivos',
  }));
  assert.equal(response.status, 200);
  const block = data.tables.store_security_blocks[0];
  assert.equal(block.get('match_device'), true);
  assert.equal(block.get('match_ip'), true);
  assert.equal(block.get('match_mode'), 'any');
  assert.deepEqual(block.get('device_hmac_values'), ['d'.repeat(64), 'e'.repeat(64)]);
  assert.equal(response.payload.selected_device_count, 2);
  assert.doesNotMatch(JSON.stringify(response.payload), /device_hmac|d{32,}|e{32,}/i);
});

test('MANUAL-IP: un visitante permite elegir una, varias o todas sus IP historicas y su dispositivo desde el primer bloqueo', () => {
  const data = fixture();
  const visitor = record('store_visitor_sessions', {
    id: 'mipsession00003',
    store: STORE_ID,
    latest_ip_hmac: 'i'.repeat(64),
    latest_ip_masked: '1.1.***.1',
    latest_ip_family: 'ipv4',
    latest_capture_status: 'partial',
    browser_token_hmac: 'd'.repeat(64),
    last_seen_at: '2026-08-08T12:03:00.000Z',
  });
  const duplicateCurrent = record('store_visitor_pageviews', {
    id: 'mippage00000001',
    store: STORE_ID,
    visitor_session: visitor.id,
    ip_hmac: 'i'.repeat(64),
    ip_masked: '1.1.***.1',
    ip_family: 'ipv4',
    capture_status: 'partial',
    occurred_at: '2026-08-08T12:03:00.000Z',
  });
  const previousIp = record('store_visitor_pageviews', {
    id: 'mippage00000002',
    store: STORE_ID,
    visitor_session: visitor.id,
    ip_hmac: 'j'.repeat(64),
    ip_masked: '8.8.***.8',
    ip_family: 'ipv4',
    capture_status: 'partial',
    occurred_at: '2026-08-08T12:00:00.000Z',
  });
  const unrelatedIp = record('store_visitor_pageviews', {
    id: 'mippage00000003',
    store: STORE_ID,
    visitor_session: 'mipsession00004',
    ip_hmac: 'k'.repeat(64),
    ip_masked: '9.9.***.9',
    ip_family: 'ipv4',
    capture_status: 'partial',
    occurred_at: '2026-08-08T12:02:00.000Z',
  });
  data.tables.store_visitor_sessions.push(visitor);
  data.tables.store_visitor_pageviews.push(duplicateCurrent, previousIp, unrelatedIp);

  const lookup = monitoring.handleManualIpDeviceLookup(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    ip: '',
    visitor_session_id: visitor.id,
  }));
  assert.equal(lookup.status, 200);
  assert.equal(lookup.payload.ip_candidates.length, 2);
  assert.equal(lookup.payload.ip_candidates[0].source_id, visitor.id);
  assert.equal(lookup.payload.ip_candidates[0].preselected, true);
  assert.equal(lookup.payload.ip_candidates[1].source_id, previousIp.id);
  assert.equal(lookup.payload.candidates.length, 1);
  assert.equal(lookup.payload.candidates[0].session_id, visitor.id);
  assert.doesNotMatch(JSON.stringify(lookup.payload), /ip_hmac|device_hmac|i{32,}|j{32,}|d{32,}/i);

  const rejected = monitoring.handleSecurityBlockAction(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    action: 'create_manual_ip',
    scope: 'orders',
    duration: 'hours_24',
    ip: '',
    visitor_session_id: visitor.id,
    ip_source_ids: [unrelatedIp.id],
    device_session_ids: [visitor.id],
    reason: 'Seleccion ajena al visitante',
  }));
  assert.equal(rejected.status, 400);
  assert.equal(rejected.payload.error, 'ip_source_ids');
  assert.equal(data.tables.store_security_blocks.length, 0);

  const response = monitoring.handleSecurityBlockAction(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    action: 'create_manual_ip',
    scope: 'full_access',
    duration: 'days_7',
    ip: '',
    visitor_session_id: visitor.id,
    ip_source_ids: [visitor.id, previousIp.id],
    device_session_ids: [visitor.id],
    reason: 'Bloquear historial seleccionado y dispositivo actual',
  }));
  assert.equal(response.status, 200);
  const block = data.tables.store_security_blocks[0];
  assert.deepEqual(block.get('ip_hmac_values'), ['i'.repeat(64), 'j'.repeat(64)]);
  assert.deepEqual(block.get('device_hmac_values'), ['d'.repeat(64)]);
  assert.equal(block.get('match_mode'), 'any');
  assert.equal(response.payload.selected_ip_count, 2);
  assert.equal(response.payload.selected_device_count, 1);
  assert.doesNotMatch(JSON.stringify(response.payload), /ip_hmac|device_hmac|i{32,}|j{32,}|d{32,}/i);
});

test('VPN-POLICY: Master puede cambiar la politica y block exige modo proteccion', () => {
  const data = fixture();
  const monitor = monitoring.handleVpnPolicyUpdate(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    vpn_policy: 'monitor',
  }));
  assert.equal(monitor.status, 200);
  assert.equal(monitor.payload.changed, true);
  assert.equal(data.settings.get('vpn_policy'), 'monitor');
  assert.equal(data.tables.store_security_audit.some((row) => row.get('action') === 'vpn_policy_updated'), true);

  data.settings.set('mode', 'monitoring');
  const rejected = monitoring.handleVpnPolicyUpdate(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    vpn_policy: 'block',
  }));
  assert.equal(rejected.status, 409);
  assert.equal(rejected.payload.error, 'protection_required');
  assert.equal(data.settings.get('vpn_policy'), 'monitor');
});

test('VPN-POLICY: configuracion y auditoria revierten juntas si falla la escritura central', () => {
  const data = fixture();
  failActivityWrite = true;
  const response = monitoring.handleVpnPolicyUpdate(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    vpn_policy: 'monitor',
  }));
  failActivityWrite = false;

  assert.equal(response.status, 500);
  assert.equal(data.settings.get('vpn_policy'), undefined);
  assert.equal(data.tables.store_security_audit.length, 0);
});

test('MANUAL-IP: detecta candidato por IP y solo lo agrega al bloqueo tras confirmacion', () => {
  activityWrites.length = 0;
  const data = fixture();
  const block = record('store_security_blocks', {
    id: 'mipblock0000001',
    store: STORE_ID,
    customer: '',
    scope: 'orders',
    status: 'active',
    duration: 'hours_24',
    expires_at: '2099-12-31T23:59:59.000Z',
    manual_ip: true,
    review_device_candidates: true,
    match_ip: true,
    match_device: false,
    match_mode: 'any',
    ip_hmac_values: ['i'.repeat(64)],
    device_hmac_values: [],
  });
  data.tables.store_security_blocks.push(block);

  const first = monitoring.recordManualBlockDeviceCandidate(data.app, block, {
    ip: 'i'.repeat(64),
    device: 'd'.repeat(64),
  }, new Date('2026-08-07T12:00:00.000Z'));
  const second = monitoring.recordManualBlockDeviceCandidate(data.app, block, {
    ip: 'i'.repeat(64),
    device: 'd'.repeat(64),
  }, new Date('2026-08-07T12:01:00.000Z'));

  assert.equal(first.id, second.id);
  assert.equal(data.tables.store_security_block_device_candidates.length, 1);
  assert.equal(second.get('status'), 'pending');
  assert.equal(second.get('attempts_count'), 2);
  assert.equal(block.get('match_device'), false);

  const response = monitoring.handleSecurityBlockAction(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    action: 'confirm_device_candidate',
    block_id: block.id,
    candidate_id: second.id,
    reason: 'Dispositivo revisado',
  }));

  assert.equal(response.status, 200);
  assert.equal(second.get('status'), 'confirmed');
  assert.equal(block.get('match_device'), true);
  assert.equal(block.get('match_mode'), 'any');
  assert.deepEqual(block.get('device_hmac_values'), ['d'.repeat(64)]);
  assert.equal(response.payload.candidate_status, 'confirmed');
  assert.doesNotMatch(JSON.stringify(response.payload), /d{32,}|device_hmac/i);
  assert.equal(data.tables.store_security_audit.some((row) => row.get('action') === 'block_device_candidate_confirmed'), true);

  const dismissCandidate = monitoring.recordManualBlockDeviceCandidate(data.app, block, {
    ip: 'i'.repeat(64),
    device: 'e'.repeat(64),
  }, new Date('2026-08-07T12:02:00.000Z'));
  const dismissResponse = monitoring.handleSecurityBlockAction(endpointEvent(data.app, data.master, {
    store_id: STORE_ID,
    action: 'dismiss_device_candidate',
    block_id: block.id,
    candidate_id: dismissCandidate.id,
    reason: 'Dispositivo no relacionado',
  }));

  assert.equal(dismissResponse.status, 200);
  assert.equal(dismissCandidate.get('status'), 'dismissed');
  assert.deepEqual(block.get('device_hmac_values'), ['d'.repeat(64)]);
  assert.equal(dismissResponse.payload.candidate_status, 'dismissed');
  assert.doesNotMatch(JSON.stringify(dismissResponse.payload), /e{32,}|device_hmac/i);
  assert.equal(data.tables.store_security_audit.some((row) => row.get('action') === 'block_device_candidate_dismissed'), true);
});

test('BLOCK-HISTORY: muestra varias IP y cronologia del bloqueo sin exponer identificadores protegidos', () => {
  const data = fixture();
  const blockId = 'historyblock001';
  const customerId = 'historycust0001';
  const sessionId = 'historysess0001';
  const firstIpHmac = 'i'.repeat(64);
  const secondIpHmac = 'j'.repeat(64);
  const deviceIpHmac = 'k'.repeat(64);
  const deviceHmac = 'd'.repeat(64);
  for (const id of [blockId, customerId, sessionId]) assert.equal(id.length, 15);

  const block = record('store_security_blocks', {
    id: blockId,
    store: STORE_ID,
    customer: customerId,
    scope: 'full_access',
    status: 'active',
    duration: 'days_7',
    starts_at: '2026-08-08T10:00:00.000Z',
    created: '2026-08-08T10:00:00.000Z',
    match_ip: true,
    match_device: true,
    match_mode: 'any',
    ip_hmac_values: [firstIpHmac, secondIpHmac],
    device_hmac_values: [deviceHmac],
  });
  data.tables.store_security_blocks.push(block);
  data.tables.store_customer_devices.push(record('store_customer_devices', {
    id: 'historydev00001',
    store: STORE_ID,
    customer: customerId,
    browser_token_hmac: deviceHmac,
    latest_ip_hmac: deviceIpHmac,
    latest_ip_masked: '9.9.***.9',
    last_seen_at: '2026-08-08T10:30:00.000Z',
  }));
  data.tables.store_visitor_sessions.push(record('store_visitor_sessions', {
    id: sessionId,
    store: STORE_ID,
    customer: customerId,
    browser_token_hmac: deviceHmac,
    latest_ip_hmac: deviceIpHmac,
    latest_ip_masked: '9.9.***.9',
    last_seen_at: '2026-08-08T10:35:00.000Z',
  }));
  data.tables.store_visitor_pageviews.push(
    record('store_visitor_pageviews', {
      id: 'historypage0001',
      store: STORE_ID,
      visitor_session: sessionId,
      ip_hmac: secondIpHmac,
      ip_masked: '8.8.***.8',
      occurred_at: '2026-08-08T10:20:00.000Z',
    }),
    record('store_visitor_pageviews', {
      id: 'historypage0002',
      store: STORE_ID,
      visitor_session: sessionId,
      ip_hmac: firstIpHmac,
      ip_masked: '1.1.***.1',
      occurred_at: '2026-08-08T10:10:00.000Z',
    })
  );
  data.tables.store_security_events.push(
    record('store_security_events', {
      id: 'historyevent001',
      store: STORE_ID,
      customer: customerId,
      event_type: 'blocked_attempt',
      decision: 'blocked',
      risk_level: 'blocked',
      ip_hmac: firstIpHmac,
      ip_masked: '1.1.***.1',
      browser_token_hmac: deviceHmac,
      metadata_json: { block_record_id: blockId },
      occurred_at: '2026-08-08T10:40:00.000Z',
    }),
    record('store_security_events', {
      id: 'historyevent002',
      store: STORE_ID,
      customer: customerId,
      event_type: 'vpn_detected',
      decision: 'monitored',
      risk_level: 'suspicious',
      ip_hmac: deviceIpHmac,
      ip_masked: '9.9.***.9',
      browser_token_hmac: deviceHmac,
      occurred_at: '2026-08-08T10:35:00.000Z',
    }),
    record('store_security_events', {
      id: 'historyevent003',
      store: STORE_ID,
      customer: 'othercust000001',
      event_type: 'blocked_attempt',
      ip_hmac: 'z'.repeat(64),
      browser_token_hmac: 'e'.repeat(64),
      metadata_json: { block_record_id: 'otherblock00001' },
      occurred_at: '2026-08-08T10:50:00.000Z',
    })
  );
  data.tables.store_security_audit.push(record('store_security_audit', {
    id: 'historyaudit001',
    store: STORE_ID,
    actor: MASTER_ID,
    action: 'block_created',
    block_record_id: blockId,
    reason_internal: 'Abuso confirmado',
    created: '2026-08-08T10:00:00.000Z',
  }));
  data.tables.store_security_block_addresses.push(
    record('store_security_block_addresses', { id: 'historyaddr0001', store: STORE_ID, block: blockId }),
    record('store_security_block_addresses', { id: 'historyaddr0002', store: STORE_ID, block: blockId })
  );

  const detail = monitoring._test.buildSecurityBlockDetail(data.app, STORE_ID, block, data.settings);
  assert.equal(detail.related_ip_count, 3);
  assert.equal(detail.related_device_count, 1);
  assert.equal(detail.related_address_count, 2);
  assert.equal(detail.history_count, 3);
  assert.equal(detail.related_ips.find((ip) => ip.ip_display === '1.1.***.1').included_in_block, true);
  assert.equal(detail.related_ips.find((ip) => ip.ip_display === '1.1.***.1').blocked_attempts, 1);
  assert.equal(detail.related_ips.find((ip) => ip.ip_display === '9.9.***.9').link_source, 'device');
  assert.equal(detail.related_ips.find((ip) => ip.ip_display === '9.9.***.9').vpn_status, 'detected');
  assert.equal(detail.history.some((entry) => entry.id === 'historyevent003'), false);
  const payload = JSON.stringify(detail);
  assert.doesNotMatch(payload, /ip_hmac|device_hmac|browser_token|metadata_json/i);
  assert.doesNotMatch(payload, new RegExp(`${firstIpHmac}|${secondIpHmac}|${deviceIpHmac}|${deviceHmac}`));
});
