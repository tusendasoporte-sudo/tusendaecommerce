'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const i18n = require('../pb_hooks/pz_promo_i18n_lib.js');
const api = require('../pb_hooks/pz_promo_i18n_api_lib.js');

function publicProjection() {
  return {
    ok: true,
    contract: 'promo.public.projection.v1',
    site: { public_slug: 'aladdin-carpet' },
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default',
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    }],
    media: [],
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: {
      en: {
        identity: { name: "Aladdin's Carpet", summary: 'Specialized restoration' },
        navigation: { 'hero-main': 'Home' },
        sections: { 'hero-main': { heading: 'Carpets with history', summary: 'Specialized care' } },
        contact: {}, media_alt: {},
        seo: { title: "Aladdin's Carpet", description: 'Professional carpet restoration' },
      },
      es: {
        identity: { name: "Aladdin's Carpet", summary: 'Restauración especializada' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: 'Alfombras con historia', summary: 'Cuidado especializado' } },
        contact: {}, media_alt: {},
        seo: { title: "Aladdin's Carpet", description: 'Restauración profesional de alfombras' },
      },
    },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

test('catálogo general v1 es completo, versionado y separado por locale exacto', () => {
  assert.deepEqual(Object.keys(i18n.SYSTEM_CATALOGS), ['promo.system.v1']);
  for (const locale of ['en', 'es']) {
    const catalog = i18n.resolveSystemCatalog('promo.system.v1', locale);
    assert.deepEqual(Object.keys(catalog.messages).sort(), i18n.SYSTEM_MESSAGE_KEYS.slice().sort());
    assert.ok(catalog.native_name);
    assert.ok(['ltr', 'rtl'].includes(catalog.direction));
  }
  assert.equal(i18n.resolveSystemCatalog('promo.system.v1', 'es').messages['contact.request_estimate'], 'Solicitar estimado');
  assert.throws(() => i18n.resolveSystemCatalog('promo.system.v1', 'fr'), /promo_system_locale_unavailable/);
  assert.throws(() => i18n.resolveSystemCatalog('promo.system.v9', 'es'), /promo_system_locale_unavailable/);
});

test('negociación respeta URL, preferencia, Accept-Language y default en ese orden', () => {
  const base = { published: ['en', 'es'], defaultLocale: 'es' };
  assert.deepEqual(i18n.negotiateLocale({
    ...base, explicitLocale: 'EN', preferenceLocale: 'es', acceptLanguage: 'es',
  }), { effective: 'en', source: 'url' });
  assert.deepEqual(i18n.negotiateLocale({
    ...base, preferenceLocale: 'en', acceptLanguage: 'es',
  }), { effective: 'en', source: 'preference' });
  assert.deepEqual(i18n.negotiateLocale({
    ...base, preferenceLocale: 'fr', acceptLanguage: 'en-US;q=0.9, es;q=0.8',
  }), { effective: 'en', source: 'accept-language' });
  assert.deepEqual(i18n.negotiateLocale({
    ...base, preferenceLocale: 'fr', acceptLanguage: 'de, *;q=0.5',
  }), { effective: 'es', source: 'default' });
});

test('locale explícito inválido o no publicado falla cerrado sin fallback', () => {
  const base = { published: ['en', 'es'], defaultLocale: 'es' };
  assert.throws(() => i18n.negotiateLocale({ ...base, explicitLocale: 'fr' }), /promo_locale_not_published/);
  assert.throws(() => i18n.negotiateLocale({ ...base, explicitLocale: '../es' }), /invalid_promo_locale/);
  assert.deepEqual(i18n.negotiateLocale({
    ...base, preferenceLocale: '../en', acceptLanguage: 'malformed;q=2',
  }), { effective: 'es', source: 'default' });
});

test('Accept-Language aplica calidad, exact match y fallback completo por idioma', () => {
  assert.deepEqual(i18n.parseAcceptLanguage('es;q=0.4, en-US;q=0.9, en;q=0, *;q=1'), [
    { locale: 'en-US', quality: 0.9, order: 1 },
    { locale: 'es', quality: 0.4, order: 0 },
  ]);
  assert.equal(i18n.matchAcceptLanguage(
    i18n.parseAcceptLanguage('en-GB;q=0.9, es;q=0.8'), ['en-US', 'es'], 'es',
  ), 'en-US');
  assert.equal(i18n.matchAcceptLanguage(
    i18n.parseAcceptLanguage('es-MX'), ['es', 'es-US'], 'es-US',
  ), 'es');
});

