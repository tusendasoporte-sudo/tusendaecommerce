const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const devices = require('../pb_hooks/pz_store_user_devices_lib.js');
const plans = require('../pb_hooks/pz_store_plans_lib.js');

const STORE_ID = 'storetestd7a600';
const USER_ID = 'usertestd7a6000';
const DEVICE_ID = 'devicetestd7a60';
const TOKEN = 'A'.repeat(43);
const NOW = '2026-07-15T20:00:00.000Z';
const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
const valueRecord = (id, values) => ({
  id,
  get(key) { return values[key]; },
  getString(key) { return String(values[key] ?? ''); },
});
const store = (plan, overrides = {}) => valueRecord(STORE_ID, {
  name: 'Tienda D7A6',
  plan,
  plan_started_at: NOW,
  plan_expires_at: '2026-08-15T20:00:00.000Z',
  plan_is_permanent: false,
  ...overrides,
});

test('valida exclusivamente tokens base64url de 32 bytes', () => {
  assert.equal(devices.isValidDeviceToken(TOKEN), true);
  assert.equal(devices.isValidDeviceToken('a'.repeat(42)), false);
  assert.equal(devices.isValidDeviceToken('a'.repeat(44)), false);
  assert.equal(devices.isValidDeviceToken(`${'a'.repeat(42)}=`), false);
  assert.equal(devices.isValidDeviceToken(`${'a'.repeat(42)}+`), false);
});

test('el digest es SHA-256 determinista con dominio y nunca devuelve el token', () => {
  const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const digest = devices.hashDeviceToken(TOKEN, sha256);
  assert.equal(digest, sha256(`${devices.DIGEST_DOMAIN}${TOKEN}`));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, TOKEN);
  assert.equal(digest.includes(TOKEN), false);
});

test('un digestador inválido falla cerrado', () => {
  assert.throws(
    () => devices.hashDeviceToken(TOKEN, () => TOKEN),
    (error) => error.code === 'device_authorization_unavailable',
  );
});

test('normaliza Edge en Windows sin conservar User-Agent completo', () => {
  const metadata = devices.normalizeUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 Edg/126.0.0.0',
  );
  assert.deepEqual(metadata, {
    browser_name: 'Edge', os_name: 'Windows', device_type: 'desktop', label: 'Edge en Windows',
  });
  assert.equal(JSON.stringify(metadata).includes('Mozilla'), false);
  assert.equal(Object.isFrozen(metadata), true);
});

test('normaliza Chrome Android, Safari iPhone y tablet', () => {
  assert.deepEqual(devices.normalizeUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/126 Mobile'), {
    browser_name: 'Chrome', os_name: 'Android', device_type: 'mobile', label: 'Chrome en Android',
  });
  assert.deepEqual(devices.normalizeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Version/17 Mobile Safari/604.1'), {
    browser_name: 'Safari', os_name: 'iOS', device_type: 'mobile', label: 'Safari en iPhone',
  });
  assert.equal(devices.normalizeUserAgent('Mozilla/5.0 (iPad; CPU OS 17) Safari/604.1').device_type, 'tablet');
});

test('Master Admin queda fuera del gate de login y refresh', () => {
  const master = valueRecord('mastertestd7a60', { role: 'master_admin', status: 'active' });
  assert.doesNotThrow(() => devices.enforceLoginDevice({ record: master }));
  assert.doesNotThrow(() => devices.enforceRefreshDevice({ record: master }));
});

test('Store Admin y Staff están incluidos, otros roles quedan fuera', () => {
  assert.equal(devices.isStoreRole('store_admin'), true);
  assert.equal(devices.isStoreRole('store_staff'), true);
  assert.equal(devices.isStoreRole('master_admin'), false);
  assert.equal(devices.isStoreRole('customer'), false);
});

test('usuario suspendido y usuario sin tienda no son usuarios activos válidos', () => {
  assert.equal(devices.isActiveStoreUser(valueRecord(USER_ID, {
    role: 'store_admin', status: 'suspended', store: STORE_ID,
  })), false);
  assert.equal(devices.isActiveStoreUser(valueRecord(USER_ID, {
    role: 'store_staff', status: 'active', store: '',
  })), false);
});

