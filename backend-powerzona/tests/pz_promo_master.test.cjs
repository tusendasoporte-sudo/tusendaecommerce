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
    '/api/pz/promo/master/v1/preferences/update',
  ]);
  assert.equal((route.match(/\$apis\.requireAuth\(\)/g) || []).length, 4);
  assert.equal((route.match(/\$apis\.bodyLimit\(/g) || []).length, 4);
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

test('preferencias Master aceptan únicamente tema aprobado y selector de idioma', () => {
  assert.deepEqual(master.parsePreferencesUpdate({
    contract: master.PREFERENCES_UPDATE_CONTRACT,
    expected_entitlement_updated: '2026-08-30 12:00:00.000Z',
    expected_draft_version: 3,
    language_selector_enabled: true,
    theme_id: 'promo.black-gold',
  }), {
    expectedEntitlementUpdated: '2026-08-30 12:00:00.000Z',
    expectedDraftVersion: 3,
    languageSelectorEnabled: true,
    themeId: 'promo.black-gold',
  });
  assert.equal(master.parsePreferencesUpdate({
    contract: master.PREFERENCES_UPDATE_CONTRACT,
    expected_entitlement_updated: '2026-08-30 12:00:00.000Z',
    expected_draft_version: 3,
    language_selector_enabled: false,
    theme_id: 'promo.no-aprobado',
  }), null);
  assert.equal(master.parsePreferencesUpdate({
    contract: master.PREFERENCES_UPDATE_CONTRACT,
    expected_entitlement_updated: '2026-08-30 12:00:00.000Z',
    expected_draft_version: 3,
    language_selector_enabled: false,
    theme_id: 'promo.black-gold',
    max_services: 999,
  }), null);
});

test('foundation Promo crea tenant operativo, Black Gold, slot sin publicar y auditoría saneada', () => {
  const fixture = foundationFixture();
  try {
    const actor = mutableRecord('masterstore0001', { role: 'master_admin', status: 'active', name: 'Master' });
    const store = mutableRecord('storeaaaaaaaaaa', { name: 'Demo Promo', slug: 'demo-promo', status: 'active' });
    const result = master.createPromoFoundation(fixture.app, actor, store, 'demo-promo', 'free');
    assert.equal(fixture.saved.length, 5);
    assert.equal(result.site.store, store.id);
    assert.equal(result.site.status, 'draft');
    assert.equal(result.site.contract_version, 1);
    assert.equal(result.entitlement.source, 'contract');
    assert.equal(result.entitlement.promo_site_enabled, true);
    assert.equal(result.entitlement.publish_enabled, true);
    assert.equal(result.entitlement.theme_customization_enabled, true);
    assert.equal(result.entitlement.multilanguage_enabled, true);
    assert.equal(result.entitlement.analytics_enabled, true);
    assert.equal(result.entitlement.custom_domain_enabled, false);
    assert.equal(result.entitlement.language_selector_enabled, false);
    assert.equal(result.entitlement.max_services, 12);
    assert.equal(result.entitlement.max_locales, 2);
    assert.equal(result.entitlement.max_videos, 0);
    assert.equal(result.entitlement.max_storage_bytes, 250 * 1024 * 1024);
    assert.equal(result.entitlement.max_gallery_assets, 150);
    assert.equal(result.draft.document_json.theme.theme_id, 'promo.black-gold');
    const premiumQuota = master.createPromoFoundation(fixture.app, actor, mutableRecord('storebbbbbbbbbbb', {
      name: 'Demo Promo 300', slug: 'demo-promo-300', status: 'active',
    }), 'demo-promo-300', 'basic');
    assert.equal(premiumQuota.entitlement.max_gallery_assets, 300);
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
  assert.doesNotMatch(source, /domainPrivateProjection|domains_manage|promo_domain_bindings/);
  assert.match(source, /entitlementResponse/);
  assert.match(source, /mapAuditRecord/);
  assert.doesNotMatch(source, /e\.json\([^\n]+decision|e\.json\([^\n]+record/);
  assert.doesNotMatch(source, /snapshot_json\s*:/);
  assert.doesNotMatch(source, /document_json\s*:/);
});
