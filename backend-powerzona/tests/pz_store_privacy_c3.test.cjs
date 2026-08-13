'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const privacy = require('../pb_hooks/pz_store_permission_enforcement_lib.js');

const STORE_ID = 'storeprivacy001';
const STAFF_ID = 'staffprivacy001';
const PRIMARY_ID = 'primaryprivacy1';

function record(id, values = {}) {
  const hidden = new Set();
  return {
    id,
    ...values,
    hidden,
    get(key) { return this[key]; },
    hide(...fields) { fields.forEach((field) => hidden.add(field)); return this; },
  };
}

function fieldsDataRecord(id, values) {
  const hidden = new Set();
  return {
    id,
    hidden,
    fieldsData() { return { id, ...values }; },
    get(key) { return key === 'id' ? id : values[key]; },
    hide(...fields) { fields.forEach((field) => hidden.add(field)); return this; },
  };
}

function publicCatalogFixture(values = {}) {
  const store = record(STORE_ID, {
    status: 'active',
    active: true,
    plan: 'premium',
    plan_started_at: '2026-01-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: true,
  });
  const tables = {
    stores: [store],
    products: values.products || [],
    product_variations: values.variations || [],
    automatic_promotions: values.promotions || [],
    categories: values.categories || [],
    subcategories: values.subcategories || [],
  };
  return {
    app: {
      findRecordById(collection, id) {
        const found = (tables[collection] || []).find((entry) => entry.id === id);
        if (!found) throw new Error('not_found');
        return found;
      },
      findRecordsByFilter(collection, _filter, _sort, limit = 500, offset = 0, params = {}) {
        let rows = [...(tables[collection] || [])];
        if (params.product) rows = rows.filter((entry) => entry.product === params.product);
        return rows.slice(offset, offset + limit);
      },
    },
    store,
    tables,
  };
}

function fixture(assignedPermissions) {
  const store = record(STORE_ID, {
    status: 'active',
    slug: 'tienda-privada',
    primary_admin_user: PRIMARY_ID,
    plan: 'premium',
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: true,
  });
  const staff = record(STAFF_ID, {
    role: 'store_staff',
    status: 'active',
    store: STORE_ID,
    tokenKey: () => 'privacy-key',
  });
  const access = record('accessprivacy01', {
    store: STORE_ID,
    user: STAFF_ID,
    template_code: 'custom',
    permissions_json: assignedPermissions,
  });
  const app = {
    findRecordById(collection, id) {
      if (collection === 'stores' && id === STORE_ID) return store;
      if (collection === 'users' && id === STAFF_ID) return staff;
      throw new Error('not_found');
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection === 'store_user_access' && params.store === STORE_ID && params.user === STAFF_ID) return access;
      throw new Error('not_found');
    },
    findRecordsByFilter(collection) {
      if (collection === 'users') return [staff];
      throw new Error('not_found');
    },
  };
  return { app, staff, store };
}

function readWithQuery(data, collection, query) {
  let nextCalls = 0;
  privacy.enforceRead({
    app: data.app,
    auth: data.staff || null,
    collection: { name: collection },
    requestInfo: () => ({ query }),
    next() { nextCalls += 1; },
  });
  return nextCalls;
}

function assertQueryDenied(data, collection, query) {
  assert.throws(
    () => readWithQuery(data, collection, query),
    (error) => error.code === 'permission_denied' && error.permission === 'query.restricted',
  );
}

test('settings parciales usan fieldsData y solo revelan campos del módulo Landing QR', () => {
  const { app, staff } = fixture(['landing_qr.manage']);
  const settings = fieldsDataRecord('settingspriv001', {
    store: STORE_ID,
    store_name: 'Tienda segura',
    whatsapp_number: '+53 55555555',
    welcome_text: 'Bienvenidos',
    logo_image: 'logo.webp',
    landing_qr_title: 'Mis enlaces',
    business_notes: 'Nota privada',
    default_currency: 'currencypriv001',
    order_prefix: 'SECRET',
    notifications_enabled: true,
  });
  privacy.enforceRead({
    app,
    auth: staff,
    record: settings,
    collection: { name: 'settings' },
    next() {},
  });
  for (const visible of ['id', 'store', 'store_name', 'whatsapp_number', 'welcome_text', 'logo_image', 'landing_qr_title']) {
    assert.equal(settings.hidden.has(visible), false, visible);
  }
  for (const hidden of ['business_notes', 'default_currency', 'order_prefix', 'notifications_enabled']) {
    assert.equal(settings.hidden.has(hidden), true, hidden);
  }
  assert.equal(privacy.settingsReadFieldPermission('whatsapp_number'), '');
  assert.equal(privacy.settingsReadFieldPermission('welcome_text'), '');
  assert.equal(privacy.settingsReadFieldPermission('logo_image'), '');
  assert.equal(privacy.settingsFieldPermission('whatsapp_number'), 'store.settings.manage');
  assert.equal(privacy.settingsFieldPermission('business_notes'), 'store.settings.manage');
  assert.deepEqual(
    privacy.requiredSettingsPermissions(['landing_qr_title', 'landing_qr_subtitle'], 'update', {}),
    ['landing_qr.manage'],
  );
  assert.deepEqual(
    privacy.requiredSettingsPermissions(['landing_qr_title', 'active'], 'update', { active: true }),
    ['landing_qr.manage', 'store.settings.manage'],
  );
});

