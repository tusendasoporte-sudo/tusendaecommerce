import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { chromium } from 'playwright';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = path.join(frontendRoot, 'dist', 'server');
const entrySource = readFileSync(path.join(serverRoot, 'entry.mjs'), 'utf8');
const manifestPrefix = 'var _manifest = deserializeManifest(';
const manifestStart = entrySource.indexOf(manifestPrefix) + manifestPrefix.length;
const manifestEnd = entrySource.indexOf(');\nvar manifestRoutes', manifestStart);
assert.ok(manifestStart >= manifestPrefix.length && manifestEnd > manifestStart, 'manifest build no disponible');
const manifest = JSON.parse(entrySource.slice(manifestStart, manifestEnd));
const route = manifest.routes.find((item) => item.routeData.route === '/promo/[publicSlug]/[locale]');
assert.ok(route, 'ruta Promo localizada ausente del build');
const inlineCss = route.styles.filter((item) => item.type === 'inline').map((item) => item.content).join('');

const imageHash = 'a'.repeat(64);
const mediaBase = `/api/pz/promo/public/v1/sites/demo-promo/media`;
const imageDelivery = (key, loading = 'lazy') => ({
  contract: 'promo.media.delivery.v1',
  mime: 'image/webp',
  src: `${mediaBase}/${key}/${imageHash}/original.webp`,
  srcset: [
    { key: 'w480', width: 480, height: 270, url: `${mediaBase}/${key}/${imageHash}/w480.webp` },
    { key: 'original', width: 1280, height: 720, url: `${mediaBase}/${key}/${imageHash}/original.webp` },
  ],
  sizes: '100vw', loading, fetch_priority: loading === 'eager' ? 'high' : 'auto', decoding: 'async',
});
const messages = {
  'a11y.skip_to_content': 'Saltar al contenido principal',
  'a11y.main_navigation': 'Navegación principal',
  'a11y.main_content': 'Contenido principal',
  'locale.current': 'Idioma actual',
  'contact.request_estimate': 'Solicitar presupuesto',
  'contact.unavailable': 'No disponible',
  'reviews.average': 'Promedio {average} de 5',
  'reviews.count.one': '1 reseña',
  'reviews.count.many': '{count} reseñas',
  'reviews.unavailable': 'Reseñas no disponibles',
  'reviews.empty': 'Aún no hay reseñas',
  'reviews.list': 'Lista de reseñas',
  'reviews.rating': '{rating} de 5 estrellas',
};
const longCopy = 'Diseño profesional, mantenimiento responsable y soluciones duraderas para cada espacio, sin perder claridad aunque el texto localizado sea considerablemente largo.';
const sections = [
  { key: 'hero-main', type: 'hero', variant: 'default', config: { media_use_key: 'hero-image', action_key: 'email-main' }, media_use_keys: ['hero-image', 'hero-video'] },
  { key: 'rating-main', type: 'store_rating', variant: 'default', config: {}, media_use_keys: [] },
  { key: 'contact-main', type: 'contact', variant: 'default', config: { action_keys: ['email-main'] }, media_use_keys: [] },
  { key: 'footer-main', type: 'footer', variant: 'default', config: {}, media_use_keys: [] },
];
const profile = {
  site: { public_slug: 'demo-promo' },
  system: { catalog_version: 'promo.system.v1', messages },
  locale: { effective: 'es', default: 'es', source: 'url', lang: 'es', direction: 'ltr', canonical_path: '/promo/demo-promo/es' },
  selector: {
    label: 'Seleccionar idioma',
    options: [
      { locale: 'es', label: 'Español', aria_label: 'Ver en español', href: '/promo/demo-promo/es', active: true },
      { locale: 'en', label: 'English', aria_label: 'View in English', href: '/promo/demo-promo/en', active: false },
    ],
  },
  theme: {
    theme_id: 'promo.black-gold', version: '1.0.0', renderer_key: 'promo.black-gold',
    tokens: {
      surface: 'obsidian', text: 'ivory', accent: 'heritage_gold', border: 'heritage_gold',
      focus: 'ivory_ring', heading_font: 'editorial_serif', body_font: 'humanist_sans',
      radius: 'subtle', shadow: 'ambient', density: 'comfortable', motion: 'subtle',
    },
  },
  section_order: sections.map((section) => section.key),
  sections,
  media: [
    {
      key: 'hero-image', purpose: 'hero', kind: 'image', width: 1280, height: 720, duration_ms: 0,
      accessibility: { alt: 'Equipo trabajando en un espacio exterior', decorative: false },
      delivery: imageDelivery('hero-image', 'eager'),
    },
    {
      key: 'hero-video', purpose: 'hero', kind: 'video', width: 1280, height: 720, duration_ms: 12000,
      accessibility: { alt: 'Demostración en video del trabajo terminado', decorative: false },
      delivery: {
        contract: 'promo.media.delivery.v1', mime: 'video/mp4',
        src: `${mediaBase}/hero-video/${imageHash}/original.mp4`, preload: 'none',
        controls_required: true, autoplay: false, plays_inline: true,
        reduced_motion: 'poster', save_data: 'poster', poster: imageDelivery('hero-video-poster'),
      },
    },
  ],
  contact: { enabled: true, primary_action_key: 'email-main', secondary_action_keys: [], actions: [] },
  contact_action: {
    contract: 'promo.contact.action.v1', available: true,
    action: { key: 'email-main', type: 'email', label: 'Escribir por correo', aria_label: 'Solicitar presupuesto por correo', href: 'mailto:hola@example.test' },
  },
  footer: {
    contract: 'promo.footer.v1',
    sections: [{
      key: 'footer-main', navigation_label: 'Navegación del pie', social_label: 'Redes sociales',
      navigation_links: [{ section_key: 'hero-main', label: 'Volver al inicio', href: '#promo-section-hero-main' }],
      social_links: [{ network: 'instagram', label: 'Instagram', aria_label: 'Visitar Instagram', href: 'https://example.test/instagram' }],
      branding: { label: 'Creado con', name: 'Tu Senda 84' },
    }],
  },
  content: {
    identity: { name: 'Negocio demostrativo con nombre localizado extenso', summary: longCopy },
    navigation: { 'hero-main': 'Inicio', 'rating-main': 'Reseñas', 'contact-main': 'Contacto', 'footer-main': 'Pie de página' },
    sections: {
      'hero-main': { heading: 'Soluciones que acompañan tu camino', summary: longCopy },
      'rating-main': { heading: 'Experiencias de clientes', summary: longCopy },
      'contact-main': { heading: 'Conversemos sobre tu proyecto', summary: longCopy },
      'footer-main': { heading: 'Negocio demostrativo', summary: longCopy, text: 'Atención responsable y accesible.' },
    },
    contact: { 'email-main': { label: 'Escribir por correo' } },
    media_alt: {}, seo: { title: 'Negocio demostrativo', description: longCopy },
  },
  adapters: { store_rating: { enabled: true }, landing_qr_link: { enabled: true } },
  store_rating: {
    contract: 'promo.store-rating.v1', enabled: true, summary: { average: 4.7, count: 3 },
    reviews: [
      { rating: 5, name: 'Ana', comment: longCopy, date: '2026-07-01' },
      { rating: 4, name: 'Luis', comment: longCopy, date: '2026-07-02' },
      { rating: 5, name: 'Marta', comment: longCopy, date: '2026-07-03' },
    ],
  },
  landing_qr_link: {
    contract: 'promo.landing-qr-link.v1', enabled: true,
    link: { label: 'QR', aria_label: 'Abrir Landing QR', href: '/landing-qr' },
  },
};
const canonicalUrl = 'https://tusenda84.com/promo/demo-promo/es';
const seo = {
  contract: 'promo.public.seo.v1', canonical_url: canonicalUrl,
  sitemap_url: 'https://tusenda84.com/promo/demo-promo/sitemap.xml',
  alternates: [{ locale: 'es', url: canonicalUrl }], x_default: canonicalUrl,
  open_graph: { type: 'website', url: canonicalUrl, title: 'Negocio demostrativo', description: longCopy, site_name: 'Negocio demostrativo', locale: 'es', alternate_locales: [], image: null },
  twitter: { card: 'summary', title: 'Negocio demostrativo', description: longCopy, image: '', image_alt: '' },
};

