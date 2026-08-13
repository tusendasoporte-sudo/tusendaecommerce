import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const orders = read('../src/pages/admin/orders.astro');
const products = read('../src/pages/admin/products.astro');

test('pedidos usa una lectura consolidada y difiere catalogo y zonas hasta abrirlos', () => {
  assert.match(orders, /\/api\/pz\/admin\/read\/orders-bootstrap/);
  assert.match(orders, /productCatalogLoaded/);
  assert.match(orders, /shippingZonesLoaded/);
  assert.match(orders, /if \(opening && CAN_MANAGE_ORDER_SHIPPING\) await loadShippingZones\(\)/);
  assert.match(orders, /if \(opening\) await loadProductCatalog\(\)/);
  assert.doesNotMatch(orders, /await loadOrderItemSummaries\(\)/);
  assert.doesNotMatch(orders, /sort=-created&expand=shipping_zone,currency&perPage=200/);

  const authenticatedStartup = orders.match(/else if \(getAdminToken\(\)\) \{([\s\S]*?)\n\s*\} else \{/)?.[1] || '';
  assert.doesNotMatch(authenticatedStartup, /loadProductCatalog\(\)/);
  assert.doesNotMatch(authenticatedStartup, /loadShippingZones\(\)/);
  assert.doesNotMatch(authenticatedStartup, /loadStoreSettings\(\)/);
  assert.match(authenticatedStartup, /loadOrders\(\)/);
});

test('productos obtiene metadatos y listado en una sola lectura administrativa', () => {
  assert.match(products, /\/api\/pz\/admin\/read\/products-bootstrap/);
  assert.match(products, /active_shipping_zone_count/);
  assert.doesNotMatch(products, /loadAllRecords\('products', withStoreFilter\('sort=name'\)\)/);
  assert.doesNotMatch(products, /loadAllRecords\('categories', withStoreFilter\('sort=order,name'\)\)/);
  assert.doesNotMatch(products, /loadAllRecords\('subcategories', withStoreFilter\('sort=order,name'\)\)/);
});
