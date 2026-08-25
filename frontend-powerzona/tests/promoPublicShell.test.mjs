import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import test from 'node:test';

import {
  customPromoPublicPath,
  isPromoPlatformRequest,
  normalizePromoPublicShellResponse,
  PROMO_PUBLIC_INTERNAL_PATH,
  PromoPublicShellError,
  promoHostEndpoint,
  promoPlatformEndpoint,
  readCustomHostPromoShell,
} from '../src/lib/promoPublicShell.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const messages = Object.fromEntries([
  'a11y.contact_action', 'a11y.footer_links', 'a11y.footer_social', 'a11y.footer_social_link',
  'a11y.landing_qr_link',
  'a11y.language_selector', 'a11y.main_content', 'a11y.main_navigation', 'a11y.skip_to_content',
  'contact.call', 'contact.email', 'contact.open_chat',
  'contact.request_estimate', 'contact.send_message', 'contact.unavailable', 'contact.whatsapp',
  'error.locale_unavailable', 'error.site_unavailable', 'locale.current', 'locale.option_aria',
  'footer.platform_branding', 'landing_qr.open',
  'navigation.contact', 'navigation.gallery', 'navigation.home', 'navigation.owner',
  'navigation.services', 'reviews.average', 'reviews.count.many', 'reviews.count.one',
  'reviews.empty', 'reviews.list', 'reviews.rating', 'reviews.unavailable',
  'state.available', 'state.loading', 'state.unavailable',
].map((key) => [key, key]));

function shellEnvelope(source = 'platform') {
  const basePath = source === 'platform' ? '/promo/demo-promo' : '';
  const origin = source === 'platform' ? 'https://tusenda84.com' : 'https://primary.example.test';
  const canonicalUrl = `${origin}${basePath}/es`;
  return {
    ok: true,
    contract: 'promo.public.shell.v1',
    route: { source, action: 'serve' },
    seo: {
      contract: 'promo.public.seo.v1',
      canonical_url: canonicalUrl,
      sitemap_url: `${origin}${basePath}/sitemap.xml`,
      alternates: [{ locale: 'es', url: canonicalUrl }],
      x_default: canonicalUrl,
      open_graph: {
        type: 'website', url: canonicalUrl, title: 'Negocio demo',
        description: 'Presentación pública', site_name: 'Negocio demo', locale: 'es',
        alternate_locales: [], image: null,
      },
      twitter: {
        card: 'summary', title: 'Negocio demo', description: 'Presentación pública',
        image: '', image_alt: '',
      },
    },
    profile: {
      ok: true,
      contract: 'promo.public.localized.v1',
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
      contact_action: { contract: 'promo.contact.action.v1', available: false, action: null },
      footer: { contract: 'promo.footer.v1', sections: [] },
      content: {
        identity: { name: 'Negocio demo', summary: 'Presentación pública' },
        navigation: { 'hero-main': 'Inicio' },
        sections: { 'hero-main': { heading: 'Negocio demo', summary: 'Trabajo profesional' } },
        contact: {}, media_alt: {}, seo: { title: 'Negocio demo', description: 'Presentación pública' },
      },
      adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
      store_rating: {
        contract: 'promo.store-rating.v1', enabled: false,
        summary: { average: 0, count: 0 }, reviews: [],
      },
      landing_qr_link: { contract: 'promo.landing-qr-link.v1', enabled: false, link: null },
    },
  };
}

