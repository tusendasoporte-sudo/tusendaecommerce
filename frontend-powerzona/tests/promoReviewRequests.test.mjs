import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePromoPublicRequestContext,
  normalizePromoPublicReviewsPage,
  normalizePromoReviewRequestCreated,
  normalizePromoReviewRequestsPage,
  promoPublicPageLink,
  promoReviewRequestLink,
  PromoReviewRequestsError,
} from '../src/lib/promoReviewRequests.ts';

function read(relativePath) { return readFileSync(new URL(relativePath, import.meta.url), 'utf8'); }
const TOKEN = 'A'.repeat(64);
const PHOTO = {
  url: `/api/pz/promo/public/v1/reviews/sites/demo/photos/photoaaaaaaaaaa/${'a'.repeat(64)}/review.webp`,
  width: 800, height: 600,
};

test('normalizador público acepta badge de trabajo y hasta tres fotos sin IDs de reseña', () => {
  const value = {
    ok: true, contract: 'promo.reviews.public-page.v1', page: 1, per_page: 12,
    total_items: 1, total_pages: 1,
    reviews: [{
      rating: 5, name: 'Ana', comment: 'Excelente', date: '2026-08-25', featured: true,
      service_verified: true, photos: [PHOTO],
    }],
  };
  const page = normalizePromoPublicReviewsPage(value);
  assert.equal(page.reviews[0].serviceVerified, true);
  assert.equal(page.reviews[0].photos.length, 1);
  assert.throws(() => normalizePromoPublicReviewsPage({
    ...value, reviews: [{ ...value.reviews[0], photos: [PHOTO, PHOTO, PHOTO, PHOTO] }],
  }), PromoReviewRequestsError);
  assert.throws(() => normalizePromoPublicReviewsPage({
    ...value, reviews: [{ ...value.reviews[0], review_id: 'reviewaaaaaaaaa' }],
  }), PromoReviewRequestsError);
});

test('contexto privado de solicitud expone solo índices de hasta tres fotos', () => {
  const context = normalizePromoPublicRequestContext({
    ok: true, contract: 'promo.review-request.context-response.v1', locale: 'es',
    customer_label: 'Ana', work_label: 'Alfombra sala', expires_at: '2026-09-25T00:00:00Z',
    photos: [{ index: 0, width: 800, height: 600 }, { index: 1, width: 800, height: 600 }],
  });
  assert.deepEqual(context.photos.map((item) => item.index), [0, 1]);
  assert.doesNotMatch(JSON.stringify(context), /asset_id|token|url/);
});

test('enlace usa fragmento y no query para que el token no llegue en navegación ni referrer', () => {
  const publicLink = promoPublicPageLink('demo', 'es', 'https://example.test');
  assert.equal(publicLink, 'https://example.test/promo/demo/es');
  const link = promoReviewRequestLink('demo', 'es', TOKEN, 'https://example.test');
  const url = new URL(link);
  assert.equal(url.pathname, '/promo/demo/es');
  assert.equal(url.search, '');
  assert.equal(url.hash, `#review-request=${TOKEN}`);
});

test('DTO Admin conserva orden de máximo tres fotos y token solo en respuesta de creación', () => {
  const request = {
    id: 'requestaaaaaaaa', status: 'pending', locale: 'es', customer_label: 'Ana', work_label: 'Trabajo',
    photo_asset_ids: ['photoaaaaaaaaaa', 'photobbbbbbbbbb', 'photocccccccccc'], review_id: '',
    photo_consent: false, expires_at: '2026-09-25T00:00:00Z', created: '2026-08-25T00:00:00Z',
  };
  const created = normalizePromoReviewRequestCreated({
    ok: true, contract: 'promo.review-requests.created.v1', token: TOKEN, request,
  });
  assert.deepEqual(created.request.photoAssetIds, request.photo_asset_ids);
  const page = normalizePromoReviewRequestsPage({
    ok: true, contract: 'promo.review-requests.page.v1', page: 1, per_page: 20,
    total_items: 1, total_pages: 1, summary: { pending: 1, received: 0, expired: 0, revoked: 0 }, requests: [request],
  });
  assert.equal(Object.hasOwn(page.requests[0], 'token'), false);
});

test('UI y proxies usan POST same-origin, consentimiento, QR local y Web Share opcional', () => {
  const publicComponent = read('../src/components/promo-public/PromoReviews.astro');
  const adminComponent = read('../src/components/admin/promo/PromoReviewsEditor.astro');
  const publicProxy = read('../src/lib/promoPublicReviewsApi.ts');
  assert.match(publicComponent, /request-photo'[\s\S]*?method: 'POST'/);
  assert.match(publicComponent, /history\.replaceState/);
  assert.match(publicComponent, /photo_consent/);
  assert.match(adminComponent, /data-review-request-photo-slots/);
  assert.match(adminComponent, /optimizePromoUploadImageFile\(file, 'review'\)/);
  assert.match(adminComponent, /for \(let index = 0; index < 3; index \+= 1\)/);
  assert.match(adminComponent, /if \(selectedPhotos\.length > 1\)[\s\S]*?Mover foto hacia la izquierda[\s\S]*?Mover foto hacia la derecha/);
  assert.match(adminComponent, /up\.textContent = '←'/);
  assert.match(adminComponent, /down\.textContent = '→'/);
  assert.doesNotMatch(adminComponent, /(?:up|down)\.textContent = '[↑↓]'/);
  assert.match(adminComponent, /image\.src = mediaEndpoint\(assetId\)/);
  assert.match(adminComponent, /QRCode\.toDataURL/);
  assert.match(adminComponent, /navigator\.canShare\(\{ files \}\)/);
  assert.match(adminComponent, /Conoce nuestra página/);
  assert.match(adminComponent, /promoPublicPageLink/);
  assert.match(adminComponent, /let requestCreated = false/);
  assert.match(adminComponent, /uploaded\.length && !requestCreated/);
  assert.match(adminComponent, /for \(const file of selectedPhotos\) uploaded\.push\(await uploadPhoto\(file\)\)/);
  assert.match(publicProxy, /promoCmsSameOriginMutation/);
  assert.doesNotMatch(`${publicComponent}\n${adminComponent}\n${publicProxy}`, /innerHTML|document\.cookie|localStorage|sessionStorage/);
});
