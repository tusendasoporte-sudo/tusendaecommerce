const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const adminReads = require(path.join(root, 'pb_hooks', 'pz_admin_read_lib.js'));

function record(values) {
  return {
    id: values.id,
    get(key) { return values[key]; },
    publicExport() { return { ...values }; },
  };
}

test('admin read valida el tenant y rechaza campos inesperados', () => {
  assert.deepEqual(adminReads.parseBootstrapPayload({ store_id: 'store0000000001' }), { storeId: 'store0000000001' });
  assert.throws(() => adminReads.parseBootstrapPayload({ store_id: 'bad' }), /invalid_payload/);
  assert.throws(() => adminReads.parseBootstrapPayload({ store_id: 'store0000000001', page: 1 }), /invalid_payload/);
});

test('admin read construye un filtro enlazado para los articulos de las ordenes visibles', () => {
  const result = adminReads.orderItemFilter(['order000000001', 'order000000002']);
  assert.equal(result.filter, 'order = {:order0} || order = {:order1}');
  assert.deepEqual(result.bindings, { order0: 'order000000001', order1: 'order000000002' });
});

test('admin read elimina datos de contacto y tokens segun permisos', () => {
  const source = {
    id: 'order000000001',
    customer_name: 'Cliente',
    customer_phone: '555',
    customer_email: 'cliente@example.test',
    customer_address: 'Calle 1',
    customer: 'customer0000001',
    receipt_token: 'receipt',
    review_token: 'review',
    expand: { customer: { id: 'customer0000001' }, currency: { code: 'USD' } },
  };
  const safe = adminReads.redactOrder(source, { contactCustomers: false, manageReviews: false });
  assert.equal(safe.customer_name, 'Cliente');
  assert.equal(safe.customer_phone, undefined);
  assert.equal(safe.customer_email, undefined);
  assert.equal(safe.customer_address, undefined);
  assert.equal(safe.customer, undefined);
  assert.equal(safe.receipt_token, undefined);
  assert.equal(safe.review_token, undefined);
  assert.deepEqual(safe.expand, { currency: { code: 'USD' } });
});

test('bootstrap de productos consolida colecciones y proyecta campos livianos', () => {
  const rows = {
    categories: [record({ id: 'category0000001', store: 'store0000000001', name: 'Cat', active: true })],
    subcategories: [],
    products: [record({
      id: 'product00000001', store: 'store0000000001', name: 'Producto', slug: 'producto',
      description: 'texto pesado que no pertenece al listado', images: ['one.webp'], active: true,
    })],
    currencies: [record({ id: 'currency0000001', store: 'store0000000001', code: 'USD', exchange_rate: 1 })],
    shipping_zones: [record({ id: 'shipping0000001', store: 'store0000000001', active: true })],
  };
  const calls = [];
  const app = {
    findRecordsByFilter(collection, filter, sort, limit) {
      calls.push({ collection, filter, sort, limit });
      return rows[collection] || [];
    },
  };
  const data = adminReads.productsBootstrap(app, {
    master: true,
    storeId: 'store0000000001',
    actor: {},
    store: record({ id: 'store0000000001', plan: 'basic' }),
  });
  assert.equal(data.products.length, 1);
  assert.equal(data.products[0].name, 'Producto');
  assert.equal(data.products[0].description, undefined);
  assert.equal(data.active_shipping_zone_count, 1);
  assert.equal(data.product_quota.state, 'unavailable');
  assert.equal(data.product_quota.can_create, false);
  assert.deepEqual(calls.map((call) => call.collection), [
    'categories', 'subcategories', 'products', 'currencies', 'shipping_zones', 'promo_sites',
  ]);
});

test('rutas e indices de lectura administrativa quedan declarados y reversibles', () => {
  const routes = readFileSync(path.join(root, 'pb_hooks', 'pz_admin_read.pb.js'), 'utf8');
  const migration = readFileSync(path.join(root, 'pb_migrations', '1786580100_admin_read_performance.js'), 'utf8');
  assert.match(routes, /\/api\/pz\/admin\/read\/products-bootstrap/);
  assert.match(routes, /\/api\/pz\/admin\/read\/orders-bootstrap/);
  assert.match(routes, /requireAuth\(\)/);
  assert.match(routes, /bodyLimit\(1024\)/);
  assert.match(migration, /idx_orders_store_created/);
  assert.match(migration, /idx_order_items_order_created/);
  assert.match(migration, /idx_products_store_name/);
  assert.match(migration, /idx_product_variations_product_type_value/);
  assert.match(migration, /removeIndexIfExists/);
});
