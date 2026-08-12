import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  consumeStorefrontBootstrap,
  resetStorefrontRateLimitsForTests,
  storefrontAppCheckToken,
  storefrontGatewayTransportAllowed,
  storefrontInternalSignature,
  storefrontNativeGateway,
  storefrontRateLimitAllowed,
  storefrontRequestTransportAllowed,
  validateStorefrontInternalSecret,
  verifyStorefrontAppCheck,
} from '../src/lib/storefrontPushAppCheck.ts';
import {
  STOREFRONT_MAX_BODY_BYTES,
  canonicalStorefrontJson,
  normalizeStorefrontEmptyPayload,
  normalizeStorefrontHeartbeatPayload,
  normalizeStorefrontPermissionPayload,
  normalizeStorefrontRegisterPayload,
  readStorefrontJson,
  storefrontInstallationCredential,
} from '../src/lib/storefrontPushContracts.ts';

const APP_ID = '1:1234567890:android:aaaaaaaaaaaaaaaa';
const FID = 'abcdefghijklmnopqrstuv';
const CREDENTIAL = `pzs_v1_${'a'.repeat(64)}`;
const INTERNAL_SECRET = 'internal-secret-c03-abcdefghijklmnopqrstuvwxyz';

const registerPayload = (overrides = {}) => ({
  fid: FID,
  app_version: '1.0.0',
  app_version_code: 1,
  android_version: 'Android 16',
  device_model: 'Google Pixel 9',
  locale: 'es-US',
  timezone: 'America/Havana',
  notification_permission: 'unknown',
  ...overrides,
});

