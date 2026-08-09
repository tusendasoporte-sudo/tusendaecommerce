import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('BLOCK-HISTORY: Clientes bloqueados ofrece historial contextual en menu de tres puntos', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const start = view.indexOf("params.section === 'blocked'");
  const end = view.indexOf('</section>\n\n<dialog id="security-manual-ip-block-dialog"', start);
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

test('BLOCKED-UI: resumen usa una lista premium sin tarjetas de metricas', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const start = view.indexOf("params.section === 'blocked'");
  const end = view.indexOf('</section>\n\n<dialog id="security-manual-ip-block-dialog"', start);
  const blocked = view.slice(start, end);

  assert.match(blocked, /<dl class="premium-summary-list blocked-metrics-summary" aria-label="Resumen de bloqueos">/);
  assert.match(blocked, /<dt>Bloqueos activos<\/dt>/);
  assert.match(blocked, /<dt>Clientes afectados<\/dt>/);
  assert.match(blocked, /<dt>IPs manuales activas<\/dt>/);
  assert.match(blocked, /<dt>Vencen hoy<\/dt>/);
  assert.match(blocked, /<dt>Permanentes<\/dt>/);
  assert.doesNotMatch(blocked, /metrics-grid block-metrics|<article class="metric-card">/);
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
