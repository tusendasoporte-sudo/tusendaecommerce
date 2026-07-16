const assert = require('node:assert/strict');
const test = require('node:test');

const users = require('../pb_hooks/pz_master_store_users_lib.js');

const STORE_ID = 'storetestu7b500';
const USER_ID = 'usertestu7b5000';
const OTHER_STORE_ID = 'otherstoreu7b50';
const NOW = new Date('2026-07-15T12:00:00.000Z');

function record(values, id = USER_ID) {
  return {
    id,
    get(key) { return values[key]; },
  };
}

function store(plan, overrides = {}) {
  return record({
    name: 'Tienda de prueba',
    slug: 'tienda-prueba',
    plan,
    plan_started_at: NOW.toISOString(),
    plan_expires_at: new Date(NOW.getTime() + 30 * 86_400_000).toISOString(),
    plan_is_permanent: false,
    ...overrides,
  }, STORE_ID);
}

function createPayload(overrides = {}) {
  return {
    store_id: STORE_ID,
    email: 'Usuario@Dominio.COM',
    password: 'Segura-1234',
    display_name: 'Usuario Tienda',
    phone: '+1 555 0100',
    role: 'store_admin',
    status: 'active',
    reason: '',
    ...overrides,
  };
}

function updatePayload(overrides = {}) {
  const payload = createPayload(overrides);
  delete payload.password;
  return { user_id: USER_ID, ...payload };
}

test('el plan sanitizado incluye el total real de cuentas sin filtros', () => {
  const response = users.planResponse(store('premium'), {
    total_users: 10,
    active_users: 4,
    active_admins: 2,
    active_staff: 2,
  }, null);
  assert.equal(response.total_users, 10);
  assert.equal(response.active_users, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(response, 'total_users'), true);
});

test('el total real decide listado compacto hasta 10 y completo desde 11', () => {
  const filtered = {
    storeId: STORE_ID,
    page: 3,
    perPage: 50,
    search: 'oculto',
    role: 'store_staff',
    status: 'suspended',
  };
  for (const totalUsers of [0, 1, 4, 10]) {
    assert.deepEqual(users.listPayloadForStoreCounts(filtered, { total_users: totalUsers }), {
      ...filtered,
      page: 1,
      perPage: 10,
      search: '',
      role: 'all',
    });
  }
  assert.equal(users.listPayloadForStoreCounts(filtered, { total_users: 11 }), filtered);
});

test('los payloads son exactos y rechazan campos adicionales', () => {
  assert.equal(users.parseSummaryPayload({ store_ids: [], role: 'master_admin' }).error, 'invalid_payload');
  assert.equal(users.parseCreatePayload({ ...createPayload(), tokenKey: 'secret' }).error, 'invalid_payload');
  assert.equal(users.parseUpdatePayload({ ...updatePayload(), store: OTHER_STORE_ID }).error, 'invalid_payload');
});

test('normaliza email a minusculas y elimina espacios exteriores', () => {
  assert.equal(users.normalizeEmail('  Usuario@Dominio.COM '), 'usuario@dominio.com');
  assert.equal(users.parseCreatePayload(createPayload()).value.email, 'usuario@dominio.com');
});

test('rechaza roles ajenos y master_admin', () => {
  for (const role of ['master_admin', 'owner', '', null]) {
    assert.equal(users.parseCreatePayload(createPayload({ role })).error, 'invalid_role');
  }
});

test('rechaza estados ajenos', () => {
  for (const status of ['paused', 'deleted', '', null]) {
    assert.equal(users.parseCreatePayload(createPayload({ status })).error, 'invalid_status');
  }
});

test('rechaza IDs invalidos en todos los payloads de objetivo', () => {
  assert.equal(users.parseSummaryPayload({ store_ids: ['bad-id'] }).error, 'invalid_payload');
  assert.equal(users.parseTargetPayload({ store_id: STORE_ID, user_id: 'bad' }).error, 'invalid_payload');
  assert.equal(users.parsePasswordPayload({ store_id: 'bad', user_id: USER_ID, password: 'Segura-1234', reason: '' }).error, 'invalid_payload');
});

test('valida email y contrasena sin reflejar valores', () => {
  assert.equal(users.parseCreatePayload(createPayload({ email: 'no-email' })).error, 'invalid_email');
  assert.equal(users.parseCreatePayload(createPayload({ password: 'short' })).error, 'invalid_password');
  assert.equal(users.parseCreatePayload(createPayload({ password: 'x'.repeat(129) })).error, 'invalid_password');
});

