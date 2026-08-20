'use strict';

const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');

const updates = require('../pb_hooks/pz_storefront_installations_lib.js');

const STORE = 'storeupdates001';
const APP = 'appupdates00001';
const INSTALLATION = 'instupdates0001';
const PROFILE = 'profileupdate01';
const ARTIFACT = 'artifactupdate1';
const FIREBASE_APP = '1:1234567890:android:aaaaaaaaaaaaaaaa';
const CREDENTIAL = `pzs_v1_${'c'.repeat(64)}`;
const SECRET = 'storefront-update-secret-abcdefghijklmnopqrstuvwxyz';
const RAW_TICKET = 'Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE';

class FakeRecord {
  constructor(collection, values = {}) {
    this.collection = collection?.name || collection;
    this.values = { ...values };
    this.id = values.id || '';
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) { if (key === 'id') this.id = value; else this.values[key] = value; }
}

global.Record = FakeRecord;

const security = {
  hs256(value, secret) {
    return createHmac('sha256', String(secret)).update(String(value)).digest('hex');
  },
  randomString(length) {
    assert.equal(length, 43);
    return RAW_TICKET;
  },
};

function fixture() {
  const credentialDigest = updates.credentialDigest(CREDENTIAL, SECRET, security);
  const records = {
    store: new FakeRecord('stores', { id: STORE, status: 'active' }),
    app: new FakeRecord(updates.APP_CONFIGS_COLLECTION, {
      id: APP, store: STORE, firebase_app_id: FIREBASE_APP, firebase_project_id: 'tu-senda-84-storefront-staging',
      package_name: 'com.tusenda84.powerzona', status: 'active', min_supported_version_code: 11,
      min_supported_version_name: '0.2.9',
    }),
    installation: new FakeRecord(updates.INSTALLATIONS_COLLECTION, {
      id: INSTALLATION, store: STORE, app_config: APP, credential_digest: credentialDigest,
      status: 'active', app_version_code: 10,
    }),
    profile: new FakeRecord('storefront_app_build_profiles', {
      id: PROFILE, store: STORE, app_config: APP, package_name: 'com.tusenda84.powerzona',
      status: 'provisioned', lifecycle_status: 'active', distribution_status: 'active',
    }),
    artifact: new FakeRecord('storefront_app_artifacts', {
      id: ARTIFACT, store: STORE, profile: PROFILE, kind: 'apk', visibility: 'store_delivery',
      lifecycle_status: 'available', release_status: 'published', update_delivery_status: 'active',
      file_name: 'powerzona-0.2.9-11.apk', sha256: 'a'.repeat(64), bytes: 24_000_000,
      version_code: 11, version_name: '0.2.9',
    }),
  };
  const saved = [];
  const app = {
    saved,
    findCollectionByNameOrId(name) { return { name }; },
    findRecordById(collection, id) {
      return Object.values(records).find((item) => item.collection === collection && item.id === id)
        || saved.find((item) => item.collection === collection && item.id === id)
        || (() => { throw new Error('record_not_found'); })();
    },
    findFirstRecordByFilter(collection, filter, params = {}) {
      if (collection === updates.APP_CONFIGS_COLLECTION
        && records.app.getString('firebase_app_id') === params.appId
        && (!params.projectId || records.app.getString('firebase_project_id') === params.projectId)) return records.app;
      if (collection === updates.INSTALLATIONS_COLLECTION
        && records.installation.getString('credential_digest') === params.credentialDigest) return records.installation;
      if (collection === 'storefront_app_build_profiles'
        && records.profile.getString('app_config') === params.appConfig
        && records.profile.getString('store') === params.store) return records.profile;
      throw new Error('record_not_found');
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      if (collection !== 'storefront_app_artifacts' || params.profile !== PROFILE) return [];
      return records.artifact.getString('update_delivery_status') === 'active' ? [records.artifact] : [];
    },
    save(record) {
      if (!record.id) record.id = 'updateticket001';
      if (!saved.includes(record)) saved.push(record);
    },
  };
  return { app, records };
}

function context(installSource = 'direct') {
  return {
    appId: FIREBASE_APP,
    firebaseProjectId: 'tu-senda-84-storefront-staging',
    credential: CREDENTIAL,
    now: new Date('2026-08-20T12:00:00.000Z'),
    security,
    payload: {
      packageName: 'com.tusenda84.powerzona',
      versionCode: 10,
      versionName: '0.2.8',
      installSource,
    },
  };
}

test('contratos privados son exactos y no aceptan identidad de otra app', () => {
  assert.deepEqual(updates.parseUpdatePolicyPayload({
    package_name: 'com.tusenda84.powerzona', version_code: 10, version_name: '0.2.8', install_source: 'direct',
  }), {
    packageName: 'com.tusenda84.powerzona', versionCode: 10, versionName: '0.2.8', installSource: 'direct',
  });
  assert.equal(updates.parseUpdatePolicyPayload({
    package_name: 'com.tusenda84.powerzona', version_code: 10, version_name: '0.2.8', install_source: 'direct', store_id: STORE,
  }), null);
  assert.deepEqual(updates.parseUpdateTicketPayload({ artifact_id: ARTIFACT }), { artifactId: ARTIFACT });
});

test('política usa fuente de instalación y el mínimo controlado por Master', () => {
  const { app, records } = fixture();
  const direct = updates.storefrontUpdatePolicy(app, context('direct'), SECRET);
  assert.equal(direct.policy.update_available, true);
  assert.equal(direct.policy.update_required, true);
  assert.equal(direct.policy.delivery_mode, 'private_apk');
  assert.equal(direct.policy.play_store_url, '');
  assert.equal(direct.policy.artifact.id, ARTIFACT);

  const play = updates.storefrontUpdatePolicy(app, context('play'), SECRET);
  assert.equal(play.policy.delivery_mode, 'play_store');
  assert.equal(play.policy.play_store_url, 'https://play.google.com/store/apps/details?id=com.tusenda84.powerzona');

  records.artifact.set('update_delivery_status', 'paused');
  const paused = updates.storefrontUpdatePolicy(app, context('direct'), SECRET);
  assert.equal(paused.policy.update_available, false);
  assert.equal(paused.policy.update_required, false);
  assert.equal(paused.policy.artifact, null);
});

test('ticket privado dura dos minutos, guarda solo digest y queda ligado a instalación/artefacto', (t) => {
  const previousOs = global.$os;
  global.$os = { getenv(name) { return name === 'PZ_STOREFRONT_APP_DOWNLOAD_PUBLIC_ORIGIN' ? 'https://tusenda84.com' : ''; } };
  t.after(() => { if (previousOs === undefined) delete global.$os; else global.$os = previousOs; });
  const { app } = fixture();
  const ticketContext = context('direct');
  ticketContext.payload = { artifactId: ARTIFACT };
  const response = updates.storefrontUpdateTicket(app, ticketContext, SECRET);
  assert.equal(response.ticket, RAW_TICKET);
  assert.equal(response.expires_at, '2026-08-20T12:02:00.000Z');
  assert.match(response.download_url, new RegExp(`/api/pz/storefront-app-updates/${ARTIFACT}/${RAW_TICKET}/powerzona-0\\.2\\.9-11\\.apk$`));
  const stored = app.saved.find((item) => item.collection === 'storefront_app_update_tickets');
  assert.ok(stored);
  assert.equal(stored.getString('installation'), INSTALLATION);
  assert.equal(stored.getString('artifact'), ARTIFACT);
  assert.equal(stored.getString('token_digest').includes(RAW_TICKET), false);
  assert.match(stored.getString('token_digest'), /^[a-f0-9]{64}$/);
});
