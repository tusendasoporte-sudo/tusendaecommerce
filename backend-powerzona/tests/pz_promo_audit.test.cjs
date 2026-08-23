'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const audit = require('../pb_hooks/pz_promo_audit_lib.js');
const api = require('../pb_hooks/pz_promo_audit_api_lib.js');

function mutableRecord(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] ?? ''); },
    set(key, value) { this[key] = value; },
  };
}

const actor = mutableRecord('useraaaaaaaaaaa', {
  display_name: 'Operador Promo', email: 'no-proyectar@example.test', role: 'store_admin',
});
const site = mutableRecord('siteaaaaaaaaaaa');
const decision = { actor, site, is_master: false };

test('catálogo AUDIT fija acciones críticas y recursos Promo sin ampliar Commerce', () => {
  for (const action of [
    'promo.team.permissions.update', 'promo.entitlements.update', 'promo.draft.update',
    'promo.publication.publish', 'promo.publication.rollback', 'promo.publication.binding_switch',
    'promo.domain.activate', 'promo.contact.update', 'promo.theme.release.update',
  ]) assert.ok(audit.ACTION_CATALOG[action], `falta ${action}`);
  assert.equal(audit.ACTION_CATALOG['promo.team.permissions.update'].severity, 'critical');
  assert.equal(audit.ACTION_CATALOG['promo.entitlements.update'].severity, 'critical');
  assert.equal(audit.ACTION_CATALOG['promo.publication.rollback'].severity, 'critical');
  assert.equal(Object.keys(audit.RESOURCE_SAFE_FIELDS).some((key) => /product|order|cart|checkout/.test(key)), false);
});

test('before/after y paths usan allowlist, elevan facetas críticas y rechazan secretos o records', () => {
  const values = audit.buildPromoAuditValues(decision, {
    action: 'promo.draft.update',
    resourceType: 'promo_draft_document',
    resourceId: 'draftaaaaaaaaaa',
    changedPaths: ['/contact', '/sections'],
    previousValues: { digest: 'a'.repeat(64), version: 1, contact: { enabled: false } },
    newValues: { digest: 'b'.repeat(64), version: 2, contact: { enabled: true } },
    sourceEventKey: 'promo.draft.draftaaaaaaaaaa.v2',
  });
  assert.equal(values.scope_key, 'site:siteaaaaaaaaaaa');
  assert.equal(values.module, 'content');
  assert.equal(values.severity, 'critical');
  assert.deepEqual(values.changed_paths_json, ['/contact', '/sections']);
  assert.equal(values.actor_snapshot_json.name, 'Operador Promo');
  assert.equal(JSON.stringify(values).includes(actor.email), false);

  for (const unsafe of [
    { previousValues: { document: { full: true } }, changedPaths: ['/sections'] },
    { previousValues: { digest: 'a'.repeat(64) }, changedPaths: ['/contact/config/phone_e164'] },
    { previousValues: { digest: 'a'.repeat(64) }, changedPaths: ['/products'] },
  ]) {
    assert.throws(() => audit.buildPromoAuditValues(decision, {
      action: 'promo.draft.update', resourceType: 'promo_draft_document',
      resourceId: 'draftaaaaaaaaaa', newValues: { digest: 'b'.repeat(64) },
      sourceEventKey: 'promo.draft.draftaaaaaaaaaa.v3', ...unsafe,
    }), /promo_audit|unsafe|sensitive/);
  }
  assert.throws(() => audit.buildPromoAuditValues(decision, {
    action: 'promo.unknown', resourceType: 'promo_draft_document', changedPaths: ['/sections'],
    sourceEventKey: 'promo.unknown.v1',
  }), /unknown_promo_audit_action/);
  assert.throws(() => audit.buildPromoAuditValues(decision, {
    action: 'promo.draft.update', resourceType: 'promo_draft_document',
    siteId: 'sitebbbbbbbbbbb', changedPaths: ['/sections'],
    previousValues: { digest: 'a'.repeat(64) }, newValues: { digest: 'b'.repeat(64) },
    sourceEventKey: 'promo.draft.draftaaaaaaaaaa.v4',
  }), /promo_audit_tenant_mismatch/);
  assert.throws(() => audit.buildPromoAuditValues(decision, {
    action: 'promo.draft.update', resourceType: 'promo_draft_document', origin: 'master_admin',
    changedPaths: ['/sections'], previousValues: {}, newValues: {},
    sourceEventKey: 'promo.draft.draftaaaaaaaaaa.v5',
  }), /invalid_promo_audit_origin/);
  assert.throws(() => audit.buildPromoAuditValues(decision, {
    action: 'promo.draft.update', resourceType: 'promo_draft_document',
    actor: mutableRecord('userbbbbbbbbbbb', { role: 'store_admin' }),
    changedPaths: ['/sections'], previousValues: {}, newValues: {},
    sourceEventKey: 'promo.draft.draftaaaaaaaaaa.v6',
  }), /promo_audit_actor_mismatch/);
});

