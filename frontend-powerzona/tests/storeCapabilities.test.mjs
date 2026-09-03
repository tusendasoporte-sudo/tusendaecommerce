import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  STORE_CAPABILITY_KEYS,
  StoreCapabilityAccessError,
  getStoreCapabilityHttpError,
  hasStoreCapability,
  requireAdminStoreCapability,
  requireStoreCapability,
  resolveAdminStoreCapability,
  resolveStoreCapabilityAccess,
} from '../src/lib/storeCapabilities.ts';

const require = createRequire(import.meta.url);
const backendPlans = require('../../backend-powerzona/pb_hooks/pz_store_plans_lib.js');
const NOW = new Date('2026-07-15T12:00:00.000Z');
const expiresIn = (days) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
const store = (plan, overrides = {}) => ({
  id: 'private-store-id',
  owner_phone: '+1 555 0100',
  plan,
  plan_started_at: NOW.toISOString(),
  plan_expires_at: expiresIn(30),
  plan_is_permanent: false,
  commercial_capabilities: backendPlans.isValidPlanCode(plan)
    ? backendPlans.getPlanCapabilities(plan)
    : undefined,
  ...overrides,
});
const pocketBaseDateTime = (value) => ({ string() { return value; } });

test('la lista frontend contiene las capacidades comerciales oficiales', () => {
  assert.deepEqual(STORE_CAPABILITY_KEYS, [
    'max_products',
    'max_active_users',
    'max_devices_per_user',
    'max_store_devices',
    'max_product_images',
    'categories_enabled',
    'subcategories_enabled',
    'admin_android_app_enabled',
    'customer_android_app_enabled',
    'raffles_enabled',
    'security_enabled',
    'landing_qr_enabled',
    'product_expiration_tools_enabled',
    'push_campaigns_enabled',
  ]);
});

test('la matriz frontend mantiene paridad completa con la fuente backend', () => {
  for (const plan of backendPlans.PLAN_CODES) {
    const expected = backendPlans.getPlanCapabilities(plan);
    for (const key of STORE_CAPABILITY_KEYS) {
      const access = resolveStoreCapabilityAccess(store(plan, { plan_expires_at: '' }), key, { now: NOW });
      const actual = access.kind === 'boolean' ? access.entitled : access.limit;
      assert.equal(actual, expected[key], `${plan}.${key}`);
    }
  }
});

test('Free y Básico tienen límites separados y Seguridad opcional apagada', () => {
  assert.equal(resolveStoreCapabilityAccess(store('free'), 'max_active_users', { now: NOW }).limit, 1);
  assert.equal(resolveStoreCapabilityAccess(store('basic'), 'max_active_users', { now: NOW }).limit, 2);
  assert.equal(resolveStoreCapabilityAccess(store('free'), 'max_products', { now: NOW }).limit, 100);
  assert.equal(resolveStoreCapabilityAccess(store('basic'), 'max_products', { now: NOW }).limit, 700);
  assert.equal(resolveStoreCapabilityAccess(store('free'), 'max_store_devices', { now: NOW }).limit, 5);
  assert.equal(resolveStoreCapabilityAccess(store('basic'), 'max_store_devices', { now: NOW }).limit, 10);
  for (const plan of ['free', 'basic']) {
    assert.equal(resolveStoreCapabilityAccess(store(plan), 'max_product_images', { now: NOW }).limit, 2);
    assert.equal(hasStoreCapability(store(plan), 'security_enabled', { now: NOW }), false);
    assert.equal(hasStoreCapability(store(plan), 'landing_qr_enabled', { now: NOW }), false);
  }
});

