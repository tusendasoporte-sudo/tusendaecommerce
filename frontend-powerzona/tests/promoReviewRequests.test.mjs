import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePromoPublicRequestContext,
  normalizePromoPublicReviewsPage,
  normalizePromoReviewRequestCreated,
  normalizePromoReviewRequestDeleted,
  normalizePromoReviewRequestRevealed,
  normalizePromoReviewRequestsPage,
  promoPublicPageLink,
  promoReviewRequestLink,
  PromoReviewRequestsError,
} from '../src/lib/promoReviewRequests.ts';

function read(relativePath) { return readFileSync(new URL(relativePath, import.meta.url), 'utf8'); }
const TOKEN = 'A'.repeat(64);
test('normalizador público acepta badge de trabajo sin IDs ni fotos de reseña', () => {
  const value = {
    ok: true, contract: 'promo.reviews.public-page.v2', page: 1, per_page: 12,
    total_items: 1, total_pages: 1,
    reviews: [{
      rating: 5, name: 'Ana', comment: 'Excelente', date: '2026-08-25', featured: true,
      service_verified: true,
    }],
  };
  const page = normalizePromoPublicReviewsPage(value);
  assert.equal(page.reviews[0].serviceVerified, true);
  assert.throws(() => normalizePromoPublicReviewsPage({
    ...value, reviews: [{ ...value.reviews[0], photos: [] }],
  }), PromoReviewRequestsError);
  assert.throws(() => normalizePromoPublicReviewsPage({
    ...value, reviews: [{ ...value.reviews[0], review_id: 'reviewaaaaaaaaa' }],
  }), PromoReviewRequestsError);
});

test('contexto privado de solicitud expone solo datos de trabajo sin fotos', () => {
  const context = normalizePromoPublicRequestContext({
    ok: true, contract: 'promo.review-request.context-response.v2', locale: 'es',
    customer_label: 'Ana', work_label: 'Alfombra sala', expires_at: '2026-09-25T00:00:00Z',
  });
  assert.equal(context.workLabel, 'Alfombra sala');
  assert.doesNotMatch(JSON.stringify(context), /asset_id|token|url|photo/i);
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

test('DTO Admin no expone fotos ni secretos en listados y revela el token solo por acción explícita', () => {
  const request = {
    id: 'requestaaaaaaaa', status: 'pending', locale: 'es', customer_label: 'Ana', work_label: 'Trabajo',
    review_id: '', expires_at: '2026-09-25T00:00:00Z', created: '2026-08-25T00:00:00Z', shareable: true,
  };
  const created = normalizePromoReviewRequestCreated({
    ok: true, contract: 'promo.review-requests.created.v2', token: TOKEN, request,
  });
  assert.equal(Object.hasOwn(created.request, 'photoAssetIds'), false);
  const page = normalizePromoReviewRequestsPage({
    ok: true, contract: 'promo.review-requests.page.v2', page: 1, per_page: 20,
    total_items: 1, total_pages: 1, summary: { pending: 1, received: 0, expired: 0, revoked: 0 }, requests: [request],
  });
  assert.equal(Object.hasOwn(page.requests[0], 'token'), false);
  assert.equal(page.requests[0].shareable, true);
  assert.equal(normalizePromoReviewRequestRevealed({
    ok: true, contract: 'promo.review-requests.revealed.v1', token: TOKEN, request,
  }).token, TOKEN);
  assert.equal(normalizePromoReviewRequestDeleted({
    ok: true, contract: 'promo.review-requests.deleted.v1', request_id: request.id,
  }).requestId, request.id);
});

test('UI y proxies usan POST same-origin, QR local y enlaces sin flujo de fotos', () => {
  const publicComponent = read('../src/components/promo-public/PromoReviews.astro');
  const adminComponent = read('../src/components/admin/promo/PromoReviewsEditor.astro');
  const publicProxy = read('../src/lib/promoPublicReviewsApi.ts');
  assert.match(publicComponent, /history\.replaceState/);
  assert.match(adminComponent, /QRCode\.toDataURL/);
  assert.match(adminComponent, /navigator\.share\(payload\)/);
  assert.match(adminComponent, /data-review-close-link/);
  assert.match(adminComponent, /window\.prompt/);
  assert.match(adminComponent, /https:\/\/wa\.me\/\$\{recipient\}/);
  assert.match(adminComponent, /data-request-copy/);
  assert.match(adminComponent, /data-request-delete/);
  assert.match(adminComponent, /Conoce nuestra página/);
  assert.match(adminComponent, /promoPublicPageLink/);
  assert.match(publicProxy, /promoCmsSameOriginMutation/);
  assert.doesNotMatch(`${publicComponent}\n${adminComponent}\n${publicProxy}`, /request-photo|photo_consent|photo_asset_ids|purpose', 'review'/);
  assert.doesNotMatch(`${publicComponent}\n${adminComponent}\n${publicProxy}`, /innerHTML|document\.cookie|localStorage|sessionStorage/);
});
