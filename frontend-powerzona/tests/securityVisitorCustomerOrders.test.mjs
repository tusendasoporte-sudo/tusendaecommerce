import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('VISITOR-ORDERS: cliente identificado queda visible en la lista de visitantes', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(view, /visitor\.relatedCustomer && <span class="visitor-customer-pill">Cliente<\/span>/);
  assert.match(view, /pluralLabel\(visitor\.relatedCustomer\.orders_count, 'pedido realizado', 'pedidos realizados'\)/);
  assert.match(view, /params\.section === 'summary' && \([\s\S]*?aria-label="Métricas de seguridad"/);
});

test('VISITOR-STATUS: reemplaza primera visita por un estado de seguridad verificable', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const client = read('../src/lib/securityMonitoring.ts');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const visitorsStart = view.indexOf("params.section === 'visitors'");
  const blockedStart = view.indexOf("params.section === 'blocked'", visitorsStart);
  const visitors = view.slice(visitorsStart, blockedStart);

  assert.match(visitors, /role="columnheader">Estado</);
  assert.match(visitors, /data-label="Estado"/);
  assert.match(visitors, /status-pill status-\$\{visitor\.security_status\}/);
  assert.doesNotMatch(visitors, /Primera visita|visitor\.first_seen_at/);
  assert.match(view, /normal: 'Normal'/);
  assert.match(view, /watch: 'En observacion'/);
  assert.match(view, /blocked: 'Bloqueado'/);
  assert.match(client, /export type SecurityVisitorStatus = 'normal' \| 'watch' \| 'blocked'/);
  assert.match(client, /security_status: securityStatus/);
  assert.match(backend, /security_status: buildVisitorSecurityStatus/);
});

test('VISITOR-ORDERS: detalle usa la lista compacta compartida con Productos', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');

  assert.match(detail, /<section class="admin-compact-summary security-detail-summary"/);
  assert.match(detail, /<h3 id="visitor-summary-title" class="admin-compact-summary__title">Visitante<\/h3>/);
  assert.match(detail, /<div class="admin-compact-summary__list">/);
  assert.match(detail, /class="admin-compact-summary__value is-text summary-value-stack"/);
  assert.doesNotMatch(detail, /fact-grid|fact-box/);
  assert.doesNotMatch(detail, /class="summary-list"|class="summary-row"/);
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
    assert.match(route, /getSecurityVisitorDetail\([^\n]+ordersPage, visitorRange, fullHistory, networkPage\)/);
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
  assert.match(backend, /buildVisitorVpnInfo\(\$app, payload\.storeId, (?:visitor|representative)(?:, vpnEvents)?\)/);
  assert.doesNotMatch(backend.slice(backend.indexOf('function buildVisitorVpnInfo'), backend.indexOf('function visitorNetworkStatusFromEvent')), /ip_hmac|ip_masked|resolved_ip/);
  assert.match(detail, /isVpnEvent \? 'VPN o proxy' : 'Senal de red'/);
  assert.match(detail, /labelFromMap\(EVENT_TYPE_LABELS, vpnInfo\.event_type\)/);
  assert.match(detail, /vpnInfo\.event_type === 'vpn_detected' \|\| vpnInfo\.event_type === 'vpn_blocked'/);
  assert.match(detail, /\? 'VPN o proxy'/);
  assert.doesNotMatch(detail, /VPN o proxy bloqueado|VPN o proxy detectado/);
  assert.match(detail, /Última detección/);
  assert.match(detail, /Riesgo registrado/);
});

test('VISITOR-VPN-IP: detalle compacto muestra el estado por IP y agrupa la accion en tres puntos', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');
  const client = read('../src/lib/securityMonitoring.ts');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');

  assert.match(detail, />Estado</);
  assert.match(detail, />Actividad</);
  assert.match(detail, />Red conocida</);
  assert.match(detail, /networkSummary\.vpn_ip_count/);
  assert.match(detail, /pageview\.networkStatus/);
  assert.match(detail, /class="row-menu"/);
  assert.match(detail, /aria-label="Acciones de pagina"/);
  assert.doesNotMatch(detail, /class="row-action" href=\{pageview\.openPath\}/);
  assert.match(client, /export type SecurityVisitorIpNetworkStatus/);
  assert.match(client, /network_summary: normalizeVisitorNetworkSummary/);
  assert.match(client, /networkStatus: normalizeVisitorIpNetworkStatus\(record\?\.network_status\)/);
  assert.match(backend, /network_status: network\.status/);
  assert.match(backend, /network_summary: network\.summary/);
  assert.doesNotMatch(backend.slice(backend.indexOf('function serializeVisitorPageview'), backend.indexOf('function handleSecurityActivityPage')), /ip_hmac:/);
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
