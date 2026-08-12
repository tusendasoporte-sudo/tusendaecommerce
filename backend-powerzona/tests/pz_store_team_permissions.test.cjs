'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const permissions = require('../pb_hooks/pz_store_team_permissions_lib.js');

const STORE_ID = 'storeteam000001';
const OTHER_STORE_ID = 'storeteam000002';
const PRIMARY_ID = 'primaryteam0001';
const STAFF_ID = 'staffteam000001';

function planStore(plan, overrides = {}) {
  return {
    id: STORE_ID,
    status: 'active',
    primary_admin_user: PRIMARY_ID,
    plan,
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: plan === 'premium' ? '' : '2099-08-01T00:00:00.000Z',
    plan_is_permanent: plan === 'premium',
    ...overrides,
  };
}

function user(id, overrides = {}) {
  return {
    id,
    role: id === PRIMARY_ID ? 'store_admin' : 'store_staff',
    status: 'active',
    store: STORE_ID,
    ...overrides,
  };
}

function fakeApp({ store = planStore('premium'), users = [], access = [] } = {}) {
  const userMap = new Map(users.map((item) => [item.id, item]));
  const storeMap = new Map([[store.id, store]]);
  return {
    findRecordById(collection, id) {
      const value = collection === 'users' ? userMap.get(id) : storeMap.get(id);
      if (!value) throw new Error('not_found');
      return value;
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection !== 'store_user_access') throw new Error('not_found');
      const value = access.find((item) => item.store === params.store && item.user === params.user);
      if (!value) throw new Error('not_found');
      return value;
    },
  };
}

test('el catálogo contiene las 29 claves operativas y separa cinco reservadas', () => {
  assert.equal(permissions.ASSIGNABLE_PERMISSION_KEYS.length, 29);
  assert.equal(permissions.RESERVED_PERMISSIONS.length, 5);
  assert.equal(permissions.PERMISSION_KEYS.length, 34);
  assert.equal(new Set(permissions.PERMISSION_KEYS).size, permissions.PERMISSION_KEYS.length);
  assert.deepEqual(
    permissions.RESERVED_PERMISSIONS,
    [
      'team.manage',
      'plan.manage',
      'primary_admin.replace',
      'premium_downgrade.confirm',
      'global_cleanup.execute',
    ],
  );
  for (const key of permissions.PERMISSION_KEYS) {
    assert.equal(permissions.PERMISSION_CATALOG[key].key, key);
    assert.equal(typeof permissions.PERMISSION_CATALOG[key].label, 'string');
  }
});

test('normaliza duplicados, orden y dependencias transitivas sin aceptar claves inválidas', () => {
  assert.deepEqual(
    permissions.normalizePermissions([
      'security.manage',
      'catalog.products.stock',
      'catalog.products.stock',
      'orders.price_adjustment',
    ]),
    [
      'catalog.view',
      'catalog.products.stock',
      'orders.view',
      'orders.price_adjustment',
      'security.view',
      'security.manage',
    ],
  );
  assert.throws(
    () => permissions.normalizePermissions(['catalog.unknown']),
    (error) => error.code === 'invalid_permissions'
      && error.issue === 'unknown_permission'
      && error.permission === 'catalog.unknown',
  );
  assert.throws(
    () => permissions.normalizePermissions(['team.manage']),
    (error) => error.code === 'invalid_permissions'
      && error.issue === 'reserved_permission'
      && error.permission === 'team.manage',
  );
  assert.throws(
    () => permissions.normalizePermissions({ permissions: ['catalog.view'] }),
    (error) => error.issue === 'permissions_not_array',
  );
});

