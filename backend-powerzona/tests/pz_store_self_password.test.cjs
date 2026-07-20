const assert = require('node:assert/strict');
const test = require('node:test');

const users = require('../pb_hooks/pz_master_store_users_lib.js');

const STORE_ID = 'storeselfu7b5a1';
const USER_ID = 'userselfu7b5a10';
const MASTER_ID = 'masteru7b5a1000';

function record(values, id = USER_ID, currentPassword = 'Actual-1234') {
  return {
    id,
    get(key) { return values[key]; },
    validatePassword(value) { return value === currentPassword; },
  };
}

function store() {
  return record({ name: 'Tienda segura', slug: 'tienda-segura' }, STORE_ID);
}

function activeAdmin(overrides = {}) {
  return record({
    email: 'admin@example.com',
    display_name: 'Admin Tienda',
    phone: '',
    role: 'store_admin',
    status: 'active',
    store: STORE_ID,
    ...overrides,
  });
}

function payload(overrides = {}) {
  return {
    currentPassword: 'Actual-1234',
    newPassword: 'Nueva-Segura-5678',
    newPasswordConfirm: 'Nueva-Segura-5678',
    ...overrides,
  };
}

function policyApp(min = 8, max = 0) {
  return {
    findCollectionByNameOrId(name) {
      assert.equal(name, 'users');
      return {
        fields: {
          getByName(field) {
            assert.equal(field, 'password');
            return { type: 'password', min, max };
          },
        },
      };
    },
  };
}

test('acepta exclusivamente el payload valido de tres campos', () => {
  assert.deepEqual(users.parseSelfPasswordPayload(payload()), {
    ok: true,
    value: { currentPassword: 'Actual-1234', newPassword: 'Nueva-Segura-5678' },
  });
});

test('el middleware privado devuelve 403 al publico', () => {
  let result;
  users.requireAuthenticatedUser({
    auth: null,
    response: { header() { return { set() {} }; } },
    json(status, body) { result = { status, body }; return result; },
  });
  assert.deepEqual(result, { status: 403, body: { ok: false, error: 'unauthorized' } });
});

test('store_staff permanece sin autorizacion', () => {
  assert.equal(users.isActiveStoreAdmin(activeAdmin({ role: 'store_staff' })), false);
});

test('master_admin no puede usar el flujo propio Store', () => {
  assert.equal(users.isActiveStoreAdmin(activeAdmin({ role: 'master_admin', store: '' })), false);
});

test('store_admin suspendido queda rechazado', () => {
  assert.equal(users.isActiveStoreAdmin(activeAdmin({ status: 'suspended' })), false);
});

test('store_admin activo con tienda valida queda autorizado', () => {
  assert.equal(users.isActiveStoreAdmin(activeAdmin()), true);
});

test('store_admin sin tienda o con relacion invalida queda rechazado', () => {
  assert.equal(users.isActiveStoreAdmin(activeAdmin({ store: '' })), false);
  assert.equal(users.isActiveStoreAdmin(activeAdmin({ store: 'bad-id' })), false);
});

test('contraseña actual vacia devuelve current_password_required', () => {
  assert.equal(users.parseSelfPasswordPayload(payload({ currentPassword: '' })).error, 'current_password_required');
  assert.equal(users.parseSelfPasswordPayload(payload({ currentPassword: null })).error, 'current_password_required');
});

test('contraseña nueva vacia o de espacios devuelve new_password_required', () => {
  assert.equal(users.parseSelfPasswordPayload(payload({ newPassword: '', newPasswordConfirm: '' })).error, 'new_password_required');
  assert.equal(users.parseSelfPasswordPayload(payload({ newPassword: '   ', newPasswordConfirm: '   ' })).error, 'new_password_required');
});

test('confirmacion ausente o diferente queda rechazada', () => {
  assert.equal(users.parseSelfPasswordPayload(payload({ newPasswordConfirm: '' })).error, 'password_confirmation_mismatch');
  assert.equal(users.parseSelfPasswordPayload(payload({ newPasswordConfirm: 'Otra-5678' })).error, 'password_confirmation_mismatch');
});

test('limite defensivo rechaza passwords mayores de 128', () => {
  const long = 'x'.repeat(129);
  assert.equal(users.parseSelfPasswordPayload(payload({ newPassword: long, newPasswordConfirm: long })).error, 'invalid_password');
  assert.equal(users.parseSelfPasswordPayload(payload({ currentPassword: long })).error, 'invalid_password');
});

test('rechaza campos inesperados e identificadores inyectados', () => {
  for (const field of ['userId', 'targetUserId', 'store', 'email', 'role', 'status', 'tokenKey', 'verified']) {
    assert.equal(users.parseSelfPasswordPayload({ ...payload(), [field]: 'forbidden' }).error, 'invalid_payload');
  }
});

test('la contraseña actual correcta permite continuar', () => {
  assert.equal(users.validateSelfPasswordCredentials(activeAdmin(), payload()), '');
});

test('la contraseña actual incorrecta usa codigo seguro', () => {
  assert.equal(users.validateSelfPasswordCredentials(activeAdmin(), payload({ currentPassword: 'Incorrecta-0000' })), 'current_password_invalid');
});

test('la reutilizacion de la contraseña actual queda prohibida', () => {
  const same = payload({ newPassword: 'Actual-1234', newPasswordConfirm: 'Actual-1234' });
  assert.equal(users.validateSelfPasswordCredentials(activeAdmin(), same), 'password_reuse_not_allowed');
});

