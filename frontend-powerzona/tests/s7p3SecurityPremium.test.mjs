import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveSecurityCapability } from '../src/lib/securityAccess.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const future = '2099-12-31T23:59:59.000Z';
const store = (plan, overrides = {}) => ({
  id: 'stores7p3000001',
  slug: 'tienda-s7p3',
  status: 'active',
  plan,
  plan_started_at: '2026-08-01T00:00:00.000Z',
  plan_expires_at: future,
  plan_is_permanent: false,
  ...overrides,
});

test('S7P3: capacidad efectiva permite solo Premium vigente y falla cerrada', () => {
  assert.equal(resolveSecurityCapability(store('premium')).allowed, true);
  assert.equal(resolveSecurityCapability(store('free')).allowed, false);
  assert.equal(resolveSecurityCapability(store('basic')).allowed, false);
  assert.equal(resolveSecurityCapability(store('premium', {
    plan_expires_at: '2000-01-01T00:00:00.000Z',
  })).reason, 'plan_expired');
  assert.equal(resolveSecurityCapability(store('desconocido')).reason, 'invalid_plan_data');
  assert.equal(resolveSecurityCapability(null).allowed, false);
});

test('S7P3: Principal sin capacidad ve gate sin cargar datos ni montar monitoreo', () => {
  const page = read('../src/pages/t/[storeSlug]/admin/security.astro');
  const access = read('../src/lib/securityAccess.ts');
  const settingsRead = page.indexOf('await getStoreSecuritySettings(currentStoreId, authPb)');
  const accessResolution = page.indexOf('await resolveSecurityAdminAccess(adminContext');
  const privateGuard = page.indexOf('if (canRenderSecurity) {');
  const summaryRead = page.indexOf('await getSecurityMonitoringSummary');

  assert.match(access, /'security_enabled',[\s\S]*?enforceExpiration: true/);
  assert.match(access, /allowed: capability\.allowed && canView/);
  assert.ok(accessResolution > -1);
  assert.ok(settingsRead > accessResolution);
  assert.ok(privateGuard > settingsRead);
  assert.ok(summaryRead > privateGuard);
  assert.match(page, /const showSecurityGate = securityAdminAccess\.isPrimaryAdmin && !securityAdminAccess\.capability\.allowed/);
  assert.match(page, /if \(!canRenderSecurity && !showSecurityGate\)[\s\S]*?status: 404/);
  assert.match(page, /const securitySettings = canRenderSecurity[\s\S]*?\? await getStoreSecuritySettings[\s\S]*?: getDefaultSecuritySettings/);
  assert.match(page, /\{canRenderSecurity \? \([\s\S]*?<SecurityMonitoringView[\s\S]*?\) : \([\s\S]*?data-security-premium-gate[\s\S]*?<StoreCapabilityGate/);
  assert.match(page, /planExpiredUsesPlanGate=\{true\}/);
  assert.match(page, /configuración, clientes, eventos, bloqueos y auditoría permanecen guardados/);
  assert.equal((page.match(/<SecurityMonitoringView/g) || []).length, 1);
  assert.equal((page.match(/data-security-premium-gate/g) || []).length, 1);
});

test('S7P3: POST y acciones privadas se procesan únicamente con capacidad y permiso efectivos', () => {
  const page = read('../src/pages/t/[storeSlug]/admin/security.astro');
  const formRead = page.indexOf('formData = await Astro.request.formData()');
  const postGuard = page.indexOf("canRenderSecurity && requestMethod === 'POST'");
  const actionGuard = page.indexOf('if (canRenderSecurity) {');

  assert.ok(postGuard > -1);
  assert.ok(formRead > postGuard);
  assert.ok(actionGuard > formRead);
  for (const action of [
    'runSecurityCustomerObservation',
    'runSecurityBlockCreate',
    'runSecurityBlockRevoke',
    'runSecurityCustomerLifecycle',
    'mergeSecurityCustomers',
  ]) {
    assert.ok(page.lastIndexOf(`${action}(`) > actionGuard, action);
  }
  assert.match(page, /const canManageSecurity = canRenderSecurity && securityAdminAccess\.canManage/);
});

test('S7P3: middleware reserva la excepción comercial exclusivamente al Principal', () => {
  const middleware = read('../src/middleware.ts');
  const helper = middleware.match(
    /function primaryAdminCanReachSecurityGate[\s\S]*?\n}\n/,
  )?.[0] || '';

  assert.match(helper, /normalized === 'security' \|\| normalized\.startsWith\('security\/'\)/);
  assert.match(helper, /&& isPrimaryAdmin/);
  assert.equal((middleware.match(/primaryAdminCanReachSecurityGate/g) || []).length, 2);
  assert.match(middleware, /primaryAdminCanReachRafflesGate\([\s\S]*?\) \|\| primaryAdminCanReachSecurityGate\(/);
  assert.match(middleware, /if \(normalized === 'security' \|\| normalized\.startsWith\('security\/'\)\) return \{ any: \['security\.view'\] \};/);
});

test('S7P3: sidebar descubre el gate sin consultar configuración privada durante downgrade', () => {
  const sidebar = read('../src/components/admin/AdminSidebar.astro');
  const capabilityIndex = sidebar.indexOf("'security_enabled'");
  const gateIndex = sidebar.indexOf('let canShowSecurityNav = isPrimaryAdmin && !securityAccess.allowed');
  const settingsIndex = sidebar.indexOf('await getStoreSecuritySettingsForToken');

  assert.ok(capabilityIndex > -1);
  assert.ok(gateIndex > capabilityIndex);
  assert.ok(settingsIndex > gateIndex);
  assert.match(sidebar, /if \(securityAccess\.allowed && canViewSecurity\) \{[\s\S]*?getStoreSecuritySettingsForToken/);
  assert.match(sidebar, /\{canShowSecurityNav && \([\s\S]*?href=\{adminSecurityPath\}[\s\S]*?>Seguridad</);
});

test('S7P3: rutas legacy y detalle de visitante conducen al gate antes de leer datos privados', () => {
  const legacy = read('../src/pages/admin/security.astro');
  const legacyVisitor = read('../src/pages/admin/security/visitors/[visitorSessionId].astro');
  const canonicalVisitor = read('../src/pages/t/[storeSlug]/admin/security/visitors/[visitorSessionId].astro');

  for (const source of [legacy, legacyVisitor, canonicalVisitor]) {
    const accessIndex = source.indexOf('await resolveSecurityAdminAccess(adminContext');
    const gateIndex = source.indexOf('if (showSecurityGate) return Astro.redirect');
    const settingsIndex = source.indexOf('await getStoreSecuritySettings');
    assert.ok(accessIndex > -1);
    assert.ok(gateIndex > accessIndex);
    assert.ok(settingsIndex > gateIndex);
  }
  assert.ok(canonicalVisitor.indexOf('await getSecurityVisitorDetail') > canonicalVisitor.indexOf('await getStoreSecuritySettings'));
});

test('S7P3: la superficie pública no incorpora un gate o enforcement nuevo', () => {
  const monitoring = read('../../backend-powerzona/pb_hooks/pz_security_monitoring_lib.js');
  const identity = read('../../backend-powerzona/pb_hooks/pz_security_identity_lib.js');
  const navigationHandler = monitoring.slice(
    monitoring.indexOf('function handleTrackNavigation('),
    monitoring.indexOf('function getRecordIpDisplay('),
  );
  const registerHandler = identity.slice(
    identity.indexOf('function handleRegisterOrder('),
    identity.indexOf('function invalidBackfill('),
  );

  assert.doesNotMatch(navigationHandler, /securityCapabilityAllowed|requireStoreCapability/);
  assert.doesNotMatch(registerHandler, /securityCapabilityAllowed|requireStoreCapability/);
  assert.doesNotMatch(navigationHandler, /capability_not_in_plan|plan_expired/);
  assert.doesNotMatch(registerHandler, /capability_not_in_plan|plan_expired/);
});
