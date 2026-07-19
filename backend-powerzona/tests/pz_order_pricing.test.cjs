const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pricing = require('../pb_hooks/pz_order_pricing_lib.js');
const priceWatch = require('../pb_hooks/pz_master_price_watch_lib.js');

const IDS = Object.freeze({
  store: 'storeprice00001',
  otherStore: 'storeprice00002',
  currency: 'currencyprice01',
  settings: 'settingsprice01',
  product: 'productprice001',
  variationProduct: 'productprice002',
  otherProduct: 'productprice003',
  variation: 'variationprice1',
  otherVariation: 'variationprice2',
  crossVariation: 'variationprice3',
  order: 'orderprice00001',
});

function mutableRecord(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    set(key, value) { this[key] = value; },
  };
}

function premiumStore(id = IDS.store) {
  return mutableRecord(id, {
    name: 'PZPRICEQA tienda',
    slug: `pzpriceqa-${id}`,
    status: 'active',
    active: true,
    plan: 'premium',
    plan_started_at: '2026-01-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: true,
  });
}

function fixtureTables(overrides = {}) {
  const store = premiumStore();
  const otherStore = premiumStore(IDS.otherStore);
  return {
    stores: [store, otherStore],
    settings: [mutableRecord(IDS.settings, {
      store: store.id,
      active: true,
      order_prefix: 'QA',
      notifications_enabled: true,
      notify_new_order: true,
    })],
    currencies: [mutableRecord(IDS.currency, {
      store: store.id,
      active: true,
      is_default: true,
      code: 'USD',
      exchange_rate: 1,
    })],
    shipping_zones: [],
    categories: [],
    subcategories: [],
    products: [
      mutableRecord(IDS.product, {
        store: store.id,
        name: 'Producto canonico',
        active: true,
        base_price_usd: 10,
        regular_price_usd: 10,
        stock: 10,
        track_stock: true,
        has_variations: false,
        only_usd: false,
        category: '',
        subcategory: '',
      }),
      mutableRecord(IDS.variationProduct, {
        store: store.id,
        name: 'Producto con variacion',
        active: true,
        base_price_usd: 10,
        regular_price_usd: 10,
        stock: 10,
        track_stock: true,
        has_variations: true,
        only_usd: false,
        category: '',
        subcategory: '',
      }),
      mutableRecord(IDS.otherProduct, {
        store: otherStore.id,
        name: 'Producto otra tienda',
        active: true,
        base_price_usd: 99,
        regular_price_usd: 99,
        stock: 10,
        track_stock: true,
      }),
    ],
    product_variations: [
      mutableRecord(IDS.variation, {
        product: IDS.variationProduct,
        variation_type: 'Tamano',
        value: 'Grande',
        active: true,
        price_usd: 12,
        stock: 8,
      }),
      mutableRecord(IDS.otherVariation, {
        product: IDS.variationProduct,
        variation_type: 'Tamano',
        value: 'Pequeno',
        active: true,
        price_usd: 8,
        stock: 8,
      }),
      mutableRecord(IDS.crossVariation, {
        product: IDS.otherProduct,
        variation_type: 'Tamano',
        value: 'Ajeno',
        active: true,
        price_usd: 77,
        stock: 8,
      }),
    ],
    automatic_promotions: [],
    manual_coupons: [],
    gifts: [],
    orders: [],
    order_items: [],
    ...overrides,
  };
}

