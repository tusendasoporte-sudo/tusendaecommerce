'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const installations = require('../pb_hooks/pz_storefront_installations_lib.js');

const STORE_A = 'storetenant0001';
const STORE_B = 'storetenant0002';
const APP_A = 'appconfig000001';
const APP_B = 'appconfig000002';
const FIREBASE_A = '1:1234567890:android:aaaaaaaaaaaaaaaa';
const FIREBASE_B = '1:1234567890:android:bbbbbbbbbbbbbbbb';
const FID_A = 'abcdefghijklmnopqrstuv';
const FID_B = 'zyxwvutsrqponmlkjihgfe';
const CREDENTIAL_SECRET = 'credential-secret-c03-abcdefghijklmnopqrstuvwxyz';
const INTERNAL_SECRET = 'internal-secret-c03-abcdefghijklmnopqrstuvwxyz';
const AES_KEY = '12345678901234567890123456789012';
const NOW = new Date('2026-08-12T02:00:00.000Z');
const BACKEND_DIR = path.resolve(__dirname, '..');
const POCKETBASE_EXE = path.join(BACKEND_DIR, process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase');
const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');

class FakeRecord {
  constructor(collection, values = {}) {
    this.collection = collection?.name || collection;
    this.values = { ...values };
    this.id = values.id || '';
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) {
    if (key === 'id') this.id = value;
    else this.values[key] = value;
  }
}

global.Record = FakeRecord;

function securityFixture(randomValues = []) {
  let randomIndex = 0;
  return {
    sha256(value) {
      return crypto.createHash('sha256').update(String(value)).digest('hex');
    },
    hs256(value, secret) {
      return crypto.createHmac('sha256', String(secret)).update(String(value)).digest('hex');
    },
    equal(left, right) {
      const a = Buffer.from(String(left));
      const b = Buffer.from(String(right));
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },
    encrypt(value, key) {
      assert.equal(key, AES_KEY);
      return `encrypted:${Buffer.from(String(value)).toString('base64url')}`;
    },
    randomStringWithAlphabet(length) {
      const configured = randomValues[randomIndex++];
      return configured || 'A'.repeat(length);
    },
  };
}

function record(collection, id, values) {
  return new FakeRecord(collection, { id, ...values });
}

function createApp() {
  const records = new Map();
  const collections = new Map([
    ['stores', { name: 'stores' }],
    [installations.APP_CONFIGS_COLLECTION, { name: installations.APP_CONFIGS_COLLECTION }],
    [installations.INSTALLATIONS_COLLECTION, { name: installations.INSTALLATIONS_COLLECTION }],
    [installations.WEB_SESSIONS_COLLECTION, { name: installations.WEB_SESSIONS_COLLECTION }],
    ['storefront_order_links', { name: 'storefront_order_links' }],
    ['orders', { name: 'orders' }],
  ]);
  const add = (item) => records.set(`${item.collection}:${item.id}`, item);
  add(record('stores', STORE_A, {
    status: 'active',
    plan: 'premium',
    plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z',
  }));
  add(record('stores', STORE_B, {
    status: 'active',
    plan: 'premium',
    plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z',
  }));
  add(record(installations.APP_CONFIGS_COLLECTION, APP_A, {
    store: STORE_A,
    firebase_app_id: FIREBASE_A,
    status: 'active',
    store_path_prefix: '/t/powerzona',
  }));
  add(record(installations.APP_CONFIGS_COLLECTION, APP_B, {
    store: STORE_B,
    firebase_app_id: FIREBASE_B,
    status: 'active',
    store_path_prefix: '/t/otra-tienda',
  }));

  let nextId = 1;
  const list = (collection) => [...records.values()].filter((item) => item.collection === collection);
  const app = {
    records,
    list,
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (!collection) throw new Error('collection_not_found');
      return collection;
    },
    findRecordById(collection, id) {
      const item = records.get(`${collection}:${id}`);
      if (!item) throw new Error('record_not_found');
      return item;
    },
    findFirstRecordByFilter(collection, filter, params = {}) {
      const result = list(collection).find((item) => {
        if (params.appId !== undefined && item.getString('firebase_app_id') !== params.appId) return false;
        if (params.appConfig !== undefined && item.getString('app_config') !== params.appConfig) return false;
        if (params.fidDigest !== undefined && item.getString('fid_digest') !== params.fidDigest) return false;
        if (params.appSetDigest !== undefined && item.getString('app_set_digest') !== params.appSetDigest) return false;
        if (params.credentialDigest !== undefined && item.getString('credential_digest') !== params.credentialDigest) return false;
        if (params.digest !== undefined && item.getString('session_digest') !== params.digest) return false;
        if (params.order !== undefined && item.getString('order') !== params.order) return false;
        if (filter.includes('status = "pending"') && item.getString('status') !== 'pending') return false;
        return true;
      });
      if (!result) throw new Error('record_not_found');
      return result;
    },
    findRecordsByFilter(collection, filter, _sort, limit, _offset, params = {}) {
      return list(collection)
        .filter((item) => (!params.installation || item.getString('installation') === params.installation)
          && (!filter.includes('status = "pending"') || item.getString('status') === 'pending'))
        .slice(0, limit);
    },
    save(item) {
      if (!item.id) item.id = `${item.collection === installations.INSTALLATIONS_COLLECTION ? 'inst' : 'sess'}${String(nextId++).padStart(11, '0')}`;
      add(item);
      return item;
    },
  };
  return app;
}

