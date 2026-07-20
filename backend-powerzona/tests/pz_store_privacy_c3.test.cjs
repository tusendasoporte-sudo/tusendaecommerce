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
  assert.equal(privacy.settingsReadFieldPermission('whatsapp_number'), 'landing_qr.manage');
  assert.equal(privacy.settingsReadFieldPermission('welcome_text'), 'landing_qr.manage');
  assert.equal(privacy.settingsReadFieldPermission('logo_image'), 'landing_qr.manage');
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
});

test('catálogo público conserva precio/stock y oculta economía interna', () => {
  const product = record('productpublic01', {
    name: 'Producto',
    base_price_usd: 20,
    stock: 5,
    cost_usd: 8,
    profit_margin: 60,
    internal_ref: 'INTERNAL-1',
    expiration_date: '2026-12-01',
    provider: 'Proveedor privado',
  });
  privacy.enforceRead({
    app: {},
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
    ],
    next() { publicSubscriptions += 1; },
  });
  assert.equal(publicSubscriptions, 1);
  for (const topic of [
    'products/*?expand=store',
    'products/*?fields=id%2Cstore.business_notes',
    'settings/*?expand=store',
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
  privacy.enforceRealtimeMessage({
    app: {},
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
