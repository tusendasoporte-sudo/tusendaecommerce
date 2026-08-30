'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const footer = require('../pb_hooks/pz_promo_footer_lib.js');
const i18n = require('../pb_hooks/pz_promo_i18n_lib.js');
const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');

function localized(locale) {
  return {
    identity: { name: locale === 'es' ? 'Negocio demo' : 'Demo business', summary: '' },
    navigation: {
      'hero-main': locale === 'es' ? 'Inicio' : 'Home',
      'footer-main': locale === 'es' ? 'Pie del sitio' : 'Site footer',
    },
    sections: {
      'hero-main': { heading: locale === 'es' ? 'Bienvenidos' : 'Welcome', summary: '' },
      'footer-main': {
        heading: locale === 'es' ? 'Sigamos conectados' : 'Stay connected',
        summary: locale === 'es' ? 'Accesos seguros y oficiales.' : 'Safe, official links.',
        text: locale === 'es' ? 'Atención con cita previa.' : 'Visits by appointment.',
      },
    },
    contact: {},
    media_alt: {},
    seo: { title: 'Demo', description: locale === 'es' ? 'Descripción pública' : 'Public description' },
  };
}

function documentFixture() {
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'demo-business' },
    section_order: ['hero-main', 'footer-main'],
    sections: [
      {
        key: 'hero-main', type: 'hero', variant: 'default', visible: true,
        config: { media_use_key: '', action_key: '' }, media_use_keys: [],
      },
      {
        key: 'footer-main', type: 'footer', variant: 'default', visible: true,
        config: {
          navigation_section_keys: ['hero-main'],
          social_profiles: [
            { network: 'instagram', handle: 'demo.business' },
            { network: 'youtube', handle: 'demo-business' },
          ],
        },
        media_use_keys: [],
      },
    ],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: { en: localized('en'), es: localized('es') },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

test('FOOTER valida enlaces internos y perfiles sociales tipados sin URL libre', () => {
  assert.deepEqual(footer.normalizeFooterConfig({}), {
    navigation_section_keys: [], social_profiles: [], contrast_mode: 'auto',
    title_color: '#ffffff', body_color: '#e2e8f0', accent_color: '#d8b25c',
  });
  assert.deepEqual(footer.normalizeFooterConfig({
    navigation_section_keys: ['hero-main'],
    social_profiles: [{ network: 'linkedin', handle: 'demo-business' }],
  }), {
    navigation_section_keys: ['hero-main'],
    social_profiles: [{ network: 'linkedin', handle: 'demo-business' }],
    contrast_mode: 'auto',
    title_color: '#ffffff', body_color: '#e2e8f0', accent_color: '#d8b25c',
  });
  assert.deepEqual(footer.normalizeFooterConfig({
    contrast_mode: 'custom', title_color: '#fafafa', body_color: '#d1d5db', accent_color: '#f59e0b',
  }), {
    navigation_section_keys: [], social_profiles: [], contrast_mode: 'custom',
    title_color: '#fafafa', body_color: '#d1d5db', accent_color: '#f59e0b',
  });
  assert.equal(footer.socialHref('instagram', 'demo.business'), 'https://www.instagram.com/demo.business/');
  assert.throws(() => footer.normalizeFooterConfig({ social_profiles: [
    { network: 'instagram', handle: 'https://attacker.test/demo' },
  ] }), footer.PromoFooterError);
  assert.throws(() => footer.normalizeFooterConfig({ social_profiles: [
    { network: 'unknown', handle: 'demo' },
  ] }), footer.PromoFooterError);
  assert.throws(() => footer.normalizeFooterConfig({ admin_url: '/admin' }), footer.PromoFooterError);
  assert.throws(() => footer.normalizeFooterConfig({ contrast_mode: 'unsafe-css' }), footer.PromoFooterError);
  assert.throws(() => footer.normalizeFooterConfig({ title_color: 'url(https://attacker.test)' }), footer.PromoFooterError);
});

test('PUBCFG conserva config footer compatible y bloquea targets ocultos o Commerce', () => {
  const document = documentFixture();
  assert.doesNotThrow(() => pubcfg.validatePromoDocument(document, { publicRevision: true }));
  const legacy = documentFixture();
  legacy.sections[1].config = {};
  assert.doesNotThrow(() => pubcfg.validatePromoDocument(legacy, { publicRevision: true }));
  const upgraded = pubcfg.upgradePromoDocument(legacy);
  assert.deepEqual(upgraded.sections[1].config, {
    navigation_section_keys: [], social_profiles: [], contrast_mode: 'auto',
    title_color: '#ffffff', body_color: '#e2e8f0', accent_color: '#d8b25c',
  });

  const hidden = documentFixture();
  hidden.sections[0].visible = false;
  assert.throws(() => pubcfg.validatePromoDocument(hidden, { publicRevision: true }), /invalid_promo_document/);
  const commerce = documentFixture();
  commerce.sections[1].config.navigation_section_keys = ['checkout'];
  assert.throws(() => pubcfg.validatePromoDocument(commerce), /invalid_promo_document/);
});

test('FOOTER compila locale exacto, orígenes allowlisted y branding reservado', () => {
  const document = documentFixture();
  const projection = pubcfg.projectPublicDocument(document, 'demo-promo', []);
  const es = footer.attachPublicFooter(i18n.localizePublicProjection(projection, {
    effective: 'es', source: 'url',
  }));
  const compiled = es.footer.sections[0];
  assert.equal(es.footer.contract, 'promo.footer.v1');
  assert.deepEqual(compiled.navigation_links, [{
    section_key: 'hero-main', label: 'Inicio', href: '#promo-section-hero-main',
  }]);
  assert.deepEqual(compiled.social_links.map((link) => [link.network, link.aria_label, link.href]), [
    ['instagram', 'Visitar Instagram de Negocio demo', 'https://www.instagram.com/demo.business/'],
    ['youtube', 'Visitar YouTube de Negocio demo', 'https://www.youtube.com/@demo-business'],
  ]);
  assert.deepEqual(compiled.branding, { label: 'Presencia promocional en', name: 'Tu Senda 84' });
  const serialized = JSON.stringify(es);
  for (const forbidden of [
    'content_by_locale', '"/admin', '"/master', '"/checkout', '"cart"', '"price"', '"orders"',
  ]) assert.equal(serialized.includes(forbidden), false, `footer público no contiene ${forbidden}`);

  const en = footer.attachPublicFooter(i18n.localizePublicProjection(projection, {
    effective: 'en', source: 'url',
  }));
  assert.equal(en.footer.sections[0].navigation_links[0].label, 'Home');
  assert.equal(en.footer.sections[0].social_links[0].aria_label, 'Visit Demo business on Instagram');
});

test('SHELL adjunta FOOTER después del locale publicado sin readers ni endpoints paralelos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_shell_api_lib.js'), 'utf8');
  assert.match(source, /promoFooter\.attachPublicFooter\([\s\S]*localizeProjection/);
  assert.doesNotMatch(source, /footer.*findRecordsByFilter|promo_footer_records|products|categories|orders/);
});