function shellEnvelopeWithFooter() {
  const envelope = shellEnvelope();
  Object.assign(envelope.profile.system.messages, {
    'a11y.footer_links': '{business} site links',
    'a11y.footer_social': '{business} social media',
    'a11y.footer_social_link': 'Visit {business} on {network}',
    'footer.platform_branding': 'Promo presence on',
  });
  envelope.profile.section_order = ['hero-main', 'footer-main'];
  envelope.profile.sections.push({
    key: 'footer-main', type: 'footer', variant: 'default',
    config: {
      navigation_section_keys: ['hero-main'],
      social_profiles: [
        { network: 'instagram', handle: 'demo.business' },
        { network: 'linkedin', handle: 'demo-business' },
      ],
    },
    media_use_keys: [],
  });
  envelope.profile.content.navigation['footer-main'] = 'Site footer';
  envelope.profile.content.sections['footer-main'] = {
    heading: 'Stay connected', summary: 'Official links', text: 'Visits by appointment.',
  };
  envelope.profile.footer = {
    contract: 'promo.footer.v1',
    sections: [{
      key: 'footer-main',
      navigation_label: 'Negocio demo site links',
      social_label: 'Negocio demo social media',
      navigation_links: [{ section_key: 'hero-main', label: 'Inicio', href: '#promo-section-hero-main' }],
      social_links: [
        {
          network: 'instagram', label: 'Instagram',
          aria_label: 'Visit Negocio demo on Instagram',
          href: 'https://www.instagram.com/demo.business/',
        },
        {
          network: 'linkedin', label: 'LinkedIn',
          aria_label: 'Visit Negocio demo on LinkedIn',
          href: 'https://www.linkedin.com/company/demo-business/',
        },
      ],
      branding: { label: 'Promo presence on', name: 'Tu Senda 84' },
    }],
  };
  return envelope;
}

