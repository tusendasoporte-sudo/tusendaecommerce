const assert = require('node:assert/strict');
const test = require('node:test');

const capabilities = require('../pb_hooks/pz_store_capabilities_lib.js');

const NOW = new Date('2026-07-15T12:00:00.000Z');
const futureDate = (days) => new Date(NOW.getTime() + days * 86_400_000).toISOString();
const store = (plan, overrides = {}) => ({
  id: 'store-secret-id',
  name: 'Tienda privada',
  owner_phone: '+1 555 0100',
  plan,
  plan_started_at: NOW.toISOString(),
  plan_expires_at: futureDate(30),
  plan_is_permanent: false,
  ...overrides,
});
const pocketBaseDateTime = (value) => ({ string() { return value; } });

test('expone únicamente las nueve capacidades oficiales', () => {
  assert.deepEqual(capabilities.CAPABILITY_KEYS, [
    'max_active_users',
    'max_devices_per_user',
    'max_store_devices',
    'max_product_images',
    'raffles_enabled',
    'security_enabled',
    'landing_qr_enabled',
    'product_expiration_tools_enabled',
    'push_campaigns_enabled',
  ]);
  assert.deepEqual(capabilities.NUMERIC_CAPABILITY_KEYS, capabilities.CAPABILITY_KEYS.slice(0, 4));
  assert.deepEqual(capabilities.BOOLEAN_CAPABILITY_KEYS, capabilities.CAPABILITY_KEYS.slice(4));
});

test('rechaza una capability desconocida sin reflejar el payload', () => {
  const access = capabilities.resolveStoreCapabilityAccess(store('premium'), 'unknown_private_value');
  assert.equal(capabilities.isValidCapabilityKey('unknown_private_value'), false);
  assert.equal(access.allowed, false);
  assert.equal(access.capability, '');
  assert.equal(access.reason, 'invalid_capability');
});

test('Free no incluye Seguridad', () => {
  assert.equal(capabilities.resolveStoreCapabilityAccess(store('free'), 'security_enabled').reason, 'capability_not_in_plan');
});

test('Básico no incluye Rifas', () => {
  assert.equal(capabilities.hasStoreCapability(store('basic'), 'raffles_enabled'), false);
});

test('Básico no incluye Landing QR', () => {
  assert.equal(capabilities.hasStoreCapability(store('basic'), 'landing_qr_enabled'), false);
});

test('Básico no incluye herramientas de vencimiento', () => {
  assert.equal(capabilities.hasStoreCapability(store('basic'), 'product_expiration_tools_enabled'), false);
});

test('Premium incluye las cinco capacidades booleanas', () => {
  for (const key of capabilities.BOOLEAN_CAPABILITY_KEYS) {
    const access = capabilities.resolveStoreCapabilityAccess(store('premium'), key);
    assert.equal(access.kind, 'boolean');
    assert.equal(access.entitled, true);
    assert.equal(access.allowed, true);
  }
});

test('Free permite como máximo un usuario activo', () => {
  assert.equal(capabilities.resolveStoreCapabilityAccess(store('free'), 'max_active_users').limit, 1);
});

test('Premium permite como máximo cuatro usuarios activos', () => {
  assert.equal(capabilities.resolveStoreCapabilityAccess(store('premium'), 'max_active_users').limit, 4);
});

test('Free y Básico permiten dos fotos por producto', () => {
  assert.equal(capabilities.resolveStoreCapabilityAccess(store('free'), 'max_product_images').limit, 2);
  assert.equal(capabilities.resolveStoreCapabilityAccess(store('basic'), 'max_product_images').limit, 2);
});

test('Premium permite cuatro fotos por producto', () => {
  assert.equal(capabilities.resolveStoreCapabilityAccess(store('premium'), 'max_product_images').limit, 4);
});

test('requiredAmount igual al límite está permitido', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('free'),
    'max_product_images',
    { requiredAmount: 2, now: NOW },
  );
  assert.equal(access.allowed, true);
  assert.equal(access.required_amount, 2);
  assert.equal(access.reason, 'allowed');
});

test('requiredAmount superior al límite devuelve limit_exceeded', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('basic'),
    'max_product_images',
    { requiredAmount: 3, now: NOW },
  );
  assert.equal(access.allowed, false);
  assert.equal(access.limit, 2);
  assert.equal(access.reason, 'limit_exceeded');
});

test('PowerZona Premium permanente conserva todas las capacidades Premium', () => {
  const permanent = store('premium', { plan_is_permanent: true, plan_expires_at: '' });
  for (const key of capabilities.BOOLEAN_CAPABILITY_KEYS) {
    assert.equal(capabilities.hasStoreCapability(permanent, key, { now: NOW }), true);
  }
  assert.equal(capabilities.resolveStoreCapabilityAccess(permanent, 'max_devices_per_user', { now: NOW }).limit, 5);
  assert.equal(capabilities.resolveStoreCapabilityAccess(permanent, 'max_store_devices', { now: NOW }).limit, 20);
});

test('un plan permanente ignora una fecha residual vencida', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('premium', { plan_is_permanent: true, plan_expires_at: futureDate(-40) }),
    'landing_qr_enabled',
    { enforceExpiration: true, now: NOW },
  );
  assert.equal(access.plan_state, 'active');
  assert.equal(access.is_expired, false);
  assert.equal(access.allowed, true);
});

