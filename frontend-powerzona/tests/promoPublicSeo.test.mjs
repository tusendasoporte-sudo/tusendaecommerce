import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  normalizePromoSeoResource,
  promoSeoResourceResponse,
  renderPromoRobots,
  renderPromoSitemap,
} from '../src/lib/promoPublicSeo.ts';

function identity(source = 'platform') {
  const origin = source === 'platform' ? 'https://tusenda84.com' : 'https://primary.example.test';
  const prefix = source === 'platform' ? '/promo/demo-promo' : '';
  return {
    source,
    origin,
    sitemap_url: `${origin}${source === 'platform' ? '/promo/demo-promo' : ''}/sitemap.xml`,
    x_default: `${origin}${prefix}/es`,
    locales: [
      { locale: 'en', url: `${origin}${prefix}/en` },
      { locale: 'es', url: `${origin}${prefix}/es` },
    ],
  };
}

function envelope(resource = 'sitemap', source = 'platform') {
  return {
    ok: true,
    contract: 'promo.public.seo.resource.v1',
    resource,
    route: { source, action: 'serve' },
    identity: identity(source),
  };
}

test('cliente SEO acepta solo identidad canonical tenant-scoped', () => {
  const platform = normalizePromoSeoResource(envelope(), { resource: 'sitemap', publicSlug: 'demo-promo' });
  assert.equal(platform.identity.locales.length, 2);
  const custom = normalizePromoSeoResource(envelope('robots', 'custom'), {
    resource: 'robots', customHostname: 'primary.example.test',
  });
  assert.equal(custom.identity.origin, 'https://primary.example.test');
  const poisoned = structuredClone(envelope());
  poisoned.identity.origin = 'https://attacker.example';
  assert.throws(() => normalizePromoSeoResource(poisoned, { resource: 'sitemap', publicSlug: 'demo-promo' }));
});

test('sitemap publica reciprocidad hreflang y x-default sin señales Commerce', () => {
  const xml = renderPromoSitemap(identity());
  assert.match(xml, /<loc>https:\/\/tusenda84\.com\/promo\/demo-promo\/en<\/loc>/);
  assert.equal((xml.match(/hreflang="en"/g) || []).length, 2);
  assert.equal((xml.match(/hreflang="es"/g) || []).length, 2);
  assert.equal((xml.match(/hreflang="x-default"/g) || []).length, 2);
  assert.doesNotMatch(xml, /Product|Offer|price|stock|checkout|cart/i);
});

test('robots custom anuncia un único sitemap y mantiene superficies privadas cerradas', () => {
  const robots = renderPromoRobots(identity('custom'));
  assert.match(robots, /^User-agent: \*/);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/primary\.example\.test\/sitemap\.xml/);
});

test('recursos SEO sirven tipos correctos y aliases redirigen permanentemente', async () => {
  const sitemap = promoSeoResourceResponse(normalizePromoSeoResource(envelope(), {
    resource: 'sitemap', publicSlug: 'demo-promo',
  }));
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get('content-type'), /application\/xml/);
  assert.equal(sitemap.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  const redirect = normalizePromoSeoResource({
    ok: true, contract: 'promo.public.seo.resource.v1', resource: 'robots',
    route: { source: 'custom', action: 'redirect', location: 'https://primary.example.test/robots.txt' },
  }, { resource: 'robots', customHostname: 'alias.example.test' });
  const response = promoSeoResourceResponse(redirect);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://primary.example.test/robots.txt');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('vary'), 'Host');
});

test('SSR materializa canonical, OG/Twitter y recursos de plataforma sin tocar Commerce', () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const layout = read('../src/layouts/PromoPublicLayout.astro');
  const middleware = read('../src/middleware.ts');
  const sitemapRoute = read('../src/pages/promo/[publicSlug]/sitemap.xml.ts');
  const seoClient = read('../src/lib/promoPublicSeo.ts');
  const robotsRoute = read('../src/pages/promo/[publicSlug]/robots.txt.ts');
  const platformPage = read('../src/pages/promo/[publicSlug]/index.astro');
  const localizedPage = read('../src/pages/promo/[publicSlug]/[locale].astro');
  assert.match(layout, /rel="canonical"/);
  assert.match(layout, /hreflang="x-default"/);
  assert.match(layout, /property="og:title"/);
  assert.match(layout, /name="twitter:card"/);
  assert.match(middleware, /readCustomHostPromoSeo/);
  assert.match(seoClient, /seo\/host/);
  assert.match(`${sitemapRoute}\n${robotsRoute}`, /readPlatformPromoSeo/);
  assert.match(platformPage, /seo=\{resolved\.seo\}/);
  assert.match(localizedPage, /seo=\{resolved\.seo\}/);
  assert.match(`${platformPage}\n${localizedPage}`, /Astro\.redirect\(resolved\.route\.location, 308\)/);
  assert.doesNotMatch(`${layout}\n${seoClient}\n${sitemapRoute}\n${robotsRoute}`, /products|orders|inventory|price|stock|Cloudflare|Coolify/i);
});
