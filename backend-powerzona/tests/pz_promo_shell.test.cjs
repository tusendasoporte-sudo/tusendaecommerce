const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shell = require('../pb_hooks/pz_promo_shell_lib.js');
const shellApi = require('../pb_hooks/pz_promo_shell_api_lib.js');
const pubcfg = require('../pb_hooks/pz_promo_pubcfg_lib.js');

function localizedFixture(locale = 'es') {
  const option = (value, label) => ({
    locale: value,
    label,
    aria_label: `Cambiar a ${label}`,
    href: `/api/pz/promo/public/v1/sites/demo-promo/locales/${value}`,
    active: value === locale,
  });
  return {
    ok: true,
    contract: 'promo.public.localized.v1',
    site: { public_slug: 'demo-promo' },
    system: { catalog_version: 'promo.system.v1', messages: {} },
    locale: {
      effective: locale,
      default: 'es',
      source: 'url',
      lang: locale,
      direction: 'ltr',
      canonical_path: `/api/pz/promo/public/v1/sites/demo-promo/locales/${locale}`,
    },
    selector: { label: 'Idioma', options: [option('en', 'English'), option('es', 'Español')] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    section_order: [], sections: [], media: [], contact: {}, content: {}, adapters: {},
  };
}

function publishedDocument() {
  const content = (locale) => ({
    identity: { name: locale === 'es' ? 'Negocio demo' : 'Demo business', summary: '' },
    navigation: { 'hero-main': locale === 'es' ? 'Inicio' : 'Home' },
    sections: { 'hero-main': { heading: locale === 'es' ? 'Bienvenidos' : 'Welcome', summary: '' } },
    contact: {}, media_alt: {}, seo: { title: 'Demo', description: 'Descripción pública' },
  });
  return {
    contract: 'promo.site.v1', system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'demo-business' },
    section_order: ['hero-main'],
    sections: [{
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    }],
    media_refs: {},
    contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: { en: content('en'), es: content('es') },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

test('SHELL materializa rutas públicas localized sin reutilizar paths API de I18N', () => {
  assert.equal(shell.platformPath('demo-promo'), '/promo/demo-promo');
  assert.equal(shell.platformPath('demo-promo', 'es'), '/promo/demo-promo/es');
  assert.equal(shell.customPath(), '/');
  assert.equal(shell.customPath('en'), '/en');
  const platform = shell.shellResponse(localizedFixture('es'), { source: 'platform', action: 'serve' });
  assert.equal(platform.contract, 'promo.public.shell.v1');
  assert.equal(platform.profile.locale.canonical_path, '/promo/demo-promo/es');
  assert.deepEqual(platform.profile.selector.options.map((item) => item.href), [
    '/promo/demo-promo/en', '/promo/demo-promo/es',
  ]);
  assert.doesNotMatch(JSON.stringify(platform), /\/api\/pz\/promo\/public\/v1\/sites/);
});

test('SHELL construye redirects custom exclusivamente desde el primary validado', () => {
  const redirected = shell.shellResponse(localizedFixture('en'), {
    source: 'custom', action: 'redirect', canonicalHostname: 'primary.example.test',
  });
  assert.deepEqual(redirected, {
    ok: true,
    contract: 'promo.public.shell.v1',
    route: { source: 'custom', action: 'redirect', location: 'https://primary.example.test/en' },
  });
  assert.throws(
    () => shell.shellResponse(localizedFixture(), {
      source: 'custom', action: 'redirect', canonicalHostname: 'primary.example.test/attacker',
    }),
    shell.PromoShellError,
  );
  assert.throws(() => shell.routeRedirect('https://user@primary.example.test/'), shell.PromoShellError);
});

test('SHELL localiza una sola proyección publicada y nunca mezcla el otro locale', () => {
  const projection = pubcfg.projectPublicDocument(publishedDocument(), 'demo-promo', []);
  const localized = shellApi.localizeProjection(projection, {
    explicitLocale: 'es', preferenceLocale: '', acceptLanguage: '',
  });
  assert.equal(localized.locale.effective, 'es');
  assert.equal(localized.content.identity.name, 'Negocio demo');
  assert.equal(JSON.stringify(localized).includes('Demo business'), false);
  assert.throws(
    () => shellApi.localizeProjection(projection, {
      explicitLocale: 'fr', preferenceLocale: '', acceptLanguage: '',
    }),
    /promo_locale_not_published/,
  );
});

test('SHELL registra solo GET públicos acotados y consume DOM/PUBCFG/I18N server-side', () => {
  const hook = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_shell.pb.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_shell_api_lib.js'), 'utf8');
  assert.equal((hook.match(/routerAdd\(/g) || []).length, 5);
  assert.equal((hook.match(/"GET"/g) || []).length, 5);
  assert.match(hook, /shell\/sites\/\{publicSlug\}/);
  assert.match(hook, /shell\/host/);
  assert.match(hook, /shell\/stores\/\{storeSlug\}/);
  assert.doesNotMatch(hook, /requireAuth|POST|PATCH|DELETE/);
  assert.match(api, /domain\.resolveHostContext/);
  assert.match(api, /pubcfgApi\.resolvePublicProjectionForSite/);
  assert.match(api, /i18n\.localizePublicProjection/);
  assert.doesNotMatch(api, /promo_draft_documents|candidate|latest|Cloudflare|Coolify|products|categories|orders/);
});

test('SHELL conserva contrato no-store, locale y errores públicos sin enumeración', () => {
  const calls = [];
  const headers = new Map();
  const event = {
    response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
  };
  shellApi.setHeaders(event, { locale: { effective: 'es' } }, true, true);
  assert.equal(headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
  assert.equal(headers.get('Vary'), 'Host, Accept-Language, Cookie');
  assert.deepEqual(calls, []);
});

test('SHELL toma la autoridad del request HTTP y no de headers reconstruidos', () => {
  assert.deepEqual(shellApi.authoritativeRequestHeaders(
    { request: { host: 'primary.example.test' } },
    { headers: { Host: 'loopback.invalid', 'Accept-Language': 'es' } },
  ), { Host: 'primary.example.test', 'Accept-Language': 'es' });
  assert.throws(
    () => shellApi.authoritativeRequestHeaders({ request: { host: '' } }, { headers: {} }),
    /promo_host_unavailable/,
  );
});

test('guard Commerce solo hace fallthrough si no existe sitio Promo', () => {
  const record = (value) => ({ ...value, getString(key) { return this[key] || ''; } });
  const store = record({ id: 'storeaaaaaaaaaa', slug: 'promo-store', status: 'active' });
  const site = record({ id: 'siteaaaaaaaaaaa', store: store.id, public_slug: 'promo-site', status: 'paused' });
  const app = {
    findRecordsByFilter(collection) {
      if (collection === 'stores') return [store];
      if (collection === 'promo_sites') return this.withPromo ? [site] : [];
      return [];
    },
    withPromo: false,
  };
  assert.throws(
    () => shellApi.resolveCommerceBridge(app, 'promo-store'),
    (error) => error.status === 404,
  );
  app.withPromo = true;
  assert.throws(
    () => shellApi.resolveCommerceBridge(app, 'promo-store'),
    (error) => error.status === 503,
  );
});
