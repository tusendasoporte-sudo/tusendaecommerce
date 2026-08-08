import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Seguridad: Actividad usa una vista compacta y reserva los datos tecnicos para el detalle', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const activityStart = view.indexOf("params.section === 'activity'");
  const activityEnd = view.indexOf("params.section === 'blocked'", activityStart);
  const activity = view.slice(activityStart, activityEnd);

  assert.ok(activityStart > -1);
  assert.ok(activityEnd > activityStart);
  assert.match(activity, />Actividad</);
  assert.match(activity, />Cliente \/ pedido</);
  assert.match(activity, />Resultado</);
  assert.match(activity, /activity-detail-disclosure/);
  assert.match(activity, />Datos de seguridad</);
  assert.doesNotMatch(activity, /role="columnheader">Captura/);
  assert.doesNotMatch(activity, /role="columnheader">Modo/);
  assert.match(view, /activity-table\.has-ip \.table-row[\s\S]*?minmax\(118px, \.68fr\) 44px/);
  assert.match(view, /@media \(max-width: 760px\)[\s\S]*?activity-detail-label[\s\S]*?display: inline/);
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
});

test('Seguridad: solo agrupa eventos consecutivos cuando existe una IP visible estable', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');

  assert.match(view, /if \(!ip\) return `event:\$\{event\.id\}`/);
  assert.match(view, /Math\.abs\(currentTime - eventTime\) <= 15 \* 60 \* 1000/);
  assert.match(view, /registros consecutivos agrupados/);
});
