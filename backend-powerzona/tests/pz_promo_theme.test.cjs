'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const theme = require('../pb_hooks/pz_promo_theme_lib.js');
const api = require('../pb_hooks/pz_promo_theme_api_lib.js');
const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function release(status = 'approved', overrides = {}) {
  const values = {
    id: 'themeaaaaaaaaaa',
    theme_id: theme.BLACK_GOLD_MANIFEST.theme_id,
    version: theme.BLACK_GOLD_MANIFEST.version,
    status,
    renderer_key: theme.BLACK_GOLD_MANIFEST.renderer_key,
    contract_version: theme.BLACK_GOLD_MANIFEST.contract_version,
    manifest_sha256: theme.BLACK_GOLD_MANIFEST_SHA256,
    token_schema_sha256: theme.BLACK_GOLD_TOKEN_SCHEMA_SHA256,
    ...overrides,
  };
  return { ...values, get(key) { return values[key]; }, getString(key) { return String(values[key] ?? ''); } };
}

function releaseFor(entry, status = 'approved') {
  return release(status, {
    id: `theme-${entry.manifest.theme_id.replace(/[^a-z]/g, '')}`.slice(0, 15),
    theme_id: entry.manifest.theme_id,
    version: entry.manifest.version,
    renderer_key: entry.manifest.renderer_key,
    contract_version: entry.manifest.contract_version,
    manifest_sha256: entry.manifest_sha256,
    token_schema_sha256: entry.token_schema_sha256,
  });
}

function selection(tokens = {}) {
  return {
    theme_id: theme.BLACK_GOLD_MANIFEST.theme_id,
    version: theme.BLACK_GOLD_MANIFEST.version,
    tokens,
  };
}

function catalogBootstrapFixture(initial = []) {
  const collections = {
    promo_theme_releases: { name: 'promo_theme_releases' },
    promo_audit_events: { name: 'promo_audit_events' },
  };
  const saved = initial.slice();
  let sequence = 0;
  const previousRecord = global.Record;
  global.Record = class FakeRecord {
    constructor(collection) {
      sequence += 1;
      const values = {
        id: `record${String(sequence).padStart(9, '0')}`,
        _collection: collection,
        get(key) { return this[key]; },
        getString(key) { return String(this[key] ?? ''); },
        set(key, value) { this[key] = value; },
      };
      return values;
    }
  };
  const app = {
    findCollectionByNameOrId(name) {
      if (!collections[name]) throw new Error(`not_found:${name}`);
      return collections[name];
    },
    findRecordsByFilter(collection, _filter, _sort, limit, _offset, params = {}) {
      return saved.filter((item) => item._collection?.name === collection)
        .filter((item) => !params.theme || item.theme_id === params.theme)
        .filter((item) => !params.version || item.version === params.version)
        .slice(0, limit);
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const found = saved.find((item) => item._collection?.name === collection
        && (!params.scope || item.scope_key === params.scope)
        && (!params.source || item.source_event_key === params.source));
      if (!found) throw new Error('not_found');
      return found;
    },
    save(record) {
      if (!saved.includes(record)) saved.push(record);
      return record;
    },
  };
  return {
    app,
    saved,
    restore() { global.Record = previousRecord; },
  };
}

