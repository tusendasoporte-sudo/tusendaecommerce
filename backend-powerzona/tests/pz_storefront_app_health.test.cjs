'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const health = require('../pb_hooks/pz_storefront_app_health_lib.js');

const STORE = 'storehealth0001';
const OTHER_STORE = 'storehealth0002';
const HEALTHY_INSTALLATION = 'insthealth00001';
const FAILED_INSTALLATION = 'insthealth00002';
const OTHER_INSTALLATION = 'insthealth00003';
const NOW = new Date('2026-09-02T18:00:00.000Z');

class FakeRecord {
  constructor(collection, id, values = {}) {
    this.collectionName = collection;
    this.id = id;
    this.values = { ...values };
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
}

function record(collection, id, values = {}) {
  return new FakeRecord(collection, id, values);
}

function event(id, installation, eventType, result, occurredAt, extra = {}) {
  return record('storefront_installation_diagnostics', id, {
    store: installation === OTHER_INSTALLATION ? OTHER_STORE : STORE,
    installation,
    event_type: eventType,
    result,
    client_occurred_at: occurredAt,
    error_code: '',
    http_status: 0,
    latency_ms: 0,
    metadata_json: '{"private":"must-not-leak"}',
    ...extra,
  });
}

function createApp() {
  const tables = new Map([
    ['storefront_installations', [
      record('storefront_installations', HEALTHY_INSTALLATION, {
        store: STORE,
        status: 'active',
        notification_permission: 'granted',
        identity_source: 'app_uuid',
        trust_level: 'firebase_verified',
        firebase_status: 'registered',
        fid: 'raw-fid-must-not-leak',
        fid_digest: 'a'.repeat(64),
        installation_uuid_digest: 'b'.repeat(64),
        credential_digest: 'c'.repeat(64),
        last_ip_encrypted: 'encrypted-ip-must-not-leak',
        app_version: '0.2.14',
        app_version_code: 24,
        android_version: '15',
        device_model: 'Pixel soporte',
        locale: 'es-CU',
        timezone: 'America/Havana',
        country_code: 'CU',
        region_code: 'La Habana',
        first_seen_at: '2026-09-01T14:00:00.000Z',
        last_seen_at: '2026-09-02T17:55:00.000Z',
        last_heartbeat_at: '2026-09-02T17:58:00.000Z',
        firebase_synced_at: '2026-09-02T17:56:00.000Z',
      }),
      record('storefront_installations', FAILED_INSTALLATION, {
        store: STORE,
        status: 'active',
        notification_permission: 'denied',
        identity_source: 'app_uuid',
        trust_level: 'basic',
        firebase_status: 'failed',
        app_version: '0.2.14',
        app_version_code: 24,
        android_version: '12',
        device_model: 'Android Cuba',
        locale: 'es-CU',
        timezone: 'America/Havana',
        country_code: 'CU',
        first_seen_at: '2026-09-02T16:00:00.000Z',
        last_seen_at: '2026-09-02T17:45:00.000Z',
        last_heartbeat_at: '2026-09-02T17:45:00.000Z',
      }),
      record('storefront_installations', OTHER_INSTALLATION, {
        store: OTHER_STORE,
        status: 'active',
        notification_permission: 'granted',
        identity_source: 'app_uuid',
        trust_level: 'firebase_verified',
        firebase_status: 'registered',
        device_model: 'OTHER-TENANT-MUST-NOT-LEAK',
        last_seen_at: '2026-09-02T17:59:00.000Z',
        last_heartbeat_at: '2026-09-02T17:59:00.000Z',
      }),
    ]],
    ['storefront_installation_diagnostics', [
      event('diaghealth00001', HEALTHY_INSTALLATION, 'BACKEND_REACHABLE', 'success', '2026-09-02T17:58:00.000Z', { http_status: 200, latency_ms: 320 }),
      event('diaghealth00002', HEALTHY_INSTALLATION, 'INSTALLATION_REGISTER_RESPONSE', 'success', '2026-09-02T17:57:00.000Z', { http_status: 200, latency_ms: 410 }),
      event('diaghealth00003', HEALTHY_INSTALLATION, 'FCM_TOKEN_CREATED', 'success', '2026-09-02T17:56:00.000Z'),
      event('diaghealth00004', HEALTHY_INSTALLATION, 'NOTIFICATION_PERMISSION_STATUS', 'success', '2026-09-02T17:55:00.000Z'),
      event('diaghealth00005', HEALTHY_INSTALLATION, 'LAST_PUSH_RECEIVED', 'success', '2026-09-02T17:54:00.000Z'),
      event('diaghealth00006', FAILED_INSTALLATION, 'BACKEND_REACHABLE', 'failure', '2026-09-02T17:50:00.000Z', { error_code: 'tls_handshake', latency_ms: 30000 }),
      event('diaghealth00007', FAILED_INSTALLATION, 'INSTALLATION_REGISTER_RESPONSE', 'failure', '2026-09-02T17:49:00.000Z', { error_code: 'network_unavailable' }),
      event('diaghealth00008', FAILED_INSTALLATION, 'LAST_ERROR', 'failure', '2026-09-02T17:51:00.000Z', { error_code: 'network_timeout' }),
      event('diaghealth00009', OTHER_INSTALLATION, 'BACKEND_REACHABLE', 'success', '2026-09-02T17:59:00.000Z', { error_code: 'OTHER-TENANT-ERROR' }),
    ]],
    ['push_campaign_deliveries', [
      record('push_campaign_deliveries', 'deliveryhealth1', {
        store: STORE,
        installation: HEALTHY_INSTALLATION,
        created: '2026-09-02T17:53:58.000Z',
        accepted_at: '2026-09-02T17:53:59.000Z',
        fcm_status: 'received',
        native_status: 'delivered',
        fcm_received_at: '2026-09-02T17:54:00.100Z',
        displayed_at: '2026-09-02T17:54:00.107Z',
        native_delivered_at: '2026-09-02T17:54:00.107Z',
        delivery_trigger: 'fcm',
      }),
      record('push_campaign_deliveries', 'deliveryhealth2', {
        store: STORE,
        installation: FAILED_INSTALLATION,
        created: '2026-09-02T17:52:58.000Z',
        accepted_at: '2026-09-02T17:52:59.000Z',
        fcm_status: 'not_attempted',
        native_status: 'delivered',
        displayed_at: '2026-09-02T17:53:01.000Z',
        native_delivered_at: '2026-09-02T17:53:01.000Z',
        delivery_trigger: 'websocket_sync',
      }),
      record('push_campaign_deliveries', 'deliveryhealth3', {
        store: OTHER_STORE,
        installation: OTHER_INSTALLATION,
        created: '2026-09-02T17:59:00.000Z',
        native_status: 'delivered',
        displayed_at: '2026-09-02T17:59:01.000Z',
        delivery_trigger: 'workmanager',
      }),
    ]],
  ]);
  const collections = new Map([...tables.keys()].map((name) => [name, { name, listRule: null, viewRule: null }]));
  return {
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (!collection) throw new Error('collection_not_found');
      return collection;
    },
    findRecordsByFilter(collection, _filter, sort, limit, offset, params = {}) {
      let result = [...(tables.get(collection) || [])];
      if (params.store) result = result.filter((item) => item.getString('store') === params.store);
      if (params.since) result = result.filter((item) => {
        const occurredAt = Date.parse(item.getString(
          collection === 'push_campaign_deliveries' ? 'created' : 'client_occurred_at',
        ));
        return Number.isFinite(occurredAt) && occurredAt >= Date.parse(params.since);
      });
      if (String(sort).startsWith('-last_seen_at')) {
        result.sort((left, right) => right.getString('last_seen_at').localeCompare(left.getString('last_seen_at')));
      } else if (String(sort).startsWith('-client_occurred_at')) {
        result.sort((left, right) => right.getString('client_occurred_at').localeCompare(left.getString('client_occurred_at')));
      } else if (String(sort).startsWith('-created')) {
        result.sort((left, right) => right.getString('created').localeCompare(left.getString('created')));
      }
      return result.slice(offset, offset + limit);
    },
  };
}

