'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const promo = require('../pb_hooks/pz_promo_data_lib.js');

function record(id, values, original) {
  return {
    id,
    values: { ...values },
    get(key) { return this.values[key]; },
    original() { return original || null; },
  };
}

function appFixture(seed) {
  const records = new Map();
  const lists = new Map();
  for (const [collection, entries] of Object.entries(seed || {})) {
    lists.set(collection, entries.slice());
    for (const item of entries) records.set(`${collection}:${item.id}`, item);
  }
  return {
    records,
    lists,
    findRecordById(collection, id) {
      const found = records.get(`${collection}:${id}`);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit, _offset, params) {
      let found = (lists.get(collection) || []).slice();
      if (params && params.siteId) found = found.filter((item) => item.get('site') === params.siteId);
      if (params && params.revisionId) found = found.filter((item) => item.get('revision') === params.revisionId);
      return found.slice(0, limit);
    },
  };
}

function entitlement(overrides) {
  return {
    source: 'unassigned',
    promo_site_enabled: false,
    publish_enabled: false,
    custom_domain_enabled: false,
    theme_customization_enabled: false,
    multilanguage_enabled: false,
    video_enabled: false,
    analytics_enabled: false,
    landing_qr_bridge_enabled: false,
    max_services: 0,
    max_gallery_assets: 0,
    max_locales: 0,
    max_videos: 0,
    max_storage_bytes: 0,
    ...(overrides || {}),
  };
}

test('hard ceilings aprobados quedan congelados en el contrato DATA', () => {
  assert.deepEqual(promo.HARD_LIMITS, {
    max_document_bytes: 1024 * 1024,
    max_services: 50,
    max_gallery_assets: 24,
    max_locales: 10,
    max_videos: 3,
    max_sections: 64,
    max_contact_actions: 32,
    max_media_refs: 512,
    max_revision_images: 30,
    max_stored_images: 200,
    max_image_bytes: 100 * 1024,
    max_video_bytes: 25 * 1024 * 1024,
    max_storage_bytes: 250 * 1024 * 1024,
  });
  assert.equal(promo.PROMO_COLLECTIONS.length, 13);
});

test('slugs y hosts son exactos, canonicales y respetan namespaces reservados', () => {
  assert.equal(promo.assertPublicSlug('aladdins-carpet'), 'aladdins-carpet');
  assert.throws(() => promo.assertPublicSlug('Aladdins-Carpet'), /invalid_promo_public_slug/);
  assert.throws(() => promo.assertPublicSlug('admin'), /invalid_promo_public_slug/);
  assert.equal(promo.assertCanonicalHostname('tienda.ejemplo.com'), 'tienda.ejemplo.com');
  assert.throws(() => promo.assertCanonicalHostname('Tienda.ejemplo.com'), /invalid_promo_hostname/);
  assert.throws(() => promo.assertCanonicalHostname('tienda.ejemplo.com.'), /invalid_promo_hostname/);
  assert.throws(() => promo.assertCanonicalHostname('tienda.ejemplo.com:443'), /invalid_promo_hostname/);
  assert.throws(() => promo.assertCanonicalHostname('ejemplo'), /invalid_promo_hostname/);
});

test('entitlement unassigned solo admite gates false y cuotas cero', () => {
  assert.equal(promo.assertEntitlementLimits(entitlement()), true);
  assert.throws(
    () => promo.assertEntitlementLimits(entitlement({ promo_site_enabled: true })),
    /unassigned_promo_entitlement_enabled/,
  );
  assert.throws(
    () => promo.assertEntitlementLimits(entitlement({ max_services: 1 })),
    /unassigned_promo_quota_nonzero/,
  );
  assert.equal(promo.assertEntitlementLimits(entitlement({
    source: 'contract',
    promo_site_enabled: true,
    publish_enabled: true,
    max_services: 50,
    max_gallery_assets: 24,
    max_locales: 1,
    max_videos: 0,
    max_storage_bytes: 250 * 1024 * 1024,
  })), true);
  assert.throws(
    () => promo.assertEntitlementLimits(entitlement({ source: 'contract', max_services: 51 })),
    /invalid_promo_entitlement_limit/,
  );
});