function request(path, body, headers = {}) {
  return new Request(`https://staging.example${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-firebase-appcheck': 'x'.repeat(64),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('contratos publicos son exactos y nunca aceptan store_id o IP del telefono', () => {
  assert.deepEqual(normalizeStorefrontRegisterPayload(registerPayload()), registerPayload());
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ store_id: 'otra' })), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ ip: '1.2.3.4' })), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ timezone: 'javascript:alert(1)' })), null);
  assert.deepEqual(normalizeStorefrontHeartbeatPayload({
    app_version: '1.0.1',
    app_version_code: 2,
    android_version: 'Android 16',
    device_model: 'Pixel',
    locale: 'es-US',
    timezone: 'America/Havana',
  }), {
    app_version: '1.0.1',
    app_version_code: 2,
    android_version: 'Android 16',
    device_model: 'Pixel',
    locale: 'es-US',
    timezone: 'America/Havana',
  });
  assert.deepEqual(normalizeStorefrontPermissionPayload({ notification_permission: 'denied' }), {
    notification_permission: 'denied',
  });
  assert.equal(normalizeStorefrontPermissionPayload({ notification_permission: 'allowed' }), null);
});

test('limita cuerpo real y declarado, y solo acepta Bearer con credencial opaca', async () => {
  const valid = request('/register', registerPayload(), { authorization: `Bearer ${CREDENTIAL}` });
  assert.equal(storefrontInstallationCredential(valid), CREDENTIAL);
  assert.equal(storefrontInstallationCredential(request('/register', registerPayload(), { authorization: `Basic ${CREDENTIAL}` })), '');

  const parsed = await readStorefrontJson(request('/register', registerPayload()), STOREFRONT_MAX_BODY_BYTES.register);
  assert.equal(parsed.ok, true);
  const oversized = new Request('https://staging.example/register', {
    method: 'POST',
    headers: { 'content-length': '5000' },
    body: '{}',
  });
  assert.deepEqual(await readStorefrontJson(oversized, 4096), { ok: false, error: 'payload_too_large' });
});

test('App Check es obligatorio y firebase_app_id procede solo del token verificado', async () => {
  const missing = new Request('https://staging.example/register', { method: 'POST', body: '{}' });
  assert.equal(storefrontAppCheckToken(missing), '');
  assert.equal((await verifyStorefrontAppCheck(missing, async () => ({ appId: APP_ID }))).ok, false);

  const valid = request('/register', registerPayload());
  const verified = await verifyStorefrontAppCheck(valid, async (token) => {
    assert.equal(token, 'x'.repeat(64));
    return { appId: APP_ID };
  });
  assert.deepEqual(verified, { ok: true, appId: APP_ID });
  assert.deepEqual(await verifyStorefrontAppCheck(valid, async () => { throw new Error('bad token'); }), {
    ok: false,
    status: 401,
    error: 'app_check_invalid',
  });
});

test('sobre interno usa JSON canonico y HMAC-SHA256 reproducible', () => {
  const envelope = {
    payload: { b: 2, a: 1 },
    client: { region_code: '', country_code: '', ip: '8.8.8.8' },
    credential: '',
    app_id: APP_ID,
  };
  const timestamp = '1786500000';
  const nonce = '018f54de-6c37-4f2c-8d5a-0123456789ab';
  const material = `${timestamp}\n${nonce}\ninstallations_register\n${canonicalStorefrontJson(envelope)}`;
  assert.equal(
    storefrontInternalSignature(INTERNAL_SECRET, timestamp, nonce, 'installations_register', envelope),
    createHmac('sha256', INTERNAL_SECRET).update(material).digest('hex'),
  );
  assert.equal(canonicalStorefrontJson({ z: 1, a: { y: true, x: false } }), '{"a":{"x":false,"y":true},"z":1}');
});

test('secretos internos cortos o reutilizados fallan cerrados', () => {
  assert.equal(validateStorefrontInternalSecret('short'), false);
  assert.equal(validateStorefrontInternalSecret(INTERNAL_SECRET), true);
  assert.equal(validateStorefrontInternalSecret(INTERNAL_SECRET, [INTERNAL_SECRET]), false);
});

test('HTTPS es obligatorio salvo loopback local fuera de produccion', () => {
  assert.equal(storefrontRequestTransportAllowed('https://staging.example/register', 'production'), true);
  assert.equal(storefrontRequestTransportAllowed('http://staging.example/register', 'production'), false);
  assert.equal(storefrontRequestTransportAllowed('http://127.0.0.1:4321/register', 'development'), true);

  const proxiedHttps = new Request('http://staging.example/register', {
    headers: {
      'x-forwarded-for': '198.51.100.8',
      'x-forwarded-host': 'staging.example',
      'x-forwarded-proto': 'https',
      'x-real-ip': '198.51.100.8',
    },
  });
  assert.equal(storefrontGatewayTransportAllowed(proxiedHttps, '172.20.0.2', 'production'), true);
  assert.equal(storefrontGatewayTransportAllowed(proxiedHttps, '198.51.100.8', 'production'), true);
  assert.equal(storefrontGatewayTransportAllowed(new Request('http://staging.example/register', {
    headers: { 'x-forwarded-proto': 'https' },
  }), '198.51.100.8', 'production'), false);
  assert.equal(storefrontGatewayTransportAllowed(new Request('http://staging.example/register', {
    headers: {
      'x-forwarded-for': '198.51.100.8',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
      'x-real-ip': '198.51.100.8',
    },
  }), '198.51.100.8', 'production'), false);
  assert.equal(storefrontGatewayTransportAllowed(new Request('http://staging.example/register', {
    headers: {
      'x-forwarded-for': '198.51.100.8',
      'x-forwarded-host': 'staging.example',
      'x-forwarded-proto': 'http',
      'x-real-ip': '198.51.100.8',
    },
  }), '172.20.0.2', 'production'), false);
});

test('rate limiting separa acciones y bloquea al superar la ventana', () => {
  resetStorefrontRateLimitsForTests();
  for (let index = 0; index < 12; index += 1) {
    assert.equal(storefrontRateLimitAllowed('installations_register', 'same-installation', 1000), true);
  }
  assert.equal(storefrontRateLimitAllowed('installations_register', 'same-installation', 1000), false);
  assert.equal(storefrontRateLimitAllowed('installations_heartbeat', 'same-installation', 1000), true);
  assert.equal(storefrontRateLimitAllowed('installations_register', 'same-installation', 61_001), true);
});

test('gateway deriva app/IP, firma hacia PocketBase y no reenvia headers manipulables', async (t) => {
  resetStorefrontRateLimitsForTests();
  const previous = {
    internal: process.env.PZ_STOREFRONT_INTERNAL_SECRET,
    pocketbase: process.env.PZ_POCKETBASE_INTERNAL_URL,
    relay: process.env.PZ_PUSH_RELAY_SECRET,
  };
  process.env.PZ_STOREFRONT_INTERNAL_SECRET = INTERNAL_SECRET;
  process.env.PZ_POCKETBASE_INTERNAL_URL = 'http://pocketbase.internal:8080';
  process.env.PZ_PUSH_RELAY_SECRET = 'different-relay-secret-abcdefghijklmnopqrstuvwxyz';
  t.after(() => {
    for (const [key, value] of Object.entries({
      PZ_STOREFRONT_INTERNAL_SECRET: previous.internal,
      PZ_POCKETBASE_INTERNAL_URL: previous.pocketbase,
      PZ_PUSH_RELAY_SECRET: previous.relay,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  let forwarded;
  const response = await storefrontNativeGateway({
    request: request('/api/storefront/v1/installations/register', registerPayload({
      // The strict parser removes the possibility of choosing another tenant.
    }), { 'x-forwarded-for': '203.0.113.99' }),
    clientAddress: '8.8.8.8',
    action: 'installations_register',
    internalPath: '/api/pz/storefront/v1/installations/register',
    maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.register,
    credential: 'optional',
    parsePayload: normalizeStorefrontRegisterPayload,
    verifyAppCheckToken: async () => ({ appId: APP_ID }),
    now: new Date('2026-08-12T02:00:00.000Z'),
    fetchImpl: async (url, init) => {
      forwarded = { url: String(url), init, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({
        ok: true,
        created: true,
        fid_rotated: false,
        installation: {
          id: 'inst00000000001',
          status: 'active',
          notification_permission: 'unknown',
          first_seen_at: '2026-08-12T02:00:00.000Z',
          last_seen_at: '2026-08-12T02:00:00.000Z',
        },
        credential: CREDENTIAL,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(forwarded.url, 'http://pocketbase.internal:8080/api/pz/storefront/v1/installations/register');
  assert.equal(forwarded.body.app_id, APP_ID);
  assert.equal(forwarded.body.client.ip, '8.8.8.8');
  assert.equal('store_id' in forwarded.body.payload, false);
  assert.equal('ip' in forwarded.body.payload, false);
  assert.equal(forwarded.init.headers['x-pz-storefront-internal'], INTERNAL_SECRET);
  assert.match(forwarded.init.headers['x-pz-storefront-signature'], /^[a-f0-9]{64}$/);
});

test('heartbeat sin credencial y App Check invalido fallan antes de tocar PocketBase', async () => {
  let fetched = false;
  const baseOptions = {
    request: request('/heartbeat', {
      app_version: '1.0.0',
      app_version_code: 1,
      android_version: 'Android 16',
      device_model: 'Pixel',
      locale: 'es-US',
      timezone: 'America/Havana',
    }),
    clientAddress: '8.8.8.8',
    action: 'installations_heartbeat',
    internalPath: '/api/pz/storefront/v1/installations/heartbeat',
    maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.heartbeat,
    credential: 'required',
    parsePayload: normalizeStorefrontHeartbeatPayload,
    verifyAppCheckToken: async () => ({ appId: APP_ID }),
    fetchImpl: async () => { fetched = true; return new Response('{}'); },
  };
  const missingCredential = await storefrontNativeGateway(baseOptions);
  assert.equal(missingCredential.status, 401);
  assert.equal(fetched, false);
});

test('consumo bootstrap establece cookie HttpOnly Secure y solo redirige a ruta de tienda', async (t) => {
  resetStorefrontRateLimitsForTests();
  const previousInternal = process.env.PZ_STOREFRONT_INTERNAL_SECRET;
  const previousPocketBase = process.env.PZ_POCKETBASE_INTERNAL_URL;
  process.env.PZ_STOREFRONT_INTERNAL_SECRET = INTERNAL_SECRET;
  process.env.PZ_POCKETBASE_INTERNAL_URL = 'http://pocketbase.internal:8080';
  t.after(() => {
    if (previousInternal === undefined) delete process.env.PZ_STOREFRONT_INTERNAL_SECRET;
    else process.env.PZ_STOREFRONT_INTERNAL_SECRET = previousInternal;
    if (previousPocketBase === undefined) delete process.env.PZ_POCKETBASE_INTERNAL_URL;
    else process.env.PZ_POCKETBASE_INTERNAL_URL = previousPocketBase;
  });

  const code = `pzb_v1_${'B'.repeat(48)}`;
  const response = await consumeStorefrontBootstrap({
    request: new Request(`https://staging.example/api/storefront/v1/session/bootstrap/${code}`),
    clientAddress: '8.8.8.8',
    code,
    now: new Date('2026-08-12T02:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      session_token: `pzws_v1_${'C'.repeat(64)}`,
      redirect_path: '/t/powerzona',
      max_age_seconds: 86_400,
    }), { status: 200 }),
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/t/powerzona');
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  assert.doesNotMatch(response.headers.get('set-cookie'), new RegExp(code));
});