test('snapshot de draft conserva solo estructura operativa y nunca texto, destinos o asset IDs', () => {
  const document = {
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es', 'en'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: { accent: '#caa85e' } },
    identity: { public_business_key: 'business-public' },
    sections: [{ key: 'hero-main', type: 'hero', visible: true }],
    media_refs: { hero: { asset_id: 'assetaaaaaaaaaa', purpose: 'hero' } },
    contact: {
      enabled: true, primary_action_key: 'main', secondary_action_keys: [],
      actions: [{ key: 'main', type: 'phone', enabled: true, config: { phone_e164: '+15551234567' } }],
    },
    content_by_locale: { es: { identity: { name: 'Texto privado del borrador' } } },
    adapters: { store_rating: { enabled: true }, landing_qr_link: { enabled: false } },
  };
  const snapshot = audit.draftAuditSnapshot(document, 'a'.repeat(64), 7);
  assert.equal(snapshot.version, 7);
  assert.deepEqual(snapshot.theme.override_keys, ['accent']);
  assert.equal(snapshot.media.reference_count, 1);
  assert.deepEqual(snapshot.contact.actions, [{ enabled: true, key: 'main', type: 'phone' }]);
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['Texto privado', '+15551234567', 'assetaaaaaaaaaa', 'phone_e164', 'content_by_locale']) {
    assert.equal(serialized.includes(forbidden), false, `snapshot excluye ${forbidden}`);
  }
});

test('escritor central es idempotente por scope/source y la proyección omite relaciones y claves internas', () => {
  const saved = [];
  const previousRecord = global.Record;
  global.Record = class {
    constructor(collection) { this.collection = collection; this.id = ''; }
    set(key, value) { this[key] = value; }
    get(key) { return this[key]; }
    getString(key) { return String(this[key] ?? ''); }
  };
  const app = {
    findCollectionByNameOrId(name) { return { name }; },
    findFirstRecordByFilter(_collection, _filter, params) {
      const found = saved.find((item) => item.scope_key === params.scope && item.source_event_key === params.source);
      if (!found) throw new Error('record_not_found');
      return found;
    },
    save(record) { record.id = record.id || 'auditaaaaaaaaaa'; record.created = '2026-08-23 12:00:00.000Z'; saved.push(record); },
  };
  try {
    const input = {
      action: 'promo.team.permissions.update', resourceType: 'promo_user_permissions',
      resourceId: 'targetaaaaaaaaaa', changedPaths: ['/permissions', '/sessions_revoked', '/version'],
      previousValues: { permissions: ['promo.site.view'], sessions_revoked: false, version: 0 },
      newValues: { permissions: ['promo.site.view', 'promo.content.manage'], sessions_revoked: true, version: 1 },
      sourceEventKey: 'promo.permissions.targetaaaaaaaaaa.v1',
    };
    const first = audit.createPromoAudit(app, decision, input);
    const replay = audit.createPromoAudit(app, decision, input);
    assert.equal(first, replay);
    assert.equal(saved.length, 1);
    const projected = audit.mapAuditRecord(first);
    assert.equal(projected.contract, 'promo.audit.event.v1');
    assert.equal(projected.severity, 'critical');
    assert.deepEqual(projected.actor, { name: 'Operador Promo', role: 'store_admin' });
    const serialized = JSON.stringify(projected);
    for (const forbidden of [site.id, actor.id, 'scope_key', 'source_event_key', 'correlation_id', actor.email]) {
      assert.equal(serialized.includes(forbidden), false, `proyección excluye ${forbidden}`);
    }
    first.module = 'security';
    assert.throws(() => audit.mapAuditRecord(first), /invalid_stored_promo_audit/);
  } finally {
    if (previousRecord === undefined) delete global.Record;
    else global.Record = previousRecord;
  }
});