test('RecordEnrich aplica redaccion antes de serializar en PocketBase', () => {
  const { app, staff } = fixture(['landing_qr.manage']);
  const settings = fieldsDataRecord('settingspriv005', {
    store: STORE_ID,
    landing_qr_title: 'Visible',
    business_notes: 'Privado',
    order_prefix: 'PRIVATE',
  });
  let nextCalls = 0;
  privacy.enforceEnrich({
    app,
    record: settings,
    requestInfo: { auth: staff },
    next() { nextCalls += 1; },
  }, 'settings');
  assert.equal(nextCalls, 1);
  assert.equal(settings.hidden.has('landing_qr_title'), false);
  assert.equal(settings.hidden.has('business_notes'), true);
  assert.equal(settings.hidden.has('order_prefix'), true);
});

test('respuesta de mutación settings queda redactada para actor parcial', () => {
  const { app, staff } = fixture(['landing_qr.manage']);
  const settings = fieldsDataRecord('settingspriv002', {
    store: STORE_ID,
    landing_qr_title: 'Actualizado',
    business_notes: 'No devolver',
    order_prefix: 'PRIVATE',
  });
  let nextCalls = 0;
  privacy.enforceMutation({
    app,
    auth: staff,
    record: settings,
    collection: { name: 'settings' },
    requestInfo: () => ({ body: { landing_qr_title: 'Actualizado' } }),
    next() { nextCalls += 1; },
  }, 'settings', 'update');
  assert.equal(nextCalls, 1);
  assert.equal(settings.hidden.has('landing_qr_title'), false);
  assert.equal(settings.hidden.has('business_notes'), true);
  assert.equal(settings.hidden.has('order_prefix'), true);
});

test('settings público nunca devuelve business_notes ni flags operativos', () => {
  const settings = fieldsDataRecord('settingspriv003', {
    active: true,
    store_name: 'Tienda pública',
    welcome_text: 'Compra con confianza',
    default_currency: 'currencypriv001',
    pickup_coordination_message: 'Coordinamos por WhatsApp',
    notifications_enabled: true,
    notify_review_pending: false,
    business_notes: 'Observación privada',
    order_prefix: 'PRIVATE',
    notification_cleanup_days: 15,
    notify_new_order: true,
  });
  let nextCalls = 0;
  privacy.enforceRead({
    app: {},
    auth: null,
    record: settings,
    collection: { name: 'settings' },
    next() { nextCalls += 1; },
  });
  assert.equal(nextCalls, 1);
  for (const visible of [
    'active', 'store_name', 'welcome_text', 'default_currency', 'pickup_coordination_message',
    'notifications_enabled', 'notify_review_pending',
  ]) {
    assert.equal(settings.hidden.has(visible), false, visible);
  }
  for (const hidden of ['business_notes', 'order_prefix', 'notification_cleanup_days', 'notify_new_order']) {
    assert.equal(settings.hidden.has(hidden), true, hidden);
  }
});

test('allowlist F12 de settings permite campos del modulo y bloquea campos ocultos', () => {
  const marketing = fixture(['promotions.manage']);
  assert.equal(readWithQuery(marketing, 'settings', {
    filter: `active=true && store="${STORE_ID}" && marketing_bar_active=true`,
    sort: '-updated',
    fields: 'id,store,marketing_bar_text,marketing_bar_active',
  }), 1);
  assertQueryDenied(marketing, 'settings', { filter: 'business_notes != ""' });
  assertQueryDenied(marketing, 'settings', { sort: 'order_prefix' });
  assertQueryDenied(marketing, 'settings', { fields: 'id,business_notes' });
  assertQueryDenied(marketing, 'settings', { expand: 'default_currency' });

  const publicData = { app: {}, staff: null };
  assert.equal(readWithQuery(publicData, 'settings', {
    filter: `active=true && store="${STORE_ID}"`,
    sort: '-updated,-created',
    expand: 'default_currency',
  }), 1);
  assertQueryDenied(publicData, 'settings', { filter: 'business_notes != ""' });
  assertQueryDenied(publicData, 'settings', { sort: 'notification_cleanup_days' });
  assertQueryDenied(publicData, 'settings', { expand: 'store' });
});

test('allowlist F12 de Marketing acepta parent directo y rechaza traversal relacional', () => {
  const promotions = fixture(['promotions.manage']);
  assert.equal(readWithQuery(promotions, 'automatic_promotions', {
    filter: 'active=true && product="productprivacy1"',
    sort: 'priority,-updated',
    fields: 'id,name,product,priority,updated',
  }), 1);
  assertQueryDenied(promotions, 'automatic_promotions', { filter: 'product.cost_usd > 0' });
  assertQueryDenied(promotions, 'automatic_promotions', { sort: 'product.stock' });
  assertQueryDenied(promotions, 'automatic_promotions', {
    expand: 'product',
    fields: 'id,expand.product.expiration_date',
  });
  assert.equal(readWithQuery(promotions, 'store_visual_items', {
    filter: 'active=true',
    sort: 'sort_order,title',
  }), 1);
  assertQueryDenied(promotions, 'store_visual_items', { filter: 'category.store != ""' });

  const coupons = fixture(['coupons.manage']);
  assert.equal(readWithQuery(coupons, 'manual_coupons', {
    filter: 'active=true && product="productprivacy1"',
    sort: '-updated',
  }), 1);
  assertQueryDenied(coupons, 'manual_coupons', { filter: 'product.expiration_date != ""' });
});

