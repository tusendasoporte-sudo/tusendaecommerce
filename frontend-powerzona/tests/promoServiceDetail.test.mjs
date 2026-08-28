import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  findPromoService,
  promoServicePath,
  promoServiceSeo,
} from '../src/lib/promoServiceCatalog.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function profileFixture() {
  const media = [
    { key: 'cover', purpose: 'gallery', kind: 'image' },
    { key: 'product-one-a', purpose: 'gallery', kind: 'image' },
    { key: 'product-one-b', purpose: 'gallery', kind: 'image' },
    { key: 'hidden-media', purpose: 'gallery', kind: 'image' },
  ];
  return {
    site: { public_slug: 'demo-promo' },
    locale: {
      effective: 'es', default: 'es', lang: 'es', direction: 'ltr',
      source: 'url', canonical_path: '/promo/demo-promo/es',
    },
    sections: [
      {
        key: 'services-main', type: 'services', variant: 'default', media_use_keys: [],
        config: {
          item_keys: ['service-clean', 'service-empty'],
          gallery_keys: ['gallery-clean', ''], icon_keys: ['cleaning', ''],
        },
      },
      {
        key: 'gallery-clean', type: 'gallery', variant: 'default',
        media_use_keys: ['cover', 'product-one-a', 'product-one-b', 'hidden-media'],
        config: {
          item_keys: ['product-one', 'product-hidden'], cover_media_use_key: 'cover',
          items: [
            { key: 'product-one', media_use_keys: ['product-one-a', 'product-one-b'], featured: false, visible: true },
            { key: 'product-hidden', media_use_keys: ['hidden-media'], featured: false, visible: false },
          ],
        },
      },
    ],
    media,
    content: {
      identity: { name: 'Negocio demo' },
      navigation: { 'services-main': 'Servicios', 'gallery-clean': 'Productos internos' },
      sections: {
        'services-main': {
          heading: 'Nuestros servicios',
          items: [
            { key: 'service-clean', name: 'Limpieza de alfombras', summary: 'Limpieza profunda', caption: 'Cuidado experto' },
            { key: 'service-empty', name: 'Sin opciones', summary: '', caption: '' },
          ],
        },
        'gallery-clean': {
          heading: 'Opciones de limpieza',
          items: [
            { key: 'product-one', name: 'Limpieza profunda', summary: 'Tratamiento completo', caption: 'Residencial' },
            { key: 'product-hidden', name: 'No publicado', summary: '', caption: '' },
          ],
        },
      },
      seo: { title: 'Negocio demo', description: 'Servicios profesionales' },
    },
  };
}

function seoFixture() {
  return {
    contract: 'promo.public.seo.v1',
    canonical_url: 'https://tusenda84.com/promo/demo-promo/es',
    sitemap_url: 'https://tusenda84.com/promo/demo-promo/sitemap.xml',
    alternates: [
      { locale: 'es', url: 'https://tusenda84.com/promo/demo-promo/es' },
      { locale: 'en', url: 'https://tusenda84.com/promo/demo-promo/en' },
    ],
    x_default: 'https://tusenda84.com/promo/demo-promo/es',
    open_graph: {
      type: 'website', url: 'https://tusenda84.com/promo/demo-promo/es',
      title: 'Negocio demo', description: 'Servicios profesionales', site_name: 'Negocio demo',
      locale: 'es', alternate_locales: ['en'], image: null,
    },
    twitter: {
      card: 'summary', title: 'Negocio demo', description: 'Servicios profesionales',
      image: '', image_alt: '',
    },
  };
}

test('SERVICIO resuelve categoría por clave estable y solo publica opciones visibles', () => {
  const profile = profileFixture();
  const service = findPromoService(profile, 'service-clean');
  assert.equal(service?.name, 'Limpieza de alfombras');
  assert.equal(service?.cover?.key, 'cover');
  assert.deepEqual(service?.products.map((product) => product.key), ['product-one']);
  assert.deepEqual(service?.products[0].media.map((media) => media.key), ['product-one-a', 'product-one-b']);
  assert.equal(findPromoService(profile, 'service-empty'), null);
  assert.equal(findPromoService(profile, '../service-clean'), null);
  assert.equal(promoServicePath(profile, 'service-clean'), '/promo/demo-promo/es/servicios/service-clean');
  assert.equal(promoServicePath(profile, '../service-clean'), '');
});

test('SERVICIO deriva canonical y hreflang localizados sin modificar el contrato base', () => {
  const profile = profileFixture();
  const baseSeo = seoFixture();
  const service = findPromoService(profile, 'service-clean');
  const detailSeo = promoServiceSeo(profile, baseSeo, service);
  assert.equal(detailSeo.canonical_url, 'https://tusenda84.com/promo/demo-promo/es/servicios/service-clean');
  assert.deepEqual(detailSeo.alternates.map((item) => item.url), [
    'https://tusenda84.com/promo/demo-promo/es/servicios/service-clean',
    'https://tusenda84.com/promo/demo-promo/en/servicios/service-clean',
  ]);
  assert.equal(detailSeo.open_graph.title, 'Limpieza de alfombras | Negocio demo');
  assert.equal(baseSeo.canonical_url, 'https://tusenda84.com/promo/demo-promo/es');
});

test('SERVICIO renderiza navegación inmersiva en la misma pestaña, galerías y cotización accesible', () => {
  const sections = read('../src/components/promo-public/PromoSections.astro');
  const detail = read('../src/components/promo-public/PromoServiceDetail.astro');
  const internalRoute = read('../src/pages/promo-service-internal.astro');
  const middleware = read('../src/middleware.ts');
  const styles = read('../src/styles/promo-service-detail.css');
  const combined = `${sections}\n${detail}\n${internalRoute}\n${middleware}\n${styles}`;
  const promoOnly = `${sections}\n${detail}\n${internalRoute}\n${styles}`;

  assert.match(sections, /href=\{promoServicePath\(profile/);
  assert.match(sections, /viewOptionsLabel/);
  assert.doesNotMatch(sections, /promo-sections__product-grid/);
  assert.doesNotMatch(sections, /target=|window\.open/);
  assert.match(detail, /<h1 id="promo-service-detail-heading">\{service\.name\}<\/h1>/);
  assert.match(detail, /service\.products\.map/);
  assert.match(detail, /product\.media\.map/);
  assert.match(detail, /context=\{productQuoteContext\}/);
  assert.match(detail, /aria-current=\{option\.active \? 'page'/);
  assert.match(detail, /tabindex=\{product\.media\.length > 1 \? '0'/);
  assert.match(internalRoute, /findPromoService/);
  assert.match(middleware, /!findPromoService\(resolved\.profile/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /min-height: 44px/);
  assert.doesNotMatch(promoOnly, /cart|checkout|orders|inventory|stock|price|currency|coupon|shipping/i);
  assert.doesNotMatch(promoOnly, /components\/public-store|pages\/t\/|commerce/i);
});
