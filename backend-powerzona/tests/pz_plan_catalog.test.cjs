'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const catalog = require('../pb_hooks/pz_plan_catalog_lib.js');
const management = require('../pb_hooks/pz_store_plan_management_lib.js');

test('el catálogo v1 expone una sola moneda y los dos tipos de tienda', () => {
  const dto = catalog.getCatalogDto();
  assert.equal(dto.contract, 'tusenda84.commercial-plan-catalog.v1');
  assert.equal(dto.version, 1);
  assert.deepEqual(dto.currency, { code: 'CUP', decimals: 0 });
  assert.deepEqual(dto.commercial_period_months, [1, 6, 12]);
  assert.deepEqual(dto.store_types.map(({ code, storage_code }) => ({ code, storage_code })), [
    { code: 'promotional', storage_code: 'promo' },
    { code: 'ecommerce', storage_code: 'commerce' },
  ]);
  assert.deepEqual(catalog.getPlanCodes('promo'), ['free', 'basic']);
  assert.deepEqual(catalog.getPlanCodes('commerce'), ['free', 'basic', 'premium']);
});

test('los precios Promo en CUP incluyen equivalencia, total y ahorro exactos', () => {
  const free = catalog.getPlanDefinition('promotional', 'free');
  assert.deepEqual(free.pricing, {
    currency: 'CUP',
    trial: { days: 30, total_cup: 0, one_time_per_store: true },
    periods: [],
  });
  assert.deepEqual(catalog.getPlanPricing('promo', 'basic').periods, [
    { months: 1, monthly_equivalent_cup: 1400, total_cup: 1400, savings_cup: 0, savings_percent: 0 },
    { months: 6, monthly_equivalent_cup: 1200, total_cup: 7200, savings_cup: 1200, savings_percent: 14.29 },
    { months: 12, monthly_equivalent_cup: 1000, total_cup: 12000, savings_cup: 4800, savings_percent: 28.57 },
  ]);
});

test('los precios Ecommerce Básico y Premium son los comerciales en CUP', () => {
  assert.deepEqual(catalog.getPlanPricing('ecommerce', 'basic').periods, [
    { months: 1, monthly_equivalent_cup: 1500, total_cup: 1500, savings_cup: 0, savings_percent: 0 },
    { months: 6, monthly_equivalent_cup: 1250, total_cup: 7500, savings_cup: 1500, savings_percent: 16.67 },
    { months: 12, monthly_equivalent_cup: 1000, total_cup: 12000, savings_cup: 6000, savings_percent: 33.33 },
  ]);
  assert.deepEqual(catalog.getPlanPricing('ecommerce', 'premium').periods, [
    { months: 1, monthly_equivalent_cup: 2500, total_cup: 2500, savings_cup: 0, savings_percent: 0 },
    { months: 6, monthly_equivalent_cup: 1800, total_cup: 10800, savings_cup: 4200, savings_percent: 28 },
    { months: 12, monthly_equivalent_cup: 1600, total_cup: 19200, savings_cup: 10800, savings_percent: 36 },
  ]);
});

test('Gratis, Básico y Premium Ecommerce tienen límites y accesos separados', () => {
  const free = catalog.getPlanCapabilities('commerce', 'free');
  const basic = catalog.getPlanCapabilities('commerce', 'basic');
  const premium = catalog.getPlanCapabilities('commerce', 'premium');

  assert.deepEqual(
    [free.max_products, basic.max_products, premium.max_products],
    [100, 700, 1600],
  );
  assert.deepEqual(
    [free.max_product_images, basic.max_product_images, premium.max_product_images],
    [2, 2, 4],
  );
  assert.deepEqual(
    [free.max_active_users, basic.max_active_users, premium.max_active_users],
    [1, 2, 4],
  );
  assert.deepEqual(
    [free.max_devices_per_user, basic.max_devices_per_user, premium.max_devices_per_user],
    [5, 5, 5],
  );
  assert.deepEqual(
    [free.max_store_devices, basic.max_store_devices, premium.max_store_devices],
    [5, 10, 20],
  );
  for (const capabilities of [free, basic, premium]) {
    assert.equal(capabilities.categories_enabled, true);
    assert.equal(capabilities.subcategories_enabled, true);
    assert.equal(capabilities.security_enabled, false);
  }
  assert.equal(free.admin_android_app_enabled, false);
  assert.equal(basic.admin_android_app_enabled, true);
  assert.equal(premium.admin_android_app_enabled, true);
  assert.equal(premium.customer_android_app_enabled, true);
  for (const key of ['raffles_enabled', 'landing_qr_enabled', 'product_expiration_tools_enabled', 'push_campaigns_enabled']) {
    assert.equal(free[key], false);
    assert.equal(basic[key], false);
    assert.equal(premium[key], true);
  }
});

test('ambos planes Promo conservan administración, catálogo, reseñas y contactos', () => {
  const free = catalog.getPlanCapabilities('promo', 'free');
  const basic = catalog.getPlanCapabilities('promo', 'basic');
  assert.equal(free.max_total_images, 150);
  assert.equal(basic.max_total_images, 300);
  assert.deepEqual(free.image_limit_includes, ['logo', 'cover', 'owner', 'gallery', 'catalog']);
  for (const key of [
    'admin_panel_enabled',
    'promotional_catalog_enabled',
    'reviews_management_enabled',
    'contacts_management_enabled',
  ]) {
    assert.equal(free[key], true);
    assert.equal(basic[key], true);
  }
});