test('las plantillas mantienen alcance seguro y custom puede quedar vacío', () => {
  assert.deepEqual(Object.keys(permissions.PERMISSION_TEMPLATES), [
    'secondary_admin',
    'catalog_inventory',
    'orders_shipping',
    'marketing_promotions',
    'read_only',
    'custom',
  ]);
  assert.equal(permissions.resolveTemplatePermissions('secondary_admin').includes('team.manage'), false);
  assert.equal(permissions.resolveTemplatePermissions('catalog_inventory').includes('catalog.products.delete'), false);
  assert.equal(permissions.resolveTemplatePermissions('catalog_inventory').includes('catalog.products.price'), true);
  assert.equal(permissions.resolveTemplatePermissions('orders_shipping').includes('orders.price_adjustment'), false);
  assert.deepEqual(permissions.resolveTemplatePermissions('marketing_promotions'), [
    'promotions.manage',
    'coupons.manage',
    'gifts.manage',
    'raffles.manage',
    'marketing.push.manage',
    'analytics.view',
    'landing_qr.manage',
  ]);
  assert.deepEqual(permissions.resolveTemplatePermissions('read_only'), [
    'catalog.view',
    'orders.view',
    'analytics.view',
  ]);
  assert.deepEqual(permissions.PERMISSION_DEPENDENCIES['analytics.view'], undefined);
  assert.deepEqual(permissions.PERMISSION_DEPENDENCIES['promotions.manage'], undefined);
  assert.deepEqual(permissions.PERMISSION_DEPENDENCIES['coupons.manage'], undefined);
  assert.deepEqual(permissions.resolveTemplatePermissions('custom'), []);
  assert.throws(() => permissions.resolveTemplatePermissions('super_admin'), /invalid_permissions/);
});

test('el principal activo recibe permisos implícitos, pero nunca acciones exclusivas de Master', () => {
  const store = planStore('premium');
  const primary = user(PRIMARY_ID);
  const app = fakeApp({ store, users: [primary] });
  const effective = permissions.resolveEffectiveStorePermissions(app, primary, store);

  assert.equal(permissions.isPrimaryAdmin(app, primary, store), true);
  assert.equal(effective.includes('catalog.expirations.manage'), true);
  assert.equal(effective.includes('team.manage'), true);
  assert.equal(effective.includes('plan.manage'), true);
  assert.equal(effective.includes('premium_downgrade.confirm'), true);
  assert.equal(effective.includes('primary_admin.replace'), false);
  assert.equal(effective.includes('global_cleanup.execute'), false);
  assert.equal(permissions.requireStorePermission(app, primary, store, 'team.manage'), true);
});

test('estado suspendido, rol inválido y cruce de tienda fallan cerrados', () => {
  const store = planStore('premium');
  const suspended = user(PRIMARY_ID, { status: 'suspended' });
  const foreign = user(PRIMARY_ID, { store: OTHER_STORE_ID });
  const customer = user(PRIMARY_ID, { role: 'customer' });

  assert.deepEqual(permissions.resolveEffectiveStorePermissions(fakeApp({ store, users: [suspended] }), suspended, store), []);
  assert.deepEqual(permissions.resolveEffectiveStorePermissions(fakeApp({ store, users: [foreign] }), foreign, store), []);
  assert.deepEqual(permissions.resolveEffectiveStorePermissions(fakeApp({ store, users: [customer] }), customer, store), []);
});

test('un usuario adicional Premium usa permisos persistidos y la retirada es inmediata', () => {
  const store = planStore('premium');
  const staff = user(STAFF_ID);
  const access = {
    store: STORE_ID,
    user: STAFF_ID,
    template_code: 'custom',
    permissions_json: ['catalog.products.stock', 'catalog.expirations.manage'],
  };
  const app = fakeApp({ store, users: [staff], access: [access] });

  assert.deepEqual(permissions.resolveEffectiveStorePermissions(app, staff, store), [
    'catalog.view',
    'catalog.products.stock',
    'catalog.expirations.manage',
  ]);
  assert.equal(permissions.hasStorePermission(app, staff, store, 'catalog.expirations.manage'), true);

  access.permissions_json = ['catalog.products.stock'];
  assert.equal(permissions.hasStorePermission(app, staff, store, 'catalog.expirations.manage'), false);
  assert.throws(
    () => permissions.requireStorePermission(app, staff, store, 'catalog.expirations.manage'),
    (error) => error instanceof permissions.StorePermissionError
      && error.status === 403
      && error.code === 'permission_denied',
  );
});

