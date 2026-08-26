const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seo = require('../pb_hooks/pz_promo_seo_lib.js');
const shell = require('../pb_hooks/pz_promo_shell_lib.js');

function localizedFixture(locale = 'es') {
  const option = (value) => ({
    locale: value,
    label: value,
    aria_label: value,
    href: `/unused/${value}`,
    active: value === locale,
  });
  return {
    ok: true,
    contract: 'promo.public.localized.v1',
    site: { public_slug: 'demo-promo' },
    locale: { effective: locale, default: 'es', lang: locale, direction: 'ltr', source: 'url', canonical_path: '/unused' },
    selector: { label: 'Idioma', options: [option('en'), option('es')] },
    content: {
      identity: { name: locale === 'es' ? 'Negocio demo' : 'Demo business' },
      seo: {
        title: locale === 'es' ? 'Título español' : 'English title',
        description: locale === 'es' ? 'Descripción española' : 'English description',
        social_title: locale === 'es' ? 'Título social' : 'Social title',
      },
    },
    media: [],
  };
}

test('SEO deriva canonical, OG/Twitter y hreflang solo del contexto publicado', () => {
  const page = seo.pageSeo(localizedFixture('es'), { source: 'platform' });
  assert.equal(page.contract, 'promo.public.seo.v1');
  assert.equal(page.canonical_url, 'https://tusenda84.com/promo/demo-promo/es');
  assert.equal(page.x_default, 'https://tusenda84.com/promo/demo-promo/es');
  assert.deepEqual(page.alternates, [
    { locale: 'en', url: 'https://tusenda84.com/promo/demo-promo/en' },
    { locale: 'es', url: 'https://tusenda84.com/promo/demo-promo/es' },
  ]);
  assert.equal(page.open_graph.url, page.canonical_url);
  assert.equal(page.open_graph.title, 'Título social');
  assert.deepEqual(page.open_graph.alternate_locales, ['en']);
  assert.equal(page.twitter.card, 'summary');
  assert.equal(JSON.stringify(page).includes('Product'), false);
  assert.equal(JSON.stringify(page).includes('Offer'), false);
});

test('SEO usa solo primary custom validado y rechaza host libre o ambiguo', () => {
  const custom = seo.pageSeo(localizedFixture('en'), {
    source: 'custom', canonicalHostname: 'primary.example.test',
  });
  assert.equal(custom.canonical_url, 'https://primary.example.test/en');
  assert.equal(custom.sitemap_url, 'https://primary.example.test/sitemap.xml');
  assert.throws(
    () => seo.pageSeo(localizedFixture(), { source: 'custom', canonicalHostname: 'attacker/redirect' }),
    seo.PromoSeoError,
  );
  assert.throws(
    () => seo.resourceRedirect('sitemap', 'primary.example.test.evil/'),
    seo.PromoSeoError,
  );
});

test('Open Graph usa únicamente media pública aprobada y omite decorativos', () => {
  const localized = localizedFixture('es');
  localized.media = [{
    key: 'social-card', purpose: 'social', kind: 'image', width: 1200, height: 630,
    delivery: {
      src: `/api/pz/promo/public/v1/sites/demo-promo/media/social-card/${'a'.repeat(64)}/original.webp`,
    },
    accessibility: { alt: 'Trabajo artesanal terminado', decorative: false },
  }];
  const approved = seo.pageSeo(localized, { source: 'custom', canonicalHostname: 'primary.example.test' });
  assert.deepEqual(approved.open_graph.image, {
    url: `https://tusenda84.com${localized.media[0].delivery.src}`,
    width: 1200,
    height: 630,
    alt: 'Trabajo artesanal terminado',
    type: 'image/webp',
  });
  assert.equal(approved.twitter.card, 'summary_large_image');

  localized.media[0].accessibility.decorative = true;
  const decorative = seo.pageSeo(localized, { source: 'platform' });
  assert.equal(decorative.open_graph.image, null);
  assert.equal(decorative.twitter.image, '');
});

test('Open Graph prioriza el logo de negocio sobre social y hero para compartir la página', () => {
  const localized = localizedFixture('es');
  localized.media = [
    {
      key: 'hero-main', purpose: 'hero', kind: 'image', width: 1200, height: 630,
      delivery: { src: `/api/pz/promo/public/v1/sites/demo-promo/media/hero-main/${'a'.repeat(64)}/original.webp` },
      accessibility: { alt: 'Portada', decorative: false },
    },
    {
      key: 'business-logo', purpose: 'logo', kind: 'image', width: 512, height: 512,
      delivery: { src: `/api/pz/promo/public/v1/sites/demo-promo/media/business-logo/${'b'.repeat(64)}/original.webp` },
      accessibility: { alt: 'Logo del negocio', decorative: false },
    },
  ];
  const page = seo.pageSeo(localized, { source: 'platform' });
  assert.match(page.open_graph.image.url, /business-logo/);
  assert.equal(page.open_graph.image.alt, 'Logo del negocio');
});

test('SEO limita sitemap a locales publicados y redirige recursos de aliases al primary', () => {
  const projection = {
    site: { public_slug: 'demo-promo' },
    locales: { default: 'es', published: ['en', 'es'] },
  };
  const sitemap = seo.resourceEnvelope(projection, { source: 'platform', resource: 'sitemap' });
  assert.equal(sitemap.identity.locales.length, 2);
  assert.equal(sitemap.identity.sitemap_url, 'https://tusenda84.com/promo/demo-promo/sitemap.xml');
  assert.deepEqual(seo.resourceRedirect('robots', 'primary.example.test').route, {
    source: 'custom', action: 'redirect', location: 'https://primary.example.test/robots.txt',
  });
  assert.throws(
    () => seo.resourceEnvelope({ site: projection.site, locales: { default: 'es', published: [] } }, { source: 'platform', resource: 'sitemap' }),
    seo.PromoSeoError,
  );
});

test('SHELL redirige entradas neutrales y casing de locale antes de indexar', () => {
  const neutral = shell.shellResponse(localizedFixture('es'), { source: 'platform', action: 'redirect' });
  assert.deepEqual(neutral.route, { source: 'platform', action: 'redirect', location: '/promo/demo-promo/es' });
  assert.equal(Object.hasOwn(neutral, 'profile'), false);
  assert.equal(Object.hasOwn(neutral, 'seo'), false);
  const alias = shell.shellResponse(localizedFixture('en'), {
    source: 'custom', action: 'redirect', canonicalHostname: 'primary.example.test',
  });
  assert.equal(alias.route.location, 'https://primary.example.test/en');
});

test('SEO registra solo cuatro GET públicos acotados y sin servicios externos', () => {
  const hook = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_seo.pb.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_seo_api_lib.js'), 'utf8');
  assert.equal((hook.match(/routerAdd\(/g) || []).length, 4);
  assert.equal((hook.match(/"GET"/g) || []).length, 4);
  assert.match(hook, /seo\/sites\/\{publicSlug\}\/sitemap/);
  assert.match(hook, /seo\/host\/robots/);
  assert.match(api, /publishedPlatformContext/);
  assert.match(api, /domain\.resolveHostContext/);
  assert.doesNotMatch(`${hook}\n${api}`, /requireAuth|POST|PATCH|DELETE|Cloudflare|Coolify|fetch\(/i);
});