test('allowlist F12 cubre contacto de pedidos/usos y economia de catalogo publico', () => {
  const orders = fixture(['orders.view']);
  assert.equal(readWithQuery(orders, 'orders', {
    filter: 'status="pending" && order_number != ""',
    sort: '-created',
  }), 1);
  assertQueryDenied(orders, 'orders', { filter: 'customer_phone != ""' });
  assertQueryDenied(orders, 'orders', { sort: 'customer' });
  assertQueryDenied(orders, 'orders', { filter: 'customer.email != ""' });
  assertQueryDenied(orders, 'orders', { filter: 'store.settings_via_store.business_notes != ""' });
  assertQueryDenied(orders, 'order_items', { filter: 'order.customer_phone != ""' });
  assertQueryDenied(orders, 'order_items', { filter: 'order.review_token != ""' });
  assertQueryDenied(orders, 'order_items', { filter: 'product.cost_usd > 0' });
  assertQueryDenied(orders, 'order_items', { filter: 'order.store.business_notes != ""' });

  const ordersAndCatalog = fixture(['orders.view', 'catalog.view']);
  assert.equal(readWithQuery(ordersAndCatalog, 'order_items', {
    filter: 'product.cost_usd > 0 && order.status="pending"',
    sort: '-created',
  }), 1);

  const reviews = fixture(['reviews.manage']);
  assertQueryDenied(reviews, 'reviews', { filter: 'order.customer_phone != ""' });
  assertQueryDenied(reviews, 'reviews', { filter: 'product.cost_usd > 0' });

  const usages = fixture(['coupons.manage', 'orders.view']);
  assert.equal(readWithQuery(usages, 'manual_coupon_usages', {
    filter: 'coupon="couponprivacy01"',
    sort: '-created',
  }), 1);
  assertQueryDenied(usages, 'manual_coupon_usages', { filter: 'customer_name != ""' });
  assertQueryDenied(usages, 'manual_coupon_usages', { filter: 'order.customer_email != ""' });

  const publicData = { app: {}, staff: null };
  assert.equal(readWithQuery(publicData, 'products', {
    filter: `active=true && stock > 0 && store="${STORE_ID}"`,
    sort: 'name,-updated',
    expand: 'category,subcategory',
  }), 1);
  assertQueryDenied(publicData, 'products', { filter: 'cost_usd > 0' });
  assertQueryDenied(publicData, 'products', { sort: 'expiration_date' });
  assertQueryDenied(publicData, 'products', { filter: 'store.business_notes != ""' });
  assertQueryDenied(publicData, 'products', { filter: 'category.store != ""' });
  assertQueryDenied(publicData, 'products', { expand: 'store' });
  assertQueryDenied(publicData, 'products', { fields: 'id,provider' });
  assert.equal(readWithQuery(publicData, 'product_variations', {
    filter: 'product="productprivacy1" && active=true',
    sort: 'sort_order,variation_type,value',
  }), 1);
  assertQueryDenied(publicData, 'product_variations', { filter: 'product.internal_ref != ""' });
  assert.equal(readWithQuery(publicData, 'automatic_promotions', {
    filter: `active=true && store="${STORE_ID}"`,
    sort: 'priority,-updated',
    fields: 'id,store,name,type,scope,product,priority,updated',
  }), 1);
  assertQueryDenied(publicData, 'automatic_promotions', { filter: 'product.expiration_date != ""' });
  assertQueryDenied(publicData, 'automatic_promotions', { sort: 'product.stock' });
  assertQueryDenied(publicData, 'automatic_promotions', { expand: 'product' });
});

test('catálogo público conserva precio/stock y oculta economía interna', () => {
  const product = record('productpublic01', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    name: 'Producto',
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    cost_usd: 8,
    profit_margin: 60,
    internal_ref: 'INTERNAL-1',
    expiration_date: '2026-12-01',
    provider: 'Proveedor privado',
  });
  const catalog = publicCatalogFixture({ products: [product] });
  privacy.enforceRead({
    app: catalog.app,
    auth: null,
    record: product,
    collection: { name: 'products' },
    next() {},
  });
  for (const hidden of privacy.PUBLIC_PRODUCT_PRIVATE_FIELDS) assert.equal(product.hidden.has(hidden), true, hidden);
  assert.equal(product.hidden.has('base_price_usd'), false);
  assert.equal(product.hidden.has('stock'), false);
  assert.equal(product.hidden.has('name'), false);
});

