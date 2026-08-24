import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPromoGalleryDocument,
  createPromoGalleryWorkspace,
  normalizePromoGalleryCatalog,
  promoGalleryPreviewPath,
} from '../src/lib/promoGallery.ts';
import { PromoCmsError } from '../src/lib/promoCms.ts';

const require = createRequire(import.meta.url);
const backendContract = require('../../backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js');

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

function localized(name) {
  return {
    identity: { name, summary: '' }, navigation: {}, sections: {}, contact: {}, media_alt: {},
    seo: { title: 'Galería Demo', description: 'Descripción del sitio de demostración.' },
  };
}

const assets = [
  {
    assetId: 'asseta000000001', kind: 'image', purpose: 'gallery', status: 'ready', mime: 'image/webp',
    bytes: 50000, width: 1200, height: 900, durationMs: 0, posterAssetId: '',
  },
  {
    assetId: 'assetv000000001', kind: 'video', purpose: 'gallery', status: 'ready', mime: 'video/mp4',
    bytes: 1000000, width: 1280, height: 720, durationMs: 5000, posterAssetId: 'poster000000001',
  },
];

function completeDocument() {
  const document = emptyDraft();
  document.locales = { default: 'es', published: ['en', 'es'] };
  document.theme = { theme_id: 'promo.black-gold', version: '1.0.0', tokens: { surface: 'obsidian' } };
  document.identity = { public_business_key: 'negocio-demo' };
  document.section_order = ['hero-main', 'featured-work-main', 'gallery-main', 'contact-main'];
  document.sections = [
    { key: 'hero-main', type: 'hero', variant: 'default', visible: true, config: { media_use_key: '', action_key: '' }, media_use_keys: [] },
    { key: 'featured-work-main', type: 'featured_work', variant: 'default', visible: true, config: { item_keys: ['featured-work-1'] }, media_use_keys: ['featured-work-media-1'] },
    { key: 'gallery-main', type: 'gallery', variant: 'default', visible: true, config: { item_keys: ['gallery-item-1'] }, media_use_keys: ['gallery-item-media-1'] },
    { key: 'contact-main', type: 'contact', variant: 'default', visible: true, config: { action_keys: [] }, media_use_keys: [] },
  ];
  document.media_refs = {
    'featured-work-media-1': { asset_id: 'asseta000000001', purpose: 'gallery' },
    'gallery-item-media-1': { asset_id: 'asseta000000001', purpose: 'gallery' },
  };
  const es = localized('Negocio demo');
  es.navigation = {
    'hero-main': 'Inicio', 'featured-work-main': 'Destacados', 'gallery-main': 'Galería', 'contact-main': 'Contacto',
  };
  es.sections = {
    'hero-main': { heading: 'Portada', summary: '' },
    'featured-work-main': { heading: 'Destacados', summary: '', items: [{ key: 'featured-work-1', name: 'Proyecto uno', summary: '', caption: '' }] },
    'gallery-main': { heading: 'Galería', summary: '', items: [{ key: 'gallery-item-1', caption: 'Detalle' }] },
    'contact-main': { heading: 'Contacto', summary: '' },
  };
  es.media_alt = {
    'featured-work-media-1': { alt: 'Trabajo terminado', decorative: false },
    'gallery-item-media-1': { alt: 'Detalle del trabajo', decorative: false },
  };
  const en = structuredClone(es);
  en.identity.name = 'Demo business';
  en.navigation['featured-work-main'] = 'Featured work';
  en.sections['featured-work-main'].items[0].name = 'Project one';
  en.media_alt['featured-work-media-1'].alt = 'Finished work';
  document.content_by_locale = { en, es };
  return document;
}

