import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const products = read('../src/pages/admin/products.astro');
const catalog = read('../src/pages/admin/catalog.astro');
const category = read('../src/pages/admin/catalog/category/[id].astro');
const subcategory = read('../src/pages/admin/catalog/category/[categoryId]/subcategory/[subcategoryId].astro');
const tenantSubcategoryRoute = read('../src/pages/t/[storeSlug]/admin/catalog/category/[categoryId]/subcategory/[subcategoryId].astro');

test('cada entrada del catálogo declara un origen de regreso cerrado', () => {
  const catalogCreateUrl = catalog.slice(
    catalog.indexOf('function productCreateUrl'),
    catalog.indexOf('function productEditUrl'),
  );
  const categoryCreateUrl = category.slice(
    category.indexOf('function productCreateUrl'),
    category.indexOf('function productEditUrl'),
  );

  assert.match(catalogCreateUrl, /params\.set\('from', 'catalog'\)/);
  assert.match(categoryCreateUrl, /params\.set\('from', 'category'\)/);
  assert.match(subcategory, /params\.set\('from', 'subcategory'\)/);
  assert.match(subcategory, /params\.set\('category', CATEGORY_ID\)/);
  assert.match(subcategory, /params\.set\('subcategory', SUBCATEGORY_ID\)/);
});

test('la categoría deja una sola acción por subcategoría y separa sus productos', () => {
  assert.match(category, /function subcategoryDetailUrl/);
  assert.match(category, /Editar subcategoría/);
  assert.match(category, />Crear producto directo</);
  assert.doesNotMatch(category, />Agregar producto</);
  assert.doesNotMatch(category, />Productos por subcategoria</);
  assert.doesNotMatch(category, /js-subcategory-group-product/);
});

test('el resumen de categoría queda limpio y delega el contenido a listados completos', () => {
  const summaryStart = category.indexOf('id="category-summary-view"');
  const summaryEnd = category.indexOf('id="category-subcategories-view"', summaryStart);
  const summary = category.slice(summaryStart, summaryEnd);

  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart);
  assert.match(summary, />Crear subcategoría</);
  assert.match(summary, /id="subcategories-view-all-btn"/);
  assert.match(summary, />Crear producto directo</);
  assert.match(summary, /id="direct-products-view-all-btn"/);
  assert.doesNotMatch(summary, /id="subcategories-list"/);
  assert.doesNotMatch(summary, /id="products-list"/);
  assert.doesNotMatch(summary, /Buscar subcategoría|Buscar producto/);
});