test('Premium incluye límites ampliados y accesos, salvo Seguridad opcional', () => {
  assert.equal(resolveStoreCapabilityAccess(store('premium'), 'max_products', { now: NOW }).limit, 1600);
  assert.equal(resolveStoreCapabilityAccess(store('premium'), 'max_active_users', { now: NOW }).limit, 4);
  assert.equal(resolveStoreCapabilityAccess(store('premium'), 'max_devices_per_user', { now: NOW }).limit, 5);
  assert.equal(resolveStoreCapabilityAccess(store('premium'), 'max_store_devices', { now: NOW }).limit, 20);
  assert.equal(resolveStoreCapabilityAccess(store('premium'), 'max_product_images', { now: NOW }).limit, 4);
  for (const key of STORE_CAPABILITY_KEYS.slice(5).filter((item) => item !== 'security_enabled')) {
    assert.equal(hasStoreCapability(store('premium'), key, { now: NOW }), true);
  }
  assert.equal(hasStoreCapability(store('premium'), 'security_enabled', { now: NOW }), false);
});

test('un plan permanente conserva su capacidad e ignora una fecha residual', () => {
  const access = resolveStoreCapabilityAccess(
    store('premium', { plan_is_permanent: true, plan_expires_at: expiresIn(-20) }),
    'landing_qr_enabled',
    { enforceExpiration: true, now: NOW },
  );
  assert.equal(access.plan_state, 'active');
  assert.equal(access.is_permanent, true);
  assert.equal(access.is_expired, false);
  assert.equal(access.allowed, true);
});

test('un plan temporal activo resuelve normalmente', () => {
  const access = resolveStoreCapabilityAccess(store('premium'), 'raffles_enabled', { now: NOW });
  assert.equal(access.plan_state, 'active');
  assert.equal(access.is_configured, true);
  assert.equal(access.allowed, true);
});

test('una tienda Premium heredada unconfigured conserva capacidades Premium', () => {
  const access = resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: '' }),
    'product_expiration_tools_enabled',
    { now: NOW },
  );
  assert.equal(access.plan_state, 'unconfigured');
  assert.equal(access.is_configured, false);
  assert.equal(access.allowed, true);
});

test('una tienda Básico heredada unconfigured no se convierte en Premium', () => {
  const access = resolveStoreCapabilityAccess(
    store('basic', { plan_expires_at: '' }),
    'product_expiration_tools_enabled',
    { now: NOW },
  );
  assert.equal(access.plan_state, 'unconfigured');
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'capability_not_in_plan');
});

test('un plan vencido solo informa el estado con enforcement apagado', () => {
  const access = resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: expiresIn(-4) }),
    'security_enabled',
    { enforceExpiration: false, now: NOW, optionalCapabilityEnabled: true },
  );
  assert.equal(access.plan_state, 'expired');
  assert.equal(access.is_expired, true);
  assert.equal(access.allowed, true);
});

test('un plan vencido devuelve plan_expired con enforcement encendido', () => {
  const access = resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: expiresIn(-4) }),
    'security_enabled',
    { enforceExpiration: true, now: NOW, optionalCapabilityEnabled: true },
  );
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'plan_expired');
});

test('el periodo de gracia pagado conserva temporalmente el acceso', () => {
  const access = resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: expiresIn(-1) }),
    'security_enabled',
    { enforceExpiration: true, now: NOW, optionalCapabilityEnabled: true },
  );
  assert.equal(access.plan_state, 'grace');
  assert.equal(access.is_expired, false);
  assert.equal(access.allowed, true);
});

test('requiredAmount igual al límite está permitido', () => {
  const access = resolveStoreCapabilityAccess(store('free'), 'max_product_images', { requiredAmount: 2, now: NOW });
  assert.equal(access.allowed, true);
  assert.equal(access.limit, 2);
  assert.equal(access.required_amount, 2);
});

test('requiredAmount superior al límite devuelve limit_exceeded', () => {
  const access = resolveStoreCapabilityAccess(store('basic'), 'max_product_images', { requiredAmount: 3, now: NOW });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'limit_exceeded');
});

test('un plan desconocido falla cerrado y nunca hereda Premium', () => {
  const access = resolveStoreCapabilityAccess(store('enterprise'), 'security_enabled', { now: NOW });
  assert.equal(access.plan, null);
  assert.equal(access.plan_state, 'invalid');
  assert.equal(access.entitled, false);
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'invalid_plan_data');
});

