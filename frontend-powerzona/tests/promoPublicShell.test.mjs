import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  customPromoPublicPath,
  isPromoPlatformRequest,
  normalizePromoPublicShellResponse,
  PromoPublicShellError,
  promoHostEndpoint,
  promoPlatformEndpoint,
  readCustomHostPromoShell,
} from '../src/lib/promoPublicShell.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const messages = Object.fromEntries([
  'a11y.contact_action', 'a11y.language_selector', 'a11y.main_content', 'a11y.main_navigation',
  'a11y.skip_to_content', 'contact.call', 'contact.email', 'contact.open_chat',
  'contact.request_estimate', 'contact.send_message', 'contact.unavailable', 'contact.whatsapp',
  'error.locale_unavailable', 'error.site_unavailable', 'locale.current', 'locale.option_aria',
  'navigation.contact', 'navigation.gallery', 'navigation.home', 'navigation.owner',
  'navigation.services', 'state.available', 'state.loading', 'state.unavailable',
].map((key) => [key, key]));

function shellEnvelope(source = 'platform') {
  const basePath = source === 'platform' ? '/promo/demo-promo' : '';
  return {
    ok: true,
    contract: 'promo.public.shell.v1',
    route: { source, action: 'serve' },
    profile: {
      site: { public_slug: 'demo-promo' },
      system: { catalog_version: 'promo.system.v1', messages },
      locale: {
        effective: 'es', default: 'es', source: 'url', lang: 'es', direction: 'ltr',
        canonical_path: `${basePath}/es`,
      },
      selector: {
        label: 'Idioma',
        options: [{ locale: 'es', label: 'Español', aria_label: 'Ver en español', href: `${basePath}/es`, active: true }],
      },
      theme: {
        theme_id: 'promo.black-gold', version: '1.0.0',
        tokens: {
          surface: 'obsidian', text: 'ivory', accent: 'heritage_gold', border: 'heritage_gold',
          focus: 'ivory_ring', heading_font: 'editorial_serif', body_font: 'humanist_sans',
          radius: 'subtle', shadow: 'ambient', density: 'comfortable', motion: 'subtle',
        },
      },
      section_order: ['hero-main'],
      sections: [{
        key: 'hero-main', type: 'hero', variant: 'default',
        config: { media_use_key: '', action_key: '' }, media_use_keys: [],
      }],
      media: [],
      contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
      content: {
        identity: { name: 'Negocio demo', summary: 'Presentación pública' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: 'Negocio demo', summary: 'Trabajo profesional' } },
        contact: {}, media_alt: {}, seo: { title: 'Negocio demo', description: 'Presentación pública' },
      },
      adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
    },
  };
}

test('cliente SHELL acepta únicamente la proyección localized allowlisted', () => {
  const normalized = normalizePromoPublicShellResponse(shellEnvelope());
  assert.equal(normalized.profile.locale.effective, 'es');
  assert.equal(normalized.profile.content.identity.name, 'Negocio demo');
  const hostile = structuredClone(shellEnvelope());
  hostile.profile.theme.tokens.accent = '#ff00ff';
  assert.throws(() => normalizePromoPublicShellResponse(hostile), PromoPublicShellError);
  const leaked = structuredClone(shellEnvelope());
  leaked.profile.store_id = 'storeaaaaaaaaaa';
  assert.throws(() => normalizePromoPublicShellResponse(leaked), PromoPublicShellError);
  const invalidMedia = structuredClone(shellEnvelope());
  invalidMedia.profile.media = [{
    key: 'hero-media', purpose: 'hero', kind: 'image', width: '1920', height: 1080,
    duration_ms: 0, accessibility: { alt: 'Portada', decorative: false },
  }];
  invalidMedia.profile.content.media_alt = { 'hero-media': { alt: 'Portada', decorative: false } };
  assert.throws(() => normalizePromoPublicShellResponse(invalidMedia), PromoPublicShellError);
  const redirect = normalizePromoPublicShellResponse({
    ok: true, contract: 'promo.public.shell.v1',
    route: { source: 'custom', action: 'redirect', location: 'https://primary.example.test/es' },
  });
  assert.equal(redirect.route.location, 'https://primary.example.test/es');
});

