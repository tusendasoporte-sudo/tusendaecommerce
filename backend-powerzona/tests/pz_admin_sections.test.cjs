const assert = require('node:assert/strict');
const test = require('node:test');
const reads = require('../pb_hooks/pz_admin_read_lib.js');

const record = (values) => ({ id: values.id, get: (key) => values[key], publicExport: () => ({ ...values }) });
const context = (permissions = []) => ({ storeId: 'store0000000001', actor: {}, store: {}, adminReadPermissions: permissions });
function fakeApp(rows) {
  const calls = [];
  return {
    calls,
    findRecordsByFilter(collection, filter, sort, limit, offset, params) {
      calls.push({ collection, filter, sort, limit, offset, params });
      assert.equal(params.store, 'store0000000001');
      assert.match(filter, /(?:^|\.)store = \{:store\}/);
      return (rows[collection] || []).filter((row) => row.store === params.store).slice(offset, offset + limit).map(record);
    },
  };
}

test('catalog bootstrap conserva más de una página sin enviar descripciones ni otra tienda', () => {
  const products = Array.from({ length: 1005 }, (_, i) => ({ id: `p${i}`, store: 'store0000000001', name: `Producto ${i}`, stock: i, description: 'x'.repeat(10000) }));
  products.push({ id: 'foreign', store: 'other', name: 'Otra tienda' });
  const app = fakeApp({ products });
  const data = reads.catalogBootstrap(app, context(['catalog.view']));
  assert.equal(data.products.length, 1005);
  assert.equal(data.products[1004].stock, 1004);
  assert.equal(data.products.some((item) => 'description' in item || item.id === 'foreign'), false);
  assert.deepEqual(app.calls.filter((call) => call.collection === 'products').map((call) => call.offset), [0, 1000]);
});

test('cada sección exige sus permisos antes de consultar datos', () => {
  for (const name of ['catalogBootstrap', 'dashboardBootstrap', 'profitsBootstrap', 'giftsBootstrap', 'shippingBootstrap']) {
    const app = fakeApp({});
    assert.throws(() => reads[name](app, context()), /forbidden/);
    assert.equal(app.calls.length, 0);
  }
  assert.throws(() => reads.profitsBootstrap(fakeApp({}), context(['orders.view'])), /forbidden/);
});

test('resumen conserva el historial y los costes usados por ganancias sin contactos ni expansiones pesadas', () => {
  const store = 'store0000000001';
  const app = fakeApp({
    orders: [{ id: 'o1', store, created: '2020-01-01', customer_name: 'Cliente', total: 30, shipping: 5, customer_phone: 'private', receipt_token: 'secret' }],
    order_items: [{ id: 'i1', store, order: 'o1', product: 'p1', variation: 'v1', quantity: 2, unit_price_usd: 12, line_profit_usd: 10 }],
    products: [{ id: 'p1', store, name: 'Producto', cost_usd: 4, stock: 0, description: 'heavy' }],
    product_variations: [{ id: 'v1', store, cost_usd: 7, image: 'heavy.webp' }],
    reviews: [{ id: 'r1', store, rating: 5, comment: 'private', order: 'o1' }],
  });
  const data = reads.dashboardBootstrap(app, context(['orders.view', 'catalog.view']));
  assert.equal(data.orders[0].created, '2020-01-01');
  assert.equal(data.orders[0].customer_name, 'Cliente');
  assert.equal(data.orders[0].customer_phone, undefined);
  assert.equal(data.orders[0].receipt_token, undefined);
  assert.equal(data.order_items[0].line_profit_usd, 10);
  assert.equal(data.order_items[0].expand.product.cost_usd, 4);
  assert.equal(data.order_items[0].expand.variation.cost_usd, 7);
  assert.equal(data.order_items[0].expand.product.description, undefined);
  assert.deepEqual(data.reviews, []);
  assert.equal(app.calls.some((call) => call.collection === 'reviews'), false);
  const reviewed = reads.dashboardBootstrap(app, context(['orders.view', 'catalog.view', 'reviews.manage']));
  assert.equal(reviewed.reviews[0].rating, 5);
  assert.equal(reviewed.reviews[0].comment, undefined);
});

test('regalos y envíos conservan campos de edición y no ejecutan escrituras', () => {
  const store = 'store0000000001';
  const app = fakeApp({
    gifts: [{ id: 'g1', store, name: 'Regalo', description: 'Texto editable', min_order_usd: 10 }],
    settings: [{ id: 's1', store, active: true, gifts_public_title: 'Mis regalos' }],
    shipping_zones: [{ id: 'z1', store, municipality: 'Centro', price_usd: 2 }],
  });
  const gifts = reads.giftsBootstrap(app, context(['gifts.manage']));
  assert.equal(gifts.gifts[0].description, 'Texto editable');
  assert.equal(gifts.settings.gifts_public_title, 'Mis regalos');
  assert.equal(reads.shippingBootstrap(app, context(['shipping.manage'])).shipping_zones[0].price_usd, 2);
});
