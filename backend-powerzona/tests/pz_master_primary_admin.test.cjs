'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const primary = require('../pb_hooks/pz_master_primary_admin_lib.js');
const masterUsers = require('../pb_hooks/pz_master_store_users_lib.js');

const STORE_ID = 'storeteam000001';
const MASTER_ID = 'masterteam00001';
const OLD_PRIMARY_ID = 'primaryteam0001';
const NEW_PRIMARY_ID = 'newadminteam001';
const OTHER_STORE_ID = 'storeteam000002';

for (const id of [STORE_ID, MASTER_ID, OLD_PRIMARY_ID, NEW_PRIMARY_ID, OTHER_STORE_ID]) {
  assert.equal(id.length, 15, `fixture id ${id}`);
}

function mutableRecord(id, values = {}) {
  return {
    id,
    ...values,
    refreshed: 0,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    set(key, value) { this[key] = value; },
    refreshTokenKey() { this.refreshed += 1; },
  };
}

function store(overrides = {}) {
  return mutableRecord(STORE_ID, {
    name: 'Tienda Master',
    slug: 'tienda-master',
    primary_admin_user: '',
    plan: 'premium',
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: true,
    ...overrides,
  });
}

function user(id, overrides = {}) {
  return mutableRecord(id, {
    email: `${id}@example.test`,
    display_name: id,
    phone: '',
    role: 'store_admin',
    status: 'active',
    store: STORE_ID,
    created: '2026-07-01T00:00:00.000Z',
    ...overrides,
  });
}

function assignPayload(overrides = {}) {
  return {
    store_id: STORE_ID,
    user_id: NEW_PRIMARY_ID,
    reason: 'Definición inicial validada',
    ...overrides,
  };
}

function replacePayload(overrides = {}) {
  return {
    store_id: STORE_ID,
    user_id: NEW_PRIMARY_ID,
    previous_user_mode: 'keep_active',
    template_code: 'read_only',
    permissions: ['catalog.view', 'orders.view', 'notifications.view', 'analytics.view', 'security.view'],
    reason: 'Reemplazo de emergencia aprobado',
    confirmation: primary.REPLACEMENT_CONFIRMATION,
    ...overrides,
  };
}

test('los payloads Master son exactos y exigen motivo y confirmación fuerte', () => {
  assert.equal(primary.parseStatusPayload({ store_id: STORE_ID }).ok, true);
  assert.equal(primary.parseStatusPayload({ store_id: STORE_ID, actor_id: MASTER_ID }).error, 'invalid_payload');
  assert.equal(primary.parseAssignPayload(assignPayload()).ok, true);
  assert.equal(primary.parseAssignPayload(assignPayload({ reason: '' })).error, 'replacement_reason_required');
  assert.equal(primary.parseReplacePayload(replacePayload()).ok, true);
  assert.equal(
    primary.parseReplacePayload(replacePayload({ confirmation: 'REEMPLAZAR' })).error,
    'replacement_confirmation_mismatch',
  );
  assert.equal(
    primary.parseReplacePayload(replacePayload({ actor_id: MASTER_ID })).error,
    'invalid_payload',
  );
});

test('la plantilla del anterior se normaliza y nunca admite permisos reservados', () => {
  const readOnly = primary.permissionSelection('read_only', replacePayload().permissions);
  assert.equal(readOnly.templateCode, 'read_only');
  assert.deepEqual(readOnly.permissions, [
    'analytics.view',
    'catalog.view',
    'notifications.view',
    'orders.view',
    'security.view',
  ]);
  const customized = primary.permissionSelection('read_only', ['catalog.products.edit']);
  assert.equal(customized.templateCode, 'custom');
  assert.deepEqual(customized.permissions, ['catalog.products.edit', 'catalog.view']);
  assert.throws(
    () => primary.permissionSelection('custom', ['team.manage']),
    (error) => error.code === 'reserved_permission',
  );
});

test('solo un Master activo y un store_admin activo de la misma tienda son válidos', () => {
  assert.equal(primary.isActiveMaster(user(MASTER_ID, { role: 'master_admin' })), true);
  assert.equal(primary.isActiveMaster(user(MASTER_ID, { role: 'master_admin', status: 'suspended' })), false);
  assert.equal(primary.isActiveMaster(user(MASTER_ID, { role: 'store_admin' })), false);
  assert.equal(primary.isActivePrimaryCandidate(user(NEW_PRIMARY_ID), STORE_ID), true);
  assert.equal(primary.isActivePrimaryCandidate(user(NEW_PRIMARY_ID, { status: 'suspended' }), STORE_ID), false);
  assert.equal(primary.isActivePrimaryCandidate(user(NEW_PRIMARY_ID, { role: 'store_staff' }), STORE_ID), false);
  assert.equal(primary.isActivePrimaryCandidate(user(NEW_PRIMARY_ID, { store: OTHER_STORE_ID }), STORE_ID), false);
});

