const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const management = require('../pb_hooks/pz_store_plan_management_lib.js');

const STORE_ID = 'storetestp7m200';

function pocketBaseDateTime(value) {
  return { string() { return value; } };
}

test('acepta un cambio temporal con periodo comercial de 1, 6 o 12 meses', () => {
  assert.deepEqual(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'basic',
    is_permanent: false,
    duration_months: 6,
    reason: 'Renovación comercial',
  }), {
    storeId: STORE_ID,
    plan: 'basic',
    isPermanent: false,
    durationMonths: 6,
    reason: 'Renovación comercial',
    confirmExpirationCleanup: false,
  });
});

test('acepta Premium permanente solo con duración cero', () => {
  assert.deepEqual(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'premium',
    is_permanent: true,
    duration_months: 0,
    reason: '',
  }), {
    storeId: STORE_ID,
    plan: 'premium',
    isPermanent: true,
    durationMonths: 0,
    reason: '',
    confirmExpirationCleanup: false,
  });
});

test('tolera el campo legado de confirmación sin volverlo requisito', () => {
  assert.deepEqual(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'basic',
    is_permanent: false,
    duration_months: 1,
    reason: 'Downgrade confirmado',
    confirm_expiration_cleanup: true,
  }), {
    storeId: STORE_ID,
    plan: 'basic',
    isPermanent: false,
    durationMonths: 1,
    reason: 'Downgrade confirmado',
    confirmExpirationCleanup: true,
  });
});

test('rechaza Free permanente y campos inesperados', () => {
  assert.equal(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'free',
    is_permanent: true,
    duration_months: 0,
    reason: '',
  }), null);
  assert.equal(management.parseChangePayload({
    store_id: STORE_ID,
    plan: 'basic',
    is_permanent: false,
    duration_months: 1,
    reason: '',
    actor_id: 'forbiddenfield1',
  }), null);
});

test('la renovación exige 1, 6 o 12 meses y motivo acotado', () => {
  assert.deepEqual(management.parseRenewPayload({ store_id: STORE_ID, months: 12, reason: 'Extensión' }), {
    storeId: STORE_ID,
    months: 12,
    reason: 'Extensión',
  });
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 0, reason: '' }), null);
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 2, reason: '' }), null);
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 13, reason: '' }), null);
  assert.equal(management.parseRenewPayload({ store_id: STORE_ID, months: 1, reason: 'x'.repeat(501) }), null);
});

test('el historial normaliza DateTime, actor vacío y valores anteriores vacíos', () => {
  const values = {
    action: 'plan_made_permanent',
    actor_name_snapshot: '',
    actor_role_snapshot: '',
    previous_plan: '',
    new_plan: 'premium',
    previous_started_at: pocketBaseDateTime(''),
    new_started_at: pocketBaseDateTime('2026-06-10 21:02:01.535Z'),
    previous_expires_at: pocketBaseDateTime(''),
    new_expires_at: pocketBaseDateTime(''),
    previous_is_permanent: false,
    new_is_permanent: true,
    duration_months: 0,
    reason: '',
    created: pocketBaseDateTime('2026-07-15 18:00:00.000Z'),
  };
  const record = { id: 'audittestp7m2f1', get(key) { return values[key]; } };
  assert.deepEqual(management.mapAudit(record), {
    id: 'audittestp7m2f1',
    action: 'plan_made_permanent',
    action_label: 'Plan convertido a permanente',
    actor_name: 'Sistema',
    actor_role: 'system',
    previous_plan: '',
    new_plan: 'premium',
    previous_started_at: '',
    new_started_at: '2026-06-10T21:02:01.535Z',
    previous_expires_at: '',
    new_expires_at: '',
    previous_is_permanent: false,
    new_is_permanent: true,
    duration_months: 0,
    reason: '',
    created: '2026-07-15T18:00:00.000Z',
  });
});

test('las tres definiciones consumen precios CUP del catálogo central', () => {
  const definitions = management.definitionsResponse();
  assert.deepEqual(definitions.map(({ code, monthly_price_usd, monthly_price_cup }) => ({
    code, monthly_price_usd, monthly_price_cup,
  })), [
    { code: 'free', monthly_price_usd: 0, monthly_price_cup: 0 },
    { code: 'basic', monthly_price_usd: 0, monthly_price_cup: 1500 },
    { code: 'premium', monthly_price_usd: 0, monthly_price_cup: 2500 },
  ]);
  assert.deepEqual(definitions[1].pricing.periods.map((period) => period.months), [1, 6, 12]);
  assert.deepEqual(definitions.map((definition) => definition.grace_days), [0, 3, 3]);
  assert.equal(definitions[0].capabilities.max_products, 100);
  assert.equal(definitions[1].capabilities.max_products, 700);
  assert.equal(definitions[2].capabilities.max_products, 1600);
  assert.deepEqual(definitions.map((definition) => definition.capabilities.max_active_users), [1, 2, 4]);
  assert.deepEqual(definitions.map((definition) => definition.capabilities.max_devices_per_user), [5, 5, 5]);
  assert.deepEqual(definitions.map((definition) => definition.capabilities.max_store_devices), [5, 10, 20]);
});

test('uso vacío o inválido siempre devuelve enteros no negativos', () => {
  assert.deepEqual(management.normalizeUsageRow(null), {
    active_users: 0,
    store_devices: 0,
    max_devices_per_user: 0,
    products: 0,
  });
  assert.deepEqual(management.normalizeUsageRow({
    activeUsers: -2,
    storeDevices: '3',
    maxDevicesPerUser: undefined,
  }), {
    active_users: 0,
    store_devices: 3,
    max_devices_per_user: 0,
    products: 0,
  });
});

test('safeIsoDate rechaza DateTime inválido en vez de inventar una fecha', () => {
  assert.throws(() => management.safeIsoDate(pocketBaseDateTime('inválida')), /invalid_date/);
});

test('Plan y límites cuenta solo dispositivos administrativos autorizados', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_plan_management_lib.js'), 'utf8');
  const usage = source.slice(source.indexOf('function storeUsage'), source.indexOf('function mapAudit'));
  assert.match(usage, /store_user_devices/);
  assert.match(usage, /COUNT\(DISTINCT device_digest\)/);
  assert.match(usage, /status = 'authorized'/);
  assert.equal(usage.includes('store_customer_devices'), false);
});

test('el downgrade conserva datos y no ejecuta la limpieza irreversible anterior', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_plan_management_lib.js'), 'utf8');
  const handler = source.slice(source.indexOf('function handlePlanChange'), source.indexOf('function handlePlanRenew'));
  assert.doesNotMatch(handler, /cleanupStoreExpirationData/);
  assert.doesNotMatch(handler, /expiration_cleanup_confirmation_required/);
  assert.match(handler, /downgrade_data_preserved/);
  assert.match(handler, /archiveStorePlanNotifications/);
});
