'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  '1787520000_promo_tenant_foundation.js',
  '1787520100_promo_authoring_media.js',
  '1787520200_promo_revision_publication.js',
  '1787520300_promo_audit_analytics.js',
  '1787683200_promo_media_quota_150.js',
  '1787699500_promo_media_quota_300.js',
  '1787699100_promo_translation_state.js',
  '1787699200_promo_language_selector.js',
  '1787699600_promo_operational_defaults.js',
  '1787699700_promo_publish_empty_foundations.js',
];
const PROMO_COLLECTIONS = [
  'promo_sites',
  'promo_site_entitlements',
  'promo_theme_releases',
  'promo_domain_bindings',
  'promo_draft_documents',
  'promo_media_assets',
  'promo_revisions',
  'promo_revision_media_refs',
  'promo_publication_slots',
  'promo_publication_events',
  'promo_audit_events',
  'promo_analytics_events',
  'promo_analytics_daily',
];

class FakeField {
  constructor(values) { Object.assign(this, values); }
}

class FakeFields extends Array {
  add(field) { this.push(field); }
  removeById(id) {
    const index = this.findIndex((item) => item.id === id);
    if (index >= 0) this.splice(index, 1);
  }
  getByName(name) {
    const field = this.find((item) => item.name === name);
    if (!field) throw new Error(`field_not_found:${name}`);
    return field;
  }
}

class FakeCollection {
  constructor(values) {
    Object.assign(this, values);
    this.fields = new FakeFields(...values.fields);
  }
}

function loadMigration(filename) {
  const migrationPath = path.resolve(__dirname, '../pb_migrations', filename);
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up; let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Error,
    Field: FakeField,
    require,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { filename, source, up, down };
}

function fixture() {
  const collections = new Map([
    ['stores', { id: 'pbc_stores', name: 'stores', marker: 'unchanged-store' }],
    ['users', { id: 'pbc_users', name: 'users', marker: 'unchanged-user' }],
  ]);
  const rows = new Map();
  return {
    collections,
    rows,
    findCollectionByNameOrId(value) {
      if (collections.has(value)) return collections.get(value);
      for (const collection of collections.values()) if (collection.id === value) return collection;
      throw new Error(`collection_not_found:${value}`);
    },
    findRecordsByFilter(name, _filter, _sort, _limit, _offset, params = {}) {
      return (rows.get(name) || []).filter((record) => !params.site || record.site === params.site);
    },
    findRecordById(name, id) {
      const record = (rows.get(name) || []).find((item) => item.id === id);
      if (!record) throw new Error(`record_not_found:${name}:${id}`);
      return record;
    },
    save(value) {
      if (value && value.fields) collections.set(value.name, value);
      return value;
    },
    delete(collection) { collections.delete(collection.name); },
  };
}

function runAllUp(app) {
  const loaded = MIGRATIONS.map(loadMigration);
  loaded.forEach((migration) => migration.up(app));
  return loaded;
}

test('DATA crea exactamente trece colecciones Promo privadas sin mutar stores/users', () => {
  const app = fixture();
  const storesBefore = app.collections.get('stores');
  const usersBefore = app.collections.get('users');
  runAllUp(app);

  assert.deepEqual(
    [...app.collections.keys()].filter((name) => name.startsWith('promo_')).sort(),
    PROMO_COLLECTIONS.slice().sort(),
  );
  assert.equal(app.collections.get('stores'), storesBefore);
  assert.equal(app.collections.get('users'), usersBefore);
  for (const name of PROMO_COLLECTIONS) {
    const collection = app.collections.get(name);
    assert.ok(collection, name);
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
      assert.equal(collection[rule], null, `${name}.${rule}`);
    }
  }
});

