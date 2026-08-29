'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const master = require('../pb_hooks/pz_promo_master_lib.js');
const permissions = require('../pb_hooks/pz_promo_permissions_lib.js');
const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');

function mutableRecord(id, values = {}, collection = null) {
  return {
    id, ...values, _collection: collection,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    set(key, value) { this[key] = value; },
  };
}

function foundationFixture() {
  const names = [
    'promo_sites', 'promo_site_entitlements', 'promo_draft_documents',
    'promo_publication_slots', 'promo_audit_events',
  ];
  const collections = Object.fromEntries(names.map((name) => [name, { name }]));
  const saved = [];
  let sequence = 0;
  const previousRecord = global.Record;
  const previousSecurity = global.$security;
  global.Record = class FakeRecord {
    constructor(collection) {
      sequence += 1;
      return mutableRecord(`rec${String(sequence).padStart(12, '0')}`, {}, collection);
    }
  };
  global.$security = {
    sha256(material) { return createHash('sha256').update(material).digest('hex'); },
  };
  const app = {
    findCollectionByNameOrId(name) {
      if (!collections[name]) throw new Error('not_found');
      return collections[name];
    },
    findRecordsByFilter(collection, _filter, _sort, limit, _offset, params = {}) {
      return saved.filter((item) => item._collection?.name === collection)
        .filter((item) => !params.store || item.store === params.store)
        .filter((item) => !params.slug || item.public_slug === params.slug)
        .slice(0, limit);
    },
    findFirstRecordByFilter() { throw new Error('not_found'); },
    save(record) {
      if (record._collection?.name === 'promo_sites') record.updated = '2026-08-23 12:00:00.000Z';
      if (record._collection?.name === 'promo_site_entitlements') record.updated = '2026-08-23 12:00:00.000Z';
      if (record._collection?.name === 'promo_draft_documents') record.updated = '2026-08-23 12:00:00.000Z';
      if (record._collection?.name === 'promo_publication_slots') record.updated = '2026-08-23 12:00:00.000Z';
      if (record._collection?.name === 'promo_audit_events') record.created = '2026-08-23 12:00:00.000Z';
      if (!saved.includes(record)) saved.push(record);
      return record;
    },
  };
  return {
    app, saved,
    restore() { global.Record = previousRecord; global.$security = previousSecurity; },
  };
}

