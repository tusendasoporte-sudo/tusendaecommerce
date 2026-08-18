const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const users = require('../pb_hooks/pz_master_store_users_lib.js');
const hook = read('pb_hooks/pz_master_store_users.pb.js');
const lib = read('pb_hooks/pz_master_store_users_lib.js');
const migration = read('pb_migrations/1783386900_store_user_deletion.js');

const STORE_ID = 'storedelete0001';
const USER_ID = 'userdelete00001';

function record(values, id = USER_ID) {
  return { id, get(key) { return values[key]; } };
}

function deletePayload(overrides = {}) {
  return {
    store_id: STORE_ID,
    user_id: USER_ID,
    confirmation_email: 'Usuario@Ejemplo.COM',
    reason: 'Solicitud administrativa validada',
    ...overrides,
  };
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `falta function ${name}`);
  const candidates = [
    source.indexOf('\nfunction ', start + 1),
    source.indexOf('\nmodule.exports', start + 1),
  ].filter((value) => value >= 0);
  const end = candidates.length ? Math.min(...candidates) : source.length;
  return source.slice(start, end).trim();
}

test('endpoint privado POST de eliminacion esta registrado con auth limite y no-store', () => {
  assert.match(hook, /"POST",\s*"\/api\/pz\/master\/store-users\/delete"/s);
  assert.match(hook, /handleDelete/);
  assert.match(hook, /requireAuthenticatedUser/);
  assert.match(hook, /\$apis\.requireAuth\(\)/);
  assert.match(hook, /\$apis\.bodyLimit\(4096\)/);
  assert.match(hook, /\$apis\.skipSuccessActivityLog\(\)/);
  assert.match(lib, /Cache-Control", "private, no-store/);
});

test('payload de eliminacion es exacto normaliza email y exige motivo', () => {
  const parsed = users.parseDeletePayload(deletePayload());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.confirmationEmail, 'usuario@ejemplo.com');
  assert.equal(users.parseDeletePayload({ ...deletePayload(), tokenKey: 'x' }).error, 'invalid_payload');
  assert.equal(users.parseDeletePayload(deletePayload({ confirmation_email: 'invalido' })).error, 'delete_confirmation_mismatch');
  assert.equal(users.parseDeletePayload(deletePayload({ reason: '   ' })).error, 'delete_reason_required');
  assert.equal(users.parseDeletePayload(deletePayload({ reason: 'x'.repeat(501) })).error, 'invalid_payload');
});

test('proyeccion protege admin activo suspendido y tiendas heredadas inconsistentes', () => {
  assert.equal(users.projectedActiveAdminsAfterDeletion({ active_admins: 2 }, { role: 'store_admin', status: 'active' }), 1);
  assert.equal(users.projectedActiveAdminsAfterDeletion({ active_admins: 1 }, { role: 'store_admin', status: 'active' }), 0);
  assert.equal(users.projectedActiveAdminsAfterDeletion({ active_admins: 1 }, { role: 'store_admin', status: 'suspended' }), 1);
  assert.equal(users.projectedActiveAdminsAfterDeletion({ active_admins: 0 }, { role: 'store_admin', status: 'suspended' }), 0);
  assert.equal(users.projectedActiveAdminsAfterDeletion({ active_admins: 1 }, { role: 'store_staff', status: 'active' }), 1);
});

test('auditoria user_deleted conserva snapshots y nunca secretos', () => {
  const store = record({ name: 'Tienda', slug: 'tienda' }, STORE_ID);
  const actor = record({ email: 'master@example.com', display_name: 'Master', role: 'master_admin', status: 'active' }, 'masterdelete001');
  const target = record({ email: 'staff@example.com', display_name: 'Staff', phone: '555', role: 'store_staff', status: 'active' });
  const snapshot = users.userSnapshot(target);
  const audit = users.buildAuditValues(store, actor, target, 'user_deleted', snapshot, null, true, 'Motivo privado');
  assert.equal(audit.target_user_id_snapshot, USER_ID);
  assert.equal(audit.previous_email, 'staff@example.com');
  assert.equal(audit.previous_display_name, 'Staff');
  assert.equal(audit.previous_phone, '555');
  assert.equal(audit.previous_role, 'store_staff');
  assert.equal(audit.previous_status, 'active');
  assert.equal(audit.new_email, '');
  assert.equal(audit.sessions_revoked, true);
  for (const forbidden of ['password', 'hash', 'token', 'digest', 'cookie', 'payload']) {
    assert.equal(JSON.stringify(audit).toLowerCase().includes(forbidden), false);
  }
});