test('la ausencia de validatePassword falla cerrada', () => {
  assert.throws(
    () => users.validateSelfPasswordCredentials({ id: USER_ID }, payload()),
    (error) => error.code === 'password_change_failed',
  );
});

test('respeta el minimo real del campo password', () => {
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(8), '1234567'), false);
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(8), '12345678'), true);
});

test('respeta un maximo real cuando la coleccion lo define', () => {
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(8, 12), '123456789012'), true);
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(8, 12), '1234567890123'), false);
});

test('la politica rechaza espacios, tipos ajenos y configuracion corrupta', () => {
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(), '   '), false);
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(), null), false);
  assert.equal(users.passwordMeetsCollectionPolicy(policyApp(-1), 'Nueva-Segura-5678'), false);
});

test('self_password_changed exige revocar todas las sesiones', () => {
  assert.equal(users.sessionsMustBeRevoked('self_password_changed', {}, {}), true);
});

test('la lista de auditoria conserva historicas y agrega acciones temporales y eliminacion', () => {
  assert.deepEqual(users.AUDIT_ACTIONS, [
    'user_created',
    'user_updated',
    'password_changed',
    'sessions_revoked',
    'self_password_changed',
    'temporary_password_issued',
    'forced_password_changed',
    'user_deleted',
  ]);
});

test('auditoria propia usa el mismo actor y objetivo con rol store_admin', () => {
  const actor = activeAdmin();
  const snapshot = users.userSnapshot(actor);
  const audit = users.buildAuditValues(store(), actor, actor, 'self_password_changed', snapshot, snapshot, true, '');
  assert.equal(audit.actor, USER_ID);
  assert.equal(audit.target_user, USER_ID);
  assert.equal(audit.actor_role_snapshot, 'store_admin');
  assert.equal(audit.sessions_revoked, true);
});

test('auditorias Master existentes conservan master_admin', () => {
  const master = record({ role: 'master_admin', status: 'active', display_name: 'Master' }, MASTER_ID);
  const target = activeAdmin();
  const snapshot = users.userSnapshot(target);
  const audit = users.buildAuditValues(store(), master, target, 'password_changed', snapshot, snapshot, true, '');
  assert.equal(audit.actor_role_snapshot, 'master_admin');
});

test('Staff puede auditar su propia seguridad pero roles arbitrarios siguen cerrados', () => {
  const staff = activeAdmin({ role: 'store_staff' });
  const snapshot = users.userSnapshot(staff);
  const ownAudit = users.buildAuditValues(store(), staff, staff, 'self_password_changed', snapshot, snapshot, true, '');
  assert.equal(ownAudit.actor_role_snapshot, 'store_staff');
  const customer = activeAdmin({ role: 'customer' });
  assert.throws(
    () => users.buildAuditValues(store(), customer, customer, 'self_password_changed', snapshot, snapshot, true, ''),
    (error) => error.code === 'user_management_unavailable',
  );
});

test('mapAudit reconoce self_password_changed sin exponer el Record', () => {
  const mapped = users.mapAudit(record({
    action: 'self_password_changed',
    actor_name_snapshot: 'Admin',
    actor_role_snapshot: 'store_admin',
    previous_email: 'admin@example.com',
    new_email: 'admin@example.com',
    previous_display_name: 'Admin',
    new_display_name: 'Admin',
    previous_phone: '',
    new_phone: '',
    previous_role: 'store_admin',
    new_role: 'store_admin',
    previous_status: 'active',
    new_status: 'active',
    sessions_revoked: true,
    reason: '',
    created: '2026-07-15 12:00:00.000Z',
    password: 'forbidden',
  }));
  assert.equal(mapped.action, 'self_password_changed');
  assert.equal(mapped.actor_role, 'store_admin');
  assert.equal('password' in mapped, false);
});

test('respuesta exitosa exige reautenticacion y no contiene secretos', () => {
  const response = users.selfPasswordSuccessResponse();
  assert.deepEqual(response, {
    ok: true,
    code: 'password_changed',
    reauth_required: true,
    sessions_revoked: true,
  });
  for (const forbidden of ['password', 'token', 'tokenKey', 'cookie', 'user']) {
    assert.equal(forbidden in response, false);
  }
});

test('el guard Master sigue rechazando store_admin', () => {
  assert.equal(users.isActiveMaster(activeAdmin()), false);
  assert.equal(users.isActiveMaster(record({ role: 'master_admin', status: 'active' }, MASTER_ID)), true);
});

test('la autorizacion propia no depende del plan de la tienda', () => {
  for (const plan of ['free', 'basic', 'premium', 'expired', '']) {
    assert.equal(users.isActiveStoreAdmin(activeAdmin({ plan })), true);
  }
});

test('la auditoria propia nunca copia material de autenticacion', () => {
  const actor = activeAdmin({
    password: 'Actual-1234',
    passwordConfirm: 'Nueva-Segura-5678',
    tokenKey: 'private-token-key',
    cookie: 'private-cookie',
  });
  const snapshot = users.userSnapshot(actor);
  const audit = users.buildAuditValues(store(), actor, actor, 'self_password_changed', snapshot, snapshot, true, '');
  const serialized = JSON.stringify(audit).toLowerCase();
  assert.equal(serialized.includes('actual-1234'), false);
  assert.equal(serialized.includes('nueva-segura-5678'), false);
  assert.equal(serialized.includes('private-token-key'), false);
  assert.equal(serialized.includes('private-cookie'), false);
});
