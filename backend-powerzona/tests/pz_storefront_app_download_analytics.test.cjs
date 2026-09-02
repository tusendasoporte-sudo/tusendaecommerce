'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const analytics = require('../pb_hooks/pz_storefront_app_download_analytics_lib.js');

const STORE = 'storedownload01';
const CONFIG = 'appdownload0001';
const PROFILE = 'profiledown0001';
const ARTIFACT = 'artifactdown001';
const OLD_INSTALLATION = 'installdown0001';
const NEW_INSTALLATION = 'installdown0002';

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

function fixture() {
  const collections = new Map([
    ['stores', { id: 'pbc_stores', name: 'stores', listRule: null, viewRule: null }],
    ['storefront_app_configs', { id: 'pbc_configs', name: 'storefront_app_configs', listRule: null, viewRule: null }],
    ['storefront_installations', { id: 'pbc_installations', name: 'storefront_installations', listRule: null, viewRule: null }],
    ['storefront_app_build_profiles', { id: 'pbc_profiles', name: 'storefront_app_build_profiles', listRule: null, viewRule: null }],
    ['storefront_app_artifacts', { id: 'pbc_artifacts', name: 'storefront_app_artifacts', listRule: null, viewRule: null }],
    [analytics.EVENTS_COLLECTION, { id: 'pbc_events', name: analytics.EVENTS_COLLECTION, listRule: null, viewRule: null }],
  ]);
  const tables = new Map([...collections.keys()].map((name) => [name, []]));
  const add = (collection, values) => {
    const row = new FakeRecord(collection, values);
    tables.get(collection).push(row);
    return row;
  };
  const profile = add('storefront_app_build_profiles', {
    id: PROFILE, store: STORE, app_config: CONFIG, current_version_code: 11, current_version_name: '0.2.9',
  });
  const artifact = add('storefront_app_artifacts', {
    id: ARTIFACT, store: STORE, profile: PROFILE, kind: 'apk', lifecycle_status: 'available',
    release_status: 'published', update_delivery_status: 'active', version_code: 11,
    version_name: '0.2.9', bytes: 24_000_000, published_at: '2026-08-20T11:00:00.000Z',
  });
  const oldInstallation = add('storefront_installations', {
    id: OLD_INSTALLATION, store: STORE, app_config: CONFIG, status: 'active', app_version_code: 10,
    app_version: '0.2.8', last_seen_at: '2026-08-20T11:50:00.000Z',
  });
  const newInstallation = add('storefront_installations', {
    id: NEW_INSTALLATION, store: STORE, app_config: CONFIG, status: 'active', app_version_code: 11,
    app_version: '0.2.9', last_seen_at: '2026-08-20T11:55:00.000Z',
  });
  let sequence = 1;
  const relation = (row, key) => String(row.get(key) || '');
  const matches = (row, params = {}) => Object.entries(params).every(([key, value]) => {
    const fields = {
      store: 'store', profile: 'profile', versionCode: 'version_code', installation: 'installation',
      artifact: 'artifact', eventType: 'event_type', eventKey: 'event_key',
    };
    return !fields[key] || relation(row, fields[key]) === String(value);
  });
  const app = {
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (!collection) throw new Error('collection_not_found');
      return collection;
    },
    findRecordById(collection, id) {
      const row = (tables.get(collection) || []).find((item) => item.id === id);
      if (!row) throw new Error('record_not_found');
      return row;
    },
    findFirstRecordByFilter(collection, filter, params = {}) {
      const row = (tables.get(collection) || []).find((item) => matches(item, params));
      if (!row) throw new Error('record_not_found');
      return row;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      let rows = (tables.get(collection) || []).filter((item) => matches(item, params));
      if (String(filter).includes("kind = 'apk'")) rows = rows.filter((item) => relation(item, 'kind') === 'apk');
      if (String(filter).includes("release_status = 'published'")) rows = rows.filter((item) => relation(item, 'release_status') === 'published');
      rows = rows.slice();
      if (String(sort).startsWith('-version_code')) rows.sort((a, b) => Number(b.get('version_code')) - Number(a.get('version_code')));
      return rows.slice(offset, offset + limit);
    },
    save(row) {
      if (!row.id) row.id = `download${String(sequence++).padStart(7, '0')}`;
      const table = tables.get(row.collection);
      if (!table.includes(row)) table.push(row);
      return row;
    },
  };
  return { app, artifact, oldInstallation, newInstallation, profile, tables };
}