test('documento Promo rechaza Commerce, código arbitrario y exceso de contenido', () => {
  const valid = {
    locales: { default: 'es', published: ['es'] },
    sections: [{ key: 'services', type: 'services', config: { items: [{ name: 'Limpieza' }] } }],
    media_refs: { hero_main: { asset_id: 'asset0000000001' } },
    contact: { actions: [{ key: 'contact_main', type: 'phone' }] },
  };
  assert.equal(promo.assertDocumentHardLimits(valid), true);
  assert.throws(() => promo.assertDocumentHardLimits({ ...valid, price: 10 }), /commerce_field_forbidden/);
  assert.throws(
    () => promo.assertDocumentHardLimits({ ...valid, title: '<script>alert(1)</script>' }),
    /unsafe_promo_document_value/,
  );
  assert.throws(
    () => promo.assertDocumentHardLimits({
      ...valid,
      sections: [{ type: 'services', config: { items: Array.from({ length: 51 }, (_, id) => ({ id })) } }],
    }),
    /promo_services_limit/,
  );
  assert.throws(
    () => promo.assertDocumentHardLimits({
      ...valid,
      sections: [{ type: 'gallery', media_use_keys: Array.from({ length: 25 }, (_, id) => `image_${id}`) }],
    }),
    /promo_gallery_limit/,
  );
});

test('locales publicados deben ser canonicales, sorted, únicos e incluir default', () => {
  assert.deepEqual(promo.assertCanonicalLocales(['en', 'es', 'es-MX'], 'es'), ['en', 'es', 'es-MX']);
  assert.throws(() => promo.assertCanonicalLocales(['es', 'en'], 'es'), /invalid_promo_locales/);
  assert.throws(() => promo.assertCanonicalLocales(['es', 'es'], 'es'), /invalid_promo_locales/);
  assert.throws(() => promo.assertCanonicalLocales(['es-us'], 'es-US'), /invalid_promo_locales/);
});

test('200 WebP optimizados son válidos y la imagen 201 falla cerrada', () => {
  const siteId = 'site00000000001';
  const existing = Array.from({ length: 199 }, (_, index) => record(
    `image${String(index).padStart(10, '0')}`,
    { site: siteId, kind: 'image', bytes: 100 * 1024 },
  ));
  const app = appFixture({ promo_media_assets: existing });
  const candidate = record('imagecandidate01', {
    site: siteId,
    kind: 'image',
    purpose: 'gallery',
    status: 'ready',
    file: 'normalized.webp',
    mime_detected: 'image/webp',
    sha256: 'a'.repeat(64),
    bytes: 100 * 1024,
    width: 1200,
    height: 630,
    duration_ms: 0,
    poster_asset: '',
  });
  assert.equal(promo.assertMedia(app, candidate, null), true);
  app.lists.get('promo_media_assets').push(record('image0200000000', {
    site: siteId, kind: 'image', bytes: 1,
  }));
  assert.throws(() => promo.assertMedia(app, candidate, null), /promo_image_count_exceeded/);
  assert.throws(
    () => promo.assertMedia(app, record('imageoversized1', {
      ...candidate.values, bytes: (100 * 1024) + 1,
    }), null),
    /invalid_promo_image/,
  );
});

test('videos permanecen acotados a tres, 25 MiB y dentro del presupuesto total', () => {
  const siteId = 'site00000000001';
  const videos = Array.from({ length: 2 }, (_, index) => record(
    `video${String(index).padStart(10, '0')}`,
    { site: siteId, kind: 'video', bytes: 25 * 1024 * 1024 },
  ));
  const app = appFixture({ promo_media_assets: videos });
  const candidate = record('videocandidate01', {
    site: siteId,
    kind: 'video',
    purpose: 'gallery',
    status: 'ready',
    file: 'clip.mp4',
    mime_detected: 'video/mp4',
    sha256: 'b'.repeat(64),
    bytes: 25 * 1024 * 1024,
    width: 1280,
    height: 720,
    duration_ms: 30_000,
    poster_asset: '',
  });
  assert.equal(promo.assertMedia(app, candidate, null), true);
  app.lists.get('promo_media_assets').push(record('video0000000003', {
    site: siteId, kind: 'video', bytes: 1,
  }));
  assert.throws(() => promo.assertMedia(app, candidate, null), /promo_video_count_exceeded/);
});