function imageDelivery({
  slug = 'demo-promo', key = 'hero-main-media', purpose = 'hero', width = 1280, height = 720,
  priority = true, poster = false, sha = 'a'.repeat(64),
} = {}) {
  const policies = {
    hero: { widths: [480, 768, 1280], sizes: '100vw' },
    service: { widths: [320, 640, 960], sizes: '(min-width: 900px) 33vw, 100vw' },
    gallery: { widths: [480, 768, 1280], sizes: '(min-width: 900px) 50vw, 100vw' },
    owner: { widths: [320, 640, 960], sizes: '(min-width: 900px) 40vw, 100vw' },
    video_poster: { widths: [480, 960, 1440], sizes: '100vw' },
  };
  const policy = policies[purpose];
  assert.ok(policy, `purpose MEDIA sin fixture: ${purpose}`);
  const prefix = poster ? 'poster-' : '';
  const sources = [...policy.widths.filter((candidate) => candidate < width).map((candidate) => ({
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
    sizes: policy.sizes, loading: priority ? 'eager' : 'lazy',
    fetch_priority: priority ? 'high' : 'auto', decoding: 'async',
  };
}

function shellEnvelopeWithSections() {
  const envelope = shellEnvelope();
  envelope.profile.section_order = [
    'services-main', 'featured-main', 'gallery-main', 'owner-main',
  ];
  envelope.profile.sections = [
    {
      key: 'services-main', type: 'services', variant: 'default',
      config: { item_keys: ['service-clean', 'service-restore'] },
      media_use_keys: ['service-clean-media', 'service-restore-media'],
    },
    {
      key: 'featured-main', type: 'featured_work', variant: 'default',
      config: { item_keys: ['featured-hall'] }, media_use_keys: ['featured-hall-media'],
    },
    {
      key: 'gallery-main', type: 'gallery', variant: 'default',
      config: { item_keys: ['gallery-room', 'gallery-stair'] },
      media_use_keys: ['gallery-room-media', 'gallery-stair-media'],
    },
    {
      key: 'owner-main', type: 'owner', variant: 'default',
      config: { media_use_key: 'owner-portrait' }, media_use_keys: [],
    },
  ];
  const mediaDefinitions = [
    ['service-clean-media', 'service', 640, 640, 'Limpieza cuidadosa'],
    ['service-restore-media', 'service', 640, 640, 'Restauración artesanal'],
    ['featured-hall-media', 'gallery', 960, 720, 'Salón con alfombra restaurada'],
    ['gallery-room-media', 'gallery', 960, 720, 'Detalle de una alfombra en sala'],
    ['owner-portrait', 'owner', 640, 800, 'Retrato del propietario'],
  ];
  envelope.profile.media = mediaDefinitions.map(([key, purpose, width, height, alt], index) => ({
    key, purpose, kind: 'image', width, height, duration_ms: 0,
    delivery: imageDelivery({ key, purpose, width, height, priority: false, sha: String(index + 1).repeat(64) }),
    accessibility: { alt, decorative: false },
  }));
  envelope.profile.media.push({
    key: 'gallery-stair-media', purpose: 'gallery', kind: 'video', width: 960, height: 540,
    duration_ms: 12_000,
    delivery: {
      contract: 'promo.media.delivery.v1', mime: 'video/webm',
      src: `/api/pz/promo/public/v1/sites/demo-promo/media/gallery-stair-media/${'9'.repeat(64)}/original.webm`,
      preload: 'none', controls_required: true, autoplay: false, plays_inline: true,
      reduced_motion: 'poster', save_data: 'poster',
      poster: imageDelivery({
        key: 'gallery-stair-media', purpose: 'video_poster', width: 960, height: 540,
        priority: false, poster: true, sha: '8'.repeat(64),
      }),
    },
    accessibility: { alt: 'Escalera renovada con alfombra', decorative: false },
  });
  envelope.profile.content = {
    identity: { name: 'Negocio demo', summary: 'Presentación pública' },
    navigation: {
      'services-main': 'Servicios', 'featured-main': 'Trabajo destacado',
      'gallery-main': 'Galería', 'owner-main': 'Propietario',
    },
    sections: {
      'services-main': {
        heading: 'Cuidado para cada pieza', summary: 'Servicios especializados',
        items: [
          { key: 'service-clean', name: 'Limpieza', summary: 'Proceso delicado', caption: 'Cuidado experto' },
          { key: 'service-restore', name: 'Restauración', summary: 'Detalle artesanal', caption: 'Acabado premium' },
        ],
      },
      'featured-main': {
        heading: 'Una pieza recuperada', summary: 'Trabajo destacado',
        items: [{ key: 'featured-hall', name: 'Salón principal', summary: 'Restauración completa', caption: 'Proyecto reciente' }],
      },
      'gallery-main': {
        heading: 'Nuestro trabajo', summary: 'Selección visual',
        items: [
          { key: 'gallery-room', caption: 'Detalle en sala' },
          { key: 'gallery-stair', caption: 'Instalación en escalera' },
        ],
      },
      'owner-main': { heading: 'Tradición personal', name: 'Dueño artesano', bio: 'Experiencia y oficio.' },
    },
    contact: {},
    media_alt: Object.fromEntries(envelope.profile.media.map((media) => [
      media.key, media.accessibility,
    ])),
    seo: { title: 'Negocio demo', description: 'Presentación pública' },
  };
  return envelope;
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
  envelope.profile.contact_action = {
    contract: 'promo.contact.action.v1',
    available: true,
    action: {
      key: 'estimate', type: 'phone', label: 'Solicitar estimado',
      aria_label: 'Solicitar un estimado', href: 'tel:+5351234567',
    },
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
  assert.equal(normalized.seo.canonical_url, 'https://tusenda84.com/promo/demo-promo/es');
  assert.equal(normalized.seo.open_graph.type, 'website');
  assert.equal(normalized.profile.content.identity.name, 'Negocio demo');
  assert.equal(normalized.profile.theme.renderer_key, 'promo.black-gold');
  const hostile = structuredClone(shellEnvelope());
  hostile.profile.theme.tokens.accent = '#ff00ff';
  assert.throws(() => normalizePromoPublicShellResponse(hostile), PromoPublicShellError);
  const leaked = structuredClone(shellEnvelope());
  leaked.profile.store_id = 'storeaaaaaaaaaa';
  assert.throws(() => normalizePromoPublicShellResponse(leaked), PromoPublicShellError);
  const wrongLocalizedContract = structuredClone(shellEnvelope());
  wrongLocalizedContract.profile.contract = 'promo.public.localized.v2';
  assert.throws(() => normalizePromoPublicShellResponse(wrongLocalizedContract), PromoPublicShellError);
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

test('CONTACT acepta solo la acción principal compilada, allowlisted y localized', () => {
  const normalized = normalizePromoPublicShellResponse(shellEnvelopeWithHeroMedia());
  assert.equal(normalized.profile.contact_action.available, true);
  assert.deepEqual(normalized.profile.contact_action.action, {
    key: 'estimate', type: 'phone', label: 'Solicitar estimado',
    aria_label: 'Solicitar un estimado', href: 'tel:+5351234567',
  });

  const external = shellEnvelopeWithHeroMedia();
  external.profile.contact_action.action.href = 'https://tenant.example/contact';
  assert.throws(() => normalizePromoPublicShellResponse(external), PromoPublicShellError);
  const secondary = shellEnvelopeWithHeroMedia();
  secondary.profile.contact_action.action.key = 'secondary-contact';
  assert.throws(() => normalizePromoPublicShellResponse(secondary), PromoPublicShellError);
  const leaked = shellEnvelopeWithHeroMedia();
  leaked.profile.contact_action.action.phone_e164 = '+5351234567';
  assert.throws(() => normalizePromoPublicShellResponse(leaked), PromoPublicShellError);
  const unsafeMail = shellEnvelopeWithHeroMedia();
  unsafeMail.profile.contact_action.action.type = 'email';
  unsafeMail.profile.contact.actions[0].type = 'email';
  unsafeMail.profile.contact_action.action.href = 'mailto:demo@example.com?body=ok%0D%0ABcc%3Aattacker%40example.com';
  assert.throws(() => normalizePromoPublicShellResponse(unsafeMail), PromoPublicShellError);
});

test('FOOTER acepta solo enlaces compilados, redes tipadas y branding reservado', () => {
  const normalized = normalizePromoPublicShellResponse(shellEnvelopeWithFooter());
  const footer = normalized.profile.footer.sections[0];
  assert.deepEqual(footer.navigation_links, [{
    section_key: 'hero-main', label: 'Inicio', href: '#promo-section-hero-main',
  }]);
  assert.deepEqual(footer.social_links.map((link) => [link.network, link.href]), [
    ['instagram', 'https://www.instagram.com/demo.business/'],
    ['linkedin', 'https://www.linkedin.com/company/demo-business/'],
  ]);
  assert.deepEqual(footer.branding, { label: 'Promo presence on', name: 'Tu Senda 84' });

  const arbitrary = shellEnvelopeWithFooter();
  arbitrary.profile.footer.sections[0].social_links[0].href = 'https://tenant.example/social';
  assert.throws(() => normalizePromoPublicShellResponse(arbitrary), PromoPublicShellError);
  const reserved = shellEnvelopeWithFooter();
  reserved.profile.footer.sections[0].branding.name = 'Marca del tenant';
  assert.throws(() => normalizePromoPublicShellResponse(reserved), PromoPublicShellError);
  const commerce = shellEnvelopeWithFooter();
  commerce.profile.sections[1].config.navigation_section_keys = ['checkout'];
  assert.throws(() => normalizePromoPublicShellResponse(commerce), PromoPublicShellError);
});

test('QR acepta solo el acceso central compilado, localizado y separado del CTA', () => {
  const envelope = shellEnvelope();
  Object.assign(envelope.profile.system.messages, {
    'landing_qr.open': 'Más enlaces',
    'a11y.landing_qr_link': 'Abrir la página de enlaces de {business}',
  });
  envelope.profile.adapters.landing_qr_link.enabled = true;
  envelope.profile.landing_qr_link = {
    contract: 'promo.landing-qr-link.v1', enabled: true,
    link: {
      label: 'Más enlaces',
      aria_label: 'Abrir la página de enlaces de Negocio demo',
      href: 'https://tusenda84.com/t/aladdins-carpet/links',
    },
  };
  const normalized = normalizePromoPublicShellResponse(envelope);
  assert.deepEqual(normalized.profile.landing_qr_link, envelope.profile.landing_qr_link);
  assert.equal(normalized.profile.contact_action.available, false);

  const custom = structuredClone(envelope);
  custom.profile.landing_qr_link.link.href = 'https://tenant.example/links';
  assert.throws(() => normalizePromoPublicShellResponse(custom), PromoPublicShellError);
  const query = structuredClone(envelope);
  query.profile.landing_qr_link.link.href += '?store=other';
  assert.throws(() => normalizePromoPublicShellResponse(query), PromoPublicShellError);
  const mixedLocale = structuredClone(envelope);
  mixedLocale.profile.landing_qr_link.link.label = 'More links';
  assert.throws(() => normalizePromoPublicShellResponse(mixedLocale), PromoPublicShellError);
  const unapproved = structuredClone(envelope);
  unapproved.profile.adapters.landing_qr_link.enabled = false;
  assert.throws(() => normalizePromoPublicShellResponse(unapproved), PromoPublicShellError);
});

test('SECTIONS conserva orden CMS/GALLERY y delivery MEDIA lazy por propósito', () => {
  const normalized = normalizePromoPublicShellResponse(shellEnvelopeWithSections());
  assert.deepEqual(normalized.profile.section_order, [
    'services-main', 'featured-main', 'gallery-main', 'owner-main',
  ]);
  assert.deepEqual(
    normalized.profile.content.sections['services-main'].items.map((item) => item.key),
    ['service-clean', 'service-restore'],
  );
  assert.ok(normalized.profile.media.every((media) => (
    media.kind === 'image' ? media.delivery.loading === 'lazy' : media.delivery.preload === 'none'
  )));
  assert.equal(normalized.profile.media.find((media) => media.key === 'service-clean-media').purpose, 'service');
  assert.equal(normalized.profile.media.find((media) => media.key === 'owner-portrait').purpose, 'owner');
  assert.equal(normalized.profile.media.find((media) => media.key === 'gallery-stair-media').delivery.autoplay, false);

  const reordered = shellEnvelopeWithSections();
  reordered.profile.content.sections['services-main'].items.reverse();
  assert.throws(() => normalizePromoPublicShellResponse(reordered), PromoPublicShellError);
  const wrongPurpose = shellEnvelopeWithSections();
  wrongPurpose.profile.media.find((media) => media.key === 'owner-portrait').purpose = 'gallery';
  assert.throws(() => normalizePromoPublicShellResponse(wrongPurpose), PromoPublicShellError);
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
      'X-PZ-Promo-Cache-Contract': 'promo.public.cache.v1',
      'X-PZ-Promo-Cache-Key': 'a'.repeat(64),
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
    assert.equal(result.response.cacheKey, 'a'.repeat(64));
    assert.equal(observedHost, 'primary.example.test');
    assert.equal(observedPath, '/api/pz/promo/public/v1/shell/host');
  } finally {
    if (previous === undefined) delete process.env.PZ_POCKETBASE_INTERNAL_URL;
    else process.env.PZ_POCKETBASE_INTERNAL_URL = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('shell SSR es independiente de Layout y solo hidrata analítica Promo allowlisted', () => {
  const layout = read('../src/layouts/PromoPublicLayout.astro');
  const shell = read('../src/components/promo-public/PromoPublicShell.astro');
  const internal = read('../src/pages/promo-shell-internal.astro');
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const hero = read('../src/components/promo-public/PromoHero.astro');
  const contactAction = read('../src/components/promo-public/PromoContactAction.astro');
  const contact = read('../src/components/promo-public/PromoContact.astro');
  const footer = read('../src/components/promo-public/PromoFooter.astro');
  const sections = read('../src/components/promo-public/PromoSections.astro');
  const sectionMedia = read('../src/components/promo-public/PromoSectionMedia.astro');
  const styles = read('../src/styles/promo-public-shell.css');
  const themeStyles = read('../src/styles/promo-black-gold.css');
  const heroStyles = read('../src/styles/promo-hero.css');
  const contactStyles = read('../src/styles/promo-contact.css');
  const footerStyles = read('../src/styles/promo-footer.css');
  const sectionStyles = read('../src/styles/promo-sections.css');
  const middleware = read('../src/middleware.ts');
  const platform = read('../src/pages/promo/[publicSlug]/index.astro');
  const localized = read('../src/pages/promo/[publicSlug]/[locale].astro');
  const commerce = read('../src/pages/t/[storeSlug]/index.astro');
  const combined = `${layout}\n${shell}\n${theme}\n${hero}\n${contactAction}\n${contact}\n${footer}\n${sections}\n${sectionMedia}\n${styles}\n${themeStyles}\n${heroStyles}\n${contactStyles}\n${footerStyles}\n${sectionStyles}\n${platform}\n${localized}`;
  assert.match(shell, /PROMO_BLACK_GOLD_RENDERER_KEY/);
  assert.equal(PROMO_PUBLIC_INTERNAL_PATH, '/promo-shell-internal');
  assert.match(internal, /Astro\.locals\.promoPublicProfile/);
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
  assert.match(contactAction, /contact\.unavailable/);
  assert.match(contactAction, /href=\{action\.href\}/);
  assert.match(heroStyles, /scroll-snap-type: inline mandatory/);
  assert.match(theme, /specializedSectionTypes/);
  assert.match(theme, /<PromoSections/);
  assert.equal((combined.match(/<script/g) || []).length, 1, 'solo existe el collector focal de ANALYTICS');
  assert.match(layout, /promo\.analytics\.collect\.v1/);
  assert.match(layout, /credentials: 'omit'/);
  assert.doesNotMatch(combined, /layouts\/Layout\.astro|PublicStoreHome|innerHTML|set:html/);
  assert.doesNotMatch(combined, /cart|checkout|products|categories|orders|inventory|stock|price|currency|coupon|shipping/i);
  assert.match(platform, /Astro\.url\.search/);
  assert.match(localized, /Astro\.url\.search/);
  assert.match(middleware, /readCustomHostPromoShell/);
  assert.match(middleware, /customPromoPublicPath/);
  assert.match(middleware, /promoPublicUnavailable\(404\)/);
  assert.ok(commerce.indexOf('readPromoCommerceBridge') < commerce.indexOf("import('../../../components/public-store/PublicStoreHome.astro')"));
  assert.doesNotMatch(commerce, /storeSlug[^\n]*toLowerCase/);
});

test('renderer ALADDIN aplica la release negra/dorada y delega contacto y QR a renderers focales', () => {
  const layout = read('../src/layouts/PromoPublicLayout.astro');
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const contact = read('../src/components/promo-public/PromoContact.astro');
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
  assert.match(theme, /<PromoContact/);
  assert.match(theme, /<PromoLandingQrLink/);
  assert.match(contact, /data-contact-available/);
  assert.match(theme, /promo-shell-section__ornament/);
  assert.match(layout, /data-promo-token-accent=\{themeTokens\.accent\}/);
  assert.ok(Buffer.byteLength(styles, 'utf8') <= 50 * 1024, 'CSS del renderer excede el budget Theme de 50 KiB');
  assert.doesNotMatch(`${theme}\n${styles}`, /<img|<video|<button|tel:|mailto:|wa\.me|Escanéame|price|cart|checkout/i);
  assert.doesNotMatch(styles, /url\(|@import|https?:/i);
});

test('FOOTER renderiza datos localizados, navegación, redes y marca Master sin scripts', () => {
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const footer = read('../src/components/promo-public/PromoFooter.astro');
  const styles = read('../src/styles/promo-footer.css');
  const cms = read('../src/components/admin/promo/PromoCmsEditor.astro');
  const cmsLib = read('../src/lib/promoCms.ts');
  const allThemeStyles = [
    read('../src/styles/promo-black-gold.css'),
    read('../src/styles/promo-hero.css'),
    read('../src/styles/promo-sections.css'),
    read('../src/styles/promo-reviews.css'),
    read('../src/styles/promo-contact.css'),
    read('../src/styles/promo-landing-qr.css'),
    styles,
  ].join('\n');
  assert.match(theme, /<PromoFooter/);
  assert.match(footer, /profile\.footer\.sections\.find/);
  assert.match(footer, /aria-label=\{footer\.navigation_label\}/);
  assert.match(footer, /aria-label=\{footer\.social_label\}/);
  assert.match(footer, /aria-label=\{link\.aria_label\}/);
  assert.match(footer, /footer\.branding\.name/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.5fr\)/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cms, /dataCmsFooterSocial|cmsFooterSocial/);
  assert.match(cmsLib, /navigation_section_keys/);
  assert.match(cmsLib, /social_profiles/);
  assert.doesNotMatch(`${footer}\n${styles}`, /<script|onclick|addEventListener|innerHTML|set:html|target="_blank"/i);
  assert.doesNotMatch(styles, /url\(|@import|https?:/i);
  assert.ok(Buffer.byteLength(allThemeStyles, 'utf8') <= 64 * 1024,
    'CSS público combinado Promo excede el budget transitorio de 64 KiB');
});

test('HERO reutiliza exclusivamente el CTA principal compilado por CONTACT', () => {
  const hero = read('../src/components/promo-public/PromoHero.astro');
  const action = read('../src/components/promo-public/PromoContactAction.astro');
  const contactStyles = read('../src/styles/promo-contact.css');
  const heroStyles = read('../src/styles/promo-hero.css');
  assert.match(hero, /<PromoContactAction/);
  assert.match(hero, /profile\.contact\.primary_action_key/);
  assert.match(hero, /requestedActionKey === primaryActionKey/);
  assert.match(action, /href=\{action\.href\}/);
  assert.match(action, /aria-label=\{action\.aria_label\}/);
  assert.match(action, /data-contact-action="primary"/);
  assert.match(action, /role="status"/);
  assert.doesNotMatch(`${hero}\n${action}`, /<button|<form|target=|onclick|addEventListener|<script/i);
  assert.doesNotMatch(heroStyles, /url\(|@import|https?:/i);
  assert.match(hero, /href=\{`#\$\{sectionId\}-media-/);
  assert.doesNotMatch(contactStyles, /url\(|@import|https?:/i);
  assert.ok(Buffer.byteLength(`${read('../src/styles/promo-black-gold.css')}\n${heroStyles}\n${contactStyles}`, 'utf8') <= 50 * 1024,
    'CSS combinado ALADDIN/HERO/CONTACT excede el budget Theme de 50 KiB');
});

test('SECTIONS especializa servicios, trabajo, galería y propietario sin hidratar ni activar Commerce/contacto', () => {
  const theme = read('../src/components/promo-public/PromoBlackGoldTheme.astro');
  const sections = read('../src/components/promo-public/PromoSections.astro');
  const media = read('../src/components/promo-public/PromoSectionMedia.astro');
  const sectionStyles = read('../src/styles/promo-sections.css');
  const allThemeStyles = [
    read('../src/styles/promo-black-gold.css'),
    read('../src/styles/promo-hero.css'),
    sectionStyles,
  ].join('\n');
  assert.match(theme, /'services', 'featured_work', 'gallery', 'owner'/);
  assert.match(sections, /section\.type === 'services'/);
  assert.match(sections, /section\.type === 'featured_work'/);
  assert.match(sections, /section\.type === 'gallery'/);
  assert.match(sections, /section\.type === 'owner'/);
  assert.match(sections, /section\.config\.media_use_key/);
  assert.match(sections, /data-section-item-count/);
  assert.match(media, /loading=\{media\.delivery\.loading\}/);
  assert.match(media, /fetchpriority=\{media\.delivery\.fetch_priority\}/);
  assert.match(media, /controls=\{media\.delivery\.controls_required\}/);
  assert.match(media, /preload=\{media\.delivery\.preload\}/);
  assert.match(sectionStyles, /grid-template-columns: repeat\(12/);
  assert.match(sectionStyles, /@media \(max-width: 720px\)/);
  assert.match(sectionStyles, /@media \(max-width: 420px\)/);
  assert.match(sectionStyles, /video:focus-visible/);
  assert.doesNotMatch(`${sections}\n${media}`, /<script|<button|<form|href=|tel:|mailto:|wa\.me|onclick|addEventListener/i);
  assert.doesNotMatch(`${sections}\n${media}\n${sectionStyles}`, /cart|checkout|products|orders|inventory|stock|price|currency|coupon|shipping/i);
  assert.doesNotMatch(sectionStyles, /url\(|@import|https?:/i);
  assert.ok(Buffer.byteLength(allThemeStyles, 'utf8') <= 50 * 1024,
    'CSS combinado ALADDIN/HERO/SECTIONS excede el budget Theme de 50 KiB');
});

test('cliente SHELL conserva no-store y no mezcla transporte ANALYTICS en su contrato SSR', () => {
  const client = read('../src/lib/promoPublicShell.ts');
  assert.match(client, /private, no-store, max-age=0/);
  assert.match(client, /noindex,nofollow,noarchive/);
  assert.match(client, /redirect: 'manual'/);
  assert.match(client, /localeCookie/);
  assert.match(client, /requestBackendWithAuthoritativeHost/);
  assert.match(client, /nodeHttpRequest/);
  assert.match(client, /index, follow/);
  assert.match(client, /PROMO_PUBLIC_SEO_CONTRACT/);
  assert.match(client, /normalizePageSeo/);
  assert.match(client, /CONTACT_ACTION_CONTRACT = 'promo\.contact\.action\.v1'/);
  assert.match(client, /safeContactHref/);
  assert.doesNotMatch(client, /Cloudflare|Coolify|analytics|contact\.activate/i);
});