test('rutas Master Promo son POST privadas, autenticadas y contract-driven', () => {
  const route = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_master.pb.js'), 'utf8');
  const paths = [...route.matchAll(/"(\/api\/pz\/promo\/master\/v1\/[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(paths, [
    '/api/pz/promo/master/v1/stores/catalog',
    '/api/pz/promo/master/v1/overview',
    '/api/pz/promo/master/v1/lifecycle/update',
  ]);
  assert.equal((route.match(/\$apis\.requireAuth\(\)/g) || []).length, 3);
  assert.equal((route.match(/\$apis\.bodyLimit\(/g) || []).length, 3);
  assert.doesNotMatch(route, /PATCH|DELETE|filter|expand|realtime/);
});

test('catálogo reservado exige Master activo y la misma sesión vigente', () => {
  const current = mutableRecord('masterstore0001', { role: 'master_admin', status: 'active', tokenKey: () => 'live-key' });
  const app = { findRecordById(collection, id) {
    assert.equal(collection, 'users');
    if (id !== current.id) throw new Error('not_found');
    return current;
  } };
  const session = mutableRecord(current.id, { role: 'master_admin', status: 'active', tokenKey: () => 'live-key' });
  assert.equal(permissions.requireActiveMasterSession(app, session), current);
  assert.throws(
    () => permissions.requireActiveMasterSession(app, { ...session, tokenKey: () => 'revoked-key' }),
    /session_revoked/,
  );
  current.status = 'suspended';
  assert.throws(() => permissions.requireActiveMasterSession(app, session), /unauthorized/);
});

test('lifecycle exige payload exacto, CAS y reason code allowlisted', () => {
  assert.deepEqual(master.MASTER_LIFECYCLE_TRANSITIONS, {
    draft: ['active'], active: ['suspended'], paused: ['suspended', 'retired'], suspended: ['retired'], retired: [],
  });
  assert.deepEqual(master.parseLifecycleUpdate({
    contract: master.LIFECYCLE_UPDATE_CONTRACT,
    expected_status: 'draft',
    expected_updated: '2026-08-23 12:00:00.000Z',
    next_status: 'active',
    reason_code: 'contract_change',
  }), {
    expectedStatus: 'draft',
    expectedUpdated: '2026-08-23 12:00:00.000Z',
    nextStatus: 'active',
    reasonCode: 'contract_change',
  });
  assert.equal(master.parseLifecycleUpdate({
    contract: master.LIFECYCLE_UPDATE_CONTRACT,
    expected_status: 'draft', expected_updated: 'now', next_status: 'active', reason_code: 'free_text',
  }), null);
  assert.equal(master.parseLifecycleUpdate({
    contract: master.LIFECYCLE_UPDATE_CONTRACT,
    expected_status: 'draft', expected_updated: 'now', next_status: 'active',
    reason_code: 'contract_change', store_id: 'storeaaaaaaaaaa',
  }), null);
});

test('foundation Promo crea tenant, entitlement cerrado, draft válido, slot generación cero y auditoría saneada', () => {
  const fixture = foundationFixture();
  try {
    const actor = mutableRecord('masterstore0001', { role: 'master_admin', status: 'active', name: 'Master' });
    const store = mutableRecord('storeaaaaaaaaaa', { name: 'Demo Promo', slug: 'demo-promo', status: 'active' });
    const result = master.createPromoFoundation(fixture.app, actor, store, 'demo-promo');
    assert.equal(fixture.saved.length, 5);
    assert.equal(result.site.store, store.id);
    assert.equal(result.site.status, 'draft');
    assert.equal(result.site.contract_version, 1);
    assert.equal(result.entitlement.source, 'unassigned');
    for (const key of ['promo_site_enabled', 'publish_enabled', 'custom_domain_enabled', 'language_selector_enabled']) {
      assert.equal(result.entitlement[key], false);
    }
    for (const key of ['max_services', 'max_gallery_assets', 'max_locales', 'max_videos', 'max_storage_bytes']) {
      assert.equal(result.entitlement[key], 0);
    }
    assert.deepEqual(pubcfg.validatePromoDocument(result.draft.document_json), master.emptyDraftDocument());
    assert.match(result.draft.document_sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.slot.state, 'unpublished');
    assert.equal(result.slot.canonical_mode, 'platform');
    assert.equal(result.slot.generation, 0);
    const event = fixture.saved.find((item) => item._collection?.name === 'promo_audit_events');
    assert.equal(event.action, 'promo.site.create');
    assert.equal(event.scope_key, `site:${result.site.id}`);
    assert.doesNotMatch(JSON.stringify(event), /token|password|owner_phone|document_json/i);
  } finally {
    fixture.restore();
  }
});

test('proyecciones Master no exponen records, filtros, actor o contenido Promo completo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_master_lib.js'), 'utf8');
  assert.match(source, /requireActiveMasterSession/);
  assert.match(source, /requirePromoAction\(app, auth, "promo\.master\.support"/);
  assert.match(source, /validatedStoredDraft/);
  assert.match(source, /assertDraftTheme/);
  assert.match(source, /assertEntitlementMetrics/);
  assert.match(source, /resolvePublicProjectionForSite/);
  assert.match(source, /domainPrivateProjection/);
  assert.match(source, /entitlementResponse/);
  assert.match(source, /mapAuditRecord/);
  assert.doesNotMatch(source, /e\.json\([^\n]+decision|e\.json\([^\n]+record/);
  assert.doesNotMatch(source, /snapshot_json\s*:/);
  assert.doesNotMatch(source, /document_json\s*:/);
});