test('Free/Básico bloquea extras y V7E9 requiere permiso más capability del plan', () => {
  const staff = user(STAFF_ID);
  const assigned = [{
    store: STORE_ID,
    user: STAFF_ID,
    template_code: 'custom',
    permissions_json: ['catalog.expirations.manage'],
  }];
  const basic = planStore('basic');
  const basicApp = fakeApp({ store: basic, users: [staff], access: assigned });
  assert.equal(permissions.isBlockedByPlan(basicApp, staff, basic), true);
  assert.deepEqual(permissions.resolveEffectiveStorePermissions(basicApp, staff, basic), []);

  const basicPrimary = user(PRIMARY_ID);
  const primaryApp = fakeApp({ store: basic, users: [basicPrimary] });
  assert.equal(permissions.isBlockedByPlan(primaryApp, basicPrimary, basic), false);
  assert.equal(permissions.hasStorePermission(primaryApp, basicPrimary, basic, 'catalog.view'), true);
  assert.equal(permissions.hasStorePermission(primaryApp, basicPrimary, basic, 'catalog.expirations.manage'), false);

  const premium = planStore('premium');
  const premiumApp = fakeApp({ store: premium, users: [staff], access: assigned });
  assert.equal(permissions.isBlockedByPlan(premiumApp, staff, premium), false);
  assert.equal(permissions.hasStorePermission(premiumApp, staff, premium, 'catalog.expirations.manage'), true);
});

test('principal pendiente conserva acceso legacy sin autoproclamarse ni gestionar equipo', () => {
  const store = planStore('premium', { primary_admin_user: '' });
  const legacyAdmin = user(STAFF_ID, { role: 'store_admin' });
  const app = fakeApp({ store, users: [legacyAdmin] });
  const effective = permissions.resolveEffectiveStorePermissions(app, legacyAdmin, store);

  assert.equal(permissions.isPrimaryAdmin(app, legacyAdmin, store), false);
  assert.equal(permissions.isBlockedByPlan(app, legacyAdmin, store), false);
  assert.equal(effective.includes('catalog.products.edit'), true);
  assert.equal(effective.includes('catalog.expirations.manage'), true);
  assert.equal(effective.includes('team.manage'), false);
  assert.equal(effective.some((key) => permissions.RESERVED_PERMISSIONS.includes(key)), false);
});

test('todos los administradores pendientes Basic conservan acceso sin elegir uno por cuota', () => {
  const store = planStore('basic', { primary_admin_user: '' });
  const first = user('legacyadmin0001', { role: 'store_admin', created: '2026-01-01T00:00:00.000Z' });
  const second = user('legacyadmin0002', { role: 'store_admin', created: '2026-01-02T00:00:00.000Z' });
  const app = fakeApp({ store, users: [first, second] });

  for (const legacyAdmin of [first, second]) {
    const effective = permissions.resolveEffectiveStorePermissions(app, legacyAdmin, store);
    assert.equal(permissions.isPrimaryAdmin(app, legacyAdmin, store), false);
    assert.equal(permissions.isBlockedByPlan(app, legacyAdmin, store), false);
    assert.equal(effective.includes('catalog.products.edit'), true);
    assert.equal(effective.includes('team.manage'), false);
    assert.equal(effective.some((key) => permissions.RESERVED_PERMISSIONS.includes(key)), false);
  }
});

test('permisos persistidos corruptos nunca se convierten en acceso efectivo', () => {
  const store = planStore('premium');
  const staff = user(STAFF_ID);
  const app = fakeApp({
    store,
    users: [staff],
    access: [{ store: STORE_ID, user: STAFF_ID, permissions_json: ['team.manage'] }],
  });
  assert.deepEqual(permissions.resolveEffectiveStorePermissions(app, staff, store), []);
});

class FieldsList {
  constructor(fields = []) {
    this.items = fields.map((field) => ({ ...field }));
  }

