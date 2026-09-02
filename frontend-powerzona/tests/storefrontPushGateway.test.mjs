import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  consumeStorefrontBootstrap,
  mapBootstrapResponse,
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
  mapStorefrontCoreRegisterResponse,
  mapStorefrontFirebaseEnrichmentResponse,
  mapStorefrontResolvedTarget,
  mapStorefrontEventResponse,
  mapStorefrontNotificationAckResponse,
  mapStorefrontNotificationsSyncResponse,
  mapStorefrontRealtimeTicketResponse,
  normalizeStorefrontCampaignTargetPayload,
  normalizeStorefrontCoreRegisterPayload,
  normalizeStorefrontDiagnosticsPayload,
  normalizeStorefrontEmptyPayload,
  normalizeStorefrontEventPayload,
  normalizeStorefrontFirebaseEnrichmentPayload,
  normalizeStorefrontHeartbeatPayload,
  normalizeStorefrontNotificationReceiptsPayload,
  normalizeStorefrontPermissionPayload,
  normalizeStorefrontRegisterPayload,
  readStorefrontJson,
  storefrontInstallationCredential,
} from '../src/lib/storefrontPushContracts.ts';

const APP_ID = '1:1234567890:android:aaaaaaaaaaaaaaaa';
const FID = 'abcdefghijklmnopqrstuv';
const APP_SET_ID = '12Jd92JD8078S8J29sDoakc0EF230337';
const CREDENTIAL = `pzs_v1_${'a'.repeat(64)}`;
const INTERNAL_SECRET = 'internal-secret-c03-abcdefghijklmnopqrstuvwxyz';

const registerPayload = (overrides = {}) => ({
  fid: FID,
  app_set_id: APP_SET_ID,
  app_version: '1.0.0',
  app_version_code: 1,
  android_version: 'Android 16',
  device_model: 'Google Pixel 9',
  locale: 'es-US',
  timezone: 'America/Havana',
  notification_permission: 'unknown',
  ...overrides,
});

