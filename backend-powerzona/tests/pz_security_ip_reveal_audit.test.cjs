'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const HOOKS_ROOT = path.resolve(__dirname, '../pb_hooks').replace(/\\/g, '/');
const MIGRATION_PATH = path.resolve(__dirname, '../pb_migrations/1784595800_store_activity_audit.js');
const AES_KEY = '0123456789abcdef0123456789abcdef';
const STORE_A = 'storeaudit00001';
const STORE_B = 'storeaudit00002';
const ACTOR_ID = 'masteraudit0001';
const EVENT_ID = 'eventaudit00001';
const SESSION_ID = 'sessaudit000001';
const PAGEVIEW_ID = 'pageaudit000001';
const CUSTOMER_ID = 'customeraudit01';
const SOURCE_CUSTOMER_ID = 'customeraudit02';

for (const id of [STORE_A, STORE_B, ACTOR_ID, EVENT_ID, SESSION_ID, PAGEVIEW_ID, CUSTOMER_ID, SOURCE_CUSTOMER_ID]) {
  assert.equal(id.length, 15, `fixture id ${id}`);
}

const previousGlobals = {
  __hooks: global.__hooks,
  $app: global.$app,
  $os: global.$os,
  $security: global.$security,
  Record: global.Record,
};

global.__hooks = HOOKS_ROOT;
global.$os = {
  getenv(name) {
    return name === 'PZ_SECURITY_AES_KEY' ? AES_KEY : '';
  },
};
global.$security = {
  decrypt(ciphertext, key) {
    assert.equal(key, AES_KEY);
    const values = {
      'cipher-event-a': '203.0.113.7',
      'cipher-session-a': '2001:db8::7',
      'cipher-pageview-b': '198.51.100.23',
    };
    return values[ciphertext] || '';
  },
};

let auditSequence = 0;
class FakeRecord {
  constructor(collection) {
    auditSequence += 1;
    this.collection = collection;
    this.id = `auditip${String(auditSequence).padStart(8, '0')}`;
    this.values = {};
  }

  set(key, value) { this.values[key] = value; }
  get(key) { return this.values[key]; }
  getString(key) { return String(this.values[key] || ''); }
}
global.Record = FakeRecord;

const storeActivity = require('../pb_hooks/pz_store_activity_audit_lib.js');
const originalCreateActivity = storeActivity.createActivity;
const centralActivities = [];
let failCentralAudit = false;
storeActivity.createActivity = (_app, input) => {
  if (failCentralAudit) throw new Error('central_audit_failed');
  centralActivities.push(input);
  return { id: `central${String(centralActivities.length).padStart(8, '0')}` };
};

const monitoring = require('../pb_hooks/pz_security_monitoring_lib.js');
const identity = require('../pb_hooks/pz_security_identity_lib.js');

test.after(() => {
  storeActivity.createActivity = originalCreateActivity;
  for (const [key, value] of Object.entries(previousGlobals)) {
    if (value === undefined) delete global[key];
    else global[key] = value;
  }
});

function record(id, values = {}) {
  return {
    id,
    ...values,
    set(key, value) { this[key] = value; },
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    getBool(key) { return this[key] === true; },
  };
}

function makeApp() {
  const stores = new Map([
    [STORE_A, record(STORE_A, { plan: 'premium', status: 'active' })],
    [STORE_B, record(STORE_B, { plan: 'premium', status: 'active' })],
  ]);
  const actor = record(ACTOR_ID, { role: 'master_admin', status: 'active', store: '' });
  const settings = new Map([
    [STORE_A, record('settingsaudit01', { store: STORE_A, mode: 'monitoring', ip_visibility: 'full' })],
    [STORE_B, record('settingsaudit02', { store: STORE_B, mode: 'monitoring', ip_visibility: 'full' })],
  ]);
  const sources = {
    store_security_events: [record(EVENT_ID, { store: STORE_A, ip_encrypted: 'cipher-event-a' })],
    store_visitor_sessions: [record(SESSION_ID, { store: STORE_A, latest_ip_encrypted: 'cipher-session-a' })],
    store_visitor_pageviews: [record(PAGEVIEW_ID, { store: STORE_B, ip_encrypted: 'cipher-pageview-b' })],
  };
  const saved = [];
  const trackedRecords = [];
  let transactionCalls = 0;

  const app = {
    get transactionCalls() { return transactionCalls; },
    saved,
    trackForRollback(value) {
      trackedRecords.push(value);
    },
    findCollectionByNameOrId(name) {
      return {
        name,
        fields: { getByName(fieldName) { return { name: fieldName }; } },
      };
    },
    findRecordById(collection, id) {
      if (collection === 'stores' && stores.has(id)) return stores.get(id);
      if (collection === 'users' && id === ACTOR_ID) return actor;
      throw new Error('not_found');
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection === 'store_security_settings' && settings.has(params.store)) {
        return settings.get(params.store);
      }
      throw new Error('not_found');
    },
    findRecordsByFilter(collection, _filter, _sort, _limit, _offset, params) {
      const requestedIds = new Set(Object.values(params || {}));
      return (sources[collection] || []).filter((item) => requestedIds.has(item.id));
    },
    save(value) {
      saved.push(value);
      return value;
    },
    runInTransaction(callback) {
      transactionCalls += 1;
      const savedLength = saved.length;
      const trackedSnapshots = trackedRecords.map((value) => ({ value, snapshot: { ...value } }));
      try {
        return callback(app);
      } catch (error) {
        saved.length = savedLength;
        trackedSnapshots.forEach(({ value, snapshot }) => {
          Object.keys(value).forEach((key) => { delete value[key]; });
          Object.assign(value, snapshot);
        });
        throw error;
      }
    },
    logger() {
      return { error() {}, warn() {} };
    },
  };
  return { app, actor };
}