test('catálogo público filtra por unidad canónica antes de ocultar expiration_date', () => {
  const parentWithRetainedVariation = record('productpublic03', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2099-12-01',
  });
  const expiredParent = record('productpublic04', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2000-01-01',
  });
  const mixedContainer = record('productpublic05', {
    store: STORE_ID,
    active: true,
    has_variations: true,
    base_price_usd: 1,
    regular_price_usd: 1,
    stock: 99,
    track_stock: true,
    expiration_date: '2000-01-01',
  });
  const allExpiredContainer = record('productpublic07', {
    store: STORE_ID,
    active: true,
    has_variations: true,
    base_price_usd: 1,
    regular_price_usd: 1,
    stock: 99,
    track_stock: true,
    expiration_date: '',
  });
  const retained = record('variationpub001', {
    product: parentWithRetainedVariation.id,
    active: true,
    price_usd: 40,
    stock: 5,
    expiration_date: '2000-01-01',
  });
  const expiredVariation = record('variationpub002', {
    product: mixedContainer.id,
    active: true,
    price_usd: 12,
    stock: 5,
    expiration_date: '2000-01-01',
  });
  const validVariation = record('variationpub003', {
    product: mixedContainer.id,
    active: true,
    price_usd: 13,
    stock: 5,
    expiration_date: '2099-12-01',
  });
  const outOfStockVariation = record('variationpub004', {
    product: mixedContainer.id,
    active: true,
    price_usd: 14,
    stock: 0,
    expiration_date: '2099-12-01',
  });
  const allExpiredVariation = record('variationpub005', {
    product: allExpiredContainer.id,
    active: true,
    price_usd: 15,
    stock: 5,
    expiration_date: '2000-01-01',
  });
  const catalog = publicCatalogFixture({
    products: [parentWithRetainedVariation, expiredParent, mixedContainer, allExpiredContainer],
    variations: [retained, expiredVariation, validVariation, outOfStockVariation, allExpiredVariation],
  });
  const productEvent = {
    app: catalog.app,
    auth: null,
    collection: { name: 'products' },
    result: { items: [parentWithRetainedVariation, expiredParent, mixedContainer, allExpiredContainer] },
    next() {
      this.serializedIds = this.result.items.map((entry) => entry.id);
    },
  };
  privacy.enforceRead(productEvent);
  assert.deepEqual(productEvent.result.items.map((entry) => entry.id), [parentWithRetainedVariation.id, mixedContainer.id]);
  assert.deepEqual(productEvent.serializedIds, [parentWithRetainedVariation.id, mixedContainer.id]);
  assert.equal(parentWithRetainedVariation.hidden.has('expiration_date'), true);
  assert.equal(mixedContainer.hidden.has('expiration_date'), true);

  const pagedEvent = {
    app: catalog.app,
    auth: null,
    collection: { name: 'products' },
    records: [expiredParent],
    result: { page: 1, perPage: 1, totalItems: 3, totalPages: 3, items: [expiredParent] },
    requestInfo: () => ({ query: { filter: 'active=true', sort: 'id', page: '1', perPage: '1' } }),
    next() {},
  };
  privacy.enforceRead(pagedEvent);
  assert.deepEqual(pagedEvent.result.items.map((entry) => entry.id), [parentWithRetainedVariation.id]);
  assert.equal(pagedEvent.result.totalItems, 2);
  assert.equal(pagedEvent.result.totalPages, 2);
  assert.deepEqual(pagedEvent.records.map((entry) => entry.id), [parentWithRetainedVariation.id]);
  const secondPage = {
    ...pagedEvent,
    records: [parentWithRetainedVariation],
    result: { page: 2, perPage: 1, totalItems: 3, totalPages: 3, items: [parentWithRetainedVariation] },
    requestInfo: () => ({ query: { filter: 'active=true', sort: 'id', page: '2', perPage: '1' } }),
  };
  privacy.enforceRead(secondPage);
  assert.deepEqual(secondPage.result.items.map((entry) => entry.id), [mixedContainer.id]);

  const variationEvent = {
    app: catalog.app,
    auth: null,
    collection: { name: 'product_variations' },
    records: [retained, expiredVariation, validVariation, outOfStockVariation, allExpiredVariation],
    next() {},
  };
  privacy.enforceRead(variationEvent);
  assert.deepEqual(variationEvent.records.map((entry) => entry.id), [validVariation.id, outOfStockVariation.id]);
  assert.equal(validVariation.hidden.has('expiration_date'), true);
  assert.equal(outOfStockVariation.hidden.has('expiration_date'), true);
  assert.throws(() => privacy.enforceRead({
    app: catalog.app,
    auth: null,
    record: retained,
    collection: { name: 'product_variations' },
    next() {},
  }), (error) => error.code === 'not_found');
});