  getByName(name) {
    const field = this.items.find((item) => item.name === name);
    if (!field) throw new Error('field_not_found');
    return field;
  }

  add(field) {
    this.items.push(field);
  }

  removeById(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('field_not_found');
    this.items.splice(index, 1);
  }
}

class FakeCollection {
  constructor(options) {
    Object.assign(this, options);
    this.fields = new FieldsList(options.fields || []);
    this.indexes = (options.indexes || []).slice();
    this.dynamicIndexes = [];
  }

  getIndex(name) {
    return this.dynamicIndexes.find((item) => item.name === name) || null;
  }

  addIndex(name, unique, columns, where) {
    this.dynamicIndexes.push({ name, unique, columns, where });
  }

  removeIndex(name) {
    const index = this.dynamicIndexes.findIndex((item) => item.name === name);
    if (index < 0) throw new Error('index_not_found');
    this.dynamicIndexes.splice(index, 1);
  }
}

function mutableRecord(id, values = {}) {
  return {
    id,
    ...values,
    get(key) { return this[key]; },
    getString(key) { return String(this[key] || ''); },
    set(key, value) { this[key] = value; },
  };
}

function migrationFixture() {
  const usersCollection = new FakeCollection({ id: 'users_collection', name: 'users', fields: [] });
  const storesCollection = new FakeCollection({ id: 'stores_collection', name: 'stores', fields: [] });
  const auditCollection = new FakeCollection({
    id: 'audit_collection',
    name: 'store_user_audit',
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [{
      id: 'existing_action',
      name: 'action',
      type: 'select',
      values: ['user_created', 'user_updated', 'password_changed', 'sessions_revoked'],
    }],
  });
  const collections = new Map([
    ['users', usersCollection],
    ['stores', storesCollection],
    ['store_user_audit', auditCollection],
  ]);
  const stores = [
    mutableRecord('storezero000001'),
    mutableRecord('storeone0000001'),
    mutableRecord('storemany000001'),
    mutableRecord('storepreset0001', { primary_admin_user: 'adminpreset0001' }),
  ];
  const users = [
    mutableRecord('adminone0000001', { store: stores[1].id, role: 'store_admin', status: 'active', created: '2026-01-01' }),
    mutableRecord('adminmany000001', { store: stores[2].id, role: 'store_admin', status: 'active', created: '2026-01-01' }),
    mutableRecord('adminmany000002', { store: stores[2].id, role: 'store_admin', status: 'active', created: '2026-01-02' }),
    mutableRecord('adminsuspended1', { store: stores[0].id, role: 'store_admin', status: 'suspended', created: '2026-01-01' }),
  ];
  const app = {
    findCollectionByNameOrId(name) {
      const value = collections.get(name);
      if (!value) throw new Error('collection_not_found');
      return value;
    },
    findRecordsByFilter(collection, _filter, _sort, limit, offset, params = {}) {
      if (collection === 'stores') return stores.slice(offset, offset + limit);
      if (collection === 'users') {
        return users
          .filter((item) => item.store === params.store && item.role === 'store_admin' && item.status === 'active')
          .slice(offset, offset + limit);
      }
      return [];
    },
    save(value) {
      if (value instanceof FakeCollection) collections.set(value.name, value);
      return value;
    },
    delete(value) {
      collections.delete(value.name);
    },
  };
  return { app, collections, stores, users, storesCollection, auditCollection };
}

function loadMigration() {
  const migrationPath = path.resolve(__dirname, '../pb_migrations/1784595600_store_team_permissions.js');
  const source = fs.readFileSync(migrationPath, 'utf8');
  let up;
  let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Field: class FakeField { constructor(options) { Object.assign(this, options); } },
    migrate(upFn, downFn) { up = upFn; down = downFn; },
  }, { filename: migrationPath });
  return { source, up, down };
}

