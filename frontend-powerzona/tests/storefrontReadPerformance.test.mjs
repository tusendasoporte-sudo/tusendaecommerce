import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const api = read('../src/lib/api.ts');
const pocketbase = read('../src/lib/pocketbase.ts');
const stores = read('../src/lib/stores.ts');
const home = read('../src/components/public-store/PublicStoreHome.astro');
const category = read('../src/pages/categoria/[slug].astro');
const subcategory = read('../src/pages/subcategoria/[slug].astro');
const product = read('../src/pages/producto/[slug].astro');
const adminCatalog = read('../src/pages/admin/catalog.astro');
const adminCategory = read('../src/pages/admin/catalog/category/[id].astro');
const adminStoreSettings = read('../src/pages/admin/store-settings.astro');

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
  assert.match(category, /const \[settings, categories\] = await Promise\.all/);
  assert.match(category, /const category = categories\.find/);
  assert.match(category, /getSubcategoriesByCategory/);
  assert.match(category, /getProductsByCategory/);
  assert.match(category, /getCategories\(storeQuery\)/);
  assert.doesNotMatch(category, /getProducts\(storeQuery\)/);

  assert.match(subcategory, /getSubcategoryBySlug/);
  assert.match(subcategory, /getProductsBySubcategory/);
  assert.match(subcategory, /const \[settings, subcategory, categories\] = await Promise\.all/);
  assert.match(subcategory, /getCategories\(storeQuery\)/);
  assert.doesNotMatch(subcategory, /getProducts\(storeQuery\)/);
});

test('detalle obtiene solamente los productos relacionados solicitados', () => {
  assert.match(product, /getProductsByIds\(relatedProductIds, storeQuery\)/);
  assert.doesNotMatch(product, /allPublicProducts/);
});

test('imagenes de taxonomia separan miniaturas y banners de alta resolucion', () => {
  assert.match(api, /const PUBLIC_TAXONOMY_CARD_THUMB = '480x270'/);
  assert.match(api, /heroImageUrl:[\s\S]*getPocketBaseFileUrl\('categories', category\.id, image\)/);
  assert.match(api, /heroImageUrl:[\s\S]*getPocketBaseFileUrl\('subcategories', subcategory\.id, image\)/);
  assert.match(category, /categoryHeroImageUrl = category\.heroImageUrl \|\| category\.imageUrl/);
  assert.match(category, /categoryHeroImageUrl \? <img src=\{categoryHeroImageUrl\}/);
  assert.match(subcategory, /subcategoryHeroImageUrl = subcategory\.heroImageUrl \|\| subcategory\.imageUrl/);
  assert.match(subcategory, /subcategoryHeroImageUrl \? <img src=\{subcategoryHeroImageUrl\}/);
  assert.match(category, /\.category-hero img \{[^}]*object-fit: cover/);
  assert.match(subcategory, /\.subcategory-hero img \{[^}]*object-fit: cover/);
});

test('subida conserva WebP 1200x675 y recorta otras proporciones sin franjas', () => {
  for (const source of [adminCatalog, adminCategory]) {
    assert.match(source, /const isExactWebp = file\.type === 'image\/webp'/);
    assert.match(source, /sourceWidth === targetWidth[\s\S]*sourceHeight === targetHeight/);
    assert.match(source, /const scale = Math\.max\(targetWidth \/ sourceWidth, targetHeight \/ sourceHeight\)/);
    assert.match(source, /canvas\.toBlob\(resolve, 'image\/webp', 0\.9\)/);
    assert.doesNotMatch(source, /ctx\.fillRect\(0, 0, targetWidth, targetHeight\)/);
  }
});

test('portada usa el WebP optimizado original y conserva miniaturas para otros contextos', () => {
  assert.match(api, /coverImageUrl:[^\n]*thumb: '1200x420'/);
  assert.match(api, /coverHeroImageUrl: cover \? getPocketBaseFileUrl\('settings', settings\.id, cover\) : null/);
  assert.match(api, /coverGalleryHeroUrls: coverGallery\.map\(\(filename: string\) => getPocketBaseFileUrl\('settings', settings\.id, filename\)\)/);
  assert.match(stores, /bannerUrl:[^\n]*thumb: '1400x500'/);
  assert.match(stores, /bannerHeroUrl: banner \? getPocketBaseFileUrl\('stores', store\.id, banner\) : null/);
  assert.match(home, /currentStore\?\.bannerHeroUrl[\s\S]*settings\?\.coverHeroImageUrl/);
  assert.match(home, /settings\?\.coverGalleryHeroUrls/);
  assert.match(home, /\.public-hero-cover img \{[^}]*object-fit: cover/);
  assert.match(home, /\.public-hero-slide img \{[^}]*object-fit: cover/);
});

test('subida de portada respeta 1600x900 y no recomprime WebP ya optimizado', () => {
  assert.match(adminStoreSettings, /const maxWidth = 1600;[\s\S]*const maxHeight = 900;/);
  assert.match(adminStoreSettings, /const isReadyWebp = file\.type === 'image\/webp'/);
  assert.match(adminStoreSettings, /bitmap\.width <= maxWidth[\s\S]*bitmap\.height <= maxHeight/);
  assert.match(adminStoreSettings, /if \(isReadyWebp\)[\s\S]*return file;/);
});