function resolveEvent(actor) {
  const headers = new Map();
  return {
    response: {
      header() {
        return { set(name, value) { headers.set(name, value); } };
      },
    },
    requestInfo() {
      return {
        auth: actor,
        body: {
          items: [
            { source: 'security_event', id: EVENT_ID },
            { source: 'visitor_session', id: SESSION_ID },
            { source: 'visitor_pageview', id: PAGEVIEW_ID },
          ],
        },
      };
    },
    json(status, payload) {
      return { status, payload, headers };
    },
  };
}

function auditValues(app) {
  return app.saved.map((item) => ({ id: item.id, ...item.values }));
}

test('revelar IP crea auditoría especializada por tienda y eventos centrales agregados sin datos revelados', () => {
  failCentralAudit = false;
  centralActivities.length = 0;
  const { app, actor } = makeApp();
  global.$app = app;

  const response = monitoring.handleResolveIps(resolveEvent(actor));

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.items, [
    { source: 'security_event', id: EVENT_ID, ip: '203.0.113.7' },
    { source: 'visitor_session', id: SESSION_ID, ip: '2001:0db8:0000:0000:0000:0000:0000:0007' },
    { source: 'visitor_pageview', id: PAGEVIEW_ID, ip: '198.51.100.23' },
  ]);
  assert.equal(app.transactionCalls, 1);

  const specialized = auditValues(app);
  assert.equal(specialized.length, 2);
  assert.equal(centralActivities.length, 2);
  assert.deepEqual(specialized.map((item) => item.store).sort(), [STORE_A, STORE_B]);
  assert.equal(specialized.every((item) => item.action === 'ip_information_revealed'), true);
  assert.equal(specialized.every((item) => item.subject_record_id === ''), true);

  const auditA = specialized.find((item) => item.store === STORE_A);
  const auditB = specialized.find((item) => item.store === STORE_B);
  assert.equal(auditA.events_affected, 1);
  assert.equal(auditA.sessions_affected, 1);
  assert.equal(auditA.pageviews_affected, 0);
  assert.equal(auditB.events_affected, 0);
  assert.equal(auditB.sessions_affected, 0);
  assert.equal(auditB.pageviews_affected, 1);

  for (const activity of centralActivities) {
    assert.equal(activity.action, 'ip_information_revealed');
    assert.equal(activity.severity, 'critical');
    assert.deepEqual(activity.changedFields, ['protected_information_access']);
    assert.deepEqual(activity.previousValues, { protected_information_access: 'protected' });
    assert.deepEqual(activity.newValues, { protected_information_access: 'revealed_authorized' });
    assert.equal(activity.resourceId, '');
  }

  const persisted = JSON.stringify({ specialized, centralActivities });
  for (const forbidden of [
    EVENT_ID,
    SESSION_ID,
    PAGEVIEW_ID,
    '203.0.113.7',
    '2001:db8::7',
    '2001:0db8:0000:0000:0000:0000:0000:0007',
    '198.51.100.23',
    'cipher-event-a',
    'cipher-session-a',
    'cipher-pageview-b',
  ]) {
    assert.equal(persisted.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(persisted, /hmac|ciphertext/i);
});

test('si falla el evento central, la auditoría especializada revierte y nunca se devuelve la IP', () => {
  failCentralAudit = true;
  centralActivities.length = 0;
  const { app, actor } = makeApp();
  global.$app = app;

  const response = monitoring.handleResolveIps(resolveEvent(actor));

  assert.equal(response.status, 500);
  assert.deepEqual(response.payload, { ok: false, error: 'resolve_failed' });
  assert.equal(app.transactionCalls, 1);
  assert.equal(app.saved.length, 0);
  assert.equal(centralActivities.length, 0);
  const serialized = JSON.stringify(response);
  assert.doesNotMatch(serialized, /203\.0\.113\.7|2001:(?:db8::7|0db8:0000:0000:0000:0000:0000:0007)|198\.51\.100\.23/);
  assert.equal(serialized.includes(EVENT_ID), false);
  assert.equal(serialized.includes(SESSION_ID), false);
  assert.equal(serialized.includes(PAGEVIEW_ID), false);
  failCentralAudit = false;
});

test('restauración automática archiva cliente y ambas auditorías como una sola unidad system', () => {
  failCentralAudit = false;
  centralActivities.length = 0;
  const { app } = makeApp();
  global.$app = app;
  const customer = record(CUSTOMER_ID, {
    store: STORE_A,
    archived: true,
    archived_at: '2026-07-19T10:00:00Z',
    archived_by: ACTOR_ID,
    archive_reason: 'dato privado anterior',
  });
  app.trackForRollback(customer);

  app.runInTransaction((txApp) => {
    identity._test.autoRestoreArchivedCustomer(txApp, STORE_A, customer);
  });

  assert.equal(customer.archived, false);
  assert.equal(customer.archived_at, '');
  assert.equal(customer.archived_by, '');
  assert.equal(customer.archive_reason, '');
  const specialized = app.saved.filter((item) => item instanceof FakeRecord).map((item) => ({ id: item.id, ...item.values }));
  assert.equal(specialized.length, 1);
  assert.equal(specialized[0].action, 'auto_restore_customer');
  assert.equal(specialized[0].subject_record_id, CUSTOMER_ID);
  assert.equal(centralActivities.length, 1);
  assert.equal(centralActivities[0].action, 'auto_restore_customer');
  assert.equal(centralActivities[0].origin, 'system');
  assert.equal(centralActivities[0].actor, null);
  assert.equal(centralActivities[0].resourceId, '');
  assert.equal(JSON.stringify(centralActivities[0]).includes(CUSTOMER_ID), false);
  assert.equal(JSON.stringify(centralActivities[0]).includes('dato privado anterior'), false);
});

test('fallo de auditoría central revierte también la restauración automática', () => {
  failCentralAudit = true;
  centralActivities.length = 0;
  const { app } = makeApp();
  global.$app = app;
  const customer = record(CUSTOMER_ID, {
    store: STORE_A,
    archived: true,
    archived_at: '2026-07-19T10:00:00Z',
    archived_by: ACTOR_ID,
    archive_reason: 'motivo previo',
  });
  app.trackForRollback(customer);

  assert.throws(() => {
    app.runInTransaction((txApp) => {
      identity._test.autoRestoreArchivedCustomer(txApp, STORE_A, customer);
    });
  }, /central_audit_failed/);
  assert.equal(customer.archived, true);
  assert.equal(customer.archived_at, '2026-07-19T10:00:00Z');
  assert.equal(customer.archived_by, ACTOR_ID);
  assert.equal(customer.archive_reason, 'motivo previo');
  assert.equal(app.saved.length, 0);
  assert.equal(centralActivities.length, 0);
  failCentralAudit = false;
});

test('fusión manual audita solo estado y conteos seguros, sin IDs, PII ni motivo recibido', () => {
  failCentralAudit = false;
  centralActivities.length = 0;
  const { app } = makeApp();
  global.$app = app;
  const maliciousResult = {
    canonical_id: CUSTOMER_ID,
    source_customer_id: SOURCE_CUSTOMER_ID,
    orders_moved: 2.9,
    events_moved: -4,
    sessions_moved: 3,
    pageviews_moved: Number.POSITIVE_INFINITY,
    customer_email: 'cliente@example.com',
    ip: '203.0.113.99',
    hmac: '0123456789abcdef0123456789abcdef',
    reason: 'motivo privado enviado por operador',
  };

  app.runInTransaction((txApp) => {
    identity._test.createManualCustomerMergeAudit(txApp, STORE_A, ACTOR_ID, maliciousResult);
  });

  const specialized = auditValues(app);
  assert.equal(specialized.length, 1);
  assert.equal(specialized[0].action, 'security_customer_identity_merged');
  assert.equal(specialized[0].actor, ACTOR_ID);
  assert.equal(specialized[0].subject_record_id, '');
  assert.equal(specialized[0].reason_internal, '');
  assert.equal(specialized[0].orders_affected, 2);
  assert.equal(specialized[0].events_affected, 0);
  assert.equal(specialized[0].sessions_affected, 3);
  assert.equal(specialized[0].pageviews_affected, 0);
  assert.equal(centralActivities.length, 1);
  assert.equal(centralActivities[0].action, 'security_customer_identity_merged');
  assert.equal(centralActivities[0].severity, 'critical');
  assert.deepEqual(centralActivities[0].changedFields, ['customer_identity_state']);
  assert.deepEqual(centralActivities[0].previousValues, { customer_identity_state: 'separate' });
  assert.deepEqual(centralActivities[0].newValues, { customer_identity_state: 'merged' });

  const persisted = JSON.stringify({ specialized, centralActivities });
  for (const forbidden of [
    CUSTOMER_ID,
    SOURCE_CUSTOMER_ID,
    'cliente@example.com',
    '203.0.113.99',
    '0123456789abcdef0123456789abcdef',
    'motivo privado enviado por operador',
  ]) assert.equal(persisted.includes(forbidden), false, forbidden);
});

test('fallo de auditoría de fusión propaga error y revierte la mutación transaccional', () => {
  failCentralAudit = true;
  centralActivities.length = 0;
  const { app } = makeApp();
  global.$app = app;
  const identityState = record(CUSTOMER_ID, { state: 'separate' });
  app.trackForRollback(identityState);

  assert.throws(() => {
    app.runInTransaction((txApp) => {
      identityState.state = 'merged';
      txApp.save(identityState);
      identity._test.createManualCustomerMergeAudit(txApp, STORE_A, ACTOR_ID, {
        orders_moved: 1,
      });
    });
  }, /central_audit_failed/);
  assert.equal(identityState.state, 'separate');
  assert.equal(app.saved.length, 0);
  assert.equal(centralActivities.length, 0);
  failCentralAudit = false;
});

test('flujos oficiales mantienen auto-restauración y merge con auditoría dentro de sus transacciones', () => {
  const identitySource = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_security_identity_lib.js'), 'utf8');
  const autoStart = identitySource.indexOf('function autoRestoreArchivedCustomer');
  const autoEnd = identitySource.indexOf('function safeMergeAuditCount', autoStart);
  const autoRestore = identitySource.slice(autoStart, autoEnd);
  assert.doesNotMatch(autoRestore, /try\s*\{|catch\s*\(/);
  assert.match(autoRestore, /app\.save\(customer\)[\s\S]*securityMonitoring\.createSecurityAudit/);
  assert.doesNotMatch(identitySource, /function createSecurityAudit\s*\(/);

  const registerStart = identitySource.indexOf('function registerOrderSecurityIdentity');
  const registerEnd = identitySource.indexOf('function relinkOrderToPhoneCustomer', registerStart);
  const registerFlow = identitySource.slice(registerStart, registerEnd);
  assert.match(registerFlow, /\$app\.runInTransaction\(\(txApp\)\s*=>/);
  assert.match(registerFlow, /resolveOrderCanonicalCustomer\(txApp/);

  const mergeStart = identitySource.indexOf('function handleMergeCustomers');
  const mergeEnd = identitySource.indexOf('function handleOrderUpdate', mergeStart);
  const mergeFlow = identitySource.slice(mergeStart, mergeEnd);
  assert.match(mergeFlow, /\$app\.runInTransaction\(\(txApp\)\s*=>/);
  assert.ok(mergeFlow.indexOf('mergeCustomersIntoCanonical(') < mergeFlow.indexOf('createManualCustomerMergeAudit('));
  assert.match(mergeFlow, /createManualCustomerMergeAudit\(txApp/);
});

test('la migración C2 agrega y retira de forma idempotente las acciones especializadas de Seguridad', () => {
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  assert.match(migration, /SECURITY_AUDIT_REVEAL_ACTION\s*=\s*"ip_information_revealed"/);
  assert.match(migration, /SECURITY_AUDIT_MERGE_ACTION\s*=\s*"security_customer_identity_merged"/);
  assert.match(migration, /current\.filter\(\(value\)\s*=>\s*!SECURITY_AUDIT_C2_ACTIONS\.includes\(value\)\)/);
  assert.match(migration, /setSecurityActivityAuditActions\(app, true\)/);
  assert.match(migration, /setSecurityActivityAuditActions\(app, false\)/);
});
