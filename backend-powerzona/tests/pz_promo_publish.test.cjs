'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const publish = require('../pb_hooks/pz_promo_publish_lib.js');
const publishApi = require('../pb_hooks/pz_promo_publish_api_lib.js');
const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');

function record(id, values = {}) {
  return {
    id,
    values: { id, ...values },
    get(key) { return this.values[key]; },
  };
}

test('PUBLISH fija contratos versionados exactos sin tenant, actor ni filtros aportados por cliente', () => {
  assert.deepEqual(publish.parseCandidateCreate({
    contract: 'promo.candidate.create.v1', expected_draft_version: 7,
  }), { expectedDraftVersion: 7 });
  assert.equal(publish.parseCandidateCreate({
    contract: 'promo.candidate.create.v1', expected_draft_version: 7, site_id: 'siteaaaaaaaaaaa',
  }), null);

  assert.deepEqual(publish.parsePreview({
    contract: 'promo.preview.read.v1', candidate_revision_id: 'revisionaaaaaaa', locale: 'es',
  }), { revisionId: 'revisionaaaaaaa', locale: 'es' });
  assert.equal(publish.parsePreview({
    contract: 'promo.preview.read.v1', candidate_revision_id: 'revisionaaaaaaa', locale: 'ES',
  }), null, 'el preview exige locale ya canonical');
  assert.equal(publish.parsePreviewContext({
    contract: 'promo.preview.context.read.v1',
  }), true);
  assert.equal(publish.parsePreviewContext({
    contract: 'promo.preview.context.read.v1', site_id: 'siteaaaaaaaaaaa',
  }), false, 'el contexto de preview tampoco acepta tenant aportado');

  const parsed = publish.parseTransition('publish', {
    contract: 'promo.publication.publish.v1', candidate_revision_id: 'revisionaaaaaaa',
    expected_generation: 4, idempotency_key: 'publish.request.0001', reason_code: 'content_release',
    canonical: { mode: 'platform' },
  });
  assert.equal(parsed.operation, 'publish');
  assert.equal(parsed.expectedGeneration, 4);
  assert.deepEqual(parsed.canonical, { mode: 'platform', primaryBindingId: '' });

  for (const injected of ['store_id', 'site_id', 'actor_id', 'filter', 'sort', 'fields', 'expand']) {
    assert.equal(publish.parseTransition('publish', {
      contract: 'promo.publication.publish.v1', candidate_revision_id: 'revisionaaaaaaa',
      expected_generation: 4, idempotency_key: 'publish.request.0001', reason_code: 'content_release',
      canonical: { mode: 'platform' }, [injected]: 'attacker',
    }), null, `rechaza ${injected}`);
  }
});

test('canonical, motivos e idempotencia son allowlists cerradas', () => {
  assert.deepEqual(publish.canonicalTarget({
    mode: 'custom', primary_binding_id: 'bindingaaaaaaaa',
  }), { mode: 'custom', primaryBindingId: 'bindingaaaaaaaa' });
  for (const invalid of [
    { mode: 'platform', primary_binding_id: 'bindingaaaaaaaa' },
    { mode: 'custom' },
    { mode: 'custom', primary_binding_id: 'bindingaaaaaaaa', hostname: 'victim.test' },
    { mode: 'other' },
  ]) assert.equal(publish.canonicalTarget(invalid), null);

  assert.ok(publish.parseTransition('rollback', {
    contract: 'promo.publication.rollback.v1', candidate_revision_id: 'revisionaaaaaaa',
    expected_generation: 8, idempotency_key: 'rollback.request.01', reason_code: 'incident_recovery',
    canonical: { mode: 'platform' },
  }));
  assert.deepEqual(publish.parseTransition('binding_switch', {
    contract: 'promo.publication.canonical.switch.v1', expected_generation: 8,
    idempotency_key: 'canonical.switch.01', reason_code: 'canonical_change',
    canonical: { mode: 'custom', primary_binding_id: 'bindingaaaaaaaa' },
  }).canonical, { mode: 'custom', primaryBindingId: 'bindingaaaaaaaa' });
  assert.equal(publish.parseTransition('rollback', {
    contract: 'promo.publication.rollback.v1', candidate_revision_id: 'revisionaaaaaaa',
    expected_generation: 8, idempotency_key: 'rollback.request.01', reason_code: 'free text with PII',
    canonical: { mode: 'platform' },
  }), null);
  assert.equal(publish.idempotencyKey('contains-secret-key-0001'), '');
  assert.equal(publish.idempotencyKey('safe.request.key.0001'), 'safe.request.key.0001');
});

