import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getStoreInitials } from '../src/lib/storeIdentity.ts';

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const productCard = read('../src/components/ProductCard.astro');
const publicHome = read('../src/components/public-store/PublicStoreHome.astro');
const categoryPage = read('../src/pages/categoria/[slug].astro');
const subcategoryPage = read('../src/pages/subcategoria/[slug].astro');
const productPage = read('../src/pages/producto/[slug].astro');
const searchPage = read('../src/pages/buscar.astro');
const giftsPage = read('../src/pages/regalos/index.astro');
const receiptPage = read('../src/pages/orden/[orderNumber]/[token].astro');

const publicBrandingSources = [
  publicHome,
  categoryPage,
  subcategoryPage,
  productPage,
  searchPage,
  giftsPage,
  receiptPage,
].join('\n');

test('las vistas publicas usan las iniciales reales de la tienda', () => {
  assert.equal(getStoreInitials('Lo que estas buscando, aqui lo encuentras'), 'LQ');
  assert.equal(getStoreInitials('Mi tienda 84'), 'MT');
  assert.match(categoryPage, /const storeInitials = getStoreInitials\(storeName\)/);
  assert.match(subcategoryPage, /const storeInitials = getStoreInitials\(storeName\)/);
  assert.match(productPage, /const storeInitials = getStoreInitials\(storeName\)/);
  assert.match(searchPage, /define:vars=\{\{ searchItems, initialQuery, storeInitials \}\}/);
});

test('categorias y subcategorias sin foto muestran la marca de la tienda', () => {
  assert.match(categoryPage, /category-hero-fallback">\{storeInitials\}/);
  assert.match(categoryPage, /subcategory-fallback">\{storeInitials\}/);
  assert.match(subcategoryPage, /subcategory-hero-fallback">\{storeInitials\}/);
  assert.match(publicHome, /category-showcase-fallback">\{storeInitials\}/);
  assert.doesNotMatch(publicHome, /categoryInitial\(/);
});

test('productos sin foto usan un fallback nativo con las iniciales', () => {
  assert.match(productCard, /const storeInitials = getStoreInitials\(storeName\)/);
  assert.match(productCard, /product-card-image-fallback/);
  assert.match(productPage, /product-main-image-fallback/);
  assert.match(productPage, /related-image-fallback/);
  assert.doesNotMatch(publicBrandingSources, /placehold\.co\/\d+x\d+\?text=PowerZona/i);
});

test('no quedan placeholders publicos fijos de PZ', () => {
  assert.doesNotMatch(publicBrandingSources, /:\s*['"]PZ['"]/);
  assert.doesNotMatch(publicBrandingSources, />PZ</);
});
