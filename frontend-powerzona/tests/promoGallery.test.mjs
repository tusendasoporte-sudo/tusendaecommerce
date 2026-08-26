import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildPromoGalleryDocument,
  createPromoGalleryWorkspace,
  normalizePromoGalleryCatalog,
  promoGalleryPreviewPath,
  PROMO_GALLERY_HARD_MAX_VIDEOS,
  PROMO_PRODUCT_MAX_MEDIA,
} from '../src/lib/promoGallery.ts';
import { PROMO_CMS_VIDEO_GALLERY_KEY, PromoCmsError } from '../src/lib/promoCms.ts';

const require = createRequire(import.meta.url);
const backendContract = require('../../backend-powerzona/pb_hooks/pz_promo_pubcfg_lib.js');

function emptyDocument() {
  return {
    contract: 'promo.site.v2',
    system_catalog_version: 'promo.system.v1',
    locales: { default: '', published: [] },
    theme: { theme_id: '', version: '', tokens: {} },
    identity: { public_business_key: '' },
    section_order: [],
    sections: [],
    media_refs: {},
    contact: {
      enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [],
      logo_media_use_key: '', qr_media_use_key: '',
    },
    content_by_locale: {},
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function localized(name) {
  return {
    identity: { name, slogan: 'Oficio y cuidado', summary: '' },
    navigation: {}, sections: {}, contact: {}, media_alt: {},
    seo: { title: 'Galería Demo', description: 'Descripción del sitio de demostración.' },
  };
}

const assets = [
  {
    assetId: 'asseth000000001', kind: 'image', purpose: 'hero', status: 'ready', mime: 'image/webp',
    bytes: 60000, width: 1280, height: 720, durationMs: 0, posterAssetId: '',
  },
  {
    assetId: 'assetg000000001', kind: 'image', purpose: 'gallery', status: 'ready', mime: 'image/webp',
    bytes: 50000, width: 1200, height: 900, durationMs: 0, posterAssetId: '',
  },
  {
    assetId: 'assetv000000001', kind: 'video', purpose: 'gallery', status: 'ready', mime: 'video/mp4',
    bytes: 1000000, width: 1280, height: 720, durationMs: 5000, posterAssetId: 'poster000000001',
  },
];

function completeDocument() {
  const document = emptyDocument();
  document.locales = { default: 'es', published: ['en', 'es'] };
  document.theme = { theme_id: 'promo.black-gold', version: '1.0.0', tokens: { surface: 'obsidian' } };
  document.identity = { public_business_key: 'negocio-demo' };
  document.section_order = [
    'hero-main', 'services-main', 'featured-work-main', 'gallery-rugs', 'contact-main', 'footer-main',
  ];
  document.sections = [
    {
      key: 'hero-main', type: 'hero', variant: 'default', visible: true,
      config: { media_use_key: '', action_key: '' }, media_use_keys: [],
    },
    {
      key: 'services-main', type: 'services', variant: 'default', visible: true,
      config: { item_keys: ['service-clean'], gallery_keys: ['gallery-rugs'] }, media_use_keys: [],
    },
    {
      key: 'featured-work-main', type: 'featured_work', variant: 'default', visible: true,
      config: { item_keys: [] }, media_use_keys: [],
    },
    {
      key: 'gallery-rugs', type: 'gallery', variant: 'default', visible: true,
      config: {
        item_keys: ['rug-one'],
        cover_media_use_key: 'gallery-item-media-1',
        items: [{
          key: 'rug-one', media_use_keys: ['gallery-item-media-1'], featured: true, visible: true,
        }],
      },
      media_use_keys: ['gallery-item-media-1'],
    },
    {
      key: 'contact-main', type: 'contact', variant: 'default', visible: true,
      config: { action_keys: [] }, media_use_keys: [],
    },
    {
      key: 'footer-main', type: 'footer', variant: 'default', visible: true,
      config: { navigation_section_keys: ['hero-main', 'gallery-rugs'], social_profiles: [] }, media_use_keys: [],
    },
  ];
  document.media_refs = {
    'gallery-item-media-1': { asset_id: 'assetg000000001', purpose: 'gallery' },
  };
  const es = localized('Negocio demo');
  es.navigation = {
    'hero-main': 'Inicio', 'services-main': 'Servicios', 'featured-work-main': 'Destacados',
    'gallery-rugs': 'Alfombras', 'contact-main': 'Contacto', 'footer-main': 'Pie',
  };
  es.sections = {
    'hero-main': { heading: 'Portada', summary: '' },
    'services-main': {
      heading: 'Servicios', summary: '',
      items: [{ key: 'service-clean', name: 'Limpieza', summary: 'Cuidado experto', caption: '' }],
    },
    'featured-work-main': { heading: 'Destacados', summary: 'Selección desde galerías' },
    'gallery-rugs': {
      heading: 'Alfombras', summary: 'Trabajos y productos',
      items: [{ key: 'rug-one', name: 'Alfombra persa', summary: 'Restauración completa', caption: 'Detalle' }],
    },
    'contact-main': { heading: 'Contacto', summary: '' },
    'footer-main': { heading: 'Visítanos', summary: '', text: 'Atención con cita previa.' },
  };
  es.media_alt = {
    'gallery-item-media-1': { alt: 'Alfombra persa restaurada', decorative: false },
  };
  const en = structuredClone(es);
  en.identity.name = 'Demo business';
  en.navigation['gallery-rugs'] = 'Rugs';
  en.sections['gallery-rugs'] = {
    heading: 'Rugs', summary: 'Works and products',
    items: [{ key: 'rug-one', name: 'Persian rug', summary: 'Complete restoration', caption: 'Detail' }],
  };
  en.media_alt['gallery-item-media-1'].alt = 'Restored Persian rug';
  document.content_by_locale = { en, es };
  return document;
}

function patch(document = completeDocument()) {
  const locale = document.locales.default;
  const localized = document.content_by_locale[locale];
  const hero = document.sections.find((section) => section.type === 'hero');
  return {
    heroMedia: hero.media_use_keys.map((useKey) => ({
      useKey,
      assetId: document.media_refs[useKey].asset_id,
      alt: localized.media_alt[useKey].alt,
      decorative: localized.media_alt[useKey].decorative,
    })),
    galleries: document.sections.filter((section) => section.type === 'gallery').map((section) => {
      const content = localized.sections[section.key];
      const copies = new Map(content.items.map((item) => [item.key, item]));
      return {
        key: section.key,
        visible: section.visible,
        navigationLabel: localized.navigation[section.key],
        heading: content.heading,
        summary: content.summary,
        coverUseKey: section.config.cover_media_use_key,
        items: section.config.items.map((item) => ({
          key: item.key,
          featured: item.featured,
          visible: item.visible,
          name: copies.get(item.key).name,
          summary: copies.get(item.key).summary,
          caption: copies.get(item.key).caption,
          media: item.media_use_keys.map((useKey) => ({
            useKey,
            assetId: document.media_refs[useKey].asset_id,
            alt: localized.media_alt[useKey].alt,
            decorative: localized.media_alt[useKey].decorative,
          })),
        })),
      };
    }),
  };
}

test('workspace vacío crea portada, destacados derivados y una galería base', () => {
  const workspace = createPromoGalleryWorkspace(emptyDocument());
  assert.equal(workspace.locale, 'es');
  assert.deepEqual(workspace.document.locales, { default: 'es', published: ['es'] });
  assert.deepEqual(workspace.document.sections.map((section) => section.type), ['hero', 'featured_work', 'gallery']);
  assert.deepEqual(workspace.document.sections.find((section) => section.type === 'featured_work').config.item_keys, []);
  assert.equal(workspace.document.sections.find((section) => section.type === 'gallery').visible, false);
});

test('la sección Videos admite hasta tres tarjetas y rechaza medios que no sean video', () => {
  const workspace = createPromoGalleryWorkspace(emptyDocument());
  const videoItems = Array.from({ length: PROMO_GALLERY_HARD_MAX_VIDEOS }, (_, index) => ({
    key: `video-${index + 1}`,
    featured: false,
    visible: true,
    name: `Video ${index + 1}`,
    summary: '',
    caption: '',
    media: [{
      useKey: `video-media-${index + 1}`,
      assetId: 'assetv000000001',
      alt: `Video ${index + 1}`,
      decorative: false,
    }],
  }));
  const videoPatch = {
    heroMedia: [],
    galleries: [{
      key: PROMO_CMS_VIDEO_GALLERY_KEY,
      visible: true,
      navigationLabel: 'Videos',
      heading: 'Videos',
      summary: '',
      coverUseKey: 'video-media-1',
      items: videoItems,
    }],
  };
  const updated = buildPromoGalleryDocument(workspace.document, videoPatch, 12, assets);
  const videos = updated.sections.find((section) => section.key === PROMO_CMS_VIDEO_GALLERY_KEY);
  assert.equal(videos.config.items.length, 3);
  assert.equal(videos.config.items.every((item) => item.media_use_keys.length === 1), true);

  const tooMany = structuredClone(videoPatch);
  tooMany.galleries[0].items.push({
    ...structuredClone(videoItems[0]),
    key: 'video-4',
    media: [{ ...structuredClone(videoItems[0].media[0]), useKey: 'video-media-4' }],
  });
  assert.throws(
    () => buildPromoGalleryDocument(workspace.document, tooMany, 12, assets),
    (error) => error instanceof PromoCmsError && error.code === 'promo_capability_denied',
  );

  const imageInstead = structuredClone(videoPatch);
  imageInstead.galleries[0].items = [{
    ...imageInstead.galleries[0].items[0],
    media: [{ useKey: 'video-image-1', assetId: 'assetg000000001', alt: 'Imagen', decorative: false }],
  }];
  imageInstead.galleries[0].coverUseKey = 'video-image-1';
  assert.throws(
    () => buildPromoGalleryDocument(workspace.document, imageInstead, 12, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
});
test('editor guarda carrusel y productos internos sin exponer enlaces de galería', () => {
  const original = completeDocument();
  const update = patch(original);
  update.heroMedia = [{
    useKey: 'hero-media-1', assetId: 'asseth000000001',
    alt: 'Taller de restauración', decorative: false,
  }];
  update.galleries[0].items = [{
    key: 'rug-video', featured: true, visible: true,
    name: 'Proceso audiovisual', summary: 'Resumen', caption: 'Video final',
    media: [{
      useKey: 'gallery-item-media-2', assetId: 'assetv000000001',
      alt: 'Recorrido del proyecto', decorative: false,
    }],
  }];
  update.galleries[0].coverUseKey = 'gallery-item-media-2';
  const protectedBefore = structuredClone({
    theme: original.theme,
    contact: original.contact,
    adapters: original.adapters,
    services: original.sections[1],
    contactSection: original.sections[4],
    footer: original.sections[5],
    enCopy: {
      identity: original.content_by_locale.en.identity,
      navigation: original.content_by_locale.en.navigation,
      sections: Object.fromEntries(Object.entries(original.content_by_locale.en.sections)
        .filter(([key]) => key !== 'gallery-rugs')),
      contact: original.content_by_locale.en.contact,
      seo: original.content_by_locale.en.seo,
    },
  });
  protectedBefore.footer.config.navigation_section_keys = protectedBefore.footer.config.navigation_section_keys
    .filter((sectionKey) => sectionKey !== 'gallery-rugs');
  const updated = buildPromoGalleryDocument(original, update, 24, assets);
  assert.deepEqual(backendContract.validatePromoDocument(updated, { publicRevision: false }), updated);
  const gallery = updated.sections.find((section) => section.type === 'gallery');
  assert.equal(gallery.config.items[0].featured, true);
  assert.deepEqual(gallery.config.items[0].media_use_keys, ['gallery-item-media-2']);
  assert.deepEqual(gallery.media_use_keys, ['gallery-item-media-2']);
  assert.deepEqual(updated.sections.find((section) => section.type === 'featured_work').config.item_keys, []);
  assert.deepEqual(updated.media_refs['hero-media-1'], { asset_id: 'asseth000000001', purpose: 'hero' });
  assert.deepEqual(updated.media_refs['gallery-item-media-2'], { asset_id: 'assetv000000001', purpose: 'gallery' });
  assert.deepEqual(updated.content_by_locale.es.media_alt['gallery-item-media-2'], {
    alt: 'Recorrido del proyecto', decorative: false,
  });
  assert.equal(updated.sections.find((section) => section.type === 'footer')
    .config.navigation_section_keys.includes('gallery-rugs'), false);
  assert.equal(updated.content_by_locale.en.sections['gallery-rugs'].items[0].name, 'Proceso audiovisual');
  assert.deepEqual(
    new Set(backendContract.changedActionKeys(original, updated, assets)),
    new Set([
      'promo.content.manage', 'promo.media.manage', 'promo.media.video.manage', 'promo.translations.manage',
    ]),
  );
  assert.deepEqual({
    theme: updated.theme,
    contact: updated.contact,
    adapters: updated.adapters,
    services: updated.sections[1],
    contactSection: updated.sections[4],
    footer: updated.sections[5],
    enCopy: {
      identity: updated.content_by_locale.en.identity,
      navigation: updated.content_by_locale.en.navigation,
      sections: Object.fromEntries(Object.entries(updated.content_by_locale.en.sections)
        .filter(([key]) => key !== 'gallery-rugs')),
      contact: updated.content_by_locale.en.contact,
      seo: updated.content_by_locale.en.seo,
    },
  }, protectedBefore);
});

test('eliminar una galería limpia sus medios y vínculos de servicios y pie', () => {
  const original = completeDocument();
  const update = patch(original);
  update.galleries = [];
  const updated = buildPromoGalleryDocument(original, update, 24, assets);
  assert.equal(updated.sections.some((section) => section.type === 'gallery'), false);
  assert.deepEqual(updated.sections.find((section) => section.type === 'services').config.gallery_keys, ['']);
  assert.deepEqual(updated.sections.find((section) => section.type === 'footer').config.navigation_section_keys, ['hero-main']);
  assert.equal(Object.hasOwn(updated.media_refs, 'gallery-item-media-1'), false);
  assert.equal(Object.hasOwn(updated.content_by_locale.es.media_alt, 'gallery-item-media-1'), false);
  assert.equal(Object.hasOwn(updated.content_by_locale.en.media_alt, 'gallery-item-media-1'), false);
});

test('servicio admite portada independiente y cada producto queda limitado a tres medios', () => {
  const original = completeDocument();
  const update = patch(original);
  update.galleries[0].coverUseKey = 'service-cover-media';
  update.galleries[0].coverMedia = {
    useKey: 'service-cover-media', assetId: 'assetg000000001',
    alt: 'Portada del servicio de alfombras', decorative: false,
  };
  const updated = buildPromoGalleryDocument(original, update, 150, assets);
  const gallery = updated.sections.find((section) => section.key === 'gallery-rugs');
  assert.equal(gallery.config.cover_media_use_key, 'service-cover-media');
  assert.deepEqual(gallery.media_use_keys, ['service-cover-media', 'gallery-item-media-1']);
  assert.deepEqual(updated.media_refs['service-cover-media'], {
    asset_id: 'assetg000000001', purpose: 'gallery',
  });
  assert.equal(PROMO_PRODUCT_MAX_MEDIA, 3);

  const tooMany = patch(original);
  tooMany.galleries[0].items[0].media = Array.from({ length: 4 }, (_, index) => ({
    useKey: `gallery-product-media-${index + 1}`,
    assetId: 'assetg000000001', alt: `Foto ${index + 1}`, decorative: false,
  }));
  tooMany.galleries[0].coverUseKey = 'gallery-product-media-1';
  assert.throws(
    () => buildPromoGalleryDocument(original, tooMany, 150, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_payload',
  );
});

test('cuota, portada y metadata accesible fallan cerradas', () => {
  const original = completeDocument();
  const update = patch(original);
  assert.throws(
    () => buildPromoGalleryDocument(original, update, 0, assets),
    (error) => error instanceof PromoCmsError && error.code === 'promo_capability_denied',
  );
  update.galleries[0].items[0].media[0].alt = '';
  assert.throws(
    () => buildPromoGalleryDocument(original, update, 24, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
  update.galleries[0].items[0].media[0].alt = 'Detalle';
  update.galleries[0].items[0].media[0].assetId = 'assetdeotro000';
  assert.throws(
    () => buildPromoGalleryDocument(original, update, 24, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_media_reference',
  );
  const missingCover = patch(original);
  missingCover.galleries[0].coverUseKey = '';
  assert.throws(
    () => buildPromoGalleryDocument(original, missingCover, 24, assets),
    (error) => error instanceof PromoCmsError && error.code === 'invalid_promo_document',
  );
});

test('catálogo privado y preview aceptan solo descriptores exactos y rutas same-origin', () => {
  const sha = 'a'.repeat(64);
  const catalog = normalizePromoGalleryCatalog({
    ok: true,
    contract: 'promo.media.catalog.v1',
    assets: [{
      asset_id: 'assetg000000001', kind: 'image', purpose: 'gallery', status: 'ready', mime: 'image/webp',
      bytes: 50000, width: 1200, height: 900, duration_ms: 0, poster_asset_id: '',
      preview: {
        url: `/api/pz/promo/private/v1/media/assetg000000001/${sha}/original.webp`,
        variants: [{
          key: 'w480', width: 480, height: 360,
          url: `/api/pz/promo/private/v1/media/assetg000000001/${sha}/w480.webp`,
        }],
        controls_required: false, autoplay: false,
      },
    }],
    usage: { images: 1, videos: 0, bytes: 50000 },
    limits: {
      max_image_bytes: 102400, max_video_bytes: 26214400, max_video_duration_ms: 1800000,
      max_stored_images: 150, max_stored_videos: 3, max_storage_bytes: 262144000,
      purposes: ['hero', 'service', 'gallery', 'owner', 'footer', 'social', 'video_poster', 'qr'],
    },
  });
  assert.equal(catalog.assets[0].assetId, 'assetg000000001');
  assert.equal(
    promoGalleryPreviewPath('demo-store', 'assetg000000001'),
    '/api/admin/promo-media?store=demo-store&asset=assetg000000001',
  );
  assert.equal(promoGalleryPreviewPath('../otro', 'assetg000000001'), '');
  assert.throws(() => normalizePromoGalleryCatalog({ ...catalog, tenant: 'otro' }), PromoCmsError);
});

test('shell separa Galería y productos sin biblioteca privada y conserva el proxy central', () => {
  const shell = readFileSync(new URL('../src/components/admin/promo/PromoAdminShell.astro', import.meta.url), 'utf8');
  const cmsEditor = readFileSync(new URL('../src/components/admin/promo/PromoCmsEditor.astro', import.meta.url), 'utf8');
  const productsEditor = readFileSync(new URL('../src/components/admin/promo/PromoServiceProductsEditor.astro', import.meta.url), 'utf8');
  const moduleRoute = readFileSync(new URL('../src/pages/t/[storeSlug]/admin/promo/[section].astro', import.meta.url), 'utf8');
  const mediaApi = readFileSync(new URL('../src/pages/api/admin/promo-media.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(shell, /PromoGalleryEditor/);
  assert.match(shell, /section === 'gallery'[\s\S]*?<PromoServiceProductsEditor/);
  assert.match(shell, /promo\.media\.manage/);
  assert.match(shell, /promo\.content\.manage/);
  assert.match(shell, /PromoServiceProductsEditor/);
  assert.match(cmsEditor, /mediaEndpoint/);
  assert.match(cmsEditor, /expected_version: version/);
  assert.doesNotMatch(moduleRoute, /requestedModule === 'gallery'/);
  assert.match(mediaApi, /refreshAuthFromCookie/);
  assert.match(mediaApi, /exactMediaQuery/);
  assert.match(mediaApi, /sec-fetch-site/);
  assert.match(mediaApi, /Range: rangeHeader/);
  assert.match(mediaApi, /X-PZ-Promo-Store/);
  assert.match(mediaApi, /promo\/private\/v1\/media/);
  assert.match(productsEditor, /Galería y productos/);
  assert.match(productsEditor, /data-products-videos/);
  assert.match(productsEditor, /PROMO_CMS_VIDEO_GALLERY_KEY/);
  assert.match(productsEditor, /Math\.min\(3/);
  assert.match(productsEditor, /PROMO_PRODUCT_MAX_MEDIA/);
  assert.match(productsEditor, /data-products-add-hero-video/);
  assert.doesNotMatch(productsEditor, /Biblioteca privada|Crear otra galería/);
  assert.doesNotMatch(`${shell}\n${cmsEditor}\n${mediaApi}`, /orders|checkout|cart|Cloudflare|Coolify/);
});