test('inventario C03 expone seis rutas y no incluye C04 ni relay v2', () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const gateway = read('../src/lib/storefrontPushAppCheck.ts');
  const routes = [
    '../src/pages/api/storefront/v1/installations/register.ts',
    '../src/pages/api/storefront/v1/installations/heartbeat.ts',
    '../src/pages/api/storefront/v1/installations/permission.ts',
    '../src/pages/api/storefront/v1/installations/disable.ts',
    '../src/pages/api/storefront/v1/session/bootstrap.ts',
    '../src/pages/api/storefront/v1/session/bootstrap/[code].ts',
  ].map(read).join('\n');
  assert.match(gateway, /verifyToken\(token\)/);
  assert.match(gateway, /environmentValue\('PZ_STOREFRONT_FIREBASE_PROJECT_ID'\)/);
  assert.match(gateway, /environmentValue\('PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON'\)/);
  assert.match(gateway, /Storefront Firebase credentials are not configured/);
  assert.match(gateway, /Storefront Firebase project mismatch/);
  assert.doesNotMatch(gateway, /environmentValue\('FIREBASE_(?:PROJECT_ID|SERVICE_ACCOUNT_JSON)'\)/);
  assert.match(gateway, /publicSecurityProxyHeaders\(request, clientAddress, false\)/);
  assert.match(routes, /installations_register/);
  assert.match(routes, /installations_heartbeat/);
  assert.match(routes, /installations_permission/);
  assert.match(routes, /installations_disable/);
  assert.match(routes, /session_bootstrap/);
  assert.match(routes, /consumeStorefrontBootstrap/);
  assert.doesNotMatch(routes, /push\/v2|media|campaigns/);
});