test('la migración append-only crea esquema privado, campos auditables e índices únicos', () => {
  const migration = loadMigration();
  const fixture = migrationFixture();
  migration.up(fixture.app);

  const primaryField = fixture.storesCollection.fields.getByName('primary_admin_user');
  assert.equal(primaryField.required, false);
  assert.equal(primaryField.hidden, true);
  assert.deepEqual(fixture.storesCollection.dynamicIndexes, [{
    name: 'idx_stores_primary_admin_user_unique',
    unique: true,
    columns: 'primary_admin_user',
    where: "`primary_admin_user` != ''",
  }]);

  const access = fixture.collections.get('store_user_access');
  assert.ok(access);
  assert.equal(access.listRule, null);
  assert.equal(access.viewRule, null);
  assert.equal(access.createRule, null);
  assert.equal(access.updateRule, null);
  assert.equal(access.deleteRule, null);
  assert.equal(access.fields.getByName('store').required, true);
  assert.equal(access.fields.getByName('store').cascadeDelete, true);
  assert.equal(access.fields.getByName('user').required, true);
  assert.equal(access.fields.getByName('user').cascadeDelete, true);
  assert.equal(access.fields.getByName('template_code').required, true);
  assert.equal(access.fields.getByName('permissions_json').required, false);
  assert.match(access.indexes.join('\n'), /CREATE UNIQUE INDEX[\s\S]*\(`store`, `user`\)/i);

  const actionValues = fixture.auditCollection.fields.getByName('action').values;
  for (const action of [
    'team_user_created',
    'team_user_updated',
    'team_user_suspended',
    'team_user_reactivated',
    'team_permissions_changed',
    'team_template_changed',
    'team_sessions_revoked',
    'team_devices_revoked',
    'team_temporary_password_issued',
    'primary_admin_assigned',
    'primary_admin_replaced',
    'plan_access_locked',
    'plan_access_restored',
  ]) assert.equal(actionValues.includes(action), true, action);
  assert.equal(fixture.auditCollection.fields.getByName('previous_template_code').hidden, true);
  assert.equal(fixture.auditCollection.fields.getByName('new_template_code').hidden, true);
  assert.equal(fixture.auditCollection.fields.getByName('previous_permissions_json').type, 'json');
  assert.equal(fixture.auditCollection.fields.getByName('new_permissions_json').type, 'json');
  assert.doesNotMatch(migration.source, /temporary_password_(?:plain|hash|value)|authToken|refresh_token/i);
});

test('el backfill solo elige cuando hay exactamente un store_admin activo', () => {
  const migration = loadMigration();
  const fixture = migrationFixture();
  const userCount = fixture.users.length;
  migration.up(fixture.app);

  assert.equal(fixture.stores[0].primary_admin_user || '', '');
  assert.equal(fixture.stores[1].primary_admin_user, 'adminone0000001');
  assert.equal(fixture.stores[2].primary_admin_user || '', '');
  assert.equal(fixture.stores[3].primary_admin_user, 'adminpreset0001');
  assert.equal(fixture.users.length, userCount);
});

test('rollback retira únicamente el esquema M7U2 y conserva usuarios y tiendas', () => {
  const migration = loadMigration();
  const fixture = migrationFixture();
  migration.up(fixture.app);
  const userIds = fixture.users.map((item) => item.id);
  const storeIds = fixture.stores.map((item) => item.id);
  migration.down(fixture.app);

  assert.equal(fixture.collections.has('store_user_access'), false);
  assert.throws(() => fixture.storesCollection.fields.getByName('primary_admin_user'), /field_not_found/);
  assert.equal(fixture.storesCollection.dynamicIndexes.length, 0);
  assert.throws(() => fixture.auditCollection.fields.getByName('previous_permissions_json'), /field_not_found/);
  assert.deepEqual(fixture.auditCollection.fields.getByName('action').values, [
    'user_created',
    'user_updated',
    'password_changed',
    'sessions_revoked',
  ]);
  assert.deepEqual(fixture.users.map((item) => item.id), userIds);
  assert.deepEqual(fixture.stores.map((item) => item.id), storeIds);
});
