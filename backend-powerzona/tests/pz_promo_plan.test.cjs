const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const promoPlans = require('../pb_hooks/pz_promo_plan_lib.js');
const promoPlanApi = require('../pb_hooks/pz_promo_plan_api_lib.js');

function planStore(overrides = {}) {
  return {
    plan: 'basic',
    plan_started_at: '2025-12-01T00:00:00.000Z',
    plan_expires_at: '2026-01-20T00:00:00.000Z',
    plan_duration_months: 2,
    plan_is_permanent: false,
    free_trial_used: true,
    ...overrides,
  };
}

test('planes Promo son Gratis 30/150 y Básico 300 con precios CUP autoritativos', () => {
  const definitions = promoPlans.promoPlanDefinitions();
  assert.deepEqual(definitions.map((item) => item.code), ['free', 'basic']);
  assert.equal(definitions[0].duration.kind, 'fixed_days');
  assert.equal(definitions[0].duration.days, 30);
  assert.equal(definitions[0].capabilities.max_gallery_assets, 150);
  assert.equal(definitions[1].duration.kind, 'calendar_months');
  assert.equal(definitions[1].duration.min_months, 1);
  assert.equal(definitions[1].duration.max_months, 12);
  assert.deepEqual(definitions[1].duration.allowed_months, [1, 6, 12]);
  assert.equal(definitions[1].capabilities.max_gallery_assets, 300);
  assert.equal(definitions[1].capabilities.max_total_images, 300);
  assert.equal(definitions[1].monthly_price_cup, 1400);
  assert.deepEqual(definitions[1].pricing.periods.map((period) => period.total_cup), [1400, 7200, 12000]);
  assert.deepEqual(definitions[0].image_quota_options, [150]);
  assert.deepEqual(definitions[1].image_quota_options, [150, 300]);
  assert.equal(definitions[0].supports_permanent, false);
  assert.equal(definitions[1].supports_permanent, true);
  assert.equal(promoPlans.PROMO_PLAN_GRACE_DAYS, 3);
});

test('estado Promo avisa 7 días antes, bloquea durante gracia y pausa público después', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  assert.equal(promoPlans.resolvePromoPlanState(planStore(), now).state, 'active');
  assert.equal(promoPlans.resolvePromoPlanState(planStore({ plan_expires_at: '2026-01-07T12:00:00.000Z' }), now).state, 'expiring');
  assert.equal(promoPlans.resolvePromoPlanState(planStore({ plan_expires_at: '2026-01-03T12:00:00.000Z' }), now).state, 'critical');
  const grace = promoPlans.resolvePromoPlanState(planStore({ plan_expires_at: '2025-12-31T12:00:00.000Z' }), now);
  assert.equal(grace.state, 'grace');
  assert.equal(grace.can_mutate, false);
  assert.equal(grace.public_allowed, true);
  const expired = promoPlans.resolvePromoPlanState(planStore({ plan_expires_at: '2025-12-28T12:00:00.000Z' }), now);
  assert.equal(expired.state, 'expired');
  assert.equal(expired.public_allowed, false);
});

test('Gratis solo se consume una vez y Básico valida vigencia y cuota de fotos', () => {
  assert.throws(() => promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'free', is_permanent: false, duration_months: 0,
  }), /promo_free_trial_already_used/);
  assert.throws(() => promoPlans.assertPromoPlanSelection(planStore({ free_trial_used: false }), {
    plan: 'free', is_permanent: true, duration_months: 0,
  }), /invalid_promo_plan_permanence/);
  assert.throws(() => promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'premium', is_permanent: false, duration_months: 1,
  }), /invalid_promo_plan_code/);
  assert.throws(() => promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'basic', is_permanent: false, duration_months: 13, max_gallery_assets: 300,
  }), /invalid_plan_duration_months/);
  assert.throws(() => promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'basic', is_permanent: false, duration_months: 12, max_gallery_assets: 200,
  }), /invalid_promo_image_limit/);
  assert.deepEqual(promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'basic', is_permanent: false, duration_months: 12, max_gallery_assets: 300,
  }), { plan: 'basic', is_permanent: false, duration_months: 12, max_gallery_assets: 300 });
  assert.deepEqual(promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'basic', is_permanent: true, duration_months: 0, max_gallery_assets: 150,
  }), { plan: 'basic', is_permanent: true, duration_months: 0, max_gallery_assets: 150 });
  assert.throws(() => promoPlans.assertPromoPlanSelection(planStore(), {
    plan: 'basic', is_permanent: true, duration_months: 1, max_gallery_assets: 150,
  }), /invalid_plan_duration_months/);
});

