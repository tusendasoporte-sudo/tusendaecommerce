'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const STORE_A = 'storecamp000001';
const STORE_B = 'storecamp000002';
const USER_A = 'usercamp0000001';

class FakeRecord {
  constructor(collection, values = {}) {
    this.collectionName = collection?.name || collection;
    this.values = { ...values };
    this.id = String(values.id || '');
  }

  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  getStringSlice(key) {
    const value = this.get(key);
    return Array.isArray(value) ? value : [];
  }
  set(key, value) {
    if (key === 'id') this.id = String(value || '');
    else this.values[key] = value;
  }
}

global.Record = FakeRecord;
global.DynamicModel = class DynamicModel { constructor(values) { Object.assign(this, values); } };
global.arrayOf = (value) => [value];

const campaigns = require('../pb_hooks/pz_storefront_campaigns_lib.js');

function record(collection, id, values = {}) {
  return new FakeRecord(collection, { id, ...values });
}

function store(id = STORE_A, overrides = {}) {
  return record('stores', id, {
    slug: id === STORE_A ? 'powerzona' : 'otra-tienda',
    status: 'active',
    plan: 'premium',
    plan_is_permanent: true,
    plan_started_at: '2026-01-01T00:00:00.000Z',
    plan_expires_at: '',
    primary_admin_user: id === STORE_A ? USER_A : '',
    ...overrides,
  });
}

function matches(item, filter, params) {
  const value = (key) => item.getString(key);
  for (const key of ['store', 'campaign', 'status']) {
    if (params[key] !== undefined && value(key) !== String(params[key])) return false;
  }
  if (params.now !== undefined) {
    const field = filter.includes('scheduled_at') ? 'scheduled_at' : 'lock_expires_at';
    const raw = value(field);
    if (raw && new Date(raw).getTime() > new Date(params.now).getTime()) return false;
  }
  const statuses = [...filter.matchAll(/status\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  if (statuses.length && !statuses.includes(value('status'))) return false;
  if (filter.includes('notification_permission = "granted"') && value('notification_permission') !== 'granted') return false;
  if (filter.includes('started_at != ""') && !value('started_at')) return false;
  if (filter.includes('scheduled_at != ""') && !value('scheduled_at')) return false;
  return true;
}

function createApp() {
  const tables = new Map();
  const collectionNames = [
    'stores', 'users', 'store_user_access', 'storefront_app_configs', 'storefront_installations',
    'push_campaigns', 'push_campaign_deliveries', 'push_media', 'products', 'categories',
    'orders', 'raffles', 'manual_coupons', 'storefront_order_links',
  ];
  const collections = new Map(collectionNames.map((name) => [name, { name }]));
  let nextCampaign = 1;
  let nextDelivery = 1;
  const rows = (name) => tables.get(name) || [];
  const add = (item) => {
    if (!tables.has(item.collectionName)) tables.set(item.collectionName, []);
    const items = tables.get(item.collectionName);
    const index = items.findIndex((candidate) => candidate.id === item.id);
    if (index >= 0) items[index] = item;
    else items.push(item);
    return item;
  };
  add(store());
  add(store(STORE_B));
  add(record('users', USER_A, { status: 'active', role: 'store_admin', store: STORE_A }));
  const app = {
    rows,
    add,
    findCollectionByNameOrId(name) {
      if (!collections.has(name)) throw new Error('collection_not_found');
      return collections.get(name);
    },
    findRecordById(collection, id) {
      const found = rows(collection).find((item) => item.id === id);
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const found = rows(collection).find((item) => matches(item, '', params));
      if (!found) throw new Error('record_not_found');
      return found;
    },
    findRecordsByFilter(collection, filter, _sort, limit, offset, params = {}) {
      return rows(collection).filter((item) => matches(item, filter, params)).slice(offset, offset + limit);
    },
    save(item) {
      if (!item.id && item.collectionName === 'push_campaigns') {
        item.id = `campaign${String(nextCampaign++).padStart(7, '0')}`;
      }
      if (!item.id && item.collectionName === 'push_campaign_deliveries') {
        item.id = `delivery${String(nextDelivery++).padStart(7, '0')}`;
      }
      add(item);
      return item;
    },
    runInTransaction(callback) { callback(this); },
    db() { throw new Error('sql_not_available_in_unit_test'); },
  };
  return app;
}

function appConfig(id, storeId) {
  return record('storefront_app_configs', id, {
    store: storeId,
    status: 'active',
    app_key: storeId === STORE_A ? 'powerzona' : 'otra_tienda',
    package_name: storeId === STORE_A ? 'com.tusenda84.powerzona' : 'com.tusenda84.otra',
    firebase_app_id: '1:123456789012:android:abcdef0123456789',
  });
}

function installation(id, storeId, configId, overrides = {}) {
  return record('storefront_installations', id, {
    store: storeId,
    app_config: configId,
    status: 'active',
    notification_permission: 'granted',
    fid: `${id}abcdefghijklmnop`,
    last_seen_at: '2026-08-13T12:00:00.000Z',
    app_version_code: 7,
    country_code: 'US',
    region_code: 'FL',
    ...overrides,
  });
}

function campaign(id = 'campaign0000001', overrides = {}) {
  return record('push_campaigns', id, {
    store: STORE_A,
    created_by: USER_A,
    status: 'draft',
    title: 'Oferta del dia',
    body: 'Un mensaje seguro para clientes',
    audience_type: 'all_active',
    audience_config: {},
    target_type: 'home',
    target_path: '/t/powerzona',
    timezone: 'America/New_York',
    selected_count: 0,
    accepted_count: 0,
    failed_count: 0,
    invalid_count: 0,
    lock_token: '',
    lock_expires_at: '',
    started_at: '',
    scheduled_at: '',
    ...overrides,
  });
}

test('contratos de entrada son exactos y validan límites, zona y audiencia', () => {
  const valid = campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'Mensaje', target_type: 'home',
    timezone: 'America/New_York', title: 'Campaña',
  });
  assert.equal(valid.title, 'Campaña');
  assert.equal(valid.targetType, 'home');
  assert.equal(campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'Mensaje', target_type: 'home',
    timezone: 'America/New_York', title: 'Campaña', store_id: STORE_B,
  }), null);
  assert.throws(() => campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'x', target_type: 'home',
    timezone: 'America/New_York', title: 'x'.repeat(121),
  }), (error) => error.code === 'invalid_title');
  assert.equal(campaigns.isValidTimezone('America/New_York'), true);
  assert.equal(campaigns.isValidTimezone('Not/A_Real_Zone'), false);
  assert.deepEqual(
    campaigns.calendarKeys(new Date('2026-08-14T03:30:00.000Z'), 'America/New_York'),
    { day: '2026-08-13', month: '2026-08' },
  );
  assert.deepEqual(
    campaigns.normalizedAudienceConfig('all_active', { internal: true, toJSON: () => ({}) }, 'home'),
    {},
  );
});