test('intentos persistibles usan fingerprint estable del contrato exacto sin serializar la idempotency key', () => {
  const input = publish.parseTransition('publish', {
    contract: 'promo.publication.publish.v1', candidate_revision_id: 'revisionaaaaaaa',
    expected_generation: 4, idempotency_key: 'publish.request.0001', reason_code: 'content_release',
    canonical: { mode: 'platform' },
  });
  const sameRequestOtherKey = Object.freeze({ ...input, idempotencyKey: 'publish.request.0002' });
  assert.match(publishApi.requestFingerprint(input), /^[a-z0-9]{21}$/);
  assert.equal(publishApi.requestFingerprint(input), publishApi.requestFingerprint(sameRequestOtherKey));
  assert.notEqual(publishApi.requestFingerprint(input), publishApi.requestFingerprint(Object.freeze({
    ...input, expectedGeneration: 5,
  })));
});

test('candidata y snapshots de AUDIT exponen solo metadata operacional saneada', () => {
  const revision = record('revisionaaaaaaa', {
    sequence: 9, snapshot_sha256: 'a'.repeat(64), source_draft_version: 6,
    created: '2026-08-23T10:00:00Z',
  });
  const candidate = publish.candidateProjection(revision, false);
  assert.deepEqual(Object.keys(candidate).sort(), [
    'created', 'digest', 'reused', 'revision_id', 'sequence', 'source_draft_version',
  ]);
  const previewRevision = publish.previewRevisionProjection(revision, {
    locales: { default: 'es', published: ['en', 'es'] },
  });
  assert.deepEqual(Object.keys(previewRevision).sort(), [
    'created', 'digest', 'locales', 'revision_id', 'sequence', 'source_draft_version',
  ]);
  assert.deepEqual(previewRevision.locales, { default: 'es', published: ['en', 'es'] });
  const revisionSnapshot = publish.revisionAuditSnapshot(revision, {
    theme: { theme_id: 'promo.black-gold', version: '1.0.0' },
    locales: { default: 'es', published: ['en', 'es'] },
  });
  assert.equal(JSON.stringify(revisionSnapshot).includes('content_by_locale'), false);
  const slotSnapshot = publish.publicationAuditSnapshot({
    state: 'active', generation: 4, canonicalMode: 'custom',
    revisionDigest: 'b'.repeat(64), bindingState: 'primary_active', reasonCode: 'canonical_change',
  });
  assert.deepEqual(Object.keys(slotSnapshot).sort(), [
    'binding_state', 'canonical_mode', 'generation', 'reason_code', 'revision_digest', 'state',
  ]);
});

test('preview localizado es privado, no mezcla locales y reemplaza delivery público por rutas privadas', () => {
  const document = {
    contract: 'promo.site.v1', system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'business' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {
      en: {
        identity: { name: 'English' }, navigation: { 'hero-main': 'Home' },
        sections: { 'hero-main': { heading: 'English' } }, contact: {}, media_alt: {},
        seo: { title: 'English', description: 'English description' },
      },
      es: {
        identity: { name: 'Español' }, navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: 'Español' } }, contact: {}, media_alt: {},
        seo: { title: 'Español', description: 'Descripción en español' },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
  const projection = pubcfg.projectPublicDocument(document, 'promo-safe', []);
  const preview = publish.previewProjection(projection, 'es', []);
  assert.equal(preview.content.identity.name, 'Español');
  assert.equal(JSON.stringify(preview).includes('English description'), false);
  assert.deepEqual(preview.locale_options.map((item) => Object.keys(item).sort()), [
    ['active', 'label', 'locale'], ['active', 'label', 'locale'],
  ]);
  assert.equal(JSON.stringify(preview).includes('canonical_path'), false);
  assert.equal(JSON.stringify(preview).includes('/api/pz/promo/public/'), false);
});

test('máquina de estados permite primera/posterior, rollback, pausa, resume, binding y unpublish exactos', () => {
  const decision = (siteStatus) => ({ site: record('siteaaaaaaaaaaa', { status: siteStatus }) });
  const slot = (state, extra = {}) => record('slotaaaaaaaaaaa', {
    state, canonical_mode: 'platform', published_revision: state === 'unpublished' ? '' : 'revisionaaaaaaa',
    primary_binding: '', ...extra,
  });
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('draft'), slot('unpublished'), 'publish'));
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('active'), slot('active'), 'publish'));
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('paused'), slot('unpublished'), 'rollback'));
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('active'), slot('active'), 'unpublish'));
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('active'), slot('active'), 'pause'));
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('paused'), slot('paused'), 'resume'));
  assert.doesNotThrow(() => publishApi.assertStateForOperation(decision('active'), slot('active', {
    published_revision: '',
  }), 'binding_switch'));
  assert.throws(
    () => publishApi.assertStateForOperation(decision('active'), slot('active', {
      published_revision: '',
    }), 'pause'),
    /promo_publication_state_conflict/,
  );
  assert.throws(
    () => publishApi.assertStateForOperation(decision('draft'), slot('active'), 'publish'),
    /promo_publication_state_conflict/,
  );
  assert.throws(
    () => publishApi.assertStateForOperation(decision('active'), slot('unpublished', {
      published_revision: 'revisionaaaaaaa',
    }), 'publish'),
    /promo_publication_state_conflict/,
  );
});