test('Free y Básico permiten exactamente cinco por usuario y tienda', () => {
  for (const plan of ['free', 'basic']) {
    const exact = devices.evaluateNewDeviceCapacity(store(plan), 4, 4, false);
    assert.equal(exact.projected_user_count, 5);
    assert.equal(exact.projected_store_count, 5);
    assert.equal(exact.user_limit, 5);
    assert.equal(exact.store_limit, 5);
  }
});

test('el sexto dispositivo por usuario se bloquea en todos los planes', () => {
  for (const plan of plans.PLAN_CODES) {
    assert.throws(
      () => devices.evaluateNewDeviceCapacity(store(plan), 5, 5, true),
      (error) => error.code === 'user_device_limit_reached',
    );
  }
});

test('Premium permite cinco por usuario y veinte distintos por tienda', () => {
  const exact = devices.evaluateNewDeviceCapacity(store('premium'), 4, 19, false);
  assert.equal(exact.projected_user_count, 5);
  assert.equal(exact.projected_store_count, 20);
  assert.equal(exact.user_limit, 5);
  assert.equal(exact.store_limit, 20);
});

test('Premium bloquea el vigésimo primer digest distinto', () => {
  assert.throws(
    () => devices.evaluateNewDeviceCapacity(store('premium'), 0, 20, false),
    (error) => error.code === 'store_device_limit_reached',
  );
});

test('el mismo digest para dos usuarios no incrementa el conteo de tienda', () => {
  const result = devices.evaluateNewDeviceCapacity(store('basic'), 0, 5, true);
  assert.equal(result.projected_user_count, 1);
  assert.equal(result.projected_store_count, 5);
});

test('permanente, vencido y unconfigured usan el código real con expiration desactivado', () => {
  assert.equal(devices.evaluateNewDeviceCapacity(store('premium', {
    plan_is_permanent: true, plan_expires_at: '',
  }), 4, 19, false).store_limit, 20);
  assert.equal(devices.evaluateNewDeviceCapacity(store('basic', {
    plan_expires_at: '2026-01-01T00:00:00.000Z',
  }), 4, 4, false).store_limit, 5);
  assert.equal(devices.evaluateNewDeviceCapacity(store('premium', {
    plan_expires_at: '',
  }), 4, 19, false).store_limit, 20);
});

test('plan desconocido falla cerrado y nunca hereda Premium', () => {
  assert.throws(
    () => devices.evaluateNewDeviceCapacity(store('enterprise'), 0, 0, false),
    (error) => error.code === 'device_authorization_unavailable',
  );
});

test('payloads Master son exactos y la revocación exige motivo', () => {
  assert.equal(devices.parseListPayload({
    store_id: STORE_ID, user_id: USER_ID, page: 1, per_page: 10, status: 'all',
  }).ok, true);
  assert.equal(devices.parseListPayload({
    store_id: STORE_ID, user_id: USER_ID, page: 1, per_page: 10, status: 'all', digest: TOKEN,
  }).ok, false);
  assert.equal(devices.parseRevokePayload({
    store_id: STORE_ID, user_id: USER_ID, device_id: DEVICE_ID, reason: 'Seguridad',
  }).ok, true);
  assert.equal(devices.parseRevokePayload({
    store_id: STORE_ID, user_id: USER_ID, device_id: DEVICE_ID, reason: '   ',
  }).ok, false);
});

test('el aislamiento exige coincidencia exacta usuario-tienda', () => {
  const user = valueRecord(USER_ID, { role: 'store_staff', status: 'active', store: STORE_ID });
  assert.equal(devices.targetBelongsToStore(user, STORE_ID), true);
  assert.equal(devices.targetBelongsToStore(user, 'storeotherd7a60'), false);
});

test('el listado sanitizado nunca expone digest ni relaciones internas', () => {
  const mapped = devices.mapDevice(valueRecord(DEVICE_ID, {
    label: 'Edge en Windows', browser_name: 'Edge', os_name: 'Windows',
    device_type: 'desktop', status: 'authorized', first_seen_at: NOW, last_seen_at: NOW,
    device_digest: 'secret-digest', user: USER_ID, store: STORE_ID,
  }));
  assert.deepEqual(Object.keys(mapped), [
    'id', 'label', 'browser_name', 'os_name', 'device_type', 'status',
    'first_seen_at', 'last_seen_at', 'revoked_at',
  ]);
  assert.equal(JSON.stringify(mapped).includes('secret-digest'), false);
});

