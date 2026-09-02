'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const capabilities = require('../pb_hooks/pz_store_capabilities_lib.js');
const enforcement = require('../pb_hooks/pz_store_permission_enforcement_lib.js');
const permissions = require('../pb_hooks/pz_store_team_permissions_lib.js');

const NOW = new Date('2026-08-11T20:00:00.000Z');
const STORE_ID = 'storepush000001';
const USER_ID = 'userpush0000001';

function store(plan, overrides = {}) {
  return {
    id: STORE_ID,
    status: 'active',
    primary_admin_user: '',
    plan,
    plan_started_at: '2026-08-01T00:00:00.000Z',
    plan_expires_at: '2026-09-01T00:00:00.000Z',
    plan_is_permanent: false,
    ...overrides,
  };
}

function fixture(plan, assigned = ['marketing.push.manage'], overrides = {}) {
  const tenant = store(plan, { plan_is_permanent: true, plan_expires_at: '', ...overrides });
  const user = { id: USER_ID, role: 'store_staff', status: 'active', store: STORE_ID };
  const access = { store: STORE_ID, user: USER_ID, template_code: 'custom', permissions_json: assigned };
  return {
    tenant,
    user,
    app: {
      findRecordById(collection, id) {
        if (collection === 'stores' && id === STORE_ID) return tenant;
        if (collection === 'users' && id === USER_ID) return user;
        throw new Error('not_found');
      },
      findFirstRecordByFilter() { return access; },
    },
  };
}

test('push_campaigns_enabled existe solo en Premium activo o permanente', () => {
  assert.equal(capabilities.hasStoreCapability(store('free'), 'push_campaigns_enabled', { now: NOW }), false);
  assert.equal(capabilities.hasStoreCapability(store('basic'), 'push_campaigns_enabled', { now: NOW }), false);
  assert.equal(capabilities.hasStoreCapability(store('premium'), 'push_campaigns_enabled', { now: NOW }), true);
  assert.equal(capabilities.hasStoreCapability(store('premium', {
    plan_expires_at: '2026-08-10T00:00:00.000Z',
  }), 'push_campaigns_enabled', { now: NOW, enforceExpiration: true }), false);
  assert.equal(capabilities.hasStoreCapability(store('premium', {
    plan_is_permanent: true, plan_expires_at: '',
  }), 'push_campaigns_enabled', { now: NOW, enforceExpiration: true }), true);
});

test('marketing.push.manage exige simultáneamente permiso y capability Premium', () => {
  const premium = fixture('premium');
  assert.equal(permissions.hasStorePermission(
    premium.app, premium.user, premium.tenant, 'marketing.push.manage', { now: NOW },
  ), true);

  const noPermission = fixture('premium', []);
  assert.equal(permissions.hasStorePermission(
    noPermission.app, noPermission.user, noPermission.tenant, 'marketing.push.manage', { now: NOW },
  ), false);

  const basic = fixture('basic');
  assert.equal(permissions.hasStorePermission(
    basic.app, basic.user, basic.tenant, 'marketing.push.manage', { now: NOW },
  ), false);
});

test('las colecciones privadas permanecen cerradas al CRUD incluso para usuarios de tienda', () => {
  assert.deepEqual(enforcement.STOREFRONT_PUSH_PRIVATE_COLLECTIONS, [
    'storefront_app_configs',
    'storefront_installations',
    'storefront_installation_diagnostics',
    'storefront_app_download_events',
    'storefront_web_sessions',
    'storefront_order_links',
    'storefront_installation_coupons',
    'push_media',
    'push_campaigns',
    'push_campaign_deliveries',
    'push_events',
    'push_daily_stats',
  ]);
  for (const collection of enforcement.STOREFRONT_PUSH_PRIVATE_COLLECTIONS) {
    const event = {
      auth: { id: USER_ID, role: 'store_staff', store: STORE_ID },
      requestInfo() { return { auth: this.auth, query: {} }; },
      next() { throw new Error('no_debe_continuar'); },
    };
    assert.throws(
      () => enforcement.enforceRead(event, collection),
      (error) => error.code === 'permission_denied' && error.permission === 'marketing.push.manage',
      collection,
    );
    assert.throws(
      () => enforcement.enforceMutation(event, collection, 'create'),
      (error) => error.code === 'permission_denied' && error.permission === 'marketing.push.manage',
      collection,
    );
  }

  const hookSource = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_store_permission_enforcement.pb.js'),
    'utf8',
  );
  for (const collection of enforcement.STOREFRONT_PUSH_PRIVATE_COLLECTIONS) {
    assert.equal(hookSource.split(`"${collection}"`).length - 1, 6, `${collection} debe cubrir list/view/enrich/create/update/delete`);
  }
});

test('la migración incorpora el permiso solo a plantillas operativas previstas y revierte', () => {
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1786579300_storefront_push_permission.js');
  const source = fs.readFileSync(migrationPath, 'utf8');
  let forward;
  let rollback;
  vm.runInNewContext(source, {
    Error,
    JSON,
    migrate(up, down) { forward = up; rollback = down; },
  }, { filename: migrationPath });

  const records = [
    { template_code: 'secondary_admin', permissions_json: ['catalog.view'] },
    { template_code: 'marketing_promotions', permissions_json: ['promotions.manage'] },
    { template_code: 'read_only', permissions_json: ['analytics.view'] },
    { template_code: 'custom', permissions_json: ['orders.view'] },
  ].map((values) => ({
    values,
    get(key) { return this.values[key]; },
    set(key, value) { this.values[key] = value; },
  }));
  const app = {
    findCollectionByNameOrId() { return { name: 'store_user_access' }; },
    findRecordsByFilter(_collection, _filter, _sort, _limit, offset) { return offset ? [] : records; },
    save() {},
  };

  forward(app);
  assert.equal(records[0].values.permissions_json.includes('marketing.push.manage'), true);
  assert.equal(records[1].values.permissions_json.includes('marketing.push.manage'), true);
  assert.equal(records[2].values.permissions_json.includes('marketing.push.manage'), false);
  assert.equal(records[3].values.permissions_json.includes('marketing.push.manage'), false);
  rollback(app);
  assert.equal(records.every((record) => !record.values.permissions_json.includes('marketing.push.manage')), true);
});
