const assert = require('node:assert/strict');
const test = require('node:test');

const plans = require('../pb_hooks/pz_store_plans_lib.js');

const FREE_CAPABILITIES = {
  max_products: 100,
  max_active_users: 1,
  max_devices_per_user: 5,
  max_store_devices: 5,
  max_product_images: 2,
  categories_enabled: true,
  subcategories_enabled: true,
  admin_android_app_enabled: false,
  customer_android_app_enabled: false,
  raffles_enabled: false,
  security_enabled: false,
  landing_qr_enabled: false,
  product_expiration_tools_enabled: false,
  push_campaigns_enabled: false,
};

const BASIC_CAPABILITIES = {
  ...FREE_CAPABILITIES,
  max_products: 700,
  max_active_users: 2,
  max_store_devices: 10,
  admin_android_app_enabled: true,
};

const PREMIUM_CAPABILITIES = {
  max_products: 1600,
  max_active_users: 4,
  max_devices_per_user: 5,
  max_store_devices: 20,
  max_product_images: 4,
  categories_enabled: true,
  subcategories_enabled: true,
  admin_android_app_enabled: true,
  customer_android_app_enabled: true,
  raffles_enabled: true,
  security_enabled: false,
  landing_qr_enabled: true,
  product_expiration_tools_enabled: true,
  push_campaigns_enabled: true,
};

const NOW = new Date('2026-07-15T12:00:00.000Z');