function fixtureApp(overrides = {}) {
  const tables = fixtureTables(overrides);
  return {
    tables,
    findRecordById(collection, id) {
      const found = (tables[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit = 200, offset = 0, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.store) rows = rows.filter((item) => item.store === params.store);
      if (params.product) rows = rows.filter((item) => item.product === params.product);
      if (params.order) rows = rows.filter((item) => item.order === params.order);
      if (params.code) rows = rows.filter((item) => String(item.code || '') === String(params.code));
      if (params.token) rows = rows.filter((item) => item.store === params.store && item.receipt_token === params.token);
      return rows.slice(offset, offset + limit);
    },
    save(record) { return record; },
  };
}

function checkoutPayload(item = {}, extra = {}) {
  return {
    store_id: IDS.store,
    idempotency_key: 'PZPRICEQA_token_12345678',
    currency_id: IDS.currency,
    delivery_method: 'pickup',
    customer_name: 'Cliente QA',
    customer_phone: '+1 555 123 4567',
    items: [{ product_id: IDS.product, quantity: 1, ...item }],
    ...extra,
  };
}

function parsed(item = {}, extra = {}) {
  const result = pricing.parseCheckoutPayload(checkoutPayload(item, extra));
  assert.ok(result);
  return result;
}

test('el contrato publico acepta solo referencias/cantidad e ignora nombre, precios y totales manipulados', () => {
  const result = pricing.parseCheckoutPayload(checkoutPayload({
    product_name: 'Nombre F12',
    unit_price_usd: 0.01,
    price_usd: 999999,
    price: 'texto',
    subtotal: -50,
    line_total: 0.01,
  }, {
    total: 0.01,
    subtotal: 0.01,
    shipping: 999999,
    store: IDS.otherStore,
  }));
  assert.deepEqual(result.items, [{ giftId: '', productId: IDS.product, variationId: '', quantity: 1, isGift: false }]);
  for (const field of ['product_name', 'unit_price_usd', 'price_usd', 'price', 'subtotal', 'line_total', 'total', 'shipping', 'store']) {
    assert.equal(Object.hasOwn(result, field), false, field);
  }
});

test('rechaza cantidades cero, negativas, decimales, excesivas y lineas duplicadas', () => {
  for (const quantity of [0, -1, 1.5, 100001, 'texto']) {
    assert.equal(pricing.parseCheckoutPayload(checkoutPayload({ quantity })), null, String(quantity));
  }
  assert.equal(pricing.parseCheckoutPayload(checkoutPayload({}, {
    items: [
      { product_id: IDS.product, quantity: 1 },
      { product_id: IDS.product, quantity: 1 },
    ],
  })), null);
});

test('reutiliza el precio comercial oficial para producto, variacion y oferta', () => {
  assert.equal(priceWatch.effectiveCommercialPrice(mutableRecord('', { base_price_usd: 10, regular_price_usd: 10 })).effective, 10);
  assert.equal(priceWatch.effectiveCommercialPrice(mutableRecord('', { base_price_usd: 10, regular_price_usd: 10, is_offer: true, offer_price_usd: 7 })).effective, 7);
  assert.equal(priceWatch.effectiveCommercialPrice(mutableRecord(''), mutableRecord('', { active: true, price_usd: 12, is_offer: true, offer_price_usd: 9 })).effective, 9);
});

test('producto general conserva siempre precio/nombre canonicos y multiplica la cantidad aceptada', () => {
  const plan = pricing.buildCheckoutPlan(fixtureApp(), parsed({ quantity: 3, unit_price_usd: 0.01, product_name: 'Falso' }), new Date('2026-07-18T12:00:00Z'));
  assert.equal(plan.totals.items[0].title, 'Producto canonico');
  assert.equal(plan.totals.items[0].unit_price_original_usd, 10);
  assert.equal(plan.totals.items[0].line_subtotal_final_usd, 30);
  assert.equal(plan.totals.subtotalFinalUSD, 30);
});

test('variacion usa su precio real y rechaza ausencia, otro producto y otra tienda', () => {
  const app = fixtureApp();
  const plan = pricing.buildCheckoutPlan(app, parsed({ product_id: IDS.variationProduct, variation_id: IDS.variation, quantity: 2 }), new Date('2026-07-18T12:00:00Z'));
  assert.equal(plan.totals.items[0].unit_price_original_usd, 12);
  assert.equal(plan.totals.items[0].line_subtotal_final_usd, 24);
  for (const item of [
    { product_id: IDS.variationProduct, variation_id: '', quantity: 1 },
    { product_id: IDS.product, variation_id: IDS.variation, quantity: 1 },
    { product_id: IDS.variationProduct, variation_id: IDS.crossVariation, quantity: 1 },
    { product_id: IDS.otherProduct, quantity: 1 },
  ]) {
    assert.throws(() => pricing.buildCheckoutPlan(app, parsed(item), new Date('2026-07-18T12:00:00Z')), /order_unavailable/);
  }
});

test('ofertas, promociones, cupones y moneda mixta se calculan desde registros actuales', () => {
  const base = fixtureTables();
  base.products[0].is_offer = true;
  base.products[0].offer_price_usd = 8;
  base.products[0].only_usd = true;
  base.automatic_promotions = [mutableRecord('promotionqa001', {
    store: IDS.store,
    active: true,
    name: 'Promo 25',
    type: 'product_discount',
    scope: 'product',
    discount_type: 'percentage',
    discount_value: 25,
    product: IDS.product,
    priority: 1,
  })];
  const plan = pricing.buildCheckoutPlan(fixtureApp(base), parsed({ quantity: 2 }), new Date('2026-07-18T12:00:00Z'));
  assert.equal(plan.totals.subtotalOriginalUSD, 16);
  assert.equal(plan.totals.discountTotalUSD, 4);
  assert.equal(plan.totals.subtotalFinalUSD, 12);
  assert.equal(plan.totals.usdOnlyTotal, 12);

  const coupon = pricing.calculateCartWithManualCoupon([
    { id: IDS.product, price: 10, quantity: 2, only_usd: false },
  ], [], {
    id: 'couponprice0001', code: 'QA20', active: true, scope: 'cart',
    discount_type: 'percentage', discount_value: 20, unlimited_uses: true,
  }, 'pickup', 0, new Date('2026-07-18T12:00:00Z'));
  assert.equal(coupon.couponWinner, 'manual_coupon');
  assert.equal(coupon.subtotalFinalUSD, 16);
});

test('motor backend mantiene paridad numerica con las formulas aprobadas del carrito', () => {
  const source = readFileSync(path.join(__dirname, '../../frontend-powerzona/public/cart-promotions.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const cart = [{ id: IDS.product, price: 10, quantity: 3, only_usd: false, category: '', subcategory: '' }];
  const promotions = [{
    id: 'promotionqa001', name: 'Promo QA', active: true, type: 'product_discount', scope: 'product',
    discount_type: 'percentage', discount_value: 10, product: IDS.product, priority: 1,
  }];
  const coupon = {
    id: 'couponprice0001', code: 'QA20', active: true, scope: 'cart',
    discount_type: 'percentage', discount_value: 20, unlimited_uses: true,
  };
  const backend = pricing.calculateCartWithManualCoupon(structuredClone(cart), promotions, coupon, 'pickup', 0, new Date());
  const frontend = context.window.PZPromotions.calculateCartWithManualCoupon(structuredClone(cart), promotions, coupon, 'pickup', 0);
  for (const field of ['subtotalOriginalUSD', 'discountTotalUSD', 'subtotalFinalUSD', 'couponDiscountUSD', 'shippingDiscountUSD']) {
    assert.equal(backend[field], frontend[field], field);
  }
  assert.equal(backend.couponWinner, frontend.couponWinner);
  assert.equal(backend.items[0].line_subtotal_final_usd, frontend.items[0].line_subtotal_final_usd);
});

test('stock y V7E9 bloquean vencidos/exceso pero conservan 30 y 1 dias con precio canonico', () => {
  const now = new Date('2026-07-18T12:00:00Z');
  for (const expirationDate of ['2026-08-17', '2026-07-19']) {
    const app = fixtureApp();
    app.tables.products[0].expiration_date = expirationDate;
    const plan = pricing.buildCheckoutPlan(app, parsed({ unit_price_usd: 0.01 }), now);
    assert.equal(plan.totals.items[0].unit_price_original_usd, 10);
  }
  const expiredApp = fixtureApp();
  expiredApp.tables.products[0].expiration_date = '2026-07-18';
  assert.throws(() => pricing.buildCheckoutPlan(expiredApp, parsed(), now), /order_unavailable/);
  assert.throws(() => pricing.buildCheckoutPlan(fixtureApp(), parsed({ quantity: 11 }), now), /order_unavailable/);

  const variationExpired = fixtureApp();
  variationExpired.tables.product_variations[0].expiration_date = '2026-07-18';
  assert.throws(() => pricing.buildCheckoutPlan(
    variationExpired,
    parsed({ product_id: IDS.variationProduct, variation_id: IDS.variation }),
    now,
  ), /order_unavailable/);
});

test('disponibilidad oficial bloquea taxonomia oculta y horario cerrado sin permiso de pedidos', () => {
  const app = fixtureApp();
  app.tables.products[0].category = 'categoryprice01';
  app.tables.categories.push(mutableRecord('categoryprice01', { store: IDS.store, active: false }));
  assert.throws(() => pricing.buildCheckoutPlan(app, parsed(), new Date('2026-07-20T14:00:00Z')), /order_unavailable/);

  const settings = mutableRecord(IDS.settings, {
    business_hours_mode: 'custom',
    allow_orders_when_closed: false,
    business_hours: {
      monday: { enabled: true, open: '09:00', close: '18:00' },
    },
  });
  assert.equal(pricing.ordersAllowedBySettings(settings, new Date('2026-07-20T14:00:00Z')), true);
  assert.equal(pricing.ordersAllowedBySettings(settings, new Date('2026-07-21T02:00:00Z')), false);
  settings.business_hours_mode = 'temporarily_closed';
  assert.equal(pricing.ordersAllowedBySettings(settings, new Date('2026-07-20T14:00:00Z')), false);
});

test('hook directo rechaza cualquier mutacion REST de order_items', () => {
  const app = fixtureApp();
  app.tables.orders.push(mutableRecord(IDS.order, { store: IDS.store, currency: IDS.currency, delivery_method: 'pickup' }));
  const record = mutableRecord('orderitemqa001', {
    order: IDS.order,
    product: IDS.product,
    quantity: 2,
    product_name: 'F12',
    unit_price_usd: 0.01,
    unit_price_final_usd: 999999,
    line_total_usd: 'texto',
  });
  assert.deepEqual(pricing.canonicalizeOrderItemRecord(app, record, new Date('2026-07-18T12:00:00Z')), {
    code: 'direct_order_item_mutation_forbidden',
    field: 'order_item',
  });
});

test('hook de orden recalcula total, envio, moneda y cupon desde lineas canonicas', () => {
  const app = fixtureApp();
  app.tables.order_items.push(mutableRecord('orderitemqa002', {
    order: IDS.order,
    line_subtotal_original_usd: 20,
    line_total_usd: 18,
    line_discount_usd: 2,
    coupon_discount_usd: 2,
    coupon_id: 'couponprice0001',
    coupon_code: 'QA20',
    promotion_name: 'Cupon QA20',
    only_usd: false,
    is_gift: false,
  }));
  const order = mutableRecord(IDS.order, {
    store: IDS.store,
    currency: IDS.currency,
    delivery_method: 'pickup',
    shipping_zone: 'shipzoneprice01',
    subtotal: 0.01,
    shipping: 999999,
    total: 0.01,
    coupon_discount_usd: 999999,
    coupon_code: 'FALSO',
    original() { return { store: IDS.store }; },
  });
  assert.equal(pricing.canonicalizeOrderRecord(app, order), null);
  assert.equal(order.subtotal, 18);
  assert.equal(order.shipping, 0);
  assert.equal(order.shipping_zone, '');
  assert.equal(order.total, 18);
  assert.equal(order.coupon_discount_usd, 2);
  assert.equal(order.coupon_code, 'QA20');
});

test('snapshot economico recalcula cantidades con la promocion original y nunca con catalogo o reglas nuevas', () => {
  const tables = fixtureTables();
  tables.automatic_promotions = [mutableRecord('promotionqa001', {
    store: IDS.store,
    active: true,
    name: 'Acuerdo original 25',
    type: 'product_discount',
    scope: 'product',
    discount_type: 'percentage',
    discount_value: 25,
    product: IDS.product,
    priority: 10,
  })];
  tables.manual_coupon_usages = [mutableRecord('usageprice00001', { order: IDS.order, coupon: 'couponprice0001' })];
  const app = fixtureApp(tables);
  const plan = pricing.buildCheckoutPlan(app, parsed({ quantity: 2 }), new Date('2026-07-18T12:00:00Z'));
  const order = mutableRecord(IDS.order, {
    store: IDS.store,
    currency: IDS.currency,
    delivery_method: 'pickup',
    status: 'pending',
    shipping: 0,
    shipping_original_usd: 0,
    exchange_rate_used: 1,
    economic_snapshot_version: 1,
    economic_snapshot_json: plan.economicSnapshot,
  });
  const item = mutableRecord('orderitemqa003');
  pricing.applyCanonicalItemValues(item, plan.totals.items[0], order.id, plan.currency);
  app.tables.orders.push(order);
  app.tables.order_items.push(item);

  app.tables.products[0].base_price_usd = 999;
  app.tables.products[0].regular_price_usd = 999;
  app.tables.automatic_promotions[0].discount_value = 99;
  item.quantity = 3;
  pricing.recalculateOrderEconomics(app, order);

  assert.equal(item.unit_price_original_usd, 10);
  assert.equal(item.unit_price_after_automatic_discount_usd, 7.5);
  assert.equal(item.line_discount_usd, 7.5);
  assert.equal(item.line_total_usd, 22.5);
  assert.equal(order.subtotal_before_manual_adjustments_usd, 22.5);
  assert.equal(app.tables.manual_coupon_usages.length, 1);

  item.has_manual_price_adjustment = true;
  item.manual_final_unit_price_usd = 6;
  item.manual_adjustment_reason_code = 'customer_agreement';
  pricing.recalculateOrderEconomics(app, order);
  assert.equal(item.unit_price_after_automatic_discount_usd, 7.5);
  assert.equal(item.unit_price_final_usd, 6);
  assert.equal(item.manual_adjustment_total_usd, -4.5);
  assert.equal(order.subtotal_before_manual_adjustments_usd, 22.5);
  assert.equal(order.manual_adjustment_total_usd, -4.5);
  assert.equal(order.subtotal_after_manual_adjustments_usd, 18);
});

test('orden legacy congela valores almacenados antes de cambiar cantidad sin consultar promociones vigentes', () => {
  const app = fixtureApp();
  const order = mutableRecord(IDS.order, {
    store: IDS.store,
    currency: IDS.currency,
    delivery_method: 'pickup',
    status: 'pending',
    shipping: 0,
    exchange_rate_used: 1,
    coupon_id: 'couponprice0001',
    coupon_code: 'HIST20',
    coupon_discount_usd: 1,
  });
  const item = mutableRecord('orderitemqa004', {
    order: order.id,
    product: IDS.product,
    product_name: 'Producto historico',
    quantity: 2,
    unit_price_original_usd: 10,
    unit_price_final_usd: 9,
    unit_price_usd: 9,
    line_subtotal_original_usd: 20,
    line_discount_usd: 2,
    line_subtotal_final_usd: 18,
    line_total_usd: 18,
    coupon_id: 'couponprice0001',
    coupon_code: 'HIST20',
    coupon_discount_usd: 1,
    promotion_id: 'promotionhist1',
    promotion_name: 'Promocion historica',
    promotion_type: 'product_discount',
    only_usd: false,
  });
  app.tables.orders.push(order);
  app.tables.order_items.push(item);
  pricing.freezeLegacyLineEconomics(item);
  item.quantity = 3;
  app.tables.products[0].base_price_usd = 500;
  app.tables.automatic_promotions.push(mutableRecord('promotionnew001', { active: true, discount_value: 100 }));

  pricing.recalculateOrderEconomics(app, order);
  assert.equal(item.unit_price_original_usd, 10);
  assert.equal(item.unit_price_after_automatic_discount_usd, 9);
  assert.equal(item.line_total_usd, 27);
  assert.equal(item.line_discount_usd, 3);
  assert.equal(item.coupon_code, 'HIST20');
  assert.equal(order.coupon_code, 'HIST20');
});

test('endpoint, migracion y checkout cierran escritura publica y garantizan una transaccion unica', () => {
  const root = path.join(__dirname, '..', '..');
  const hook = readFileSync(path.join(root, 'backend-powerzona/pb_hooks/pz_order_pricing_lib.js'), 'utf8');
  const routes = readFileSync(path.join(root, 'backend-powerzona/pb_hooks/pz_order_pricing.pb.js'), 'utf8');
  const migration = readFileSync(path.join(root, 'backend-powerzona/pb_migrations/1784422800_canonical_order_pricing_backend.js'), 'utf8');
  const checkout = readFileSync(path.join(root, 'frontend-powerzona/src/pages/checkout.astro'), 'utf8');
  const tenantCheckout = readFileSync(path.join(root, 'frontend-powerzona/src/pages/t/[storeSlug]/checkout.astro'), 'utf8');
  assert.match(routes, /POST[\s\S]*\/api\/pz\/checkout\/orders/);
  assert.match(hook, /\$app\.runInTransaction\(\(txApp\) => \{/);
  for (const call of ['createOrderRecord(txApp', 'createOrderItems(txApp', 'createCouponUsage(txApp', 'createOrderNotification(txApp']) assert.match(hook, new RegExp(call.replace('(', '\\(')));
  assert.match(migration, /orders\.createRule = `\(\(\$\{MASTER_ADMIN_RULE\}\) \|\| \(\$\{STORE_ADMIN_ORDER_RULE\}\)\) && \$\{INTERNAL_IDENTITY_FIELDS_BLOCK_RULE\}`/);
  assert.match(migration, /security_identity_erased_at:isset = false/);
  assert.match(migration, /orderItems\.createRule = `\(\$\{MASTER_ADMIN_RULE\}\) \|\| \(\$\{STORE_ADMIN_ORDER_ITEM_RULE\}\)`/);
  assert.equal(checkout.includes("pocketbaseRequest('orders'"), false);
  assert.equal(checkout.includes("pocketbaseRequest('order_items'"), false);
  assert.match(checkout, /createCanonicalCheckoutOrder\(\{/);
  assert.match(tenantCheckout, /<StoreCheckoutPage \/>/);
});

test('C1 expone solo mutaciones privadas, auditoria inmutable y UI sin precio libre', () => {
  const root = path.join(__dirname, '..', '..');
  const routes = readFileSync(path.join(root, 'backend-powerzona/pb_hooks/pz_order_pricing.pb.js'), 'utf8');
  const hook = readFileSync(path.join(root, 'backend-powerzona/pb_hooks/pz_order_pricing_lib.js'), 'utf8');
  const migration = readFileSync(path.join(root, 'backend-powerzona/pb_migrations/1784509200_order_economic_snapshots_adjustments.js'), 'utf8');
  const admin = readFileSync(path.join(root, 'frontend-powerzona/src/pages/admin/orders.astro'), 'utf8');
  const receipt = readFileSync(path.join(root, 'frontend-powerzona/src/pages/orden/[orderNumber]/[token].astro'), 'utf8');

  for (const endpoint of [
    '/api/pz/admin/orders/{orderId}/items/{itemId}/quantity',
    '/api/pz/admin/orders/{orderId}/items',
    '/api/pz/admin/orders/{orderId}/items/{itemId}',
    '/api/pz/admin/orders/{orderId}/items/{itemId}/price-adjustments',
    '/api/pz/admin/orders/{orderId}/items/{itemId}/price-adjustments/reset',
  ]) assert.ok(routes.includes(endpoint), endpoint);
  assert.match(hook, /direct_order_item_mutation_forbidden/);
  assert.match(hook, /MANUAL_ADJUSTMENT_STATES.*pending.*confirmed.*preparing/);
  assert.match(hook, /MAX_MANUAL_UNIT_PRICE_USD = 1000000/);
  assert.match(hook, /zero_price_confirmation_required/);
  assert.match(hook, /createPriceAdjustmentAudit/);
  assert.match(migration, /name: "order_price_adjustments"/);
  assert.match(migration, /createRule: null,[\s\S]*updateRule: null,[\s\S]*deleteRule: null/);
  assert.match(migration, /orderItems\.createRule = null/);
  assert.match(migration, /orderItems\.updateRule = null/);
  assert.match(migration, /orderItems\.deleteRule = null/);
  assert.equal(admin.includes('class="edit-item-unit-price"'), false);
  assert.equal(admin.includes('id="add-product-price"'), false);
  assert.match(admin, /Ajustar precio/);
  assert.match(admin, /Motivo obligatorio/);
  assert.match(admin, /confirm_zero_price/);
  assert.match(admin, /handlePriceAdjustmentKeydown/);
  assert.match(receipt, /Ajuste especial/);
  assert.equal(receipt.includes('manual_adjustment_reason_code'), false);
  assert.equal(receipt.includes('manual_adjusted_by'), false);
});

test('C2 exige un motivo nuevo y un payload cerrado para restablecer el precio', () => {
  const rejected = [
    {},
    { reason_code: '' },
    { reason_code: 'not_allowed', reason_text: '' },
    { reason_code: 'other', reason_text: '' },
    { reason_code: 'other', reason_text: '1234' },
    { reason_code: 'other', reason_text: 'x'.repeat(501) },
    { reason_code: 'price_correction', reason_text: '', actor: IDS.store },
    { reason_code: 'price_correction', reason_text: '', final_unit_price_usd: 1 },
    { reason_code: 'price_correction', reason_text: '', total: 1 },
  ];
  for (const payload of rejected) {
    assert.throws(() => pricing.validateResetPayload(payload), (error) => {
      assert.ok(['invalid_adjustment_reason', 'invalid_reset_payload'].includes(error.privateCode));
      return true;
    });
  }
  assert.deepEqual(pricing.validateResetPayload({ reason_code: 'price_correction', reason_text: '' }), {
    code: 'price_correction', text: '',
  });
  assert.deepEqual(pricing.validateResetPayload({ reason_code: 'other', reason_text: '12345' }), {
    code: 'other', text: '12345',
  });
});

test('C2 conserva el ajuste retirado en auditoria y ejecuta reset dentro de la transaccion', () => {
  const root = path.join(__dirname, '..', '..');
  const hook = readFileSync(path.join(root, 'backend-powerzona/pb_hooks/pz_order_pricing_lib.js'), 'utf8');
  const resetStart = hook.indexOf('function handleOrderItemAdjustmentReset(e)');
  const resetEnd = hook.indexOf('\nfunction canonicalizeOrderRecord', resetStart);
  const resetBlock = hook.slice(resetStart, resetEnd);
  assert.ok(resetStart >= 0 && resetEnd > resetStart);
  assert.match(resetBlock, /validateResetPayload\(body\)/);
  assert.match(resetBlock, /previousUnitAdjustment = previousFinal - automaticUnit/);
  assert.match(resetBlock, /previousTotalAdjustment = previousUnitAdjustment \* recordNumber\(item, "quantity"\)/);
  assert.match(resetBlock, /reasonCode: reason\.code, reasonText: reason\.text/);
  assert.match(resetBlock, /createPriceAdjustmentAudit/);
  assert.ok(hook.indexOf('createPriceAdjustmentAudit', resetStart) > hook.indexOf('recalculateOrderEconomics', resetStart));
  assert.match(hook, /\$app\.runInTransaction\(\(txApp\) => \{ payload = callback\(txApp\); \}\)/);
});
