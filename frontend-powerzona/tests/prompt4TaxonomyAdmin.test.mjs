import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const products = read('../src/pages/admin/products.astro');
const catalog = read('../src/pages/admin/catalog.astro');
const category = read('../src/pages/admin/catalog/category/[id].astro');
const subcategory = read('../src/pages/admin/catalog/category/[categoryId]/subcategory/[subcategoryId].astro');
const tenantCatalog = read('../src/pages/t/[storeSlug]/admin/catalog.astro');
const tenantProducts = read('../src/pages/t/[storeSlug]/admin/products.astro');
const mobileAdmin = read('../../mobile-admin/app/src/main/java/com/tusenda84/admin/MainActivity.java');

test('Prompt 4: productos ofrece formularios y filtros completos de taxonomía', () => {
  assert.match(products, /id="product-category"/);
  assert.match(products, /id="product-subcategory"/);
  assert.match(products, /id="quick-category-panel"/);
  assert.match(products, /id="quick-subcategory-panel"/);
  assert.match(products, /id="category-filter"/);
  assert.match(products, /id="subcategory-filter"/);
  assert.match(products, /function updateSubcategoryOptions\(\)/);
  assert.match(products, /product\.category !== categoryId/);
  assert.match(products, /product\.subcategory !== subcategoryId/);
});

test('Prompt 4: catálogo administra categorías y subcategorías con búsqueda y estado', () => {
  assert.match(catalog, /id="category-form"/);
  assert.match(catalog, /id="subcategory-form"/);
  assert.match(catalog, /id="catalog-search" type="search"/);
  assert.match(catalog, /id="catalog-status-filter"/);
  assert.match(catalog, /subcategoryNameExists/);
  assert.match(catalog, /subcategoryRouteExists/);
  assert.match(catalog, /collections\/categories\/records/);
  assert.match(catalog, /collections\/subcategories\/records/);
});

test('Prompt 4: páginas de detalle conservan edición, filtros y borrado seguro', () => {
  assert.match(category, /id="category-form"/);
  assert.match(category, /id="subcategory-form"/);
  assert.match(category, /id="subcategories-search"/);
  assert.match(category, /id="direct-products-search"/);
  assert.match(subcategory, /id="subcategory-form"/);
  assert.match(subcategory, /id="subcategory-products-search"/);
  assert.match(subcategory, /formData\.append\('subcategory', ''\)/);
  assert.ok(
    subcategory.indexOf("collections/products/records")
      < subcategory.lastIndexOf("collections/subcategories/records"),
  );
});

test('Prompt 4: las rutas por tienda reutilizan el panel y Android carga esa misma aplicación', () => {
  assert.match(tenantCatalog, /import AdminCatalog/);
  assert.match(tenantCatalog, /<AdminCatalog \/>/);
  assert.match(tenantProducts, /import AdminProducts/);
  assert.match(tenantProducts, /<AdminProducts \/>/);
  assert.match(mobileAdmin, /webView\.loadUrl\(url\)/);
  assert.match(mobileAdmin, /BuildConfig\.ADMIN_URL/);
  assert.match(mobileAdmin, /onShowFileChooser/);
  assert.match(mobileAdmin, /FILE_CHOOSER_REQUEST/);
});

test('Prompt 4: creación rápida valida duplicados antes de invocar la API', () => {
  const categoryStart = products.indexOf('async function createQuickCategory');
  const subcategoryStart = products.indexOf('async function createQuickSubcategory');
  const saveStart = products.indexOf('async function saveProduct', subcategoryStart);
  const categoryFlow = products.slice(categoryStart, subcategoryStart);
  const subcategoryFlow = products.slice(subcategoryStart, saveStart);
  assert.match(categoryFlow, /duplicateCategory/);
  assert.ok(categoryFlow.indexOf('duplicateCategory') < categoryFlow.indexOf("apiRequest('/api/collections/categories/records'"));
  assert.match(subcategoryFlow, /duplicateSubcategory/);
  assert.ok(subcategoryFlow.indexOf('duplicateSubcategory') < subcategoryFlow.indexOf("apiRequest('/api/collections/subcategories/records'"));
});
