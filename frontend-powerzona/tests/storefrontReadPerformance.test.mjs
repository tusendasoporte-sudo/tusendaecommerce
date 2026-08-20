import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const api = read('../src/lib/api.ts');
const pocketbase = read('../src/lib/pocketbase.ts');
const stores = read('../src/lib/stores.ts');
const storeSeo = read('../src/lib/storeSeo.ts');
const layout = read('../src/layouts/Layout.astro');
const socialMeta = read('../src/components/SocialMeta.astro');
const home = read('../src/components/public-store/PublicStoreHome.astro');
const orderReview = read('../src/pages/t/[storeSlug]/review/order/[token].astro');
const storeSocialImage = read('../src/pages/api/og/tienda/[storeSlug].jpg.ts');
const category = read('../src/pages/categoria/[slug].astro');
const subcategory = read('../src/pages/subcategoria/[slug].astro');
const product = read('../src/pages/producto/[slug].astro');
const adminCatalog = read('../src/pages/admin/catalog.astro');
const adminCategory = read('../src/pages/admin/catalog/category/[id].astro');
const adminGifts = read('../src/pages/admin/gifts.astro');
const adminStoreSettings = read('../src/pages/admin/store-settings.astro');
const taxonomyCardThumbMigration = read('../../backend-powerzona/pb_migrations/1787292000_taxonomy_card_thumbnails.js');

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
  assert.match(api, /getPublicImageDeliveryOptions\(image, PUBLIC_TAXONOMY_CARD_THUMB\)/);
  assert.match(api, /heroImageUrl:[\s\S]*getPocketBaseFileUrl\('categories', category\.id, image\)/);
  assert.match(api, /heroImageUrl:[\s\S]*getPocketBaseFileUrl\('subcategories', subcategory\.id, image\)/);
  assert.match(category, /categoryHeroImageUrl = category\.heroImageUrl \|\| category\.imageUrl/);
  assert.match(category, /categoryHeroImageUrl \? <img src=\{categoryHeroImageUrl\}/);
  assert.match(subcategory, /subcategoryHeroImageUrl = subcategory\.heroImageUrl \|\| subcategory\.imageUrl/);
  assert.match(subcategory, /subcategoryHeroImageUrl \? <img src=\{subcategoryHeroImageUrl\}/);
  assert.match(category, /\.category-hero img \{[^}]*object-fit: cover/);
  assert.match(subcategory, /\.subcategory-hero img \{[^}]*object-fit: cover/);
});

test('PocketBase admite la miniatura de taxonomia solicitada sin reemplazar otros tamanos', () => {
  assert.match(taxonomyCardThumbMigration, /const TAXONOMY_CARD_THUMB = "480x270"/);
  assert.match(taxonomyCardThumbMigration, /\["categories", "image"\]/);
  assert.match(taxonomyCardThumbMigration, /\["subcategories", "image"\]/);
  assert.match(taxonomyCardThumbMigration, /\[\.\.\.currentThumbs, TAXONOMY_CARD_THUMB\]/);
  assert.match(taxonomyCardThumbMigration, /currentThumbs\.filter\(\(thumb\) => thumb !== TAXONOMY_CARD_THUMB\)/);
});