test('hook registra solo POST privados autenticados y no crea serving alternativo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_publish.pb.js'), 'utf8');
  assert.equal((source.match(/routerAdd\(/g) || []).length, 9);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 9);
  assert.equal((source.match(/\$apis\.bodyLimit\(4096\)/g) || []).length, 9);
  assert.doesNotMatch(source, /"GET"|\/public\/|Cloudflare|Coolify|DNS/);
  for (const route of [
    'candidates/create', 'preview', 'preview/context', 'publish', 'canonical/switch', 'rollback', 'unpublish', 'pause', 'resume',
  ]) assert.match(source, new RegExp(route.replace('/', '\\/')));
});

test('cambio canónico valida el documento live cuando el foundation aún no tiene revisión', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_publish_api_lib.js'), 'utf8');
  assert.match(source, /operation !== "binding_switch"/);
  assert.match(source, /resolvePublicProjectionForSite\(app, decision\.site/);
  assert.match(source, /expectedGeneration: recordInteger\(slot, "generation"\)/);
  assert.match(source, /promo_publication_validation_failed/);
});

test('migración focal permite generation cero sin debilitar el guard server-side ni el down seguro', () => {
  const source = fs.readFileSync(path.join(
    __dirname, '..', 'pb_migrations', '1787520500_promo_publication_zero_generation.js',
  ), 'utf8');
  assert.match(source, /generation_before/);
  assert.match(source, /generation_after/);
  assert.match(source, /required = false/);
  assert.match(source, /unsafe_rollback_promo_publication_zero_generation/);
  assert.match(source, /generation_before = 0 \|\| generation_after = 0/);
  const dataSource = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_data_lib.js'), 'utf8');
  assert.match(dataSource, /before === null \|\| after === null/);
  assert.match(dataSource, /after !== before \+ \(succeeded \? 1 : 0\)/);
});

test('API integra DATA/PERM/PUBCFG/AUDIT/I18N/THEME/MEDIA/DOM-CORE y nunca consulta latest/draft para serving', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_publish_api_lib.js'), 'utf8');
  for (const dependency of [
    'pz_promo_permissions_lib', 'pz_promo_data_lib', 'pz_promo_pubcfg_lib',
    'pz_promo_pubcfg_api_lib', 'pz_promo_audit_lib', 'pz_promo_theme_lib',
    'pz_promo_i18n_lib', 'pz_promo_media_lib', 'pz_promo_domain_lib',
  ]) assert.match(source, new RegExp(dependency));
  assert.match(source, /runInTransaction/);
  assert.match(source, /promo_publication_events/);
  assert.match(source, /expectedGeneration/);
  assert.match(source, /idempotencyKey/);
  assert.match(source, /assertActiveBinding/);
  assert.match(source, /validateRevisionMediaRows/);
  assert.match(source, /createPromoAudit/);
  assert.doesNotMatch(source, /getCurrentStore|products|orders|cart|checkout|Cloudflare|Coolify/);
});