test('IDs, nombres de fields e índices son únicos y no hay relaciones Commerce', () => {
  const app = fixture();
  runAllUp(app);
  const collectionIds = new Set();
  const fieldIds = new Set();
  const indexNames = new Set();
  const forbiddenRelations = new Set(['products', 'categories', 'orders', 'order_items', 'settings']);
  const idToName = new Map([...app.collections.values()].map((collection) => [collection.id, collection.name]));

  for (const name of PROMO_COLLECTIONS) {
    const collection = app.collections.get(name);
    assert.equal(collectionIds.has(collection.id), false, collection.id);
    collectionIds.add(collection.id);
    const names = new Set();
    for (const field of collection.fields) {
      assert.equal(fieldIds.has(field.id), false, field.id);
      assert.equal(names.has(field.name), false, `${name}.${field.name}`);
      fieldIds.add(field.id);
      names.add(field.name);
      if (field.type === 'relation') {
        assert.equal(forbiddenRelations.has(idToName.get(field.collectionId)), false, `${name}.${field.name}`);
      }
    }
    for (const sql of collection.indexes) {
      const match = String(sql).match(/INDEX `([^`]+)`/);
      assert.ok(match, sql);
      assert.equal(indexNames.has(match[1]), false, match[1]);
      indexNames.add(match[1]);
    }
  }
});

test('schema materializa límites aprobados, WebP protegido y canonical platform/custom', () => {
  const app = fixture();
  runAllUp(app);
  const field = (collection, name) => app.collections.get(collection).fields.find((item) => item.name === name);

  assert.equal(field('promo_site_entitlements', 'max_services').max, 50);
  assert.equal(field('promo_site_entitlements', 'max_gallery_assets').max, 300);
  assert.equal(field('promo_site_entitlements', 'max_locales').max, 10);
  assert.equal(field('promo_site_entitlements', 'max_videos').max, 3);
  assert.equal(field('promo_site_entitlements', 'max_storage_bytes').max, 250 * 1024 * 1024);
  assert.equal(field('promo_site_entitlements', 'language_selector_enabled').type, 'bool');
  assert.equal(field('promo_site_entitlements', 'language_selector_enabled').required, false);

  const file = field('promo_media_assets', 'file');
  assert.equal(file.protected, true);
  assert.equal(file.maxSize, 25 * 1024 * 1024);
  assert.deepEqual(Array.from(file.mimeTypes), ['image/webp', 'video/mp4', 'video/webm']);
  assert.deepEqual(
    Array.from(field('promo_publication_slots', 'canonical_mode').values),
    ['platform', 'custom'],
  );
  assert.equal(field('promo_sites', 'store').cascadeDelete, false);
});

test('backfill publica únicamente foundations Promo vacíos ya creados', () => {
  const app = fixture();
  const record = (id, values) => ({
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    set(key, next) { this[key] = next; },
  });
  const master = require('../pb_hooks/pz_promo_master_lib.js');
  const empty = master.emptyDraftDocument('promo.black-gold');
  const customized = structuredClone(empty);
  customized.locales = { default: 'es', published: ['es'] };
  const storeReady = record('store-ready', { name: 'Prueba 2', status: 'active' });
  const storeCustomized = record('store-custom', { name: 'Personalizada', status: 'active' });
  const siteReady = record('site-ready', {
    store: storeReady.id, public_slug: 'prueba-2', status: 'draft',
    created_by: 'master-1', updated_by: 'master-1',
  });
  const siteCustomized = record('site-custom', {
    store: storeCustomized.id, public_slug: 'personalizada', status: 'draft',
    created_by: 'master-1', updated_by: 'master-1',
  });
  const draftReady = record('draft-ready', {
    site: siteReady.id, document_json: empty, document_sha256: '0'.repeat(64), version: 1,
  });
  const draftCustomized = record('draft-custom', {
    site: siteCustomized.id, document_json: customized, document_sha256: '1'.repeat(64), version: 2,
  });
  const slotReady = record('slot-ready', {
    site: siteReady.id, state: 'unpublished', canonical_mode: 'platform', generation: 1,
  });
  const slotCustomized = record('slot-custom', {
    site: siteCustomized.id, state: 'unpublished', canonical_mode: 'platform', generation: 1,
  });
  app.rows.set('stores', [storeReady, storeCustomized]);
  app.rows.set('promo_sites', [siteReady, siteCustomized]);
  app.rows.set('promo_draft_documents', [draftReady, draftCustomized]);
  app.rows.set('promo_publication_slots', [slotReady, slotCustomized]);

  const previousSecurity = global.$security;
  global.$security = {
    sha256(material) { return createHash('sha256').update(material).digest('hex'); },
  };
  try {
    loadMigration('1787699700_promo_publish_empty_foundations.js').up(app);
  } finally {
    global.$security = previousSecurity;
  }

  assert.equal(siteReady.status, 'active');
  assert.equal(slotReady.state, 'active');
  assert.equal(slotReady.generation, 2);
  assert.equal(draftReady.version, 2);
  assert.equal(draftReady.document_json.locales.default, 'es');
  assert.equal(draftReady.document_json.content_by_locale.es.identity.name, 'Prueba 2');
  assert.match(draftReady.document_sha256, /^[a-f0-9]{64}$/);
  assert.equal(siteCustomized.status, 'draft');
  assert.equal(slotCustomized.state, 'unpublished');
  assert.equal(draftCustomized.version, 2);
});

test('índices críticos cubren tenant, hostname, revision, publicación e idempotencia', () => {
  const app = fixture();
  runAllUp(app);
  const indexes = PROMO_COLLECTIONS.flatMap((name) => app.collections.get(name).indexes);
  for (const expected of [
    'ux_promo_sites_store',
    'ux_promo_sites_public_slug',
    'ux_promo_domain_current_host',
    'ux_promo_domain_current_primary',
    'ux_promo_media_site_sha',
    'ux_promo_revision_sequence',
    'ux_promo_revision_digest',
    'ux_promo_revision_media_use',
    'ux_promo_publication_site',
    'ux_promo_publication_idempotency',
    'ux_promo_audit_source',
    'ux_promo_analytics_dedupe',
    'ux_promo_analytics_daily_bucket',
  ]) {
    assert.equal(indexes.some((sql) => sql.includes(`\`${expected}\``)), true, expected);
  }
  assert.equal(indexes.some((sql) => sql.includes('ux_promo_domain_current_host') && sql.includes('WHERE')), true);
  assert.equal(indexes.some((sql) => sql.includes('ux_promo_domain_current_primary') && sql.includes('WHERE')), true);
});

