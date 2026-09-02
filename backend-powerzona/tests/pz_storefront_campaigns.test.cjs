'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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
    push_campaign_quota_state: {},
    ...overrides,
  });
}

function matches(item, filter, params) {
  const value = (key) => item.getString(key);
  for (const key of ['store', 'campaign', 'status']) {
    if (params[key] !== undefined && value(key) !== String(params[key])) return false;
  }
  if (params.now !== undefined) {
    const field = filter.includes('scheduled_at')
      ? 'scheduled_at'
      : (filter.includes('delete_after') ? 'delete_after' : 'lock_expires_at');
    const raw = value(field);
    if (raw && new Date(raw).getTime() > new Date(params.now).getTime()) return false;
  }
  const statuses = [...filter.matchAll(/status\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  if (statuses.length && !statuses.includes(value('status'))) return false;
  if (filter.includes('notification_permission = "granted"') && value('notification_permission') !== 'granted') return false;
  if (filter.includes('started_at != ""') && !value('started_at')) return false;
  if (filter.includes('scheduled_at != ""') && !value('scheduled_at')) return false;
  if (filter.includes('delete_after != ""') && !value('delete_after')) return false;
  return true;
}

function createApp() {
  const tables = new Map();
  const collectionNames = [
    'stores', 'users', 'store_user_access', 'storefront_app_configs', 'storefront_installations',
    'push_campaigns', 'push_campaign_deliveries', 'push_events', 'push_media', 'products', 'categories',
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
    delete(item) {
      const items = rows(item.collectionName);
      const index = items.findIndex((candidate) => candidate.id === item.id);
      if (index >= 0) items.splice(index, 1);
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
    timezone: 'America/Havana',
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
  assert.equal(campaigns.CAMPAIGN_PAGE_SIZE, 10);
  assert.equal(campaigns.DELETE_CAMPAIGN_LIMIT, 50);
  const valid = campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'Mensaje', target_type: 'home',
    timezone: 'America/Havana', title: 'Campaña',
  });
  assert.equal(valid.title, 'Campaña');
  assert.equal(valid.targetType, 'home');
  assert.equal(campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'Mensaje', target_type: 'home',
    timezone: 'America/Havana', title: 'Campaña', store_id: STORE_B,
  }), null);
  assert.throws(() => campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'x', target_type: 'home',
    timezone: 'America/Havana', title: 'x'.repeat(121),
  }), (error) => error.code === 'invalid_title');
  assert.throws(() => campaigns.parseSavePayload({
    audience_config: {}, audience_type: 'all_active', body: 'Mensaje', target_type: 'home',
    timezone: 'America/New_York', title: 'Campaña',
  }), (error) => error.code === 'timezone_mismatch');
  assert.equal(campaigns.CAMPAIGN_TIMEZONE, 'America/Havana');
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
  assert.deepEqual(campaigns.parseCampaignIdsPayload({
    campaign_ids: ['deletecamp00001', 'deletecamp00002'],
  }), { campaignIds: ['deletecamp00001', 'deletecamp00002'] });
  assert.equal(campaigns.parseCampaignIdsPayload({ campaign_ids: [] }), null);
  assert.equal(campaigns.parseCampaignIdsPayload({ campaign_ids: ['deletecamp00001', 'deletecamp00001'] }), null);
  assert.equal(campaigns.parseCampaignIdsPayload({
    campaign_ids: Array.from({ length: 51 }, (_, index) => `bulk${String(index).padStart(11, '0')}`),
  }), null);
  assert.equal(campaigns.parseCampaignIdsPayload({ campaign_ids: ['deletecamp00001'], store_id: STORE_A }), null);
});