const shellChunk = readdirSync(path.join(serverRoot, 'chunks')).find((name) => /^PromoPublicShell_.*\.mjs$/.test(name));
assert.ok(shellChunk, 'chunk SSR Promo ausente');
const shellModule = await import(pathToFileURL(path.join(serverRoot, 'chunks', shellChunk)).href);
const container = await AstroContainer.create();
const renderedShell = await container.renderToString(shellModule.t, { props: { profile, seo } });
const representativeHtml = renderedShell.replace('</head>', `<style>${inlineCss}</style></head>`);

function assertNoHorizontalOverflow(value, label) {
  assert.ok(value.documentWidth <= value.viewportWidth + 1, `${label}: overflow horizontal ${value.documentWidth}/${value.viewportWidth}`);
}

const browserCache = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'ms-playwright')
  : '';
const localChromium = browserCache && existsSync(browserCache)
  ? readdirSync(browserCache)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split('-')[1]) - Number(left.split('-')[1]))
      .map((name) => path.join(browserCache, name, 'chrome-win64', 'chrome.exe'))
      .find((candidate) => existsSync(candidate))
  : undefined;
const browser = await chromium.launch({
  headless: true,
  ...(localChromium ? { executablePath: localChromium } : {}),
});
let videoRequests = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  page.on('request', (request) => {
    if (/\.mp4(?:$|\?)/.test(request.url())) videoRequests += 1;
  });
  await page.route('**/*', (requestRoute) => requestRoute.abort());
  await page.setContent(representativeHtml, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(100);

  const structure = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    header: document.querySelectorAll('header').length,
    main: document.querySelectorAll('main').length,
    footer: document.querySelectorAll('.promo-public-shell > footer').length,
    unnamedNavs: [...document.querySelectorAll('nav')].filter((nav) => !nav.getAttribute('aria-label') && !nav.getAttribute('aria-labelledby')).length,
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => Number(heading.tagName.slice(1))),
    imagesWithoutAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
    positiveTabindex: [...document.querySelectorAll('[tabindex]')].filter((element) => Number(element.getAttribute('tabindex')) > 0).length,
    unnamedInteractive: [...document.querySelectorAll('a,button,video,[tabindex="0"]')].filter((element) => !(element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('title'))).length,
    statuses: document.querySelectorAll('[role="status"]').length,
    videos: [...document.querySelectorAll('video')].map((video) => ({ controls: video.controls, preload: video.preload, autoplay: video.autoplay, label: video.getAttribute('aria-label'), poster: video.poster })),
  }));
  assert.equal(structure.lang, 'es');
  assert.equal(structure.dir, 'ltr');
  assert.deepEqual([structure.header, structure.main, structure.footer], [1, 1, 1]);
  assert.equal(structure.unnamedNavs, 0);
  assert.equal(structure.headings[0], 1);
  assert.equal(structure.headings.filter((level) => level === 1).length, 1);
  assert.equal(structure.headings.some((level, index, levels) => index > 0 && level > levels[index - 1] + 1), false);
  assert.equal(structure.imagesWithoutAlt, 0);
  assert.equal(structure.positiveTabindex, 0);
  assert.equal(structure.unnamedInteractive, 0);
  assert.deepEqual(structure.videos.map(({ controls, preload, autoplay }) => ({ controls, preload, autoplay })), [{ controls: true, preload: 'none', autoplay: false }]);
  assert.ok(structure.videos[0].label && structure.videos[0].poster);
  assert.equal(videoRequests, 0, 'video solicitado antes de interacción');

  await page.locator('body').press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('promo-skip-link')), true);
  const skipFocus = await page.locator('.promo-skip-link').evaluate((element) => {
    const style = getComputedStyle(element);
    return { top: element.getBoundingClientRect().top, outline: parseFloat(style.outlineWidth) };
  });
  assert.ok(skipFocus.top >= 0 && skipFocus.outline >= 3, 'skip link no visible al foco');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'promo-main');

  const tabSequence = [];
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab');
    tabSequence.push(await page.evaluate(() => {
      const active = document.activeElement;
      const label = active?.getAttribute('aria-label') || active?.textContent?.trim() || '';
      const href = active?.getAttribute('href') || '';
      return active ? `${active.tagName.toLowerCase()}#${active.id}.${active.className}[${href}|${label.slice(0, 40)}]` : '';
    }));
  }
  assert.ok(tabSequence.some((value) => value.includes('promo-hero__slides')), 'carrusel Hero no alcanzable por teclado');
  assert.ok(tabSequence.some((value) => value.includes('promo-reviews__viewport')), 'reseñas no alcanzables por teclado');
  assert.ok(
    new Set(tabSequence.filter((value) => !value.startsWith('body#'))).size >= 10,
    `secuencia de foco incompleta: ${JSON.stringify(tabSequence)}`,
  );
  for (let index = 0; index < tabSequence.length - 1; index += 1) {
    if (tabSequence[index].startsWith('body#')) {
      assert.equal(tabSequence[index + 1].startsWith('body#'), false, 'foco atrapado fuera de los controles');
    }
  }

  await page.setViewportSize({ width: 700, height: 900 });
  for (const selector of ['.promo-hero__slides', '.promo-reviews__viewport']) {
    const target = page.locator(selector);
    await target.evaluate((element) => { element.scrollLeft = 0; });
    await target.focus();
    const before = await target.evaluate((element) => element.scrollLeft);
    const scrollWidth = await target.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    for (let index = 0; index < 4; index += 1) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const after = await target.evaluate((element) => element.scrollLeft);
    assert.ok(after > before, `${selector} no responde a teclado (${before}/${after}; ${scrollWidth.client}/${scrollWidth.scroll})`);
    const outline = await target.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth));
    assert.ok(outline >= 3, `${selector} sin foco visible`);
  }

  const targets = await page.locator('a').evaluateAll((anchors) => anchors
    .filter((anchor) => getComputedStyle(anchor).display !== 'none')
    .map((anchor) => ({ label: anchor.getAttribute('aria-label') || anchor.textContent?.trim(), width: anchor.getBoundingClientRect().width, height: anchor.getBoundingClientRect().height })));
  for (const target of targets) {
    assert.ok(target.width >= 44 && target.height >= 44, `target menor que 44x44: ${target.label} (${target.width}x${target.height})`);
  }

  const overlap = await page.evaluate(() => {
    const controls = document.querySelector('.promo-hero__controls')?.getBoundingClientRect();
    const video = document.querySelector('.promo-hero video')?.getBoundingClientRect();
    return controls && video ? controls.bottom > video.top + (video.height * 0.65) : true;
  });
  assert.equal(overlap, false, 'controles del carrusel oscurecen la zona de controles nativos del video');

  for (const [width, height, label] of [[320, 700, '320px'], [390, 844, 'móvil'], [844, 390, 'landscape']]) {
    await page.setViewportSize({ width, height });
    const dimensions = await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth }));
    assertNoHorizontalOverflow(dimensions, label);
  }

  await page.evaluate(() => {
    document.documentElement.dir = 'rtl';
    const style = document.createElement('style');
    style.id = 'a11y-text-spacing';
    style.textContent = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}';
    document.head.append(style);
  });
  assertNoHorizontalOverflow(await page.evaluate(() => ({ viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth })), 'RTL y espaciado de texto');

  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.evaluate(() => document.body.setAttribute('data-promo-token-motion', 'reduced'));
  const motion = await page.evaluate(() => ({
    htmlScroll: getComputedStyle(document.documentElement).scrollBehavior,
    qrTransition: getComputedStyle(document.querySelector('.promo-landing-qr-link')).transitionDuration,
    heroScroll: getComputedStyle(document.querySelector('.promo-hero__slides')).scrollBehavior,
    focusOutline: getComputedStyle(document.querySelector('.promo-reviews__viewport')).outlineStyle,
  }));
  assert.equal(motion.htmlScroll, 'auto');
  assert.ok(
    motion.qrTransition.split(',').every((duration) => Number.parseFloat(duration) <= 0.001),
    `transición QR no reducida: ${motion.qrTransition}`,
  );
  assert.equal(motion.heroScroll, 'auto');
  assert.notEqual(motion.focusOutline, 'none');

  console.log(JSON.stringify({
    contract: 'promo.accessibility.local.v1',
    chromium: {
      landmarks: true, heading_hierarchy: true, accessible_names: true,
      keyboard_sequence: true, skip_link: true, visible_focus: true,
      target_size_44: true, video_no_autoplay: true, video_preload_none: true,
      video_requests_before_interaction: videoRequests, reflow_320: true,
      orientation: true, long_strings: true, rtl: true, text_spacing: true,
      reduced_motion: true, forced_colors_focus: true,
    },
  }, null, 2));
} finally {
  await browser.close();
}
