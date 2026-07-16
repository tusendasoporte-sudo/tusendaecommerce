const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const users = require('../pb_hooks/pz_master_store_users_lib.js');
const ROOT = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(ROOT, 'pb_migrations', '1783386800_store_user_temporary_passwords.js'), 'utf8');
const routes = fs.readFileSync(path.join(ROOT, 'pb_hooks', 'pz_master_store_users.pb.js'), 'utf8');
const deviceRoutes = fs.readFileSync(path.join(ROOT, 'pb_hooks', 'pz_store_user_devices.pb.js'), 'utf8');

const STORE_ID = 'storetempu7i700';
const USER_ID = 'usertempu7i7000';

function record(values = {}, id = USER_ID, currentPassword = 'Temporal-1234!') {
  return {
    id,
    get(key) { return values[key]; },
    validatePassword(value) { return value === currentPassword; },
  };
}

test('migracion exacta agrega solo los tres campos temporales y backfill seguro', () => {
  for (const field of ['must_change_password', 'temporary_password_issued_at', 'temporary_password_expires_at']) {
    assert.match(migration, new RegExp(`name: "${field}"`));
  }
  assert.match(migration, /UPDATE users[\s\S]*must_change_password = 0[\s\S]*temporary_password_issued_at = ''[\s\S]*temporary_password_expires_at = ''/);
  assert.doesNotMatch(migration, /force_password_change|temporary_password_hash|reversible/i);
});

test('fechas ocultas, flag visible y down elimina primero auditorias nuevas', () => {
  assert.match(migration, /hidden: false,[\s\S]*name: "must_change_password"/);
  assert.match(migration, /hidden: true,[\s\S]*name: "temporary_password_issued_at"/);
  assert.match(migration, /hidden: true,[\s\S]*name: "temporary_password_expires_at"/);
  const down = migration.slice(migration.indexOf('}, (app) =>'));
  assert.ok(down.indexOf('deleteTemporaryPasswordAudits(app)') < down.indexOf('replaceActionField(audit, PREVIOUS_ACTIONS)'));
  assert.ok(down.indexOf('replaceActionField(audit, PREVIOUS_ACTIONS)') < down.indexOf('USER_FIELD_IDS.forEach'));
});

test('TTL unico es exactamente 72 horas', () => {
  assert.equal(users.TEMPORARY_PASSWORD_TTL_HOURS, 72);
  assert.equal(users.TEMPORARY_PASSWORD_TTL_MS, 72 * 60 * 60 * 1000);
  const dates = users.temporaryPasswordDates(new Date('2026-07-16T12:00:00.000Z'));
  assert.equal(dates.issued_at, '2026-07-16T12:00:00.000Z');
  assert.equal(dates.expires_at, '2026-07-19T12:00:00.000Z');
});

test('estado temporal solo produce none pending o expired', () => {
  const now = new Date('2026-07-16T12:00:00.000Z');
  assert.equal(users.temporaryPasswordState(record({ must_change_password: false }), now), 'none');
  assert.equal(users.temporaryPasswordState(record({ must_change_password: true, temporary_password_expires_at: '2026-07-17T12:00:00.000Z' }), now), 'pending');
  assert.equal(users.temporaryPasswordState(record({ must_change_password: true, temporary_password_expires_at: '2026-07-15T12:00:00.000Z' }), now), 'expired');
  assert.equal(users.temporaryPasswordState(record({ must_change_password: true, temporary_password_expires_at: 'invalid' }), now), 'expired');
});

test('sanitizacion expone estado funcional pero ningun secreto', () => {
  const result = users.sanitizeUser(record({
    email: 'user@example.com', display_name: 'User', role: 'store_staff', status: 'active',
    must_change_password: true,
    temporary_password_issued_at: '2026-07-16T12:00:00.000Z',
    temporary_password_expires_at: '2099-07-19T12:00:00.000Z',
    password: 'Temporal-1234!', tokenKey: 'private', cookie: 'private-cookie',
  }), 1, { last_admin_activity_at: '2026-07-16T12:30:00.000Z', authorized_device_count: 1, device_limit: 5 });
  assert.equal(result.must_change_password, true);
  assert.equal(result.temporary_password_state, 'pending');
  assert.equal(result.last_admin_activity_at, '2026-07-16T12:30:00.000Z');
  const serialized = JSON.stringify(result);
  for (const secret of ['Temporal-1234!', 'private-cookie', 'tokenKey', 'passwordHash']) assert.equal(serialized.includes(secret), false);
});

