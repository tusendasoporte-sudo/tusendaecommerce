const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const push = require('../pb_hooks/pz_store_push_devices_lib.js');

const FID = 'cdefghijklmnopqrstuvwx';
const payload = (overrides = {}) => ({
  installation_id: FID,
  app_id: 'com.tusenda84.admin',
  device_label: 'Google Pixel 8',
  os_version: 'Android 16',
  app_version: '1.0.0',
  ...overrides,
});

test('valida Installation IDs base64url y package IDs Android', () => {
  assert.equal(push.isValidInstallationId(FID), true);
  assert.equal(push.isValidInstallationId('short'), false);
  assert.equal(push.isValidInstallationId(`${FID}=`), false);
  assert.equal(push.isValidAppId('com.tusenda84.admin'), true);
  assert.equal(push.isValidAppId('com.tusenda84.admin.debug'), true);
  assert.equal(push.isValidAppId('Tu Senda 84'), false);
});

test('normaliza un registro exacto sin aceptar campos adicionales', () => {
  assert.deepEqual(push.parseRegisterPayload(payload()), {
    ok: true,
    value: {
      installationId: FID,
      appId: 'com.tusenda84.admin',
      deviceLabel: 'Google Pixel 8',
      osVersion: 'Android 16',
      appVersion: '1.0.0',
    },
  });
  assert.equal(push.parseRegisterPayload(payload({ injected_role: 'master_admin' })).ok, false);
  assert.equal(push.parseRegisterPayload(payload({ device_label: 'x'.repeat(121) })).ok, false);
});

test('el digest usa dominio, es determinista y no conserva el Installation ID', () => {
  const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
  const digest = push.hashInstallationId(FID, sha256);
  assert.equal(digest, sha256(`${push.INSTALLATION_DOMAIN}${FID}`));
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest.includes(FID), false);
});

test('deshabilitar exige Installation ID y app ID exactos', () => {
  assert.deepEqual(push.parseDisablePayload({
    installation_id: FID,
    app_id: 'com.tusenda84.admin',
  }), {
    ok: true,
    value: { installationId: FID, appId: 'com.tusenda84.admin' },
  });
  assert.equal(push.parseDisablePayload({ installation_id: FID }).ok, false);
});

test('solo usuarios activos de tienda califican para registrar dispositivos', () => {
  const record = (values) => ({
    get(key) { return values[key]; },
    getString(key) { return String(values[key] ?? ''); },
  });
  assert.equal(push.isActiveStoreUser(record({ role: 'store_admin', status: 'active', store: 'store1234567890' })), true);
  assert.equal(push.isActiveStoreUser(record({ role: 'store_staff', status: 'active', store: 'store1234567890' })), true);
  assert.equal(push.isActiveStoreUser(record({ role: 'store_staff', status: 'suspended', store: 'store1234567890' })), false);
  assert.equal(push.isActiveStoreUser(record({ role: 'master_admin', status: 'active', store: 'store1234567890' })), false);
});

test('la migracion mantiene tokens privados, reglas cerradas e indices de tenant', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../pb_migrations/1786400000_store_push_devices.js'),
    'utf8',
  );
  assert.match(source, /name:\s*"store_push_devices"/);
  assert.match(source, /"installation_id",\s*255,\s*true,\s*true/);
  assert.match(source, /listRule:\s*null/);
  assert.match(source, /idx_store_push_devices_installation/);
  assert.match(source, /idx_store_push_devices_store_status/);
  const linkMigration = fs.readFileSync(
    path.resolve(__dirname, '../pb_migrations/1786492800_store_user_device_deletion.js'),
    'utf8',
  );
  assert.match(linkMigration, /name: "admin_device"/);
  assert.match(linkMigration, /idx_store_push_devices_admin_device_status/);
});

test('el registro push exige y enlaza el dispositivo administrativo autorizado', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_store_push_devices_lib.js'),
    'utf8',
  );
  assert.match(source, /userDevices\.DEVICE_HEADER/);
  assert.match(source, /resolveAuthorizedUserDevice/);
  assert.match(source, /device\.set\("admin_device", context\.adminDevice/);
  assert.match(source, /device_not_authorized/);
});

test('los endpoints exigen auth, limite de body y no exponen CRUD directo', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_store_push_devices.pb.js'),
    'utf8',
  );
  assert.match(source, /\/api\/pz\/store-push\/register/);
  assert.match(source, /\/api\/pz\/store-push\/disable/);
  assert.match(source, /\$apis\.requireAuth\("users"\)/);
  assert.match(source, /\$apis\.bodyLimit\(4096\)/);
});
