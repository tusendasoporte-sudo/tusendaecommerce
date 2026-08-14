'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const installations = require('../pb_hooks/pz_storefront_installations_lib.js');

const STORE_A = 'storetenant0001';
const STORE_B = 'storetenant0002';
const APP_A = 'appconfig000001';
const APP_B = 'appconfig000002';
const INSTALLATION_A = 'insttarget00001';
const INSTALLATION_B = 'insttarget00002';
const CAMPAIGN_A = 'campaigntarget1';
const ORDER_A = 'ordertarget0001';
const FIREBASE_A = '1:1234567890:android:aaaaaaaaaaaaaaaa';
const FID_A = 'abcdefghijklmnopqrstuv';
const CREDENTIAL_SECRET = 'credential-secret-c07-abcdefghijklmnopqrstuvwxyz';

class FakeRecord {
  constructor(collection, id, values = {}) {
    this.collection = collection;
    this.id = id;
    this.values = { ...values };
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
}

function securityFixture() {
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
  };
}

function record(collection, id, values) {
  return new FakeRecord(collection, id, values);
}

function fixture(overrides = {}) {
  const security = securityFixture();
  const credential = installations.credentialFor(APP_A, FID_A, CREDENTIAL_SECRET, security);
  const credentialDigest = installations.credentialDigest(credential, CREDENTIAL_SECRET, security);
  const records = [
    record('stores', STORE_A, { status: 'active' }),
    record('stores', STORE_B, { status: 'active' }),
    record(installations.APP_CONFIGS_COLLECTION, APP_A, {
      store: STORE_A,
      firebase_app_id: FIREBASE_A,
      status: 'active',
      store_path_prefix: '/t/powerzona',
    }),
    record(installations.APP_CONFIGS_COLLECTION, APP_B, {
      store: STORE_B,
      firebase_app_id: '1:1234567890:android:bbbbbbbbbbbbbbbb',
      status: 'active',
      store_path_prefix: '/t/otra',
    }),
    record(installations.INSTALLATIONS_COLLECTION, INSTALLATION_A, {
      store: STORE_A,
      app_config: APP_A,
      credential_digest: credentialDigest,
      status: 'active',
    }),
    record(installations.INSTALLATIONS_COLLECTION, INSTALLATION_B, {
      store: STORE_A,
      app_config: APP_A,
      credential_digest: 'b'.repeat(64),
      status: 'active',
    }),
    record('push_campaigns', CAMPAIGN_A, {
      store: STORE_A,
      status: overrides.campaignStatus || 'sent',
      target_type: overrides.targetType || 'order',
      target_order: ORDER_A,
    }),
    record('push_campaign_deliveries', 'deliverytarget1', {
      store: STORE_A,
      campaign: CAMPAIGN_A,
      installation: overrides.deliveryInstallation || INSTALLATION_A,
      status: overrides.deliveryStatus || 'accepted',
    }),
    record('storefront_order_links', 'linktarget00001', {
      store: overrides.linkStore || STORE_A,
      installation: overrides.linkInstallation || INSTALLATION_A,
      order: ORDER_A,
      status: overrides.linkStatus || 'active',
    }),
    record('orders', ORDER_A, {
      store: overrides.orderStore || STORE_A,
      order_number: overrides.orderNumber || 'PZ-84',
      receipt_token: overrides.receiptToken || 'AbCdEfGhIjKlMnOp',
    }),
  ];

  const app = {
    findRecordById(collection, id) {
      const item = records.find((candidate) => candidate.collection === collection && candidate.id === id);
      if (!item) throw new Error('record_not_found');
      return item;
    },
    findFirstRecordByFilter(collection, filter, params = {}) {
      const item = records.find((candidate) => {
        if (candidate.collection !== collection) return false;
        if (params.appId && candidate.getString('firebase_app_id') !== params.appId) return false;
        if (params.credentialDigest && candidate.getString('credential_digest') !== params.credentialDigest) return false;
        if (params.store && candidate.getString('store') !== params.store) return false;
        if (params.campaign && candidate.getString('campaign') !== params.campaign) return false;
        if (params.installation && candidate.getString('installation') !== params.installation) return false;
        if (params.order && candidate.getString('order') !== params.order) return false;
        if (filter.includes('status = "active"') && candidate.getString('status') !== 'active') return false;
        if (filter.includes('status = "accepted" || status = "unknown"')
          && !['accepted', 'unknown'].includes(candidate.getString('status'))) return false;
        return true;
      });
      if (!item) throw new Error('record_not_found');
      return item;
    },
  };

  return {
    app,
    context: {
      appId: FIREBASE_A,
      credential,
      client: { ip: '8.8.8.8', countryCode: 'US', regionCode: 'FL' },
      payload: installations.parseCampaignResolvePayload({ campaign_id: CAMPAIGN_A }),
      now: new Date('2026-08-14T10:00:00.000Z'),
      security,
    },
  };
}

function target(overrides = {}) {
  const value = fixture(overrides);
  return installations.resolveCampaignTarget(value.app, value.context, CREDENTIAL_SECRET);
}

function targetUnavailable(error) {
  return error && error.code === 'target_not_available';
}

test('C07 resuelve una orden solo para su instalación y entrega aceptada', () => {
  assert.deepEqual(target(), {
    ok: true,
    target_type: 'order',
    target_path: '/orden/PZ-84/AbCdEfGhIjKlMnOp',
  });
  assert.deepEqual(target({ deliveryStatus: 'unknown' }), {
    ok: true,
    target_type: 'order',
    target_path: '/orden/PZ-84/AbCdEfGhIjKlMnOp',
  });
});

test('C07 falla cerrado ante cruce de instalación, tienda o link inactivo', () => {
  assert.throws(() => target({ deliveryInstallation: INSTALLATION_B }), targetUnavailable);
  assert.throws(() => target({ linkInstallation: INSTALLATION_B }), targetUnavailable);
  assert.throws(() => target({ linkStore: STORE_B }), targetUnavailable);
  assert.throws(() => target({ orderStore: STORE_B }), targetUnavailable);
  assert.throws(() => target({ linkStatus: 'revoked' }), targetUnavailable);
});

test('C07 no resuelve campañas sin entrega, no terminales o que no sean orden', () => {
  assert.throws(() => target({ deliveryStatus: 'pending' }), targetUnavailable);
  assert.throws(() => target({ campaignStatus: 'scheduled' }), targetUnavailable);
  assert.throws(() => target({ targetType: 'product' }), targetUnavailable);
});

test('C07 rechaza recibos mal formados sin exponer el token', () => {
  assert.throws(() => target({ orderNumber: 'PZ/84' }), targetUnavailable);
  assert.throws(() => target({ receiptToken: 'short' }), targetUnavailable);
  assert.equal(installations.parseCampaignResolvePayload({ campaign_id: CAMPAIGN_A }).campaignId, CAMPAIGN_A);
  assert.equal(installations.parseCampaignResolvePayload({ campaign_id: CAMPAIGN_A, store_id: STORE_B }), null);
});

test('C07 registra únicamente la ruta interna tipada y protegida', () => {
  const source = readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_storefront_installations.pb.js'), 'utf8');
  assert.match(source, /\/api\/pz\/storefront\/v1\/campaigns\/resolve-target/);
  assert.match(source, /campaigns_resolve_target/);
  assert.match(source, /bodyLimit\(4096\)/);
  assert.doesNotMatch(source, /receipt_token|order_number/);
});
