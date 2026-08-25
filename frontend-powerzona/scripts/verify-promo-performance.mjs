import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  brotliCompressSync,
  constants as zlibConstants,
  gzipSync,
} from 'node:zlib';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';

import { PROMO_PERFORMANCE_BUDGETS as budgets } from '../src/lib/promoPerformance.ts';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientAssets = path.join(frontendRoot, 'dist', 'client', '_astro');
const serverRoot = path.join(frontendRoot, 'dist', 'server');
const entrySource = readFileSync(path.join(serverRoot, 'entry.mjs'), 'utf8');
const manifestPrefix = 'var _manifest = deserializeManifest(';
const manifestStart = entrySource.indexOf(manifestPrefix) + manifestPrefix.length;
const manifestEnd = entrySource.indexOf(');\nvar manifestRoutes', manifestStart);
assert.ok(manifestStart >= manifestPrefix.length && manifestEnd > manifestStart, 'manifest build no disponible');
const manifest = JSON.parse(entrySource.slice(manifestStart, manifestEnd));
const route = manifest.routes.find((item) => item.routeData.route === '/promo/[publicSlug]/[locale]');
assert.ok(route, 'ruta Promo localizada ausente del build');

const inlineCss = route.styles
  .filter((item) => item.type === 'inline')
  .map((item) => item.content)
  .join('');
assert.equal(route.styles.some((item) => item.type === 'external'), false, 'CSS Promo crea request bloqueante');

const promoRuntimeAsset = readdirSync(clientAssets).find((name) => /^PromoPublicLayout.*\.js$/.test(name));
assert.ok(promoRuntimeAsset, 'runtime Analytics Promo externo ausente');
const initialJavaScriptAssets = [
  ...route.scripts.filter((item) => item.type === 'external').map((item) => item.value),
  `_astro/${promoRuntimeAsset}`,
];
const initialJavaScript = initialJavaScriptAssets
  .map((asset) => readFileSync(path.join(frontendRoot, 'dist', 'client', asset), 'utf8'))
  .join('\n');

const messages = new Proxy({}, { get: (_target, key) => String(key) });
const imageHash = 'a'.repeat(64);
const imageBase = `/api/pz/promo/public/v1/sites/demo-promo/media/hero-main-media/${imageHash}`;
const profile = {
  site: { public_slug: 'demo-promo' },
  system: { catalog_version: 'promo.system.v1', messages },
  locale: { effective: 'es', default: 'es', source: 'url', lang: 'es', direction: 'ltr', canonical_path: '/promo/demo-promo/es' },
  selector: {
    label: 'Idioma',
    options: [{ locale: 'es', label: 'Español', aria_label: 'Ver en español', href: '/promo/demo-promo/es', active: true }],
  },
  theme: {
    theme_id: 'promo.black-gold', version: '1.0.0', renderer_key: 'promo.black-gold',
    tokens: {
      surface: 'obsidian', text: 'ivory', accent: 'heritage_gold', border: 'heritage_gold',
      focus: 'ivory_ring', heading_font: 'editorial_serif', body_font: 'humanist_sans',
      radius: 'subtle', shadow: 'ambient', density: 'comfortable', motion: 'subtle',
    },
  },
  section_order: ['hero-main'],
  sections: [{
    key: 'hero-main', type: 'hero', variant: 'default',
    config: { media_use_key: 'hero-main-media', action_key: '' }, media_use_keys: ['hero-main-media'],
  }],
  media: [{
    key: 'hero-main-media', purpose: 'hero', kind: 'image', width: 1280, height: 720,
    accessibility: { alt: 'Trabajo profesional', decorative: false },
    delivery: {
      contract: 'promo.media.delivery.v1', mime: 'image/webp', src: `${imageBase}/original.webp`,
      srcset: [
        { key: 'w480', width: 480, height: 270, url: `${imageBase}/w480.webp` },
        { key: 'w768', width: 768, height: 432, url: `${imageBase}/w768.webp` },
        { key: 'original', width: 1280, height: 720, url: `${imageBase}/original.webp` },
      ],
      sizes: '100vw', loading: 'eager', fetch_priority: 'high', decoding: 'async',
    },
  }],
  contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
  contact_action: { contract: 'promo.contact.action.v1', available: false, action: null },
  footer: { contract: 'promo.footer.v1', sections: [] },
  content: {
    identity: { name: 'Negocio demo', summary: 'Presentación pública profesional' },
    navigation: { 'hero-main': 'Inicio' },
    sections: { 'hero-main': { heading: 'Negocio demo', summary: 'Trabajo profesional verificable' } },
    contact: {}, media_alt: { 'hero-main-media': 'Trabajo profesional' },
    seo: { title: 'Negocio demo', description: 'Presentación pública profesional' },
  },
  adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  store_rating: { contract: 'promo.store-rating.v1', enabled: false, summary: { average: 0, count: 0 }, reviews: [] },
  landing_qr_link: { contract: 'promo.landing-qr-link.v1', enabled: false, link: null },
};
const canonicalUrl = 'https://tusenda84.com/promo/demo-promo/es';
const seo = {
  contract: 'promo.public.seo.v1', canonical_url: canonicalUrl,
  sitemap_url: 'https://tusenda84.com/promo/demo-promo/sitemap.xml',
  alternates: [{ locale: 'es', url: canonicalUrl }], x_default: canonicalUrl,
  open_graph: {
    type: 'website', url: canonicalUrl, title: 'Negocio demo', description: 'Presentación pública profesional',
    site_name: 'Negocio demo', locale: 'es', alternate_locales: [], image: null,
  },
  twitter: { card: 'summary', title: 'Negocio demo', description: 'Presentación pública profesional', image: '', image_alt: '' },
};