test('una tienda Premium heredada unconfigured conserva capacidades Premium', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: '' }),
    'security_enabled',
    { now: NOW },
  );
  assert.equal(access.plan_state, 'unconfigured');
  assert.equal(access.is_configured, false);
  assert.equal(access.allowed, true);
});

test('una tienda Básico heredada unconfigured no recibe capacidades Premium', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('basic', { plan_expires_at: '' }),
    'security_enabled',
    { now: NOW },
  );
  assert.equal(access.plan_state, 'unconfigured');
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'capability_not_in_plan');
});

test('un plan vencido se informa sin bloquear cuando enforceExpiration es false', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: futureDate(-1) }),
    'raffles_enabled',
    { enforceExpiration: false, now: NOW },
  );
  assert.equal(access.plan_state, 'expired');
  assert.equal(access.is_expired, true);
  assert.equal(access.allowed, true);
});

test('un plan vencido se bloquea cuando enforceExpiration es true', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: futureDate(-1) }),
    'raffles_enabled',
    { enforceExpiration: true, now: NOW },
  );
  assert.equal(access.is_expired, true);
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'plan_expired');
});

test('un plan desconocido falla cerrado y nunca se convierte en Premium', () => {
  const access = capabilities.resolveStoreCapabilityAccess(store('enterprise'), 'security_enabled', { now: NOW });
  assert.equal(access.plan, null);
  assert.equal(access.plan_state, 'invalid');
  assert.equal(access.entitled, false);
  assert.equal(access.allowed, false);
  assert.equal(access.reason, 'invalid_plan_data');
});

test('una fecha inválida produce un error controlado', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('premium', { plan_expires_at: 'not-a-date' }),
    'security_enabled',
    { now: NOW },
  );
  assert.equal(access.plan, 'premium');
  assert.equal(access.plan_state, 'invalid');
  assert.equal(access.reason, 'invalid_plan_data');
});

test('acepta DateTime simulado de PocketBase', () => {
  const values = store('premium', {
    plan_started_at: pocketBaseDateTime('2026-07-01 12:00:00.000Z'),
    plan_expires_at: pocketBaseDateTime('2026-08-01 12:00:00.000Z'),
  });
  const record = { get(key) { return values[key]; } };
  const access = capabilities.resolveStoreCapabilityAccess(record, 'landing_qr_enabled', { now: NOW });
  assert.equal(access.plan_state, 'active');
  assert.equal(access.allowed, true);
});

test('el resultado está congelado y no contiene datos privados de la tienda', () => {
  const access = capabilities.resolveStoreCapabilityAccess(store('premium'), 'security_enabled', { now: NOW });
  assert.equal(Object.isFrozen(access), true);
  assert.deepEqual(Object.keys(access), [
    'capability',
    'kind',
    'plan',
    'plan_state',
    'is_permanent',
    'is_configured',
    'is_expired',
    'entitled',
    'allowed',
    'limit',
    'required_amount',
    'reason',
  ]);
  assert.equal('id' in access, false);
  assert.equal('name' in access, false);
  assert.equal('owner_phone' in access, false);
});

test('requireStoreCapability devuelve acceso o lanza códigos seguros', () => {
  assert.equal(
    capabilities.requireStoreCapability(store('premium'), 'security_enabled', { now: NOW }).allowed,
    true,
  );
  assert.throws(
    () => capabilities.requireStoreCapability(store('basic'), 'security_enabled', { now: NOW }),
    (error) => error instanceof capabilities.StoreCapabilityError
      && error.code === 'capability_not_in_plan'
      && error.access.reason === 'capability_not_in_plan',
  );
});

test('getSafeCapabilityError devuelve HTTP y mensajes sanitizados', () => {
  const expected = {
    capability_not_in_plan: 403,
    limit_exceeded: 403,
    plan_expired: 403,
    invalid_capability: 500,
    invalid_plan_data: 503,
  };
  for (const [code, status] of Object.entries(expected)) {
    const safe = capabilities.getSafeCapabilityError({ code, stack: 'private path', payload: store('premium') });
    assert.equal(safe.status, status);
    assert.equal(safe.code, code);
    assert.equal(safe.message.includes('private path'), false);
    assert.equal('stack' in safe, false);
    assert.equal('payload' in safe, false);
  }
  assert.deepEqual(capabilities.getSafeCapabilityError(new Error('secret')), {
    status: 500,
    code: 'internal_error',
    message: 'Esta función no está disponible temporalmente.',
  });
});

test('requiredAmount inválido falla cerrado', () => {
  for (const requiredAmount of [-1, 1.5, '2']) {
    const access = capabilities.resolveStoreCapabilityAccess(
      store('premium'),
      'max_product_images',
      { requiredAmount, now: NOW },
    );
    assert.equal(access.allowed, false);
    assert.equal(access.reason, 'invalid_plan_data');
  }
});

test('Free permanente se trata como datos corruptos', () => {
  const access = capabilities.resolveStoreCapabilityAccess(
    store('free', { plan_is_permanent: true, plan_expires_at: '' }),
    'max_active_users',
    { now: NOW },
  );
  assert.equal(access.plan_state, 'invalid');
  assert.equal(access.allowed, false);
});