test('Promo legado Premium permanente se proyecta como Básico sin alterar Commerce', () => {
  const state = promoPlans.resolvePromoPlanState(planStore({
    plan: 'premium', plan_is_permanent: true, plan_expires_at: '',
  }), new Date('2026-01-01T12:00:00.000Z'));
  assert.equal(state.plan, 'basic');
  assert.equal(state.legacy_contract, true);
  assert.equal(state.max_gallery_assets, 300);
  assert.equal(state.can_mutate, true);
  assert.equal(state.public_allowed, true);
});

test('la cuota Básica elegida se persiste y una renovación no la devuelve a 300', () => {
  const store = { id: 'storeaaaaaaaaaa', plan: 'basic' };
  const site = { id: 'siteaaaaaaaaaaa', store: store.id };
  const entitlement = {
    id: 'entitlementaaaa', site: site.id, max_gallery_assets: 300,
    set(key, value) { this[key] = value; },
  };
  const app = {
    findRecordsByFilter(collection) {
      if (collection === 'promo_sites') return [site];
      if (collection === 'promo_site_entitlements') return [entitlement];
      return [];
    },
    save(record) { assert.equal(record, entitlement); },
  };

  promoPlans.syncPromoEntitlement(app, store, 'masterstore0001', 150);
  assert.equal(entitlement.max_gallery_assets, 150);
  promoPlans.syncPromoEntitlement(app, store, 'masterstore0001');
  assert.equal(entitlement.max_gallery_assets, 150);
  assert.equal(entitlement.source, 'contract');
  assert.equal(entitlement.updated_by, 'masterstore0001');
});

test('API de planes Promo usa POST privados y payloads exactos', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_promo_plan.pb.js'), 'utf8');
  assert.deepEqual([...source.matchAll(/"(\/api\/pz\/promo\/master\/v1\/plan[^"]*)"/g)].map((match) => match[1]), [
    '/api/pz/promo/master/v1/plan',
    '/api/pz/promo/master/v1/plan/change',
    '/api/pz/promo/master/v1/plan/renew',
  ]);
  assert.equal((source.match(/routerAdd\(\s*"POST"/g) || []).length, 3);
  assert.equal((source.match(/\$apis\.requireAuth\(\)/g) || []).length, 3);
  assert.deepEqual(promoPlanApi.parseChangePayload({
    store_id: 'storeaaaaaaaaaa', plan: 'basic', duration_months: 12, reason: '',
  }), { storeId: 'storeaaaaaaaaaa', plan: 'basic', durationMonths: 12, isPermanent: false, maxGalleryAssets: 300, reason: '' });
  assert.deepEqual(promoPlanApi.parseChangePayload({
    store_id: 'storeaaaaaaaaaa', plan: 'basic', duration_months: 0,
    is_permanent: true, max_gallery_assets: 150, reason: 'Contrato permanente',
  }), {
    storeId: 'storeaaaaaaaaaa', plan: 'basic', durationMonths: 0,
    isPermanent: true, maxGalleryAssets: 150, reason: 'Contrato permanente',
  });
  assert.equal(promoPlanApi.parseChangePayload({
    store_id: 'storeaaaaaaaaaa', plan: 'basic', duration_months: 12, reason: '', permanent: true,
  }), null);
  assert.equal(promoPlanApi.parseChangePayload({
    store_id: 'storeaaaaaaaaaa', plan: 'basic', duration_months: 0,
    is_permanent: true, max_gallery_assets: 200, reason: '',
  }), null);
  assert.deepEqual(promoPlanApi.parseRenewPayload({
    store_id: 'storeaaaaaaaaaa', months: 4, reason: 'Renovación',
  }), { storeId: 'storeaaaaaaaaaa', months: 4, reason: 'Renovación' });
});
