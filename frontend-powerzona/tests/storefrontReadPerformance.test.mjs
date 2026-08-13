import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const api = read('../src/lib/api.ts');
const pocketbase = read('../src/lib/pocketbase.ts');
const home = read('../src/components/public-store/PublicStoreHome.astro');
const category = read('../src/pages/categoria/[slug].astro');
const subcategory = read('../src/pages/subcategoria/[slug].astro');
const product = read('../src/pages/producto/[slug].astro');

test('storefront SSR usa la red interna sin publicar URLs internas en imagenes', () => {
  assert.match(pocketbase, /import\.meta\.env\.SSR\s*\?\s*serverPocketBaseUrl\(\)/);
  assert.match(pocketbase, /new PocketBase\(pocketbaseApiUrl\)/);
  assert.match(pocketbase, /publicPocketbaseUrl/);
  assert.match(pocketbase, /searchParams\.set\('thumb', options\.thumb\)/);
  assert.match(pocketbase, /pb\.autoCancellation\(false\)/);
});

test('consultas publicas proyectan campos y aplican limites reales', () => {
  assert.match(api, /const PUBLIC_PRODUCT_FIELDS =/);
  assert.match(api, /fields: PUBLIC_PRODUCT_FIELDS/);
  assert.match(api, /getFirstListItem\(\s*await storeFilter\('active = true'/);
  assert.match(api, /collection\('reviews'\)\.getList\(1, clampReviewLimit\(limit\)/);
  assert.match(api, /skipTotal: true/);
  assert.doesNotMatch(api, /perPage:\s*clampReviewLimit/);
});

test('portada consolida productos y ejecuta lecturas independientes en paralelo', () => {
  assert.match(home, /getHomepageProducts/);
  assert.match(home, /getProductTaxonomyIndex/);
  assert.match(home, /await Promise\.all\(\[/);
  assert.doesNotMatch(home, /getFeaturedProducts/);
  assert.match(home, /const featuredProducts = products/);
});

test('paginas de taxonomia no descargan el catalogo completo', () => {
  assert.match(category, /getCategoryBySlug/);
  assert.match(category, /getSubcategoriesByCategory/);
  assert.match(category, /getProductsByCategory/);
  assert.doesNotMatch(category, /getProducts\(storeQuery\)/);

  assert.match(subcategory, /getSubcategoryBySlug/);
  assert.match(subcategory, /getProductsBySubcategory/);
  assert.doesNotMatch(subcategory, /getProducts\(storeQuery\)/);
});

test('detalle obtiene solamente los productos relacionados solicitados', () => {
  assert.match(product, /getProductsByIds\(relatedProductIds, storeQuery\)/);
  assert.doesNotMatch(product, /allPublicProducts/);
});
