'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../pb_migrations/1784595900_m7u2_c3_permission_normalization.js',
);
const MIGRATION_SOURCE = fs.readFileSync(MIGRATION_PATH, 'utf8');

const MARKETING = [
  'promotions.manage',
  'coupons.manage',
  'gifts.manage',
  'raffles.manage',
  'landing_qr.manage',
  'analytics.view',
];
const READ_ONLY = ['catalog.view', 'orders.view', 'analytics.view'];
const LEGACY_MARKETING = [
  'catalog.view',
  'orders.view',
  'promotions.manage',
  'coupons.manage',
  'gifts.manage',
  'raffles.manage',
  'analytics.view',
  'landing_qr.manage',
];
const LEGACY_READ_ONLY = [
  'catalog.view',
  'orders.view',
  'notifications.view',
  'analytics.view',
  'security.view',
];
const CUSTOM = ['catalog.view', 'catalog.products.stock', 'security.view'];

const STORE_ID = 'c3store00000001';
const USERS = Object.freeze({
  marketing: 'c3market0000001',
  readOnly: 'c3readonly00001',
  custom: 'c3custom0000001',
  correctMarketing: 'c3mktok00000001',
  correctReadOnly: 'c3readok0000001',
  reorderedMarketing: 'c3mktrev0000001',
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

class FakeFields {
  constructor(fields = []) {
    this.items = fields.map((field) => ({ ...field }));
  }

  getByName(name) {
    const field = this.items.find((item) => item.name === name);
    if (!field) throw new Error(`field_not_found:${name}`);
    return field;
  }
}

class FakeCollection {
  constructor(name, fields = []) {
    this.id = `${name}_collection`;
    this.name = name;
    this.fields = new FakeFields(fields);
  }
}

class FakeRecord {
  constructor(collection, values = {}) {
    this._collection = collection;
    Object.assign(this, values);
  }

  get(key) {
    return this[key];
  }

  getString(key) {
    return String(this[key] || '');
  }

  getStringSlice(key) {
    return Array.isArray(this[key]) ? this[key].map((item) => String(item)) : [];
  }

  set(key, value) {
    this[key] = value;
  }
}

class FakeUser extends FakeRecord {
  constructor(id, values) {
    super(null, { id, ...values });
    this.rotations = 0;
  }

  refreshTokenKey() {
    this.rotations += 1;
    this.tokenKeyRevision = `revision-${this.rotations}`;
  }
}

function access(id, user, templateCode, permissions) {
  return new FakeRecord(null, {
    id,
    store: STORE_ID,
    user,
    template_code: templateCode,
    permissions_json: permissions.slice(),
  });
}

function fixture() {
  const collections = new Map([
    ['stores', new FakeCollection('stores')],
    ['users', new FakeCollection('users')],
    ['store_user_access', new FakeCollection('store_user_access')],
    ['store_user_audit', new FakeCollection('store_user_audit', [{
      id: 'select1783386511',
      name: 'action',
      type: 'select',
      values: ['user_created', 'team_permissions_changed'],
    }])],
    ['store_activity_audit', new FakeCollection('store_activity_audit')],
  ]);
  const store = new FakeRecord(null, {
    id: STORE_ID,
    name: 'Tienda efimera M7U2-C3',
    slug: 'm7u2-c3-fixture',
  });
  const users = new Map(Object.entries(USERS).map(([label, id]) => [
    id,
    new FakeUser(id, {
      display_name: `Usuario ${label}`,
      email: `${label.toLowerCase()}@example.test`,
      store: STORE_ID,
      role: 'store_staff',
      status: 'active',
    }),
  ]));
  const rows = [
    access('c3accessmkt0001', USERS.marketing, 'marketing_promotions', LEGACY_MARKETING),
    access('c3accessread001', USERS.readOnly, 'read_only', LEGACY_READ_ONLY),
    access('c3accesscust001', USERS.custom, 'custom', CUSTOM),
    access('c3accessmktok01', USERS.correctMarketing, 'marketing_promotions', MARKETING),
    access('c3accessrdok001', USERS.correctReadOnly, 'read_only', READ_ONLY),
    access('c3accessrev0001', USERS.reorderedMarketing, 'marketing_promotions', MARKETING.slice().reverse()),
  ];
  const specialized = [];
  const central = [];
  const saveCounts = new Map();
  let generatedId = 0;

  const app = {
    findCollectionByNameOrId(name) {
      const collection = collections.get(name);
      if (!collection) throw new Error(`collection_not_found:${name}`);
      return collection;
    },
    findRecordsByFilter(collection, _filter, _sort, limit, offset) {
      if (collection !== 'store_user_access') return [];
      return rows.slice(offset, offset + limit);
    },
    findRecordById(collection, id) {
      if (collection === 'stores' && id === STORE_ID) return store;
      if (collection === 'users' && users.has(id)) return users.get(id);
      throw new Error(`record_not_found:${collection}:${id}`);
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection !== 'store_activity_audit') throw new Error('record_not_found');
      const found = central.find((item) => (
        item.store === params.store && item.source_event_key === params.source
      ));
      if (!found) throw new Error('record_not_found');
      return found;
    },
    save(value) {
      if (value instanceof FakeCollection) {
        collections.set(value.name, value);
        return value;
      }
      saveCounts.set(value.id, (saveCounts.get(value.id) || 0) + 1);
      if (value instanceof FakeRecord && value._collection) {
        if (!value.id) value.id = `generated${String(++generatedId).padStart(6, '0')}`;
        if (value._collection.name === 'store_user_audit' && !specialized.includes(value)) {
          specialized.push(value);
        }
        if (value._collection.name === 'store_activity_audit' && !central.includes(value)) {
          central.push(value);
        }
      }
      return value;
    },
  };
  return { app, central, collections, rows, saveCounts, specialized, store, users };
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(MIGRATION_SOURCE, {
    Record: FakeRecord,
    migrate(upFn, downFn) {
      up = upFn;
      down = downFn;
    },
  }, { filename: MIGRATION_PATH });
  assert.equal(typeof up, 'function');
  assert.equal(typeof down, 'function');
  return { up, down };
}

test('M7U2-C3 normaliza solo plantillas reservadas, rota token y conserva custom/correctas', () => {
  const migration = loadMigration();
  const data = fixture();
  const customReference = data.rows[2].permissions_json;
  const correctMarketingReference = data.rows[3].permissions_json;
  const correctReadOnlyReference = data.rows[4].permissions_json;
  const reorderedMarketingReference = data.rows[5].permissions_json;

  migration.up(data.app);

  assert.deepEqual(plain(data.rows[0].permissions_json), MARKETING);
  assert.deepEqual(plain(data.rows[1].permissions_json), READ_ONLY);
  assert.strictEqual(data.rows[2].permissions_json, customReference);
  assert.strictEqual(data.rows[3].permissions_json, correctMarketingReference);
  assert.strictEqual(data.rows[4].permissions_json, correctReadOnlyReference);
  assert.strictEqual(data.rows[5].permissions_json, reorderedMarketingReference);
  assert.deepEqual(plain(data.rows[2].permissions_json), CUSTOM);
  assert.deepEqual(plain(data.rows[5].permissions_json), MARKETING.slice().reverse());

  assert.equal(data.users.get(USERS.marketing).rotations, 1);
  assert.equal(data.users.get(USERS.readOnly).rotations, 1);
  assert.equal(data.users.get(USERS.custom).rotations, 0);
  assert.equal(data.users.get(USERS.correctMarketing).rotations, 0);
  assert.equal(data.users.get(USERS.correctReadOnly).rotations, 0);
  assert.equal(data.users.get(USERS.reorderedMarketing).rotations, 0);
  assert.equal(data.saveCounts.get(data.rows[0].id), 1);
  assert.equal(data.saveCounts.get(data.rows[1].id), 1);
  assert.equal(data.saveCounts.has(data.rows[2].id), false);
  assert.equal(data.saveCounts.has(data.rows[3].id), false);
  assert.equal(data.saveCounts.has(data.rows[4].id), false);
  assert.equal(data.saveCounts.has(data.rows[5].id), false);
});

test('M7U2-C3 persiste snapshot especializado y actividad central determinista por cada cambio', () => {
  const migration = loadMigration();
  const data = fixture();
  migration.up(data.app);

  assert.equal(data.specialized.length, 2);
  assert.equal(data.central.length, 2);
  const specializedByUser = new Map(data.specialized.map((item) => [item.target_user_id_snapshot, item]));
  const marketingAudit = specializedByUser.get(USERS.marketing);
  const readAudit = specializedByUser.get(USERS.readOnly);
  assert.ok(marketingAudit);
  assert.ok(readAudit);
  assert.equal(marketingAudit.action, 'team_permissions_normalized');
  assert.equal(marketingAudit.previous_template_code, 'marketing_promotions');
  assert.equal(marketingAudit.new_template_code, 'marketing_promotions');
  assert.deepEqual(plain(marketingAudit.previous_permissions_json), LEGACY_MARKETING);
  assert.deepEqual(plain(marketingAudit.new_permissions_json), MARKETING);
  assert.equal(marketingAudit.sessions_revoked, true);
  assert.deepEqual(plain(readAudit.previous_permissions_json), LEGACY_READ_ONLY);
  assert.deepEqual(plain(readAudit.new_permissions_json), READ_ONLY);
  assert.equal(readAudit.sessions_revoked, true);

  const expectedSources = [
    'migration:m7u2c3:team_permissions_normalized:c3accessmkt0001',
    'migration:m7u2c3:team_permissions_normalized:c3accessread001',
  ];
  assert.deepEqual(data.central.map((item) => item.source_event_key).sort(), expectedSources.sort());
  for (const event of data.central) {
    assert.equal(event.action, 'team_permissions_normalized');
    assert.equal(event.origin, 'migration');
    assert.equal(event.actor_role_snapshot, 'migration');
    assert.equal(event.module, 'team');
    assert.equal(event.severity, 'critical');
    assert.equal(event.resource_type, 'team_user_permissions');
    assert.deepEqual(plain(event.changed_fields_json), ['permissions_json']);
    assert.equal(event.previous_values_json.template_code, event.new_values_json.template_code);
    assert.notDeepEqual(
      plain(event.previous_values_json.permissions),
      plain(event.new_values_json.permissions),
    );
  }
  assert.equal(new Set(data.central.map((item) => item.source_event_key)).size, 2);
});

test('M7U2-C3 up es idempotente, amplía select una vez y down no reintroduce permisos', () => {
  const migration = loadMigration();
  const data = fixture();
  migration.up(data.app);
  migration.up(data.app);

  const actions = data.collections.get('store_user_audit').fields.getByName('action').values;
  assert.equal(actions.filter((value) => value === 'team_permissions_normalized').length, 1);
  assert.equal(actions.includes('user_created'), true);
  assert.equal(actions.includes('team_permissions_changed'), true);
  assert.equal(data.specialized.length, 2);
  assert.equal(data.central.length, 2);
  assert.equal(data.users.get(USERS.marketing).rotations, 1);
  assert.equal(data.users.get(USERS.readOnly).rotations, 1);

  const beforeDown = plain({
    permissions: data.rows.map((item) => item.permissions_json),
    specialized: data.specialized,
    central: data.central,
    actions,
  });
  migration.down(data.app);
  assert.deepEqual(plain({
    permissions: data.rows.map((item) => item.permissions_json),
    specialized: data.specialized,
    central: data.central,
    actions,
  }), beforeDown);
});

test('M7U2-C3 no deriva source_event_key de reloj ni incluye secretos en auditorías', () => {
  assert.doesNotMatch(MIGRATION_SOURCE, /Date\.now\(\)[\s\S]{0,160}source_event_key/);
  assert.match(MIGRATION_SOURCE, /migration:m7u2c3:team_permissions_normalized/);
  const migration = loadMigration();
  const data = fixture();
  migration.up(data.app);
  const serialized = JSON.stringify([...data.specialized, ...data.central]);
  for (const forbidden of ['tokenKeyRevision', 'password', 'cookie', 'secret']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
