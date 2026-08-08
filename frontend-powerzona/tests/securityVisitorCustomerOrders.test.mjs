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

test('VISITOR-VPN: detalle muestra una deteccion historica vinculada al dispositivo', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');
  const client = read('../src/lib/securityMonitoring.ts');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');

  assert.match(client, /export type SecurityVisitorVpnInfo/);
  assert.match(client, /vpn: normalizeVisitorVpnInfo\(record\?\.vpn\)/);
  assert.match(backend, /browser_token_hmac = \{:browserTokenHmac\}/);
  assert.match(backend, /buildVisitorVpnInfo\(\$app, payload\.storeId, visitor\)/);
  assert.doesNotMatch(backend.slice(backend.indexOf('function buildVisitorVpnInfo'), backend.indexOf('function entityName')), /ip_hmac|ip_masked|resolved_ip/);
  assert.match(detail, />VPN o proxy</);
  assert.match(detail, /VPN o proxy detectado/);
  assert.match(detail, /Ultima deteccion/);
  assert.match(detail, /Riesgo registrado/);
});

test('SEGURIDAD-UI: avisos, acciones de visitante y filtros usan controles compactos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(view, /data-auto-dismiss-success/);
  assert.match(view, /successNotice\.classList\.add\('is-leaving'\)/);
  assert.match(view, /window\.history\.replaceState/);
  assert.match(view, /class="icon-action visitor-menu-trigger"/);
  assert.match(view, /id="security-visitor-actions-menu"/);
  assert.match(view, /data-visitor-menu-view/);
  assert.match(view, /data-visitor-menu-block data-manual-ip-block-trigger/);
  assert.match(view, /<select name="event_type" data-activity-filter>/);
  assert.match(view, /<select name="risk" data-activity-filter>/);
  assert.match(view, /element\.form\?\.requestSubmit\(\)/);
});
