import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const products = read('../src/pages/admin/products.astro');
const globalStyles = read('../src/styles/global.css');
const masterStyles = read('../src/styles/master-ui.css');
const paginationStyles = read('../src/styles/pagination.css');
const storeActivity = read('../src/components/admin/StoreActivityView.astro');

const responsivePaginationViews = [
  '../src/pages/admin/products.astro',
  '../src/pages/admin/orders.astro',
  '../src/pages/admin/expirations.astro',
  '../src/pages/admin/index.astro',
  '../src/pages/admin/app-installation-details.astro',
  '../src/components/admin/SecurityMonitoringView.astro',
  '../src/components/admin/SecurityVisitorDetailView.astro',
  '../src/components/admin/PushCampaignsView.astro',
  '../src/components/master/MasterStoreUsersView.astro',
  '../src/components/master/MasterStoresView.astro',
].map(read);

const paginationViews = [
  '../src/pages/admin/products.astro',
  '../src/pages/admin/orders.astro',
  '../src/pages/admin/expirations.astro',
  '../src/pages/admin/gifts.astro',
  '../src/pages/admin/notifications.astro',
  '../src/pages/admin/pageviews.astro',
  '../src/pages/admin/store-settings.astro',
  '../src/pages/admin/products/[productId]/history.astro',
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
  assert.match(products, /const desktopWindowSize = 5;/);
  assert.doesNotMatch(products, /const mobileWindowSize = 3;/);
  assert.match(products, /class="pagination-mobile-status"[^>]*>\$\{currentProductPage\} de \$\{totalPages\}<\/span>/);
  assert.match(products, /filtered\.slice\(startIndex, startIndex \+ PRODUCT_PAGE_SIZE\)/);
  assert.match(products, /\$\{PRODUCT_PAGE_SIZE\} por página/);
});

test('PAGINACION-GLOBAL: móvil muestra anterior, página de total y siguiente; escritorio conserva cinco', () => {
  assert.match(paginationStyles, /@media \(max-width: 760px\)/);
  assert.match(paginationStyles, /\[data-pagination-mobile-visible\]/);
  assert.match(paginationStyles, /grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\) !important;/);
  assert.match(paginationStyles, /\.pagination-mobile-status/);
  assert.match(paginationStyles, /display: none !important;/);
  for (const view of responsivePaginationViews) {
    assert.match(view, /data-pagination-mobile-visible/);
    assert.match(view, /pagination-mobile-status/);
  }
});

test('PAGINACION-GLOBAL: Admin, tienda publica y Master comparten el mismo estilo', () => {
  assert.match(globalStyles, /@import "\.\/pagination\.css";/);
  assert.match(masterStyles, /@import "\.\/pagination\.css";/);
  assert.match(paginationStyles, /PZ-GLOBAL-PAGINATION-002/);
  assert.match(paginationStyles, /\[class\*="pagination"\] \[aria-current="page"\]/);
  assert.match(paginationStyles, /background: #eaf4ff !important;/);
  assert.match(paginationStyles, /border-radius: 9px !important;/);
});

test('PAGINACION-GLOBAL: los controles móviles mantienen etiquetas de navegación en español', () => {
  assert.match(products, />Anterior<\/button>/);
  assert.match(products, />Siguiente<\/button>/);
  assert.match(storeActivity, />Anterior<\/button>/);
  assert.match(storeActivity, />Siguiente<\/button>/);
  assert.ok(paginationViews.some((view) => view.includes('Mostrando')));
});

test('PAGINACION-GLOBAL: Campañas push muestra página de total y resumen completo', () => {
  const pushCampaigns = read('../src/components/admin/PushCampaignsView.astro');
  assert.match(pushCampaigns, /data-page-mobile-label[^>]*>1 de 1<\/span>/);
  assert.match(pushCampaigns, /data-page-numbers data-pagination-mobile-visible="false"/);
  assert.match(pushCampaigns, /pageMobileLabel\.textContent = `\$\{state\.page\} de \$\{state\.totalPages\}`/);
  assert.match(pushCampaigns, /Mostrando \$\{pageStart\}.*de \$\{state\.totalItems\} campaña/);
  assert.match(pushCampaigns, /--pz-admin-mobile-topbar-offset, 118px/);
});
