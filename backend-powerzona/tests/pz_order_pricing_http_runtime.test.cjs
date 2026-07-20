const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const test = require('node:test');

const BASE_URL = String(process.env.PZ_PRICE_RUNTIME_URL || '').replace(/\/+$/, '');
const SUPER_EMAIL = String(process.env.PZ_PRICE_SUPER_EMAIL || '');
const SUPER_PASSWORD = String(process.env.PZ_PRICE_SUPER_PASSWORD || '');
const IS_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(BASE_URL);
const SKIP_REASON = !BASE_URL || !SUPER_EMAIL || !SUPER_PASSWORD
  ? 'requiere PZ_PRICE_RUNTIME_URL, PZ_PRICE_SUPER_EMAIL y PZ_PRICE_SUPER_PASSWORD'
  : !IS_LOCAL
    ? 'PZ_PRICE_RUNTIME_URL debe apuntar a localhost, 127.0.0.1 o ::1'
    : false;

async function request(path, { token = '', body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch (_) {}
  return { status: response.status, data, raw };
}

function token() {
  return randomBytes(32).toString('base64url').slice(0, 32);
}

function civilDate(days) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Havana', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(Date.now() + days * 86_400_000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function close(actual, expected, message = '') {
  assert.ok(Math.abs(Number(actual) - Number(expected)) < 0.000001, `${message}: ${actual} != ${expected}`);
}

