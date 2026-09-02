'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const dispatch = require('../pb_hooks/pz_storefront_push_dispatch_lib.js');

const STORE_A = 'storedisp000001';
const STORE_B = 'storedisp000002';
const CAMPAIGN_ID = 'campaigndisp001';
const INSTALLATION_A = 'installdisp0001';
const CONFIG_A = 'appconfigdisp01';

class FakeRecord {
  constructor(collection, values = {}) {
    this.collectionName = collection?.name || collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
}

global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
global.arrayOf = (value) => [value];

function record(collection, id, values = {}) {
  return new FakeRecord(collection, { id, ...values });
}

function matches(item, filter, params) {
  const value = (key) => item.getString(key);
  for (const key of ['campaign', 'store', 'status']) {
    if (params[key] !== undefined && value(key) !== String(params[key])) return false;
  }
  const statuses = [...filter.matchAll(/status\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  if (statuses.length && !statuses.includes(value('status'))) return false;
  if (params.now !== undefined && filter.includes('lease_expires_at')) {
    const lease = value('lease_expires_at');
    if (lease && new Date(lease).getTime() > new Date(params.now).getTime()) return false;
  }
  return true;
}

function createApp() {
  const tables = new Map();
  const rows = (name) => tables.get(name) || [];
  const add = (item) => {
    if (!tables.has(item.collectionName)) tables.set(item.collectionName, []);
    const values = tables.get(item.collectionName);
    const index = values.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) values[index] = item;
    else values.push(item);
    return item;
  };
  return {
    rows,
    add,
    findRecordById(collection, id) {
      const found = rows(collection).find((item) => item.id === id);
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, _sort, limit, offset, params = {}) {
      return rows(collection).filter((item) => matches(item, filter, params)).slice(offset, offset + limit);
    },
    save(item) { add(item); return item; },
    runInTransaction(callback) { callback(this); },
    db() { throw new Error('sql_not_available_in_unit_test'); },
  };
}

function campaign(overrides = {}) {
  return record('push_campaigns', CAMPAIGN_ID, {
    store: STORE_A,
    title: 'Oferta PowerZona',
    body: 'Mensaje para clientes',
    target_type: 'home',
    target_path: '/t/powerzona',
    media: '',
    ...overrides,
  });
}

function installation(id = INSTALLATION_A, storeId = STORE_A, configId = CONFIG_A, overrides = {}) {
  return record('storefront_installations', id, {
    store: storeId,
    app_config: configId,
    status: 'active',
    notification_permission: 'granted',
    fid: 'Abcdefghijklmnop0123456789_FID',
    ...overrides,
  });
}

function appConfig(id = CONFIG_A, storeId = STORE_A) {
  return record('storefront_app_configs', id, {
    store: storeId,
    status: 'active',
    app_key: 'powerzona',
    package_name: 'com.tusenda84.powerzona',
    firebase_app_id: '1:123456789012:android:abcdef0123456789',
  });
}

function delivery(id = 'deliverydisp001', overrides = {}) {
  return record('push_campaign_deliveries', id, {
    store: STORE_A,
    campaign: CAMPAIGN_ID,
    installation: INSTALLATION_A,
    status: 'pending',
    attempt_count: 0,
    claim_token: '',
    lease_expires_at: '',
    ...overrides,
  });
}

const relayValues = {
  PZ_STOREFRONT_PUSH_RELAY_URL: 'https://staging.example/api/internal/push/v2/send',
  PZ_STOREFRONT_PUSH_RELAY_SECRET: 's'.repeat(48),
  PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN: 'https://staging.example',
  PZ_STOREFRONT_PUSH_RELAY_ALLOW_HTTP: '0',
  PZ_PUSH_RELAY_SECRET: 'a'.repeat(48),
};

test('relay v2 exige HTTPS y secreto distinto del relay administrativo v1', () => {
  assert.deepEqual(dispatch.relayConfig((key) => relayValues[key]), {
    url: relayValues.PZ_STOREFRONT_PUSH_RELAY_URL,
    secret: relayValues.PZ_STOREFRONT_PUSH_RELAY_SECRET,
    mediaOrigin: relayValues.PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN,
  });
  assert.equal(dispatch.validRelayUrl('https://staging.example/api/internal/push/send', false), '');
  assert.equal(dispatch.validRelayUrl('http://frontend:4321/api/internal/push/v2/send', true), '');
  assert.equal(dispatch.relayConfig((key) => (
    key === 'PZ_STOREFRONT_PUSH_RELAY_SECRET' ? relayValues.PZ_PUSH_RELAY_SECRET : relayValues[key]
  )), null);
});

test('claim transaccional se limita a 500 FID y no incorpora otra tienda', () => {
  const app = createApp();
  const item = app.add(campaign());
  for (let index = 0; index < 501; index += 1) {
    app.add(delivery(`delivbat${String(index).padStart(7, '0')}`));
  }
  app.add(delivery('deliveryother01', { store: STORE_B }));
  const claim = dispatch.claimCampaignDeliveries(app, item, new Date('2026-08-13T14:00:00.000Z'), {
    randomToken: () => 'c'.repeat(64),
  });
  assert.equal(claim.claimedIds.length, dispatch.MAX_BATCH_SIZE);
  assert.equal(claim.claimedIds.includes('deliveryother01'), false);
  assert.equal(app.rows('push_campaign_deliveries').filter((row) => row.getString('status') === 'claimed').length, 500);
});

test('respuesta Firebase parcial conserva cada resultado sin convertir aceptado en entregado', () => {
  const ids = ['deliverydisp001', 'deliverydisp002', 'deliverydisp003'];
  const results = dispatch.normalizeRelayResponse({
    statusCode: 200,
    json: {
      ok: true,
      dispatched: true,
      results: [
        { delivery_id: ids[0], status: 'accepted', firebase_message_id: 'projects/p/messages/1', error_code: '', retry_after_seconds: 0 },
        { delivery_id: ids[1], status: 'invalid_fid', firebase_message_id: '', error_code: 'messaging/registration-token-not-registered', retry_after_seconds: 0 },
        { delivery_id: ids[2], status: 'failed_transient', firebase_message_id: '', error_code: 'messaging/server-unavailable', retry_after_seconds: 120 },
      ],
    },
  }, ids);
  assert.deepEqual(results.map((item) => item.status), ['accepted', 'invalid_fid', 'failed_transient']);

  const ambiguous = dispatch.normalizeRelayResponse({
    statusCode: 200,
    json: { ok: true, dispatched: true, results: results.slice(0, 2) },
  }, ids);
  assert.deepEqual(ambiguous.map((item) => item.status), ['unknown', 'unknown', 'unknown']);
});

test('FID permanentemente inválido desactiva solo Firebase y conserva el canal nativo', () => {
  const app = createApp();
  const item = app.add(campaign());
  const config = app.add(appConfig());
  const device = app.add(installation(INSTALLATION_A, STORE_A, config.id));
  const claimed = app.add(delivery('deliverydisp001', {
    status: 'claimed', claim_token: 'claim-token', attempt_count: 1,
  }));
  const counts = dispatch.dispatchClaimedDeliveries(app, item, {
    claimToken: 'claim-token', claimedIds: [claimed.id],
  }, new Date('2026-08-13T14:00:00.000Z'), {
    config: dispatch.relayConfig((key) => relayValues[key]),
    send(request) {
      const payload = JSON.parse(request.body);
      assert.equal(payload.deliveries[0].fid, device.getString('fid'));
      return {
        statusCode: 200,
        json: {
          ok: true,
          dispatched: true,
          results: [{
            delivery_id: claimed.id,
            status: 'invalid_fid',
            firebase_message_id: '',
            error_code: 'messaging/registration-token-not-registered',
            retry_after_seconds: 0,
          }],
        },
      };
    },
  });
  assert.equal(counts.invalid_fid, 1);
  assert.equal(claimed.getString('status'), 'invalid_fid');
  assert.equal(claimed.getString('fcm_status'), 'invalid');
  assert.equal(device.getString('status'), 'active');
  assert.equal(device.getString('fid'), '');
  assert.equal(device.getString('fid_digest'), '');
  assert.equal(device.getString('trust_level'), 'basic');
  assert.equal(device.getString('firebase_status'), 'failed');
  assert.equal(device.getString('firebase_last_error'), 'invalid_fid');
  assert.equal(device.getString('disabled_at'), '');
});

test('transitorios respetan Retry-After, máximo tres intentos y luego fallan permanente', () => {
  const app = createApp();
  const item = app.add(delivery('deliverydisp001', {
    status: 'claimed', claim_token: 'retry-claim', attempt_count: dispatch.MAX_ATTEMPTS,
  }));
  const result = dispatch.persistClaimResults(app, 'retry-claim', [{
    delivery_id: item.id,
    status: 'failed_transient',
    firebase_message_id: '',
    error_code: 'messaging/server-unavailable',
    retry_after_seconds: 600,
  }], new Date('2026-08-13T14:00:00.000Z'));
  assert.equal(result.failed_permanent, 1);
  assert.equal(item.getString('status'), 'failed_permanent');
  assert.equal(item.getString('error_code'), 'retry_exhausted');
  assert.equal(item.getString('lease_expires_at'), '');

  assert.equal(dispatch.retryDelaySeconds(1, 10), 60);
  assert.equal(dispatch.retryDelaySeconds(2, 600), 600);
  assert.equal(dispatch.retryDelaySeconds(3, 99999), 3600);
});

test('lease vencido se vuelve unknown y jamás se reintenta automáticamente', () => {
  const app = createApp();
  const item = app.add(delivery('deliverydisp001', {
    status: 'claimed', claim_token: 'ambiguous', attempt_count: 1,
    lease_expires_at: '2026-08-13T13:59:00.000Z',
  }));
  assert.equal(dispatch.recoverExpiredClaims(app, CAMPAIGN_ID, new Date('2026-08-13T14:00:00.000Z')), 1);
  assert.equal(item.getString('status'), 'unknown');
  assert.equal(dispatch.dueForRetry(item, new Date('2026-08-14T14:00:00.000Z')), false);
});

test('instalación cruzada o configuración ajena falla localmente y no llega al relay', () => {
  const app = createApp();
  const item = app.add(campaign());
  app.add(appConfig(CONFIG_A, STORE_B));
  app.add(installation(INSTALLATION_A, STORE_B, CONFIG_A));
  const claimed = app.add(delivery('deliverydisp001', {
    status: 'claimed', claim_token: 'cross-store', attempt_count: 1,
  }));
  let calls = 0;
  dispatch.dispatchClaimedDeliveries(app, item, {
    claimToken: 'cross-store', claimedIds: [claimed.id],
  }, new Date('2026-08-13T14:00:00.000Z'), {
    config: dispatch.relayConfig((key) => relayValues[key]),
    send() { calls += 1; throw new Error('must_not_send'); },
  });
  assert.equal(calls, 0);
  assert.equal(claimed.getString('status'), 'failed_permanent');
  assert.equal(claimed.getString('error_code'), 'installation_unavailable');
});