test('migracion agrega user_deleted y down restaura exactamente acciones previas', () => {
  assert.match(migration, /const DELETION_ACTION = "user_deleted"/);
  for (const action of ['user_created', 'user_updated', 'password_changed', 'sessions_revoked', 'self_password_changed', 'temporary_password_issued', 'forced_password_changed']) {
    assert.match(migration, new RegExp(`"${action}"`));
  }
  assert.match(migration, /deleteDeletionAudits\(app\);[\s\S]*replaceActionField\(audit, PREVIOUS_ACTIONS\)/);
  assert.doesNotMatch(migration, /findCollectionByNameOrId\("users"\)|app\.save\(users\)/);
});

test('orden transaccional audita limpia referencias dispositivos y borra fisicamente', () => {
  const transaction = functionSource(lib, 'deleteStoreUserTransactional');
  const handler = functionSource(lib, 'handleDelete');
  const ordered = [
    'userSnapshot',
    'projectedActiveAdminsAfterDeletion',
    'createAudit',
    'user.refreshTokenKey',
    'assertNoUnexpectedRequiredUserRelations',
    'clearOptionalUserRelations',
    'clearDeviceAuditRelations',
    'app.delete(device)',
    'deleteTargetAccessRecords',
    'app.delete(user)',
    'findRecord(app, "users"',
    'findActivityBySource',
  ].map((token) => transaction.indexOf(token));
  assert.equal(ordered.every((value) => value >= 0), true);
  assert.deepEqual([...ordered].sort((a, b) => a - b), ordered);
  assert.match(handler, /\$app\.runInTransaction/);
  assert.match(handler, /deleteStoreUserTransactional/);
  assert.match(transaction, /user_deleted: true/);
  assert.match(transaction, /sessions_revoked: true/);
  const accessCleanup = functionSource(lib, 'deleteTargetAccessRecords');
  const accessLoader = functionSource(lib, 'loadTargetAccessRecords');
  assert.match(accessLoader, /store_user_access/);
  assert.match(accessCleanup, /loadTargetAccessRecords/);
  assert.match(accessCleanup, /app\.delete\(record\)/);
  assert.match(accessCleanup, /loadTargetAccessRecords[\s\S]*loadTargetAccessRecords/);
  const specializedAudit = functionSource(lib, 'createAudit');
  const centralAudit = functionSource(lib, 'centralUserActivity');
  assert.match(specializedAudit, /centralUserActivity/);
  assert.match(centralAudit, /createActivity/);
});

test('inventario dinamico limpia opcionales y falla cerrado ante requeridas inesperadas', () => {
  assert.match(lib, /app\.findAllCollections\(\)/);
  assert.match(lib, /field\.collectionId/);
  assert.match(lib, /field\.required/);
  assert.match(lib, /isOwnedDeviceUserRelation/);
  assert.match(lib, /throw codedError\("user_delete_failed"\)/);
  assert.match(lib, /record\.set\(field\.name, Number\(field\.maxSelect/);
  assert.match(lib, /store_user_device_audit/);
  assert.match(lib, /function deleteAdminAppDeliveryForUser/);
  assert.match(lib, /admin_app_download_tickets/);
  assert.match(lib, /admin_app_release_assignments/);
  assert.match(lib, /admin_app_release_events/);
  assert.doesNotMatch(lib, /collection\("users"\)\.delete|users\.deleteRule\s*=/);
});