function futureDate(days) {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function pocketBaseDateTime(value) {
  return { string() { return value; } };
}

test('la matriz de Free es exacta', () => {
  const definition = plans.getPlanDefinition('free');
  assert.equal(definition.code, 'free');
  assert.equal(definition.name, 'Prueba gratis');
  assert.deepEqual(definition.duration, {
    kind: 'fixed_days', days: 30, min_months: 0, max_months: 0, allowed_months: [],
  });
  assert.deepEqual(definition.capabilities, FREE_CAPABILITIES);
});

test('la matriz de Básico es exacta', () => {
  const definition = plans.getPlanDefinition('basic');
  assert.equal(definition.code, 'basic');
  assert.equal(definition.name, 'Básico');
  assert.deepEqual(definition.duration.allowed_months, [1, 6, 12]);
  assert.deepEqual(definition.capabilities, BASIC_CAPABILITIES);
});

test('la matriz de Premium es exacta', () => {
  const definition = plans.getPlanDefinition('premium');
  assert.equal(definition.code, 'premium');
  assert.equal(definition.name, 'Premium');
  assert.deepEqual(definition.duration.allowed_months, [1, 6, 12]);
  assert.deepEqual(definition.capabilities, PREMIUM_CAPABILITIES);
});

test('Free permite un usuario, cinco dispositivos y dos fotos', () => {
  const capabilities = plans.getPlanCapabilities('free');
  assert.equal(capabilities.max_active_users, 1);
  assert.equal(capabilities.max_devices_per_user, 5);
  assert.equal(capabilities.max_store_devices, 5);
  assert.equal(capabilities.max_product_images, 2);
});

test('Básico permite dos usuarios, cinco dispositivos por usuario y diez por tienda', () => {
  const capabilities = plans.getPlanCapabilities('basic');
  assert.equal(capabilities.max_active_users, 2);
  assert.equal(capabilities.max_devices_per_user, 5);
  assert.equal(capabilities.max_store_devices, 10);
  assert.equal(capabilities.max_product_images, 2);
});

test('Premium permite cuatro usuarios, cinco dispositivos por usuario, veinte por tienda y cuatro fotos', () => {
  const capabilities = plans.getPlanCapabilities('premium');
  assert.equal(capabilities.max_active_users, 4);
  assert.equal(capabilities.max_devices_per_user, 5);
  assert.equal(capabilities.max_store_devices, 20);
  assert.equal(capabilities.max_product_images, 4);
});

test('solo Premium habilita las cuatro capacidades avanzadas incluidas', () => {
  const advancedKeys = [
    'raffles_enabled',
    'landing_qr_enabled',
    'product_expiration_tools_enabled',
    'push_campaigns_enabled',
  ];
  for (const key of advancedKeys) {
    assert.equal(plans.getPlanCapabilities('free')[key], false);
    assert.equal(plans.getPlanCapabilities('basic')[key], false);
    assert.equal(plans.getPlanCapabilities('premium')[key], true);
  }
  assert.equal(plans.getPlanCapabilities('premium').security_enabled, false);
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

test('normaliza DateTime real de PocketBase mediante string()', () => {
  const parsed = plans.parseDate(pocketBaseDateTime('2026-06-10 21:02:01.535Z'), false);
  assert.equal(parsed.toISOString(), '2026-06-10T21:02:01.535Z');
});

test('DateTime vacío se trata como fecha vacía cuando está permitido', () => {
  assert.equal(plans.parseDate(pocketBaseDateTime(''), true), null);
  assert.equal(plans.normalizedIso(pocketBaseDateTime('')), null);
  assert.throws(() => plans.parseDate(pocketBaseDateTime(''), false), /invalid_date/);
});

test('DateTime inválido se rechaza explícitamente', () => {
  assert.throws(
    () => plans.parseDate(pocketBaseDateTime('fecha-invalida'), true),
    /invalid_date/
  );
});

test('PowerZona permanente acepta fechas DateTime y vencimiento DateTime vacío', () => {
  const values = {
    plan: 'premium',
    plan_started_at: pocketBaseDateTime('2026-06-10 21:02:01.535Z'),
    plan_expires_at: pocketBaseDateTime(''),
    plan_duration_months: 0,
    plan_is_permanent: true,
  };
  const record = { get(key) { return values[key]; } };
  const state = plans.resolvePlanState(record, NOW);
  assert.equal(state.plan, 'premium');
  assert.equal(state.plan_started_at, '2026-06-10T21:02:01.535Z');
  assert.equal(state.plan_expires_at, null);
  assert.equal(state.days_remaining, null);
  assert.equal(state.state, 'active');
  assert.equal(state.isConfigured, true);
  assert.equal(state.isExpired, false);
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

test('un plan pagado vencido entra en tres días de gracia antes de expirar', () => {
  const state = plans.resolvePlanState({ plan: 'basic', plan_expires_at: futureDate(-1) }, NOW);
  assert.equal(state.days_remaining, 0);
  assert.equal(state.state, 'grace');
  assert.equal(state.in_grace, true);
  assert.equal(state.grace_days, 3);
  assert.equal(state.isExpired, false);

  const expired = plans.resolvePlanState({ plan: 'basic', plan_expires_at: futureDate(-3) }, NOW);
  assert.equal(expired.state, 'expired');
  assert.equal(expired.in_grace, false);
  assert.equal(expired.isExpired, true);
});

test('la prueba gratuita vence sin periodo de gracia', () => {
  const state = plans.resolvePlanState({ plan: 'free', plan_expires_at: futureDate(-1) }, NOW);
  assert.equal(state.days_remaining, 0);
  assert.equal(state.state, 'expired');
  assert.equal(state.grace_days, 0);
  assert.equal(state.in_grace, false);
  assert.equal(state.isExpired, true);
});

test('los días restantes usan fechas civiles de Cuba y no horas completas', () => {
  const expiration = '2026-08-15T14:00:00.000Z';
  const cases = [
    ['2026-07-15T18:00:00.000Z', 31],
    ['2026-07-16T04:01:00.000Z', 30],
    ['2026-08-14T16:00:00.000Z', 1],
    ['2026-08-15T13:59:59.000Z', 0],
  ];
  for (const [now, expected] of cases) {
    assert.equal(plans.getDaysRemaining(expiration, now), expected);
  }
});

test('vence hoy permanece crítico hasta el timestamp exacto y luego entra en gracia', () => {
  const values = { plan: 'basic', plan_expires_at: '2026-08-15T14:00:00.000Z' };
  const before = plans.resolvePlanState(values, '2026-08-15T13:59:59.000Z');
  const grace = plans.resolvePlanState(values, '2026-08-15T14:00:00.000Z');
  assert.equal(before.days_remaining, 0);
  assert.equal(before.state, 'critical');
  assert.equal(before.isExpired, false);
  assert.equal(grace.days_remaining, 0);
  assert.equal(grace.state, 'grace');
  assert.equal(grace.isExpired, false);
});

test('la clave civil de Cuba es estable en UTC, fin de mes, febrero y horario de verano', () => {
  assert.equal(plans.HAVANA_TIME_ZONE, 'America/Havana');
  assert.equal(plans.getHavanaCivilDateKey('2026-07-16T03:59:59.000Z'), '2026-07-15');
  assert.equal(plans.getHavanaCivilDateKey('2026-07-16T04:00:00.000Z'), '2026-07-16');
  assert.equal(plans.getDaysRemaining('2028-03-01T17:00:00.000Z', '2028-02-28T17:00:00.000Z'), 2);
  assert.equal(plans.getDaysRemaining('2026-04-01T16:00:00.000Z', '2026-03-31T16:00:00.000Z'), 1);
  assert.equal(plans.getDaysRemaining('2026-03-10T16:00:00.000Z', '2026-03-07T17:00:00.000Z'), 3);
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

test('Free solo puede utilizarse una vez por tienda', () => {
  assert.throws(
    () => plans.buildPlanChangeValues({ plan: 'basic', free_trial_used: true }, {
      plan: 'free',
      is_permanent: false,
      duration_months: 0,
    }, NOW, 'mastertest00001'),
    /free_trial_already_used/
  );
});

test('permite Gratis a Básico o Premium y Básico a Premium', () => {
  for (const [currentPlan, targetPlan] of [
    ['free', 'basic'],
    ['free', 'premium'],
    ['basic', 'premium'],
  ]) {
    const values = plans.buildPlanChangeValues({ plan: currentPlan, free_trial_used: true }, {
      plan: targetPlan,
      is_permanent: false,
      duration_months: 1,
    }, NOW, 'mastertest00001');
    assert.equal(values.plan, targetPlan);
    assert.equal(values.free_trial_used, true);
  }
});

test('Premium a Básico conserva una transición válida sin transformar datos de negocio', () => {
  const store = { plan: 'premium', free_trial_used: true, protected_business_data: 'conservar' };
  const values = plans.buildPlanChangeValues(store, {
    plan: 'basic',
    is_permanent: false,
    duration_months: 6,
  }, NOW, 'mastertest00001');
  assert.equal(values.plan, 'basic');
  assert.equal(store.protected_business_data, 'conservar');
  assert.equal(Object.hasOwn(values, 'protected_business_data'), false);
});

test('renovar un plan vigente suma un periodo comercial desde su vencimiento', () => {
  const values = plans.buildPlanRenewalValues({
    plan: 'basic',
    plan_started_at: '2026-06-15T12:00:00.000Z',
    plan_expires_at: '2026-07-31T12:00:00.000Z',
    plan_is_permanent: false,
    free_trial_used: true,
  }, 6, NOW, 'mastertest00001');
  assert.equal(values.plan_started_at, '2026-06-15T12:00:00.000Z');
  assert.equal(values.plan_expires_at, '2027-01-31T12:00:00.000Z');
  assert.equal(values.plan_duration_months, 6);
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

test('las renovaciones aceptan solo 1, 6 o 12 meses', () => {
  const store = {
    plan: 'basic',
    plan_started_at: '2026-06-15T12:00:00.000Z',
    plan_expires_at: '2026-07-31T12:00:00.000Z',
    plan_is_permanent: false,
    free_trial_used: true,
  };
  for (const months of [1, 6, 12]) {
    assert.equal(plans.buildPlanRenewalValues(store, months, NOW).plan_duration_months, months);
  }
  for (const months of [2, 3, 11]) {
    assert.throws(() => plans.buildPlanRenewalValues(store, months, NOW), /invalid_plan_duration_months/);
  }
});