test('los botones Ver todas abren vistas internas buscables sin nuevas cargas', () => {
  assert.match(category, /id="category-subcategories-view"/);
  assert.match(category, /id="category-products-view"/);
  assert.match(category, /id="subcategories-search"/);
  assert.match(category, /id="direct-products-search"/);
  assert.match(category, /function normalizeCategoryView/);
  assert.match(category, /\['subcategories', 'products'\]\.includes\(value\)/);
  assert.match(category, /window\.history\.pushState/);
  assert.match(category, /window\.addEventListener\('popstate'/);
  assert.match(category, /activeCategoryView !== 'summary'/);
  assert.doesNotMatch(category, /subcategoriesExpanded|directProductsExpanded/);
});

test('la página dedicada conserva edición, productos, permisos y regreso a la categoría padre', () => {
  assert.match(subcategory, /class="subcategory-flow-back" href=\{parentCategoryPath\} data-subcategory-back/);
  assert.doesNotMatch(subcategory, /mobileBackHref=\{parentCategoryPath\}/);
  assert.match(subcategory, /\?view=subcategories/);
  assert.match(subcategory, /id="subcategory-form"/);
  assert.match(subcategory, /id="subcategory-create-product"/);
  assert.match(subcategory, /id="subcategory-products"/);
  assert.match(subcategory, /catalog\.categories\.manage/);
  assert.match(subcategory, /catalog\.products\.create/);
  assert.match(subcategory, /catalog\.products\.edit/);
  assert.match(subcategory, /subcategoryRecord\.category \|\| ''\) !== CATEGORY_ID/);
  assert.match(subcategory, /isCurrentStoreRecord\(subcategoryRecord\)/);
  assert.doesNotMatch(subcategory, /define:vars=\{\{[\s\S]*?adminAuthToken/);
});

test('editar la subcategoría conserva validación, optimización y guarda de cambios', () => {
  assert.match(subcategory, /siblingSubcategories\.some[\s\S]*?normalizeName\(item\.name\) === normalizeName\(name\)/);
  assert.match(subcategory, /pzSubcategoryImageOptimizer\.optimizeTaxonomyImageFile\(imageFile\)/);
  assert.match(subcategory, /formData\.append\('category', CATEGORY_ID\)/);
  assert.match(subcategory, /formData\.append\('store', CURRENT_STORE_ID\)/);
  assert.match(subcategory, /function hasChanges\(\)/);
  assert.match(subcategory, /title: 'Salir sin guardar'/);
  assert.match(subcategory, /window\.addEventListener\('pz:admin-back-request'/);
});

test('eliminar conserva el proceso que mueve productos a la categoría padre', () => {
  const start = subcategory.indexOf("deleteButton?.addEventListener('click'");
  const deleteFlow = subcategory.slice(start);

  assert.ok(start >= 0);
  assert.match(deleteFlow, /if \(products\.length > 0 && !CAN_EDIT_PRODUCTS\)/);
  assert.match(deleteFlow, /for \(const product of products\)/);
  assert.match(deleteFlow, /formData\.append\('category', CATEGORY_ID\)/);
  assert.match(deleteFlow, /formData\.append\('subcategory', ''\)/);
  assert.match(deleteFlow, /collections\/products\/records\/\$\{encodeURIComponent\(product\.id\)\}/);
  assert.match(deleteFlow, /collections\/subcategories\/records\/\$\{encodeURIComponent\(SUBCATEGORY_ID\)\}/);
  assert.ok(deleteFlow.indexOf('collections/products/records') < deleteFlow.indexOf('collections/subcategories/records'));
});

test('Productos valida categoría y subcategoría antes de construir el regreso', () => {
  const start = products.indexOf('function resolveProductEditorReturnContext');
  const end = products.indexOf('function syncProductEditorReturnContext', start);
  const resolver = products.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(resolver, /source === 'subcategory'/);
  assert.match(resolver, /item\.id === subcategoryId[\s\S]*?item\.category === categoryId[\s\S]*?isCurrentStoreRecord\(item\)/);
  assert.match(resolver, /category\/\$\{encodeURIComponent\(categoryId\)\}\/subcategory\/\$\{encodeURIComponent\(subcategoryId\)\}/);
  assert.match(resolver, /label: 'Volver a subcategoría'/);
  assert.match(resolver, /source === 'category'/);
  assert.match(resolver, /source === 'category-products'/);
  assert.match(resolver, /\?view=products/);
  assert.match(resolver, /label: 'Volver a productos directos'/);
  assert.match(resolver, /source === 'catalog'/);
  assert.doesNotMatch(resolver, /returnUrl|returnTo|redirect|location/);
});

test('los controles de salida conservan Productos como contexto predeterminado', () => {
  assert.match(products, /const label = String\(context\?\.label \|\| 'Volver a productos'\)/);
  assert.match(products, /editorCloseBtn\.textContent = `← \$\{label\}`/);
  assert.match(products, /editorSideBackBtn\.textContent = `← \$\{label\}`/);
  assert.match(products, /newProductBtn\?\.addEventListener\('click', \(\) => openNewProductEditor\(\)\)/);
  assert.match(products, /openEditProductEditor\(editProductId, returnContext\)/);
});

test('salir o terminar la creación regresa al origen seguro sin omitir guardas', () => {
  const closeStart = products.indexOf('async function requestCloseProductEditor');
  const closeEnd = products.indexOf('function openNewProductEditor', closeStart);
  const closeFlow = products.slice(closeStart, closeEnd);
  const postSaveStart = products.indexOf('async function declinePostSaveVariationChoice');
  const postSaveEnd = products.indexOf('async function deleteProductWithVariations', postSaveStart);
  const postSaveFlow = products.slice(postSaveStart, postSaveEnd);

  assert.ok(closeFlow.indexOf('hasProductChanges()') < closeFlow.indexOf('window.location.assign(productEditorReturnHref)'));
  assert.match(closeFlow, /if \(!confirmed\) return false;[\s\S]*?window\.location\.assign\(productEditorReturnHref\)/);
  assert.match(postSaveFlow, /if \(productEditorReturnHref\)[\s\S]*?window\.location\.assign\(productEditorReturnHref\)/);
  assert.match(postSaveFlow, /closeProductEditor\(\);[\s\S]*?await loadProducts\(\)/);
});

test('la ruta tenant monta la pantalla dedicada sin crear un flujo paralelo', () => {
  assert.match(tenantSubcategoryRoute, /import AdminSubcategoryDetail/);
  assert.match(tenantSubcategoryRoute, /<AdminSubcategoryDetail \/>/);
});