test('calendario IANA usa el formato estable del runtime PocketBase', () => {
  const previousDateTime = global.DateTime;
  const previousIntl = global.Intl;
  global.DateTime = class MockDateTime {
    constructor(value, timezone) {
      if (!['UTC', 'America/New_York'].includes(timezone)) throw new Error('invalid_timezone');
      const utcWallClock = Date.parse(`${value.replace(' ', 'T')}Z`);
      const month = new Date(utcWallClock).getUTCMonth() + 1;
      const offsetHours = timezone === 'America/New_York' && month >= 3 && month <= 10 ? 4 : timezone === 'America/New_York' ? 5 : 0;
      this.value = utcWallClock + offsetHours * 60 * 60 * 1000;
    }
    unix() { return this.value / 1000; }
  };
  global.Intl = undefined;
  try {
    assert.deepEqual(
      campaigns.timezoneParts(new Date('2026-08-14T03:30:00.000Z'), 'America/New_York'),
      { year: 2026, month: 8, day: 13 },
    );
    assert.equal(campaigns.isValidTimezone('America/New_York'), true);
    assert.equal(campaigns.isValidTimezone('Not/A_Real_Zone'), false);
  } finally {
    if (previousDateTime === undefined) delete global.DateTime;
    else global.DateTime = previousDateTime;
    global.Intl = previousIntl;
  }
});

test('audiencia persistida se deserializa desde DynamicModel del runtime PocketBase', () => {
  const previousDynamicModel = global.DynamicModel;
  global.DynamicModel = class MockDynamicModel {
    constructor(shape) { Object.assign(this, shape); }
  };
  try {
    const record = {
      get: (key) => ({ audience_type: 'app_version', target_type: 'home' })[key],
      unmarshalJSONField: (_key, model) => { model.app_version_code = 42; },
    };
    assert.deepEqual(campaigns.recordAudienceConfig(record), { app_version_code: 42 });
  } finally {
    if (previousDynamicModel === undefined) delete global.DynamicModel;
    else global.DynamicModel = previousDynamicModel;
  }
});

test('acceso exige simultáneamente Premium y marketing.push.manage', () => {
  const app = createApp();
  const context = campaigns.loadCampaignAccessContext(app, { id: USER_A }, '');
  assert.equal(campaigns.assertCampaignAccess(app, context), true);

  const free = createApp();
  free.rows('stores')[0].set('plan', 'free');
  free.rows('stores')[0].set('plan_is_permanent', false);
  const freeContext = campaigns.loadCampaignAccessContext(free, { id: USER_A }, '');
  assert.throws(() => campaigns.assertCampaignAccess(free, freeContext), (error) => error.code === 'plan_not_available');

  const denied = createApp();
  denied.rows('stores')[0].set('primary_admin_user', '');
  denied.rows('users')[0].set('role', 'store_staff');
  const deniedContext = campaigns.loadCampaignAccessContext(denied, { id: USER_A }, '');
  assert.throws(() => campaigns.assertCampaignAccess(denied, deniedContext), (error) => error.code === 'permission_denied');
});