test('rutas públicas separan plataforma, Host y paths custom allowlisted', () => {
  assert.equal(promoPlatformEndpoint('demo-promo'), '/api/pz/promo/public/v1/shell/sites/demo-promo');
  assert.equal(promoPlatformEndpoint('demo-promo', 'es'), '/api/pz/promo/public/v1/shell/sites/demo-promo/locales/es');
  assert.equal(promoHostEndpoint(), '/api/pz/promo/public/v1/shell/host');
  assert.equal(promoHostEndpoint('en'), '/api/pz/promo/public/v1/shell/host/locales/en');
  assert.deepEqual(customPromoPublicPath('/'), { allowed: true, locale: undefined });
  assert.deepEqual(customPromoPublicPath('/es'), { allowed: true, locale: 'es' });
  assert.equal(customPromoPublicPath('/admin').allowed, false);
  assert.equal(customPromoPublicPath('/api/pz').allowed, false);
  assert.equal(isPromoPlatformRequest(new Request('https://tusenda84.com/promo/demo-promo')), true);
  assert.equal(isPromoPlatformRequest(new Request('https://unknown.91.99.99.83.sslip.io/')), false);
  assert.equal(isPromoPlatformRequest(new Request('https://unknown.example.test/')), false);
});

test('salto SSR a PocketBase conserva el Host original con transporte Node', async () => {
  let observedHost = '';
  let observedPath = '';
  const server = createServer((request, response) => {
    observedHost = request.headers.host || '';
    observedPath = request.url || '';
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Language': 'es',
      'Cache-Control': 'private, no-store, max-age=0',
    });
    response.end(JSON.stringify(shellEnvelope('custom')));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object');
  const previous = process.env.PZ_POCKETBASE_INTERNAL_URL;
  process.env.PZ_POCKETBASE_INTERNAL_URL = `http://127.0.0.1:${address.port}`;
  try {
    const result = await readCustomHostPromoShell(new Request('https://primary.example.test/', {
      headers: { Host: 'primary.example.test', 'Accept-Language': 'es' },
    }));
    assert.equal(result.profile.content.identity.name, 'Negocio demo');
    assert.equal(result.response.contentLanguage, 'es');
    assert.equal(observedHost, 'primary.example.test');
    assert.equal(observedPath, '/api/pz/promo/public/v1/shell/host');
  } finally {
    if (previous === undefined) delete process.env.PZ_POCKETBASE_INTERNAL_URL;
    else process.env.PZ_POCKETBASE_INTERNAL_URL = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('shell SSR es independiente de Layout y no incluye scripts ni acciones comerciales', () => {
  const layout = read('../src/layouts/PromoPublicLayout.astro');
  const shell = read('../src/components/promo-public/PromoPublicShell.astro');
  const styles = read('../src/styles/promo-public-shell.css');
  const middleware = read('../src/middleware.ts');
  const platform = read('../src/pages/promo/[publicSlug]/index.astro');
  const localized = read('../src/pages/promo/[publicSlug]/[locale].astro');
  const commerce = read('../src/pages/t/[storeSlug]/index.astro');
  const combined = `${layout}\n${shell}\n${styles}\n${platform}\n${localized}`;
  assert.match(shell, /promo-skip-link/);
  assert.match(shell, /aria-label=\{system\.messages\['a11y\.main_navigation'\]\}/);
  assert.match(shell, /aria-current=\{option\.active \? 'page'/);
  assert.match(layout, /<html lang=\{lang\} dir=\{direction\}>/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.doesNotMatch(combined, /<script|layouts\/Layout\.astro|PublicStoreHome|innerHTML|set:html/);
  assert.doesNotMatch(combined, /cart|checkout|products|categories|orders|inventory|stock|price|currency|coupon|shipping/i);
  assert.match(platform, /Astro\.url\.search/);
  assert.match(localized, /Astro\.url\.search/);
  assert.match(middleware, /readCustomHostPromoShell/);
  assert.match(middleware, /customPromoPublicPath/);
  assert.match(middleware, /promoPublicUnavailable\(404\)/);
  assert.ok(commerce.indexOf('readPromoCommerceBridge') < commerce.indexOf("import('../../../components/public-store/PublicStoreHome.astro')"));
  assert.doesNotMatch(commerce, /storeSlug[^\n]*toLowerCase/);
});

test('shell público conserva no-store/noindex hasta SEO/PERF y no adelanta prompts posteriores', () => {
  const client = read('../src/lib/promoPublicShell.ts');
  assert.match(client, /private, no-store, max-age=0/);
  assert.match(client, /noindex,nofollow,noarchive/);
  assert.match(client, /redirect: 'manual'/);
  assert.match(client, /localeCookie/);
  assert.match(client, /requestBackendWithAuthoritativeHost/);
  assert.match(client, /nodeHttpRequest/);
  assert.doesNotMatch(client, /Cloudflare|Coolify|hreflang.*canonical|analytics|contact\.activate|tel:|mailto:|wa\.me/i);
});