test('PZ-ORD-PRICE01-C2 HTTP runtime valida reset, estados y total canonico', { skip: SKIP_REASON }, async () => {
  const stamp = Date.now();
  const prefix = `PZORDC2QA_${stamp}`;
  const slugPrefix = `pzordc2qa-${stamp}`;
  const couponCode = `PQ${String(stamp).slice(-10)}`;
  const ids = Object.fromEntries([
    'order_price_adjustments', 'order_items', 'manual_coupon_usages', 'store_notifications', 'orders',
    'automatic_promotions', 'manual_coupons', 'gifts', 'product_variations',
    'products', 'shipping_zones', 'settings', 'currencies', 'users', 'stores',
  ].map((name) => [name, []]));
  let superToken = '';
  let masterToken = '';
  let storeAdminToken = '';
  let storeStaffToken = '';
  let suspendedAdminToken = '';
  let sequence = 0;

  async function create(collection, body) {
    const result = await request(`/api/collections/${collection}/records`, { token: superToken, body });
    assert.equal(result.status, 200, `${collection}: ${result.raw}`);
    ids[collection]?.push(result.data.id);
    return result.data;
  }

  async function remove(collection, id) {
    const result = await request(`/api/collections/${collection}/records/${id}`, { token: superToken, method: 'DELETE' });
    assert.ok([204, 404].includes(result.status), `${collection}/${id}: ${result.raw}`);
  }

  async function removeUserRelations(userId) {
    for (const [collection, filter] of [
      ['store_user_device_audit', `target_user="${userId}" || actor="${userId}"`],
      ['store_user_devices', `user="${userId}" || revoked_by="${userId}"`],
    ]) {
      const rows = await list(collection, filter);
      for (const row of rows) await remove(collection, row.id);
    }
  }

  async function list(collection, filter = '') {
    const query = new URLSearchParams({ perPage: '500' });
    if (filter) query.set('filter', filter);
    const result = await request(`/api/collections/${collection}/records?${query}`, { token: superToken });
    assert.equal(result.status, 200, `${collection}: ${result.raw}`);
    return result.data?.items || [];
  }

  async function count(collection, filter = '') {
    return (await list(collection, filter)).length;
  }

  async function checkout(store, currency, items, extra = {}, fixedToken = '') {
    sequence += 1;
    return request('/api/pz/checkout/orders', {
      body: {
        store_id: store.id,
        idempotency_key: fixedToken || token(),
        customer_name: `${prefix} Cliente ${sequence}`,
        customer_phone: '+1 555 123 4567',
        currency_id: currency.id,
        delivery_method: 'pickup',
        items,
        ...extra,
      },
    });
  }

  function trackCheckout(result) {
    if (result.status !== 200 || !result.data?.order?.id) return;
    if (!ids.orders.includes(result.data.order.id)) ids.orders.push(result.data.order.id);
    for (const item of result.data.items || []) if (!ids.order_items.includes(item.id)) ids.order_items.push(item.id);
  }

  async function publicReceiptOrder(order) {
    const filter = encodeURIComponent(`order_number = "${order.order_number}" && receipt_token = "${order.receipt_token}"`);
    const fields = encodeURIComponent('id,order_number,subtotal,total,usd_total,shipping,shipping_cup,subtotal_before_manual_adjustments_usd,manual_adjustment_total_usd,subtotal_after_manual_adjustments_usd,coupon_discount_usd,mixed_payment,local_currency_total,usd_only_total');
    const result = await request(`/api/collections/orders/records?filter=${filter}&fields=${fields}&perPage=1&order_number=${encodeURIComponent(order.order_number)}&token=${encodeURIComponent(order.receipt_token)}`);
    assert.equal(result.status, 200, result.raw);
    assert.equal(result.data?.items?.length, 1, result.raw);
    return result.data.items[0];
  }

  async function createProduct(store, suffix, extra = {}) {
    return create('products', {
      store: store.id,
      name: `${prefix} ${suffix}`,
      slug: `${slugPrefix}-${suffix}`,
      active: true,
      base_price_usd: 10,
      regular_price_usd: 10,
      stock: 20,
      track_stock: true,
      has_variations: false,
      delivery_mode: 'both',
      ...extra,
    });
  }

  try {
    const auth = await request('/api/collections/_superusers/auth-with-password', {
      body: { identity: SUPER_EMAIL, password: SUPER_PASSWORD },
    });
    assert.equal(auth.status, 200, auth.raw);
    superToken = auth.data.token;

    const store = await create('stores', { name: `${prefix} Tienda`, slug: slugPrefix, status: 'active' });
    const otherStore = await create('stores', { name: `${prefix} Otra`, slug: `${slugPrefix}-other`, status: 'active' });
    for (const current of [store, otherStore]) {
      const upgraded = await request(`/api/collections/stores/records/${current.id}`, {
        token: superToken,
        method: 'PATCH',
        body: {
          plan: 'premium',
          plan_started_at: new Date().toISOString(),
          plan_expires_at: '',
          plan_duration_months: 0,
          plan_is_permanent: true,
        },
      });
      assert.equal(upgraded.status, 200, upgraded.raw);
      Object.assign(current, upgraded.data);
    }

    const masterPassword = 'PZPRICEQA-Master-Local-2026!';
    const master = await create('users', {
      email: `${slugPrefix}@example.test`,
      password: masterPassword,
      passwordConfirm: masterPassword,
      display_name: `${prefix} Master`,
      role: 'master_admin',
      status: 'active',
      emailVisibility: true,
    });
    const masterAuth = await request('/api/collections/users/auth-with-password', {
      body: { identity: master.email, password: masterPassword },
      headers: { 'X-PZ-Admin-Device': 'P'.repeat(43) },
    });
    assert.equal(masterAuth.status, 200, masterAuth.raw);
    masterToken = masterAuth.data.token;

    async function createAndAuthUser(suffix, role, status = 'active') {
      const password = `PZORDC2QA-${suffix}-Local-2026!`;
      const user = await create('users', {
        store: store.id,
        email: `${slugPrefix}-${suffix}@example.test`,
        password,
        passwordConfirm: password,
        display_name: `${prefix} ${suffix}`,
        role,
        status,
        emailVisibility: true,
      });
      const authResult = await request('/api/collections/users/auth-with-password', {
        body: { identity: user.email, password },
        headers: { 'X-PZ-Admin-Device': `${suffix.slice(0, 1).toUpperCase()}${'D'.repeat(42)}` },
      });
      assert.equal(authResult.status, 200, `${suffix}: ${authResult.raw}`);
      return { user, token: authResult.data.token };
    }

    const storeAdminAuth = await createAndAuthUser('admin', 'store_admin');
    storeAdminToken = storeAdminAuth.token;
    const storeStaffAuth = await createAndAuthUser('staff', 'store_staff');
    storeStaffToken = storeStaffAuth.token;
    const suspendedAuth = await createAndAuthUser('suspended', 'store_admin');
    suspendedAdminToken = suspendedAuth.token;
    const suspendResult = await request(`/api/collections/users/records/${suspendedAuth.user.id}`, {
      token: superToken, method: 'PATCH', body: { status: 'suspended' },
    });
    assert.equal(suspendResult.status, 200, suspendResult.raw);

    const usd = await create('currencies', {
      store: store.id, code: 'USD', name: `${prefix} USD`, symbol: '$', exchange_rate: 1, active: true, is_default: true,
    });
    const cup = await create('currencies', {
      store: store.id, code: 'CUP', name: `${prefix} CUP`, symbol: 'CUP', exchange_rate: 25, active: true, is_default: false,
    });
    await create('settings', {
      store: store.id,
      stored_name: `${prefix} Tienda`,
      store_name: `${prefix} Tienda`,
      whatsapp_number: '+15551234567',
      default_currency: usd.id,
      active: true,
      order_prefix: 'QA',
      notifications_enabled: true,
      notify_new_order: true,
    });
    const otherUsd = await create('currencies', {
      store: otherStore.id, code: 'USD', name: `${prefix} Otra USD`, symbol: '$', exchange_rate: 1, active: true, is_default: true,
    });
    await create('settings', {
      store: otherStore.id,
      stored_name: `${prefix} Otra Tienda`,
      store_name: `${prefix} Otra Tienda`,
      whatsapp_number: '+15557654321',
      default_currency: otherUsd.id,
      active: true,
      order_prefix: 'OT',
      notifications_enabled: false,
      notify_new_order: false,
    });
    const zone = await create('shipping_zones', {
      store: store.id, municipality: `${prefix} Municipio`, zone: 'Centro', price_usd: 4, active: true,
    });

    const general = await createProduct(store, 'general');
    const onlyUsd = await createProduct(store, 'usd', { only_usd: true, base_price_usd: 5, regular_price_usd: 5 });
    const offer = await createProduct(store, 'offer', {
      base_price_usd: 10, regular_price_usd: 10, is_offer: true, offer_price_usd: 7,
    });
    const variationProduct = await createProduct(store, 'variation', { has_variations: true, stock: 0 });
    const variation = await create('product_variations', {
      store: store.id, product: variationProduct.id, variation_type: 'Tamano', value: `${prefix} Grande`,
      active: true, price_usd: 12, stock: 8,
    });
    const otherVariation = await create('product_variations', {
      store: store.id, product: variationProduct.id, variation_type: 'Tamano', value: `${prefix} Pequeno`,
      active: true, price_usd: 8, stock: 8,
    });
    const unrelatedProduct = await createProduct(store, 'unrelated', { has_variations: true, stock: 0 });
    const unrelatedVariation = await create('product_variations', {
      store: store.id, product: unrelatedProduct.id, variation_type: 'Color', value: `${prefix} Rojo`,
      active: true, price_usd: 30, stock: 8,
    });
    const crossProduct = await createProduct(otherStore, 'cross');
    const crossVariationProduct = await createProduct(otherStore, 'cross-variation', { has_variations: true, stock: 0 });
    const crossVariation = await create('product_variations', {
      store: otherStore.id, product: crossVariationProduct.id, variation_type: 'Color', value: `${prefix} Ajeno`,
      active: true, price_usd: 77, stock: 8,
    });

    const publicOrder = await request('/api/collections/orders/records', { body: {
      store: store.id,
      order_number: 'QA-F12AA',
      receipt_token: token(),
      customer_name: `${prefix} Directo`,
      customer_phone: '+1 555 123 4567',
      currency: usd.id,
      subtotal: 0.01,
      total: 0.01,
      usd_total: 0.01,
      delivery_method: 'pickup',
      status: 'pending',
    } });
    assert.ok([400, 401, 403, 404].includes(publicOrder.status), publicOrder.raw);
    assert.equal(await count('orders', `order_number="QA-F12AA"`), 0);

    for (const [label, malicious] of [
      ['low', 0.01], ['high', 999999], ['text', 'precio-falso'], ['omitted', undefined],
    ]) {
      const item = { product_id: general.id, quantity: 1, product_name: `${prefix} Nombre F12` };
      if (malicious !== undefined) item.unit_price_usd = malicious;
      const result = await checkout(store, usd, [item], {
        subtotal: 0.01, total: 0.01, shipping: 999999, store: otherStore.id, label,
      });
      assert.equal(result.status, 200, result.raw);
      trackCheckout(result);
      close(result.data.items[0].unit_price_final_usd, 10, label);
      close(result.data.items[0].line_total_usd, 10, label);
      assert.equal(result.data.items[0].product_name, general.name);
      close(result.data.order.total, 10, label);
    }

    const publicItem = await request('/api/collections/order_items/records', { body: {
      order: ids.orders[0],
      product: general.id,
      product_name: `${prefix} F12`,
      quantity: 1,
      unit_price_usd: 0.01,
      line_total_usd: 0.01,
    } });
    assert.ok([400, 401, 403, 404].includes(publicItem.status), publicItem.raw);

    const directTarget = ids.order_items[0];
    const patched = await request(`/api/collections/order_items/records/${directTarget}`, {
      token: superToken,
      method: 'PATCH',
      body: { product_name: `${prefix} F12`, unit_price_usd: 0.01, unit_price_final_usd: 999999, line_total_usd: 0.01 },
    });
    assert.ok([400, 401, 403, 404].includes(patched.status), patched.raw);
    const unchangedDirectTarget = (await list('order_items', `id="${directTarget}"`))[0];
    assert.equal(unchangedDirectTarget.product_name, general.name);
    close(unchangedDirectTarget.unit_price_usd, 10);
    close(unchangedDirectTarget.line_total_usd, 10);

    const variationResult = await checkout(store, usd, [{
      product_id: variationProduct.id,
      variation_id: variation.id,
      quantity: 2,
      unit_price_usd: otherVariation.price_usd,
      variation_price_usd: general.base_price_usd,
    }]);
    assert.equal(variationResult.status, 200, variationResult.raw);
    trackCheckout(variationResult);
    close(variationResult.data.items[0].unit_price_final_usd, 12);
    close(variationResult.data.items[0].line_total_usd, 24);

    for (const invalidItem of [
      { product_id: variationProduct.id, variation_id: unrelatedVariation.id, quantity: 1 },
      { product_id: variationProduct.id, variation_id: crossVariation.id, quantity: 1 },
      { product_id: crossProduct.id, quantity: 1 },
    ]) {
      const result = await checkout(store, usd, [invalidItem]);
      assert.equal(result.status, 422, result.raw);
      assert.deepEqual(result.data, { ok: false, error: 'order_unavailable' });
      assert.equal(result.raw.includes(invalidItem.product_id), false);
    }

    const offerResult = await checkout(store, usd, [{ product_id: offer.id, quantity: 2, unit_price_usd: 999999 }]);
    assert.equal(offerResult.status, 200, offerResult.raw);
    trackCheckout(offerResult);
    close(offerResult.data.items[0].unit_price_final_usd, 7);
    close(offerResult.data.order.subtotal, 14);

    const quantityThree = await checkout(store, usd, [{ product_id: general.id, quantity: 3 }]);
    assert.equal(quantityThree.status, 200, quantityThree.raw);
    trackCheckout(quantityThree);
    close(quantityThree.data.order.total, 30);
    const pickupReceipt = await publicReceiptOrder(quantityThree.data.order);
    close(pickupReceipt.shipping, 0);
    close(pickupReceipt.total, 30);
    for (const quantity of [21, 0, -1, 1.5]) {
      const result = await checkout(store, usd, [{ product_id: general.id, quantity }]);
      assert.ok([400, 422].includes(result.status), `${quantity}: ${result.raw}`);
      assert.ok(['invalid_order', 'order_unavailable'].includes(result.data?.error));
    }

    const delivery = await checkout(store, cup, [{ product_id: general.id, quantity: 1 }], {
      delivery_method: 'delivery',
      shipping_zone_id: zone.id,
      customer_address: `${prefix} Calle 1`,
      shipping: 0.01,
      total: 0.01,
      exchange_rate_used: 999999,
    });
    assert.equal(delivery.status, 200, delivery.raw);
    trackCheckout(delivery);
    close(delivery.data.order.shipping, 4);
    close(delivery.data.order.total, 14);
    close(delivery.data.order.local_currency_total, 250);
    close(delivery.data.order.shipping_cup, 100);
    close(delivery.data.order.exchange_rate_used, 25);
    const deliveryReceipt = await publicReceiptOrder(delivery.data.order);
    close(deliveryReceipt.subtotal, 10);
    close(deliveryReceipt.shipping, 4);
    close(deliveryReceipt.total, 14);
    close(deliveryReceipt.usd_total, 14);
    close(deliveryReceipt.total, deliveryReceipt.subtotal + deliveryReceipt.shipping, 'envio incluido exactamente una vez');

    const mixed = await checkout(store, cup, [
      { product_id: general.id, quantity: 1 },
      { product_id: onlyUsd.id, quantity: 1 },
    ]);
    assert.equal(mixed.status, 200, mixed.raw);
    trackCheckout(mixed);
    assert.equal(mixed.data.order.mixed_payment, true);
    close(mixed.data.order.local_currency_total, 250);
    close(mixed.data.order.usd_only_total, 5);

    const promoProduct = await createProduct(store, 'promo');
    const originalPromotion = await create('automatic_promotions', {
      store: store.id, name: `${prefix} Promo`, active: true,
      type: 'product_discount', scope: 'product', discount_type: 'percentage',
      discount_value: 10, product: promoProduct.id, priority: 1,
    });
    const promoResult = await checkout(store, usd, [{ product_id: promoProduct.id, quantity: 1 }]);
    assert.equal(promoResult.status, 200, promoResult.raw);
    trackCheckout(promoResult);
    close(promoResult.data.order.subtotal, 9);

    const coupon = await create('manual_coupons', {
      store: store.id, name: `${prefix} Cupon`, code: couponCode, active: true,
      scope: 'cart', discount_type: 'percentage', discount_value: 20,
      unlimited_uses: false, max_uses: 5, used_count: 0,
    });
    const couponResult = await checkout(store, usd, [{ product_id: general.id, quantity: 1 }], { coupon_code: couponCode });
    assert.equal(couponResult.status, 200, couponResult.raw);
    trackCheckout(couponResult);
    close(couponResult.data.order.subtotal, 8);
    close(couponResult.data.order.coupon_discount_usd, 2);
    const usages = await list('manual_coupon_usages', `coupon="${coupon.id}"`);
    ids.manual_coupon_usages.push(...usages.map((item) => item.id));
    assert.equal(usages.length, 1);

    const promoItem = promoResult.data.items[0];
    const changedPromo = await request(`/api/collections/automatic_promotions/records/${originalPromotion.id}`, {
      token: superToken, method: 'PATCH', body: { discount_value: 80 },
    });
    assert.equal(changedPromo.status, 200, changedPromo.raw);
    const changedPromoProduct = await request(`/api/collections/products/records/${promoProduct.id}`, {
      token: superToken, method: 'PATCH', body: { base_price_usd: 100, regular_price_usd: 100 },
    });
    assert.equal(changedPromoProduct.status, 200, changedPromoProduct.raw);

    const preservedQuantity = await request(`/api/pz/admin/orders/${promoResult.data.order.id}/items/${promoItem.id}/quantity`, {
      token: storeAdminToken, method: 'PATCH', body: { quantity: 2 },
    });
    assert.equal(preservedQuantity.status, 200, preservedQuantity.raw);
    close(preservedQuantity.data.items[0].unit_price_original_usd, 10, 'precio historico');
    close(preservedQuantity.data.items[0].unit_price_after_automatic_discount_usd, 9, 'promo historica');
    close(preservedQuantity.data.items[0].line_total_usd, 18, 'cantidad con promo historica');

    const preservedExistingAdd = await request(`/api/pz/admin/orders/${promoResult.data.order.id}/items`, {
      token: storeAdminToken,
      body: { product_id: promoProduct.id, variation_id: '', quantity: 1 },
    });
    assert.equal(preservedExistingAdd.status, 200, preservedExistingAdd.raw);
    close(preservedExistingAdd.data.items[0].unit_price_original_usd, 10, 'alta existente no cambia precio historico');
    close(preservedExistingAdd.data.items[0].line_total_usd, 27, 'alta existente conserva promo original');

    await create('automatic_promotions', {
      store: store.id, name: `${prefix} Promo nueva no heredable`, active: true,
      type: 'product_discount', scope: 'product', discount_type: 'percentage',
      discount_value: 90, product: onlyUsd.id, priority: 999,
    });
    const couponAdd = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items`, {
      token: storeAdminToken,
      body: { product_id: onlyUsd.id, variation_id: '', quantity: 1 },
    });
    assert.equal(couponAdd.status, 200, couponAdd.raw);
    close(couponAdd.data.order.subtotal_before_manual_adjustments_usd, 12, 'cupon original aplica a linea nueva');
    close(couponAdd.data.order.coupon_discount_usd, 3, 'cupon original recalculado');
    const addedOnlyUsd = couponAdd.data.items.find((item) => item.product === onlyUsd.id);
    close(addedOnlyUsd.unit_price_after_automatic_discount_usd, 4, 'promo vigente nueva no se hereda');

    const couponGeneral = couponAdd.data.items.find((item) => item.product === general.id);
    const couponQuantity = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/quantity`, {
      token: storeAdminToken, method: 'PATCH', body: { quantity: 2 },
    });
    assert.equal(couponQuantity.status, 200, couponQuantity.raw);
    close(couponQuantity.data.order.subtotal_before_manual_adjustments_usd, 20, 'cupon original con cantidad');
    const usageAfterMutations = await list('manual_coupon_usages', `coupon="${coupon.id}"`);
    assert.equal(usageAfterMutations.length, 1);
    const couponAfterMutations = await request(`/api/collections/manual_coupons/records/${coupon.id}`, { token: superToken });
    assert.equal(couponAfterMutations.status, 200, couponAfterMutations.raw);
    assert.equal(couponAfterMutations.data.used_count, 1);

    const adjustedDown = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: storeAdminToken,
      body: { final_unit_price_usd: 6, reason_code: 'customer_agreement', reason_text: 'Acuerdo QA C1' },
    });
    assert.equal(adjustedDown.status, 200, adjustedDown.raw);
    close(adjustedDown.data.order.subtotal_before_manual_adjustments_usd, 20);
    close(adjustedDown.data.order.manual_adjustment_total_usd, -4);
    close(adjustedDown.data.order.subtotal_after_manual_adjustments_usd, 16);
    const adjustedDownReceipt = await publicReceiptOrder(adjustedDown.data.order);
    close(adjustedDownReceipt.manual_adjustment_total_usd, -4);
    close(adjustedDownReceipt.total, adjustedDownReceipt.subtotal_after_manual_adjustments_usd + adjustedDownReceipt.shipping);

    const adjustedUp = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: storeAdminToken,
      body: { final_unit_price_usd: 12, reason_code: 'price_correction', reason_text: 'Aumento QA' },
    });
    assert.equal(adjustedUp.status, 200, adjustedUp.raw);
    close(adjustedUp.data.order.manual_adjustment_total_usd, 8);
    close(adjustedUp.data.order.subtotal_after_manual_adjustments_usd, 28);
    const adjustedUpReceipt = await publicReceiptOrder(adjustedUp.data.order);
    close(adjustedUpReceipt.manual_adjustment_total_usd, 8);
    close(adjustedUpReceipt.total, adjustedUpReceipt.subtotal_after_manual_adjustments_usd + adjustedUpReceipt.shipping);

    for (const invalidAdjustment of [
      { final_unit_price_usd: -1, reason_code: 'other', reason_text: 'Negativo QA' },
      { final_unit_price_usd: 1000001, reason_code: 'other', reason_text: 'Excesivo QA' },
      { final_unit_price_usd: 5, reason_code: 'other', reason_text: 'no' },
      { final_unit_price_usd: 5, reason_code: 'not_allowed', reason_text: 'Motivo QA' },
    ]) {
      const invalid = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
        token: storeAdminToken, body: invalidAdjustment,
      });
      assert.equal(invalid.status, 422, invalid.raw);
    }
    const zeroWithoutConfirmation = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: storeAdminToken,
      body: { final_unit_price_usd: 0, reason_code: 'special_discount', reason_text: 'Cero QA' },
    });
    assert.equal(zeroWithoutConfirmation.status, 422, zeroWithoutConfirmation.raw);
    assert.equal(zeroWithoutConfirmation.data.error, 'zero_price_confirmation_required');
    const adjustedZero = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: storeAdminToken,
      body: { final_unit_price_usd: 0, reason_code: 'special_discount', reason_text: 'Cero QA', confirm_zero_price: true },
    });
    assert.equal(adjustedZero.status, 200, adjustedZero.raw);
    close(adjustedZero.data.order.subtotal_after_manual_adjustments_usd, 4);

    const auditsBeforeReset = await list('order_price_adjustments', `order="${couponResult.data.order.id}"`);
    for (const invalidResetBody of [
      {},
      { reason_code: '' },
      { reason_code: 'other', reason_text: '' },
      { reason_code: 'other', reason_text: '1234' },
      { reason_code: 'other', reason_text: 'x'.repeat(501) },
      { reason_code: 'price_correction', reason_text: '', actor: master.id },
      { reason_code: 'price_correction', reason_text: '', final_unit_price_usd: 999 },
      { reason_code: 'price_correction', reason_text: '', difference: 999, total: 999, status: 'delivered' },
    ]) {
      const deniedReset = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments/reset`, {
        token: storeAdminToken, body: invalidResetBody,
      });
      assert.equal(deniedReset.status, 422, deniedReset.raw);
    }
    const stillAdjusted = await request(`/api/collections/order_items/records/${couponGeneral.id}`, { token: superToken });
    assert.equal(stillAdjusted.status, 200, stillAdjusted.raw);
    assert.equal(stillAdjusted.data.has_manual_price_adjustment, true);
    close(stillAdjusted.data.unit_price_final_usd, 0);

    const resetAdjustment = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments/reset`, {
      token: storeAdminToken, body: { reason_code: 'other', reason_text: '12345' },
    });
    assert.equal(resetAdjustment.status, 200, resetAdjustment.raw);
    close(resetAdjustment.data.order.manual_adjustment_total_usd, 0);
    close(resetAdjustment.data.order.subtotal_after_manual_adjustments_usd, 20);
    const resetReceipt = await publicReceiptOrder(resetAdjustment.data.order);
    close(resetReceipt.total, resetReceipt.subtotal_after_manual_adjustments_usd + resetReceipt.shipping);
    close(resetReceipt.coupon_discount_usd, resetAdjustment.data.order.coupon_discount_usd);
    const resetLine = resetAdjustment.data.items.find((item) => item.id === couponGeneral.id);
    assert.equal(resetLine.has_manual_price_adjustment, false);
    close(resetLine.unit_price_final_usd, resetLine.unit_price_after_automatic_discount_usd);
    const auditsAfterReset = await list('order_price_adjustments', `order="${couponResult.data.order.id}"`);
    assert.equal(auditsAfterReset.length, auditsBeforeReset.length + 1);
    const resetAudit = auditsAfterReset.find((entry) => entry.action === 'reset' && entry.reason_text === '12345');
    assert.ok(resetAudit, JSON.stringify(auditsAfterReset));
    assert.equal(resetAudit.reason_code, 'other');
    assert.equal(resetAudit.actor, storeAdminAuth.user.id);
    close(resetAudit.previous_final_unit_price_usd, 0);
    close(resetAudit.new_final_unit_price_usd, resetLine.unit_price_after_automatic_discount_usd);
    close(resetAudit.unit_adjustment_usd, -resetLine.unit_price_after_automatic_discount_usd);
    close(resetAudit.total_adjustment_usd, -resetLine.unit_price_after_automatic_discount_usd * resetLine.quantity);

    for (const [label, deniedToken] of [['staff', storeStaffToken], ['suspended', suspendedAdminToken]]) {
      const denied = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
        token: deniedToken,
        body: { final_unit_price_usd: 7, reason_code: 'other', reason_text: `${label} QA` },
      });
      assert.ok(label === 'suspended' ? [401, 403].includes(denied.status) : denied.status === 403, `${label}: ${denied.raw}`);
      const deniedReset = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments/reset`, {
        token: deniedToken,
        body: { reason_code: 'price_correction', reason_text: `${label} reset QA` },
      });
      assert.ok(label === 'suspended' ? [401, 403].includes(deniedReset.status) : deniedReset.status === 403, `${label} reset: ${deniedReset.raw}`);
    }

    for (const state of ['confirmed', 'preparing']) {
      const stockBeforeState = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
      const stateUpdate = await request(`/api/collections/orders/records/${couponResult.data.order.id}`, {
        token: superToken, method: 'PATCH', body: { status: state, stock_deducted: false },
      });
      assert.equal(stateUpdate.status, 200, stateUpdate.raw);
      const allowed = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
        token: masterToken,
        body: { final_unit_price_usd: 7, reason_code: 'inconvenience', reason_text: `${state} QA` },
      });
      assert.equal(allowed.status, 200, `${state}: ${allowed.raw}`);
      const resetAllowed = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments/reset`, {
        token: masterToken,
        body: { reason_code: 'price_correction', reason_text: `${state} reset QA` },
      });
      assert.equal(resetAllowed.status, 200, `${state} reset: ${resetAllowed.raw}`);
      assert.equal(resetAllowed.data.order.status, state);
      const stockAfterState = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
      close(stockAfterState, stockBeforeState, `${state} no cambia inventario`);
    }

    const pendingBeforeLockedStates = await request(`/api/collections/orders/records/${couponResult.data.order.id}`, {
      token: superToken, method: 'PATCH', body: { status: 'pending', stock_deducted: false },
    });
    assert.equal(pendingBeforeLockedStates.status, 200, pendingBeforeLockedStates.raw);
    const adjustmentBeforeLockedStates = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: masterToken,
      body: { final_unit_price_usd: 7, reason_code: 'inconvenience', reason_text: 'Bloqueo de estados QA' },
    });
    assert.equal(adjustmentBeforeLockedStates.status, 200, adjustmentBeforeLockedStates.raw);
    const stockBeforeLockedStates = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
    const deliveredUpdate = await request(`/api/collections/orders/records/${couponResult.data.order.id}`, {
      token: superToken, method: 'PATCH', body: { status: 'delivered', stock_deducted: false },
    });
    assert.equal(deliveredUpdate.status, 200, deliveredUpdate.raw);
    const deliveredDenied = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: masterToken,
      body: { final_unit_price_usd: 8, reason_code: 'other', reason_text: 'Entregada QA' },
    });
    assert.equal(deliveredDenied.status, 409, deliveredDenied.raw);
    const deliveredResetDenied = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments/reset`, {
      token: masterToken, body: { reason_code: 'price_correction', reason_text: 'Entregada reset QA' },
    });
    assert.equal(deliveredResetDenied.status, 409, deliveredResetDenied.raw);
    const cancelledUpdate = await request(`/api/collections/orders/records/${couponResult.data.order.id}`, {
      token: superToken, method: 'PATCH', body: { status: 'cancelled', stock_deducted: false },
    });
    assert.equal(cancelledUpdate.status, 200, cancelledUpdate.raw);
    const cancelledDenied = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments`, {
      token: masterToken,
      body: { final_unit_price_usd: 8, reason_code: 'other', reason_text: 'Cancelada QA' },
    });
    assert.equal(cancelledDenied.status, 409, cancelledDenied.raw);
    const cancelledResetDenied = await request(`/api/pz/admin/orders/${couponResult.data.order.id}/items/${couponGeneral.id}/price-adjustments/reset`, {
      token: masterToken, body: { reason_code: 'price_correction', reason_text: 'Cancelada reset QA' },
    });
    assert.equal(cancelledResetDenied.status, 409, cancelledResetDenied.raw);
    const stockAfterLockedStates = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
    close(stockAfterLockedStates, stockBeforeLockedStates, 'estados bloqueados no cambian inventario');
    const restorePending = await request(`/api/collections/orders/records/${couponResult.data.order.id}`, {
      token: superToken, method: 'PATCH', body: { status: 'pending', stock_deducted: false },
    });
    assert.equal(restorePending.status, 200, restorePending.raw);

    const crossOrder = await checkout(otherStore, otherUsd, [{ product_id: crossProduct.id, quantity: 1 }]);
    assert.equal(crossOrder.status, 200, crossOrder.raw);
    trackCheckout(crossOrder);
    const crossDenied = await request(`/api/pz/admin/orders/${crossOrder.data.order.id}/items/${crossOrder.data.items[0].id}/price-adjustments`, {
      token: storeAdminToken,
      body: { final_unit_price_usd: 5, reason_code: 'other', reason_text: 'Cross store QA' },
    });
    assert.equal(crossDenied.status, 404, crossDenied.raw);
    const crossResetDenied = await request(`/api/pz/admin/orders/${crossOrder.data.order.id}/items/${crossOrder.data.items[0].id}/price-adjustments/reset`, {
      token: storeAdminToken,
      body: { reason_code: 'price_correction', reason_text: 'Cross reset QA' },
    });
    assert.equal(crossResetDenied.status, 404, crossResetDenied.raw);
    const crossTransitionDenied = await request(`/api/pz/admin/orders/${crossOrder.data.order.id}/transition`, {
      token: storeAdminToken,
      body: { status: 'confirmed' },
    });
    assert.equal(crossTransitionDenied.status, 404, crossTransitionDenied.raw);
    assert.equal(crossTransitionDenied.data?.error, 'order_not_found');

    const auditPage = await request(`/api/collections/order_price_adjustments/records?filter=${encodeURIComponent(`order="${couponResult.data.order.id}"`)}&perPage=100`, { token: storeAdminToken });
    assert.equal(auditPage.status, 200, auditPage.raw);
    assert.ok((auditPage.data?.items || []).length >= 6, auditPage.raw);
    const auditTarget = auditPage.data.items[0];
    ids.order_price_adjustments.push(...auditPage.data.items.map((item) => item.id));
    const auditPatch = await request(`/api/collections/order_price_adjustments/records/${auditTarget.id}`, {
      token: storeAdminToken, method: 'PATCH', body: { new_final_unit_price_usd: 999 },
    });
    assert.ok([400, 401, 403, 404].includes(auditPatch.status), auditPatch.raw);
    const auditDelete = await request(`/api/collections/order_price_adjustments/records/${auditTarget.id}`, {
      token: storeAdminToken, method: 'DELETE',
    });
    assert.ok([400, 401, 403, 404].includes(auditDelete.status), auditDelete.raw);

    const gift = await create('gifts', {
      store: store.id, name: `${prefix} Regalo`, min_order_usd: 5, stock: 2, active: true,
    });
    const giftResult = await checkout(store, usd, [
      { product_id: general.id, quantity: 1 },
      { gift_id: gift.id, quantity: 1 },
    ]);
    assert.equal(giftResult.status, 200, giftResult.raw);
    trackCheckout(giftResult);
    const giftLine = giftResult.data.items.find((item) => item.is_gift);
    assert.equal(giftLine.product_name, gift.name);
    close(giftLine.line_total_usd, 0);

    const actionOrderId = giftResult.data.order.id;
    const generalStockBeforeAction = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
    const giftStockBeforeAction = (await request(`/api/collections/gifts/records/${gift.id}`, { token: superToken })).data.stock;
    const invalidDelivered = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'delivered' },
    });
    assert.equal(invalidDelivered.status, 409, invalidDelivered.raw);
    assert.equal(invalidDelivered.data?.error, 'invalid_status_transition');
    const extraTransitionField = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'confirmed', stock_deducted: true },
    });
    assert.equal(extraTransitionField.status, 422, extraTransitionField.raw);
    assert.equal(extraTransitionField.data?.error, 'invalid_payload');
    const staffTransitionDenied = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeStaffToken, body: { status: 'confirmed' },
    });
    assert.equal(staffTransitionDenied.status, 403, staffTransitionDenied.raw);
    for (const directBody of [
      { status: 'confirmed' },
      { stock_deducted: true },
      { receipt_token: 'client-controlled-receipt-token' },
      { review_token: 'client-controlled-review-token' },
    ]) {
      const directDenied = await request(`/api/collections/orders/records/${actionOrderId}`, {
        token: storeAdminToken, method: 'PATCH', body: directBody,
      });
      assert.equal(directDenied.status, 403, `${JSON.stringify(directBody)}: ${directDenied.raw}`);
    }
    const directDeleteDenied = await request(`/api/collections/orders/records/${actionOrderId}`, {
      token: storeAdminToken, method: 'DELETE',
    });
    assert.equal(directDeleteDenied.status, 403, directDeleteDenied.raw);

    const confirmedAction = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'confirmed' },
    });
    assert.equal(confirmedAction.status, 200, confirmedAction.raw);
    assert.deepEqual(Object.keys(confirmedAction.data.order).sort(), ['delivered_at', 'id', 'status', 'stock_deducted']);
    assert.equal(confirmedAction.data.order.status, 'confirmed');
    assert.equal(confirmedAction.data.order.stock_deducted, true);
    assert.equal(confirmedAction.data.inventory_action, 'deducted');
    close((await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock, generalStockBeforeAction - 1);
    close((await request(`/api/collections/gifts/records/${gift.id}`, { token: superToken })).data.stock, giftStockBeforeAction - 1);
    const confirmedAgain = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'confirmed' },
    });
    assert.equal(confirmedAgain.status, 200, confirmedAgain.raw);
    assert.equal(confirmedAgain.data.inventory_action, 'unchanged');
    close((await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock, generalStockBeforeAction - 1);

    const clearReceipt = await request(`/api/collections/orders/records/${actionOrderId}`, {
      token: superToken, method: 'PATCH', body: { receipt_token: '' },
    });
    assert.equal(clearReceipt.status, 200, clearReceipt.raw);
    const invalidReceiptPayload = await request(`/api/pz/admin/orders/${actionOrderId}/receipt-token`, {
      token: storeAdminToken, body: { token: 'client-controlled' },
    });
    assert.equal(invalidReceiptPayload.status, 422, invalidReceiptPayload.raw);
    const receiptTokenAction = await request(`/api/pz/admin/orders/${actionOrderId}/receipt-token`, {
      token: storeAdminToken, body: {},
    });
    assert.equal(receiptTokenAction.status, 200, receiptTokenAction.raw);
    assert.match(receiptTokenAction.data?.order?.receipt_token || '', /^[A-Za-z0-9_-]{32}$/);
    assert.deepEqual(Object.keys(receiptTokenAction.data.order).sort(), ['id', 'receipt_token']);
    const receiptTokenAgain = await request(`/api/pz/admin/orders/${actionOrderId}/receipt-token`, {
      token: storeAdminToken, body: {},
    });
    assert.equal(receiptTokenAgain.status, 200, receiptTokenAgain.raw);
    assert.equal(receiptTokenAgain.data.order.receipt_token, receiptTokenAction.data.order.receipt_token);

    const reviewBeforeDelivery = await request(`/api/pz/admin/orders/${actionOrderId}/review-token`, {
      token: storeAdminToken, body: {},
    });
    assert.equal(reviewBeforeDelivery.status, 409, reviewBeforeDelivery.raw);
    assert.equal(reviewBeforeDelivery.data?.error, 'review_not_available');
    const deliveredAction = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'delivered' },
    });
    assert.equal(deliveredAction.status, 200, deliveredAction.raw);
    assert.equal(deliveredAction.data.inventory_action, 'unchanged');
    assert.ok(deliveredAction.data.order.delivered_at);
    const reviewTokenAction = await request(`/api/pz/admin/orders/${actionOrderId}/review-token`, {
      token: storeAdminToken, body: {},
    });
    assert.equal(reviewTokenAction.status, 200, reviewTokenAction.raw);
    assert.match(reviewTokenAction.data?.order?.review_token || '', /^[A-Za-z0-9_-]{40}$/);
    assert.deepEqual(Object.keys(reviewTokenAction.data.order).sort(), ['id', 'review_token']);
    const reviewTokenAgain = await request(`/api/pz/admin/orders/${actionOrderId}/review-token`, {
      token: storeAdminToken, body: {},
    });
    assert.equal(reviewTokenAgain.status, 200, reviewTokenAgain.raw);
    assert.equal(reviewTokenAgain.data.order.review_token, reviewTokenAction.data.order.review_token);

    const cancelledAction = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'cancelled' },
    });
    assert.equal(cancelledAction.status, 200, cancelledAction.raw);
    assert.equal(cancelledAction.data.inventory_action, 'restored');
    close((await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock, generalStockBeforeAction);
    close((await request(`/api/collections/gifts/records/${gift.id}`, { token: superToken })).data.stock, giftStockBeforeAction);
    const reconfirmAction = await request(`/api/pz/admin/orders/${actionOrderId}/transition`, {
      token: storeAdminToken, body: { status: 'confirmed' },
    });
    assert.equal(reconfirmAction.status, 200, reconfirmAction.raw);
    assert.equal(reconfirmAction.data.inventory_action, 'deducted');
    const deleteAction = await request(`/api/pz/admin/orders/${actionOrderId}`, {
      token: storeAdminToken, method: 'DELETE',
    });
    assert.equal(deleteAction.status, 200, deleteAction.raw);
    assert.deepEqual(deleteAction.data, { ok: true, deleted: true });
    assert.equal(await count('orders', `id="${actionOrderId}"`), 0);
    assert.equal(await count('order_items', `order="${actionOrderId}"`), 0);
    close((await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock, generalStockBeforeAction);
    close((await request(`/api/collections/gifts/records/${gift.id}`, { token: superToken })).data.stock, giftStockBeforeAction);

    const expired = await createProduct(store, 'expired');
    const future30 = await createProduct(store, 'future30');
    const future1 = await createProduct(store, 'future1');
    for (const [product, expirationDate] of [[expired, civilDate(0)], [future30, civilDate(30)], [future1, civilDate(1)]]) {
      const updated = await request(`/api/collections/products/records/${product.id}`, {
        token: masterToken, method: 'PATCH', body: { expiration_date: expirationDate },
      });
      assert.equal(updated.status, 200, updated.raw);
      Object.assign(product, updated.data);
    }
    const expiredResult = await checkout(store, usd, [{ product_id: expired.id, quantity: 1 }]);
    assert.equal(expiredResult.status, 422, expiredResult.raw);
    for (const future of [future30, future1]) {
      const result = await checkout(store, usd, [{ product_id: future.id, quantity: 1, unit_price_usd: 0.01 }]);
      assert.equal(result.status, 200, result.raw);
      trackCheckout(result);
      close(result.data.items[0].unit_price_final_usd, 10);
    }

    const expirationProduct = await createProduct(store, 'variation-expired', { has_variations: true, stock: 0 });
    const expiredVariation = await create('product_variations', {
      store: store.id, product: expirationProduct.id, variation_type: 'Lote', value: `${prefix} Vencido`,
      active: true, price_usd: 15, stock: 2,
    });
    const expirationPatch = await request(`/api/collections/product_variations/records/${expiredVariation.id}`, {
      token: masterToken, method: 'PATCH', body: { expiration_date: civilDate(0) },
    });
    assert.equal(expirationPatch.status, 200, expirationPatch.raw);
    const expiredVariationResult = await checkout(store, usd, [{
      product_id: expirationProduct.id, variation_id: expiredVariation.id, quantity: 1,
    }]);
    assert.equal(expiredVariationResult.status, 422, expiredVariationResult.raw);

    const ordersBeforeAtomic = await count('orders', `store="${store.id}"`);
    const itemsBeforeAtomic = await count('order_items', `order.store="${store.id}"`);
    const stockBeforeAtomic = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
    const atomicFailure = await checkout(store, usd, [
      { product_id: general.id, quantity: 1 },
      { product_id: crossProduct.id, quantity: 1 },
    ]);
    assert.equal(atomicFailure.status, 422, atomicFailure.raw);
    assert.equal(await count('orders', `store="${store.id}"`), ordersBeforeAtomic);
    assert.equal(await count('order_items', `order.store="${store.id}"`), itemsBeforeAtomic);
    const stockAfterAtomic = (await request(`/api/collections/products/records/${general.id}`, { token: superToken })).data.stock;
    close(stockAfterAtomic, stockBeforeAtomic);

    const retryToken = token();
    const beforeRetry = await count('orders', `store="${store.id}"`);
    const firstRetry = await checkout(store, usd, [{ product_id: general.id, quantity: 1 }], {}, retryToken);
    const secondRetry = await checkout(store, usd, [{ product_id: general.id, quantity: 1 }], {}, retryToken);
    assert.equal(firstRetry.status, 200, firstRetry.raw);
    assert.equal(secondRetry.status, 200, secondRetry.raw);
    trackCheckout(firstRetry);
    trackCheckout(secondRetry);
    assert.equal(secondRetry.data.idempotent, true);
    assert.equal(secondRetry.data.order.id, firstRetry.data.order.id);
    assert.equal(await count('orders', `store="${store.id}"`), beforeRetry + 1);

    const runtimeOrders = await list('orders', `store="${store.id}"`);
    const runtimeItems = await list('order_items', `order.store="${store.id}"`);
    const runtimeNotifications = await list('store_notifications', `store="${store.id}"`);
    ids.orders.push(...runtimeOrders.map((item) => item.id).filter((id) => !ids.orders.includes(id)));
    ids.order_items.push(...runtimeItems.map((item) => item.id).filter((id) => !ids.order_items.includes(id)));
    ids.store_notifications.push(...runtimeNotifications.map((item) => item.id));
  } finally {
    if (superToken) {
      const storeIds = ids.stores.slice();
      for (const storeId of storeIds) {
        for (const collection of ['order_price_adjustments', 'manual_coupon_usages', 'order_items', 'store_notifications', 'orders', 'product_expiration_cycles']) {
          const filter = collection === 'order_items' ? `order.store="${storeId}"`
            : collection === 'manual_coupon_usages' ? `order.store="${storeId}" || coupon.store="${storeId}"`
              : collection === 'order_price_adjustments' ? `store_id_snapshot="${storeId}"`
              : collection === 'product_expiration_cycles' ? `store="${storeId}"`
                : `store="${storeId}"`;
          const rows = await list(collection, filter);
          for (const row of rows) {
            if (collection === 'order_items' && masterToken) {
              const deleted = await request(`/api/pz/admin/orders/${row.order}/items/${row.id}`, { token: masterToken, method: 'DELETE' });
              assert.equal(deleted.status, 200, deleted.raw);
            } else {
              await remove(collection, row.id);
            }
          }
        }
      }
      for (const collection of [
        'order_price_adjustments', 'manual_coupon_usages', 'order_items', 'store_notifications', 'orders',
        'automatic_promotions', 'manual_coupons', 'gifts', 'product_variations',
        'products', 'shipping_zones', 'settings', 'currencies', 'users', 'stores',
      ]) {
        for (const id of [...new Set(ids[collection] || [])].reverse()) {
          if (collection === 'users') await removeUserRelations(id);
          await remove(collection, id);
        }
      }
      const fixtureFields = {
        order_price_adjustments: 'product_name_snapshot',
        stores: 'name',
        users: 'email',
        products: 'name',
        product_variations: 'value',
        orders: 'customer_name',
        order_items: 'product_name',
        automatic_promotions: 'name',
        manual_coupons: 'name',
        gifts: 'name',
        store_notifications: 'message',
      };
      for (const [collection, field] of Object.entries(fixtureFields)) {
        const remaining = await list(collection, `${field}~"${prefix}"`);
        assert.equal(remaining.length, 0, `${collection} conserva fixtures ${prefix}`);
      }
    }
  }
});
