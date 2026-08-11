import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  formatDateTime,
  SECURITY_TIME_ZONE,
} from '../src/lib/securityMonitoring.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('SEGURIDAD-HORA: muestra fechas en America/Havana durante verano e invierno', () => {
  assert.equal(SECURITY_TIME_ZONE, 'America/Havana');

  const summer = formatDateTime('2026-08-11T21:01:00.000Z');
  const winter = formatDateTime('2026-01-11T22:01:00.000Z');

  assert.match(summer, /5:01/);
  assert.doesNotMatch(summer, /9:01/);
  assert.match(winter, /5:01/);
  assert.doesNotMatch(winter, /10:01/);
});

test('VISITOR-RANGE-UI: la seccion se llama Visitantes y ofrece Hoy, 7 dias y 30 dias', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const client = read('../src/lib/securityMonitoring.ts');

  assert.match(client, /VISITOR_RANGE_FILTERS = \['today', 'days_7', 'days_30'\]/);
  assert.match(client, /visitorRange: normalizeVisitorRangeFilter\(url\.searchParams\.get\('visitor_range'\)\)/);
  assert.match(client, /range: safeRange/);
  assert.match(view, />Visitantes<\/a>/);
  assert.match(view, /<h3 id="visitors-title">Visitantes<\/h3>/);
  assert.match(view, /aria-label="Periodo de visitantes"/);
  assert.match(view, /VISITOR_RANGE_FILTERS\.map/);
  assert.match(view, /visitor_range: params\.visitorRange/);
  assert.match(view, /visitorRangeEmptyMessages\[params\.visitorRange\]/);
  assert.doesNotMatch(view, />Visitantes de hoy<\/a>/);
});

test('VISITOR-RANGE-DATA: tienda y Master solicitan el periodo seleccionado', () => {
  const storePage = read('../src/pages/t/[storeSlug]/admin/security.astro');
  const masterPage = read('../src/pages/master/security/[storeId].astro');

  for (const page of [storePage, masterPage]) {
    assert.match(page, /getSecurityVisitorsPage/);
    assert.match(page, /params\.visitorsPage, params\.visitorRange/);
  }
});

test('VISITOR-RANGE-DETAIL: el detalle y el boton volver conservan el periodo', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');
  const storeRoute = read('../src/pages/t/[storeSlug]/admin/security/visitors/[visitorSessionId].astro');
  const masterRoute = read('../src/pages/master/security/[storeId]/visitors/[visitorSessionId].astro');

  assert.match(detail, /visitorRange\?: VisitorRangeFilter/);
  assert.match(detail, /query\.set\('visitor_range', visitorRange\)/);
  assert.match(detail, /visitorsBackHref/);
  assert.match(detail, /detailScopeDescription/);
  for (const route of [storeRoute, masterRoute]) {
    assert.match(route, /normalizeVisitorRangeFilter\(Astro\.url\.searchParams\.get\('visitor_range'\)\)/);
    assert.match(route, /getSecurityVisitorDetail\([^\n]+ordersPage, visitorRange, fullHistory, networkPage\)/);
    assert.match(route, /visitorRange=\{visitorRange\}/);
  }
});

test('VISITOR-HISTORY: Red conocida es global y el historial completo conserva el periodo de retorno', () => {
  const detail = read('../src/components/admin/SecurityVisitorDetailView.astro');
  const client = read('../src/lib/securityMonitoring.ts');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const storeRoute = read('../src/pages/t/[storeSlug]/admin/security/visitors/[visitorSessionId].astro');
  const masterRoute = read('../src/pages/master/security/[storeId]/visitors/[visitorSessionId].astro');

  assert.match(detail, />Red conocida</);
  assert.match(detail, /Historial del mismo visitante conservado hasta 90 días/);
  assert.match(detail, /'Ver historial completo'/);
  assert.match(detail, /historyModeHref/);
  assert.match(detail, /networkPageHref/);
  assert.match(detail, /Historial de red/);
  assert.match(detail, /networkHistory\.totalPages > 1/);
  assert.match(detail, /retención de 30 días/);
  assert.match(client, /full_history: fullHistory === true/);
  assert.match(client, /network_page: safeNetworkPage/);
  assert.match(client, /networkHistory: normalizeEndpointPage/);
  assert.match(backend, /listRelatedVisitorSessionsForHistory/);
  assert.match(backend, /historicalIpSources = visitorHistoricalIpSources\(\$app, payload\.storeId, historicalSessions\)/);
  assert.match(backend, /network_history: networkHistory/);
  for (const route of [storeRoute, masterRoute]) {
    assert.match(route, /searchParams\.get\('history'\) === 'full'/);
    assert.match(route, /searchParams\.get\('network_page'\)/);
    assert.match(route, /networkHistory=\{networkHistory\}/);
  }
});

test('VISITOR-RETENTION-UI: Reglas informa 30 dias de detalle y 90 dias de resumen', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const hook = read('../../backend-powerzona/pb_hooks/pz_security_monitoring.pb.js');

  assert.match(view, /admin-compact-summary__label">Navegación detallada[\s\S]*?admin-compact-summary__value is-text">30 días/);
  assert.match(view, /admin-compact-summary__label">Resumen de visitantes[\s\S]*?admin-compact-summary__value is-text">90 días/);
  assert.match(backend, /VISITOR_PAGEVIEW_RETENTION_DAYS = 30/);
  assert.match(backend, /VISITOR_SESSION_RETENTION_DAYS = 90/);
  assert.match(hook, /pz_security_visitor_retention/);
  assert.match(hook, /17 4 \* \* \*/);
});