test('promociones públicas dirigidas a producto exigen al menos una unidad vendible', () => {
  const availableProduct = record('promoproduct001', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2999-01-01',
  });
  const expiredProduct = record('promoproduct002', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2000-01-01',
  });
  const mixedProduct = record('promoproduct003', {
    store: STORE_ID,
    active: true,
    has_variations: true,
    base_price_usd: 1,
    regular_price_usd: 1,
    stock: 99,
    track_stock: true,
  });
  const allExpiredProduct = record('promoproduct004', {
    store: STORE_ID,
    active: true,
    has_variations: true,
    base_price_usd: 1,
    regular_price_usd: 1,
    stock: 99,
    track_stock: true,
  });
  const variations = [
    record('promovariation1', {
      product: mixedProduct.id, active: true, price_usd: 12, stock: 5, expiration_date: '2000-01-01',
    }),
    record('promovariation2', {
      product: mixedProduct.id, active: true, price_usd: 13, stock: 5, expiration_date: '2999-01-01',
    }),
    record('promovariation3', {
      product: allExpiredProduct.id, active: true, price_usd: 14, stock: 5, expiration_date: '2000-01-01',
    }),
  ];
  const promotion = (id, values) => record(id, {
    store: STORE_ID,
    active: true,
    type: 'product_discount',
    scope: 'product',
    discount_type: 'percentage',
    discount_value: 10,
    ...values,
  });
  const expiredPromotion = promotion('promotionpub01', { product: expiredProduct.id });
  const availablePromotion = promotion('promotionpub02', { product: availableProduct.id });
  const mixedPromotion = promotion('promotionpub03', { product: mixedProduct.id });
  const allExpiredPromotion = promotion('promotionpub04', { product: allExpiredProduct.id });
  const missingPromotion = promotion('promotionpub05', { product: 'missingproduct01' });
  const crossStorePromotion = promotion('promotionpub06', { store: 'storeprivacy999', product: availableProduct.id });
  const categoryPromotion = promotion('promotionpub07', {
    type: 'category_discount', scope: 'category', product: '', category: 'categorypub001',
  });
  const cartPromotion = promotion('promotionpub08', {
    type: 'cart_subtotal_discount', scope: 'cart', product: '', min_subtotal_usd: 50,
  });
  const promotions = [
    expiredPromotion,
    availablePromotion,
    mixedPromotion,
    allExpiredPromotion,
    missingPromotion,
    crossStorePromotion,
    categoryPromotion,
    cartPromotion,
  ];
  const catalog = publicCatalogFixture({
    products: [availableProduct, expiredProduct, mixedProduct, allExpiredProduct],
    variations,
    promotions,
  });

  const firstPage = {
    app: catalog.app,
    auth: null,
    collection: { name: 'automatic_promotions' },
    records: [expiredPromotion, availablePromotion],
    result: { page: 1, perPage: 2, totalItems: promotions.length, totalPages: 4, items: [expiredPromotion, availablePromotion] },
    requestInfo: () => ({ query: { filter: `active=true && store="${STORE_ID}"`, sort: 'id' } }),
    next() {},
  };
  privacy.enforceRead(firstPage);
  assert.deepEqual(firstPage.result.items.map((item) => item.id), [availablePromotion.id, mixedPromotion.id]);
  assert.deepEqual(firstPage.records.map((item) => item.id), [availablePromotion.id, mixedPromotion.id]);
  assert.equal(firstPage.result.totalItems, 4);
  assert.equal(firstPage.result.totalPages, 2);

  const secondPage = {
    ...firstPage,
    records: [allExpiredPromotion, missingPromotion],
    result: { page: 2, perPage: 2, totalItems: promotions.length, totalPages: 4, items: [allExpiredPromotion, missingPromotion] },
  };
  privacy.enforceRead(secondPage);
  assert.deepEqual(secondPage.result.items.map((item) => item.id), [categoryPromotion.id, cartPromotion.id]);

  let unavailableResponse = null;
  let unavailableNext = 0;
  privacy.enforceRead({
    app: catalog.app,
    auth: null,
    record: expiredPromotion,
    collection: { name: 'automatic_promotions' },
    response: { header: () => ({ set() {} }) },
    json(status, body) { unavailableResponse = { status, body }; },
    next() { unavailableNext += 1; },
  });
  assert.equal(unavailableNext, 0);
  assert.deepEqual(unavailableResponse, {
    status: 404,
    body: { code: 404, message: "The requested resource wasn't found.", data: {} },
  });

  let availableNext = 0;
  privacy.enforceRead({
    app: catalog.app,
    auth: null,
    record: availablePromotion,
    collection: { name: 'automatic_promotions' },
    next() { availableNext += 1; },
  });
  assert.equal(availableNext, 1);

  let realtimeUnavailableNext = 0;
  privacy.enforceRealtimeMessage({
    app: catalog.app,
    client: { get() { return null; } },
    message: {
      name: 'automatic_promotions/update',
      data: JSON.stringify({ record: { id: expiredPromotion.id, product: availableProduct.id } }),
    },
    next() { realtimeUnavailableNext += 1; },
  });
  assert.equal(realtimeUnavailableNext, 0);

  const publicMessage = {
    name: 'automatic_promotions/update',
    data: JSON.stringify({ record: {
      id: availablePromotion.id,
      product: availableProduct.id,
      expand: { product: { id: availableProduct.id, expiration_date: '2999-01-01' } },
    } }),
  };
  let realtimeAvailableNext = 0;
  privacy.enforceRealtimeMessage({
    app: catalog.app,
    client: { get() { return null; } },
    message: publicMessage,
    next() { realtimeAvailableNext += 1; },
  });
  assert.equal(realtimeAvailableNext, 1);
  assert.equal(Object.hasOwn(JSON.parse(publicMessage.data).record.expand, 'product'), false);
});

