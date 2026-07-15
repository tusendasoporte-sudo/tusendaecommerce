const assert = require('node:assert/strict');
const test = require('node:test');

const plans = require('../pb_hooks/pz_store_plans_lib.js');

const BASIC_CAPABILITIES = {
  max_active_users: 1,
  max_devices_per_user: 2,
  max_store_devices: 2,
  max_product_images: 2,
  raffles_enabled: false,
  security_enabled: false,
  landing_qr_enabled: false,
  product_expiration_tools_enabled: false,
};

const PREMIUM_CAPABILITIES = {
  max_active_users: 4,
  max_devices_per_user: 2,
  max_store_devices: 8,
  max_product_images: 4,
  raffles_enabled: true,
  security_enabled: true,
  landing_qr_enabled: true,
  product_expiration_tools_enabled: true,
};

const NOW = new Date('2026-07-15T12:00:00.000Z');

function futureDate(days) {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

test('la matriz de Free es exacta', () => {
  assert.deepEqual(plans.getPlanDefinition('free'), {
    code: 'free',
    name: 'Prueba gratuita',
    duration: { kind: 'fixed_days', days: 30, min_months: 0, max_months: 0 },
    capabilities: BASIC_CAPABILITIES,
  });
});

test('la matriz de Básico es exacta', () => {
  assert.deepEqual(plans.getPlanDefinition('basic'), {
    code: 'basic',
    name: 'Plan Básico',
    duration: { kind: 'calendar_months', days: null, min_months: 1, max_months: 12 },
    capabilities: BASIC_CAPABILITIES,
  });
});

test('la matriz de Premium es exacta', () => {
  assert.deepEqual(plans.getPlanDefinition('premium'), {
    code: 'premium',
    name: 'Plan Premium',
    duration: { kind: 'calendar_months', days: null, min_months: 1, max_months: 12 },
    capabilities: PREMIUM_CAPABILITIES,
  });
});

test('Free permite un usuario, dos dispositivos y dos fotos', () => {
  const capabilities = plans.getPlanCapabilities('free');
  assert.equal(capabilities.max_active_users, 1);
  assert.equal(capabilities.max_devices_per_user, 2);
  assert.equal(capabilities.max_store_devices, 2);
  assert.equal(capabilities.max_product_images, 2);
});

test('Premium permite cuatro usuarios, ocho dispositivos y cuatro fotos', () => {
  const capabilities = plans.getPlanCapabilities('premium');
  assert.equal(capabilities.max_active_users, 4);
  assert.equal(capabilities.max_devices_per_user, 2);
  assert.equal(capabilities.max_store_devices, 8);
  assert.equal(capabilities.max_product_images, 4);
});

test('solo Premium habilita las cuatro capacidades avanzadas', () => {
  const advancedKeys = [
    'security_enabled',
    'raffles_enabled',
    'landing_qr_enabled',
    'product_expiration_tools_enabled',
  ];
  for (const key of advancedKeys) {
    assert.equal(plans.getPlanCapabilities('free')[key], false);
    assert.equal(plans.getPlanCapabilities('basic')[key], false);
    assert.equal(plans.getPlanCapabilities('premium')[key], true);
  }
});

test('una tienda heredada sin vencimiento queda unconfigured', () => {
  const state = plans.resolvePlanState({ plan: 'premium', plan_expires_at: '' }, NOW);
  assert.equal(state.state, 'unconfigured');
  assert.equal(state.days_remaining, null);
  assert.equal(state.isConfigured, false);
  assert.equal(state.isExpired, false);
});

test('un plan permanente queda activo sin vencimiento ni días restantes', () => {
  const state = plans.resolvePlanState({
    plan: 'premium',
    plan_started_at: NOW.toISOString(),
    plan_expires_at: futureDate(8),
    plan_is_permanent: true,
  }, NOW);
  assert.equal(state.state, 'active');
  assert.equal(state.plan_is_permanent, true);
  assert.equal(state.plan_expires_at, null);
  assert.equal(state.days_remaining, null);
  assert.equal(state.isConfigured, true);
  assert.equal(state.can_renew, false);
});

test('más de siete días devuelve active', () => {
  assert.equal(plans.resolvePlanState({ plan: 'basic', plan_expires_at: futureDate(8) }, NOW).state, 'active');
});

test('siete días devuelve expiring', () => {
  const state = plans.resolvePlanState({ plan: 'basic', plan_expires_at: futureDate(7) }, NOW);
  assert.equal(state.days_remaining, 7);
  assert.equal(state.state, 'expiring');
});

test('tres días devuelve critical', () => {
  const state = plans.resolvePlanState({ plan: 'basic', plan_expires_at: futureDate(3) }, NOW);
  assert.equal(state.days_remaining, 3);
  assert.equal(state.state, 'critical');
});

test('una fecha pasada devuelve expired', () => {
  const state = plans.resolvePlanState({ plan: 'basic', plan_expires_at: futureDate(-1) }, NOW);
  assert.equal(state.days_remaining, 0);
  assert.equal(state.state, 'expired');
  assert.equal(state.isExpired, true);
});

test('Free genera exactamente treinta días', () => {
  const expiration = plans.addFreeTrialDays(NOW);
  assert.equal(expiration.getTime() - NOW.getTime(), 30 * 24 * 60 * 60 * 1000);
});

test('31 de enero más un mes se ajusta al último día de febrero', () => {
  const result = plans.addCalendarMonthsClamped('2025-01-31T10:30:00.000Z', 1);
  assert.equal(result.toISOString(), '2025-02-28T10:30:00.000Z');
});

test('31 de enero se ajusta correctamente en año bisiesto', () => {
  const result = plans.addCalendarMonthsClamped('2024-01-31T10:30:00.000Z', 1);
  assert.equal(result.toISOString(), '2024-02-29T10:30:00.000Z');
});

test('sumar doce meses conserva el calendario y la hora UTC', () => {
  const result = plans.addCalendarMonthsClamped('2024-02-29T23:15:40.123Z', 12);
  assert.equal(result.toISOString(), '2025-02-28T23:15:40.123Z');
});

test('un plan desconocido se rechaza explícitamente', () => {
  assert.equal(plans.isValidPlanCode('enterprise'), false);
  assert.throws(() => plans.getPlanDefinition('enterprise'), /invalid_plan_code/);
  assert.throws(
    () => plans.resolvePlanState({ plan: 'enterprise', plan_expires_at: futureDate(10) }, NOW),
    /invalid_plan_code/
  );
});

test('una fecha de vencimiento inválida se rechaza explícitamente', () => {
  assert.throws(
    () => plans.resolvePlanState({ plan: 'basic', plan_expires_at: '15/07/2026' }, NOW),
    /invalid_date/
  );
});

test('la inicialización de una tienda ignora plan y fechas suministrados', () => {
  const values = {
    plan: 'premium',
    plan_started_at: '2000-01-01T00:00:00.000Z',
    plan_expires_at: '2099-01-01T00:00:00.000Z',
    plan_duration_months: 12,
    plan_is_permanent: true,
    free_trial_used: false,
    plan_updated_at: '',
    plan_updated_by: '',
  };
  const record = {
    set(key, value) {
      values[key] = value;
    },
  };

  const initialized = plans.initializeNewStoreRecord(record, 'mastertest00001', NOW);

  assert.deepEqual(initialized, {
    plan: 'free',
    plan_started_at: '2026-07-15T12:00:00.000Z',
    plan_expires_at: '2026-08-14T12:00:00.000Z',
    plan_duration_months: 0,
    plan_is_permanent: false,
    free_trial_used: true,
    plan_updated_by: 'mastertest00001',
    plan_updated_at: '2026-07-15T12:00:00.000Z',
  });
  assert.deepEqual(values, initialized);
});

test('un fallo de auditoría elimina compensatoriamente la tienda nueva', () => {
  const values = { name: 'Tienda temporal', slug: 'tienda-temporal', plan_updated_by: '' };
  const store = {
    id: '',
    get(key) {
      return values[key];
    },
    set(key, value) {
      values[key] = value;
    },
  };
  let deletedStore = null;
  const app = {
    findCollectionByNameOrId(name) {
      if (name === 'stores') {
        return { fields: { getByName(field) { return ['plan_expires_at', 'plan_is_permanent'].includes(field) ? {} : null; } } };
      }
      if (name === 'store_plan_audit') return { name };
      throw new Error('collection_not_found');
    },
    findRecordById() {
      throw new Error('record_not_found');
    },
    save() {
      throw new Error('audit_write_failed');
    },
    delete(record) {
      deletedStore = record;
    },
  };
  const NativeRecord = global.Record;
  global.Record = class FakeRecord {
    constructor() {
      this.values = {};
    }
    set(key, value) {
      this.values[key] = value;
    }
  };

  try {
    assert.throws(
      () => plans.handleStoreCreate({ app, record: store, next() { store.id = 'storetestp7b100'; } }),
      /audit_write_failed/
    );
    assert.equal(deletedStore, store);
  } finally {
    global.Record = NativeRecord;
  }
});

test('cambiar Premium a permanente limpia vencimiento y duración', () => {
  const values = plans.buildPlanChangeValues({ free_trial_used: true }, {
    plan: 'premium',
    is_permanent: true,
    duration_months: 0,
  }, NOW, 'mastertest00001');
  assert.deepEqual(values, {
    plan: 'premium',
    plan_started_at: NOW.toISOString(),
    plan_expires_at: '',
    plan_duration_months: 0,
    plan_is_permanent: true,
    free_trial_used: true,
    plan_updated_by: 'mastertest00001',
    plan_updated_at: NOW.toISOString(),
  });
});

test('Free no puede configurarse como permanente', () => {
  assert.throws(
    () => plans.buildPlanChangeValues({}, {
      plan: 'free',
      is_permanent: true,
      duration_months: 0,
    }, NOW, 'mastertest00001'),
    /invalid_plan_permanence/
  );
});

test('renovar un plan vigente suma meses desde su vencimiento', () => {
  const values = plans.buildPlanRenewalValues({
    plan: 'basic',
    plan_started_at: '2026-06-15T12:00:00.000Z',
    plan_expires_at: '2026-07-31T12:00:00.000Z',
    plan_is_permanent: false,
    free_trial_used: true,
  }, 2, NOW, 'mastertest00001');
  assert.equal(values.plan_started_at, '2026-06-15T12:00:00.000Z');
  assert.equal(values.plan_expires_at, '2026-09-30T12:00:00.000Z');
  assert.equal(values.plan_duration_months, 2);
});

test('renovar un plan vencido inicia el nuevo período desde hoy', () => {
  const values = plans.buildPlanRenewalValues({
    plan: 'premium',
    plan_started_at: '2026-01-01T12:00:00.000Z',
    plan_expires_at: '2026-06-01T12:00:00.000Z',
    plan_is_permanent: false,
  }, 1, NOW, 'mastertest00001');
  assert.equal(values.plan_started_at, NOW.toISOString());
  assert.equal(values.plan_expires_at, '2026-08-15T12:00:00.000Z');
});

test('un plan permanente no admite renovación', () => {
  assert.throws(
    () => plans.buildPlanRenewalValues({
      plan: 'premium',
      plan_is_permanent: true,
    }, 1, NOW, 'mastertest00001'),
    /permanent_plan_not_renewable/
  );
});