test('auditoría de autorización no contiene token, digest, contraseña ni tokenKey', () => {
  const target = valueRecord(USER_ID, {
    email: 'admin@example.test', display_name: 'Admin', role: 'store_admin', status: 'active', store: STORE_ID,
  });
  const device = valueRecord(DEVICE_ID, {
    label: 'Edge en Windows', browser_name: 'Edge', os_name: 'Windows',
    device_type: 'desktop', device_digest: 'secret-digest',
  });
  const values = devices.buildAuditValues(
    store('basic'), target, device, target, 'device_authorized', false, '',
  );
  const serialized = JSON.stringify(values);
  for (const forbidden of [TOKEN, 'secret-digest', 'password', 'tokenKey', 'cookie', 'Mozilla']) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(values.actor_role_snapshot, 'store_admin');
});

test('auditoría de revocación registra rotación de todas las sesiones', () => {
  const master = valueRecord('mastertestd7a60', {
    email: 'master@example.test', display_name: 'Master', role: 'master_admin', status: 'active',
  });
  const target = valueRecord(USER_ID, {
    email: 'staff@example.test', role: 'store_staff', status: 'active', store: STORE_ID,
  });
  const device = valueRecord(DEVICE_ID, {
    label: 'Firefox en Linux', browser_name: 'Firefox', os_name: 'Linux', device_type: 'desktop',
  });
  const values = devices.buildAuditValues(store('premium'), target, device, master, 'device_revoked', true, 'Riesgo');
  assert.equal(values.sessions_revoked, true);
  assert.equal(values.action, 'device_revoked');
  assert.equal(values.reason, 'Riesgo');
});

test('last_seen aplica throttling de quince minutos', () => {
  const record = valueRecord(DEVICE_ID, { last_seen_at: NOW });
  assert.equal(devices.shouldTouchLastSeen(record, '2026-07-15T20:14:59.999Z'), false);
  assert.equal(devices.shouldTouchLastSeen(record, '2026-07-15T20:15:00.000Z'), true);
});

test('el User-Agent real se elimina del request antes del activity log global', () => {
  const info = { headers: { user_agent: 'Mozilla/5.0 private full value' } };
  let requestValue = '';
  const event = { request: { header: { set(_name, value) { requestValue = value; } } } };
  devices.scrubRequestUserAgent(event, info);
  assert.equal(requestValue, 'PowerZona administrative device');
  assert.equal(info.headers.user_agent, 'PowerZona administrative device');
  assert.equal(JSON.stringify(info).includes('Mozilla/5.0 private full value'), false);
});

test('middleware temprano conserva User-Agent sólo en memoria y sanea el request', () => {
  const values = {};
  const header = {
    value: 'Mozilla/5.0 private early value',
    get() { return this.value; },
    set(_name, value) { this.value = value; },
  };
  const event = {
    request: { url: { path: '/api/collections/users/auth-with-password' }, header },
    set(key, value) { values[key] = value; },
    get(key) { return values[key]; },
    next() { return 'next'; },
  };
  assert.equal(devices.captureAndScrubAuthUserAgent(event), 'next');
  assert.equal(header.value, 'PowerZona administrative device');
  assert.equal(devices.originalUserAgent(event, {}), 'Mozilla/5.0 private early value');
});

test('la migración crea dos colecciones privadas, digest oculto e índices requeridos', () => {
  const source = read('../pb_migrations/1783386700_store_user_devices.js');
  assert.match(source, /name: "store_user_devices"/);
  assert.match(source, /name: "store_user_device_audit"/);
  assert.ok((source.match(/listRule: null/g) || []).length >= 2);
  assert.match(source, /"device_digest", 64, true, true/);
  assert.match(source, /UNIQUE INDEX `idx_store_user_devices_user_digest`/);
  assert.match(source, /store_status_digest/);
  assert.match(source, /user_status_seen/);
});

test('login autoriza dentro de transacción y refresh nunca crea dispositivos', () => {
  const source = read('../pb_hooks/pz_store_user_devices_lib.js');
  const login = source.slice(source.indexOf('function authorizeDeviceForLogin'), source.indexOf('function verifyDeviceForRefresh'));
  const refresh = source.slice(source.indexOf('function verifyDeviceForRefresh'), source.indexOf('function deviceManagementReady'));
  assert.match(login, /runInTransaction/);
  assert.match(login, /lockStore/);
  assert.match(login, /createAuthorizedDevice/);
  assert.equal(refresh.includes('createAuthorizedDevice'), false);
  assert.match(refresh, /device_not_authorized/);
});