test('catálogo público evalúa variaciones vendibles después del primer lote de 500', () => {
  const parent = record('productpublic08', {
    store: STORE_ID,
    active: true,
    has_variations: true,
    base_price_usd: 1,
    regular_price_usd: 1,
    stock: 99,
    track_stock: true,
    expiration_date: '2000-01-01',
  });
  const variations = Array.from({ length: 500 }, (_, index) => record(`variationbulk${String(index).padStart(4, '0')}`, {
    product: parent.id,
    active: true,
    price_usd: 10,
    stock: 0,
    expiration_date: '',
  }));
  variations.push(record('variationbulk0500', {
    product: parent.id,
    active: true,
    price_usd: 19,
    stock: 5,
    expiration_date: '2999-12-01',
  }));
  const catalog = publicCatalogFixture({ products: [parent], variations });
  const offsets = [];
  const findRecordsByFilter = catalog.app.findRecordsByFilter.bind(catalog.app);
  catalog.app.findRecordsByFilter = (collection, filter, sort, limit, offset, params) => {
    if (collection === 'product_variations') offsets.push(offset);
    return findRecordsByFilter(collection, filter, sort, limit, offset, params);
  };

  assert.equal(
    privacy.publicProductRecordAvailable(catalog.app, 'products', parent, new Date('2026-07-21T16:00:00.000Z')),
    true,
  );
  assert.deepEqual(offsets, [0, 500]);
});

test('catalogo publico conserva productos y variaciones agotados sin habilitar su compra', () => {
  const simple = record('productpublic09', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 0,
    track_stock: true,
    allow_preorder: false,
  });
  const variable = record('productpublic10', {
    store: STORE_ID,
    active: true,
    has_variations: true,
    stock: 0,
    track_stock: true,
  });
  const soldoutVariation = record('variationpublic10', {
    product: variable.id,
    active: true,
    price_usd: 14,
    stock: 0,
    allow_preorder: false,
  });
  const catalog = publicCatalogFixture({ products: [simple, variable], variations: [soldoutVariation] });
  const now = new Date('2026-07-21T16:00:00.000Z');

  assert.equal(privacy.publicProductRecordAvailable(catalog.app, 'products', simple, now), true);
  assert.equal(privacy.publicProductRecordAvailable(catalog.app, 'products', variable, now), true);
  assert.equal(privacy.publicProductRecordAvailable(catalog.app, 'product_variations', soldoutVariation, now), true);
});

test('vista y realtime públicos de unidad no vendible fallan sin fecha ni razón comercial', () => {
  const expired = record('productpublic06', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2000-01-01',
  });
  const available = record('productpublic07', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2999-01-01',
  });
  const catalog = publicCatalogFixture({ products: [expired, available] });
  const headers = new Map();
  assert.throws(() => privacy.enforceRead({
    app: catalog.app,
    auth: null,
    record: expired,
    collection: { name: 'products' },
    response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
    next() {},
  }), (error) => error.code === 'not_found' && !String(error.message).includes('expir'));
  assert.equal(headers.get('Cache-Control'), 'private, no-store, max-age=0');
  assert.equal(expired.hidden.has('expiration_date'), false);

  let nextCalls = 0;
  let response = null;
  privacy.enforceRead({
    app: catalog.app,
    auth: null,
    record: expired,
    collection: { name: 'products' },
    response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
    json(status, body) { response = { status, body }; },
    next() { nextCalls += 1; },
  });
  assert.equal(nextCalls, 0);
  assert.deepEqual(response, {
    status: 404,
    body: { code: 404, message: "The requested resource wasn't found.", data: {} },
  });
  assert.equal(headers.get('Cache-Control'), 'private, no-store, max-age=0');

  const middlewareHeaders = new Map();
  let middlewareNextCalls = 0;
  privacy.enforcePublicProductReadCachePolicy({
    app: catalog.app,
    request: {
      method: 'GET',
      url: { path: `/api/collections/products/records/${expired.id}` },
    },
    response: { header: () => ({ set: (key, value) => middlewareHeaders.set(key, value) }) },
    next() { middlewareNextCalls += 1; },
  });
  assert.equal(middlewareNextCalls, 1);
  assert.equal(middlewareHeaders.get('Cache-Control'), 'private, no-store, max-age=0');

  middlewareHeaders.clear();
  privacy.enforcePublicProductReadCachePolicy({
    app: catalog.app,
    request: {
      method: 'GET',
      url: { path: `/api/collections/products/records/${available.id}` },
    },
    response: { header: () => ({ set: (key, value) => middlewareHeaders.set(key, value) }) },
    next() { middlewareNextCalls += 1; },
  });
  assert.equal(middlewareNextCalls, 2);
  assert.equal(middlewareHeaders.get('Cache-Control'), 'private, no-store, max-age=0');

  middlewareHeaders.clear();
  privacy.enforcePublicProductReadCachePolicy({
    app: catalog.app,
    request: {
      method: 'GET',
      url: { path: '/api/collections/product_variations/records' },
    },
    response: { header: () => ({ set: (key, value) => middlewareHeaders.set(key, value) }) },
    next() { middlewareNextCalls += 1; },
  });
  assert.equal(middlewareNextCalls, 3);
  assert.equal(middlewareHeaders.get('Cache-Control'), 'private, no-store, max-age=0');

  let realtimeSends = 0;
  privacy.enforceRealtimeMessage({
    app: catalog.app,
    client: { get() { return null; } },
    message: {
      name: 'products/update',
      data: JSON.stringify({ record: { id: expired.id, collectionName: 'products', expiration_date: expired.expiration_date } }),
    },
    next() { realtimeSends += 1; },
  });
  assert.equal(realtimeSends, 0);
});