const coreRegisterPayload = (overrides = {}) => ({
  installation_id: '123e4567-e89b-42d3-a456-426614174000',
  app_key: 'powerzona-storefront-staging',
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
  assert.deepEqual(normalizeStorefrontCoreRegisterPayload(coreRegisterPayload()), coreRegisterPayload());
  assert.deepEqual(normalizeStorefrontFirebaseEnrichmentPayload({ fid: FID }), { fid: FID });
  assert.deepEqual(
    normalizeStorefrontFirebaseEnrichmentPayload({ fid: FID, app_set_id: APP_SET_ID }),
    { fid: FID, app_set_id: APP_SET_ID },
  );
  assert.equal(normalizeStorefrontFirebaseEnrichmentPayload({ fid: FID, store_id: 'otra' }), null);
  assert.equal(normalizeStorefrontFirebaseEnrichmentPayload({ fid: 'short' }), null);
  assert.deepEqual(mapStorefrontFirebaseEnrichmentResponse({
    ok: true, firebase_registered: true, fid_rotated: false, credential: CREDENTIAL,
  }), {
    ok: true, firebase_registered: true, fid_rotated: false, credential: CREDENTIAL,
  });
  assert.equal(mapStorefrontFirebaseEnrichmentResponse({
    ok: true, firebase_registered: true, fid_rotated: false, credential: CREDENTIAL, installation_id: 'leak',
  }), null);
  assert.equal(normalizeStorefrontCoreRegisterPayload(coreRegisterPayload({ store_id: 'otra' })), null);
  assert.equal(normalizeStorefrontCoreRegisterPayload(coreRegisterPayload({
    installation_id: 'not-a-uuid',
  })), null);
  const realtimeTicket = `pzrt_v1.${'a'.repeat(64)}.1788000000.1788000060.${'D'.repeat(32)}.${'e'.repeat(64)}`;
  assert.deepEqual(mapStorefrontRealtimeTicketResponse({
    ok: true,
    ticket: realtimeTicket,
    expires_at: '2026-09-01T12:01:00.000Z',
    websocket_url: 'wss://realtime.tusenda84.com/v1/connect',
  }), {
    ok: true,
    ticket: realtimeTicket,
    expires_at: '2026-09-01T12:01:00.000Z',
    websocket_url: 'wss://realtime.tusenda84.com/v1/connect',
  });
  assert.equal(mapStorefrontRealtimeTicketResponse({
    ok: true,
    ticket: realtimeTicket,
    expires_at: '2026-09-01T12:01:00.000Z',
    websocket_url: 'ws://realtime.tusenda84.com/v1/connect',
  }), null);
  const diagnostic = {
    events: [{
      idempotency_key: '123e4567-e89b-42d3-a456-426614174000',
      event_type: 'INSTALLATION_REGISTER_RESPONSE',
      result: 'success',
      error_code: '',
      http_status: 200,
      latency_ms: 321,
      occurred_at: '2026-08-12T02:00:00.000Z',
    }],
  };
  assert.deepEqual(normalizeStorefrontDiagnosticsPayload(diagnostic), diagnostic);
  assert.equal(normalizeStorefrontDiagnosticsPayload({
    events: [{ ...diagnostic.events[0], event_type: 'RAW_TOKEN' }],
  }), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ store_id: 'otra' })), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ ip: '1.2.3.4' })), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ timezone: 'javascript:alert(1)' })), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ app_set_id: 'hardware-id' })), null);
  assert.equal(normalizeStorefrontRegisterPayload(registerPayload({ app_set_id: 'unsafe:app-set-id-value' })), null);
  assert.equal(
    normalizeStorefrontRegisterPayload(registerPayload({
      app_set_id: '123e4567-e89b-42d3-a456-426614174000',
    }))?.app_set_id,
    '123e4567-e89b-42d3-a456-426614174000',
  );
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
  assert.deepEqual(normalizeStorefrontCampaignTargetPayload({ campaign_id: 'abc123def456ghi' }), {
    campaign_id: 'abc123def456ghi',
  });
  assert.equal(normalizeStorefrontCampaignTargetPayload({ campaign_id: 'abc123def456ghi', store_id: 'otra' }), null);
  assert.deepEqual(mapStorefrontResolvedTarget({
    ok: true,
    target_type: 'order',
    target_path: '/orden/PZ-84/AbCdEfGhIjKlMnOp',
  }), {
    ok: true,
    target_type: 'order',
    target_path: '/orden/PZ-84/AbCdEfGhIjKlMnOp',
  });
  assert.equal(mapStorefrontResolvedTarget({
    ok: true,
    target_type: 'order',
    target_path: '/t/otra/admin',
  }), null);
  const opened = {
    delivery_id: 'delivery0000001', event_type: 'opened',
    idempotency_key: 'opened:delivery0000001',
    occurred_at: '2026-08-15T12:00:00.000Z', target_path: '',
  };
  assert.deepEqual(normalizeStorefrontEventPayload(opened), opened);
  assert.equal(normalizeStorefrontEventPayload({ ...opened, idempotency_key: 'chosen-by-client' }), null);
  assert.equal(normalizeStorefrontEventPayload({ ...opened, extra: true }), null);
  assert.equal(normalizeStorefrontEventPayload({
    ...opened, event_type: 'destination_viewed',
    idempotency_key: 'destination_viewed:delivery0000001', target_path: '__order_verified__',
  }).target_path, '__order_verified__');
  assert.deepEqual(mapStorefrontEventResponse({
    ok: true, event_type: 'opened', duplicate: false, recorded_at: '2026-08-15T12:00:00.000Z',
  }), {
    ok: true, event_type: 'opened', duplicate: false, recorded_at: '2026-08-15T12:00:00.000Z',
  });
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

