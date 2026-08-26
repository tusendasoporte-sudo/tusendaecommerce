import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPromoReviewsDisplayDocument,
  normalizePromoReviewModeration,
  normalizePromoReviewsPage,
  PromoReviewsError,
} from '../src/lib/promoReviews.ts';
import { normalizePromoPublicShellResponse } from '../src/lib/promoPublicShell.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function documentFixture() {
  const localized = (locale) => ({
    identity: { name: locale === 'es' ? 'Negocio' : 'Business' },
    navigation: { 'hero-main': locale === 'es' ? 'Inicio' : 'Home', 'footer-main': locale === 'es' ? 'Pie' : 'Footer' },
    sections: { 'hero-main': { heading: locale === 'es' ? 'Negocio' : 'Business' }, 'footer-main': { text: '©' } },
    contact: {}, media_alt: {}, seo: { title: 'Negocio', description: 'Descripción válida del negocio.' },
  });
  return {
    contract: 'promo.site.v1', system_catalog_version: 'promo.system.v1',
    locales: { default: 'es', published: ['en', 'es'] },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0', tokens: {} },
    identity: { public_business_key: 'negocio-demo' },
    section_order: ['hero-main', 'footer-main'],
    sections: [
      { key: 'hero-main', type: 'hero', variant: 'default', visible: true, config: { media_use_key: '', action_key: '' }, media_use_keys: [] },
      { key: 'footer-main', type: 'footer', variant: 'default', visible: true, config: {}, media_use_keys: [] },
    ],
    media_refs: {}, contact: { enabled: false, primary_action_key: '', secondary_action_keys: [], actions: [] },
    content_by_locale: { en: localized('en'), es: localized('es') },
    adapters: { store_rating: { enabled: false }, landing_qr_link: { enabled: false } },
  };
}

function pageFixture() {
  return {
    ok: true, contract: 'promo.reviews.page.v1', filter: 'all', page: 1, per_page: 20,
    total_items: 1, total_pages: 1,
    summary: { total: 1, pending: 0, approved: 1, hidden: 0, rejected: 0, approved_average: 5 },
    reviews: [{
      id: 'reviewaaaaaaaaa', rating: 5, name: 'Ana', comment: 'Excelente', status: 'approved',
      featured: true, created: '2026-08-23T10:00:00Z', updated: '2026-08-24T10:00:00Z',
    }],
  };
}

test('configuración añade una sección default localizada antes del footer y preserva el resto del draft', () => {
  const document = buildPromoReviewsDisplayDocument(documentFixture(), {
    enabled: true, heading: 'Clientes que confían en nosotros',
  });
  assert.deepEqual(document.section_order, ['hero-main', 'store-rating-main', 'footer-main']);
  assert.equal(document.sections[1].type, 'store_rating');
  assert.equal(document.sections[1].variant, 'default');
  assert.equal(document.adapters.store_rating.enabled, true);
  assert.equal(document.content_by_locale.es.sections['store-rating-main'].heading, 'Clientes que confían en nosotros');
  assert.equal(document.content_by_locale.en.sections['store-rating-main'].heading, 'What our customers say');
  assert.equal(document.content_by_locale.en.navigation['store-rating-main'], 'Reviews');
  assert.equal(document.sections[0].type, 'hero');
});

test('DTO privado acepta solo campos allowlisted de reseña de tienda y CAS', () => {
  const page = normalizePromoReviewsPage(pageFixture());
  assert.equal(page.summary.approvedAverage, 5);
  assert.equal(page.reviews[0].updated, '2026-08-24T10:00:00Z');
  const moderation = normalizePromoReviewModeration({
    ok: true, contract: 'promo.reviews.moderation.v1', changed: true, review: pageFixture().reviews[0],
  });
  assert.equal(moderation.review.featured, true);
  assert.throws(() => normalizePromoReviewsPage({ ...pageFixture(), store_id: 'storeaaaaaaaaaa' }), PromoReviewsError);
  assert.throws(() => normalizePromoReviewsPage({
    ...pageFixture(), reviews: [{ ...pageFixture().reviews[0], order: 'orderaaaaaaaaaa' }],
  }), PromoReviewsError);
});

test('renderer público valida rating dinámico como extensión del snapshot publicado', () => {
  const publicTest = read('./promoPublicShell.test.mjs');
  assert.match(publicTest, /store_rating:\s*\{[\s\S]*?promo\.store-rating\.v1/);
  const source = read('../src/lib/promoPublicShell.ts');
  assert.match(source, /normalizeStoreRating/);
  assert.match(source, /rating\.enabled && \(!adapterEnabled \|\| !sectionAvailable\)/);
  assert.match(source, /reviews\.length > 12/);
  assert.equal(typeof normalizePromoPublicShellResponse, 'function');
});

test('sección pública conserva SSR y añade formulario moderado, carrusel y vista completa accesibles', () => {
  const component = read('../src/components/promo-public/PromoReviews.astro');
  const styles = read('../src/styles/promo-reviews.css');
  assert.match(component, /role="region"/);
  assert.match(component, /<ol class="promo-reviews__list" data-review-list>/);
  assert.match(component, /aria-label=\{ratingLabel\}/);
  assert.match(component, /Intl\.DateTimeFormat\(profile\.locale\.effective/);
  assert.match(component, /data-review-form/);
  assert.match(component, /data-review-open-all/);
  assert.match(component, /photo_consent/);
  assert.doesNotMatch(component, /name="comment"[^>]*minlength/);
  assert.match(component, /function resetRequestContext\(\)/);
  assert.match(styles, /\.promo-reviews \[hidden\][\s\S]*?display: none !important/);
  assert.match(component, /prefers-reduced-motion/);
  assert.match(component, /textContent = review\.comment/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(`${component}\n${styles}`, /\bcart\b|\bcheckout\b|\bprice\b|\border_id\b|innerHTML|@import/i);
});

test('Admin usa módulo Promo dedicado, permisos granulares y DOM seguro', () => {
  const component = read('../src/components/admin/promo/PromoReviewsEditor.astro');
  const shell = read('../src/components/admin/promo/PromoAdminShell.astro');
  const proxy = read('../src/pages/api/admin/promo-reviews.ts');
  const requestProxy = read('../src/pages/api/admin/promo-review-requests.ts');
  assert.match(shell, /section === 'reviews'[\s\S]*?<PromoReviewsEditor/);
  assert.match(shell, /promo\.reviews\.manage/);
  assert.match(component, /textContent = review\.comment/);
  assert.match(component, /data-review-action/);
  assert.match(proxy, /promo\.reviews\.list\.v1/);
  assert.match(proxy, /promoCmsSameOriginMutation/);
  assert.match(component, /purpose', 'review'/);
  assert.match(component, /incoming\.length > 3/);
  assert.match(requestProxy, /promo\.review-requests\.create\.v1/);
  assert.doesNotMatch(`${component}\n${proxy}\n${requestProxy}`, /\/orders|\/products|checkout|cart|innerHTML/);
});