test('refs, revisiones y bindings no pueden cruzar tenants', () => {
  const siteA = record('site00000000001', { public_slug: 'site-a' });
  const siteB = record('site00000000002', { public_slug: 'site-b' });
  const revisionA = record('revision0000001', { site: siteA.id });
  const assetA = record('asset0000000001', { site: siteA.id, status: 'ready', kind: 'image' });
  const assetB = record('asset0000000002', { site: siteB.id, status: 'ready', kind: 'image' });
  const app = appFixture({
    promo_sites: [siteA, siteB],
    promo_revisions: [revisionA],
    promo_media_assets: [assetA, assetB],
    promo_revision_media_refs: [],
  });

  assert.equal(promo.assertTenantIsolation(app, 'promo_revision_media_refs', record('ref000000000001', {
    site: siteA.id,
    revision: revisionA.id,
    media_asset: assetA.id,
    use_key: 'hero_main',
  })), true);
  assert.throws(
    () => promo.assertTenantIsolation(app, 'promo_revision_media_refs', record('ref000000000002', {
      site: siteA.id,
      revision: revisionA.id,
      media_asset: assetB.id,
      use_key: 'hero_other',
    })),
    /cross_promo_site_relation/,
  );
});

test('slot platform no acepta binding y custom exige primary activo del mismo site', () => {
  const site = record('site00000000001', { public_slug: 'aladdins-carpet' });
  const revision = record('revision0000001', { site: site.id });
  const binding = record('binding00000001', {
    site: site.id, status: 'active', role: 'primary', is_current: true,
  });
  const app = appFixture({
    promo_sites: [site], promo_revisions: [revision], promo_domain_bindings: [binding],
  });
  assert.equal(promo.assertPromoRecord(app, 'promo_publication_slots', record('slot00000000001', {
    site: site.id,
    state: 'active',
    published_revision: revision.id,
    canonical_mode: 'custom',
    primary_binding: binding.id,
    generation: 1,
  }), 'create'), true);
  assert.throws(
    () => promo.assertPromoRecord(app, 'promo_publication_slots', record('slot00000000002', {
      site: site.id,
      state: 'active',
      published_revision: revision.id,
      canonical_mode: 'platform',
      primary_binding: binding.id,
      generation: 1,
    }), 'create'),
    /promo_platform_binding_forbidden/,
  );
});

test('revisiones y eventos append-only rechazan update/delete', () => {
  const original = record('revision0000001', { site: 'site00000000001' });
  const updated = record(original.id, { site: 'site00000000001' }, original);
  assert.throws(
    () => promo.assertPromoRecord(appFixture(), 'promo_revisions', updated, 'update'),
    /immutable_promo_record/,
  );
  assert.throws(() => promo.assertPromoDelete('promo_revisions'), /promo_delete_requires_orchestrator/);
  assert.throws(() => promo.assertPromoDelete('promo_media_assets'), /promo_delete_requires_orchestrator/);
  assert.throws(() => promo.assertPromoDelete('promo_sites'), /promo_delete_requires_orchestrator/);
});

test('auditoría acepta snapshots mínimos y rechaza secretos', () => {
  assert.equal(promo.assertActorSnapshot({
    id: 'user00000000001', name: 'Operador', role: 'master_admin',
  }, 'actor_snapshot_json'), true);
  assert.throws(
    () => promo.assertActorSnapshot({
      id: 'user00000000001', name: 'Operador', role: 'master_admin', access_token: 'secret-value',
    }, 'actor_snapshot_json'),
    /invalid_promo_actor_snapshot/,
  );

  const site = record('site00000000001', { public_slug: 'aladdins-carpet' });
  const app = appFixture({ promo_sites: [site] });
  assert.throws(
    () => promo.assertPromoRecord(app, 'promo_audit_events', record('audit0000000001', {
      site: site.id,
      scope_key: `site:${site.id}`,
      actor_snapshot_json: { id: 'user00000000001', name: 'Operador', role: 'master_admin' },
      changed_paths_json: ['/domain/status'],
      previous_values_json: { password: 'no-debe-guardarse' },
      new_values_json: { status: 'active' },
    }), 'create'),
    /sensitive_promo_audit_field/,
  );
});