test('Admin excluye Master y Master conserva las tres fuentes separadas', () => {
  const { app, artifact, oldInstallation, newInstallation } = fixture();
  const now = new Date('2026-08-20T12:00:00.000Z');
  analytics.recordDownloadStarted(app, artifact, 'shared_link', null, now);
  analytics.recordDownloadStarted(app, artifact, 'shared_link', null, now);
  analytics.recordDownloadStarted(app, artifact, 'private_update', oldInstallation, now);
  analytics.recordDownloadStarted(app, artifact, 'master', null, now);
  analytics.recordDownloadVerified(app, artifact, oldInstallation, now);
  analytics.recordDownloadVerified(app, artifact, oldInstallation, now);
  analytics.recordVersionActivated(app, newInstallation, now);

  const admin = analytics.buildDownloadAnalytics(app, STORE, {
    includeMaster: false,
    now,
    periodStart: new Date('2026-08-20T00:00:00.000Z'),
    periodEnd: now,
  });
  assert.equal(admin.summary.customer_downloads, 3);
  assert.equal(admin.summary.master_downloads, 0);
  assert.equal(admin.summary.all_downloads, 3);
  assert.equal(admin.summary.verified_updates, 1);
  assert.equal(admin.summary.activated_installations, 1);
  assert.equal(admin.summary.active_installations, 2);
  assert.equal(admin.summary.pending_installations, 1);

  const master = analytics.buildDownloadAnalytics(app, STORE, { includeMaster: true, now });
  assert.equal(master.summary.customer_downloads, 3);
  assert.equal(master.summary.master_downloads, 1);
  assert.equal(master.summary.all_downloads, 4);
  assert.match(master.measurement_note, /separado/i);
});

test('el resumen cuenta dispositivos únicos aunque una instalación active varias versiones', () => {
  const { app, artifact, newInstallation, tables } = fixture();
  const previousArtifact = new FakeRecord('storefront_app_artifacts', {
    id: 'artifactdown002', store: STORE, profile: PROFILE, kind: 'apk', lifecycle_status: 'available',
    release_status: 'published', update_delivery_status: 'active', version_code: 10,
    version_name: '0.2.8', bytes: 23_000_000, published_at: '2026-08-19T11:00:00.000Z',
  });
  tables.get('storefront_app_artifacts').push(previousArtifact);
  analytics.recordEvent(app, {
    artifact: previousArtifact,
    installation: newInstallation,
    source: 'client_app',
    eventType: 'version_activated',
    now: new Date('2026-08-19T12:00:00.000Z'),
  });
  analytics.recordEvent(app, {
    artifact,
    installation: newInstallation,
    source: 'client_app',
    eventType: 'version_activated',
    now: new Date('2026-08-20T12:00:00.000Z'),
  });

  const result = analytics.buildDownloadAnalytics(app, STORE, {
    includeMaster: true,
    now: new Date('2026-08-20T13:00:00.000Z'),
  });
  assert.equal(result.summary.activated_installations, 1);
  assert.equal(result.versions.reduce((sum, row) => sum + row.activated_installations, 0), 2);
  assert.match(result.measurement_note, /dispositivos únicos/i);
});

test('migración crea una colección privada sin IP ni identificadores publicitarios', () => {
  const source = readFileSync(path.resolve(
    __dirname,
    '../pb_migrations/1787371200_storefront_app_download_analytics.js',
  ), 'utf8');
  let up;
  let down;
  class FakeCollection { constructor(values) { Object.assign(this, values); } }
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Error,
    migrate(forward, rollback) { up = forward; down = rollback; },
  });
  const collections = new Map([
    ['stores', { id: 'pbc_stores', name: 'stores' }],
    ['storefront_app_configs', { id: 'pbc_configs', name: 'storefront_app_configs' }],
    ['storefront_installations', { id: 'pbc_installations', name: 'storefront_installations' }],
    ['storefront_app_build_profiles', { id: 'pbc_profiles', name: 'storefront_app_build_profiles' }],
    ['storefront_app_artifacts', { id: 'pbc_artifacts', name: 'storefront_app_artifacts' }],
  ]);
  const app = {
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (!collection) throw new Error('collection_not_found');
      return collection;
    },
    findRecordsByFilter() { return []; },
    save(collection) { collections.set(collection.name, collection); },
    delete(collection) { collections.delete(collection.name); },
  };
  up(app);
  const created = collections.get(analytics.EVENTS_COLLECTION);
  assert.ok(created);
  assert.equal(created.listRule, null);
  assert.equal(created.viewRule, null);
  assert.deepEqual(Array.from(created.fields.find((field) => field.name === 'source').values), [
    'shared_link', 'private_update', 'master', 'client_app',
  ]);
  assert.equal(created.fields.some((field) => /ip|fid|advert/i.test(field.name)), false);
  assert.ok(created.fields.some((field) => field.name === 'event_key' && field.required));
  assert.ok(created.fields.some((field) => field.name === 'count' && field.required));
  assert.ok(created.indexes.some((index) => /UNIQUE.+event_key/i.test(index)));
  down(app);
  assert.equal(collections.has(analytics.EVENTS_COLLECTION), false);
});