test('subida de taxonomia comparte WebP sin recorte y conserva el archivo menor', () => {
  for (const source of [adminCatalog, adminCategory]) {
    assert.match(source, /taxonomyImageOptimizationCore\.js/);
    assert.match(source, /pzTaxonomyImageOptimizer\.optimizeTaxonomyImageFile\(file\)/);
    assert.doesNotMatch(source, /const scale = Math\.max\(targetWidth \/ sourceWidth, targetHeight \/ sourceHeight\)/);
    assert.doesNotMatch(source, /_categoria_1200x675\.webp/);
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

test('tienda y reseña comparten un preview JPEG compatible con WhatsApp', () => {
  assert.match(storeSeo, /STORE_SOCIAL_IMAGE_WIDTH = 1200/);
  assert.match(storeSeo, /STORE_SOCIAL_IMAGE_HEIGHT = 630/);
  assert.match(storeSeo, /STORE_SOCIAL_IMAGE_REVISION = '20260820a'/);
  assert.match(storeSeo, /new URLSearchParams\(\{ r: STORE_SOCIAL_IMAGE_REVISION \}\)/);
  assert.match(storeSeo, /\/api\/og\/tienda\/\$\{storeSlug\}\.jpg\?\$\{searchParams\.toString\(\)\}/);
  assert.match(home, /buildStoreSocialImagePath/);
  assert.match(orderReview, /buildStoreSocialImagePath/);
  assert.match(home, /\[settings\?\.updated, currentStore\?\.updated\]\.filter\(Boolean\)\.join\('-'\)/);
  assert.match(orderReview, /\[settings\?\.updated, currentStore\.updated\]\.filter\(Boolean\)\.join\('-'\)/);
  assert.match(home, /imageType: 'image\/jpeg'/);
  assert.match(orderReview, /imageType: 'image\/jpeg'/);
  assert.match(socialMeta, /og:image:type/);
});

test('imagen social de tienda conserva la portada completa sin depender de WebP', () => {
  assert.match(storeSocialImage, /settings\?\.cover_mode === 'carousel'[\s\S]*galleryHeroUrls\[0\]/);
  assert.match(storeSocialImage, /store\.bannerHeroUrl[\s\S]*settings\?\.coverHeroImageUrl/);
  assert.match(storeSocialImage, /fit: 'contain'/);
  assert.match(storeSocialImage, /'Content-Type': 'image\/jpeg'/);
  assert.match(storeSocialImage, /\.jpeg\(\{ quality/);
});

test('regalos entrega el WebP optimizado sin una segunda conversion a miniatura PNG', () => {
  assert.match(api, /giftsPublicImageUrl: giftsPublicImage \? getPocketBaseFileUrl\('settings', settings\.id, giftsPublicImage\) : null/);
  assert.doesNotMatch(api, /giftsPublicImageUrl:[^\n]*thumb/);
  assert.match(adminGifts, /const targetWidth = 1200;[\s\S]*const targetHeight = 675;/);
  assert.match(adminGifts, /canvas\.toBlob\(resolve, 'image\/webp', 0\.82\)/);
  assert.match(home, /\.public-gift-banner \{[^}]*aspect-ratio: 16 \/ 9/);
  assert.match(home, /\.public-gift-banner img \{[^}]*object-fit: contain/);
});

test('accesos y promos entregan WebP directo sin perder miniaturas heredadas', () => {
  assert.match(api, /getPublicImageDeliveryOptions\(image, '700x420'\)/);
});

test('portada descubre y prioriza solamente la primera imagen visible', () => {
  assert.match(layout, /rel="preconnect" href=\{pocketbaseOrigin\}/);
  assert.match(layout, /rel="dns-prefetch" href=\{pocketbaseOrigin\}/);
  assert.match(layout, /rel="preload" as="image" href=\{preloadImageUrl\} fetchpriority="high"/);
  assert.match(home, /heroPreloadImageUrl = isTemporarilyClosed \? '' : \(heroImages\[0\] \|\| ''\)/);
  assert.match(home, /preloadImage=\{heroPreloadImageUrl\}/);
  assert.match(home, /loading=\{index === 0 \? 'eager' : 'lazy'\}/);
  assert.match(home, /fetchpriority=\{index === 0 \? 'high' : undefined\}/);
  assert.match(home, /width="1600"[\s\S]*height="900"[\s\S]*decoding="async"/);
});

test('subida de portada respeta 1600x900 y no recomprime WebP ya optimizado', () => {
  assert.match(adminStoreSettings, /const maxWidth = 1600;[\s\S]*const maxHeight = 900;/);
  assert.match(adminStoreSettings, /const isReadyWebp = file\.type === 'image\/webp'/);
  assert.match(adminStoreSettings, /bitmap\.width <= maxWidth[\s\S]*bitmap\.height <= maxHeight/);
  assert.match(adminStoreSettings, /if \(isReadyWebp\)[\s\S]*return file;/);
});