function registerPayload(fid = FID_A) {
  return {
    fid,
    app_version: '1.0.0',
    app_version_code: 1,
    android_version: 'Android 16',
    device_model: 'Google Pixel 9',
    locale: 'es-US',
    timezone: 'America/Havana',
    notification_permission: 'unknown',
  };
}

const APP_SET_ID = '12Jd92JD8078S8J29sDoakc0EF230337';
function appSetRegisterPayload(fid = FID_A) {
  return { ...registerPayload(fid), app_set_id: APP_SET_ID };
}

function heartbeatPayload() {
  return {
    app_version: '1.0.1',
    app_version_code: 2,
    android_version: 'Android 16',
    device_model: 'Google Pixel 9 Pro',
    locale: 'es-US',
    timezone: 'America/Havana',
  };
}

function context(overrides = {}) {
  const security = overrides.security || securityFixture();
  return {
    appId: FIREBASE_A,
    credential: '',
    client: { ip: '8.8.8.8', countryCode: 'US', regionCode: 'FL' },
    payload: installations.parseRegisterPayload(registerPayload()),
    now: NOW,
    security,
    ...overrides,
  };
}

function assertCode(code) {
  return (error) => error && error.code === code;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function runtimeFlags(dataDirectory) {
  return [
    `--dir=${dataDirectory}`,
    `--hooksDir=${HOOKS_DIR}`,
    `--migrationsDir=${MIGRATIONS_DIR}`,
    '--hooksWatch=false',
    '--hooksPool=2',
    '--automigrate=true',
    '--indexFallback=false',
  ];
}

function startPocketBase(dataDirectory, port, environment) {
  let output = '';
  let spawnError = null;
  const child = spawn(
    POCKETBASE_EXE,
    ['serve', `--http=127.0.0.1:${port}`, ...runtimeFlags(dataDirectory)],
    {
      cwd: BACKEND_DIR,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const capture = (chunk) => { output = `${output}${String(chunk)}`.slice(-50_000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
    capture(`\n${error.stack || error.message}`);
  });
  return { child, output: () => output, spawnError: () => spawnError };
}

async function waitForPocketBase(runtime, baseUrl) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (runtime.spawnError()) throw runtime.spawnError();
    if (runtime.child.exitCode !== null) throw new Error(`PocketBase termino antes de iniciar.\n${runtime.output()}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error(`PocketBase no quedo listo.\n${runtime.output()}`);
}

async function stopPocketBase(runtime) {
  if (!runtime || runtime.child.exitCode !== null || runtime.child.signalCode !== null) return;
  const exited = new Promise((resolve) => runtime.child.once('exit', resolve));
  runtime.child.kill('SIGTERM');
  const graceful = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)]);
  if (!graceful && runtime.child.exitCode === null && runtime.child.signalCode === null) {
    runtime.child.kill('SIGKILL');
    await Promise.race([exited, sleep(5000)]);
  }
}

async function apiRequest(baseUrl, route, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function signedHeaders(action, body, internalSecret, now = new Date()) {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const nonce = crypto.randomUUID();
  const material = `${timestamp}\n${nonce}\n${action}\n${installations.canonicalJson(body)}`;
  return {
    'X-PZ-Storefront-Internal': internalSecret,
    'X-PZ-Storefront-Timestamp': timestamp,
    'X-PZ-Storefront-Nonce': nonce,
    'X-PZ-Storefront-Signature': crypto.createHmac('sha256', internalSecret).update(material).digest('hex'),
  };
}

test('valida contratos exactos y no acepta tienda ni IP declaradas por el telefono', () => {
  assert.ok(installations.parseRegisterPayload(registerPayload()));
  assert.equal(installations.parseRegisterPayload({ ...registerPayload(), store_id: STORE_B }), null);
  assert.equal(installations.parseRegisterPayload({ ...registerPayload(), ip: '1.2.3.4' }), null);
  assert.equal(installations.parseRegisterPayload({ ...registerPayload(), app_version_code: 0 }), null);
  assert.equal(installations.parseRegisterPayload({ ...registerPayload(), app_set_id: 'hardware-id' }), null);
  assert.equal(installations.parseRegisterPayload({ ...registerPayload(), app_set_id: 'unsafe:app-set-id-value' }), null);
  assert.equal(installations.parseRegisterPayload({
    ...registerPayload(), app_set_id: '123e4567-e89b-42d3-a456-426614174000',
  }).appSetId, '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(installations.parseHeartbeatPayload(heartbeatPayload()).appVersion, '1.0.1');
  assert.deepEqual(installations.parsePermissionPayload({ notification_permission: 'denied' }), {
    notificationPermission: 'denied',
  });
  assert.equal(installations.parsePermissionPayload({ notification_permission: 'yes' }), null);
  const event = {
    delivery_id: 'delivery0000001', event_type: 'opened',
    idempotency_key: 'opened:delivery0000001', occurred_at: NOW.toISOString(), target_path: '',
  };
  assert.equal(installations.parseEventPayload(event).deliveryId, 'delivery0000001');
  assert.equal(installations.parseEventPayload({ ...event, extra: true }), null);
  assert.equal(installations.parseEventPayload({ ...event, idempotency_key: 'client-choice' }), null);
  assert.equal(installations.parseEventPayload({
    ...event, event_type: 'destination_viewed',
    idempotency_key: 'destination_viewed:delivery0000001', target_path: '__order_verified__',
  }).targetPath, '__order_verified__');
  assert.equal(installations.parseEventPayload({
    ...event, event_type: 'destination_viewed',
    idempotency_key: 'destination_viewed:delivery0000001', target_path: '/t/powerzona\nadmin',
  }), null);
  assert.equal(installations.normalizeIp('8.8.8.8'), '8.8.8.8');
  assert.equal(installations.normalizeIp('999.8.8.8'), '');
});

test('registro repetido es idempotente y no duplica una misma app/FID', () => {
  const app = createApp();
  const first = installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY);
  const second = installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY);
  const stored = app.list(installations.INSTALLATIONS_COLLECTION);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.installation.id, second.installation.id);
  assert.equal(first.credential, second.credential);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].getString('first_seen_at'), NOW.toISOString());
  assert.match(stored[0].getString('last_ip_encrypted'), /^encrypted:/);
  assert.equal(stored[0].getString('last_ip_encrypted').includes('8.8.8.8'), false);
  assert.equal(JSON.stringify(first.installation).includes(FID_A), false);
});

test('rotacion autenticada de FID preserva id y first_seen pero rota la credencial', () => {
  const app = createApp();
  const first = installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY);
  const later = new Date(NOW.getTime() + 60_000);
  const rotated = installations.registerInstallation(app, context({
    credential: first.credential,
    payload: installations.parseRegisterPayload(registerPayload(FID_B)),
    now: later,
  }), CREDENTIAL_SECRET, AES_KEY);

  assert.equal(rotated.created, false);
  assert.equal(rotated.fid_rotated, true);
  assert.equal(rotated.installation.id, first.installation.id);
  assert.notEqual(rotated.credential, first.credential);
  assert.equal(rotated.installation.first_seen_at, first.installation.first_seen_at);
  assert.equal(app.list(installations.INSTALLATIONS_COLLECTION).length, 1);
  assert.equal(app.list(installations.INSTALLATIONS_COLLECTION)[0].getString('fid'), FID_B);
});

test('App Set ID rota un FID sin duplicar la instalación y solo persiste su HMAC', () => {
  const app = createApp();
  const first = installations.registerInstallation(app, context({
    payload: installations.parseRegisterPayload(appSetRegisterPayload(FID_A)),
  }), CREDENTIAL_SECRET, AES_KEY);
  const rotated = installations.registerInstallation(app, context({
    payload: installations.parseRegisterPayload(appSetRegisterPayload(FID_B)),
    now: new Date(NOW.getTime() + 60_000),
  }), CREDENTIAL_SECRET, AES_KEY);

  assert.equal(first.created, true);
  assert.equal(rotated.created, false);
  assert.equal(rotated.fid_rotated, true);
  assert.equal(rotated.installation.id, first.installation.id);
  assert.equal(app.list(installations.INSTALLATIONS_COLLECTION).length, 1);
  const stored = app.list(installations.INSTALLATIONS_COLLECTION)[0];
  assert.match(stored.getString('app_set_digest'), /^[a-f0-9]{64}$/);
  assert.notEqual(stored.getString('app_set_digest'), APP_SET_ID);
  assert.notEqual(
    installations.appSetDigest(APP_A, APP_SET_ID, CREDENTIAL_SECRET, securityFixture()),
    installations.appSetDigest(APP_A, APP_SET_ID.toLowerCase(), CREDENTIAL_SECRET, securityFixture()),
  );
});

test('reinstalacion sin credencial y con FID nuevo crea otra instalacion auditable', () => {
  const app = createApp();
  const first = installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY);
  const reinstalled = installations.registerInstallation(app, context({
    payload: installations.parseRegisterPayload(registerPayload(FID_B)),
    now: new Date(NOW.getTime() + 120_000),
  }), CREDENTIAL_SECRET, AES_KEY);
  assert.notEqual(reinstalled.installation.id, first.installation.id);
  assert.equal(app.list(installations.INSTALLATIONS_COLLECTION).length, 2);
});

test('una credencial no puede cruzar firebase app, app config ni tienda', () => {
  const app = createApp();
  const first = installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY);
  assert.throws(() => installations.registerInstallation(app, context({
    appId: FIREBASE_B,
    credential: first.credential,
    payload: installations.parseRegisterPayload(registerPayload(FID_B)),
  }), CREDENTIAL_SECRET, AES_KEY), assertCode('invalid_credential'));
  assert.equal(app.list(installations.INSTALLATIONS_COLLECTION).length, 1);
});

test('heartbeat, permiso y disable requieren credencial y disable es idempotente', () => {
  const app = createApp();
  const first = installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY);
  const heartbeatContext = context({
    credential: first.credential,
    payload: installations.parseHeartbeatPayload(heartbeatPayload()),
    now: new Date(NOW.getTime() + 60_000),
  });
  const heartbeat = installations.heartbeatInstallation(app, heartbeatContext, CREDENTIAL_SECRET, AES_KEY);
  assert.equal(heartbeat.installation.last_seen_at, heartbeatContext.now.toISOString());
  assert.equal(app.list(installations.INSTALLATIONS_COLLECTION)[0].getString('app_version'), '1.0.1');

  const permission = installations.updateInstallationPermission(app, context({
    credential: first.credential,
    payload: installations.parsePermissionPayload({ notification_permission: 'granted' }),
  }), CREDENTIAL_SECRET);
  assert.equal(permission.installation.notification_permission, 'granted');

  const disabled = installations.disableInstallation(app, context({
    credential: first.credential,
    payload: {},
  }), CREDENTIAL_SECRET);
  const disabledAgain = installations.disableInstallation(app, context({
    credential: first.credential,
    payload: {},
  }), CREDENTIAL_SECRET);
  assert.equal(disabled.already_disabled, false);
  assert.equal(disabledAgain.already_disabled, true);
  assert.throws(() => installations.heartbeatInstallation(app, heartbeatContext, CREDENTIAL_SECRET, AES_KEY), assertCode('installation_not_available'));
});

test('plan no Premium bloquea altas pero una app no elige store_id', () => {
  const app = createApp();
  const store = app.findRecordById('stores', STORE_A);
  store.set('plan', 'free');
  store.set('plan_is_permanent', false);
  store.set('plan_expires_at', '2026-08-20T00:00:00.000Z');
  assert.throws(() => installations.registerInstallation(app, context(), CREDENTIAL_SECRET, AES_KEY), assertCode('plan_not_available'));
});

test('la referencia administrativa distingue instalaciones sin exponer FID ni ids internos', () => {
  const security = securityFixture();
  const config = { security, credentialSecret: CREDENTIAL_SECRET };
  const installationId = 'installstorea01';
  const first = installations.installationAdminReference(STORE_A, installationId, config);
  const repeated = installations.installationAdminReference(STORE_A, installationId, config);
  const other = installations.installationAdminReference(STORE_A, 'installstorea02', config);
  assert.match(first, /^APP-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
  assert.equal(repeated, first);
  assert.notEqual(other, first);
  assert.doesNotMatch(first, new RegExp(installationId, 'i'));
  assert.doesNotMatch(first, new RegExp(FID_A.slice(0, 8), 'i'));
});

test('cada pedido de app conserva una sola relación privada con su instalación', () => {
  const app = createApp();
  const installation = record(installations.INSTALLATIONS_COLLECTION, 'installorigin01', {
    store: STORE_A,
    app_config: APP_A,
    status: 'active',
  });
  const otherInstallation = record(installations.INSTALLATIONS_COLLECTION, 'installorigin02', {
    store: STORE_A,
    app_config: APP_A,
    status: 'active',
  });
  const order = record('orders', 'orderorigin0001', { store: STORE_A, customer: 'customerorigin1' });
  app.records.set(`${installation.collection}:${installation.id}`, installation);
  app.records.set(`${otherInstallation.collection}:${otherInstallation.id}`, otherInstallation);
  app.records.set(`${order.collection}:${order.id}`, order);

  const first = installations.ensureOrderInstallationLink(
    app,
    { storeId: STORE_A, installation },
    order,
    NOW,
  );
  const repeated = installations.ensureOrderInstallationLink(
    app,
    { storeId: STORE_A, installation },
    order,
    new Date(NOW.getTime() + 1000),
  );
  assert.ok(first);
  assert.equal(repeated.id, first.id);
  assert.equal(first.getString('store'), STORE_A);
  assert.equal(first.getString('installation'), installation.id);
  assert.equal(first.getString('order'), order.id);
  assert.equal(first.getString('status'), 'active');
  assert.equal(first.getString('attribution_source'), 'none');
  assert.equal(app.list('storefront_order_links').length, 1);

  const conflicting = installations.ensureOrderInstallationLink(
    app,
    { storeId: STORE_A, installation: otherInstallation },
    order,
    NOW,
  );
  assert.equal(conflicting, null);
  assert.equal(app.list('storefront_order_links').length, 1);
});

test('bootstrap es de un solo uso, cambia el digest y redirige solo al prefijo fijo', () => {
  const randoms = ['B'.repeat(48), 'C'.repeat(64)];
  const security = securityFixture(randoms);
  const app = createApp();
  const first = installations.registerInstallation(app, context({ security }), CREDENTIAL_SECRET, AES_KEY);
  const bootstrapContext = context({ security, credential: first.credential, payload: {} });
  const bootstrap = installations.createBootstrapSession(app, bootstrapContext, CREDENTIAL_SECRET);
  assert.equal(bootstrap.expires_in_seconds, 60);
  assert.equal(bootstrap.bootstrap_code, `pzb_v1_${'B'.repeat(48)}`);

  const consumed = installations.consumeBootstrapSession(app, context({
    appId: '',
    credential: '',
    security,
    payload: installations.parseBootstrapConsumePayload({ code: bootstrap.bootstrap_code }),
  }), CREDENTIAL_SECRET);
  assert.equal(consumed.redirect_path, '/t/powerzona');
  assert.equal(consumed.session_token, `pzws_v1_${'C'.repeat(64)}`);
  assert.equal(consumed.max_age_seconds, 86_400);
  const active = installations.resolveActiveWebSession(app, consumed.session_token, NOW, {
    security, credentialSecret: CREDENTIAL_SECRET,
  });
  assert.equal(active.storeId, STORE_A);
  assert.equal(active.installation.id, first.installation.id);
  assert.equal(installations.resolveActiveWebSession(app, `${consumed.session_token}x`, NOW, {
    security, credentialSecret: CREDENTIAL_SECRET,
  }), null);
  active.session.set('expires_at', new Date(NOW.getTime() - 1000).toISOString());
  assert.equal(installations.resolveActiveWebSession(app, consumed.session_token, NOW, {
    security, credentialSecret: CREDENTIAL_SECRET,
  }), null);
  assert.throws(() => installations.consumeBootstrapSession(app, context({
    appId: '',
    credential: '',
    security,
    payload: installations.parseBootstrapConsumePayload({ code: bootstrap.bootstrap_code }),
  }), CREDENTIAL_SECRET), assertCode('bootstrap_not_found'));
});

test('sobre interno exige HMAC reciente y rechaza replay del nonce', () => {
  installations.resetMemoryForTests();
  const security = securityFixture();
  const body = {
    app_id: FIREBASE_A,
    credential: '',
    client: { ip: '8.8.8.8', country_code: 'US', region_code: 'FL' },
    payload: registerPayload(),
  };
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const nonce = '018f54de-6c37-4f2c-8d5a-0123456789ab';
  const action = 'installations_register';
  const material = `${timestamp}\n${nonce}\n${action}\n${installations.canonicalJson(body)}`;
  const signature = security.hs256(material, INTERNAL_SECRET);
  const event = {
    requestInfo() {
      return {
        body,
        headers: {
          'x-pz-storefront-internal': INTERNAL_SECRET,
          'x-pz-storefront-timestamp': timestamp,
          'x-pz-storefront-nonce': nonce,
          'x-pz-storefront-signature': signature,
        },
      };
    },
  };

  const authorized = installations.authorizeInternalRequest(event, action, {
    now: NOW,
    security,
    internalSecret: INTERNAL_SECRET,
  });
  assert.equal(authorized.appId, FIREBASE_A);
  assert.throws(() => installations.authorizeInternalRequest(event, action, {
    now: NOW,
    security,
    internalSecret: INTERNAL_SECRET,
  }), assertCode('unauthorized'));
});

test('rate limiting corta abuso por accion sin almacenar FID, credencial o IP como clave', () => {
  installations.resetMemoryForTests();
  const security = securityFixture();
  const rateContext = context({ security });
  for (let index = 0; index < 12; index += 1) {
    assert.equal(installations.consumeRateLimit('installations_register', rateContext, CREDENTIAL_SECRET), true);
  }
  assert.equal(installations.consumeRateLimit('installations_register', rateContext, CREDENTIAL_SECRET), false);
});

test('rutas privadas tienen body limit y omiten activity logs con datos sensibles', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_storefront_installations.pb.js'), 'utf8');
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_storefront_installations_lib.js'), 'utf8');
  for (const route of [
    '/installations/register',
    '/installations/heartbeat',
    '/installations/permission',
    '/installations/disable',
    '/session/bootstrap',
    '/session/bootstrap/consume',
    '/campaigns/resolve-target',
    '/updates/policy',
    '/updates/ticket',
    '/storefront-app-updates/{artifact}/{ticket}/{filename}',
    '/events',
  ]) assert.match(routes, new RegExp(route.replaceAll('/', '\\/')));
  assert.equal((routes.match(/\$apis\.bodyLimit\(/g) || []).length, 11);
  assert.equal((routes.match(/\$apis\.skipSuccessActivityLog\(\)/g) || []).length, 11);
  assert.match(routes, /campaigns_resolve_target/);
  assert.match(source, /PZ_STOREFRONT_INSTALLATION_REQUEST_FAILED/);
  assert.doesNotMatch(source, /logger\(\)\.error\([\s\S]{0,300}error\.message/);
});

test('runtime PocketBase real completa registro, rotacion, mantenimiento, bootstrap y disable', {
  skip: !fs.existsSync(POCKETBASE_EXE),
  timeout: 90_000,
}, async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-c03-runtime-'));
  const internalSecret = 'runtime-internal-c03-abcdefghijklmnopqrstuvwxyz';
  const credentialSecret = 'runtime-credential-c03-abcdefghijklmnopqrstuvwxyz';
  const runtimeEnvironment = {
    ...process.env,
    PZ_STOREFRONT_INTERNAL_SECRET: internalSecret,
    PZ_STOREFRONT_CREDENTIAL_SECRET: credentialSecret,
    PZ_SECURITY_HMAC_SECRET: 'runtime-security-hmac-c03-abcdefghijklmnopqrstuvwxyz',
    PZ_SECURITY_AES_KEY: AES_KEY,
    PZ_PUSH_RELAY_SECRET: 'runtime-relay-c03-abcdefghijklmnopqrstuvwxyz',
  };
  const superEmail = 'pz-c03-runtime@example.com';
  const superPassword = 'Qa-C03-runtime-password-2026!';
  let runtime = null;

  try {
    const bootstrap = spawnSync(
      POCKETBASE_EXE,
      ['superuser', 'create', superEmail, superPassword, ...runtimeFlags(dataDirectory)],
      {
        cwd: BACKEND_DIR,
        env: runtimeEnvironment,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(bootstrap.status, 0, `${bootstrap.stdout || ''}\n${bootstrap.stderr || ''}`);

    const port = await freePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    runtime = startPocketBase(dataDirectory, port, runtimeEnvironment);
    await waitForPocketBase(runtime, baseUrl);

    const auth = await apiRequest(baseUrl, '/api/collections/_superusers/auth-with-password', {
      body: { identity: superEmail, password: superPassword },
    });
    assert.equal(auth.status, 200, auth.raw);
    const superToken = auth.data.token;
    const stores = await apiRequest(
      baseUrl,
      `/api/collections/stores/records?filter=${encodeURIComponent('slug = "powerzona"')}&perPage=1`,
      { token: superToken },
    );
    assert.equal(stores.status, 200, stores.raw);
    assert.equal(stores.data.items.length, 1);
    const store = stores.data.items[0];
    assert.equal(store.status, 'active');
    assert.equal(store.plan, 'premium');
    assert.equal(store.plan_is_permanent, true);

    const appConfig = await apiRequest(baseUrl, '/api/collections/storefront_app_configs/records', {
      token: superToken,
      body: {
        store: store.id,
        app_key: 'powerzona-runtime-c03',
        display_name: 'PowerZona Runtime C03',
        package_name: 'com.tusenda84.powerzona.runtimec03',
        firebase_app_id: FIREBASE_A,
        public_origin: 'https://staging.example',
        store_path_prefix: '/t/powerzona',
        status: 'active',
        min_supported_version_code: 1,
        min_supported_version_name: '1.0.0',
      },
    });
    assert.ok([200, 201].includes(appConfig.status), appConfig.raw);

    const directAnonymous = await apiRequest(baseUrl, '/api/collections/storefront_installations/records');
    assert.equal(directAnonymous.status, 403, directAnonymous.raw);

    async function internalPost(action, route, appId, credential, payload) {
      const body = {
        app_id: appId,
        credential,
        client: { ip: '8.8.8.8', country_code: 'US', region_code: 'FL' },
        payload,
      };
      return apiRequest(baseUrl, route, {
        body,
        headers: signedHeaders(action, body, internalSecret),
      });
    }

    const first = await internalPost(
      'installations_register',
      '/api/pz/storefront/v1/installations/register',
      FIREBASE_A,
      '',
      registerPayload(FID_A),
    );
    assert.equal(first.status, 200, first.raw);
    assert.equal(first.data.created, true);
    assert.match(first.data.credential, installations.CREDENTIAL_PATTERN);

    const repeated = await internalPost(
      'installations_register',
      '/api/pz/storefront/v1/installations/register',
      FIREBASE_A,
      '',
      registerPayload(FID_A),
    );
    assert.equal(repeated.status, 200, repeated.raw);
    assert.equal(repeated.data.created, false);
    assert.equal(repeated.data.installation.id, first.data.installation.id);
    assert.equal(repeated.data.credential, first.data.credential);

    const rotated = await internalPost(
      'installations_register',
      '/api/pz/storefront/v1/installations/register',
      FIREBASE_A,
      first.data.credential,
      registerPayload(FID_B),
    );
    assert.equal(rotated.status, 200, rotated.raw);
    assert.equal(rotated.data.fid_rotated, true);
    assert.equal(rotated.data.installation.id, first.data.installation.id);
    assert.notEqual(rotated.data.credential, first.data.credential);

    const heartbeat = await internalPost(
      'installations_heartbeat',
      '/api/pz/storefront/v1/installations/heartbeat',
      FIREBASE_A,
      rotated.data.credential,
      heartbeatPayload(),
    );
    assert.equal(heartbeat.status, 200, heartbeat.raw);
    assert.equal(heartbeat.data.installation.status, 'active');

    const permission = await internalPost(
      'installations_permission',
      '/api/pz/storefront/v1/installations/permission',
      FIREBASE_A,
      rotated.data.credential,
      { notification_permission: 'granted' },
    );
    assert.equal(permission.status, 200, permission.raw);
    assert.equal(permission.data.installation.notification_permission, 'granted');

    const bootstrapSession = await internalPost(
      'session_bootstrap',
      '/api/pz/storefront/v1/session/bootstrap',
      FIREBASE_A,
      rotated.data.credential,
      {},
    );
    assert.equal(bootstrapSession.status, 200, bootstrapSession.raw);
    assert.match(bootstrapSession.data.bootstrap_code, installations.BOOTSTRAP_CODE_PATTERN);

    const consumeBody = {
      app_id: '',
      credential: '',
      client: { ip: '8.8.8.8', country_code: 'US', region_code: 'FL' },
      payload: { code: bootstrapSession.data.bootstrap_code },
    };
    const consumed = await apiRequest(baseUrl, '/api/pz/storefront/v1/session/bootstrap/consume', {
      body: consumeBody,
      headers: signedHeaders('session_consume', consumeBody, internalSecret),
    });
    assert.equal(consumed.status, 200, consumed.raw);
    assert.equal(consumed.data.redirect_path, '/t/powerzona');
    assert.match(consumed.data.session_token, /^pzws_v1_[A-Za-z0-9]{64}$/);

    const consumedAgain = await apiRequest(baseUrl, '/api/pz/storefront/v1/session/bootstrap/consume', {
      body: consumeBody,
      headers: signedHeaders('session_consume', consumeBody, internalSecret),
    });
    assert.equal(consumedAgain.status, 404, consumedAgain.raw);
    assert.equal(consumedAgain.data.error, 'bootstrap_not_found');

    const disabled = await internalPost(
      'installations_disable',
      '/api/pz/storefront/v1/installations/disable',
      FIREBASE_A,
      rotated.data.credential,
      {},
    );
    assert.equal(disabled.status, 200, disabled.raw);
    assert.equal(disabled.data.disabled, true);

    const heartbeatDisabled = await internalPost(
      'installations_heartbeat',
      '/api/pz/storefront/v1/installations/heartbeat',
      FIREBASE_A,
      rotated.data.credential,
      heartbeatPayload(),
    );
    assert.equal(heartbeatDisabled.status, 409, heartbeatDisabled.raw);
    assert.equal(heartbeatDisabled.data.error, 'installation_not_available');

    const stored = await apiRequest(
      baseUrl,
      `/api/collections/storefront_installations/records?filter=${encodeURIComponent(`id = "${first.data.installation.id}"`)}`,
      { token: superToken },
    );
    assert.equal(stored.status, 200, stored.raw);
    assert.equal(stored.data.items.length, 1);
    assert.equal(stored.data.items[0].status, 'disabled');
    assert.notEqual(stored.data.items[0].last_ip_encrypted, '8.8.8.8');
  } finally {
    await stopPocketBase(runtime);
    const resolved = path.resolve(dataDirectory);
    assert.equal(resolved.startsWith(path.resolve(os.tmpdir())), true);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
