import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Seguridad: Actividad usa una accion contextual compacta y verificable', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const activityStart = view.indexOf("params.section === 'activity'");
  const activityEnd = view.indexOf("params.section === 'blocked'", activityStart);
  const activity = view.slice(activityStart, activityEnd);

  assert.ok(activityStart > -1);
  assert.ok(activityEnd > activityStart);
  assert.match(activity, />Actividad</);
  assert.match(activity, />Cliente \/ pedido</);
  assert.match(activity, />Resultado</);
  assert.match(activity, />Accion</);
  assert.match(activity, /activityActionHref\(event\)/);
  assert.match(view, /return 'Ver bloqueo'/);
  assert.match(view, /return 'Ver historial'/);
  assert.match(activity, /Historial no disponible/);
  assert.doesNotMatch(activity, /activity-detail-disclosure/);
  assert.doesNotMatch(activity, />Datos de seguridad</);
  assert.doesNotMatch(activity, /role="columnheader">Captura/);
  assert.doesNotMatch(activity, /role="columnheader">Modo/);
  assert.match(view, /activity-table\.has-ip \.table-row[\s\S]*?minmax\(104px, \.46fr\);/);
  assert.doesNotMatch(view, /activity-actions-heading|activity-detail-panel/);
  assert.match(view, /activity-action-cell/);
  assert.match(view, /@media \(max-width: 760px\)[\s\S]*?activity-table\.has-ip \.table-row[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
  assert.match(view, /activity-table \.activity-action-cell[\s\S]*?grid-row: 3/);
});

test('Seguridad: Actividad conserva el estado de captura entregado por el endpoint', () => {
  const frontend = read('../src/lib/securityMonitoring.ts');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');

  const frontendNormalizer = frontend.slice(
    frontend.indexOf('function normalizeActivityEndpointEvent'),
    frontend.indexOf('export async function getSecurityActivityPage'),
  );
  const backendSerializer = backend.slice(
    backend.indexOf('function serializeActivityEvent'),
    backend.indexOf('function serializeVisitorSession'),
  );

  assert.match(frontendNormalizer, /capture_status: String\(record\?\.capture_status \|\| ''\)/);
  assert.match(backendSerializer, /capture_status: getString\(event, "capture_status"\)/);
  assert.match(frontendNormalizer, /navigationTargetId/);
  assert.match(frontendNormalizer, /kind: isValidRecordId\(navigationTargetId\) \? navigationKind : 'none'/);
  assert.match(backendSerializer, /navigation: navigation \|\| \{ kind: "none", target_id: "" \}/);
  assert.doesNotMatch(backendSerializer, /browser_token_hmac|ip_hmac/);
});

test('Seguridad: Ver bloqueo enfoca el registro exacto y conserva aislamiento por tienda', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const client = read('../src/lib/securityMonitoring.ts');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const storeRoute = read('../src/pages/t/[storeSlug]/admin/security.astro');
  const masterRoute = read('../src/pages/master/security/[storeId].astro');

  assert.match(view, /block: targetId/);
  assert.match(view, /security-block-\$\{encodeURIComponent\(targetId\)\}/);
  assert.match(view, /params\.blockedFocusId === block\.id/);
  assert.match(client, /blockedFocusId: isValidRecordId\(blockedFocusId\) \? blockedFocusId : ''/);
  assert.match(client, /focus_id: isValidRecordId\(focusId\) \? focusId : ''/);
  assert.match(backend, /parts\.push\("id = \{:focusId\}"\)/);
  for (const route of [storeRoute, masterRoute]) assert.match(route, /params\.blockedFocusId/);
});

test('Seguridad: solo agrupa eventos consecutivos cuando existe una IP visible estable', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(view, /if \(!ip\) return `event:\$\{event\.id\}`/);
  assert.match(view, /Math\.abs\(currentTime - eventTime\) <= 15 \* 60 \* 1000/);
  assert.match(view, /registros consecutivos agrupados/);
});
