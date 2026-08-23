'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const contract = require('../pb_hooks/pz_promo_pubcfg_lib.js');
const api = require('../pb_hooks/pz_promo_pubcfg_api_lib.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

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

test('PUBCFG registra una ruta pública por slug y dos POST privados autenticados', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_pubcfg.pb.js'), 'utf8');
  const routes = [...source.matchAll(/"(\/api\/pz\/promo\/[^\"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    '/api/pz/promo/public/v1/sites/{publicSlug}',
    '/api/pz/promo/private/v1/draft/read',
    '/api/pz/promo/private/v1/draft/update',
  ]);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 2);
  assert.equal((source.match(/\$apis\.bodyLimit\(/g) || []).length, 3);
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

test('payloads privados versionados rechazan tenant, revisión, filters y campos adicionales', () => {
  assert.equal(api.parseDraftRead({ contract: 'promo.draft.read.v1' }), true);
  assert.equal(api.parseDraftRead({ contract: 'promo.draft.read.v1', store_id: 'storeaaaaaaaaaa' }), false);
  const document = emptyDraft();
  assert.deepEqual(api.parseDraftUpdate({
    contract: 'promo.draft.update.v1', expected_version: 2, document,
  }), { expectedVersion: 2, document });
  for (const injected of ['store_id', 'site_id', 'revision_id', 'filter', 'sort', 'fields', 'expand']) {
    assert.equal(api.parseDraftUpdate({
      contract: 'promo.draft.update.v1', expected_version: 2, document, [injected]: 'attacker',
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

test('errores privados mantienen códigos saneados y no reflejan inputs desconocidos', () => {
  assert.equal(api.privateStatus({ code: 'invalid_payload' }), 400);
  assert.equal(api.privateStatus({ code: 'promo_permission_denied' }), 403);
  assert.equal(api.privateStatus({ code: 'promo_not_found' }), 404);
  assert.equal(api.privateStatus({ code: 'promo_draft_conflict' }), 409);
  assert.equal(api.privateStatus({ code: 'attacker-secret-value' }), 503);
  assert.equal(api.errorCode({ code: 'attacker-secret-value' }), 'promo_pubcfg_unavailable');
});
