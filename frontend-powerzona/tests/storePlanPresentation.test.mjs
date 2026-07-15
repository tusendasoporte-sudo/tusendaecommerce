import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStorePlanPresentation } from '../src/lib/storePlanPresentation.ts';

const NOW = new Date('2026-07-15T12:00:00.000Z');
const expiresIn = (days) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

test('Premium permanente muestra vigencia permanente', () => {
  const result = resolveStorePlanPresentation({ plan: 'premium', plan_is_permanent: true }, NOW);
  assert.equal(result.title, 'PLAN PREMIUM');
  assert.equal(result.detail, 'Sin vencimiento');
  assert.equal(result.state, 'active');
  assert.equal(result.daysRemaining, null);
  assert.equal(result.expiresAt, null);
});

test('Basic permanente muestra vigencia permanente', () => {
  const result = resolveStorePlanPresentation({ plan: 'basic', plan_is_permanent: true }, NOW);
  assert.equal(result.title, 'PLAN BÁSICO');
  assert.equal(result.detail, 'Sin vencimiento');
  assert.equal(result.compactDetail, 'Permanente');
});

test('Free con 18 días conserva el texto oficial', () => {
  const result = resolveStorePlanPresentation({ plan: 'free', plan_expires_at: expiresIn(18) }, NOW);
  assert.equal(result.title, 'PRUEBA GRATUITA');
  assert.equal(result.detail, '18 días restantes');
  assert.equal(result.daysRemaining, 18);
});

test('Basic con más de siete días está activo', () => {
  assert.equal(resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: expiresIn(8) }, NOW).state, 'active');
});

test('siete días está próximo a vencer', () => {
  assert.equal(resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: expiresIn(7) }, NOW).state, 'expiring');
});

test('cuatro días está próximo a vencer', () => {
  assert.equal(resolveStorePlanPresentation({ plan: 'premium', plan_expires_at: expiresIn(4) }, NOW).state, 'expiring');
});

test('tres días está crítico', () => {
  assert.equal(resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: expiresIn(3) }, NOW).state, 'critical');
});

test('dos días usa el texto crítico plural', () => {
  assert.equal(resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: expiresIn(2) }, NOW).detail, 'Vence en 2 días');
});

test('un día usa el texto crítico singular', () => {
  assert.equal(resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: expiresIn(1) }, NOW).detail, 'Vence en 1 día');
});

test('fecha igual o pasada queda vencida y muestra la fecha UTC', () => {
  const equal = resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: NOW.toISOString() }, NOW);
  const past = resolveStorePlanPresentation({ plan: 'premium', plan_expires_at: expiresIn(-1) }, NOW);
  assert.equal(equal.title, 'PLAN VENCIDO');
  assert.equal(equal.detail, 'Venció el 15/07/2026');
  assert.equal(past.state, 'expired');
  assert.equal(past.daysRemaining, 0);
});

test('un plan permanente ignora una fecha residual', () => {
  const result = resolveStorePlanPresentation({
    plan: 'premium',
    plan_is_permanent: true,
    plan_expires_at: expiresIn(-10),
  }, NOW);
  assert.equal(result.state, 'active');
  assert.equal(result.expiresAt, null);
  assert.equal(result.detail, 'Sin vencimiento');
});

test('sin fecha y no permanente queda sin configurar', () => {
  const result = resolveStorePlanPresentation({ plan: 'premium', plan_is_permanent: false }, NOW);
  assert.equal(result.title, 'PLAN SIN CONFIGURAR');
  assert.equal(result.state, 'unconfigured');
});

test('una fecha inválida cae de forma segura sin lanzar excepción', () => {
  assert.doesNotThrow(() => resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: 'fecha-corrupta' }, NOW));
  assert.equal(resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: 'fecha-corrupta' }, NOW).title, 'PLAN SIN CONFIGURAR');
});

test('un plan desconocido no se convierte en Premium', () => {
  const result = resolveStorePlanPresentation({ plan: 'enterprise', plan_expires_at: expiresIn(30) }, NOW);
  assert.equal(result.code, '');
  assert.equal(result.title, 'PLAN SIN CONFIGURAR');
  assert.equal(result.icon, 'info');
});

test('Free permanente se considera una configuración inválida', () => {
  const result = resolveStorePlanPresentation({ plan: 'free', plan_is_permanent: true }, NOW);
  assert.equal(result.state, 'unconfigured');
  assert.equal(result.isPermanent, false);
});

test('PowerZona Premium permanente no expone guiones, cero días ni renovación', () => {
  const result = resolveStorePlanPresentation({ plan: 'premium', plan_is_permanent: true }, NOW);
  assert.equal(result.contextTitle, 'Plan Premium');
  assert.equal(result.contextDetail, 'Permanente');
  assert.equal(result.detail.includes('—'), false);
  assert.equal(result.detail.includes('0'), false);
  assert.equal(result.detail.toLowerCase().includes('renov'), false);
});

test('un now fijo produce el mismo resultado en llamadas sucesivas', () => {
  const values = { plan: 'free', plan_expires_at: expiresIn(18) };
  assert.deepEqual(resolveStorePlanPresentation(values, NOW), resolveStorePlanPresentation(values, NOW));
});