const shellChunk = readdirSync(path.join(serverRoot, 'chunks')).find((name) => /^PromoPublicShell_.*\.mjs$/.test(name));
assert.ok(shellChunk, 'chunk SSR Promo ausente');
const shellModule = await import(pathToFileURL(path.join(serverRoot, 'chunks', shellChunk)).href);
const container = await AstroContainer.create();
const renderedShell = await container.renderToString(shellModule.t, { props: { profile, seo } });
const representativeHtml = renderedShell.replace('</head>', `<style>${inlineCss}</style></head>`);

function brotliText(value) {
  return brotliCompressSync(Buffer.from(value), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 5,
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
    },
  }).byteLength;
}

const htmlBrotli = brotliText(representativeHtml);
const cssBrotli = brotliText(inlineCss);
const javaScriptBrotli = brotliText(initialJavaScript);
const heroMaximum = 100 * 1024;
const maximumVideoPosters = 3;
const videoPostersMaximum = maximumVideoPosters * 100 * 1024;
const initialTransfer = htmlBrotli + javaScriptBrotli + heroMaximum + videoPostersMaximum;
const requestCount = 1 + initialJavaScriptAssets.length + 1 + maximumVideoPosters + 1;
const eagerImages = (representativeHtml.match(/<img[^>]+loading="eager"/g) || []).length;

assert.ok(htmlBrotli <= budgets.htmlCompressedBytes, 'HTML SSR excede ARC-ADR-010');
assert.ok(cssBrotli <= budgets.cssCompressedBytes, 'CSS excede ARC-ADR-010');
assert.ok(javaScriptBrotli <= budgets.initialJavaScriptCompressedBytes, 'JavaScript excede ARC-ADR-010');
assert.ok(heroMaximum <= budgets.mobileHeroBytes && heroMaximum <= budgets.desktopHeroBytes, 'Hero excede ARC-ADR-010');
assert.ok(initialTransfer <= budgets.mobileInitialTransferBytes, 'transferencia móvil excede ARC-ADR-010');
assert.ok(initialTransfer <= budgets.desktopInitialTransferBytes, 'transferencia desktop excede ARC-ADR-010');
assert.ok(requestCount <= budgets.initialRequests, 'requests iniciales exceden ARC-ADR-010');
assert.equal(eagerImages, budgets.eagerImages, 'solo Hero/LCP puede ser eager');
assert.doesNotMatch(inlineCss, /@font-face|fonts\.(?:googleapis|gstatic)/i, 'fuente inicial no first-party o inesperada');

console.log(JSON.stringify({
  contract: 'promo.performance.local.v1',
  budgets: {
    html_ssr: { brotli_bytes: htmlBrotli, gzip_bytes: gzipSync(representativeHtml).byteLength },
    css_shell_theme: { raw_bytes: Buffer.byteLength(inlineCss), brotli_bytes: cssBrotli },
    initial_javascript: { raw_bytes: Buffer.byteLength(initialJavaScript), brotli_bytes: javaScriptBrotli, assets: initialJavaScriptAssets },
    initial_fonts: { bytes: 0 },
    hero_lcp_upper_bound: { bytes: heroMaximum },
    video_posters_upper_bound: { bytes: videoPostersMaximum, count: maximumVideoPosters },
    initial_transfer_upper_bound: { bytes: initialTransfer },
    requests_before_interaction_upper_bound: requestCount,
    eager_images: eagerImages,
    video_before_interaction_bytes: 0,
  },
}, null, 2));
