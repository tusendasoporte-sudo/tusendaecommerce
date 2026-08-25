import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { chromium } from 'playwright';
import sharp from 'sharp';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(frontendRoot, '..');
const serverRoot = path.join(frontendRoot, 'dist', 'server');
const clientRoot = path.join(frontendRoot, 'dist', 'client');
const evidenceRoot = path.join(
  workspaceRoot,
  'docs',
  'tusenda84',
  'reportes',
  'evidencias',
  'TS84-PROMO-QA-VIS-0001',
);
const requestedPort = Number(process.env.PZ_PROMO_VISUAL_PORT || 41791);
const serveOnly = process.argv.includes('--serve');

assert.ok(existsSync(serverRoot), 'build SSR ausente; ejecute npm run build primero');

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

const shellChunk = readdirSync(path.join(serverRoot, 'chunks'))
  .find((name) => /^PromoPublicShell_.*\.mjs$/.test(name));
assert.ok(shellChunk, 'chunk SSR Promo ausente');
const promoRuntimeAsset = readdirSync(path.join(clientRoot, '_astro'))
  .find((name) => /^PromoPublicLayout.*\.js$/.test(name));
assert.ok(promoRuntimeAsset, 'runtime público Promo ausente');
const shellModule = await import(pathToFileURL(path.join(serverRoot, 'chunks', shellChunk)).href);
const container = await AstroContainer.create();