function patch(document = completeDocument()) {
  const es = document.content_by_locale.es;
  return {
    sections: document.sections.filter((section) => ['featured_work', 'gallery'].includes(section.type)).map((section) => ({
      key: section.key,
      type: section.type,
      visible: section.visible,
      navigationLabel: es.navigation[section.key],
      heading: es.sections[section.key].heading,
      summary: es.sections[section.key].summary,
      items: section.config.item_keys.map((key, index) => {
        const useKey = section.media_use_keys[index];
        const item = es.sections[section.key].items[index];
        const alt = es.media_alt[useKey];
        return {
          key, useKey, assetId: document.media_refs[useKey].asset_id,
          name: item.name || '', summary: item.summary || '', caption: item.caption || '',
          alt: alt.alt, decorative: alt.decorative,
        };
      }),
    })),
  };
}

test('workspace vacío crea solo trabajos destacados y galería en el locale base', () => {
  const workspace = createPromoGalleryWorkspace(emptyDraft());
  assert.equal(workspace.locale, 'es');
  assert.deepEqual(workspace.document.locales, { default: 'es', published: ['es'] });
  assert.deepEqual(workspace.document.sections.map((section) => section.type), ['featured_work', 'gallery']);
  assert.equal(workspace.document.sections.some((section) => ['hero', 'services', 'owner', 'contact'].includes(section.type)), false);
});

test('editor ordena refs y textos accesibles sin alterar tema, contacto, adapters u otros locales', () => {
  const original = completeDocument();
  const update = patch(original);
  update.sections[0].items = [{
    key: 'featured-work-2', useKey: 'featured-work-media-2', assetId: 'assetv000000001',
    name: 'Proyecto audiovisual', summary: 'Resumen', caption: 'Video final', alt: 'Recorrido del proyecto', decorative: false,
  }];
  const protectedBefore = structuredClone({
    theme: original.theme, contact: original.contact, adapters: original.adapters,
    en: original.content_by_locale.en, hero: original.sections[0], contactSection: original.sections[3],
  });
  const updated = buildPromoGalleryDocument(original, update, 24, assets);
  assert.deepEqual(backendContract.validatePromoDocument(updated, { publicRevision: false }), updated);
  assert.deepEqual(updated.sections[1].config.item_keys, ['featured-work-2']);
  assert.deepEqual(updated.sections[1].media_use_keys, ['featured-work-media-2']);
  assert.deepEqual(updated.media_refs['featured-work-media-2'], { asset_id: 'assetv000000001', purpose: 'gallery' });
  assert.deepEqual(updated.content_by_locale.es.media_alt['featured-work-media-2'], { alt: 'Recorrido del proyecto', decorative: false });
  assert.deepEqual(
    new Set(backendContract.changedActionKeys(original, updated, assets)),
    new Set(['promo.content.manage', 'promo.media.manage', 'promo.media.video.manage']),
  );
  assert.deepEqual({
    theme: updated.theme, contact: updated.contact, adapters: updated.adapters,
    en: updated.content_by_locale.en, hero: updated.sections[0], contactSection: updated.sections[3],
  }, protectedBefore);
});

test('eliminar del locale base conserva refs traducidas y limpia refs sin otro consumidor', () => {
  const original = completeDocument();
  const update = patch(original);
  update.sections[0].items = [];
  update.sections[1].items = [];
  const updated = buildPromoGalleryDocument(original, update, 24, assets);
  assert.equal(Object.hasOwn(updated.media_refs, 'featured-work-media-1'), true, 'la traducción inglesa conserva su ref');
  assert.equal(Object.hasOwn(updated.media_refs, 'gallery-item-media-1'), true, 'la traducción inglesa conserva su ref');
  assert.deepEqual(updated.content_by_locale.es.media_alt, {});
  assert.deepEqual(updated.content_by_locale.en, original.content_by_locale.en);

  delete original.content_by_locale.en.media_alt['gallery-item-media-1'];
  const cleaned = buildPromoGalleryDocument(original, update, 24, assets);
  assert.equal(Object.hasOwn(cleaned.media_refs, 'gallery-item-media-1'), false);
});

