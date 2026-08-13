import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const products = read('../src/pages/admin/products.astro');
const globalStyles = read('../src/styles/global.css');
const masterStyles = read('../src/styles/master-ui.css');
const paginationStyles = read('../src/styles/pagination.css');

const paginationViews = [
  '../src/pages/admin/products.astro',
  '../src/pages/admin/orders.astro',
  '../src/pages/admin/expirations.astro',
  '../src/pages/admin/gifts.astro',
  '../src/pages/admin/notifications.astro',
  '../src/pages/admin/pageviews.astro',
  '../src/pages/admin/store-settings.astro',
  '../src/pages/admin/products/[productId]/history.astro',
  '../src/components/admin/StoreActivityView.astro',
  '../src/components/admin/SecurityMonitoringView.astro',
  '../src/components/admin/SecurityVisitorDetailView.astro',
  '../src/components/master/MasterNotificationsView.astro',
  '../src/components/master/MasterPriceWatchDetailView.astro',
  '../src/components/master/MasterStoreAnalyticsView.astro',
  '../src/components/master/MasterStoreProductsView.astro',
  '../src/components/master/MasterStoreUsersView.astro',
  '../src/components/master/MasterStoresView.astro',
  '../src/pages/master/price-watch.astro',
  '../src/components/public-store/PublicStoreHome.astro',
  '../src/pages/producto/[slug].astro',
].map(read);

test('PAGINACION-GLOBAL: Productos muestra diez registros y una ventana compacta', () => {
  assert.match(products, /const PRODUCT_PAGE_SIZE = 10;/);
  assert.match(products, /const windowSize = 5;/);
  assert.match(products, /const firstPage = Math\.max\(1, Math\.min\(currentProductPage - 2, totalPages - windowSize \+ 1\)\);/);
  assert.match(products, /filtered\.slice\(startIndex, startIndex \+ PRODUCT_PAGE_SIZE\)/);
  assert.match(products, /\$\{PRODUCT_PAGE_SIZE\} por página/);
});

test('PAGINACION-GLOBAL: Admin, tienda publica y Master comparten el mismo estilo', () => {
  assert.match(globalStyles, /@import "\.\/pagination\.css";/);
  assert.match(masterStyles, /@import "\.\/pagination\.css";/);
  assert.match(paginationStyles, /PZ-GLOBAL-PAGINATION-001/);
  assert.match(paginationStyles, /\[class\*="pagination"\] \[aria-current="page"\]/);
  assert.match(paginationStyles, /background: #eaf4ff !important;/);
  assert.match(paginationStyles, /border-radius: 9px !important;/);
});

test('PAGINACION-GLOBAL: los controles visibles usan Anterior y Proximo en espanol', () => {
  for (const view of paginationViews) {
    assert.doesNotMatch(view, />Siguiente(?:<|\s)/);
  }
  assert.match(products, />Anterior<\/button>/);
  assert.match(products, />Próximo<\/button>/);
});
