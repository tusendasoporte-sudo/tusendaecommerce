import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('BLOCK-HISTORY: Clientes bloqueados ofrece historial contextual en menu de tres puntos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const start = view.indexOf("params.section === 'blocked'");
  const end = view.indexOf('<dialog id="security-manual-ip-block-dialog"', start);
  assert.ok(start > -1 && end > start);
  const blocked = view.slice(start, end);

  assert.match(blocked, /data-inline-row-menu/);
  assert.match(blocked, /blockHistoryHref\(block\.id\)/);
  assert.match(blocked, />Ver historial</);
  assert.match(blocked, /focusedBlock\?\.detail/);
  assert.match(blocked, />Historial del bloqueo</);
  assert.match(blocked, /IPs relacionadas \(/);
  assert.match(blocked, /blockIpSourceLabel\(ip\)/);
  assert.match(blocked, /Intentos bloqueados/);
  assert.match(blocked, /Cronologia \(/);
  assert.match(blocked, /blockHistoryNavigationHref\(entry\)/);
});

test('BLOCKED-UI: resumen usa la lista compacta compartida con Productos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const start = view.indexOf("params.section === 'blocked'");
  const end = view.indexOf('<dialog id="security-manual-ip-block-dialog"', start);
  assert.ok(start > -1 && end > start);
  const blocked = view.slice(start, end);

  assert.match(blocked, /class="admin-compact-summary security-compact-summary security-inline-summary blocked-metrics-summary"/);
  assert.match(blocked, /admin-compact-summary__label">Bloqueos activos/);
  assert.match(blocked, /admin-compact-summary__label">Clientes afectados/);
  assert.match(blocked, /admin-compact-summary__label">IPs manuales activas/);
  assert.match(blocked, /admin-compact-summary__label">Vencen hoy/);
  assert.match(blocked, /admin-compact-summary__label">Permanentes/);
  assert.match(blocked, /class="admin-compact-summary security-compact-summary security-inline-summary block-history-summary"/);
  assert.doesNotMatch(blocked, /metrics-grid block-metrics|<article class="metric-card">/);
  assert.doesNotMatch(blocked, /premium-summary-list/);
});

test('BLOCKED-FILTER: Todos conserva el estado all porque el valor predeterminado es Activos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(view, /if \(text === 'all' && key !== 'blocked_status'\) return;/);
  assert.match(view, /blockedHref\(1, \{ blocked_status: value \}\)/);
  assert.match(view, /\['all', 'Todos'\]/);
});

test('BLOCK-HISTORY: contrato normaliza solo datos seguros y limita IP e historial', () => {
  const client = read('../src/lib/securityMonitoring.ts');
  const start = client.indexOf('function normalizeBlockRelatedIp');
  const end = client.indexOf('function normalizeBlockHistorySummary', start);
  const normalizers = client.slice(start, end);

  assert.match(normalizers, /related_ips\.slice\(0, 50\)/);
  assert.match(normalizers, /history\.slice\(0, 100\)/);
  assert.match(normalizers, /isValidRecordId\(navigationTargetId\)/);
  assert.match(normalizers, /visitor_session_id: isValidRecordId/);
  assert.doesNotMatch(normalizers, /ip_hmac|device_hmac|browser_token|cipher|encrypted/i);
});

test('BLOCK-HISTORY: backend construye detalle solo para el bloqueo enfocado', () => {
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const handlerStart = backend.indexOf('function handleSecurityBlocksPage');
  const handlerEnd = backend.indexOf('function handleCustomerLifecycle', handlerStart);
  const handler = backend.slice(handlerStart, handlerEnd);

  assert.match(handler, /parsed\.focusId === block\.id/);
  assert.match(handler, /buildSecurityBlockDetail\(\$app, parsed\.storeId, block, settings\)/);
  assert.match(backend, /SECURITY_BLOCK_RELATED_IP_LIMIT = 50/);
  assert.match(backend, /SECURITY_BLOCK_HISTORY_LIMIT = 100/);
  assert.match(backend, /block_record_id = \{:block\}/);
});