test('dispositivo autorizado existente se evalúa antes de capacidades para soportar downgrade', () => {
  const source = read('../pb_hooks/pz_store_user_devices_lib.js');
  const login = source.slice(source.indexOf('function authorizeDeviceForLogin'), source.indexOf('function verifyDeviceForRefresh'));
  assert.ok(login.indexOf('if (existing)') < login.indexOf('evaluateNewDeviceCapacity'));
});

test('revocación es transaccional, idempotente y rota tokenKey del usuario', () => {
  const source = read('../pb_hooks/pz_store_user_devices_lib.js');
  const revoke = source.slice(source.indexOf('function handleRevoke'), source.indexOf('function handleAudit'));
  assert.match(revoke, /runInTransaction/);
  assert.match(revoke, /recordString\(device, "status"\) === "revoked"/);
  assert.match(revoke, /refreshTokenKey\(\)/);
  assert.match(revoke, /sessions_revoked_for_user: true/);
  assert.match(revoke, /createAudit/);
});

test('fallo de auditoría queda dentro de la misma transacción de revocación', () => {
  const source = read('../pb_hooks/pz_store_user_devices_lib.js');
  const revoke = source.slice(source.indexOf('function handleRevoke'), source.indexOf('function handleAudit'));
  assert.ok(revoke.indexOf('createAudit(') > revoke.indexOf('txApp.save(device)'));
  assert.ok(revoke.indexOf('createAudit(') < revoke.indexOf('});\n    return e.json'));
});

test('Plan y límites usa dispositivos administrativos autorizados y no clientes públicos', () => {
  const source = read('../pb_hooks/pz_store_plan_management_lib.js');
  const usage = source.slice(source.indexOf('function storeUsage'), source.indexOf('function mapAudit'));
  assert.match(usage, /COUNT\(DISTINCT device_digest\)/);
  assert.match(usage, /status = 'authorized'/);
  assert.match(usage, /GROUP BY user/);
  assert.equal(usage.includes('store_customer_devices'), false);
});

test('eliminación completa incluye conteo, orden y verificación a cero', () => {
  const source = read('../pb_hooks/pz_master_store_deletion_lib.js');
  assert.match(source, /"user_devices", "user_device_audit"/);
  assert.ok(source.indexOf('"store_user_device_audit"') < source.indexOf('"store_user_devices"'));
  assert.match(source, /counts\.user_device_audit/);
  assert.match(source, /counts\.user_devices/);
  assert.match(source, /DIRECT_STORE_COLLECTIONS/);
});

test('los endpoints son POST privados, no-store y sin activity log de éxito', () => {
  const source = read('../pb_hooks/pz_store_user_devices.pb.js');
  assert.equal((source.match(/"POST"/g) || []).length, 3);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 3);
  assert.equal((source.match(/\$apis\.bodyLimit\(/g) || []).length, 3);
  assert.equal((source.match(/\$apis\.skipSuccessActivityLog\(\)/g) || []).length, 3);
  assert.match(read('../pb_hooks/pz_store_user_devices_lib.js'), /Cache-Control", "private, no-store/);
});

test('el listado separa el filtro SQL del filtro de registros PocketBase', () => {
  const source = read('../pb_hooks/pz_store_user_devices_lib.js');
  const list = source.slice(source.indexOf('function handleList'), source.indexOf('function handleRevoke'));
  assert.match(list, /sqlStatusFilter = context\.parsed\.status === "all" \? "" : " AND status = \{:status\}"/);
  assert.match(list, /recordStatusFilter = context\.parsed\.status === "all" \? "" : " && status = \{:status\}"/);
  assert.match(list, /WHERE store = \{:storeId\} AND user = \{:userId\}\$\{sqlStatusFilter\}/);
  assert.match(list, /store = \{:storeId\} && user = \{:userId\}\$\{recordStatusFilter\}/);
});

test('no se modifica ni reutiliza la colección pública de dispositivos de clientes', () => {
  const deviceSource = read('../pb_hooks/pz_store_user_devices_lib.js');
  const migrationSource = read('../pb_migrations/1783386700_store_user_devices.js');
  assert.equal(deviceSource.includes('store_customer_devices'), false);
  assert.equal(migrationSource.includes('store_customer_devices'), false);
});