test('sanitiza usuarios sin password, hash, tokenKey ni username interno', () => {
  const sanitized = users.sanitizeUser(record({
    email: 'user@example.com', display_name: 'User', phone: '555', role: 'store_admin', status: 'active',
    created: '2026-07-01 00:00:00.000Z', updated: '2026-07-02 00:00:00.000Z',
    password: 'plain', tokenKey: 'token', username: 'internal', verified: true,
  }), 1);
  assert.deepEqual(Object.keys(sanitized), [
    'id', 'email', 'display_name', 'phone', 'role', 'status', 'created', 'updated',
    'must_change_password', 'temporary_password_state', 'temporary_password_issued_at',
    'temporary_password_expires_at', 'last_admin_activity_at', 'is_last_active_admin',
    'authorized_device_count', 'device_limit',
  ]);
  assert.equal(sanitized.authorized_device_count, 0);
  assert.equal(sanitized.device_limit, 0);
  for (const forbidden of ['password', 'hash', 'tokenKey', 'username', 'verified']) {
    assert.equal(forbidden in sanitized, false);
  }
});

test('Free permite exactamente un usuario activo', () => {
  assert.equal(users.planAccess(store('free'), 1).allowed, true);
  assert.equal(users.planAccess(store('free'), 1).limit, 1);
});

test('Basico permite exactamente un usuario activo', () => {
  assert.equal(users.planAccess(store('basic'), 1).allowed, true);
  assert.equal(users.planAccess(store('basic'), 1).limit, 1);
});

test('Premium permite exactamente cuatro usuarios activos', () => {
  assert.equal(users.planAccess(store('premium'), 4).allowed, true);
  assert.equal(users.planAccess(store('premium'), 4).limit, 4);
});

test('un usuario adicional al limite se rechaza por capacidad', () => {
  assert.equal(users.planAccess(store('free'), 2).allowed, false);
  assert.equal(users.planAccess(store('premium'), 5).allowed, false);
});

test('un usuario suspendido no incrementa el total activo proyectado', () => {
  const projected = users.projectedCounts(
    { active_users: 1, active_admins: 1 },
    { role: 'store_staff', status: 'suspended' },
    { role: 'store_staff', status: 'suspended' },
  );
  assert.equal(projected.active_users, 1);
});

test('activar un suspendido incrementa el total y aplica el limite', () => {
  const projected = users.projectedCounts(
    { active_users: 1, active_admins: 1 },
    { role: 'store_staff', status: 'suspended' },
    { role: 'store_staff', status: 'active' },
  );
  assert.equal(projected.active_users, 2);
  assert.equal(users.planAccess(store('free'), projected.active_users).allowed, false);
});

test('una edicion sin aumento sigue disponible si la tienda supera el limite', () => {
  const projected = users.projectedCounts(
    { active_users: 3, active_admins: 1 },
    { role: 'store_staff', status: 'active' },
    { role: 'store_staff', status: 'active' },
  );
  assert.equal(projected.active_users, 3);
  assert.equal(users.planAccess(store('free')).allowed, true);
});

test('un plan Premium permanente conserva cuatro usuarios', () => {
  const access = users.planAccess(store('premium', { plan_is_permanent: true, plan_expires_at: '' }), 4);
  assert.equal(access.allowed, true);
  assert.equal(access.is_permanent, true);
});

test('un plan heredado sin vencimiento usa su codigo real', () => {
  const access = users.planAccess(store('basic', { plan_expires_at: '' }), 1);
  assert.equal(access.plan, 'basic');
  assert.equal(access.plan_state, 'unconfigured');
  assert.equal(access.allowed, true);
});

test('un plan desconocido o corrupto falla cerrado', () => {
  assert.throws(
    () => users.planAccess(store('enterprise'), 1),
    (error) => error.code === 'user_management_unavailable',
  );
  assert.throws(
    () => users.planAccess(store('free', { plan_is_permanent: true }), 1),
    (error) => error.code === 'user_management_unavailable',
  );
});

test('el vencimiento se informa pero no bloquea U7B5', () => {
  const access = users.planAccess(store('premium', { plan_expires_at: '2026-07-01T00:00:00.000Z' }), 4);
  assert.equal(access.is_expired, true);
  assert.equal(access.allowed, true);
});

test('suspender al ultimo administrador proyecta cero administradores', () => {
  const result = users.projectedCounts(
    { active_users: 1, active_admins: 1 },
    { role: 'store_admin', status: 'active' },
    { role: 'store_admin', status: 'suspended' },
  );
  assert.equal(result.active_admins, 0);
});

test('degradar al ultimo administrador proyecta cero administradores', () => {
  const result = users.projectedCounts(
    { active_users: 1, active_admins: 1 },
    { role: 'store_admin', status: 'active' },
    { role: 'store_staff', status: 'active' },
  );
  assert.equal(result.active_admins, 0);
});

test('se puede suspender Staff sin reducir administradores', () => {
  const result = users.projectedCounts(
    { active_users: 2, active_admins: 1 },
    { role: 'store_staff', status: 'active' },
    { role: 'store_staff', status: 'suspended' },
  );
  assert.equal(result.active_admins, 1);
  assert.equal(result.active_users, 1);
});

