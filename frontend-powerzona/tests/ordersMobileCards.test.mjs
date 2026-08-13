import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const orders = readFileSync(
  new URL('../src/pages/admin/orders.astro', import.meta.url),
  'utf8',
);

const mobileCardsMarker = orders.indexOf('E002-MOBILE-ORDER-CARDS');
const mobileCardsStyles = orders.slice(mobileCardsMarker, orders.indexOf('</style>', mobileCardsMarker));

test('E002: los pedidos usan tarjetas verticales legibles en movil', () => {
  assert.notEqual(mobileCardsMarker, -1);
  assert.match(mobileCardsStyles, /grid-template-areas:\s*"main status"\s*"date total"\s*"delivery delivery"\s*"actions actions"/);
  assert.match(mobileCardsStyles, /\.order-date-cell::before\s*\{\s*content:\s*"Fecha"/);
  assert.match(mobileCardsStyles, /\.order-total-cell::before\s*\{\s*content:\s*"Total"/);
  assert.match(mobileCardsStyles, /\.order-delivery-cell::before\s*\{[\s\S]*?content:\s*"Entrega"/);
  assert.match(mobileCardsStyles, /#orders-list-refresh-btn\s*\{\s*display:\s*none;/);
  assert.match(mobileCardsStyles, /\.order-open-btn\s*\{[\s\S]*?flex:\s*1 1 auto;/);
  assert.match(mobileCardsStyles, /\.order-delete-btn\s*\{[\s\S]*?flex:\s*0 0 54px;/);
});

test('E002: cada tarjeta conserva solo datos y acciones reales del pedido', () => {
  assert.match(orders, /deliveryLabels\[deliveryMethod\]/);
  assert.match(orders, /getStatusLabel\(order\.status\)/);
  assert.match(orders, /formatDateOnly\(order\.created\)/);
  assert.match(orders, /getOrderFinalTotal\(order\)/);
  assert.match(orders, />Abrir pedido<\/button>/);
  assert.doesNotMatch(mobileCardsStyles, /Pago pendiente|Por preparar/);
});