test('cuota y metadata accesible fallan cerradas antes de delegar al backend', () => {
  const original = completeDocument();
  const update = patch(original);
  assert.throws(
    () => buildPromoGalleryDocument(original, update, 0, assets),
    (error) => error instanceof PromoCmsError && error.code === 'promo_capability_denied',
  );
  update.sections[1].items[0].alt = '';
  assert.throws(
    () => buildPromoGalleryDocument(original, update, 24, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
  update.sections[1].items[0].alt = 'Detalle';
  update.sections[1].items[0].assetId = 'assetdeotro000';
  assert.throws(
    () => buildPromoGalleryDocument(original, update, 24, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_media_reference',
  );
});

test('catálogo privado y preview aceptan solo descriptores exactos y rutas same-origin', () => {
  const sha = 'a'.repeat(64);
  const catalog = normalizePromoGalleryCatalog({
    ok: true,
    contract: 'promo.media.catalog.v1',
    assets: [{
      asset_id: 'asseta000000001', kind: 'image', purpose: 'gallery', status: 'ready', mime: 'image/webp',
      bytes: 50000, width: 1200, height: 900, duration_ms: 0, poster_asset_id: '',
      preview: {
        url: `/api/pz/promo/private/v1/media/asseta000000001/${sha}/original.webp`,
        variants: [{ key: 'w480', width: 480, height: 360, url: `/api/pz/promo/private/v1/media/asseta000000001/${sha}/w480.webp` }],
        controls_required: false, autoplay: false,
      },
    }],
    usage: { images: 1, videos: 0, bytes: 50000 },
    limits: {
      max_image_bytes: 102400, max_video_bytes: 26214400, max_video_duration_ms: 1800000,
      max_stored_images: 200, max_stored_videos: 3, max_storage_bytes: 262144000,
      purposes: ['hero', 'service', 'gallery', 'owner', 'footer', 'social', 'video_poster'],
    },
  });
  assert.equal(catalog.assets[0].assetId, 'asseta000000001');
  assert.equal(promoGalleryPreviewPath('demo-store', 'asseta000000001'), '/api/admin/promo-media?store=demo-store&asset=asseta000000001');
  assert.equal(promoGalleryPreviewPath('../otro', 'asseta000000001'), '');
  assert.throws(() => normalizePromoGalleryCatalog({ ...catalog, tenant: 'otro' }), PromoCmsError);
});

test('shell y proxy usan auth central, tenant exacto, CAS y capabilities backend sin Commerce', () => {
  const shell = readFileSync(new URL('../src/components/admin/promo/PromoAdminShell.astro', import.meta.url), 'utf8');
  const editor = readFileSync(new URL('../src/components/admin/promo/PromoGalleryEditor.astro', import.meta.url), 'utf8');
  const mediaApi = readFileSync(new URL('../src/pages/api/admin/promo-media.ts', import.meta.url), 'utf8');
  assert.match(shell, /PromoGalleryEditor/);
  assert.match(shell, /promo\.media\.manage/);
  assert.match(shell, /promo\.content\.manage/);
  assert.match(shell, /promo\.media\.video\.manage/);
  assert.match(editor, /expected_version: draft\.version/);
  assert.match(editor, /preload = 'none'/);
  assert.match(editor, /data-item-alt/);
  assert.match(mediaApi, /refreshAuthFromCookie/);
  assert.match(mediaApi, /exactMediaQuery/);
  assert.match(mediaApi, /sec-fetch-site/);
  assert.match(mediaApi, /Range: rangeHeader/);
  assert.match(mediaApi, /X-PZ-Promo-Store/);
  assert.match(mediaApi, /promo\/private\/v1\/media/);
  assert.doesNotMatch(`${shell}\n${editor}\n${mediaApi}`, /products|categories|orders|checkout|cart|Cloudflare|Coolify/);
});
