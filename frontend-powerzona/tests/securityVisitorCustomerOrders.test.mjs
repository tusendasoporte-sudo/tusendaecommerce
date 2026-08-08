import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('VISITOR-ORDERS: cliente identificado queda visible en la lista de visitantes', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(view, /visitor\.relatedCustomer && <span class="visitor-customer-pill">Cliente<\/span>/);
  assert.match(view, /pluralLabel\(visitor\.relatedCustomer\.orders_count, 'pedido realizado', 'pedidos realizados'\)/);
  assert.match(view, /params\.section === 'summary' && \([\s\S]*?aria-label="Metricas de seguridad"/);
});

test('VISITOR-ORDERS: detalle usa una lista premium y no mosaico de tarjetas', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');

  assert.match(detail, /<h3 id="visitor-summary-title">Resumen del visitante<\/h3>/);
  assert.match(detail, /<div class="summary-list">/);
  assert.doesNotMatch(detail, /fact-grid|fact-box/);
  assert.match(detail, /Cliente identificado/);
  assert.match(detail, /Pedidos realizados/);
  assert.match(detail, /Ver ficha del cliente/);
});

test('VISITOR-ORDERS: pedidos son desplegables, paginados de cinco y conservan apertura', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');
  const client = read('../src/lib/securityMonitoring.ts');
  const storeRoute = read('../src/pages/t/[storeSlug]/admin/security/visitors/[visitorSessionId].astro');
  const masterRoute = read('../src/pages/master/security/[storeId]/visitors/[visitorSessionId].astro');

  assert.match(client, /VISITOR_CUSTOMER_ORDERS_PER_PAGE = 5/);
  assert.match(client, /orders_page: safeOrdersPage/);
  assert.match(detail, /<details class="detail-card customer-orders-disclosure" open=\{ordersOpen\}>/);
  assert.match(detail, /orders_open/);
  assert.match(detail, /orders\.totalPages > 1/);
  assert.match(detail, /ordersPageHref/);
  assert.match(detail, /ORDER_STATUS_LABELS/);
  assert.match(detail, /Ver pedido/);
  for (const route of [storeRoute, masterRoute]) {
    assert.match(route, /searchParams\.get\('orders_page'\)/);
    assert.match(route, /getSecurityVisitorDetail\([^\n]+ordersPage\)/);
    assert.match(route, /orders=\{orders\}/);
  }
});