test('contratos list/detail son exactos y rechazan tenancy, filtros PocketBase y rangos abiertos', () => {
  const list = {
    contract: 'promo.audit.list.v1', page: 1, per_page: 50,
    filters: { module: 'content', severity: 'critical', action: 'promo.draft.update' },
  };
  assert.deepEqual(api.parseListPayload(list), {
    page: 1, perPage: 50, module: 'content', action: 'promo.draft.update', severity: 'critical',
    resourceType: '', dateFrom: '', dateTo: '',
  });
  assert.deepEqual(api.parseDetailPayload({ contract: 'promo.audit.detail.v1', event_id: 'auditaaaaaaaaaa' }), {
    eventId: 'auditaaaaaaaaaa',
  });
  for (const injected of ['store_id', 'site_id', 'actor_id', 'filter', 'sort', 'fields', 'expand']) {
    assert.equal(api.parseListPayload({ ...list, [injected]: 'attacker' }), null);
    assert.equal(api.parseDetailPayload({ contract: 'promo.audit.detail.v1', event_id: 'auditaaaaaaaaaa', [injected]: 'attacker' }), null);
  }
  assert.equal(api.parseListPayload({ ...list, filters: { date_from: '2026-01-01T00:00:00Z' } }), null);
  assert.equal(api.parseListPayload({ ...list, filters: { module: 'catalog' } }), null);
  assert.equal(api.parseListPayload({ ...list, page: '1' }), null);
  assert.equal(api.parseListPayload({ ...list, filters: { severity: 1 } }), null);
  assert.equal(api.parseDetailPayload({ contract: 'promo.audit.detail.v1', event_id: 123 }), null);
});

test('hook AUDIT registra solo dos POST privados con auth, body limit y sin CRUD genérico', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_audit.pb.js'), 'utf8');
  const routes = [...source.matchAll(/"(\/api\/pz\/promo\/private\/v1\/audit\/[^\"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    '/api/pz/promo/private/v1/audit/list',
    '/api/pz/promo/private/v1/audit/detail',
  ]);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 2);
  assert.equal((source.match(/\$apis\.bodyLimit\(/g) || []).length, 2);
  assert.doesNotMatch(source, /routerAdd\(\s*"(?:GET|PATCH|DELETE)"/);
});

test('PERM y PUBCFG delegan en el único writer AUDIT y no generan source keys con reloj o azar', () => {
  for (const filename of ['pz_promo_permissions_api_lib.js', 'pz_promo_pubcfg_api_lib.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', filename), 'utf8');
    assert.match(source, /promoAudit\.createPromoAudit\(/, `${filename} usa writer central`);
    assert.doesNotMatch(source, /new Record\([^\n]*promo_audit_events/, `${filename} no crea records paralelos`);
    assert.doesNotMatch(source, /Date\.now\(\)[\s\S]{0,200}sourceEventKey/, `${filename} no deriva source key del reloj`);
    assert.doesNotMatch(source, /randomSuffix\(\)[\s\S]{0,200}sourceEventKey/, `${filename} no deriva source key al azar`);
  }
});