test('bootstrap publica siempre el origen HTTPS validado aun detras del proxy', () => {
  const code = `pzb_v1_${'B'.repeat(48)}`;
  const payload = { bootstrap_code: code, expires_in_seconds: 60 };
  assert.deepEqual(mapBootstrapResponse(
    new Request('https://staging.example/api/storefront/v1/session/bootstrap'),
    payload,
    '8.8.8.8',
  ), {
    ok: true,
    bootstrap_url: `https://staging.example/api/storefront/v1/session/bootstrap/${code}`,
    expires_in_seconds: 60,
  });

  const proxiedHttps = new Request('http://staging.example/api/storefront/v1/session/bootstrap', {
    headers: {
      'x-forwarded-for': '198.51.100.8',
      'x-forwarded-host': 'staging.example',
      'x-forwarded-proto': 'https',
      'x-real-ip': '198.51.100.8',
    },
  });
  assert.equal(
    mapBootstrapResponse(proxiedHttps, payload, '172.20.0.2')?.bootstrap_url,
    `https://staging.example/api/storefront/v1/session/bootstrap/${code}`,
  );

  const forgedHost = new Request('http://staging.example/api/storefront/v1/session/bootstrap', {
    headers: {
      'x-forwarded-for': '198.51.100.8',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
      'x-real-ip': '198.51.100.8',
    },
  });
  assert.equal(mapBootstrapResponse(forgedHost, payload, '172.20.0.2'), null);
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

test('contratos de la cola nativa son exactos, acotados y deduplicables', () => {
  const receipt = {
    receipts: [{
      notification_id: 'delivery0000001',
      state: 'native_delivered',
      occurred_at: '2026-08-15T12:00:00.000Z',
    }],
  };
  assert.deepEqual(normalizeStorefrontNotificationReceiptsPayload(receipt), receipt);
  assert.equal(normalizeStorefrontNotificationReceiptsPayload({
    receipts: [{ ...receipt.receipts[0], state: 'accepted' }],
  }), null);
  assert.equal(normalizeStorefrontNotificationReceiptsPayload({ ...receipt, store_id: 'otra' }), null);

  const response = {
    ok: true,
    notifications: [{
      notification_id: 'delivery0000001',
      schema_version: '1',
      store_key: 'powerzona-storefront-staging',
      campaign_id: 'abc123def456ghi',
      delivery_id: 'delivery0000001',
      title: 'Oferta PowerZona',
      body: 'Mensaje disponible sin Firebase',
      target_type: 'home',
      target_path: '/t/powerzona',
      image_url: '',
      created_at: '2026-08-15T11:00:00.000Z',
      expires_at: '2026-08-22T11:00:00.000Z',
    }],
    server_time: '2026-08-15T12:00:00.000Z',
  };
  assert.deepEqual(mapStorefrontNotificationsSyncResponse(response), response);
  assert.equal(mapStorefrontNotificationsSyncResponse({
    ...response,
    notifications: [{ ...response.notifications[0], notification_id: 'different000001' }],
  }), null);
  assert.deepEqual(mapStorefrontNotificationAckResponse({
    ok: true, accepted: 1, duplicates: 0,
  }), { ok: true, accepted: 1, duplicates: 0 });
  assert.equal(mapStorefrontNotificationAckResponse({
    ok: true, accepted: 1, duplicates: 0, installation_id: 'leak',
  }), null);
});

test('registro v2 funciona sin Firebase ni App Check y firma solo UUID/app_key validados', async (t) => {
  resetStorefrontRateLimitsForTests();
  const previous = {
    internal: process.env.PZ_STOREFRONT_INTERNAL_SECRET,
    pocketbase: process.env.PZ_POCKETBASE_INTERNAL_URL,
  };
  process.env.PZ_STOREFRONT_INTERNAL_SECRET = INTERNAL_SECRET;
  process.env.PZ_POCKETBASE_INTERNAL_URL = 'http://pocketbase.internal:8080';
  t.after(() => {
    if (previous.internal === undefined) delete process.env.PZ_STOREFRONT_INTERNAL_SECRET;
    else process.env.PZ_STOREFRONT_INTERNAL_SECRET = previous.internal;
    if (previous.pocketbase === undefined) delete process.env.PZ_POCKETBASE_INTERNAL_URL;
    else process.env.PZ_POCKETBASE_INTERNAL_URL = previous.pocketbase;
  });

  let forwarded;
  const response = await storefrontNativeGateway({
    request: new Request('https://staging.example/api/storefront/v2/installations/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(coreRegisterPayload()),
    }),
    clientAddress: '8.8.8.8',
    action: 'installations_register_core',
    internalPath: '/api/pz/storefront/v2/installations/register',
    maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.register_core,
    credential: 'optional',
    appCheck: 'disabled',
    parsePayload: normalizeStorefrontCoreRegisterPayload,
    mapSuccess: mapStorefrontCoreRegisterResponse,
    now: new Date('2026-08-12T02:00:00.000Z'),
    fetchImpl: async (url, init) => {
      forwarded = { url: String(url), body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({
        ok: true,
        created: true,
        firebase_enrichment_required: true,
        installation: {
          id: 'inst00000000001', status: 'active', notification_permission: 'unknown',
          first_seen_at: '2026-08-12T02:00:00.000Z', last_seen_at: '2026-08-12T02:00:00.000Z',
        },
        credential: CREDENTIAL,
      }), { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(forwarded.url, 'http://pocketbase.internal:8080/api/pz/storefront/v2/installations/register');
  assert.equal(forwarded.body.app_id, '');
  assert.equal(forwarded.body.payload.app_key, 'powerzona-storefront-staging');
  assert.equal(forwarded.body.payload.installation_id, coreRegisterPayload().installation_id);
  assert.deepEqual(await response.json(), {
    ok: true,
    created: true,
    credential: CREDENTIAL,
    firebase_enrichment_required: true,
  });
});

test('enriquecimiento Firebase acepta la credencial sin App Check y permite atestación posterior', async (t) => {
  resetStorefrontRateLimitsForTests();
  const previous = {
    internal: process.env.PZ_STOREFRONT_INTERNAL_SECRET,
    pocketbase: process.env.PZ_POCKETBASE_INTERNAL_URL,
  };
  process.env.PZ_STOREFRONT_INTERNAL_SECRET = INTERNAL_SECRET;
  process.env.PZ_POCKETBASE_INTERNAL_URL = 'http://pocketbase.internal:8080';
  t.after(() => {
    if (previous.internal === undefined) delete process.env.PZ_STOREFRONT_INTERNAL_SECRET;
    else process.env.PZ_STOREFRONT_INTERNAL_SECRET = previous.internal;
    if (previous.pocketbase === undefined) delete process.env.PZ_POCKETBASE_INTERNAL_URL;
    else process.env.PZ_POCKETBASE_INTERNAL_URL = previous.pocketbase;
  });

  const forwarded = [];
  const run = (headers, verifyAppCheckToken) => storefrontNativeGateway({
    request: new Request('https://staging.example/api/storefront/v2/installations/firebase', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CREDENTIAL}`, ...headers },
      body: JSON.stringify({ fid: FID, app_set_id: APP_SET_ID }),
    }),
    clientAddress: '8.8.8.8',
    action: 'installations_firebase_enrich',
    internalPath: '/api/pz/storefront/v2/installations/firebase',
    maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.firebase_enrichment,
    credential: 'required',
    appCheck: 'optional',
    parsePayload: normalizeStorefrontFirebaseEnrichmentPayload,
    mapSuccess: mapStorefrontFirebaseEnrichmentResponse,
    verifyAppCheckToken,
    fetchImpl: async (_url, init) => {
      forwarded.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({
        ok: true, firebase_registered: true, fid_rotated: false, credential: CREDENTIAL,
      }), { status: 200 });
    },
  });

  const withoutAttestation = await run({}, undefined);
  const withAttestation = await run(
    { 'x-firebase-appcheck': 'x'.repeat(64) },
    async () => ({ appId: APP_ID, projectId: 'project-example' }),
  );
  assert.equal(withoutAttestation.status, 200);
  assert.equal(withAttestation.status, 200);
  assert.equal(forwarded[0].app_id, '');
  assert.equal(forwarded[1].app_id, APP_ID);
  assert.equal(forwarded[0].credential, CREDENTIAL);
  assert.deepEqual(forwarded[0].payload, { fid: FID, app_set_id: APP_SET_ID });
  assert.deepEqual(await withoutAttestation.json(), {
    ok: true, firebase_registered: true, fid_rotated: false, credential: CREDENTIAL,
  });
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

test('heartbeat con credencial funciona sin App Check y conserva app_id vacío', async (t) => {
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
  let forwarded;
  const response = await storefrontNativeGateway({
    request: new Request('https://staging.example/api/storefront/v1/installations/heartbeat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${CREDENTIAL}` },
      body: JSON.stringify({
        app_version: '1.0.0', app_version_code: 1, android_version: 'Android 16',
        device_model: 'Pixel', locale: 'es-US', timezone: 'America/Havana',
      }),
    }),
    clientAddress: '8.8.8.8',
    action: 'installations_heartbeat',
    internalPath: '/api/pz/storefront/v1/installations/heartbeat',
    maxBodyBytes: STOREFRONT_MAX_BODY_BYTES.heartbeat,
    credential: 'required',
    appCheck: 'optional',
    parsePayload: normalizeStorefrontHeartbeatPayload,
    fetchImpl: async (_url, init) => {
      forwarded = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(forwarded.app_id, '');
  assert.equal(forwarded.credential, CREDENTIAL);
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

test('inventario C03+C10 conserva el gateway, el resolvedor tipado y Firebase legacy', () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const gateway = read('../src/lib/storefrontPushAppCheck.ts');
  const projects = read('../src/lib/storefrontFirebaseProjects.ts');
  const routes = [
    '../src/pages/api/storefront/v1/installations/register.ts',
    '../src/pages/api/storefront/v1/installations/heartbeat.ts',
    '../src/pages/api/storefront/v1/installations/permission.ts',
    '../src/pages/api/storefront/v1/installations/disable.ts',
    '../src/pages/api/storefront/v1/session/bootstrap.ts',
    '../src/pages/api/storefront/v1/session/bootstrap/[code].ts',
    '../src/pages/api/storefront/v1/campaigns/resolve-target.ts',
    '../src/pages/api/storefront/v2/installations/register.ts',
    '../src/pages/api/storefront/v2/installations/firebase.ts',
    '../src/pages/api/storefront/v2/diagnostics.ts',
    '../src/pages/api/storefront/v2/notifications/sync.ts',
    '../src/pages/api/storefront/v2/notifications/ack.ts',
    '../src/pages/api/storefront/v2/realtime/ticket.ts',
  ].map(read).join('\n');
  assert.match(gateway, /verifyToken\(token\)/);
  assert.match(gateway, /storefrontFirebaseForAppCheckToken/);
  assert.match(projects, /PZ_STOREFRONT_FIREBASE_PROJECTS_JSON/);
  assert.match(projects, /PZ_STOREFRONT_FIREBASE_PROJECT_ID/);
  assert.match(projects, /PZ_STOREFRONT_FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(projects, /firebase_project_mismatch/);
  assert.doesNotMatch(gateway, /environmentValue\('FIREBASE_(?:PROJECT_ID|SERVICE_ACCOUNT_JSON)'\)/);
  assert.match(gateway, /publicSecurityProxyHeaders\(request, clientAddress, false\)/);
  assert.match(routes, /installations_register/);
  assert.match(routes, /installations_heartbeat/);
  assert.match(routes, /installations_permission/);
  assert.match(routes, /installations_disable/);
  assert.match(routes, /session_bootstrap/);
  assert.match(routes, /consumeStorefrontBootstrap/);
  assert.match(routes, /campaigns_resolve_target/);
  assert.match(routes, /installations_firebase_enrich/);
  assert.match(routes, /normalizeStorefrontCampaignTargetPayload/);
  assert.match(routes, /notifications_sync/);
  assert.match(routes, /notifications_ack/);
  assert.match(routes, /realtime_ticket/);
  assert.doesNotMatch(routes, /push\/v2|media/);
});