test('SQLite compila todos los índices y hace cumplir unicidad parcial de dominio/media', () => {
  const app = fixture();
  runAllUp(app);
  const database = new DatabaseSync(':memory:');
  try {
    for (const name of PROMO_COLLECTIONS) {
      const collection = app.collections.get(name);
      const columns = collection.fields.map((field) => `\`${field.name}\` ${field.name === 'id' ? 'TEXT PRIMARY KEY' : 'TEXT'}`);
      database.exec(`CREATE TABLE \`${name}\` (${columns.join(', ')})`);
      collection.indexes.forEach((sql) => database.exec(sql));
    }

    database.exec("INSERT INTO promo_domain_bindings (id, site, hostname_ascii, is_current, role, status) VALUES ('binding00000001', 'site00000000001', 'tienda.example.com', 1, 'primary', 'active')");
    assert.throws(
      () => database.exec("INSERT INTO promo_domain_bindings (id, site, hostname_ascii, is_current, role, status) VALUES ('binding00000002', 'site00000000002', 'tienda.example.com', 1, 'alias', 'active')"),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () => database.exec("INSERT INTO promo_domain_bindings (id, site, hostname_ascii, is_current, role, status) VALUES ('binding00000003', 'site00000000001', 'otra.example.com', 1, 'primary', 'active')"),
      /UNIQUE constraint failed/,
    );
    database.exec("INSERT INTO promo_domain_bindings (id, site, hostname_ascii, is_current, role, status) VALUES ('binding00000004', 'site00000000002', 'tienda.example.com', 0, 'primary', 'released')");

    database.exec("INSERT INTO promo_media_assets (id, site, sha256) VALUES ('asset0000000001', 'site00000000001', '')");
    database.exec("INSERT INTO promo_media_assets (id, site, sha256) VALUES ('asset0000000002', 'site00000000001', '')");
    database.exec("INSERT INTO promo_media_assets (id, site, sha256) VALUES ('asset0000000003', 'site00000000001', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')");
    assert.throws(
      () => database.exec("INSERT INTO promo_media_assets (id, site, sha256) VALUES ('asset0000000004', 'site00000000001', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')"),
      /UNIQUE constraint failed/,
    );
  } finally {
    database.close();
  }
});

test('down completo es reversible en vacío y falla cerrado si encuentra datos', () => {
  const app = fixture();
  const migrations = runAllUp(app);
  migrations.slice().reverse().forEach((migration) => migration.down(app));
  assert.equal(PROMO_COLLECTIONS.some((name) => app.collections.has(name)), false);
  assert.ok(app.collections.has('stores'));
  assert.ok(app.collections.has('users'));

  const blocked = fixture();
  const blockedMigrations = runAllUp(blocked);
  blocked.rows.set('promo_media_assets', [{ id: 'asset0000000001' }]);
  assert.throws(() => blockedMigrations[1].down(blocked), /unsafe_rollback_promo_data/);
  assert.ok(blocked.collections.has('promo_media_assets'));
  assert.ok(blocked.collections.has('promo_draft_documents'));
});

test('hook registra solo enforcement CRUD para colecciones Promo y no agrega rutas', () => {
  const hook = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_promo_data.pb.js'), 'utf8');
  assert.match(hook, /onRecordCreateRequest/);
  assert.match(hook, /onRecordUpdateRequest/);
  assert.match(hook, /onRecordDeleteRequest/);
  assert.doesNotMatch(hook, /routerAdd\s*\(/);
  assert.doesNotMatch(hook, /Cloudflare|Coolify|fetch\s*\(/i);
});