test('Admin y Staff activos pueden entrar al cambio forzado pero no Master ni suspendidos', () => {
  assert.equal(users.isActiveStoreUser(record({ role: 'store_admin', status: 'active', store: STORE_ID })), true);
  assert.equal(users.isActiveStoreUser(record({ role: 'store_staff', status: 'active', store: STORE_ID })), true);
  assert.equal(users.isActiveStoreUser(record({ role: 'store_staff', status: 'suspended', store: STORE_ID })), false);
  assert.equal(users.isActiveStoreUser(record({ role: 'master_admin', status: 'active', store: '' })), false);
});

test('payload forzado exacto rechaza identidad y campos temporales inyectados', () => {
  const valid = { currentPassword: 'Temporal-1234!', newPassword: 'Personal-5678!', newPasswordConfirm: 'Personal-5678!' };
  assert.equal(users.parseSelfPasswordPayload(valid).ok, true);
  for (const field of ['store_id', 'user_id', 'must_change_password', 'issued_at', 'expires_at', 'ttl']) {
    assert.equal(users.parseSelfPasswordPayload({ ...valid, [field]: 'forbidden' }).error, 'invalid_payload');
  }
  assert.deepEqual(users.parseSelfRevokePayload({}), { ok: true, value: {} });
  assert.equal(users.parseSelfRevokePayload({ user_id: USER_ID }).error, 'invalid_payload');
});

test('acciones temporales rotan sesiones y auditoria Staff solo aplica al cambio forzado', () => {
  assert.equal(users.sessionsMustBeRevoked('temporary_password_issued', {}, {}), true);
  assert.equal(users.sessionsMustBeRevoked('forced_password_changed', {}, {}), true);
  const staff = record({ role: 'store_staff', status: 'active', store: STORE_ID, email: 'staff@example.com' });
  const store = record({ name: 'Store', slug: 'store' }, STORE_ID);
  const snapshot = users.userSnapshot(staff);
  const audit = users.buildAuditValues(store, staff, staff, 'forced_password_changed', snapshot, snapshot, true, '');
  assert.equal(audit.actor_role_snapshot, 'store_staff');
  assert.throws(() => users.buildAuditValues(store, staff, staff, 'self_password_changed', snapshot, snapshot, true, ''));
});

test('auth temporal se ejecuta despues del dispositivo en login y refresh', () => {
  for (const hook of ['onRecordAuthWithPasswordRequest', 'onRecordAuthRefreshRequest']) assert.match(deviceRoutes, new RegExp(hook));
  const login = deviceRoutes.slice(deviceRoutes.indexOf('onRecordAuthWithPasswordRequest'), deviceRoutes.indexOf('onRecordAuthRefreshRequest'));
  assert.ok(login.indexOf('enforceLoginDevice') < login.indexOf('enforceTemporaryPasswordAuthentication'));
  const refresh = deviceRoutes.slice(deviceRoutes.indexOf('onRecordAuthRefreshRequest'));
  assert.ok(refresh.indexOf('enforceRefreshDevice') < refresh.indexOf('enforceTemporaryPasswordAuthentication'));
});

test('rutas privadas nuevas y semantica Master conservan contratos POST', () => {
  assert.match(routes, /"\/api\/pz\/store\/account\/change-temporary-password"/);
  assert.match(routes, /"\/api\/pz\/store\/account\/revoke-sessions"/);
  assert.match(routes, /\$apis\.requireAuth\(\)/);
  assert.match(routes, /\$apis\.skipSuccessActivityLog\(\)/);
});

test('expiracion autenticada usa codigo seguro sin revelar credenciales', () => {
  const PreviousBadRequestError = global.BadRequestError;
  const PreviousValidationError = global.ValidationError;
  global.ValidationError = class ValidationError extends Error { constructor(code, message) { super(message); this.code = code; } };
  global.BadRequestError = class BadRequestError extends Error { constructor(message, data) { super(message); this.data = data; } };
  try {
    assert.throws(
      () => users.enforceTemporaryPasswordAuthentication({ record: record({ role: 'store_admin', must_change_password: true, temporary_password_expires_at: '2020-01-01T00:00:00.000Z' }) }),
      (error) => error.data.temporary_password_expired.code === 'temporary_password_expired' && !error.message.includes('password'),
    );
    assert.doesNotThrow(() => users.enforceTemporaryPasswordAuthentication({ record: record({ role: 'store_admin', must_change_password: false }) }));
  } finally {
    global.BadRequestError = PreviousBadRequestError;
    global.ValidationError = PreviousValidationError;
  }
});