test('Seguridad avanzada es opcional, Master-only y apagada por defecto incluso en Premium', () => {
  const policy = catalog.getOptionalCapabilityPolicy('security_enabled');
  assert.deepEqual(policy, {
    key: 'security_enabled',
    name: 'Seguridad avanzada',
    allocation: 'optional_per_store',
    controlled_by: 'master_admin',
    enabled_by_default: false,
    setting_collection: 'store_security_settings',
    eligible_store_types: ['ecommerce'],
    eligible_plans: ['free', 'basic', 'premium'],
  });
  assert.equal(catalog.getPlanCapabilities('ecommerce', 'premium').security_enabled, false);
});

test('cada evento puede congelar precio CUP, ahorro, periodo y límites del contrato aplicado', () => {
  const basicSemester = catalog.getCommercialAuditSnapshot('ecommerce', 'basic', {
    months: 6,
    is_permanent: false,
  });
  assert.deepEqual({
    contract: basicSemester.contract,
    store_type: basicSemester.store_type,
    plan_code: basicSemester.plan_code,
    currency: basicSemester.currency,
    pricing_kind: basicSemester.pricing_kind,
    period_months: basicSemester.period_months,
    monthly_equivalent_cup: basicSemester.monthly_equivalent_cup,
    total_cup: basicSemester.total_cup,
    savings_cup: basicSemester.savings_cup,
    savings_percent: basicSemester.savings_percent,
    max_products: basicSemester.capabilities.max_products,
  }, {
    contract: 'tusenda84.commercial-plan-catalog.v1',
    store_type: 'ecommerce',
    plan_code: 'basic',
    currency: 'CUP',
    pricing_kind: 'period',
    period_months: 6,
    monthly_equivalent_cup: 1250,
    total_cup: 7500,
    savings_cup: 1500,
    savings_percent: 16.67,
    max_products: 700,
  });
  assert.deepEqual(catalog.normalizeCommercialAuditSnapshot(JSON.stringify(basicSemester)), basicSemester);

  const trial = catalog.getCommercialAuditSnapshot('promotional', 'free', { months: 0, is_permanent: false });
  assert.equal(trial.pricing_kind, 'trial');
  assert.equal(trial.trial_days, 30);
  assert.equal(trial.total_cup, 0);
  assert.equal(trial.capabilities.max_total_images, 150);

  const permanent = catalog.getCommercialAuditSnapshot('ecommerce', 'premium', { months: 0, is_permanent: true });
  assert.equal(permanent.pricing_kind, 'permanent_compatibility');
  assert.equal(permanent.total_cup, null);
  assert.equal(permanent.period_months, null);
  assert.throws(
    () => catalog.getCommercialAuditSnapshot('ecommerce', 'basic', { months: 2, is_permanent: false }),
    /invalid_plan_duration_months/,
  );
});

test('el endpoint privado expone el DTO unificado sin depender de una tienda', () => {
  const route = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_store_plan_management.pb.js'), 'utf8');
  assert.match(route, /"GET",\s*"\/api\/pz\/master\/plan-catalog"/);
  assert.match(route, /handlePlanCatalog/);
  assert.match(route, /\$apis\.requireAuth\(\)/);

  const event = {
    requestInfo() { return { auth: { role: 'master_admin', status: 'active' } }; },
    response: { header() { return { set() {} }; } },
    json(status, payload) { return { status, payload }; },
  };
  const response = management.handlePlanCatalog(event);
  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.contract, catalog.CATALOG_CONTRACT);

  const denied = management.handlePlanCatalog({
    ...event,
    requestInfo() { return { auth: { role: 'store_admin', status: 'active' } }; },
  });
  assert.deepEqual(denied, { status: 403, payload: { ok: false, error: 'unauthorized' } });
});

test('la portada puede leer el mismo catálogo por un endpoint público cacheable', () => {
  const route = fs.readFileSync(path.join(__dirname, '../pb_hooks/pz_store_plan_management.pb.js'), 'utf8');
  assert.match(route, /"GET",\s*"\/api\/pz\/public\/plan-catalog"/);
  const publicRoute = route.slice(route.indexOf('/api/pz/public/plan-catalog'), route.indexOf('/api/pz/master/plan-catalog'));
  assert.match(publicRoute, /handlePublicPlanCatalog/);
  assert.doesNotMatch(publicRoute, /requireAuth|requireAuthenticatedUser/);

  const headers = new Map();
  const event = {
    response: { header() { return { set(key, value) { headers.set(key, value); } }; } },
    json(status, payload) { return { status, payload }; },
  };
  const response = management.handlePublicPlanCatalog(event);
  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.contract, catalog.CATALOG_CONTRACT);
  assert.equal(headers.get('Cache-Control'), 'public, max-age=300, stale-while-revalidate=600');
});

test('el catálogo interno está congelado y rechaza tipos o planes desconocidos', () => {
  assert.equal(Object.isFrozen(catalog.PLAN_CATALOG), true);
  assert.equal(Object.isFrozen(catalog.getPlanDefinition('ecommerce', 'premium').capabilities), true);
  assert.throws(() => catalog.normalizeStoreType('unknown'), /invalid_store_type/);
  assert.throws(() => catalog.getPlanDefinition('commerce', 'enterprise'), /invalid_plan_code/);
});