test('calendario IANA usa el formato estable del runtime PocketBase', () => {
  const previousDateTime = global.DateTime;
  const previousTimezone = global.Timezone;
  const previousIntl = global.Intl;
  global.Timezone = class MockTimezone {
    constructor(name) { this.name = name; }
    string() { return this.name === 'Not/A_Real_Zone' ? 'UTC' : this.name; }
  };
  global.DateTime = class MockDateTime {
    constructor(value) { this.value = new Date(value); }
    time() {
      return {
        in: (zone) => ({
          date: () => {
            const month = this.value.getUTCMonth() + 1;
            const offsetHours = zone.name === 'America/New_York' && month >= 3 && month <= 10
              ? -4
              : (zone.name === 'America/New_York' ? -5 : 0);
            const local = new Date(this.value.getTime() + (offsetHours * 60 * 60 * 1000));
            return [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
          },
        }),
      };
    }
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
    if (previousTimezone === undefined) delete global.Timezone;
    else global.Timezone = previousTimezone;
    global.Intl = previousIntl;
  }
});

test('calendario Havana no cambia en medianoche UTC y tolera runtime sin tzdata', () => {
  const previousDateTime = global.DateTime;
  const previousTimezone = global.Timezone;
  const previousIntl = global.Intl;
  global.Timezone = class MissingTimezone {
    string() { return 'UTC'; }
  };
  global.DateTime = class UnexpectedDateTime {
    constructor() { throw new Error('timezone_data_unavailable'); }
  };
  global.Intl = undefined;
  try {
    assert.deepEqual(
      campaigns.calendarKeys(new Date('2026-08-16T03:59:59.999Z'), 'America/Havana'),
      { day: '2026-08-15', month: '2026-08' },
    );
    assert.deepEqual(
      campaigns.calendarKeys(new Date('2026-08-16T04:00:00.000Z'), 'America/Havana'),
      { day: '2026-08-16', month: '2026-08' },
    );
    assert.deepEqual(
      campaigns.calendarKeys(new Date('2026-01-16T04:59:59.999Z'), 'America/Havana'),
      { day: '2026-01-15', month: '2026-01' },
    );
    assert.deepEqual(
      campaigns.calendarKeys(new Date('2026-01-16T05:00:00.000Z'), 'America/Havana'),
      { day: '2026-01-16', month: '2026-01' },
    );
  } finally {
    if (previousDateTime === undefined) delete global.DateTime;
    else global.DateTime = previousDateTime;
    if (previousTimezone === undefined) delete global.Timezone;
    else global.Timezone = previousTimezone;
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

test('destinos del editor muestran solo registros activos de la tienda y cupones por código', () => {
  const app = createApp();
  const context = campaigns.loadCampaignAccessContext(app, { id: USER_A }, '');
  const now = new Date('2026-08-15T16:00:00.000Z');
  app.add(record('categories', 'category0000001', {
    store: STORE_A, name: 'Proteínas', slug: 'proteinas', active: true,
  }));
  app.add(record('categories', 'category0000002', {
    store: STORE_A, name: 'Oculta', slug: 'oculta', active: false,
  }));
  app.add(record('categories', 'category0000003', {
    store: STORE_B, name: 'Otra tienda', slug: 'otra-tienda', active: true,
  }));
  app.add(record('products', 'product00000001', {
    store: STORE_A, name: 'Creatina', slug: 'creatina', internal_ref: 'SKU-01', active: true,
  }));
  app.add(record('products', 'product00000002', {
    store: STORE_A, name: 'Producto oculto', slug: 'oculto', active: false,
  }));
  app.add(record('raffles', 'raffle000000001', {
    store: STORE_A, title: 'Rifa agosto', slug: 'rifa-agosto', status: 'active',
    is_configured: true, link_enabled: true, selection_manually_closed: false,
    starts_at: '2026-08-14T16:00:00.000Z', closes_at: '2026-08-20T16:00:00.000Z',
    draw_at: '2026-08-21T16:00:00.000Z',
  }));
  app.add(record('raffles', 'raffle000000002', {
    store: STORE_A, title: 'Rifa cerrada', slug: 'rifa-cerrada', status: 'selection_closed',
    is_configured: true, link_enabled: true, closes_at: '2026-08-14T16:00:00.000Z',
  }));
  app.add(record('manual_coupons', 'coupon000000001', {
    store: STORE_A, code: 'verano20', active: true,
    starts_at: '2026-08-01T00:00:00.000Z', ends_at: '2026-08-31T23:59:59.000Z',
  }));
  app.add(record('manual_coupons', 'coupon000000002', {
    store: STORE_A, code: 'VENCIDO', active: true, ends_at: '2026-08-14T23:59:59.000Z',
  }));

  assert.deepEqual(campaigns.listTargetOptions(app, context, now), {
    categories: [{ id: 'category0000001', label: 'Proteínas' }],
    products: [{ id: 'product00000001', label: 'Creatina', detail: 'SKU-01' }],
    raffles: [{
      id: 'raffle000000001', label: 'Rifa agosto', detail: '2026-08-20T16:00:00.000Z',
    }],
    coupons: [{ id: 'coupon000000001', code: 'VERANO20' }],
  });
  assert.throws(
    () => campaigns.resolveTarget(
      app, context.store, 'raffle', 'raffle000000002', '', {}, now,
    ),
    (error) => error.code === 'target_unavailable',
  );
});

test('listado devuelve diez campañas por página e informa si existe la siguiente', () => {
  const app = createApp();
  for (let index = 1; index <= 21; index += 1) {
    app.add(campaign(`campaign${String(index).padStart(7, '0')}`));
  }
  const listPage = (page) => campaigns.handleList({
    app,
    requestInfo() {
      return {
        auth: app.findRecordById('users', USER_A),
        headers: {},
        query: new URLSearchParams({ page: String(page) }),
      };
    },
    response: { header: () => new Map() },
    json: (status, body) => ({ status, body }),
  });

  const first = listPage(1);
  const second = listPage(2);
  const last = listPage(3);
  assert.equal(first.status, 200);
  assert.equal(first.body.per_page, 10);
  assert.deepEqual(first.body.quota, {
    timezone: 'America/Havana',
    daily: { limit: 10, used: 0, remaining: 10 },
    monthly: { limit: 310, used: 0, remaining: 310 },
  });
  assert.equal(first.body.campaigns.length, 10);
  assert.equal(first.body.total_items, 21);
  assert.equal(first.body.total_pages, 3);
  assert.equal(first.body.has_more, true);
  assert.equal(second.body.campaigns.length, 10);
  assert.equal(second.body.has_more, true);
  assert.equal(last.body.campaigns.length, 1);
  assert.equal(last.body.has_more, false);

  app.delete(app.findRecordById('push_campaigns', 'campaign0000021'));
  const exactLast = listPage(2);
  assert.equal(exactLast.body.campaigns.length, 10);
  assert.equal(exactLast.body.total_items, 20);
  assert.equal(exactLast.body.total_pages, 2);
  assert.equal(exactLast.body.has_more, false);
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

test('una instalación activa sin FID entra en la cola nativa sin depender de Firebase', () => {
  const app = createApp();
  const config = app.add(appConfig('appconfig000001', STORE_A));
  app.add(installation('install00000001', STORE_A, config.id, { fid: '' }));
  const item = app.add(campaign());

  assert.equal(campaigns.eligibleInstallations(app, item, new Date('2026-08-13T14:00:00.000Z')).length, 1);
  assert.equal(campaigns.materializeAudience(app, item, new Date('2026-08-13T14:00:00.000Z')), 1);
  const queued = app.rows('push_campaign_deliveries')[0];
  assert.equal(queued.getString('status'), 'accepted');
  assert.equal(queued.getString('fcm_status'), 'not_attempted');
  assert.equal(queued.getString('native_status'), 'pending');
  assert.ok(queued.getString('delivery_expires_at'));
});

test('el aviso realtime usa canales seudónimos y su caída no afecta la cola', () => {
  const app = createApp();
  const config = app.add(appConfig('appconfig000001', STORE_A));
  app.add(installation('install00000001', STORE_A, config.id, { fid: '' }));
  const item = app.add(campaign());
  campaigns.materializeAudience(app, item, new Date('2026-08-13T14:00:00.000Z'));
  const sent = [];
  const secret = 'realtime-wake-secret-abcdefghijklmnopqrstuvwxyz';
  const ticketSecret = 'realtime-ticket-secret-abcdefghijklmnopqrstuvwxyz';
  const options = {
    realtimeConfig: { url: 'http://realtime:8081/internal/wakeup', secret, ticketSecret },
    randomNonce: () => '018f54de-6c37-4f2c-8d5a-0123456789ab',
    security: {
      hs256(value, key) {
        return crypto.createHmac('sha256', key).update(value).digest('hex');
      },
      randomStringWithAlphabet(length) { return 'a'.repeat(length); },
    },
    realtimeSend(request) {
      sent.push(request);
      return { statusCode: 200, json: { ok: true, matched: 1, sent: 1 } };
    },
  };
  const result = campaigns.wakeRealtimeCampaign(
    app,
    item.id,
    new Date('2026-08-13T14:00:00.000Z'),
    options,
  );
  assert.deepEqual(result, { batches: 1, requested: 1, failed: 0, skipped: false });
  assert.equal(sent.length, 1);
  const channelId = crypto.createHmac('sha256', ticketSecret)
    .update('pz_storefront_realtime_channel:v1|install00000001')
    .digest('hex');
  assert.deepEqual(JSON.parse(sent[0].body), {
    version: 1,
    type: 'sync_required',
    campaign_id: item.id,
    channel_ids: [channelId],
  });
  assert.equal(sent[0].body.includes('install00000001'), false);
  assert.equal(sent[0].body.includes('Oferta del dia'), false);
  const timestamp = sent[0].headers['x-pz-realtime-timestamp'];
  const nonce = sent[0].headers['x-pz-realtime-nonce'];
  assert.equal(
    sent[0].headers['x-pz-realtime-signature'],
    crypto.createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${sent[0].body}`).digest('hex'),
  );

  const failed = campaigns.wakeRealtimeCampaign(app, item.id, new Date('2026-08-13T14:00:00.000Z'), {
    ...options,
    realtimeSend() { throw new Error('gateway_down'); },
  });
  assert.equal(failed.failed, 1);
  assert.equal(app.rows('push_campaign_deliveries').length, 1);
  assert.equal(app.rows('push_campaign_deliveries')[0].getString('native_status'), 'pending');
});

test('previsualiza una audiencia nueva sin crear ni guardar una campaña', () => {
  const app = createApp();
  const configA = app.add(appConfig('appconfig000001', STORE_A));
  app.add(installation('install00000001', STORE_A, configA.id));
  const context = campaigns.loadCampaignAccessContext(app, { id: USER_A }, '');
  const payload = campaigns.parseAudiencePreviewPayload({
    audience_type: 'all_active', audience_config: {}, target_type: 'home',
  });
  assert.deepEqual(payload, {
    audienceType: 'all_active', audienceConfig: {}, targetType: 'home',
  });
  assert.deepEqual(
    campaigns.previewAudienceDefinition(app, context, payload, new Date('2026-08-13T14:00:00.000Z')),
    { count: 1, snapshot: false },
  );
  assert.equal(app.rows('push_campaigns').length, 0);
  assert.equal(campaigns.parseAudiencePreviewPayload({
    audience_type: 'all_active', audience_config: {}, target_type: 'home', store_id: STORE_B,
  }), null);
});

test('las cinco secciones se validan y duplican sin tratar el enum como relación', () => {
  const app = createApp();
  app.add(appConfig('appconfig000001', STORE_A));
  const now = new Date('2026-08-14T16:30:00.000Z');
  const sections = {
    search: '/buscar',
    links: '/links',
    gifts: '/regalos',
    raffles: '/rifa',
    checkout: '/checkout',
  };

  let source = null;
  Object.entries(sections).forEach(([section, suffix], index) => {
    const item = app.add(campaign(`sectioncamp${String(index).padStart(4, '0')}`, {
      target_type: 'section',
      target_section: section,
      target_path: '',
    }));
    const validated = campaigns.validateCampaignForExecution(app, item, now, now);
    assert.equal(validated.target.target_section, section);
    assert.equal(validated.target.target_path, `/t/powerzona${suffix}`);
    assert.equal(item.getString('target_path'), `/t/powerzona${suffix}`);
    if (section === 'search') source = item;
  });

  const context = campaigns.loadCampaignAccessContext(app, { id: USER_A }, '');
  const duplicate = campaigns.duplicateCampaign(app, context, source.id, now);
  assert.equal(duplicate.getString('status'), 'draft');
  assert.equal(duplicate.getString('target_type'), 'section');
  assert.equal(duplicate.getString('target_section'), 'search');
  assert.equal(duplicate.getString('target_path'), '/t/powerzona/buscar');
});

test('cuotas diarias/mensuales usan el calendario IANA de la tienda', () => {
  assert.equal(campaigns.DAILY_CAMPAIGN_LIMIT, 10);
  assert.equal(campaigns.MONTHLY_CAMPAIGN_LIMIT, 310);
  const app = createApp();
  const item = app.add(campaign());
  for (let index = 0; index < campaigns.DAILY_CAMPAIGN_LIMIT; index += 1) {
    app.add(campaign(`sentcamp${String(index).padStart(7, '0')}`, {
      status: 'sent', started_at: `2026-08-13T1${index}:00:00.000Z`,
    }));
  }
  assert.deepEqual(campaigns.campaignQuotaUsage(app, STORE_A, new Date('2026-08-13T20:00:00.000Z')), {
    timezone: 'America/Havana',
    daily: { limit: 10, used: 10, remaining: 0 },
    monthly: { limit: 310, used: 10, remaining: 300 },
  });
  assert.throws(
    () => campaigns.assertCampaignQuota(app, item, new Date('2026-08-13T20:00:00.000Z')),
    (error) => error.code === 'daily_quota_exceeded',
  );
});

test('cuota diaria de Havana solo reinicia a medianoche local', () => {
  const app = createApp();
  app.add(campaign('boundarycamp001', {
    status: 'sent', started_at: '2026-08-15T23:30:00.000Z',
  }));
  app.add(campaign('boundarycamp002', {
    status: 'sent', started_at: '2026-08-16T02:15:00.000Z',
  }));

  assert.deepEqual(campaigns.campaignQuotaUsage(app, STORE_A, new Date('2026-08-16T02:30:00.000Z')), {
    timezone: 'America/Havana',
    daily: { limit: 10, used: 2, remaining: 8 },
    monthly: { limit: 310, used: 2, remaining: 308 },
  });
  assert.deepEqual(campaigns.campaignQuotaUsage(app, STORE_A, new Date('2026-08-16T04:00:00.000Z')), {
    timezone: 'America/Havana',
    daily: { limit: 10, used: 0, remaining: 10 },
    monthly: { limit: 310, used: 2, remaining: 308 },
  });
});

test('la cuota diaria sobrevive al borrado del contenido de las campañas', () => {
  const app = createApp();
  const starts = {};
  for (let index = 0; index < campaigns.DAILY_CAMPAIGN_LIMIT; index += 1) {
    starts[`quota${String(index).padStart(10, '0')}`] = `2026-08-13T1${index}:00:00.000Z`;
  }
  app.rows('stores')[0].set('push_campaign_quota_state', {
    timezone: 'America/New_York',
    starts,
  });
  const item = app.add(campaign());
  assert.throws(
    () => campaigns.assertCampaignQuota(app, item, new Date('2026-08-13T20:00:00.000Z')),
    (error) => error.code === 'daily_quota_exceeded',
  );
  assert.equal(app.rows('push_campaigns').length, 1);
  assert.equal(campaigns.campaignQuotaState(app.rows('stores')[0]).timezone, 'America/Havana');
});

test('la migración normaliza campañas y cuota a Havana sin perder marcadores', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../pb_migrations/1786665700_push_campaign_havana_timezone.js',
  );
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up = null;
  let down = null;
  vm.runInNewContext(source, {
    migrate(upCallback, downCallback) { up = upCallback; down = downCallback; },
  }, { filename: migrationPath });

  const app = createApp();
  const legacy = app.add(campaign('legacycamp00001', {
    timezone: 'America/New_York',
    status: 'sent',
    started_at: '2026-08-13T14:00:00.000Z',
  }));
  const starts = { [legacy.id]: '2026-08-13T14:00:00.000Z' };
  app.rows('stores')[0].set('push_campaign_quota_state', {
    timezone: 'America/New_York', starts,
  });

  up(app);
  up(app);
  assert.equal(legacy.getString('timezone'), 'America/Havana');
  assert.deepEqual(JSON.parse(JSON.stringify(app.rows('stores')[0].get('push_campaign_quota_state'))), {
    timezone: 'America/Havana', starts,
  });
  assert.equal(down(app), app);
  assert.equal(legacy.getString('timezone'), 'America/Havana');
});

test('retención redacta contenido a siete días, conserva evidencia técnica y preserva campañas activas', () => {
  assert.equal(campaigns.CAMPAIGN_RETENTION_DAYS, 7);
  const app = createApp();
  const expired = app.add(campaign('expiredcamp0001', {
    status: 'sent',
    started_at: '2026-08-03T14:00:00.000Z',
    completed_at: '2026-08-04T14:00:00.000Z',
    delete_after: '2026-08-11T14:00:00.000Z',
  }));
  app.add(record('push_campaign_deliveries', 'delivery0000001', {
    store: STORE_A, campaign: expired.id, status: 'accepted', delete_after: '2027-01-01T00:00:00.000Z',
  }));
  app.add(record('push_events', 'event0000000001', {
    store: STORE_A, campaign: expired.id, delivery: 'delivery0000001', event_type: 'opened',
  }));
  app.add(campaign('scheduledcamp01', {
    status: 'scheduled', scheduled_at: '2026-08-20T14:00:00.000Z', delete_after: '2026-08-01T00:00:00.000Z',
  }));
  app.add(campaign('processingcamp1', {
    status: 'processing', started_at: '2026-08-01T00:00:00.000Z', delete_after: '2026-08-01T00:00:00.000Z',
  }));
  app.add(campaign('pausedplancamp1', {
    status: 'paused_plan', scheduled_at: '2026-08-05T00:00:00.000Z', delete_after: '2026-08-01T00:00:00.000Z',
  }));

  const summary = campaigns.cleanupExpiredCampaigns(app, new Date('2026-08-14T14:00:00.000Z'));
  assert.deepEqual(summary, { redacted: 1, deleted: 0, deliveries: 0, events: 0, daily_stats: 0, failed: 0 });
  assert.equal(expired.getString('title'), 'Contenido eliminado');
  assert.equal(Boolean(expired.getString('redacted_at')), true);
  assert.equal(expired.getString('delete_after'), '2026-11-02T14:00:00.000Z');
  assert.deepEqual(app.rows('push_campaigns').map((item) => item.id).sort(), [
    'expiredcamp0001', 'pausedplancamp1', 'processingcamp1', 'scheduledcamp01',
  ]);
  assert.equal(app.rows('push_campaign_deliveries').length, 1);
  assert.equal(app.rows('push_events').length, 1);
  const quota = campaigns.campaignQuotaState(app.rows('stores')[0]);
  assert.equal(quota.timezone, 'America/Havana');
  assert.equal(quota.starts[expired.id], '2026-08-03T14:00:00.000Z');
});

test('borrado manual redacta contenido, conserva evidencia y bloquea procesamiento u otra tienda', () => {
  assert.equal(campaigns.DELETE_CAMPAIGN_LIMIT, 50);
  const app = createApp();
  const context = campaigns.loadCampaignAccessContext(app, { id: USER_A }, '');
  const sent = app.add(campaign('deletecamp00001', {
    status: 'sent',
    started_at: '2026-08-14T14:00:00.000Z',
    completed_at: '2026-08-14T14:05:00.000Z',
  }));
  const draft = app.add(campaign('deletecamp00002'));
  app.add(record('push_campaign_deliveries', 'delivery0000001', {
    store: STORE_A, campaign: sent.id, status: 'accepted',
  }));
  app.add(record('push_events', 'event0000000001', {
    store: STORE_A, campaign: sent.id, delivery: 'delivery0000001', event_type: 'opened',
  }));

  const summary = campaigns.deleteCampaignsPermanently(
    app,
    context,
    [sent.id, draft.id],
    new Date('2026-08-14T16:00:00.000Z'),
  );
  assert.deepEqual(summary, {
    deleted_ids: [sent.id, draft.id],
    deleted_count: 2,
    redacted_count: 2,
    deliveries_deleted: 0,
    events_deleted: 0,
  });
  assert.equal(app.rows('push_campaigns').length, 2);
  assert.equal(app.rows('push_campaigns').every((item) => Boolean(item.getString('redacted_at'))), true);
  assert.equal(app.rows('push_campaign_deliveries').length, 1);
  assert.equal(app.rows('push_events').length, 1);
  assert.equal(campaigns.campaignQuotaState(app.rows('stores')[0]).starts[sent.id], sent.getString('started_at'));

  const processing = app.add(campaign('processcamp0001', { status: 'processing' }));
  assert.throws(
    () => campaigns.deleteCampaignsPermanently(app, context, [processing.id], new Date()),
    (error) => error.code === 'campaign_not_deletable',
  );
  const local = app.add(campaign('deletecamp00003'));
  const foreign = app.add(campaign('foreigncamp0001', { store: STORE_B }));
  assert.throws(
    () => campaigns.deleteCampaignsPermanently(app, context, [local.id, foreign.id], new Date()),
    (error) => error.code === 'campaign_not_found',
  );
  assert.equal(app.rows('push_campaigns').some((item) => item.id === local.id), true);
});

test('la limpieza tecnica falla cerrada si no puede comprobar los hijos de una campana', () => {
  const app = createApp();
  const retained = app.add(campaign('retainedcamp001', {
    status: 'sent',
    redacted_at: '2026-05-01T00:00:00.000Z',
    delete_after: '2026-08-01T00:00:00.000Z',
  }));
  const originalFind = app.findRecordsByFilter.bind(app);
  app.findRecordsByFilter = (collection, ...args) => {
    if (collection === 'push_events') throw new Error('database_unavailable');
    return originalFind(collection, ...args);
  };

  const summary = campaigns.cleanupExpiredCampaigns(app, new Date('2026-08-15T00:00:00.000Z'));
  assert.equal(summary.failed, 1);
  assert.equal(summary.deleted, 0);
  assert.equal(app.rows('push_campaigns').includes(retained), true);
});

test('borradores y estados terminales vencen en siete días; activos no tienen caducidad', () => {
  const app = createApp();
  app.add(appConfig('appconfig000001', STORE_A));
  const context = campaigns.loadCampaignAccessContext(app, { id: USER_A }, '');
  const now = new Date('2026-08-14T16:30:00.000Z');
  const draft = campaigns.createOrUpdateDraft(app, context, {
    campaignId: '', mediaId: '', targetRef: '', title: 'Retención', body: 'Siete días',
    timezone: 'America/Havana', audienceType: 'all_active', audienceConfig: {},
    targetType: 'home', targetSection: '',
  }, now);
  assert.equal(draft.getString('delete_after'), '2026-08-21T16:30:00.000Z');
  campaigns.scheduleCampaign(app, context, {
    campaignId: draft.id, mode: 'scheduled', scheduledAt: new Date('2026-08-15T16:30:00.000Z'),
  }, now, { config: { endpoint: 'https://relay.invalid' } });
  assert.equal(draft.getString('delete_after'), '');
  campaigns.cancelCampaign(app, context, draft.id, now);
  assert.equal(draft.getString('delete_after'), '2026-08-21T16:30:00.000Z');
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

test('rutas exponen solo C05, crons acotados y mantienen relay administrativo v1 separado', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_storefront_campaigns.pb.js'), 'utf8');
  const relayV1 = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_store_push_dispatch.pb.js'), 'utf8');
  assert.match(routes, /\/api\/pz\/storefront\/v1\/campaigns/);
  assert.match(routes, /audience-preview/);
  assert.match(routes, /campaigns\/targets/);
  assert.match(routes, /\.handleSave\(e\)/);
  assert.match(routes, /\.handleAudiencePreview\(e\)/);
  assert.match(routes, /\.handleTargets\(e\)/);
  assert.match(routes, /\.handleSchedule\(e\)/);
  assert.match(routes, /\.handleCancel\(e\)/);
  assert.match(routes, /\.handleDuplicate\(e\)/);
  assert.match(routes, /campaigns\/delete/);
  assert.match(routes, /\.handleDelete\(e\)/);
  assert.doesNotMatch(routes, /\[handler\]\(e\)/);
  assert.match(routes, /cronAdd\([\s\S]*pz_storefront_push_campaigns[\s\S]*"\* \* \* \* \*"/);
  assert.match(routes, /pz_storefront_push_campaign_cleanup[\s\S]*"\*\/5 \* \* \* \*"/);
  assert.match(routes, /cleanupExpiredCampaigns/);
  assert.match(relayV1, /continueNotificationCreated/);
  assert.doesNotMatch(routes, /continueNotificationCreated|store_notifications/);
});