const publicUnavailableSource = readFileSync(
  path.join(frontendRoot, 'src', 'lib', 'promoPublicShell.ts'),
  'utf8',
);
const publicUnavailableHtml = publicUnavailableSource.match(
  /export function promoPublicUnavailable[\s\S]*?new Response\(`([\s\S]*?)`, \{/,
)?.[1];
assert.ok(publicUnavailableHtml, 'HTML real de indisponibilidad pública no encontrado');

const securityUnavailableSource = readFileSync(
  path.join(frontendRoot, 'src', 'lib', 'promoSecurity.ts'),
  'utf8',
);
const securityUnavailableHtml = securityUnavailableSource.match(
  /: new Response\('([^']*<h1>Sitio no disponible<\/h1>[^']*)', \{/,
)?.[1];
assert.ok(securityUnavailableHtml, 'HTML real de indisponibilidad SEC no encontrado');

const copy = {
  es: {
    messages: {
      'a11y.skip_to_content': 'Saltar al contenido principal',
      'a11y.main_navigation': 'Navegación principal',
      'a11y.main_content': 'Contenido principal',
      'locale.current': 'Idioma actual',
      'contact.request_estimate': 'Solicitar estimado',
      'contact.unavailable': 'El contacto no está disponible en este momento',
      'reviews.average': 'Promedio {average} de 5',
      'reviews.count.one': '1 reseña',
      'reviews.count.many': '{count} reseñas',
      'reviews.unavailable': 'Reseñas no disponibles',
      'reviews.empty': 'Aún no hay reseñas',
      'reviews.list': 'Reseñas de clientes',
      'reviews.rating': '{rating} de 5 estrellas',
    },
    selectorLabel: 'Seleccionar idioma',
    selectorEs: 'Ver en español',
    selectorEn: 'Ver en inglés',
    nav: {
      hero: 'Inicio', services: 'Servicios', featured: 'Trabajo destacado', gallery: 'Galería',
      owner: 'Nosotros', rating: 'Reseñas', contact: 'Contacto', footer: 'Pie de página',
    },
    identity: {
      name: "Aladdin's Carpet",
      summary: 'Restauración especializada de alfombras con cuidado artesanal y atención personalizada.',
    },
    headings: {
      hero: 'Alfombras con historia',
      services: 'Cuidado experto para cada fibra',
      featured: 'Una restauración que vuelve a respirar',
      gallery: 'Detalles de nuestro oficio',
      owner: 'Tradición, precisión y trato humano',
      rating: 'Lo que cuentan nuestros clientes',
      contact: 'Conversemos sobre tu alfombra',
      footer: "Aladdin's Carpet",
    },
    summaries: {
      hero: 'Cuidado especializado para piezas que merecen conservar su carácter, textura y memoria.',
      services: 'Cada servicio se adapta al tejido, al uso y a la historia de la pieza.',
      featured: 'Diagnóstico paciente, trabajo detallado y un resultado pensado para durar.',
      gallery: 'Una selección de texturas, bordes y tonos recuperados en nuestro taller.',
      owner: 'Décadas de experiencia reunidas en una atención cercana y responsable.',
      rating: 'Experiencias verificadas y moderadas de quienes confiaron en nuestro trabajo.',
      contact: 'Cuéntanos qué necesita tu pieza y prepararemos una orientación inicial.',
      footer: 'Restauración y cuidado especializado de alfombras.',
    },
    owner: { name: 'Hassan Aladdin', bio: 'Especialista en restauración, limpieza y conservación de alfombras hechas a mano.' },
    contactLabel: 'Llamar para solicitar estimado',
    footerText: 'Atención con cita previa · Miami, Florida',
    footerNav: 'Navegación del pie',
    footerSocial: 'Redes sociales',
    footerBrand: 'Presencia promocional en',
    qrLabel: 'Más enlaces',
    qrAria: 'Abrir Landing QR de Aladdin',
  },
  en: {
    messages: {
      'a11y.skip_to_content': 'Skip to main content',
      'a11y.main_navigation': 'Main navigation',
      'a11y.main_content': 'Main content',
      'locale.current': 'Current language',
      'contact.request_estimate': 'Request an estimate',
      'contact.unavailable': 'Contact is currently unavailable',
      'reviews.average': 'Average {average} out of 5',
      'reviews.count.one': '1 review',
      'reviews.count.many': '{count} reviews',
      'reviews.unavailable': 'Reviews are unavailable',
      'reviews.empty': 'There are no reviews yet',
      'reviews.list': 'Customer reviews',
      'reviews.rating': '{rating} out of 5 stars',
    },
    selectorLabel: 'Select language',
    selectorEs: 'View in Spanish',
    selectorEn: 'View in English',
    nav: {
      hero: 'Home', services: 'Services', featured: 'Featured work', gallery: 'Gallery',
      owner: 'About', rating: 'Reviews', contact: 'Contact', footer: 'Footer',
    },
    identity: {
      name: "Aladdin's Carpet",
      summary: 'Specialized rug restoration with attentive craftsmanship and personal service.',
    },
    headings: {
      hero: 'Carpets with history',
      services: 'Expert care for every fiber',
      featured: 'A restoration that breathes again',
      gallery: 'Details of our craft',
      owner: 'Tradition, precision, and human care',
      rating: 'What our customers say',
      contact: 'Let us talk about your rug',
      footer: "Aladdin's Carpet",
    },
    summaries: {
      hero: 'Specialized care for pieces that deserve to keep their character, texture, and memory.',
      services: 'Every service is adapted to the weave, use, and history of each piece.',
      featured: 'Patient assessment, detailed work, and a result designed to last.',
      gallery: 'A selection of textures, edges, and tones recovered in our workshop.',
      owner: 'Decades of experience delivered through close and responsible service.',
      rating: 'Moderated store reviews from people who trusted our work.',
      contact: 'Tell us what your piece needs and we will prepare an initial recommendation.',
      footer: 'Specialized rug restoration and care.',
    },
    owner: { name: 'Hassan Aladdin', bio: 'Specialist in restoration, cleaning, and conservation of handmade rugs.' },
    contactLabel: 'Call to request an estimate',
    footerText: 'By appointment · Miami, Florida',
    footerNav: 'Footer navigation',
    footerSocial: 'Social media',
    footerBrand: 'Promo presence on',
    qrLabel: 'More links',
    qrAria: 'Open Aladdin Landing QR',
  },
};

const sectionDefinitions = [
  ['hero-main', 'hero'],
  ['services-main', 'services'],
  ['featured-main', 'featured_work'],
  ['gallery-main', 'gallery'],
  ['owner-main', 'owner'],
  ['rating-main', 'store_rating'],
  ['contact-main', 'contact'],
  ['footer-main', 'footer'],
];

const mediaDefinitions = {
  'hero-image': { purpose: 'hero', width: 1280, height: 960, color: '#6e241d', accent: '#c8a45a' },
  'hero-video': { purpose: 'hero', width: 1280, height: 960, color: '#302019', accent: '#ead49b' },
  'service-cleaning': { purpose: 'service', width: 900, height: 675, color: '#23312c', accent: '#c8a45a' },
  'service-restoration': { purpose: 'service', width: 900, height: 675, color: '#4a201f', accent: '#ead49b' },
  'service-padding': { purpose: 'service', width: 900, height: 675, color: '#253245', accent: '#c8a45a' },
  'featured-rug': { purpose: 'featured_work', width: 1200, height: 900, color: '#43261b', accent: '#d2af64' },
  'gallery-one': { purpose: 'gallery', width: 900, height: 675, color: '#50271f', accent: '#e3c16e' },
  'gallery-two': { purpose: 'gallery', width: 900, height: 675, color: '#223f3c', accent: '#d2af64' },
  'gallery-three': { purpose: 'gallery', width: 900, height: 675, color: '#3b2a52', accent: '#ead49b' },
  'gallery-four': { purpose: 'gallery', width: 900, height: 675, color: '#5c4220', accent: '#e3c16e' },
  'gallery-five': { purpose: 'gallery', width: 900, height: 675, color: '#273f55', accent: '#d2af64' },
  'gallery-six': { purpose: 'gallery', width: 900, height: 675, color: '#4b2734', accent: '#ead49b' },
  'owner-portrait': { purpose: 'owner', width: 720, height: 960, color: '#2f211b', accent: '#c8a45a' },
};

const mediaBuffers = new Map();
async function mediaBuffer(key) {
  if (mediaBuffers.has(key)) return mediaBuffers.get(key);
  const definition = mediaDefinitions[key] || mediaDefinitions['gallery-one'];
  const safeLabel = key.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${definition.width}" height="${definition.height}" viewBox="0 0 ${definition.width} ${definition.height}">
    <rect width="100%" height="100%" fill="${definition.color}"/>
    <path d="M0 ${definition.height * 0.72} C ${definition.width * 0.25} ${definition.height * 0.45}, ${definition.width * 0.7} ${definition.height * 0.95}, ${definition.width} ${definition.height * 0.55} L ${definition.width} ${definition.height} L0 ${definition.height}Z" fill="${definition.accent}" opacity=".34"/>
    <g fill="none" stroke="${definition.accent}" stroke-width="6" opacity=".68">
      <rect x="${definition.width * 0.08}" y="${definition.height * 0.1}" width="${definition.width * 0.84}" height="${definition.height * 0.8}" rx="18"/>
      <path d="M${definition.width * 0.16} ${definition.height * 0.2} H${definition.width * 0.84} M${definition.width * 0.16} ${definition.height * 0.8} H${definition.width * 0.84}"/>
    </g>
    <text x="50%" y="50%" fill="#f6f1e7" font-family="Georgia,serif" font-size="${Math.max(28, definition.width / 24)}" text-anchor="middle" dominant-baseline="middle">${safeLabel}</text>
  </svg>`;
  const value = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  mediaBuffers.set(key, value);
  return value;
}

function imageDelivery(key, loading = 'lazy', mode = 'normal') {
  const base = mode === 'error' ? `/media-error/${key}.webp` : mode === 'slow' ? `/media-slow/${key}.webp` : `/media/${key}.webp`;
  const definition = mediaDefinitions[key];
  return {
    contract: 'promo.media.delivery.v1',
    mime: 'image/webp',
    src: base,
    srcset: [
      { key: 'w480', width: 480, height: Math.round((480 * definition.height) / definition.width), url: `${base}?w=480` },
      { key: 'original', width: definition.width, height: definition.height, url: base },
    ],
    sizes: '100vw',
    loading,
    fetch_priority: loading === 'eager' ? 'high' : 'auto',
    decoding: 'async',
  };
}

function imageMedia(key, loading = 'lazy', mode = 'normal') {
  const definition = mediaDefinitions[key];
  return {
    key,
    purpose: definition.purpose,
    kind: 'image',
    width: definition.width,
    height: definition.height,
    duration_ms: 0,
    accessibility: { alt: key.replaceAll('-', ' '), decorative: false },
    delivery: imageDelivery(key, loading, mode),
  };
}

function videoMedia(mode = 'normal') {
  const posterMode = mode === 'error' ? 'error' : mode === 'slow' ? 'slow' : 'normal';
  return {
    key: 'hero-video',
    purpose: 'hero',
    kind: 'video',
    width: 1280,
    height: 960,
    duration_ms: 12000,
    accessibility: { alt: 'Proceso de restauración de una alfombra', decorative: false },
    delivery: {
      contract: 'promo.media.delivery.v1',
      mime: 'video/mp4',
      src: '/video/hero-video.mp4',
      preload: 'none',
      controls_required: true,
      autoplay: false,
      plays_inline: true,
      reduced_motion: 'poster',
      save_data: 'poster',
      poster: imageDelivery('hero-video', 'lazy', posterMode),
    },
  };
}

function section(key, type, mediaUseKeys = [], config = {}) {
  return { key, type, variant: 'default', config, media_use_keys: mediaUseKeys };
}

function createProfile(options = {}) {
  const locale = options.locale === 'en' ? 'en' : 'es';
  const localized = copy[locale];
  const mediaMode = options.mediaMode || 'normal';
  const includeVideo = options.includeVideo !== false;
  const galleryCount = Number.isInteger(options.galleryCount) ? options.galleryCount : 6;
  const contactAvailable = options.contactAvailable !== false;
  const reviewsMode = options.reviewsMode || 'available';
  const includeQr = options.includeQr !== false;
  const includeSectionMedia = options.includeSectionMedia !== false;
  const galleryKeys = Object.keys(mediaDefinitions).filter((key) => key.startsWith('gallery-')).slice(0, galleryCount);
  const heroKeys = includeVideo ? ['hero-image', 'hero-video'] : options.includeHeroMedia === false ? [] : ['hero-image'];
  const servicesKeys = includeSectionMedia ? ['service-cleaning', 'service-restoration', 'service-padding'] : [];
  const featuredKeys = includeSectionMedia ? ['featured-rug'] : [];
  const ownerKeys = includeSectionMedia ? ['owner-portrait'] : [];
  const effectiveGalleryKeys = includeSectionMedia ? galleryKeys : [];
  const sections = [
    section('hero-main', 'hero', heroKeys, { media_use_key: heroKeys[0] || '', action_key: 'phone-main' }),
    section('services-main', 'services', servicesKeys),
    section('featured-main', 'featured_work', featuredKeys),
    section('gallery-main', 'gallery', effectiveGalleryKeys),
    section('owner-main', 'owner', ownerKeys, { media_use_key: ownerKeys[0] || '' }),
    section('rating-main', 'store_rating'),
    section('contact-main', 'contact', [], { action_keys: ['phone-main'] }),
    section('footer-main', 'footer'),
  ];
  const services = locale === 'es'
    ? [
        { name: 'Limpieza especializada', summary: 'Métodos cuidadosos según fibra, tintes y estado de la pieza.' },
        { name: 'Restauración artesanal', summary: 'Reparación detallada de bordes, flecos y zonas debilitadas.' },
        { name: 'Protección y base', summary: 'Soluciones estables para conservar forma, apoyo y comodidad.' },
      ]
    : [
        { name: 'Specialized cleaning', summary: 'Careful methods selected for each fiber, dye, and condition.' },
        { name: 'Artisan restoration', summary: 'Detailed repair of edges, fringes, and weakened areas.' },
        { name: 'Protection and padding', summary: 'Stable solutions that preserve shape, support, and comfort.' },
      ];
  const galleryItems = galleryKeys.map((key, index) => ({
    name: `${locale === 'es' ? 'Detalle' : 'Detail'} ${index + 1}`,
    caption: locale === 'es' ? `Textura recuperada ${index + 1}` : `Recovered texture ${index + 1}`,
  }));
  const itemsBySection = {
    'services-main': services,
    'featured-main': [{
      name: locale === 'es' ? 'Herencia recuperada' : 'Heritage restored',
      summary: locale === 'es' ? 'Color, estructura y detalle reunidos de nuevo.' : 'Color, structure, and detail brought together again.',
      caption: locale === 'es' ? 'Restauración destacada' : 'Featured restoration',
    }],
    'gallery-main': galleryItems,
  };
  const contentSections = Object.fromEntries(sectionDefinitions.map(([key, type]) => {
    const base = {
      heading: localized.headings[type === 'featured_work' ? 'featured' : type === 'store_rating' ? 'rating' : type],
      summary: localized.summaries[type === 'featured_work' ? 'featured' : type === 'store_rating' ? 'rating' : type],
    };
    if (type === 'owner') Object.assign(base, localized.owner);
    if (type === 'footer') base.text = localized.footerText;
    if (itemsBySection[key]) base.items = itemsBySection[key];
    return [key, base];
  }));
  const media = [];
  if (heroKeys.includes('hero-image')) media.push(imageMedia('hero-image', 'eager', mediaMode));
  if (heroKeys.includes('hero-video')) media.push(videoMedia(mediaMode));
  for (const key of [...servicesKeys, ...featuredKeys, ...effectiveGalleryKeys, ...ownerKeys]) {
    media.push(imageMedia(key, 'lazy', mediaMode));
  }
  const reviews = [
    { rating: 5, name: 'Marta R.', comment: locale === 'es' ? 'La alfombra recuperó su color y mantuvo toda su personalidad.' : 'The rug recovered its color while keeping all of its character.', date: '2026-07-01' },
    { rating: 5, name: 'Daniel S.', comment: locale === 'es' ? 'Atención clara, cuidadosa y muy profesional desde el primer momento.' : 'Clear, careful, and very professional service from the beginning.', date: '2026-07-12' },
    { rating: 4, name: 'Elena P.', comment: locale === 'es' ? 'El resultado se siente preciso y respetuoso con la pieza original.' : 'The result feels precise and respectful of the original piece.', date: '2026-08-02' },
  ];
  const ratingEnabled = reviewsMode !== 'unavailable';
  const visibleReviews = reviewsMode === 'empty' || reviewsMode === 'unavailable' ? [] : reviews;
  return {
    site: { public_slug: 'aladdins-carpet' },
    system: { catalog_version: 'promo.system.v1', messages: localized.messages },
    locale: {
      effective: locale,
      default: 'es',
      source: 'url',
      lang: locale,
      direction: 'ltr',
      canonical_path: `/state/full-${locale}`,
    },
    selector: {
      label: localized.selectorLabel,
      options: [
        { locale: 'es', label: 'Español', aria_label: localized.selectorEs, href: '/state/full-es', active: locale === 'es' },
        { locale: 'en', label: 'English', aria_label: localized.selectorEn, href: '/state/full-en', active: locale === 'en' },
      ],
    },
    theme: {
      theme_id: 'promo.black-gold',
      version: '1.0.0',
      renderer_key: 'promo.black-gold',
      tokens: {
        surface: 'obsidian', text: 'ivory', accent: 'heritage_gold', border: 'heritage_gold',
        focus: 'ivory_ring', heading_font: 'editorial_serif', body_font: 'humanist_sans',
        radius: 'subtle', shadow: 'ambient', density: 'comfortable', motion: options.motion || 'subtle',
      },
    },
    section_order: sections.map((value) => value.key),
    sections,
    media,
    contact: {
      enabled: contactAvailable,
      primary_action_key: contactAvailable ? 'phone-main' : '',
      secondary_action_keys: [],
      actions: [],
    },
    contact_action: contactAvailable
      ? {
          contract: 'promo.contact.action.v1',
          available: true,
          action: { key: 'phone-main', type: 'phone', label: localized.contactLabel, aria_label: localized.contactLabel, href: 'tel:+13055550184' },
        }
      : { contract: 'promo.contact.action.v1', available: false, action: null },
    footer: {
      contract: 'promo.footer.v1',
      sections: [{
        key: 'footer-main',
        navigation_label: localized.footerNav,
        social_label: localized.footerSocial,
        navigation_links: [
          { section_key: 'services-main', label: localized.nav.services, href: '#promo-section-services-main' },
          { section_key: 'gallery-main', label: localized.nav.gallery, href: '#promo-section-gallery-main' },
          { section_key: 'contact-main', label: localized.nav.contact, href: '#promo-section-contact-main' },
        ],
        social_links: [
          { network: 'instagram', label: 'Instagram', aria_label: 'Instagram', href: 'https://example.test/aladdin-instagram' },
          { network: 'facebook', label: 'Facebook', aria_label: 'Facebook', href: 'https://example.test/aladdin-facebook' },
        ],
        branding: { label: localized.footerBrand, name: 'Tu Senda 84' },
      }],
    },
    content: {
      identity: localized.identity,
      navigation: {
        'hero-main': localized.nav.hero,
        'services-main': localized.nav.services,
        'featured-main': localized.nav.featured,
        'gallery-main': localized.nav.gallery,
        'owner-main': localized.nav.owner,
        'rating-main': localized.nav.rating,
        'contact-main': localized.nav.contact,
        'footer-main': localized.nav.footer,
      },
      sections: contentSections,
      contact: { 'phone-main': { label: localized.contactLabel } },
      media_alt: {},
      seo: {
        title: `${localized.identity.name} · ${localized.headings.hero}`,
        description: localized.identity.summary,
      },
    },
    adapters: { store_rating: { enabled: ratingEnabled }, landing_qr_link: { enabled: includeQr } },
    store_rating: {
      contract: 'promo.store-rating.v1',
      enabled: ratingEnabled,
      summary: { average: visibleReviews.length ? 4.7 : 0, count: visibleReviews.length },
      reviews: visibleReviews,
    },
    landing_qr_link: includeQr
      ? {
          contract: 'promo.landing-qr-link.v1', enabled: true,
          link: { label: localized.qrLabel, aria_label: localized.qrAria, href: '/landing-qr-commerce-preserved' },
        }
      : { contract: 'promo.landing-qr-link.v1', enabled: false, link: null },
  };
}

function seoFor(locale) {
  const localized = copy[locale];
  const canonicalUrl = `https://tusenda84.com/promo/aladdins-carpet/${locale}`;
  return {
    contract: 'promo.public.seo.v1',
    canonical_url: canonicalUrl,
    sitemap_url: 'https://tusenda84.com/promo/aladdins-carpet/sitemap.xml',
    alternates: [
      { locale: 'es', url: 'https://tusenda84.com/promo/aladdins-carpet/es' },
      { locale: 'en', url: 'https://tusenda84.com/promo/aladdins-carpet/en' },
    ],
    x_default: 'https://tusenda84.com/promo/aladdins-carpet/es',
    open_graph: {
      type: 'website', url: canonicalUrl, title: localized.identity.name,
      description: localized.identity.summary, site_name: localized.identity.name,
      locale, alternate_locales: [locale === 'es' ? 'en' : 'es'], image: null,
    },
    twitter: { card: 'summary', title: localized.identity.name, description: localized.identity.summary, image: '', image_alt: '' },
  };
}

const stateProfiles = {
  'full-es': createProfile({ locale: 'es' }),
  'full-en': createProfile({ locale: 'en' }),
  'no-video': createProfile({ locale: 'es', includeVideo: false }),
  sparse: createProfile({ locale: 'es', includeVideo: false, includeHeroMedia: false, includeSectionMedia: false, galleryCount: 1, reviewsMode: 'empty', contactAvailable: false, includeQr: false }),
  'many-media': createProfile({ locale: 'es', galleryCount: 6 }),
  'reviews-empty': createProfile({ locale: 'es', reviewsMode: 'empty' }),
  'reviews-unavailable': createProfile({ locale: 'es', reviewsMode: 'unavailable' }),
  'contact-unavailable': createProfile({ locale: 'es', contactAvailable: false }),
  'media-error': createProfile({ locale: 'es', mediaMode: 'error' }),
  'media-slow': createProfile({ locale: 'es', mediaMode: 'slow' }),
  'motion-reduced': createProfile({ locale: 'es', motion: 'reduced' }),
};

const renderedStates = new Map();
for (const [name, profile] of Object.entries(stateProfiles)) {
  const rendered = await container.renderToString(shellModule.t, { props: { profile, seo: seoFor(profile.locale.effective) } });
  const qaHtml = rendered
    .replace('</head>', `<style>${inlineCss}</style></head>`)
    .replace(/src="[^"]*PromoPublicLayout\.astro[^"]*"/i, `src="/_astro/${promoRuntimeAsset}"`);
  renderedStates.set(name, qaHtml);
}

function safeClientAsset(pathname) {
  const relative = pathname.replace(/^\/+/, '');
  const resolved = path.resolve(clientRoot, relative);
  return resolved.startsWith(`${clientRoot}${path.sep}`) && existsSync(resolved) ? resolved : null;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/state/')) {
    const state = url.pathname.slice('/state/'.length);
    const html = renderedStates.get(state);
    if (!html) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('state not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
    return;
  }
  if (url.pathname === '/unavailable/public-404' || url.pathname === '/unavailable/theme-retired') {
    response.writeHead(url.pathname.endsWith('404') ? 404 : 503, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
    response.end(publicUnavailableHtml);
    return;
  }
  if (url.pathname === '/unavailable/domain-pending' || url.pathname === '/unavailable/domain-suspended') {
    response.writeHead(421, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
    response.end(publicUnavailableHtml);
    return;
  }
  if (url.pathname === '/unavailable/security') {
    response.writeHead(421, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' });
    response.end(securityUnavailableHtml);
    return;
  }
  if (url.pathname.startsWith('/media-error/')) {
    response.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    response.end('media unavailable');
    return;
  }
  if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/media-slow/')) {
    const key = path.basename(url.pathname, '.webp');
    if (!mediaDefinitions[key]) {
      response.writeHead(404);
      response.end();
      return;
    }
    if (url.pathname.startsWith('/media-slow/')) await new Promise((resolve) => setTimeout(resolve, 1200));
    const value = await mediaBuffer(key);
    response.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store', 'Content-Length': String(value.length) });
    response.end(value);
    return;
  }
  if (url.pathname === '/video/hero-video.mp4') {
    response.writeHead(204, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    response.end();
    return;
  }
  const clientAsset = safeClientAsset(url.pathname);
  if (clientAsset) {
    const body = readFileSync(clientAsset);
    const type = clientAsset.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    response.end(body);
    return;
  }
  response.writeHead(302, { Location: '/state/full-es' });
  response.end();
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(requestedPort, '127.0.0.1', resolve);
});
const address = server.address();
const port = typeof address === 'object' && address ? address.port : requestedPort;
const baseUrl = `http://127.0.0.1:${port}`;

if (serveOnly) {
  console.log(JSON.stringify({ contract: 'promo.visual.local.server.v1', base_url: baseUrl, states: [...renderedStates.keys()] }, null, 2));
  await new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}

const browserCache = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'ms-playwright') : '';
const localChromium = browserCache && existsSync(browserCache)
  ? readdirSync(browserCache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split('-')[1]) - Number(left.split('-')[1]))
      .map((name) => path.join(browserCache, name, 'chrome-win64', 'chrome.exe'))
      .find((candidate) => existsSync(candidate))
  : undefined;
const browser = await chromium.launch({ headless: true, ...(localChromium ? { executablePath: localChromium } : {}) });
const results = [];

function assertNoOverflow(value, label) {
  assert.ok(value.documentWidth <= value.viewportWidth + 1, `${label}: overflow horizontal ${value.documentWidth}/${value.viewportWidth}`);
}

async function inspectPage(page, label) {
  const value = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    lang: document.documentElement.lang,
    h1: document.querySelectorAll('h1').length,
    visibleH1: [...document.querySelectorAll('h1')].filter((item) => {
      const box = item.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }).length,
    contactLinks: [...document.querySelectorAll('.promo-contact-action[href]')].map((item) => item.getAttribute('href')),
    statuses: [...document.querySelectorAll('[role="status"]')].map((item) => item.textContent?.trim()),
    eagerImages: [...document.images].filter((item) => item.loading === 'eager').length,
    lazyImages: [...document.images].filter((item) => item.loading === 'lazy').length,
    videos: [...document.querySelectorAll('video')].map((item) => ({ controls: item.controls, preload: item.preload, autoplay: item.autoplay })),
    commerce: document.querySelectorAll('[data-cart], [data-checkout], [data-product-price], .cart-drawer').length,
    brandImages: document.querySelectorAll('.promo-shell-brand img').length,
  }));
  assertNoOverflow(value, label);
  assert.equal(value.h1, 1, `${label}: jerarquía h1 inesperada`);
  assert.equal(value.visibleH1, 1, `${label}: h1 no visible`);
  assert.equal(value.commerce, 0, `${label}: infraestructura Commerce visible`);
  assert.equal(value.brandImages, 0, `${label}: logo tenant inesperado`);
  return value;
}

try {
  mkdirSync(evidenceRoot, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  let videoRequests = 0;
  page.on('request', (request) => {
    if (/\.mp4(?:$|\?)/.test(request.url())) videoRequests += 1;
  });

  await page.goto(`${baseUrl}/state/full-es`, { waitUntil: 'networkidle' });
  const fullEs = await inspectPage(page, 'full-es 1440x900');
  assert.equal(fullEs.lang, 'es');
  assert.equal(fullEs.contactLinks.length, 2);
  assert.equal(new Set(fullEs.contactLinks).size, 1, 'CTA Hero/Contacto no comparten destino');
  assert.equal(fullEs.contactLinks[0], 'tel:+13055550184');
  assert.equal(fullEs.eagerImages, 1);
  assert.equal(fullEs.videos.length, 1);
  assert.deepEqual(fullEs.videos[0], { controls: true, preload: 'none', autoplay: false });
  assert.equal(videoRequests, 0, 'video solicitado antes de interacción');
  assert.equal(await page.locator('.promo-sections--gallery li').count(), 6);
  await page.screenshot({ path: path.join(evidenceRoot, '01-desktop-completo-es-1440x900.png'), fullPage: true });

  const servicesLink = page.getByRole('link', { name: 'Servicios', exact: true }).first();
  await servicesLink.click();
  assert.equal(await page.evaluate(() => window.location.hash), '#promo-section-services-main');
  assert.ok(await page.locator('#promo-section-services-main').isVisible());

  await page.goto(`${baseUrl}/state/full-es`, { waitUntil: 'networkidle' });
  await page.locator('body').press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('promo-skip-link')), true);
  await page.screenshot({ path: path.join(evidenceRoot, '02-desktop-foco-skip-1440x900.png'), fullPage: false });

  for (const [width, height, label] of [[1280, 800, 'laptop'], [768, 1024, 'tablet'], [390, 844, 'mobile-es']]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${baseUrl}/state/full-es`, { waitUntil: 'networkidle' });
    await inspectPage(page, `${label} ${width}x${height}`);
    if (label === 'tablet') await page.screenshot({ path: path.join(evidenceRoot, '03-tablet-completo-es-768x1024.png'), fullPage: true });
    if (label === 'mobile-es') await page.screenshot({ path: path.join(evidenceRoot, '04-mobile-completo-es-390x844.png'), fullPage: true });
  }

  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`${baseUrl}/state/full-en`, { waitUntil: 'networkidle' });
  const fullEn = await inspectPage(page, 'full-en 412x915');
  assert.equal(fullEn.lang, 'en');
  const englishText = await page.locator('body').innerText();
  for (const forbidden of ['Servicios', 'Galería', 'Contacto', 'Solicitar estimado', 'Aún no hay reseñas']) {
    assert.equal(englishText.includes(forbidden), false, `mezcla ES/EN: ${forbidden}`);
  }
  assert.equal(await page.locator('.promo-shell-locales [aria-current="page"][lang="en"]').count(), 1);
  await page.screenshot({ path: path.join(evidenceRoot, '05-mobile-completo-en-412x915.png'), fullPage: true });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${baseUrl}/state/sparse`, { waitUntil: 'networkidle' });
  const sparse = await inspectPage(page, 'sparse 320x700');
  assert.equal(sparse.eagerImages, 0);
  assert.equal(sparse.videos.length, 0);
  assert.equal(sparse.contactLinks.length, 0);
  assert.ok(sparse.statuses.filter(Boolean).length >= 3, 'estados vacíos/no disponibles incompletos');
  assert.equal(await page.locator('.promo-landing-qr-link').count(), 0);
  await page.screenshot({ path: path.join(evidenceRoot, '06-estrecho-vacio-sin-media-320x700.png'), fullPage: true });

  const stateChecks = [
    ['no-video', (value) => assert.equal(value.videos.length, 0)],
    ['many-media', async () => assert.equal(await page.locator('.promo-sections--gallery li').count(), 6)],
    ['reviews-empty', async () => assert.match(await page.locator('.promo-reviews__state').innerText(), /Aún no hay reseñas/)],
    ['reviews-unavailable', async () => assert.match(await page.locator('.promo-reviews__state').innerText(), /Reseñas no disponibles/)],
    ['contact-unavailable', (value) => assert.equal(value.contactLinks.length, 0)],
  ];
  for (const [state, check] of stateChecks) {
    await page.goto(`${baseUrl}/state/${state}`, { waitUntil: 'networkidle' });
    const value = await inspectPage(page, `${state} 320x700`);
    await check(value);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/state/media-error`, { waitUntil: 'networkidle' });
  await inspectPage(page, 'media-error 390x844');
  const brokenGeometry = await page.locator('img').evaluateAll((images) => images.map((image) => {
    const box = image.getBoundingClientRect();
    return { width: box.width, height: box.height, complete: image.complete, naturalWidth: image.naturalWidth };
  }));
  assert.ok(brokenGeometry.length > 0);
  for (const image of brokenGeometry) {
    assert.ok(image.width > 100 && image.height > 100, `medio roto pierde geometría: ${JSON.stringify(image)}`);
    if (image.complete) assert.equal(image.naturalWidth, 0);
  }
  assert.ok(brokenGeometry.some((image) => image.complete && image.naturalWidth === 0), 'error de media visible no ejercido');
  assert.ok(await page.locator('img[data-promo-media-state="error"]').count() > 0, 'fallback visual de media no aplicado');
  assert.ok(await page.locator('[data-promo-media-fallback="true"]').count() > 0, 'alternativa accesible de media no aplicada');
  await page.screenshot({ path: path.join(evidenceRoot, '07-mobile-error-media-390x844.png'), fullPage: false });

  const slowPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await slowPage.goto(`${baseUrl}/state/media-slow`, { waitUntil: 'domcontentloaded' });
  const loadingState = await slowPage.evaluate(() => ({
    heading: Boolean(document.querySelector('h1')),
    navigation: Boolean(document.querySelector('.promo-shell-navigation')),
    contact: Boolean(document.querySelector('.promo-contact-action')),
    incompleteImages: [...document.images].filter((image) => !image.complete).length,
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert.equal(loadingState.heading && loadingState.navigation && loadingState.contact, true, 'SSR bloqueado por carga de media');
  assert.ok(loadingState.incompleteImages > 0, 'estado de carga lenta no ejercido');
  assert.ok(loadingState.width <= loadingState.viewport + 1, 'carga lenta produce overflow');
  await slowPage.waitForLoadState('networkidle');
  await slowPage.close();

  await page.goto(`${baseUrl}/state/motion-reduced`, { waitUntil: 'networkidle' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await page.evaluate(() => ({
    htmlScroll: getComputedStyle(document.documentElement).scrollBehavior,
    heroScroll: getComputedStyle(document.querySelector('.promo-hero__slides')).scrollBehavior,
    contactTransition: getComputedStyle(document.querySelector('.promo-contact-action')).transitionDuration,
  }));
  assert.equal(motion.htmlScroll, 'auto');
  assert.equal(motion.heroScroll, 'auto');
  assert.ok(motion.contactTransition.split(',').every((value) => Number.parseFloat(value) <= 0.001));

  const unavailableChecks = [
    ['public-404', 404],
    ['theme-retired', 503],
    ['domain-pending', 421],
    ['domain-suspended', 421],
    ['security', 421],
  ];
  for (const [state, expectedStatus] of unavailableChecks) {
    const response = await page.goto(`${baseUrl}/unavailable/${state}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response?.status(), expectedStatus, `${state}: status inesperado`);
    assert.equal(await page.locator('h1').innerText(), 'Sitio no disponible');
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,nofollow,noarchive');
    assert.equal(await page.locator('a').count(), 0);
    assertNoOverflow(await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth })), state);
  }
  await page.screenshot({ path: path.join(evidenceRoot, '09-mobile-error-seguridad-421-390x844.png'), fullPage: true });
  await page.goto(`${baseUrl}/unavailable/domain-suspended`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(evidenceRoot, '08-mobile-no-publicado-suspendido-390x844.png'), fullPage: true });

  const unexpectedConsoleErrors = consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of (404|421|503)/.test(message));
  assert.deepEqual(unexpectedConsoleErrors, [], `errores de consola inesperados: ${JSON.stringify(unexpectedConsoleErrors)}`);
  results.push(
    { matrix: 'viewports', passed: ['1440x900', '1280x800', '768x1024', '390x844', '412x915', '320x700'] },
    { matrix: 'content', passed: ['full', 'no-logo-contract', 'no-video', 'many-media', 'sparse', 'reviews-empty', 'reviews-unavailable', 'contact-unavailable'] },
    { matrix: 'media', passed: ['eager-hero-only', 'lazy-sections', 'video-poster', 'video-no-preload', 'slow', 'error-stable'] },
    { matrix: 'states', passed: ['published', 'unpublished-404', 'theme-retired-503', 'domain-pending-421', 'domain-suspended-421', 'security-421'] },
    { matrix: 'interaction', passed: ['anchor-navigation', 'locale-links', 'keyboard-focus', 'reduced-motion', 'no-overflow'] },
    { matrix: 'isolation', passed: ['no-commerce-dom', 'no-cart', 'no-checkout', 'landing-qr-independent'] },
  );
  console.log(JSON.stringify({
    contract: 'promo.visual.local.v1',
    browser: 'Chromium local',
    base_url: baseUrl,
    evidence_dir: evidenceRoot,
    screenshots: readdirSync(evidenceRoot).filter((name) => name.endsWith('.png')).sort(),
    results,
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