test('se puede degradar Admin cuando existe otro Admin activo', () => {
  const result = users.projectedCounts(
    { active_users: 2, active_admins: 2 },
    { role: 'store_admin', status: 'active' },
    { role: 'store_staff', status: 'active' },
  );
  assert.equal(result.active_admins, 1);
});

test('cambiar email exige revocar sesiones', () => {
  assert.equal(users.sessionsMustBeRevoked(
    'user_updated',
    { email: 'old@example.com', role: 'store_staff', status: 'active' },
    { email: 'new@example.com', role: 'store_staff', status: 'active' },
  ), true);
});

test('cambiar rol exige revocar sesiones', () => {
  assert.equal(users.sessionsMustBeRevoked(
    'user_updated',
    { email: 'same@example.com', role: 'store_staff', status: 'active' },
    { email: 'same@example.com', role: 'store_admin', status: 'active' },
  ), true);
});

test('suspender exige revocar sesiones', () => {
  assert.equal(users.sessionsMustBeRevoked(
    'user_updated',
    { email: 'same@example.com', role: 'store_staff', status: 'active' },
    { email: 'same@example.com', role: 'store_staff', status: 'suspended' },
  ), true);
});

test('cambiar contrasena exige revocar sesiones', () => {
  assert.equal(users.sessionsMustBeRevoked('password_changed', {}, {}), true);
});

test('cerrar sesiones explicitamente no exige cambiar otros campos', () => {
  const snapshot = { email: 'same@example.com', display_name: 'Same', phone: '555', role: 'store_staff', status: 'active' };
  assert.equal(users.sessionsMustBeRevoked('sessions_revoked', snapshot, snapshot), true);
  const audit = users.buildAuditValues(
    store('premium'),
    record({ role: 'master_admin', status: 'active', email: 'master@example.com', display_name: 'Master' }, 'mastertestu7b50'),
    record(snapshot),
    'sessions_revoked',
    snapshot,
    snapshot,
    true,
    '',
  );
  assert.equal(audit.previous_email, audit.new_email);
  assert.equal(audit.previous_role, audit.new_role);
  assert.equal(audit.previous_status, audit.new_status);
});

test('el objeto de auditoria nunca contiene contrasena, hash ni token', () => {
  const snapshot = { email: 'user@example.com', display_name: 'User', phone: '', role: 'store_admin', status: 'active' };
  const audit = users.buildAuditValues(
    store('free'),
    record({ role: 'master_admin', status: 'active', email: 'master@example.com', display_name: 'Master', tokenKey: 'actor-token' }, 'mastertestu7b50'),
    record({ ...snapshot, password: 'secret', tokenKey: 'user-token' }),
    'password_changed',
    snapshot,
    snapshot,
    true,
    'Cambio solicitado',
  );
  const keys = Object.keys(audit).map((key) => key.toLowerCase());
  for (const forbidden of ['password', 'hash', 'tokenkey', 'cookie', 'jwt', 'payload']) {
    assert.equal(keys.some((key) => key.includes(forbidden)), false);
  }
  const serialized = JSON.stringify(audit).toLowerCase();
  assert.equal(serialized.includes('actor-token'), false);
  assert.equal(serialized.includes('user-token'), false);
  assert.equal(serialized.includes('secret'), false);
});

test('un usuario de otra tienda se trata como no perteneciente', () => {
  const target = record({ store: OTHER_STORE_ID, role: 'store_admin', status: 'active' });
  assert.equal(users.targetBelongsToStore(target, STORE_ID), false);
});

test('un master_admin no puede ser objetivo', () => {
  const target = record({ store: STORE_ID, role: 'master_admin', status: 'active' });
  assert.equal(users.targetBelongsToStore(target, STORE_ID), false);
});

test('solo un master_admin active supera la validacion de actor', () => {
  assert.equal(users.isActiveMaster(record({ role: 'master_admin', status: 'active' })), true);
  assert.equal(users.isActiveMaster(record({ role: 'master_admin', status: 'suspended' })), false);
  assert.equal(users.isActiveMaster(record({ role: 'store_admin', status: 'active' })), false);
});

test('login y refresh suspendidos usan un error generico', () => {
  const PreviousBadRequestError = global.BadRequestError;
  global.BadRequestError = class BadRequestError extends Error {};
  try {
    assert.throws(
      () => users.rejectSuspendedAuthentication({ record: record({ status: 'suspended' }) }),
      (error) => error.message === 'Failed to authenticate.' && !error.message.includes('suspended'),
    );
    assert.doesNotThrow(() => users.rejectSuspendedAuthentication({ record: record({ status: 'active' }) }));
  } finally {
    global.BadRequestError = PreviousBadRequestError;
  }
});
