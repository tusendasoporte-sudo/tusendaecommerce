import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  comparePromoPreviews,
  normalizePromoPreviewContext,
  normalizePromoPreviewResponse,
  parsePromoPreviewAdminRequest,
  PromoPreviewError,
  promoPreviewThemeStyle,
  resolvePromoPreviewMediaSource,
  rewritePromoPreviewMedia,
} from '../src/lib/promoPreview.ts';

const require = createRequire(import.meta.url);
const backendPublish = require('../../backend-powerzona/pb_hooks/pz_promo_publish_lib.js');
const backendPubcfg = require('../../backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js');

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function documentFixture(name = 'Negocio demo', accent = 'heritage_gold') {
  const localized = (locale) => ({
    identity: { name: locale === 'es' ? name : 'Demo business', summary: locale === 'es' ? 'Trabajo artesanal' : 'Handcrafted work' },
    navigation: { 'hero-main': locale === 'es' ? 'Inicio' : 'Home', 'services-main': locale === 'es' ? 'Servicios' : 'Services', 'contact-main': locale === 'es' ? 'Contacto' : 'Contact', 'footer-main': locale === 'es' ? 'Pie' : 'Footer' },
    sections: {
      'hero-main': { heading: locale === 'es' ? 'Creamos espacios únicos' : 'We create unique spaces', summary: locale === 'es' ? 'Diseño e instalación.' : 'Design and installation.' },
      'services-main': { heading: locale === 'es' ? 'Servicios' : 'Services', summary: '', items: [{ key: 'service-one', name: locale === 'es' ? 'Instalación' : 'Installation', summary: '', caption: '' }] },
      'contact-main': { heading: locale === 'es' ? 'Hablemos' : 'Let us talk', summary: '' },
      'footer-main': { text: locale === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.' },
    },
    contact: { primary: { label: locale === 'es' ? 'Solicitar estimado' : 'Request estimate', aria_label: locale === 'es' ? 'Solicitar estimado al negocio' : 'Request an estimate', message: '' } },
    media_alt: {},
    seo: { title: locale === 'es' ? name : 'Demo business', description: locale === 'es' ? 'Descripción del negocio.' : 'Business description.' },
  });
  return {
    contract: 'promo.site.v1',
    system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: { accent, border: accent } },
    identity: { public_business_key: 'negocio-demo' },
    section_order: ['hero-main', 'services-main', 'contact-main', 'footer-main'],
    sections: [
      { key: 'hero-main', type: 'hero', variant: 'default', visible: true, config: { media_use_key: '', action_key: 'primary' }, media_use_keys: [] },
      { key: 'services-main', type: 'services', variant: 'default', visible: true, config: { item_keys: ['service-one'] }, media_use_keys: [] },
      { key: 'contact-main', type: 'contact', variant: 'default', visible: true, config: { action_keys: ['primary'] }, media_use_keys: [] },
      { key: 'footer-main', type: 'footer', variant: 'default', visible: true, config: {}, media_use_keys: [] },
    ],
    media_refs: {},
    contact: {
      enabled: true,
      primary_action_key: 'primary',
      secondary_action_keys: [],
      actions: [{ key: 'primary', type: 'phone', enabled: true, config: { phone_e164: '+15551234567' } }],
    },
    content_by_locale: { en: localized('en'), es: localized('es') },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function previewResponse(options = {}) {
  const document = documentFixture(options.name, options.accent);
  const projection = backendPubcfg.projectPublicDocument(document, 'promo-demo', []);
  const preview = backendPublish.previewProjection(projection, options.locale || 'es', options.media || []);
  return {
    ok: true,
    contract: 'promo.preview.v1',
    visibility: 'private',
    robots: 'noindex,nofollow,noarchive',
    candidate: {
      revision_id: options.revisionId || 'revisionaaaaaaa',
      sequence: options.sequence || 2,
      digest: options.digest || 'a'.repeat(64),
      source_draft_version: options.sourceDraftVersion || 4,
      created: '2026-08-24T10:00:00Z',
      reused: false,
    },
    preview,
  };
}

test('contexto y comandos administrativos son exactos, tenant-scoped y conservan CAS de draft', () => {
  const context = normalizePromoPreviewContext({
    ok: true,
    contract: 'promo.preview.context.v1',
    draft: { version: 4, digest: 'd'.repeat(64), locales: { default: 'es', published: ['en', 'es'] } },
    publication: {
      state: 'active', generation: 7,
      current: {
        revision_id: 'publishedaaaaaa', sequence: 1, digest: 'b'.repeat(64),
        source_draft_version: 2, created: '2026-08-24T09:00:00Z',
        locales: { default: 'es', published: ['es'] },
      },
    },
  });
  assert.equal(context.draft.version, 4);
  assert.equal(context.publication.current.revisionId, 'publishedaaaaaa');
  assert.deepEqual(parsePromoPreviewAdminRequest({
    contract: 'promo.admin.preview.prepare.v1', expected_draft_version: 4, locale: 'es',
  }), { operation: 'prepare', expectedDraftVersion: 4, locale: 'es' });
  assert.deepEqual(parsePromoPreviewAdminRequest({
    contract: 'promo.admin.preview.read.v1', revision_id: 'revisionaaaaaaa', locale: 'en',
  }), { operation: 'read', revisionId: 'revisionaaaaaaa', locale: 'en' });
  assert.throws(() => parsePromoPreviewAdminRequest({
    contract: 'promo.admin.preview.prepare.v1', expected_draft_version: 4, locale: 'es', site_id: 'siteaaaaaaaaaaa',
  }), PromoPreviewError);
  assert.throws(() => normalizePromoPreviewContext({
    ok: true, contract: 'promo.preview.context.v1', draft: {}, publication: {}, store_id: 'storeaaaaaaaaaa',
  }), PromoPreviewError);
});

test('preview localizado acepta solo proyección privada allowlisted y aplica tema first-party', () => {
  const normalized = normalizePromoPreviewResponse(previewResponse(), 'either');
  assert.equal(normalized.preview.locale.effective, 'es');
  assert.equal(normalized.preview.content.identity.name, 'Negocio demo');
  assert.equal(JSON.stringify(normalized).includes('Demo business'), false, 'no mezcla el locale inglés');
  assert.equal(JSON.stringify(normalized).includes('+15551234567'), false, 'no contiene destino de contacto');
  const theme = promoPreviewThemeStyle(normalized.preview.theme);
  assert.equal(theme.rendererAvailable, true);
  assert.equal(theme.style.accent, '#c8a45a');
  const champagne = normalizePromoPreviewResponse(previewResponse({ accent: 'champagne_gold' }), 'either');
  assert.equal(promoPreviewThemeStyle(champagne.preview.theme).style.accent, '#d9bf84');
  const hostile = structuredClone(previewResponse());
  hostile.preview.theme.tokens.accent = '#ff00ff';
  assert.throws(() => normalizePromoPreviewResponse(hostile), PromoPreviewError);
});

test('medios privados se reescriben same-origin y se resuelven otra vez por revisión, locale y use key', () => {
  const raw = structuredClone(previewResponse());
  raw.preview.sections[0].config.media_use_key = 'hero_main';
  raw.preview.sections[0].media_use_keys = ['hero_main'];
  raw.preview.content.media_alt.hero_main = { alt: 'Trabajo terminado', decorative: false };
  raw.preview.media = [backendPublish.previewMediaDescriptor({
    key: 'hero_main', purpose: 'hero', kind: 'image', width: 1200, height: 900,
    duration_ms: 0, delivery: { fetch_priority: 'high' },
  }, {
    mime: 'image/webp',
    preview: {
      url: `/api/pz/promo/private/v1/media/${'m'.repeat(15)}/${'c'.repeat(64)}/original.webp`,
      variants: [
        { key: 'w640', width: 640, height: 480, url: `/api/pz/promo/private/v1/media/${'m'.repeat(15)}/${'c'.repeat(64)}/w640.webp` },
        { key: 'original', width: 1200, height: 900, url: `/api/pz/promo/private/v1/media/${'m'.repeat(15)}/${'c'.repeat(64)}/original.webp` },
      ],
    },
  }, null)];
  const source = resolvePromoPreviewMediaSource(raw, { mediaKey: 'hero_main', resource: 'source', variant: 'w640' });
  assert.match(source.path, /\/w640\.webp$/);
  const rewritten = rewritePromoPreviewMedia(raw, 'demo-store');
  const normalized = normalizePromoPreviewResponse(rewritten, 'local');
  assert.match(normalized.preview.media[0].delivery.src, /^\/api\/admin\/promo-preview-media\?/);
  assert.doesNotMatch(JSON.stringify(rewritten), /\/api\/pz\/promo\/private\/v1\/media/);
  assert.throws(
    () => resolvePromoPreviewMediaSource(raw, { mediaKey: 'other_tenant', resource: 'source', variant: 'w640' }),
    (error) => error instanceof PromoPreviewError && error.code === 'promo_preview_media_not_found',
  );
});

test('comparación informa facetas cambiadas sin usar URLs privadas como diferencia semántica', () => {
  const draft = normalizePromoPreviewResponse(previewResponse({ name: 'Versión nueva', digest: 'd'.repeat(64) }));
  const published = normalizePromoPreviewResponse(previewResponse({ name: 'Versión publicada', revisionId: 'publishedaaaaaa', sequence: 1, digest: 'b'.repeat(64) }));
  const comparison = comparePromoPreviews(draft, published);
  assert.equal(comparison.identical, false);
  assert.ok(comparison.changed.some((item) => item.key === 'content'));
  assert.equal(comparison.changed.some((item) => item.key === 'contact'), false);
});

test('preview editorial legado queda aislado y el Admin vivo no lo expone', () => {
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const editor = read('../src/components/admin/promo/PromoPreviewEditor.astro');
  const api = read('../src/pages/api/admin/promo-preview.ts');
  const mediaApi = read('../src/pages/api/admin/promo-preview-media.ts');
  const backendHook = read('../../backend-powerzona/pb_hooks/pz_promo_publish.pb.js');
  const styles = read('../src/styles/promo-preview.css');
  const canonicalPage = read('../src/pages/t/[storeSlug]/admin/promo/[section].astro');

  assert.doesNotMatch(shell, /section === 'publication'|<PromoPreviewEditor|promo\.publication\.publish/);
  assert.match(api, /refreshAuthFromCookie/);
  assert.match(api, /requireCurrentStoreForAdmin/);
  assert.match(api, /promoCmsSameOriginMutation/);
  assert.match(api, /expected_draft_version: input\.expectedDraftVersion/);
  assert.match(api, /promo\.candidate\.create\.v1/);
  assert.match(api, /promo\.preview\.read\.v1/);
  assert.match(api, /X-PZ-Promo-Store/);
  assert.match(mediaApi, /resolvePromoPreviewMediaSource/);
  assert.match(mediaApi, /sec-fetch-site/);
  assert.match(mediaApi, /Range/);
  assert.match(backendHook, /publication\/preview\/context/);
  assert.match(canonicalPage, /!section[\s\S]*?Astro\.redirect\(getPromoAdminSectionPath\(storeSlug, 'overview'\)\)/);
  assert.match(editor, /role="alert"/);
  assert.match(editor, /aria-live="polite"/);
  assert.match(editor, /1280 × 800/);
  assert.match(editor, /390 × 844/);
  assert.match(editor, /ResizeObserver/);
  assert.match(editor, /textContent/);
  assert.doesNotMatch(editor, /innerHTML/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(`${shell}\n${editor}\n${api}\n${mediaApi}`, /products|categories|orders|checkout|cart|inventory|stock|price|currency|Cloudflare|Coolify/);
  assert.doesNotMatch(`${api}\n${editor}`, /publication\/publish|publication\/rollback|canonical\/switch|\/public\/v1\/sites/);
});
