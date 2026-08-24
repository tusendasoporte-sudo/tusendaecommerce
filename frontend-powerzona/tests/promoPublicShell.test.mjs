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

function imageDelivery({
  slug = 'demo-promo', key = 'hero-main-media', purpose = 'hero', width = 1280, height = 720,
  priority = true, poster = false, sha = 'a'.repeat(64),
} = {}) {
  const widths = purpose === 'video_poster' ? [480, 960] : [480, 768];
  const prefix = poster ? 'poster-' : '';
  const sources = [...widths.filter((candidate) => candidate < width).map((candidate) => ({
    key: `w${candidate}`,
    width: candidate,
    height: Math.max(1, Math.round((height * candidate) / width)),
    url: `/api/pz/promo/public/v1/sites/${slug}/media/${key}/${sha}/${prefix}w${candidate}.webp`,
  })), {
    key: 'original', width, height,
    url: `/api/pz/promo/public/v1/sites/${slug}/media/${key}/${sha}/${prefix}original.webp`,
  }];
  return {
    contract: 'promo.media.delivery.v1', mime: 'image/webp',
    src: sources.at(-1).url, srcset: sources,
    sizes: '100vw', loading: priority ? 'eager' : 'lazy',
    fetch_priority: priority ? 'high' : 'auto', decoding: 'async',
  };
}

function shellEnvelopeWithHeroMedia({ videoFirst = false } = {}) {
  const envelope = shellEnvelope();
  envelope.profile.sections[0].config = { media_use_key: 'hero-main-media', action_key: 'estimate' };
  envelope.profile.sections[0].media_use_keys = ['hero-main-media', 'hero-second-media'];
  envelope.profile.contact = {
    enabled: true,
    primary_action_key: 'estimate',
    secondary_action_keys: [],
    actions: [{ key: 'estimate', type: 'phone', enabled: true }],
  };
  envelope.profile.content.contact = {
    estimate: { label: 'Solicitar estimado', aria_label: 'Solicitar un estimado', message: 'Cuéntanos tu idea' },
  };
  envelope.profile.content.media_alt = {
    'hero-main-media': { alt: 'Alfombra artesanal terminada', decorative: false },
    'hero-second-media': { alt: 'Detalle del tejido artesanal', decorative: false },
  };
  const image = {
    key: 'hero-main-media', purpose: 'hero', kind: 'image', width: 1280, height: 720, duration_ms: 0,
    delivery: imageDelivery(),
    accessibility: { alt: 'Alfombra artesanal terminada', decorative: false },
  };
  const video = {
    key: 'hero-second-media', purpose: 'hero', kind: 'video', width: 1280, height: 720, duration_ms: 15_000,
    delivery: {
      contract: 'promo.media.delivery.v1', mime: 'video/mp4',
      src: `/api/pz/promo/public/v1/sites/demo-promo/media/hero-second-media/${'b'.repeat(64)}/original.mp4`,
      preload: 'none', controls_required: true, autoplay: false, plays_inline: true,
      reduced_motion: 'poster', save_data: 'poster',
      poster: imageDelivery({
        key: 'hero-second-media', purpose: 'video_poster', priority: false, poster: true, sha: 'c'.repeat(64),
      }),
    },
    accessibility: { alt: 'Detalle del tejido artesanal', decorative: false },
  };
  if (videoFirst) {
    video.key = 'hero-main-media';
    video.delivery.src = `/api/pz/promo/public/v1/sites/demo-promo/media/hero-main-media/${'b'.repeat(64)}/original.mp4`;
    video.delivery.poster = imageDelivery({
      key: 'hero-main-media', purpose: 'video_poster', priority: true, poster: true, sha: 'c'.repeat(64),
    });
    video.accessibility.alt = 'Alfombra artesanal terminada';
    image.key = 'hero-second-media';
    image.delivery = imageDelivery({ key: 'hero-second-media', priority: false });
    image.accessibility.alt = 'Detalle del tejido artesanal';
    envelope.profile.media = [video, image];
  } else {
    envelope.profile.media = [image, video];
  }
  return envelope;
}

test('cliente SHELL acepta únicamente la proyección localized allowlisted', () => {
  const normalized = normalizePromoPublicShellResponse(shellEnvelope());
  assert.equal(normalized.profile.locale.effective, 'es');
  assert.equal(normalized.profile.content.identity.name, 'Negocio demo');
  assert.equal(normalized.profile.theme.renderer_key, 'promo.black-gold');
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
  const unpackagedTheme = structuredClone(shellEnvelope());
  unpackagedTheme.profile.theme.version = '2.0.0';
  assert.throws(
    () => normalizePromoPublicShellResponse(unpackagedTheme),
    (error) => error instanceof PromoPublicShellError
      && error.code === 'promo_public_renderer_unavailable'
      && error.status === 503,
  );
  const redirect = normalizePromoPublicShellResponse({
    ok: true, contract: 'promo.public.shell.v1',
    route: { source: 'custom', action: 'redirect', location: 'https://primary.example.test/es' },
  });
  assert.equal(redirect.route.location, 'https://primary.example.test/es');
});

