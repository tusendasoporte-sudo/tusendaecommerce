import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const orders = readFileSync(new URL('../src/pages/admin/orders.astro', import.meta.url), 'utf8');
const settings = readFileSync(new URL('../src/pages/admin/store-settings.astro', import.meta.url), 'utf8');

test('M7U2: Pedidos elimina PII y secretos de respuestas directas antes de renderizar', () => {
  assert.match(orders, /function redactOrderForCurrentPermissions\(order\)/);
  assert.match(
    orders,
    /\['customer_phone', 'customer_email', 'customer_address', 'receipt_token'\][\s\S]*?delete safe\[field\]/,
  );
  assert.match(orders, /delete safe\.customer;[\s\S]*?delete safe\.expand\.customer/);
  assert.match(orders, /if \(!CAN_MANAGE_ORDER_REVIEWS\) delete safe\.review_token/);
  assert.match(orders, /return redactDirectOrderApiResult\(path, result\)/);
  assert.match(orders, /result\.items\.map\(redactOrderForCurrentPermissions\)/);
});

test('M7U2: teléfono, dirección y búsqueda de contacto dependen del permiso de contacto', () => {
  assert.match(orders, /id="detail-phone"[\s\S]{0,180}!canContactOrderCustomers|!canContactOrderCustomers[\s\S]{0,180}id="detail-phone"/);
  assert.match(orders, /id="detail-address-box"[\s\S]{0,180}!canContactOrderCustomers|!canContactOrderCustomers[\s\S]{0,180}id="detail-address-box"/);
  assert.match(orders, /const contactSearch = CAN_CONTACT_ORDER_CUSTOMERS \? \[order\.customer_phone, order\.customer_address\] : \[\]/);
  assert.match(orders, /CAN_CONTACT_ORDER_CUSTOMERS \? `<span class="order-subtext">/);
  assert.match(orders, /if \(CAN_CONTACT_ORDER_CUSTOMERS\) lines\.push\(`Teléfono:/);
  assert.match(orders, /CAN_CONTACT_ORDER_CUSTOMERS && selectedOrder\.delivery_method === 'delivery'/);
});

test('M7U2: solicitar reseña por WhatsApp exige reviews.manage y contacto', () => {
  assert.match(orders, /const canRequestOrderReviews = canContactOrderCustomers && canManageOrderReviews/);
  assert.match(orders, /const CAN_REQUEST_ORDER_REVIEWS = canRequestOrderReviews === true/);
  assert.match(orders, /if \(!CAN_REQUEST_ORDER_REVIEWS \|\| !selectedOrder\) return/);
  assert.match(orders, /!canRequestOrderReviews && 'permission-hidden'/);

  assert.ok(settings.includes("hasStorePermission({ permissions: effectivePermissions }, 'orders.contact_customer')"));
  assert.match(settings, /function redactReviewQueueOrder\(order\)/);
  assert.match(settings, /map\(redactReviewQueueOrder\)\.filter\(orderReadyForReview\)/);
  assert.match(settings, /CAN_CONTACT_ORDER_CUSTOMERS \? '<button class="js-ready-order-action" data-action="whatsapp"/);
  assert.match(settings, /if \(!CAN_CONTACT_ORDER_CUSTOMERS\) throw new Error\('No tienes permiso para contactar clientes de pedidos\.'/);
});
