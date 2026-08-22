import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reviewPage = readFileSync(
  new URL('../src/pages/t/[storeSlug]/review/order/[token].astro', import.meta.url),
  'utf8',
);
const orderPricing = readFileSync(
  new URL('../../backend-powerzona/pb_hooks/pz_order_pricing_lib.js', import.meta.url),
  'utf8',
);

test('la orden conserva la foto histórica que debe usar la solicitud de reseña', () => {
  assert.match(orderPricing, /image_url:\s*recordFileUrl\(variation, "image"\) \|\| recordFileUrl\(product, "images", "image_order"\)/);
  assert.match(orderPricing, /record\.set\("item_image_url", bounded\(item\.image_url, 800\)\)/);
  assert.match(orderPricing, /record\.set\("item_image_alt", bounded\(item\.title \|\| "Producto", 180\)\)/);
});

test('la reseña prioriza la foto histórica y conserva respaldos de variación y producto', () => {
  const start = reviewPage.indexOf('function getReviewItemImages(item)');
  const end = reviewPage.indexOf('function getVariationName(item)', start);
  const imageResolver = reviewPage.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(
    imageResolver,
    /const snapshot = String\(item\?\.item_image_url \|\| ''\)\.trim\(\);[\s\S]*?\[snapshot, getVariationImageUrl\(variation\), getProductImageUrl\(product\)\]/,
  );
  assert.match(reviewPage, /imageUrl: imageUrls\[0\] \|\| '',[\s\S]*?imageFallbackUrls: imageUrls\.slice\(1\)/);
  assert.match(reviewPage, /imageAlt: item\.item_image_alt \|\| item\.product_name \|\| product\.name \|\| 'Producto'/);
});

test('las fotos usan miniatura nítida y prueban cada respaldo antes de mostrar la inicial', () => {
  assert.match(reviewPage, /parsed\.searchParams\.set\('thumb', '480x480'\)/);
  assert.match(reviewPage, /data-review-product-image data-image-fallbacks=/);
  assert.match(reviewPage, /image\.addEventListener\('error', \(\) => showReviewProductImageFallback\(image\)\)/);
  assert.match(reviewPage, /const nextImageUrl = imageFallbackUrls\.shift\(\);[\s\S]*?image\.src = nextImageUrl;[\s\S]*?image\.hidden = true;/);
});

test('la tarjeta mantiene una foto cuadrada compacta en escritorio y móvil', () => {
  assert.match(reviewPage, /review-product-card\) \{[^}]*grid-template-columns: 120px minmax\(0, 1fr\)/);
  assert.match(reviewPage, /review-product-media\) \{[^}]*width: 120px; height: 120px;/);
  assert.match(reviewPage, /@media \(max-width: 640px\)[\s\S]*?review-product-card\) \{[^}]*grid-template-columns: 96px minmax\(0, 1fr\)/);
  assert.match(reviewPage, /@media \(max-width: 640px\)[\s\S]*?review-product-media\) \{ width: 96px; height: 96px; \}/);
  assert.match(reviewPage, /review-product-body\) \{ display: contents; \}/);
  assert.doesNotMatch(reviewPage, /aspect-ratio: 16 \/ 9/);
});