test('audiencia y snapshot se aíslan por tienda y son idempotentes sin límite artificial', () => {
  const app = createApp();
  const configA = app.add(appConfig('appconfig000001', STORE_A));
  const configB = app.add(appConfig('appconfig000002', STORE_B));
  app.add(installation('install00000001', STORE_A, configA.id));
  app.add(installation('install00000002', STORE_B, configB.id));
  const item = app.add(campaign());

  assert.deepEqual(campaigns.eligibleInstallations(app, item, new Date('2026-08-13T14:00:00.000Z')).map((row) => row.id), [
    'install00000001',
  ]);
  assert.equal(campaigns.materializeAudience(app, item, new Date('2026-08-13T14:00:00.000Z')), 1);
  assert.equal(campaigns.materializeAudience(app, item, new Date('2026-08-13T14:01:00.000Z')), 1);
  assert.equal(app.rows('push_campaign_deliveries').length, 1);
  assert.equal(app.rows('push_campaign_deliveries')[0].getString('store'), STORE_A);
});

test('cuotas diarias/mensuales usan el calendario IANA de la tienda', () => {
  const app = createApp();
  const item = app.add(campaign());
  for (let index = 0; index < campaigns.DAILY_CAMPAIGN_LIMIT; index += 1) {
    app.add(campaign(`sentcamp${String(index).padStart(7, '0')}`, {
      status: 'sent', started_at: `2026-08-13T1${index}:00:00.000Z`,
    }));
  }
  assert.throws(
    () => campaigns.assertCampaignQuota(app, item, new Date('2026-08-13T20:00:00.000Z')),
    (error) => error.code === 'daily_quota_exceeded',
  );
});

test('lock transaccional impide que dos workers materialicen la campaña completa', () => {
  const app = createApp();
  app.add(appConfig('appconfig000001', STORE_A));
  const item = app.add(campaign('campaign0000001', {
    status: 'scheduled', scheduled_at: '2026-08-13T13:00:00.000Z',
  }));
  const now = new Date('2026-08-13T14:00:00.000Z');
  const first = campaigns.acquireCampaignLock(app, item.id, now, { randomToken: () => 'a'.repeat(64) });
  const second = campaigns.acquireCampaignLock(app, item.id, now, { randomToken: () => 'b'.repeat(64) });
  assert.equal(first.terminal, false);
  assert.equal(first.lockToken, 'a'.repeat(48));
  assert.equal(second, null);
  assert.equal(item.getString('status'), 'processing');
});

test('downgrade Premium pausa incluso campañas fuera de la primera página de 500', () => {
  const app = createApp();
  for (let index = 0; index < 500; index += 1) {
    app.add(campaign(`bulkcamp${String(index).padStart(7, '0')}`, {
      status: 'scheduled', scheduled_at: '2026-08-14T15:00:00.000Z',
    }));
  }
  const freeStore = app.rows('stores').find((item) => item.id === STORE_B);
  freeStore.set('plan', 'free');
  freeStore.set('plan_is_permanent', false);
  const downgraded = app.add(campaign('bulkcamp0000500', {
    store: STORE_B, created_by: USER_A, status: 'scheduled', scheduled_at: '2026-08-14T15:00:00.000Z',
  }));
  assert.equal(campaigns.pauseDowngradedScheduledCampaigns(app), 1);
  assert.equal(downgraded.getString('status'), 'paused_plan');
});

test('fallo terminal conserva ambigüedad reclamada y cancela solo trabajo seguro', () => {
  const app = createApp();
  const item = app.add(campaign('campaign0000001', { status: 'processing' }));
  app.add(record('push_campaign_deliveries', 'delivery0000001', {
    store: STORE_A, campaign: item.id, status: 'pending', claim_token: '',
  }));
  app.add(record('push_campaign_deliveries', 'delivery0000002', {
    store: STORE_A, campaign: item.id, status: 'claimed', claim_token: 'old',
  }));
  assert.deepEqual(
    campaigns.terminalizeOutstandingDeliveries(app, item.id, new Date('2026-08-13T14:00:00.000Z')),
    { canceled: 1, unknown: 1 },
  );
  assert.equal(app.rows('push_campaign_deliveries')[0].getString('status'), 'canceled');
  assert.equal(app.rows('push_campaign_deliveries')[1].getString('status'), 'unknown');
});

test('rutas exponen solo C05, cron por minuto y mantienen relay administrativo v1 separado', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_storefront_campaigns.pb.js'), 'utf8');
  const relayV1 = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_push_dispatch.pb.js'), 'utf8');
  assert.match(routes, /\/api\/pz\/storefront\/v1\/campaigns/);
  assert.match(routes, /audience-preview/);
  assert.match(routes, /\.handleSave\(e\)/);
  assert.match(routes, /\.handleAudiencePreview\(e\)/);
  assert.match(routes, /\.handleSchedule\(e\)/);
  assert.match(routes, /\.handleCancel\(e\)/);
  assert.match(routes, /\.handleDuplicate\(e\)/);
  assert.doesNotMatch(routes, /\[handler\]\(e\)/);
  assert.match(routes, /cronAdd\([\s\S]*pz_storefront_push_campaigns[\s\S]*"\* \* \* \* \*"/);
  assert.match(relayV1, /continueNotificationCreated/);
  assert.doesNotMatch(routes, /continueNotificationCreated|store_notifications/);
});
