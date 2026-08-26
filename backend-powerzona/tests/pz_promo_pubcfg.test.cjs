'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contract = require('../pb_hooks/pz_promo_pubcfg_lib.js');
const api = require('../pb_hooks/pz_promo_pubcfg_api_lib.js');
const theme = require('../pb_hooks/pz_promo_theme_lib.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function record(id, values = {}) {
  return { id, ...values };
}

function emptyDraft() {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: '', published: [] },
    theme: { theme_id: '', version: '', tokens: {} },
    identity: { public_business_key: '' },
    section_order: [],
    sections: [],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {},
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function publishedDocument() {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'aladdin-carpet' },
    section_order: ['hero-main', 'contact-main'],
    sections: [
      {
        key: 'hero-main', type: 'hero', variant: 'default', visible: true,
        config: { media_use_key: '', action_key: 'call-main' }, media_use_keys: [],
      },
      {
        key: 'contact-main', type: 'contact', variant: 'default', visible: true,
        config: { action_keys: ['call-main'] }, media_use_keys: [],
      },
    ],
    media_refs: {},
    contact: {
      enabled: true,
      primary_action_key: 'call-main',
      secondary_action_keys: [],
      actions: [{ key: 'call-main', type: 'phone', enabled: true, config: { phone_e164: '+13055550184' } }],
    },
    content_by_locale: {
      es: {
        identity: { name: "Aladdin's Carpet", summary: 'Restauración artesanal' },
        navigation: { 'hero-main': 'Inicio', 'contact-main': 'Contacto' },
        sections: {
          'hero-main': { heading: 'Alfombras con historia', summary: 'Cuidado especializado' },
          'contact-main': { heading: 'Conversemos', summary: 'Solicita un estimado' },
        },
        contact: { 'call-main': { label: 'Llamar', aria_label: 'Llamar a la tienda', message: '' } },
        media_alt: {},
        seo: { title: "Aladdin's Carpet", description: 'Restauración profesional de alfombras' },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function customProjectionFixture() {
  const ids = {
    site: 'siteaaaaaaaaaaa', store: 'storeaaaaaaaaaa', entitlement: 'entaaaaaaaaaaaa',
    slot: 'slotaaaaaaaaaaa', revision: 'revaaaaaaaaaaaa', theme: 'themeaaaaaaaaaa',
    binding: 'bindprimaryaaaa',
  };
  const document = contract.upgradePromoDocument(publishedDocument());
  const site = record(ids.site, {
    store: ids.store, public_slug: 'aladdin-carpet', status: 'active', contract_version: 1,
  });
  const collections = {
    stores: [record(ids.store, { status: 'active' })],
    promo_sites: [site],
    promo_site_entitlements: [record(ids.entitlement, {
      site: ids.site, source: 'contract', promo_site_enabled: true, custom_domain_enabled: true,
      multilanguage_enabled: true, video_enabled: false, landing_qr_bridge_enabled: false,
      max_services: 50, max_gallery_assets: 24, max_locales: 10, max_videos: 3,
      max_storage_bytes: 262144000,
    })],
    promo_publication_slots: [record(ids.slot, {
      site: ids.site, state: 'active', canonical_mode: 'custom', primary_binding: ids.binding,
      published_revision: '', generation: 4,
    })],
    promo_revisions: [],
    promo_theme_releases: [record(ids.theme, {
      theme_id: 'promo.black-gold', version: '1.0.0', status: 'approved',
      renderer_key: theme.BLACK_GOLD_MANIFEST.renderer_key,
      contract_version: theme.BLACK_GOLD_MANIFEST.contract_version,
      manifest_sha256: theme.BLACK_GOLD_MANIFEST_SHA256,
      token_schema_sha256: theme.BLACK_GOLD_TOKEN_SCHEMA_SHA256,
    })],
    promo_domain_bindings: [record(ids.binding, {
      site: ids.site, role: 'primary', status: 'active', is_current: true,
    })],
    promo_draft_documents: [record('draftaaaaaaaaaa', {
      site: ids.site, schema_version: 1, version: 7, document_json: document,
      document_sha256: contract.digestDocument(document, sha256),
    })],
    promo_media_assets: [], promo_revision_media_refs: [], promo_audit_events: [],
  };
  const app = {
    findCollectionByNameOrId(name) {
      if (!api.PRIVATE_COLLECTIONS.includes(name)) throw new Error('not_found');
      return { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    },
    findRecordById(collection, id) {
      const found = (collections[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, sort, limit, offset, params = {}) {
      let rows = (collections[collection] || []).slice();
      if (Object.hasOwn(params, 'site')) rows = rows.filter((item) => item.site === params.site);
      if (Object.hasOwn(params, 'revision')) rows = rows.filter((item) => item.revision === params.revision);
      return rows.slice(0, limit);
    },
  };
  return { app, document, ids, site };
}

test('PUBCFG registra una ruta pública por slug y dos POST privados autenticados', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_pubcfg.pb.js'), 'utf8');
  const routes = [...source.matchAll(/"(\/api\/pz\/promo\/[^\"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    '/api/pz/promo/public/v1/sites/{publicSlug}',
    '/api/pz/promo/private/v1/draft/read',
    '/api/pz/promo/private/v1/draft/update',
    '/api/pz/promo/private/v1/live/read',
    '/api/pz/promo/private/v1/live/update',
  ]);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 4);
  assert.equal((source.match(/\$apis\.bodyLimit\(/g) || []).length, 5);
  assert.doesNotMatch(source, /PATCH|DELETE|filter|expand|realtime/);
});

test('contrato draft v1 es exacto, determinista y acepta workspace incompleto seguro', () => {
  const draft = emptyDraft();
  assert.deepEqual(contract.validatePromoDocument(draft), draft);
  assert.equal(contract.digestDocument(draft, sha256), sha256(contract.canonicalJson(draft)));
  const reordered = Object.fromEntries(Object.entries(draft).reverse());
  assert.equal(contract.digestDocument(reordered, sha256), contract.digestDocument(draft, sha256));
  assert.throws(() => contract.validatePromoDocument({ ...draft, store_id: 'storeaaaaaaaaaa' }), /invalid_promo_document/);
  assert.throws(() => contract.validatePromoDocument({ ...draft, price: 10 }), /invalid_promo_document/);
  assert.throws(() => contract.validatePromoDocument({ ...draft, system_catalog_version: 'promo.unknown.v9' }), /unknown_promo_contract/);
});

test('contrato vivo v2 migra v1 sin snapshots y añade slogan, QR y enlaces de galería', () => {
  const live = contract.upgradePromoDocument(emptyDraft());
  assert.equal(live.contract, 'promo.site.v2');
  assert.equal(live.contact.qr_media_use_key, '');
  assert.equal(live.contact.logo_media_use_key, '');
  assert.deepEqual(contract.validatePromoDocument(live), live);
  assert.equal(contract.LIVE_READ_CONTRACT, 'promo.live.read.v1');
  assert.equal(contract.LIVE_UPDATE_CONTRACT, 'promo.live.update.v1');
});

test('lector vivo actualiza campos aditivos después de verificar el hash almacenado', () => {
  const previousLive = contract.upgradePromoDocument(emptyDraft());
  delete previousLive.contact.logo_media_use_key;
  const stored = record('draftaaaaaaaaaa', {
    schema_version: 1,
    version: 7,
    document_json: previousLive,
    document_sha256: contract.digestDocument(previousLive, sha256),
  });
  const previousSecurity = global.$security;
  global.$security = { sha256 };
  try {
    const upgraded = api.validatedStoredLive(stored);
    assert.equal(upgraded.contract, 'promo.site.v2');
    assert.equal(upgraded.contact.logo_media_use_key, '');
    assert.equal(upgraded.contact.qr_media_use_key, '');
    assert.deepEqual(contract.validatePromoDocument(upgraded), upgraded);
  } finally {
    if (previousSecurity === undefined) delete global.$security;
    else global.$security = previousSecurity;
  }
});

test('modelo vivo enlaza servicios con galerías múltiples, deriva destacados y admite slogan y QR', () => {
  const live = contract.upgradePromoDocument(publishedDocument());
  live.section_order = ['hero-main', 'services-main', 'featured-main', 'gallery-rugs', 'contact-main'];
  live.sections = [
    live.sections[0],
    {
      key: 'services-main', type: 'services', variant: 'default', visible: true,
      config: { item_keys: ['restoration'], gallery_keys: ['gallery-rugs'] }, media_use_keys: [],
    },
    {
      key: 'featured-main', type: 'featured_work', variant: 'default', visible: true,
      config: { item_keys: [] }, media_use_keys: [],
    },
    {
      key: 'gallery-rugs', type: 'gallery', variant: 'default', visible: true,
      config: {
        item_keys: ['silk-rug', 'wool-rug'],
        cover_media_use_key: 'gallery-cover',
        items: [
          { key: 'silk-rug', media_use_keys: ['gallery-cover'], featured: true, visible: true },
          { key: 'wool-rug', media_use_keys: ['gallery-wool'], featured: false, visible: true },
        ],
      },
      media_use_keys: ['gallery-cover', 'gallery-wool'],
    },
    live.sections[1],
  ];
  live.media_refs = {
    'gallery-cover': { asset_id: 'a'.repeat(15), purpose: 'gallery' },
    'gallery-wool': { asset_id: 'b'.repeat(15), purpose: 'gallery' },
    contact_qr: { asset_id: 'c'.repeat(15), purpose: 'qr' },
    business_logo: { asset_id: 'd'.repeat(15), purpose: 'logo' },
  };
  live.contact.qr_media_use_key = 'contact_qr';
  live.contact.logo_media_use_key = 'business_logo';
  live.content_by_locale.es.identity.slogan = 'Restauramos historias';
  live.content_by_locale.es.navigation = {
    'hero-main': 'Inicio', 'services-main': 'Servicios', 'featured-main': 'Destacados',
    'gallery-rugs': 'Galerías', 'contact-main': 'Contacto',
  };
  live.content_by_locale.es.sections = {
    'hero-main': live.content_by_locale.es.sections['hero-main'],
    'services-main': {
      heading: 'Servicios', summary: 'Elige el trabajo que necesitas',
      items: [{ key: 'restoration', name: 'Restauración', summary: 'Cuidado especializado', caption: '' }],
    },
    'featured-main': { heading: 'Trabajos destacados', summary: 'Selección desde las galerías' },
    'gallery-rugs': {
      heading: 'Alfombras', summary: 'Trabajos y productos',
      items: [
        { key: 'silk-rug', name: 'Alfombra de seda', summary: 'Restauración completa', caption: 'Antes y después' },
        { key: 'wool-rug', name: 'Alfombra de lana', summary: 'Limpieza profunda', caption: '' },
      ],
    },
    'contact-main': live.content_by_locale.es.sections['contact-main'],
  };
  live.content_by_locale.es.media_alt = {
    'gallery-cover': { alt: 'Alfombra de seda restaurada', decorative: false },
    'gallery-wool': { alt: 'Alfombra de lana limpia', decorative: false },
    contact_qr: { alt: 'Código QR de contacto', decorative: false },
    business_logo: { alt: "Logo de Aladdin's Carpet", decorative: false },
  };

  assert.deepEqual(contract.validatePromoDocument(live, { publicRevision: true }), live);
  assert.equal(live.sections.find((section) => section.type === 'featured_work').config.item_keys.length, 0);
  assert.equal(live.sections.find((section) => section.type === 'gallery').config.items[0].featured, true);

  const serviceWithDirectMedia = structuredClone(live);
  serviceWithDirectMedia.sections[1].media_use_keys = ['gallery-cover'];
  assert.throws(
    () => contract.validatePromoDocument(serviceWithDirectMedia, { publicRevision: true }),
    /invalid_promo_document/,
  );
  const missingLinkedGallery = structuredClone(live);
  missingLinkedGallery.sections[1].config.gallery_keys = ['missing-gallery'];
  assert.throws(
    () => contract.validatePromoDocument(missingLinkedGallery, { publicRevision: true }),
    /invalid_promo_document/,
  );
  const visibleWorkWithoutMedia = structuredClone(live);
  visibleWorkWithoutMedia.sections[3].config.items[1].media_use_keys = [];
  visibleWorkWithoutMedia.sections[3].media_use_keys = ['gallery-cover'];
  assert.throws(
    () => contract.validatePromoDocument(visibleWorkWithoutMedia, { publicRevision: true }),
    /incomplete_promo_locale/,
  );
});

test('contrato rechaza código, URLs, token keys, campos Commerce y tokens de tema aún no aprobados', () => {
  const base = publishedDocument();
  const attacks = [
    { ...base, content_by_locale: { es: { ...base.content_by_locale.es, identity: { name: '<script>alert(1)</script>' } } } },
    { ...base, content_by_locale: { es: { ...base.content_by_locale.es, seo: { title: 'Sitio', description: 'https://evil.test' } } } },
    { ...base, theme: { ...base.theme, tokens: { arbitrary_css: 'body{}' } } },
    { ...base, tokenKey: 'secret' },
    { ...base, sections: base.sections.map((section, index) => index ? section : { ...section, config: { ...section.config, stock: 4 } }) },
  ];
  attacks.forEach((value) => assert.throws(() => contract.validatePromoDocument(value, { publicRevision: true })));
});

test('revisión pública exige locale completo, referencias tipadas y CTA coherente', () => {
  const document = publishedDocument();
  assert.deepEqual(contract.validatePromoDocument(document, { publicRevision: true }), document);
  assert.throws(() => contract.validatePromoDocument({
    ...document,
    content_by_locale: { es: { ...document.content_by_locale.es, seo: { title: 'Falta descripción' } } },
  }, { publicRevision: true }), /incomplete_promo_locale/);
  assert.throws(() => contract.validatePromoDocument({
    ...document,
    contact: { ...document.contact, primary_action_key: 'other' },
  }, { publicRevision: true }), /invalid_promo_document/);
  assert.throws(() => contract.validatePromoDocument({
    ...document,
    media_refs: { hero_asset: { asset_id: 'assetbbbbbbbbbb', purpose: 'hero', url: 'https://evil.test' } },
  }, { publicRevision: true }));
});

test('cada sección sólo acepta medios con el propósito allowlisted', () => {
  const document = publishedDocument();
  document.sections[0].config.media_use_key = 'hero_main';
  document.sections[0].media_use_keys = ['hero_main'];
  document.media_refs = { hero_main: { asset_id: 'assetbbbbbbbbbb', purpose: 'hero' } };
  document.content_by_locale.es.media_alt = { hero_main: { alt: 'Taller artesanal', decorative: false } };
  assert.deepEqual(contract.validatePromoDocument(document, { publicRevision: true }), document);
  document.media_refs.hero_main.purpose = 'service';
  assert.throws(
    () => contract.validatePromoDocument(document, { publicRevision: true }),
    /invalid_promo_media_reference/,
  );
});

test('proyección pública se construye por allowlist y elimina destino, IDs y records privados', () => {
  const document = contract.validatePromoDocument(publishedDocument(), { publicRevision: true });
  const projection = contract.projectPublicDocument(document, 'aladdin-carpet', []);
  assert.equal(projection.contract, 'promo.public.projection.v1');
  assert.equal(projection.site.public_slug, 'aladdin-carpet');
  assert.deepEqual(projection.contact.actions, [{ key: 'call-main', type: 'phone', enabled: true }]);
  const serialized = JSON.stringify(projection);
  for (const forbidden of [
    'phone_e164', '+13055550184', 'public_business_key', 'snapshot_sha256', 'revision_id', 'store_id',
    'site_id', 'tokenKey', 'permissions', 'provider_reference', 'price', 'currency', 'stock', 'checkout',
  ]) assert.equal(serialized.includes(forbidden), false, `proyección no contiene ${forbidden}`);
});

test('lector PUBCFG interno admite custom solo con binding, generación y documento vivo exactos', () => {
  const { app, ids, site } = customProjectionFixture();
  const previousSecurity = global.$security;
  global.$security = { sha256 };
  try {
    const resolved = api.resolvePublicProjectionForSite(app, site, {
      canonicalMode: 'custom', primaryBindingId: ids.binding,
      expectedGeneration: 4,
    });
    assert.equal(resolved.projection.contract, 'promo.public.projection.v1');
    assert.equal(resolved.projection.site.public_slug, 'aladdin-carpet');
    for (const options of [
      { canonicalMode: 'custom', primaryBindingId: 'bindwrongaaaaaa', expectedGeneration: 4 },
      { canonicalMode: 'custom', primaryBindingId: ids.binding, expectedGeneration: 3 },
      { canonicalMode: 'platform' },
    ]) assert.throws(() => api.resolvePublicProjectionForSite(app, site, options));
  } finally {
    if (previousSecurity === undefined) delete global.$security;
    else global.$security = previousSecurity;
  }
});

test('payloads privados versionados rechazan tenant, revisión, filters y campos adicionales', () => {
  assert.equal(api.parseDraftRead({ contract: 'promo.live.read.v1' }), true);
  assert.equal(api.parseDraftRead({ contract: 'promo.draft.read.v1' }), true);
  assert.equal(api.parseDraftRead({ contract: 'promo.draft.read.v1', store_id: 'storeaaaaaaaaaa' }), false);
  const document = contract.upgradePromoDocument(emptyDraft());
  assert.deepEqual(api.parseDraftUpdate({
    contract: 'promo.live.update.v1', expected_version: 2, document,
  }), { expectedVersion: 2, document });
  for (const injected of ['store_id', 'site_id', 'revision_id', 'filter', 'sort', 'fields', 'expand']) {
    assert.equal(api.parseDraftUpdate({
      contract: 'promo.live.update.v1', expected_version: 2, document, [injected]: 'attacker',
    }), null);
  }
});

test('acciones derivadas preservan permisos granulares para tema, traducciones, contacto, rating y QR', () => {
  const previous = emptyDraft();
  const next = publishedDocument();
  assert.deepEqual(contract.changedActionKeys(previous, next, []), [
    'promo.content.manage',
    'promo.theme.select',
    'promo.contact.manage',
  ]);
  const multilanguage = structuredClone(next);
  multilanguage.locales.published = ['en', 'es'];
  multilanguage.content_by_locale = {
    en: structuredClone(next.content_by_locale.es),
    es: next.content_by_locale.es,
  };
  assert.ok(contract.changedActionKeys(next, multilanguage, []).includes('promo.translations.manage'));
  const withAdapters = structuredClone(next);
  withAdapters.adapters.store_rating.enabled = true;
  withAdapters.adapters.landing_qr_link.enabled = true;
  const actions = contract.changedActionKeys(next, withAdapters, []);
  assert.ok(actions.includes('promo.reviews.manage'));
  assert.ok(actions.includes('promo.landing_qr.bridge.manage'));
});

test('la validación multidioma no depende del orden de claves devuelto por JSON', () => {
  const document = publishedDocument();
  document.locales.published = ['en', 'es'];
  document.content_by_locale = {
    es: document.content_by_locale.es,
    en: structuredClone(document.content_by_locale.es),
  };
  assert.doesNotThrow(() => contract.validatePromoDocument(document, { publicRevision: true }));
});

test('errores privados mantienen códigos saneados y no reflejan inputs desconocidos', () => {
  assert.equal(api.privateStatus({ code: 'invalid_payload' }), 400);
  assert.equal(api.privateStatus({ code: 'promo_permission_denied' }), 403);
  assert.equal(api.privateStatus({ code: 'promo_not_found' }), 404);
  assert.equal(api.privateStatus({ code: 'promo_draft_conflict' }), 409);
  assert.equal(api.privateStatus({ code: 'attacker-secret-value' }), 503);
  assert.equal(api.errorCode({ code: 'attacker-secret-value' }), 'promo_pubcfg_unavailable');
});
