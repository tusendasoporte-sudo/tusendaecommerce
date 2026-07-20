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

function fixture(assignedPermissions) {
  const store = record(STORE_ID, {
    status: 'active',
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

function orderRecord() {
  return record('orderprivacy001', {
    store: STORE_ID,
    order_number: 'PZ-PRIVACY-1',
    customer_name: 'Cliente visible',
    customer_phone: '+1 555 111 2222',
    customer_email: 'cliente@example.test',
    customer_address: 'Calle privada 123',
    customer: 'customerprivate1',
    receipt_token: 'receipt-private-token',
    review_token: 'review-private-token',
  });
}

function readOrder(assignedPermissions) {
  const { app, staff } = fixture(assignedPermissions);
  const order = orderRecord();
  let nextCalls = 0;
  privacy.enforceRead({
    app,
    auth: staff,
    record: order,
    collection: { name: 'orders' },
    next() { nextCalls += 1; },
  });
  assert.equal(nextCalls, 1);
  return order;
}

test('orders.view redacta contacto y ambos secretos de enlace', () => {
  const order = readOrder(['orders.view']);
  assert.deepEqual(
    [...order.hidden].sort(),
    [...privacy.ORDER_CONTACT_PRIVATE_FIELDS, ...privacy.ORDER_REVIEW_PRIVATE_FIELDS].sort(),
  );
  assert.equal(order.hidden.has('customer_name'), false);
  assert.equal(order.hidden.has('customer'), true);
  assert.equal(order.hidden.has('order_number'), false);
});

test('contacto y reseñas revelan exclusivamente sus propios campos', () => {
  const contact = readOrder(['orders.contact_customer']);
  assert.deepEqual([...contact.hidden], ['review_token']);

  const reviews = readOrder(['reviews.manage']);
  assert.equal(reviews.hidden.has('review_token'), false);
  privacy.ORDER_CONTACT_PRIVATE_FIELDS.forEach((field) => assert.equal(reviews.hidden.has(field), true, field));

  const complete = readOrder(['orders.contact_customer', 'reviews.manage']);
  assert.deepEqual([...complete.hidden], []);
});

test('la redacción alcanza órdenes expandidas sin alterar lecturas públicas por token', () => {
  const { app, staff } = fixture(['orders.view']);
  const expandedOrder = orderRecord();
  const item = record('itemprivacy0001', { order: expandedOrder.id });
  item.expandedAll = (field) => field === 'order' ? [expandedOrder] : [];
  privacy.enforceRead({
    app,
    auth: staff,
    records: [item],
    collection: { name: 'order_items' },
    next() {},
  });
  assert.equal(expandedOrder.hidden.has('customer_phone'), true);
  assert.equal(expandedOrder.hidden.has('receipt_token'), true);
  assert.equal(expandedOrder.hidden.has('customer'), true);
  assert.equal(expandedOrder.hidden.has('review_token'), true);

  const publicOrder = orderRecord();
  privacy.enforceRead({
    app,
    auth: null,
    record: publicOrder,
    collection: { name: 'orders' },
    next() {},
  });
  assert.deepEqual([...publicOrder.hidden], []);
});

test('realtime aplica la misma redacción antes de enviar el evento', () => {
  const { app, staff } = fixture(['orders.view']);
  const message = {
    name: 'orders',
    data: JSON.stringify({ action: 'update', record: {
      id: 'orderprivacy001',
      store: STORE_ID,
      order_number: 'PZ-PRIVACY-1',
      customer_phone: '+1 555 111 2222',
      customer_email: 'cliente@example.test',
      customer_address: 'Calle privada 123',
      receipt_token: 'receipt-private-token',
      review_token: 'review-private-token',
    } }),
  };
  let nextCalls = 0;
  privacy.enforceRealtimeMessage({
    app,
    client: { get(key) { return key === 'auth' ? staff : null; } },
    message,
    next() { nextCalls += 1; },
  });
  const sent = JSON.parse(message.data);
  assert.equal(nextCalls, 1);
  assert.equal(sent.record.order_number, 'PZ-PRIVACY-1');
  [...privacy.ORDER_CONTACT_PRIVATE_FIELDS, ...privacy.ORDER_REVIEW_PRIVATE_FIELDS]
    .forEach((field) => assert.equal(Object.hasOwn(sent.record, field), false, field));
});
