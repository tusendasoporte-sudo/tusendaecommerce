'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const STORE_ID = 's7p3store000001';
const USER_ID = 's7p3user0000001';
const SETTINGS_ID = 's7p3set00000001';

for (const id of [STORE_ID, USER_ID, SETTINGS_ID]) {
  assert.equal(id.length, 15, `fixture id ${id}`);
}

const previousGlobals = {
  __hooks: global.__hooks,
  $app: global.$app,
};
global.__hooks = path.resolve(__dirname, '../pb_hooks').replace(/\\/g, '/');

function record(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return key === 'id' ? this.id : this[key]; },
    getString(key) { return String(this.get(key) ?? ''); },
    getBool(key) { return this.get(key) === true; },
  };
}

function fixture({ plan = 'premium', expiresAt = '2099-12-31T23:59:59.000Z' } = {}) {
  const store = record(STORE_ID, {
    slug: 'tienda-s7p3',
    status: 'active',
    plan,
    plan_started_at: '2026-08-01T00:00:00.000Z',
    plan_expires_at: expiresAt,
    plan_is_permanent: false,
    primary_admin_user: USER_ID,
  });
  const user = record(USER_ID, {
    role: 'store_admin',
    status: 'active',
    store: STORE_ID,
  });
  const settings = record(SETTINGS_ID, {
    store: STORE_ID,
    enabled: true,
    mode: 'protection',
    manual_blocking_enabled: true,
    retention_days: 60,
  });
  const tables = {
    stores: [store],
    users: [user],
    store_security_settings: [settings],
    store_customers: [record('s7p3cust0000001', { store: STORE_ID, display_name: 'Cliente conservado' })],
    store_security_events: [record('s7p3event000001', { store: STORE_ID, event_type: 'order_created' })],
    store_security_blocks: [record('s7p3block000001', { store: STORE_ID, status: 'active' })],
    store_security_audit: [record('s7p3audit000001', { store: STORE_ID, action: 'block_created' })],
  };
  const app = {
    findRecordById(collection, id) {
      const found = (tables[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const found = (tables[collection] || []).find((item) => !params.store || item.store === params.store);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit = 500, offset = 0, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.store) rows = rows.filter((item) => item.store === params.store);
      return rows.slice(offset, offset + limit);
    },
    logger() { return { error() {}, warn() {} }; },
  };
  return { app, store, user, settings, tables };
}

const monitoring = require('../pb_hooks/pz_security_monitoring_lib.js');
const identity = require('../pb_hooks/pz_security_identity_lib.js');
const enforcement = require('../pb_hooks/pz_store_permission_enforcement_lib.js');

test.after(() => {
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

function endpointEvent(app, user, body) {
  const headers = new Map();
  global.$app = app;
  return {
    requestInfo() { return { auth: user, body }; },
    response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
    json(status, payload) { return { status, payload, headers }; },
  };
}

test('S7P3: solo Premium vigente habilita la capacidad privada de Seguridad', () => {
  for (const options of [
    { plan: 'free' },
    { plan: 'basic' },
    { plan: 'premium', expiresAt: '2000-01-01T00:00:00.000Z' },
  ]) {
    const data = fixture(options);
    assert.equal(monitoring._test.securityCapabilityAllowed(data.app, STORE_ID, data.store), false);
    global.$app = data.app;
    assert.equal(identity._test.securityCapabilityAllowed(data.app, STORE_ID, data.store), false);
    assert.equal(enforcement.securityCapabilityAllowed(data.store), false);
  }

  const premium = fixture();
  assert.equal(monitoring._test.securityCapabilityAllowed(premium.app, STORE_ID, premium.store), true);
  global.$app = premium.app;
  assert.equal(identity._test.securityCapabilityAllowed(premium.app, STORE_ID, premium.store), true);
  assert.equal(enforcement.securityCapabilityAllowed(premium.store), true);
});

test('S7P3: Principal sin capacidad recibe 403 en endpoints privados y Master conserva autoridad', () => {
  const data = fixture({ plan: 'basic' });
  global.$app = data.app;

  assert.equal(
    monitoring._test.canUseStorePermission('store_admin', STORE_ID, STORE_ID, data.user, 'security.view', data.app),
    false,
  );
  assert.equal(
    identity._test.canUseStorePermission('store_admin', STORE_ID, STORE_ID, data.user, 'security.manage'),
    false,
  );
  assert.equal(
    monitoring._test.canUseStorePermission('master_admin', '', STORE_ID, record('masters7p30001'), 'security.view', data.app),
    true,
  );

  const summary = monitoring.handleMonitoringSummary(endpointEvent(data.app, data.user, { store_id: STORE_ID }));
  assert.equal(summary.status, 403);
  assert.deepEqual(summary.payload, { ok: false, error: 'permission_denied' });

  const customers = identity.handleCustomersPage(endpointEvent(data.app, data.user, {
    store_id: STORE_ID,
    page: 1,
    status: 'all',
    search: '',
  }));
  assert.equal(customers.status, 403);
  assert.deepEqual(customers.payload, { ok: false, error: 'permission_denied' });
});

test('S7P3: REST y realtime privados fallan cerrados sin capacidad', () => {
  const data = fixture({ plan: 'basic' });
  let nextCalls = 0;
  assert.throws(() => enforcement.enforceRead({
    app: data.app,
    auth: data.user,
    collection: { name: 'store_security_settings' },
    requestInfo: () => ({ query: {} }),
    next() { nextCalls += 1; },
  }, 'store_security_settings'), (error) =>
    error.code === 'permission_denied' && error.permission === 'security.view');
  assert.equal(nextCalls, 0);
  assert.equal(enforcement.hasCollectionReadAccess(data.app, data.user, 'store_security_events'), false);

  data.store.plan = 'premium';
  assert.doesNotThrow(() => enforcement.enforceRead({
    app: data.app,
    auth: data.user,
    collection: { name: 'store_security_settings' },
    requestInfo: () => ({ query: {} }),
    next() { nextCalls += 1; },
  }, 'store_security_settings'));
  assert.equal(nextCalls, 1);
  assert.equal(enforcement.hasCollectionReadAccess(data.app, data.user, 'store_security_events'), true);
});

test('S7P3: downgrade y restauración no mutan configuración, clientes, eventos, bloqueos ni auditoría', () => {
  const data = fixture();
  const securitySnapshot = JSON.stringify({
    settings: data.tables.store_security_settings,
    customers: data.tables.store_customers,
    events: data.tables.store_security_events,
    blocks: data.tables.store_security_blocks,
    audit: data.tables.store_security_audit,
  });

  data.store.plan = 'basic';
  assert.equal(enforcement.securityCapabilityAllowed(data.store), false);
  assert.equal(JSON.stringify({
    settings: data.tables.store_security_settings,
    customers: data.tables.store_customers,
    events: data.tables.store_security_events,
    blocks: data.tables.store_security_blocks,
    audit: data.tables.store_security_audit,
  }), securitySnapshot);

  data.store.plan = 'premium';
  assert.equal(enforcement.securityCapabilityAllowed(data.store), true);
  assert.equal(JSON.stringify({
    settings: data.tables.store_security_settings,
    customers: data.tables.store_customers,
    events: data.tables.store_security_events,
    blocks: data.tables.store_security_blocks,
    audit: data.tables.store_security_audit,
  }), securitySnapshot);
});

test('S7P3: el gate no amplía el enforcement público existente', () => {
  const monitoringSource = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_security_monitoring_lib.js'), 'utf8');
  const identitySource = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_security_identity_lib.js'), 'utf8');
  const navigationHandler = monitoringSource.slice(
    monitoringSource.indexOf('function handleTrackNavigation('),
    monitoringSource.indexOf('function getRecordIpDisplay('),
  );
  const registerHandler = identitySource.slice(
    identitySource.indexOf('function handleRegisterOrder('),
    identitySource.indexOf('function invalidBackfill('),
  );

  assert.doesNotMatch(navigationHandler, /securityCapabilityAllowed|requireStoreCapability/);
  assert.doesNotMatch(registerHandler, /securityCapabilityAllowed|requireStoreCapability/);
  assert.match(navigationHandler, /recordNavigation/);
  assert.match(registerHandler, /registerOrderSecurityIdentity/);
});
