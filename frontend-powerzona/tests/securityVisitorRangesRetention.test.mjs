import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

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
  assert.match(detail, /rangeDescriptions\[visitorRange\]/);
  for (const route of [storeRoute, masterRoute]) {
    assert.match(route, /normalizeVisitorRangeFilter\(Astro\.url\.searchParams\.get\('visitor_range'\)\)/);
    assert.match(route, /getSecurityVisitorDetail\([^\n]+ordersPage, visitorRange\)/);
    assert.match(route, /visitorRange=\{visitorRange\}/);
  }
});

test('VISITOR-RETENTION-UI: Reglas informa 30 dias de detalle y 90 dias de resumen', () => {
  const view = read('../src/components/admin/SecurityMonitoringView.astro');
  const backend = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const hook = read('../../backend-powerzona/pb_hooks/pz_security_monitoring.pb.js');

  assert.match(view, /<span>Navegacion detallada<\/span><strong>30 dias<\/strong>/);
  assert.match(view, /<span>Resumen de visitantes<\/span><strong>90 dias<\/strong>/);
  assert.match(backend, /VISITOR_PAGEVIEW_RETENTION_DAYS = 30/);
  assert.match(backend, /VISITOR_SESSION_RETENTION_DAYS = 90/);
  assert.match(hook, /pz_security_visitor_retention/);
  assert.match(hook, /17 4 \* \* \*/);
});
