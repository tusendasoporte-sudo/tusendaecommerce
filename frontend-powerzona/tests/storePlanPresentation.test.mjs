import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import {
  getHavanaCalendarDaysRemaining,
  getHavanaCivilDateKey,
  resolveStorePlanPresentation,
  STORE_PLAN_TIME_ZONE,
} from '../src/lib/storePlanPresentation.ts';

const require = createRequire(import.meta.url);
const backendPlans = require('../../backend-powerzona/pb_hooks/pz_store_plans_lib.js');

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

test('un plan pagado vencido entra en gracia y después queda vencido', () => {
  const equal = resolveStorePlanPresentation({ plan: 'basic', plan_expires_at: NOW.toISOString() }, NOW);
  const past = resolveStorePlanPresentation({ plan: 'premium', plan_expires_at: expiresIn(-3) }, NOW);
  assert.equal(equal.title, 'PERIODO DE GRACIA');
  assert.equal(equal.contextDetail, 'Renueva antes del 18/07/2026');
  assert.equal(past.state, 'expired');
  assert.equal(past.daysRemaining, 0);
});

test('Free vence sin gracia y conserva la llamada de plan vencido', () => {
  const result = resolveStorePlanPresentation({ plan: 'free', plan_expires_at: expiresIn(-1) }, NOW);
  assert.equal(result.title, 'PLAN VENCIDO');
  assert.equal(result.detail, 'Venció el 14/07/2026');
  assert.equal(result.state, 'expired');
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

test('15 de julio a 15 de agosto disminuye al cambiar la fecha civil de Cuba', () => {
  const values = { plan: 'basic', plan_expires_at: '2026-08-15T14:00:00.000Z' };
  const cases = [
    ['2026-07-15T18:00:00.000Z', 31],
    ['2026-07-16T04:01:00.000Z', 30],
    ['2026-08-14T16:00:00.000Z', 1],
  ];
  for (const [now, expected] of cases) {
    assert.equal(resolveStorePlanPresentation(values, now).daysRemaining, expected);
  }
});

test('el día de vencimiento muestra Vence hoy hasta la hora exacta y luego gracia', () => {
  const values = { plan: 'premium', plan_expires_at: '2026-08-15T14:00:00.000Z' };
  const before = resolveStorePlanPresentation(values, '2026-08-15T13:59:59.000Z');
  const grace = resolveStorePlanPresentation(values, '2026-08-15T14:00:00.000Z');
  assert.equal(before.daysRemaining, 0);
  assert.equal(before.state, 'critical');
  assert.equal(before.detail, 'Vence hoy');
  assert.equal(before.compactDetail, 'Vence hoy');
  assert.equal(grace.daysRemaining, 0);
  assert.equal(grace.state, 'grace');
  assert.equal(grace.shortName, 'En gracia');
});

test('Cuba controla claves civiles, febrero, fin de mes y horario de verano', () => {
  assert.equal(STORE_PLAN_TIME_ZONE, 'America/Havana');
  assert.equal(getHavanaCivilDateKey('2026-07-16T03:59:59.000Z'), '2026-07-15');
  assert.equal(getHavanaCivilDateKey('2026-07-16T04:00:00.000Z'), '2026-07-16');
  assert.equal(getHavanaCalendarDaysRemaining('2028-03-01T17:00:00.000Z', '2028-02-28T17:00:00.000Z'), 2);
  assert.equal(getHavanaCalendarDaysRemaining('2026-04-01T16:00:00.000Z', '2026-03-31T16:00:00.000Z'), 1);
  assert.equal(getHavanaCalendarDaysRemaining('2026-03-10T16:00:00.000Z', '2026-03-07T17:00:00.000Z'), 3);
});

test('backend y frontend mantienen paridad de días y estado', () => {
  const values = { plan: 'basic', plan_expires_at: '2026-08-15T14:00:00.000Z' };
  for (const now of [
    '2026-07-15T18:00:00.000Z',
    '2026-07-16T04:01:00.000Z',
    '2026-08-14T16:00:00.000Z',
    '2026-08-15T13:59:59.000Z',
    '2026-08-15T14:00:00.000Z',
  ]) {
    const frontend = resolveStorePlanPresentation(values, now);
    const backend = backendPlans.resolvePlanState(values, now);
    assert.equal(frontend.daysRemaining, backend.days_remaining, now);
    assert.equal(frontend.state, backend.state, now);
  }
});