test('analytics raw se bloquea siempre y cupón usado exige coupons+orders sin mutaciones REST', () => {
  const analyticsFixture = fixture(['analytics.view']);
  assert.throws(() => privacy.enforceRead({
    app: analyticsFixture.app,
    auth: analyticsFixture.staff,
    collection: { name: 'store_analytics_events' },
    next() { throw new Error('must_not_run'); },
  }), (error) => error.code === 'permission_denied' && error.permission === 'analytics.view');
  assert.equal(privacy.hasCollectionReadAccess(
    analyticsFixture.app,
    analyticsFixture.staff,
    'store_analytics_events',
  ), false);

  const couponsOnly = fixture(['coupons.manage']);
  assert.throws(() => privacy.enforceRead({
    app: couponsOnly.app,
    auth: couponsOnly.staff,
    collection: { name: 'manual_coupon_usages' },
    next() { throw new Error('must_not_run'); },
  }), (error) => error.code === 'permission_denied' && error.permission === 'orders.view');
  assert.equal(privacy.hasCollectionReadAccess(couponsOnly.app, couponsOnly.staff, 'manual_coupon_usages'), false);

  const complete = fixture(['coupons.manage', 'orders.view']);
  let reads = 0;
  privacy.enforceRead({
    app: complete.app,
    auth: complete.staff,
    collection: { name: 'manual_coupon_usages' },
    next() { reads += 1; },
  });
  assert.equal(reads, 1);
  assert.equal(privacy.hasCollectionReadAccess(complete.app, complete.staff, 'manual_coupon_usages'), true);
  assert.deepEqual(
    privacy.mutationPermissions('manual_coupon_usages', 'create', []),
    [privacy.DENY_PERMISSION],
  );
  assert.throws(() => privacy.enforceMutation({
    app: complete.app,
    auth: complete.staff,
    record: record('usageprivacy001', { coupon: 'couponprivacy01', order: 'orderprivacy001' }),
    collection: { name: 'manual_coupon_usages' },
    requestInfo: () => ({ body: {} }),
    next() { throw new Error('must_not_run'); },
  }, 'manual_coupon_usages', 'delete'), (error) => error.code === 'permission_denied');
});

test('realtime bloquea analytics raw y redacta settings público antes de enviar', () => {
  const analyticsFixture = fixture(['analytics.view']);
  assert.throws(() => privacy.enforceRealtimeSubscribe({
    app: analyticsFixture.app,
    auth: analyticsFixture.staff,
    subscriptions: ['store_analytics_events/*'],
    next() { throw new Error('must_not_run'); },
  }), (error) => error.code === 'permission_denied' && error.permission === 'analytics.view');

  const message = {
    name: 'settings/update',
    data: JSON.stringify({ record: {
      id: 'settingspriv004',
      collectionName: 'settings',
      active: true,
      welcome_text: 'Público',
      business_notes: 'Privado',
      notification_cleanup_days: 15,
    } }),
  };
  let nextCalls = 0;
  privacy.enforceRealtimeMessage({
    app: {},
    client: { get() { return null; } },
    message,
    next() { nextCalls += 1; },
  });
  const sent = JSON.parse(message.data).record;
  assert.equal(nextCalls, 1);
  assert.equal(sent.welcome_text, 'Público');
  assert.equal(Object.hasOwn(sent, 'business_notes'), false);
  assert.equal(Object.hasOwn(sent, 'notification_cleanup_days'), false);
});

test('realtime valida query del topic y poda expands publicos desconocidos', () => {
  let publicSubscriptions = 0;
  privacy.enforceRealtimeSubscribe({
    app: {},
    auth: null,
    subscriptions: [
      'products/*?expand=category%2Csubcategory&fields=id%2Cname',
      'settings/*?expand=default_currency&fields=id%2Cstore_name',
      'automatic_promotions/*?fields=id%2Cproduct%2Cpriority',
    ],
    next() { publicSubscriptions += 1; },
  });
  assert.equal(publicSubscriptions, 1);
  for (const topic of [
    'products/*?expand=store',
    'products/*?fields=id%2Cstore.business_notes',
    'settings/*?expand=store',
    'automatic_promotions/*?expand=product',
    '*?expand=store',
  ]) {
    assert.throws(() => privacy.enforceRealtimeSubscribe({
      app: {},
      auth: null,
      subscriptions: [topic],
      next() { throw new Error('must_not_run'); },
    }), (error) => error.code === 'permission_denied' && error.permission === 'query.restricted');
  }

  const marketing = fixture(['promotions.manage']);
  assert.throws(() => privacy.enforceRealtimeSubscribe({
    app: marketing.app,
    auth: marketing.staff,
    subscriptions: ['automatic_promotions/*?expand=product'],
    next() { throw new Error('must_not_run'); },
  }), (error) => error.code === 'permission_denied' && error.permission === 'query.restricted');

  const message = {
    name: 'products/update',
    data: JSON.stringify({ record: {
      id: 'productpublic02',
      collectionName: 'products',
      name: 'Producto',
      expand: {
        category: {
          id: 'categorypriv001',
          collectionName: 'categories',
          name: 'Categoria',
          expand: {
            store: { id: STORE_ID, collectionName: 'stores', business_notes: 'Privado' },
          },
        },
        store: { id: STORE_ID, collectionName: 'stores', business_notes: 'Privado' },
      },
    } }),
  };
  const canonicalProduct = record('productpublic02', {
    store: STORE_ID,
    active: true,
    has_variations: false,
    base_price_usd: 20,
    regular_price_usd: 20,
    stock: 5,
    track_stock: true,
    expiration_date: '2099-12-01',
  });
  const publicCatalog = publicCatalogFixture({ products: [canonicalProduct] });
  privacy.enforceRealtimeMessage({
    app: publicCatalog.app,
    client: { get() { return null; } },
    message,
    next() {},
  });
  const sent = JSON.parse(message.data).record;
  assert.equal(Object.hasOwn(sent.expand, 'category'), true);
  assert.equal(Object.hasOwn(sent.expand, 'store'), false);
  assert.equal(Object.hasOwn(sent.expand.category.expand, 'store'), false);
});