function appState() {
  return {
    profile: { downloads_allowed: true },
    artifacts: [{
      kind: 'apk',
      version_name: '0.2.12',
      version_code: 22,
      release_status: 'published',
      lifecycle_status: 'available',
    }],
    update_policy: { release_state: 'active', minimum_supported_version_code: 22 },
  };
}

test('crea un resumen privado por tienda y distingue canal principal de aceleradores', () => {
  const result = health.buildStorefrontAppHealth(createApp(), STORE, {
    now: NOW,
    appState: appState(),
    referenceFor: (_storeId, installationId) => installationId === HEALTHY_INSTALLATION
      ? 'APP-1A2B-3C4D-5E6F' : 'APP-6F5E-4D3C-2B1A',
    getenv: () => 'wss://realtime.example.test/v1/connect',
    realtimeSend: ({ url, method }) => {
      assert.equal(url, 'https://realtime.example.test/healthz');
      assert.equal(method, 'GET');
      return { statusCode: 200, json: { ok: true, connections: 3 } };
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.recent, 2);
  assert.equal(result.summary.healthy, 1);
  assert.equal(result.summary.critical, 1);
  assert.equal(result.summary.fcm_registered, 1);
  assert.equal(result.summary.push_fcm, 1);
  assert.equal(result.summary.push_native, 1);
  assert.equal(result.summary.push_unknown, 0);
  assert.equal(result.display_time_zone, 'America/Havana');
  assert.equal(result.installations[0].support_ref, 'APP-1A2B-3C4D-5E6F');
  assert.equal(result.installations[0].fcm_registration_present, true);
  assert.deepEqual(result.installations[0].last_delivery, {
    state: 'displayed',
    delivery_trigger: 'fcm',
    accepted_at: '2026-09-02T17:53:59.000Z',
    fcm_received_at: '2026-09-02T17:54:00.100Z',
    displayed_at: '2026-09-02T17:54:00.107Z',
    read_at: '',
  });
  assert.equal(result.installations[1].last_delivery.delivery_trigger, 'websocket_sync');
  assert.equal(result.installations[1].health_status, 'critical');
  assert.equal(result.installations[1].last_error.code, 'network_timeout');
  assert.equal(result.services.find((item) => item.key === 'api').importance, 'core');
  assert.equal(result.services.find((item) => item.key === 'realtime').importance, 'accelerator');
  assert.equal(result.services.find((item) => item.key === 'realtime').status, 'healthy');
  assert.equal(result.services.find((item) => item.key === 'updates').status, 'healthy');
  assert.deepEqual(
    result.services.find((item) => item.key === 'push_receipts').metrics,
    { total: 2, received: 2, fcm: 1, native: 1, unknown: 0 },
  );

  const serialized = JSON.stringify(result);
  for (const secret of [
    'raw-fid-must-not-leak', 'encrypted-ip-must-not-leak', 'OTHER-TENANT-MUST-NOT-LEAK',
    'OTHER-TENANT-ERROR', HEALTHY_INSTALLATION, FAILED_INSTALLATION,
    'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'must-not-leak',
  ]) assert.doesNotMatch(serialized, new RegExp(secret));
  for (const forbiddenKey of ['"fid"', '"fid_digest"', '"installation_uuid_digest"', '"credential_digest"', '"last_ip_encrypted"']) {
    assert.equal(serialized.includes(forbiddenKey), false);
  }
});

test('conserva el registro FCM basado en FID aunque la telemetría reciente ya haya vencido', () => {
  const app = createApp();
  app.findRecordsByFilter = ((original) => (collection, filter, sort, limit, offset, params) => {
    const result = original(collection, filter, sort, limit, offset, params);
    return collection === 'storefront_installation_diagnostics'
      ? result.filter((item) => item.getString('event_type') !== 'FCM_TOKEN_CREATED')
      : result;
  })(app.findRecordsByFilter.bind(app));
  const result = health.buildStorefrontAppHealth(app, STORE, {
    now: NOW,
    appState: appState(),
    getenv: () => '',
    referenceFor: (_storeId, installationId) => installationId === HEALTHY_INSTALLATION
      ? 'APP-1A2B-3C4D-5E6F' : 'APP-6F5E-4D3C-2B1A',
  });
  assert.equal(result.installations[0].firebase_status, 'registered');
  assert.equal(result.installations[0].fcm_registration_present, true);
  assert.equal(result.services.find((item) => item.key === 'realtime').status, 'warning');
  assert.equal(result.overall_status, 'warning');
});

test('clasifica recibos anteriores sin origen como sincronización nativa heredada', () => {
  const app = createApp();
  app.findRecordsByFilter = ((original) => (collection, filter, sort, limit, offset, params) => {
    const result = original(collection, filter, sort, limit, offset, params);
    if (collection === 'push_campaign_deliveries') {
      const legacy = result.find((item) => item.id === 'deliveryhealth2');
      if (legacy) legacy.values.delivery_trigger = '';
    }
    return result;
  })(app.findRecordsByFilter.bind(app));
  const result = health.buildStorefrontAppHealth(app, STORE, {
    now: NOW,
    appState: appState(),
    getenv: () => '',
    referenceFor: (_storeId, installationId) => installationId === HEALTHY_INSTALLATION
      ? 'APP-1A2B-3C4D-5E6F' : 'APP-6F5E-4D3C-2B1A',
  });
  assert.equal(result.installations[1].last_delivery.delivery_trigger, 'native_sync_legacy');
  assert.equal(result.summary.push_native, 1);
});

test('rechaza orígenes WebSocket inesperados al construir la sonda HTTPS', () => {
  assert.equal(health.realtimeHealthUrl('wss://gateway.example.test/v1/connect'), 'https://gateway.example.test/healthz');
  assert.equal(health.realtimeHealthUrl('ws://gateway.example.test/v1/connect'), '');
  assert.equal(health.realtimeHealthUrl('wss://gateway.example.test/other'), '');
  assert.equal(health.realtimeHealthUrl('wss://gateway.example.test/v1/connect?redirect=x'), '');
});

test('devuelve indisponible sin colecciones privadas listas', () => {
  const result = health.buildStorefrontAppHealth({
    findCollectionByNameOrId() { throw new Error('missing'); },
  }, STORE, { now: NOW });
  assert.equal(result.available, false);
  assert.deepEqual(result.services, []);
  assert.deepEqual(result.installations, []);
});