test('fechas y requiredAmount inválidos fallan cerrado', () => {
  const invalidDate = resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: 'fecha-invalida' }),
    'security_enabled',
    { now: NOW },
  );
  const invalidAmount = resolveStoreCapabilityAccess(
    store('premium'),
    'max_product_images',
    { requiredAmount: -1, now: NOW },
  );
  assert.equal(invalidDate.reason, 'invalid_plan_data');
  assert.equal(invalidAmount.reason, 'invalid_plan_data');
  assert.equal(invalidDate.allowed, false);
  assert.equal(invalidAmount.allowed, false);
});

test('normaliza DateTime simulado de PocketBase sin romper SSR', () => {
  const access = resolveStoreCapabilityAccess(store('premium', {
    plan_started_at: pocketBaseDateTime('2026-07-01 12:00:00.000Z'),
    plan_expires_at: pocketBaseDateTime('2026-08-01 12:00:00.000Z'),
  }), 'landing_qr_enabled', { now: NOW });
  assert.equal(access.plan_state, 'active');
  assert.equal(access.allowed, true);
});

test('una capability desconocida falla cerrada y no refleja el valor recibido', () => {
  const access = resolveStoreCapabilityAccess(store('premium'), 'private-unknown-capability', { now: NOW });
  assert.equal(access.capability, '');
  assert.equal(access.reason, 'invalid_capability');
  assert.equal(access.allowed, false);
});

test('requireStoreCapability lanza StoreCapabilityAccessError controlado', () => {
  assert.equal(requireStoreCapability(store('premium'), 'security_enabled', {
    now: NOW, optionalCapabilityEnabled: true,
  }).allowed, true);
  assert.throws(
    () => requireStoreCapability(store('basic'), 'security_enabled', { now: NOW }),
    (error) => error instanceof StoreCapabilityAccessError
      && error.code === 'capability_not_enabled'
      && error.access.allowed === false,
  );
});

test('getStoreCapabilityHttpError sanitiza errores conocidos y desconocidos', () => {
  assert.deepEqual(getStoreCapabilityHttpError({ code: 'limit_exceeded', stack: 'private' }), {
    status: 403,
    code: 'limit_exceeded',
    message: 'Alcanzaste el límite permitido por tu plan.',
  });
  assert.deepEqual(getStoreCapabilityHttpError(new Error('PocketBase private detail')), {
    status: 500,
    code: 'internal_error',
    message: 'Esta función no está disponible temporalmente.',
  });
});

test('el wrapper Admin evalúa únicamente adminContext.store', () => {
  const adminContext = {
    store: store('basic'),
    store_id: 'client-supplied-other-store',
    alternateStore: store('premium'),
  };
  const access = resolveAdminStoreCapability(adminContext, 'max_active_users', { now: NOW });
  assert.equal(access.plan, 'basic');
  assert.equal(access.allowed, true);
  assert.equal(access.limit, 2);
  assert.throws(
    () => requireAdminStoreCapability(adminContext, 'security_enabled', { now: NOW }),
    (error) => error instanceof StoreCapabilityAccessError && error.code === 'capability_not_enabled',
  );
});

test('el resultado sanitizado es inmutable y no incluye el registro de tienda', () => {
  const access = resolveStoreCapabilityAccess(store('premium'), 'raffles_enabled', { now: NOW });
  assert.equal(Object.isFrozen(access), true);
  assert.equal('id' in access, false);
  assert.equal('owner_phone' in access, false);
  assert.equal('store' in access, false);
});

test('el helper de autorización no depende de storePlanPresentation', () => {
  const source = readFileSync(new URL('../src/lib/storeCapabilities.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('storePlanPresentation'), false);
  assert.equal(source.includes('/api/pz/master/store-plan'), false);
  assert.equal(source.includes('localStorage'), false);
  assert.equal(source.includes('sessionStorage'), false);
});
