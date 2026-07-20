'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const STORE_ID = 'storeteam000001';
const OTHER_STORE_ID = 'storeteam000002';
const CUSTOMER_ID = 'customerteam001';
const OTHER_CUSTOMER_ID = 'customerteam002';
const USER_ID = 'staffteam000001';

for (const id of [STORE_ID, OTHER_STORE_ID, CUSTOMER_ID, OTHER_CUSTOMER_ID, USER_ID]) {
  assert.equal(id.length, 15, `fixture id ${id}`);
}

function record(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    getBool(key) { return this[key] === true; },
  };
}

const stores = new Map([
  [STORE_ID, record(STORE_ID, { plan: 'premium', status: 'active' })],
  [OTHER_STORE_ID, record(OTHER_STORE_ID, { plan: 'premium', status: 'active' })],
]);

global.__hooks = path.resolve(__dirname, '../pb_hooks').replace(/\\/g, '/');
global.$app = {
  findRecordById(collection, id) {
    if (collection === 'stores' && stores.has(id)) return stores.get(id);
    throw new Error('not_found');
  },
  logger() {
    return { error() {}, warn() {} };
  },
};

const teamPermissions = require('../pb_hooks/pz_store_team_permissions_lib.js');
const originalHasStorePermission = teamPermissions.hasStorePermission;
teamPermissions.hasStorePermission = () => false;

const monitoring = require('../pb_hooks/pz_security_monitoring_lib.js');
const identity = require('../pb_hooks/pz_security_identity_lib.js');

test.after(() => {
  teamPermissions.hasStorePermission = originalHasStorePermission;
  delete global.$app;
  delete global.__hooks;
});

function auth(storeId = STORE_ID) {
  return record(USER_ID, {
    role: 'store_staff',
    status: 'active',
    store: storeId,
  });
}

function eventFor(body, storeId = STORE_ID) {
  const headers = new Map();
  return {
    response: {
      header() {
        return { set(name, value) { headers.set(name, value); } };
      },
    },
    requestInfo() {
      return { auth: auth(storeId), body };
    },
    json(status, payload) {
      return { status, payload, headers };
    },
  };
}

const endpointCases = [
  {
    name: 'resumen de monitoreo',
    handler: monitoring.handleMonitoringSummary,
    payload: (storeId) => ({ store_id: storeId }),
  },
  {
    name: 'detalle de cliente',
    handler: monitoring.handleCustomerDetail,
    payload: (storeId) => ({
      store_id: storeId,
      customer_id: CUSTOMER_ID,
      orders_page: 1,
      events_page: 1,
    }),
  },
  {
    name: 'lista de bloqueos',
    handler: monitoring.handleSecurityBlocksPage,
    payload: (storeId) => ({
      store_id: storeId,
      page: 1,
      status: 'all',
      scope: 'all',
      search: '',
    }),
  },
  {
    name: 'lista de identidades',
    handler: identity.handleCustomersPage,
    payload: (storeId) => ({
      store_id: storeId,
      page: 1,
      status: 'all',
      search: '',
    }),
  },
  {
    name: 'fusión de identidades',
    handler: identity.handleMergeCustomers,
    payload: (storeId) => ({
      store_id: storeId,
      canonical_customer_id: CUSTOMER_ID,
      source_customer_id: OTHER_CUSTOMER_ID,
      reason: 'Revisión manual',
    }),
  },
];

for (const endpoint of endpointCases) {
  test(`${endpoint.name}: una tienda de otro tenant responde 404 sin revelar permisos`, () => {
    const response = endpoint.handler(eventFor(endpoint.payload(OTHER_STORE_ID)));
    assert.equal(response.status, 404);
    assert.deepEqual(response.payload, { ok: false, error: 'not_found' });
  });

  test(`${endpoint.name}: la tienda propia sin permiso responde 403`, () => {
    const response = endpoint.handler(eventFor(endpoint.payload(STORE_ID)));
    assert.equal(response.status, 403);
    assert.deepEqual(response.payload, { ok: false, error: 'permission_denied' });
  });
}

test('Master recibe 404 para una tienda inexistente en vez de security_disabled', () => {
  const missingStoreId = 'storeteam000099';
  const master = record(USER_ID, { role: 'master_admin', status: 'active', store: '' });
  const e = eventFor({ store_id: missingStoreId });
  e.requestInfo = () => ({ auth: master, body: { store_id: missingStoreId } });

  const response = monitoring.handleMonitoringSummary(e);
  assert.equal(response.status, 404);
  assert.deepEqual(response.payload, { ok: false, error: 'not_found' });
});