test('HERO consume exclusivamente delivery MEDIA público, content-addressed y prioritario', () => {
  const normalized = normalizePromoPublicShellResponse(shellEnvelopeWithHeroMedia());
  assert.equal(normalized.profile.media.length, 2);
  assert.equal(normalized.profile.media[0].kind, 'image');
  assert.equal(normalized.profile.media[0].delivery.loading, 'eager');
  assert.equal(normalized.profile.media[0].delivery.fetch_priority, 'high');
  assert.equal(normalized.profile.media[0].delivery.srcset.at(-1).width, 1280);
  assert.equal(normalized.profile.media[1].kind, 'video');
  assert.equal(normalized.profile.media[1].delivery.preload, 'none');
  assert.equal(normalized.profile.media[1].delivery.autoplay, false);
  assert.equal(normalized.profile.media[1].delivery.controls_required, true);
  assert.equal(normalized.profile.media[1].delivery.poster.loading, 'lazy');
  assert.equal(normalized.profile.content.contact.estimate.label, 'Solicitar estimado');

  const videoLcp = normalizePromoPublicShellResponse(shellEnvelopeWithHeroMedia({ videoFirst: true }));
  assert.equal(videoLcp.profile.media[0].kind, 'video');
  assert.equal(videoLcp.profile.media[0].delivery.poster.fetch_priority, 'high');

  const external = shellEnvelopeWithHeroMedia();
  external.profile.media[0].delivery.src = 'https://tenant.example/hero.webp';
  assert.throws(() => normalizePromoPublicShellResponse(external), PromoPublicShellError);
  const wrongPriority = shellEnvelopeWithHeroMedia();
  wrongPriority.profile.media[1].delivery.poster.fetch_priority = 'high';
  assert.throws(() => normalizePromoPublicShellResponse(wrongPriority), PromoPublicShellError);
  const wrongPurpose = shellEnvelopeWithHeroMedia();
  wrongPurpose.profile.media[0].purpose = 'gallery';
  assert.throws(() => normalizePromoPublicShellResponse(wrongPurpose), PromoPublicShellError);
  const leakedDelivery = shellEnvelopeWithHeroMedia();
  leakedDelivery.profile.media[0].delivery.asset_id = 'assetaaaaaaaaaa';
  assert.throws(() => normalizePromoPublicShellResponse(leakedDelivery), PromoPublicShellError);
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
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const hero = read('../src/components/promo-public/PromoHero.astro');
  const styles = read('../src/styles/promo-public-shell.css');
  const themeStyles = read('../src/styles/promo-black-gold.css');
  const heroStyles = read('../src/styles/promo-hero.css');
  const middleware = read('../src/middleware.ts');
  const platform = read('../src/pages/promo/[publicSlug]/index.astro');
  const localized = read('../src/pages/promo/[publicSlug]/[locale].astro');
  const commerce = read('../src/pages/t/[storeSlug]/index.astro');
  const combined = `${layout}\n${shell}\n${theme}\n${hero}\n${styles}\n${themeStyles}\n${heroStyles}\n${platform}\n${localized}`;
  assert.match(shell, /PROMO_BLACK_GOLD_RENDERER_KEY/);
  assert.match(shell, /promo_public_renderer_unavailable/);
  assert.match(theme, /promo-skip-link/);
  assert.match(theme, /aria-label=\{system\.messages\['a11y\.main_navigation'\]\}/);
  assert.match(theme, /aria-current=\{option\.active \? 'page'/);
  assert.match(layout, /<html lang=\{lang\} dir=\{direction\}>/);
  assert.match(layout, /data-promo-theme-renderer=\{themeRenderer\}/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(themeStyles, /@media \(max-width: 720px\)/);
  assert.match(hero, /fetchpriority=\{media\.delivery\.fetch_priority\}/);
  assert.match(hero, /controls=\{media\.delivery\.controls_required\}/);
  assert.match(hero, /preload=\{media\.delivery\.preload\}/);
  assert.match(hero, /promo-hero__controls/);
  assert.match(hero, /contact\.request_estimate/);
  assert.match(hero, /contact\.unavailable/);
  assert.match(heroStyles, /scroll-snap-type: inline mandatory/);
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

test('renderer ALADDIN aplica únicamente la release negra/dorada y conserva prompts posteriores inertes', () => {
  const layout = read('../src/layouts/PromoPublicLayout.astro');
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const styles = read('../src/styles/promo-black-gold.css');
  assert.match(styles, /body\[data-promo-theme-renderer="promo\.black-gold"\]/);
  assert.match(styles, /--promo-surface: #0b0b0b/);
  assert.match(styles, /--promo-accent: #c8a45a/);
  assert.match(styles, /data-promo-token-accent="champagne_gold"/);
  assert.match(styles, /data-promo-token-radius="soft"/);
  assert.match(styles, /data-promo-token-density="compact"/);
  assert.match(styles, /data-promo-token-motion="reduced"/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(theme, /role="status"/);
  assert.match(theme, /system\.messages\['contact\.unavailable'\]/);
  assert.match(theme, /promo-shell-section__ornament/);
  assert.match(layout, /data-promo-token-accent=\{themeTokens\.accent\}/);
  assert.ok(Buffer.byteLength(styles, 'utf8') <= 50 * 1024, 'CSS del renderer excede el budget Theme de 50 KiB');
  assert.doesNotMatch(`${theme}\n${styles}`, /<img|<video|<button|tel:|mailto:|wa\.me|Escanéame|qr|price|cart|checkout/i);
  assert.doesNotMatch(styles, /url\(|@import|https?:/i);
});

test('HERO no activa destinos de contacto ni adelanta SECTIONS/CONTACT', () => {
  const hero = read('../src/components/promo-public/PromoHero.astro');
  const heroStyles = read('../src/styles/promo-hero.css');
  assert.doesNotMatch(hero, /<button|<form|tel:|mailto:|wa\.me|target=|onclick|addEventListener|<script/i);
  assert.doesNotMatch(heroStyles, /url\(|@import|https?:/i);
  assert.match(hero, /role="status"/);
  assert.match(hero, /href=\{`#\$\{sectionId\}-media-/);
  assert.ok(Buffer.byteLength(`${read('../src/styles/promo-black-gold.css')}\n${heroStyles}`, 'utf8') <= 50 * 1024,
    'CSS combinado ALADDIN/HERO excede el budget Theme de 50 KiB');
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