test('la respuesta sanitizada nunca expone credenciales ni claves de sesión', () => {
  const sanitized = primary.sanitizeCandidate(user(NEW_PRIMARY_ID, {
    password: 'plain-secret',
    tokenKey: 'refresh-secret',
    verified: true,
    username: 'internal-name',
  }), NEW_PRIMARY_ID);
  assert.deepEqual(Object.keys(sanitized), [
    'id',
    'email',
    'display_name',
    'phone',
    'role',
    'status',
    'created',
    'is_primary_admin',
  ]);
  const serialized = JSON.stringify(sanitized);
  for (const forbidden of ['plain-secret', 'refresh-secret', 'password', 'tokenKey', 'username']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('el estado distingue principal configurado, pendiente y tienda sin candidato', () => {
  const configuredStore = store({ primary_admin_user: OLD_PRIMARY_ID });
  assert.equal(primary.primaryState(configuredStore, user(OLD_PRIMARY_ID), 2), 'configured');
  assert.equal(primary.primaryState(configuredStore, user(OLD_PRIMARY_ID, { status: 'suspended' }), 1), 'configured_invalid');
  assert.equal(primary.primaryState(store(), null, 2), 'pending_multiple');
  assert.equal(primary.primaryState(store(), null, 1), 'pending_single');
  assert.equal(primary.primaryState(store(), null, 0), 'missing');
});

test('el reemplazo valida el cupo proyectado y suspender al anterior libera uno', () => {
  const previous = user(OLD_PRIMARY_ID);
  assert.equal(primary.projectedReplacementActiveUsers(4, previous, 'keep_active'), 4);
  assert.equal(primary.projectedReplacementActiveUsers(4, previous, 'suspend'), 3);
  assert.equal(primary.assertProjectedActiveUsers(4, 4), true);
  assert.throws(
    () => primary.assertProjectedActiveUsers(5, 4),
    (error) => error.code === 'active_user_limit_reached',
  );
});

function transactionFixture({ configured = false, extraActive = 0 } = {}) {
  const currentStore = store({ primary_admin_user: configured ? OLD_PRIMARY_ID : '' });
  const actor = user(MASTER_ID, { role: 'master_admin', store: '' });
  const oldPrimary = user(OLD_PRIMARY_ID);
  const nextPrimary = user(NEW_PRIMARY_ID);
  const users = new Map([
    [actor.id, actor],
    [oldPrimary.id, oldPrimary],
    [nextPrimary.id, nextPrimary],
  ]);
  for (let index = 1; index <= extraActive; index += 1) {
    const id = `extrausr${String(index).padStart(7, '0')}`;
    users.set(id, user(id, { role: 'store_staff' }));
  }
  const accesses = [];
  const audits = [];
  const locks = [];
  const collections = {
    store_user_access: { name: 'store_user_access', fields: { getByName: () => ({}) } },
    store_user_audit: { name: 'store_user_audit', fields: { getByName: () => ({}) } },
  };

  class FakeRecord {
    constructor(collection) {
      this._collection = collection;
      this.values = {};
      this.id = `${collection.name === 'store_user_access' ? 'access' : 'audit'}${String(accesses.length + audits.length + 1).padStart(9, '0')}`.slice(0, 15);
    }
    collection() { return this._collection; }
    get(key) { return this.values[key]; }
    getString(key) { return String(this.values[key] || ''); }
    set(key, value) { this.values[key] = value; this[key] = value; }
  }

  const previousRecord = global.Record;
  const previousArrayOf = global.arrayOf;
  const previousDynamicModel = global.DynamicModel;
  global.Record = FakeRecord;
  global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
  global.arrayOf = () => [];

  const app = {
    findRecordById(collection, id) {
      const value = collection === 'stores' && id === currentStore.id ? currentStore : users.get(id);
      if (!value) throw new Error('not_found');
      return value;
    },
    findCollectionByNameOrId(name) {
      if (!collections[name]) throw new Error('collection_not_found');
      return collections[name];
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection !== 'store_user_access') throw new Error('not_found');
      const value = accesses.find((entry) => entry.store === params.storeId && entry.user === params.userId);
      if (!value) throw new Error('not_found');
      return value;
    },
    db() {
      return {
        newQuery(sql) {
          const state = { bindings: {} };
          return {
            bind(bindings) { state.bindings = bindings || {}; return this; },
            execute() { locks.push({ sql, bindings: state.bindings }); },
            all(rows) {
              if (/COUNT\(\*\) AS activeUsers/.test(sql)) {
                rows.push({ activeUsers: [...users.values()].filter((entry) => entry.store === STORE_ID && entry.status === 'active' && ['store_admin', 'store_staff'].includes(entry.role)).length });
                return;
              }
              if (/SELECT id\s+FROM users/.test(sql)) {
                [...users.values()]
                  .filter((entry) => entry.store === STORE_ID && entry.role === 'store_admin' && entry.status === 'active')
                  .forEach((entry) => rows.push({ id: entry.id }));
              }
            },
          };
        },
      };
    },
    save(record) {
      if (record._collection?.name === 'store_user_access' && !accesses.includes(record)) accesses.push(record);
      if (record._collection?.name === 'store_user_audit' && !audits.includes(record)) audits.push(record);
      return record;
    },
  };

  return {
    app,
    actor,
    currentStore,
    oldPrimary,
    nextPrimary,
    accesses,
    audits,
    locks,
    restore() {
      global.Record = previousRecord;
      global.arrayOf = previousArrayOf;
      global.DynamicModel = previousDynamicModel;
    },
  };
}

test('asignar bloquea tienda, cierra sesiones del nuevo principal y audita atómicamente', () => {
  const fixture = transactionFixture();
  try {
    const parsed = primary.parseAssignPayload(assignPayload()).value;
    const result = primary.assignPrimaryAdminInTransaction(fixture.app, MASTER_ID, parsed);
    assert.equal(fixture.currentStore.primary_admin_user, NEW_PRIMARY_ID);
    assert.equal(fixture.nextPrimary.refreshed, 1);
    assert.equal(fixture.locks.length, 1);
    assert.match(fixture.locks[0].sql, /UPDATE stores SET id = id/);
    assert.deepEqual(fixture.audits.map((entry) => entry.action), ['primary_admin_assigned']);
    assert.equal(fixture.audits[0].sessions_revoked, true);
    assert.equal(fixture.audits[0].new_permissions_json.includes('team.manage'), true);
    assert.equal(fixture.audits[0].new_permissions_json.includes('primary_admin.replace'), false);
    assert.equal(result.state, 'configured');
  } finally {
    fixture.restore();
  }
});

test('reemplazar cierra ambas sesiones y deja al anterior con plantilla validada', () => {
  const fixture = transactionFixture({ configured: true });
  try {
    const parsed = primary.parseReplacePayload(replacePayload()).value;
    const result = primary.replacePrimaryAdminInTransaction(fixture.app, MASTER_ID, parsed);
    assert.equal(fixture.currentStore.primary_admin_user, NEW_PRIMARY_ID);
    assert.equal(fixture.oldPrimary.refreshed, 1);
    assert.equal(fixture.nextPrimary.refreshed, 1);
    assert.equal(fixture.oldPrimary.status, 'active');
    assert.equal(fixture.oldPrimary.role, 'store_staff');
    assert.equal(fixture.accesses.length, 1);
    assert.equal(fixture.accesses[0].template_code, 'read_only');
    assert.deepEqual(fixture.accesses[0].permissions_json, [
      'analytics.view',
      'catalog.view',
      'notifications.view',
      'orders.view',
      'security.view',
    ]);
    assert.deepEqual(fixture.audits.map((entry) => entry.action), [
      'primary_admin_replaced',
      'team_user_updated',
    ]);
    assert.equal(fixture.audits[0].target_user, NEW_PRIMARY_ID);
    assert.equal(fixture.audits[0].previous_email, fixture.nextPrimary.email);
    assert.equal(fixture.audits[0].new_email, fixture.nextPrimary.email);
    assert.equal(fixture.audits[0].new_permissions_json.includes('team.manage'), true);
    assert.equal(fixture.audits[1].target_user, OLD_PRIMARY_ID);
    assert.equal(fixture.audits[1].previous_permissions_json.includes('team.manage'), true);
    assert.equal(result.primary_admin.id, NEW_PRIMARY_ID);
  } finally {
    fixture.restore();
  }
});

test('asignación y reemplazo Master validan el cupo Premium dentro del flujo transaccional', () => {
  const assignment = transactionFixture({ extraActive: 3 });
  try {
    assert.throws(
      () => primary.assignPrimaryAdminInTransaction(assignment.app, MASTER_ID, primary.parseAssignPayload(assignPayload()).value),
      (error) => error.code === 'active_user_limit_reached',
    );
    assert.equal(assignment.currentStore.primary_admin_user, '');
    assert.equal(assignment.audits.length, 0);
  } finally {
    assignment.restore();
  }

  const replacement = transactionFixture({ configured: true, extraActive: 3 });
  try {
    assert.throws(
      () => primary.replacePrimaryAdminInTransaction(replacement.app, MASTER_ID, primary.parseReplacePayload(replacePayload()).value),
      (error) => error.code === 'active_user_limit_reached',
    );
    assert.equal(replacement.currentStore.primary_admin_user, OLD_PRIMARY_ID);
    assert.equal(replacement.oldPrimary.refreshed, 0);
    assert.equal(replacement.audits.length, 0);
  } finally {
    replacement.restore();
  }
});

test('la auditoría primaria no contiene contraseñas, tokens ni secretos', () => {
  const values = primary.buildAuditValues(
    store(),
    user(MASTER_ID, { role: 'master_admin', tokenKey: 'actor-secret' }),
    user(NEW_PRIMARY_ID, { password: 'target-secret', tokenKey: 'target-token' }),
    'primary_admin_assigned',
    null,
    { email: 'new@example.test', display_name: 'Nuevo', phone: '', role: 'store_admin', status: 'active', permissions: [] },
    'Cambio aprobado',
  );
  const serialized = JSON.stringify(values).toLowerCase();
  for (const secret of ['password', 'tokenkey', 'actor-secret', 'target-secret', 'target-token']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test('la API de auditoría Master conserva acciones y snapshots M7U2 sanitizados', () => {
  const mapped = masterUsers.mapAudit(mutableRecord('auditmaster0001', {
    action: 'primary_admin_replaced',
    actor_name_snapshot: 'Master',
    actor_role_snapshot: 'master_admin',
    previous_email: 'new@example.test',
    new_email: 'new@example.test',
    previous_role: 'store_admin',
    new_role: 'store_admin',
    previous_status: 'active',
    new_status: 'active',
    previous_template_code: 'secondary_admin',
    new_template_code: '',
    previous_permissions_json: ['catalog.view', 'bad permission', 'team.manage'],
    new_permissions_json: ['team.manage', 'catalog.view'],
    sessions_revoked: true,
    created: '2026-07-19T12:00:00.000Z',
  }));
  assert.equal(mapped.action, 'primary_admin_replaced');
  assert.equal(mapped.previous_template_code, 'secondary_admin');
  assert.deepEqual(mapped.previous_permissions, ['catalog.view', 'team.manage']);
  assert.deepEqual(mapped.new_permissions, ['catalog.view', 'team.manage']);
});

test('stores.primary_admin_user solo cambia por el endpoint oficial', () => {
  const original = store({ primary_admin_user: OLD_PRIMARY_ID });
  const changed = store({ primary_admin_user: NEW_PRIMARY_ID });
  changed.original = () => original;
  assert.equal(primary.directPrimaryAdminMutationAttempt({ record: changed }), true);

  const directCreate = store({ primary_admin_user: NEW_PRIMARY_ID });
  assert.equal(primary.directPrimaryAdminMutationAttempt({ record: directCreate }), true);

  const safeCreate = store({ primary_admin_user: '' });
  assert.equal(primary.directPrimaryAdminMutationAttempt({ record: safeCreate }), false);

  const same = store({ primary_admin_user: OLD_PRIMARY_ID });
  same.original = () => original;
  assert.equal(primary.directPrimaryAdminMutationAttempt({ record: same, requestInfo: () => ({ body: { name: 'Otra' } }) }), false);

  const routeSource = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_master_primary_admin.pb.js'), 'utf8');
  assert.match(routeSource, /onRecordUpdateRequest[\s\S]*rejectDirectPrimaryAdminMutation[\s\S]*"stores"/);
  assert.match(routeSource, /onRecordCreateRequest[\s\S]*rejectDirectPrimaryAdminMutation[\s\S]*"stores"/);
  assert.match(routeSource, /\/api\/pz\/master\/primary-admin\/assign/);
  assert.match(routeSource, /\/api\/pz\/master\/primary-admin\/replace/);
});

test('edición y borrado Master genéricos exigen primero el reemplazo del principal', () => {
  const currentStore = store({ primary_admin_user: OLD_PRIMARY_ID });
  assert.equal(masterUsers.isPrimaryAdminUser(currentStore, user(OLD_PRIMARY_ID)), true);
  assert.equal(masterUsers.isPrimaryAdminUser(currentStore, user(NEW_PRIMARY_ID)), false);
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_master_store_users_lib.js'), 'utf8');
  assert.match(source, /next\.role !== "store_admin" \|\| next\.status !== "active"/);
  assert.match(source, /function handleDelete[\s\S]*isPrimaryAdminUser\(loaded\.store, user\)[\s\S]*primary_admin_replacement_required/);
});