test('expand respeta el gate de cada colección hija sin conceder catálogo a Marketing', () => {
  const marketing = fixture(['promotions.manage', 'coupons.manage']);
  const product = {
    id: 'productprivacy1',
    collectionName: 'products',
    name: 'Producto interno',
    cost_usd: 4,
  };
  const category = {
    id: 'categorypriv001',
    collectionName: 'categories',
    name: 'Categoría interna',
  };
  const promotion = record('promotionpriv01', {
    store: STORE_ID,
    product: product.id,
    category: category.id,
    expand: {
      product,
      category,
      store: { id: STORE_ID, collectionName: 'stores', business_notes: 'Privado' },
    },
  });
  privacy.enforceRead({
    app: marketing.app,
    auth: marketing.staff,
    record: promotion,
    collection: { name: 'automatic_promotions' },
    next() {},
  });
  assert.equal(Object.hasOwn(promotion.expand, 'product'), false);
  assert.equal(Object.hasOwn(promotion.expand, 'category'), false);
  assert.equal(Object.hasOwn(promotion.expand, 'store'), false);
  assert.equal(promotion.product, product.id);
  assert.equal(promotion.category, category.id);

  const coupon = record('couponprivacy01', {
    store: STORE_ID,
    product: product.id,
    expand: { product },
  });
  privacy.enforceRead({
    app: marketing.app,
    auth: marketing.staff,
    record: coupon,
    collection: { name: 'manual_coupons' },
    next() {},
  });
  assert.equal(Object.hasOwn(coupon.expand, 'product'), false);
  assert.equal(coupon.product, product.id);

  const usage = record('usageprivacy002', {
    coupon: coupon.id,
    order: 'orderprivacy001',
    expand: {
      order: { id: 'orderprivacy001', collectionName: 'orders', customer_name: 'Cliente privado' },
    },
  });
  privacy.redactRestrictedExpansions({
    app: marketing.app,
    auth: marketing.staff,
    record: usage,
  }, 'manual_coupon_usages');
  assert.equal(Object.hasOwn(usage.expand, 'order'), false);
  assert.equal(usage.order, 'orderprivacy001');
});

test('poda expand usa expand()/setExpand() de PocketBase y conserva el ref base', () => {
  const marketing = fixture(['promotions.manage']);
  let expanded = {
    product: { id: 'productprivacy1', collectionName: 'products', name: 'Privado' },
  };
  const promotion = {
    id: 'promotionpriv02',
    product: 'productprivacy1',
    get(key) { return this[key]; },
    fieldsData() { return { id: this.id, product: this.product }; },
    expand() { return { ...expanded }; },
    setExpand(next) { expanded = { ...next }; },
    hide() { throw new Error('setExpand debe permitir poda quirúrgica'); },
  };
  const changed = privacy.redactRestrictedExpansions({
    app: marketing.app,
    auth: marketing.staff,
    record: promotion,
  }, 'automatic_promotions');
  assert.equal(changed, true);
  assert.deepEqual(expanded, {});
  assert.equal(promotion.product, 'productprivacy1');
});

test('manual_coupon_usages oculta cliente salvo permiso de contacto', () => {
  const operational = fixture(['coupons.manage', 'orders.view']);
  const usage = record('usageprivacy003', {
    customer_name: 'Cliente privado',
    customer_phone: '+53 55555555',
    order_number: 'PZ-100',
  });
  privacy.enforceRead({
    app: operational.app,
    auth: operational.staff,
    record: usage,
    collection: { name: 'manual_coupon_usages' },
    next() {},
  });
  assert.equal(usage.hidden.has('customer_name'), true);
  assert.equal(usage.hidden.has('customer_phone'), true);
  assert.equal(usage.hidden.has('order_number'), false);

  const contact = fixture(['coupons.manage', 'orders.contact_customer']);
  const visible = record('usageprivacy004', {
    customer_name: 'Cliente autorizado',
    order_number: 'PZ-101',
  });
  privacy.enforceRead({
    app: contact.app,
    auth: contact.staff,
    record: visible,
    collection: { name: 'manual_coupon_usages' },
    next() {},
  });
  assert.equal(visible.hidden.has('customer_name'), false);
});