test('proyección localizada carga un locale, catálogo y selector allowlisted sin mezclar contenido', () => {
  const localized = i18n.localizePublicProjection(publicProjection(), { effective: 'en', source: 'url' });
  assert.equal(localized.contract, 'promo.public.localized.v1');
  assert.deepEqual(localized.locale, {
    effective: 'en', default: 'es', source: 'url', lang: 'en', direction: 'ltr',
    canonical_path: '/api/pz/promo/public/v1/sites/aladdin-carpet/locales/en',
  });
  assert.equal(localized.content.identity.summary, 'Specialized restoration');
  assert.equal(localized.system.messages['navigation.home'], 'Home');
  assert.equal(localized.selector.enabled, false);
  assert.deepEqual(localized.selector.options.map((option) => [option.locale, option.active]), [
    ['en', true], ['es', false],
  ]);
  assert.equal(localized.selector.options[1].href, '/api/pz/promo/public/v1/sites/aladdin-carpet/locales/es');
  assert.equal(localized.selector.options[1].aria_label, 'View this site in Español');
  const serialized = JSON.stringify(localized);
  for (const forbidden of [
    'content_by_locale', 'Restauración especializada', 'phone_e164', 'store_id', 'site_id',
    'revision_id', 'tokenKey', 'price', 'currency', 'stock', 'cart', 'checkout',
  ]) assert.equal(serialized.includes(forbidden), false, `localized no contiene ${forbidden}`);
});

test('selector público solo se proyecta habilitado por configuración Master explícita', () => {
  const projection = publicProjection();
  const hidden = i18n.localizePublicProjection(projection, { effective: 'es', source: 'default' });
  const visible = i18n.localizePublicProjection(
    projection,
    { effective: 'es', source: 'default' },
    { languageSelectorEnabled: true },
  );
  assert.equal(hidden.selector.enabled, false);
  assert.equal(visible.selector.enabled, true);
  assert.deepEqual(visible.selector.options.map((option) => option.locale), ['en', 'es']);
});

test('catálogo ausente en cualquier locale publicado invalida selector completo', () => {
  const projection = publicProjection();
  projection.locales = { default: 'es', published: ['es', 'fr'] };
  projection.content_by_locale = { es: projection.content_by_locale.es, fr: projection.content_by_locale.en };
  assert.throws(
    () => i18n.localizePublicProjection(projection, { effective: 'es', source: 'default' }),
    /promo_system_locale_unavailable/,
  );
});

test('cookie de preferencia es exacta, acotada y ambigüedad se ignora', () => {
  assert.equal(api.localePreferenceFromCookie('other=x; pz_promo_locale=en; theme=dark'), 'en');
  assert.equal(api.localePreferenceFromCookie('pz_promo_locale=es-US'), 'es-US');
  assert.equal(api.localePreferenceFromCookie('pz_promo_locale=en; pz_promo_locale=es'), '');
  assert.equal(api.localePreferenceFromCookie('pz_promo_locale=%E0%A4%A'), '');
  assert.equal(api.localePreferenceFromCookie(`pz_promo_locale=${'a'.repeat(81)}`), '');
});

test('I18N registra entrada neutral y locale explícito sin auth, query o CRUD', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_i18n.pb.js'), 'utf8');
  const routes = [...source.matchAll(/"(\/api\/pz\/promo\/[^\"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(routes, [
    '/api/pz/promo/public/v1/sites/{publicSlug}/locales',
    '/api/pz/promo/public/v1/sites/{publicSlug}/locales/{locale}',
  ]);
  assert.equal((source.match(/\$apis\.bodyLimit\(0\)/g) || []).length, 2);
  assert.doesNotMatch(source, /requireAuth|POST|PATCH|DELETE|filter|sort|fields|expand|realtime/);
});

test('actualizaciones localizadas reutilizan el writer AUDIT central sin almacenamiento paralelo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_pubcfg_api_lib.js'), 'utf8');
  assert.match(source, /action: "promo\.localization\.update"/);
  assert.match(source, /promoAudit\.createPromoAudit\(app, decision/);
  assert.doesNotMatch(source, /new Record\([^\n]*promo_audit_events/);
});