function publicDocument(tokens = {}) {
  return {
    contract: 'promo.site.v2',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es'] },
    theme: selection(tokens),
    identity: { public_business_key: 'aladdin-carpet' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: {
        media_use_key: '', action_key: '', layout: 'immersive',
        button_targets: ['primary-contact'],
        contrast_mode: 'auto', title_color: '#ffffff', body_color: '#e2e8f0',
        accent_color: '#93c5fd', overlay_strength: 'medium',
      },
      media_use_keys: [],
    }],
    media_refs: {},
    contact: {
      enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [],
      logo_media_use_key: '', qr_media_use_key: '',
    },
    content_by_locale: {
      es: {
        identity: { name: "Aladdin's Carpet", slogan: '' },
        navigation: { 'hero-main': 'Inicio' },
        sections: {
          'hero-main': {
            heading: 'Alfombras con historia', intro: '', highlights: [], button_labels: [''],
          },
        },
        contact: {}, media_alt: {},
        seo: { title: "Aladdin's Carpet", description: 'Restauración profesional de alfombras' },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

test('registry versionado fija hashes reproducibles y no contiene código o URLs configurables', () => {
  const entries = Object.values(theme.THEME_REGISTRY);
  assert.equal(entries.length, 6);
  for (const entry of entries) {
    assert.equal(sha256(theme.manifestHashMaterial(entry)), entry.manifest_sha256);
    assert.equal(sha256(theme.tokenSchemaHashMaterial(entry)), entry.token_schema_sha256);
    assert.equal(entry.manifest.document_contract, 'promo.site.v2');
    const serialized = JSON.stringify(entry.manifest);
    assert.doesNotMatch(serialized, /https?:|<script|javascript:|arbitrary_css|unsafe-eval/i);
    assert.equal(entry.manifest.compatibility.content_preserving_switch, true);
    assert.equal(entry.manifest.performance.third_party_scripts, false);
  }
  assert.equal(theme.registryEntry('promo.black-gold', '9.9.9'), null);
});

test('las seis apariencias resuelven defaults cerrados y contraste accesible', () => {
  const themeIds = Object.values(theme.THEME_REGISTRY).map((entry) => entry.manifest.theme_id).sort();
  assert.deepEqual(themeIds, [
    'promo.artisan', 'promo.black-gold', 'promo.minimal',
    'promo.portfolio', 'promo.professional', 'promo.vibrant',
  ]);
  for (const entry of Object.values(theme.THEME_REGISTRY)) {
    const effective = theme.resolveEffectiveSelection({
      theme_id: entry.manifest.theme_id,
      version: entry.manifest.version,
      tokens: {},
    });
    assert.equal(Object.keys(effective.tokens).length, Object.keys(entry.manifest.token_schema).length);
    assert.equal(theme.assertAccessibleCombination(effective.tokens, entry), true);
  }
});

test('tokens usan enums cerrados, defaults deterministas y combinaciones con contraste seguro', () => {
  const fallback = theme.safeFallbackSelection();
  assert.deepEqual(fallback, theme.resolveEffectiveSelection(selection()));
  assert.equal(fallback.tokens.surface, 'obsidian');
  assert.equal(fallback.tokens.accent, 'heritage_gold');
  assert.ok(theme.contrastRatio('#0b0b0b', '#f6f1e7') >= 4.5);
  assert.ok(theme.contrastRatio('#0b0b0b', '#c8a45a') >= 3);

  const champagne = theme.resolveEffectiveSelection(selection({
    accent: 'champagne_gold', border: 'champagne_gold', radius: 'soft', motion: 'reduced',
  }));
  assert.equal(champagne.tokens.accent, 'champagne_gold');
  assert.equal(champagne.tokens.motion, 'reduced');
  assert.throws(() => theme.resolveEffectiveSelection(selection({ arbitrary_css: 'body{}' })), /unknown_promo_theme_token/);
  assert.throws(() => theme.resolveEffectiveSelection(selection({ accent: '#ffffff' })), /invalid_promo_theme_token_value/);
  assert.throws(() => theme.resolveEffectiveSelection(selection({ accent: 'champagne_gold' })), /incompatible_promo_theme_tokens/);
});

test('PUBCFG valida manifest, variantes y proyecta únicamente tokens efectivos allowlisted', () => {
  const document = publicDocument({ radius: 'soft', motion: 'reduced' });
  assert.deepEqual(pubcfg.validatePromoDocument(document, { publicRevision: true }), document);
  const projection = pubcfg.projectPublicDocument(document, 'aladdin-carpet', []);
  assert.equal(projection.theme.tokens.radius, 'soft');
  assert.equal(projection.theme.tokens.motion, 'reduced');
  assert.equal(projection.theme.tokens.surface, 'obsidian');
  assert.equal(projection.sections[0].config.contrast_mode, 'auto');
  assert.equal(Object.keys(projection.theme.tokens).length, Object.keys(theme.BLACK_GOLD_TOKEN_SCHEMA).length);
  const invalidVariant = structuredClone(document);
  invalidVariant.sections[0].variant = 'tenant-component';
  assert.throws(() => pubcfg.validatePromoDocument(invalidVariant, { publicRevision: true }), /incompatible_promo_theme_variant/);
});

test('selección nueva exige approved; público y rollback retienen deprecated/retired pero bloquean blocked', () => {
  assert.equal(theme.assertReleaseForSelection(release('approved'), selection(), { mode: 'select' }).status, 'approved');
  assert.throws(() => theme.assertReleaseForSelection(release('deprecated'), selection(), { mode: 'select' }), /promo_theme_not_selectable/);
  assert.equal(theme.assertReleaseForSelection(release('deprecated'), selection(), { mode: 'edit' }).status, 'deprecated');
  assert.equal(theme.assertReleaseForSelection(release('retired'), selection(), { mode: 'public' }).status, 'retired');
  assert.deepEqual(theme.resolveRollbackSelection(release('retired'), selection({ radius: 'soft' })).tokens.radius, 'soft');
  assert.throws(() => theme.resolveRollbackSelection(release('blocked'), selection()), /promo_theme_unavailable/);
  assert.throws(() => theme.assertReleaseIntegrity(
    release('approved', { manifest_sha256: 'a'.repeat(64) }), selection(),
  ), /promo_theme_release_mismatch/);
});

test('catálogo privado oculta releases no aprobados, retirados, unknown o con digest incompatible', () => {
  const catalog = theme.catalogFromReleases([
    ...Object.values(theme.THEME_REGISTRY).map((entry) => releaseFor(entry)),
    release('deprecated'),
    release('approved', { version: '9.9.9' }),
    release('approved', { manifest_sha256: 'f'.repeat(64) }),
  ]);
  assert.equal(catalog.length, 6);
  const blackGold = catalog.find((item) => item.theme_id === 'promo.black-gold');
  assert.equal(blackGold.tokens.accent.type, 'enum');
  assert.deepEqual(blackGold.tokens.accent.values, ['heritage_gold', 'champagne_gold']);
  const serialized = JSON.stringify(catalog);
  assert.doesNotMatch(serialized, /manifest_sha256|token_schema_sha256|approved_by|#[a-f0-9]{6}/i);
});

test('bootstrap first-party crea seis releases aprobados, auditados e idempotentes', () => {
  const fixture = catalogBootstrapFixture();
  try {
    const actor = {
      id: 'masterstore0001', role: 'master_admin', status: 'active', name: 'Master',
      get(key) { return this[key]; },
      getString(key) { return String(this[key] ?? ''); },
    };
    assert.deepEqual(api.ensureFirstPartyCatalog(fixture.app, actor), {
      created: 6, promoted: 0, total: 6,
    });
    assert.deepEqual(api.ensureFirstPartyCatalog(fixture.app, actor), {
      created: 0, promoted: 0, total: 6,
    });
    const releases = fixture.saved.filter((item) => item._collection?.name === 'promo_theme_releases');
    const events = fixture.saved.filter((item) => item._collection?.name === 'promo_audit_events');
    assert.equal(releases.length, 6);
    assert.equal(events.length, 6);
    assert.equal(releases.every((item) => item.status === 'approved'), true);
    assert.equal(releases.every((item) => item.approved_by === actor.id), true);
    assert.equal(events.every((item) => item.origin === 'master_admin'), true);
    assert.equal(events.every((item) => item.action === 'promo.theme.release.update'), true);
  } finally {
    fixture.restore();
  }
});

test('bootstrap de migración promueve solo un catálogo completamente draft', () => {
  const entry = theme.THEME_REGISTRY['promo.black-gold@1.0.0'];
  const draft = {
    ...releaseFor(entry, 'draft'),
    _collection: { name: 'promo_theme_releases' },
    approved_by: '', approved_at: '',
    set(key, value) { this[key] = value; },
  };
  const fixture = catalogBootstrapFixture([draft]);
  try {
    const actor = {
      id: 'masterstore0001', role: 'master_admin', status: 'active',
      get(key) { return this[key]; },
      getString(key) { return String(this[key] ?? ''); },
    };
    assert.deepEqual(api.ensureFirstPartyCatalog(fixture.app, actor, {
      promoteBootstrapDrafts: true,
      auditOrigin: 'migration',
    }), { created: 5, promoted: 1, total: 6 });
    const releases = fixture.saved.filter((item) => item._collection?.name === 'promo_theme_releases');
    const events = fixture.saved.filter((item) => item._collection?.name === 'promo_audit_events');
    assert.equal(releases.every((item) => item.status === 'approved'), true);
    assert.equal(events.every((item) => item.origin === 'migration' && item.actor === ''), true);
  } finally {
    fixture.restore();
  }
});

test('contratos Theme son exactos y las transiciones Master no aceptan tenant ni campos libres', () => {
  assert.deepEqual(api.parseReleaseUpdate({
    contract: 'promo.theme.release.update.v1',
    theme_id: 'promo.black-gold',
    version: '1.0.0',
    expected_status: 'approved',
    next_status: 'deprecated',
  }), {
    themeId: 'promo.black-gold', version: '1.0.0',
    expectedStatus: 'approved', nextStatus: 'deprecated',
  });
  for (const extra of ['store_id', 'site_id', 'filter', 'sort', 'fields', 'expand', 'manifest_sha256']) {
    assert.equal(api.parseReleaseUpdate({
      contract: 'promo.theme.release.update.v1', theme_id: 'promo.black-gold', version: '1.0.0',
      expected_status: 'approved', next_status: 'deprecated', [extra]: 'attacker',
    }), null);
  }
  assert.equal(api.errorStatus({ code: 'promo_theme_release_conflict' }), 409);
  assert.equal(api.errorCode({ code: 'secret-attacker-value' }), 'promo_theme_unavailable');
});

test('Theme registra solo dos POST privados autenticados y reutiliza PUBCFG/AUDIT', () => {
  const routeSource = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_theme.pb.js'), 'utf8');
  const routes = [...routeSource.matchAll(/"(\/api\/pz\/promo\/[^\"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    '/api/pz/promo/private/v1/themes/catalog',
    '/api/pz/promo/private/v1/themes/releases/update',
  ]);
  assert.equal((routeSource.match(/\$apis\.requireAuth\(\)/g) || []).length, 2);
  assert.doesNotMatch(routeSource, /GET|PATCH|DELETE|realtime|filter|expand/);

  const apiSource = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_theme_api_lib.js'), 'utf8');
  assert.match(apiSource, /promo\.master\.theme_releases\.manage/);
  assert.match(apiSource, /promo\.theme\.release\.update/);
  assert.match(apiSource, /ensureFirstPartyCatalog/);
  const migrationSource = fs.readFileSync(path.join(
    __dirname, '..', 'pb_migrations', '1788354000_promo_theme_catalog_bootstrap.js',
  ), 'utf8');
  assert.match(migrationSource, /role = \{\:role\} && status = \{\:status\}/);
  assert.match(migrationSource, /promoteBootstrapDrafts: true/);
  assert.match(migrationSource, /auditOrigin: "migration"/);
  assert.match(migrationSource, /El catálogo no se elimina/);
  assert.match(apiSource, /draftDecision/);
  const pubcfgSource = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_pubcfg_api_lib.js'), 'utf8');
  assert.match(pubcfgSource, /promo\.theme\.selection\.update/);
});
