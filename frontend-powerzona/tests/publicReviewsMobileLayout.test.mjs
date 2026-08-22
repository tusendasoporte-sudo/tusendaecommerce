import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(
  new URL('../src/components/public-store/PublicStoreHome.astro', import.meta.url),
  'utf8',
);

test('el grid de reseñas no crece por el ancho mínimo de sus controles en móvil', () => {
  assert.match(
    home,
    /\.public-reviews-viewer\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/,
  );
  assert.match(
    home,
    /\.public-reviews-view-toggle\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/,
  );
});

test('cada tarjeta del carrusel queda limitada al ancho disponible', () => {
  assert.match(
    home,
    /\.public-reviews-carousel-track\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/,
  );
  assert.match(
    home,
    /\.public-review-carousel-card\s*\{[^}]*flex:\s*0 0 100%;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/,
  );
  assert.doesNotMatch(home, /\.public-review-carousel-card\s*\{[^}]*min-width:\s*100%;/);
});
