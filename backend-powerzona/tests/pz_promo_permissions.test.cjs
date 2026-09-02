const test = require('node:test');
const assert = require('node:assert/strict');

const promo = require('../pb_hooks/pz_promo_permissions_lib.js');
const commercePermissions = require('../pb_hooks/pz_store_team_permissions_lib.js');
const commerceCapabilities = require('../pb_hooks/pz_store_capabilities_lib.js');
const enforcement = require('../pb_hooks/pz_store_permission_enforcement_lib.js');

function id(prefix, fill = 'x') {
  return String(prefix).padEnd(15, fill).slice(0, 15);
}

class FakeRecord {
  constructor(values) {
    Object.assign(this, values);
  }

  get(key) {
    return this[key];
  }

  getString(key) {
    const value = this[key];
    return value === undefined || value === null ? '' : String(value);
  }

  getStringSlice(key) {
    return Array.isArray(this[key]) ? this[key].slice() : this[key];
  }

  tokenKey() {
    return this._tokenKey || '';
  }
}

function entitlement(site, overrides = {}) {
  return new FakeRecord({
    id: id(`ent-${site.id.slice(-4)}`, 'e'),
    site: site.id,
    source: 'contract',
    promo_site_enabled: true,
    publish_enabled: true,
    custom_domain_enabled: true,
    theme_customization_enabled: true,
    multilanguage_enabled: true,
    language_selector_enabled: true,
    video_enabled: true,
    analytics_enabled: true,
    landing_qr_bridge_enabled: true,
    max_services: 20,
    max_gallery_assets: 12,
    max_locales: 2,
    max_videos: 2,
    max_storage_bytes: 50 * 1024 * 1024,
    valid_from: '',
    valid_until: '',
    ...overrides,
  });
}

function fixture() {
  const storeA = new FakeRecord({
    id: id('store-a', 'a'), name: 'Promo A', slug: 'promo-a', status: 'active',
    plan: 'premium', plan_is_permanent: true, plan_expires_at: '',
  });
  const storeB = new FakeRecord({
    id: id('store-b', 'b'), name: 'Promo B', slug: 'promo-b', status: 'active',
    plan: 'premium', plan_is_permanent: true, plan_expires_at: '',
  });
  const commerce = new FakeRecord({
    id: id('store-c', 'c'), name: 'Commerce', slug: 'commerce', status: 'active',
    plan: 'premium', plan_is_permanent: true, plan_expires_at: '',
  });
  const primaryA = new FakeRecord({
    id: id('primary-a', 'p'), store: storeA.id, role: 'store_admin', status: 'active',
    display_name: 'Principal A', created: '2026-01-01', _tokenKey: 'live-primary-a',
  });
  const secondaryA = new FakeRecord({
    id: id('secondary-a', 's'), store: storeA.id, role: 'store_admin', status: 'active',
    display_name: 'Secundario A', created: '2026-01-02', _tokenKey: 'live-secondary-a',
  });
  const staffA = new FakeRecord({
    id: id('staff-a', 't'), store: storeA.id, role: 'store_staff', status: 'active',
    display_name: 'Staff A', created: '2026-01-03', _tokenKey: 'live-staff-a',
  });
  const suspendedA = new FakeRecord({
    id: id('suspended-a', 'u'), store: storeA.id, role: 'store_staff', status: 'suspended',
    display_name: 'Suspendido A', created: '2026-01-04', _tokenKey: 'live-suspended-a',
  });
  const primaryB = new FakeRecord({
    id: id('primary-b', 'q'), store: storeB.id, role: 'store_admin', status: 'active',
    display_name: 'Principal B', created: '2026-01-01', _tokenKey: 'live-primary-b',
  });
  const master = new FakeRecord({
    id: id('master', 'm'), store: '', role: 'master_admin', status: 'active',
    display_name: 'Master', _tokenKey: 'live-master',
  });
  storeA.primary_admin_user = primaryA.id;
  storeB.primary_admin_user = primaryB.id;

  const siteA = new FakeRecord({
    id: id('site-a', 'a'), store: storeA.id, public_slug: 'promo-a', status: 'active',
  });
  const siteB = new FakeRecord({
    id: id('site-b', 'b'), store: storeB.id, public_slug: 'promo-b', status: 'active',
  });
  const entitlementA = entitlement(siteA);
  const entitlementB = entitlement(siteB);
  const accessSecondaryA = new FakeRecord({
    id: id('access-secondary', 'a'), store: storeA.id, user: secondaryA.id,
    template_code: 'custom',
    permissions_json: ['landing_qr.manage'],
    promo_permissions_json: ['promo.content.manage', 'promo.analytics.view'],
    promo_permissions_version: 2,
  });
  const accessStaffA = new FakeRecord({
    id: id('access-staff', 'a'), store: storeA.id, user: staffA.id,
    template_code: 'custom', permissions_json: [],
    promo_permissions_json: ['promo.site.view'], promo_permissions_version: 1,
  });
  const accessPrimaryB = new FakeRecord({
    id: id('access-primaryb', 'b'), store: storeB.id, user: primaryB.id,
    template_code: 'custom', permissions_json: [], promo_permissions_json: [], promo_permissions_version: 0,
  });

  const tables = {
    users: [primaryA, secondaryA, staffA, suspendedA, primaryB, master],
    stores: [storeA, storeB, commerce],
    promo_sites: [siteA, siteB],
    promo_draft_documents: [],
    promo_site_entitlements: [entitlementA, entitlementB],
    store_user_access: [accessSecondaryA, accessStaffA, accessPrimaryB],
  };
  const app = {
    findRecordById(collection, recordId) {
      const found = (tables[collection] || []).find((record) => record.id === recordId);
      if (!found) throw new Error('not_found');
      return found;
    },
    findRecordsByFilter(collection, _filter, _sort, limit = 2, offset = 0, params = {}) {
      let records = (tables[collection] || []).slice();
      if (collection === 'promo_sites') records = records.filter((record) => record.store === params.store);
      if (collection === 'promo_site_entitlements') records = records.filter((record) => record.site === params.site);
      if (collection === 'store_user_access') {
        records = records.filter((record) => record.store === params.store && record.user === params.user);
      }
      if (collection === 'users' && params.store) {
        records = records
          .filter((record) => record.store === params.store
            && record.status === 'active'
            && ['store_admin', 'store_staff'].includes(record.role)
            && record.id !== params.primary)
          .sort((left, right) => `${left.created}|${left.id}`.localeCompare(`${right.created}|${right.id}`));
      }
      return records.slice(offset, offset + limit);
    },
    findFirstRecordByFilter(collection, filter, params) {
      const rows = this.findRecordsByFilter(collection, filter, 'id', 1, 0, params);
      if (!rows.length) throw new Error('not_found');
      return rows[0];
    },
    findCollectionByNameOrId(collection) {
      if (tables[collection]) return { name: collection };
      throw new Error('not_found');
    },
  };
  return {
    app, tables, storeA, storeB, commerce, siteA, siteB, entitlementA, entitlementB,
    primaryA, secondaryA, staffA, suspendedA, primaryB, master,
    accessSecondaryA, accessStaffA,
  };
}

test('catálogos Promo quedan separados de los 29 permisos, seis reservados y nueve capacidades Commerce vigentes', () => {
  assert.equal(promo.PROMO_ASSIGNABLE_PERMISSION_KEYS.length, 10);
  assert.equal(promo.PROMO_RESERVED_PERMISSION_KEYS.length, 6);
  assert.equal(promo.PROMO_CAPABILITY_KEYS.length, 14);
  assert.equal(promo.PROMO_ACTION_KEYS.length, 18);
  assert.equal(promo.PROMO_RESERVED_PERMISSION_KEYS.includes('promo.domains.manage'), true);
  assert.equal(promo.PROMO_ACTION_KEYS.includes('promo.master.domains.manage'), true);
  assert.equal(commercePermissions.ASSIGNABLE_PERMISSION_KEYS.length, 29);
  assert.equal(commercePermissions.RESERVED_PERMISSIONS.length, 5);
  assert.equal(Object.keys(commercePermissions.PERMISSION_TEMPLATES).length, 6);
  assert.equal(commerceCapabilities.CAPABILITY_KEYS.length, 9);
  assert.equal(commercePermissions.ASSIGNABLE_PERMISSION_KEYS.some((key) => key.startsWith('promo.')), false);
  assert.equal(JSON.stringify(commercePermissions.PERMISSION_TEMPLATES).includes('promo.'), false);
  assert.equal(commerceCapabilities.CAPABILITY_KEYS.some((key) => key.startsWith('promo')), false);
  assert.equal(promo.PROMO_ASSIGNABLE_PERMISSION_KEYS.includes('promotions.manage'), false);
});

test('normalización Promo agrega dependencias pero rechaza permiso desconocido y reservado', () => {
  assert.deepEqual(
    promo.normalizePromoPermissions(['promo.publish', 'promo.publish']),
    ['promo.site.view', 'promo.publish'],
  );
  assert.throws(
    () => promo.normalizePromoPermissions(['promo.unknown']),
    (error) => error.issue === 'unknown_permission',
  );
  assert.throws(
    () => promo.normalizePromoPermissions(['promo.entitlements.manage']),
    (error) => error.issue === 'reserved_permission',
  );
});

test('capacidades Promo fallan cerradas si faltan, son desconocidas, están vencidas o exceden cuota', () => {
  const { entitlementA } = fixture();
  assert.equal(promo.resolvePromoCapabilityAccess(entitlementA, 'video_enabled').allowed, true);
  assert.equal(promo.resolvePromoCapabilityAccess(entitlementA, 'language_selector_enabled').allowed, true);
  assert.equal(promo.resolvePromoCapabilityAccess(null, 'video_enabled').reason, 'capability_missing');
  assert.equal(promo.resolvePromoCapabilityAccess(entitlementA, 'inventada').reason, 'invalid_capability');
  assert.equal(
    promo.resolvePromoCapabilityAccess(entitlementA, 'max_videos', { requiredAmount: 3 }).reason,
    'limit_exceeded',
  );
  entitlementA.promo_site_enabled = false;
  assert.equal(promo.resolvePromoCapabilityAccess(entitlementA, 'video_enabled').reason, 'promo_site_not_enabled');
  entitlementA.promo_site_enabled = true;
  entitlementA.valid_until = '2026-08-22T00:00:00.000Z';
  assert.equal(
    promo.resolvePromoCapabilityAccess(entitlementA, 'promo_site_enabled', { now: '2026-08-23T00:00:00.000Z' }).reason,
    'entitlement_expired',
  );
});

test('principal, secundario y staff resuelven permisos Promo sin heredar permisos Commerce', () => {
  const data = fixture();
  assert.deepEqual(
    promo.resolveEffectivePromoPermissions(data.app, data.primaryA, data.storeA, data.siteA, data.entitlementA),
    promo.PROMO_ASSIGNABLE_PERMISSION_KEYS,
  );
  assert.deepEqual(
    promo.resolveEffectivePromoPermissions(data.app, data.secondaryA, data.storeA, data.siteA, data.entitlementA),
    ['promo.site.view', 'promo.content.manage', 'promo.analytics.view'],
  );
  assert.deepEqual(
    promo.resolveEffectivePromoPermissions(data.app, data.staffA, data.storeA, data.siteA, data.entitlementA),
    ['promo.site.view'],
  );
  data.entitlementA.analytics_enabled = false;
  assert.deepEqual(
    promo.resolveEffectivePromoPermissions(data.app, data.secondaryA, data.storeA, data.siteA, data.entitlementA),
    ['promo.site.view', 'promo.content.manage'],
  );
  assert.equal(
    promo.resolveEffectivePromoPermissions(data.app, data.secondaryA, data.commerce, data.siteA, data.entitlementA).length,
    0,
  );
});

test('gates combinan sesión viva, usuario, tienda, sitio, capacidad, permiso y aislamiento A/B', () => {
  const data = fixture();
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.content.manage'), true);
  assert.equal(promo.canPromoAction(data.app, data.staffA, 'promo.content.manage'), false);
  assert.equal(promo.canPromoAction(data.app, data.staffA, 'promo.site.view'), true);
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.unknown'), false);
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'orders.view'), false);
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.content.manage', {
    requestedStoreId: data.storeB.id,
  }), false);
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.content.manage', {
    resourceSiteId: data.siteB.id,
  }), false);
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.content.manage', {
    resourceStoreId: data.storeB.id,
  }), false);
  assert.equal(promo.canPromoAction(data.app, data.suspendedA, 'promo.site.view'), false);

  const revokedSession = new FakeRecord({ ...data.secondaryA, _tokenKey: 'revoked-token-key' });
  assert.equal(promo.canPromoAction(data.app, revokedSession, 'promo.site.view'), false);
  const sessionWithoutKey = new FakeRecord({ ...data.secondaryA, _tokenKey: '' });
  assert.equal(promo.canPromoAction(data.app, sessionWithoutKey, 'promo.site.view'), false);

  data.siteA.status = 'suspended';
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.site.view'), false);
});

test('bloqueo de usuario por plan se conserva y no elimina permisos persistidos', () => {
  const data = fixture();
  data.storeA.plan = 'basic';
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.site.view'), false);
  assert.deepEqual(data.accessSecondaryA.promo_permissions_json, [
    'promo.content.manage',
    'promo.analytics.view',
  ]);
});

test('Master usa contexto explícito y acciones reservadas; Commerce nunca recibe Promo', () => {
  const data = fixture();
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.master.support'), false);
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.master.support', {
    requestedStoreId: data.storeA.id,
  }), true);
  assert.equal(promo.canPromoAction(data.app, data.primaryA, 'promo.master.entitlements.manage'), false);
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.master.entitlements.manage', {
    requestedStoreId: data.storeA.id,
  }), true);
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.master.domains.manage', {
    requestedStoreId: data.storeA.id,
  }), true);
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.master.support', {
    requestedStoreId: data.commerce.id,
  }), false);
  data.entitlementA.promo_site_enabled = false;
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.master.entitlements.manage', {
    requestedStoreId: data.storeA.id,
  }), true);
  assert.equal(promo.canPromoAction(data.app, data.master, 'promo.content.manage', {
    requestedStoreId: data.storeA.id,
  }), false);
});

test('Landing QR permanece como puente doble: permiso Promo no concede la función Commerce', () => {
  const data = fixture();
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.landing_qr.bridge.manage'), true);
  data.accessSecondaryA.permissions_json = [];
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.landing_qr.bridge.manage'), false);
  data.accessSecondaryA.permissions_json = ['landing_qr.manage'];
  data.entitlementA.landing_qr_bridge_enabled = false;
  assert.equal(promo.canPromoAction(data.app, data.secondaryA, 'promo.landing_qr.bridge.manage'), false);
});

test('permisos Promo corruptos fallan cerrados sin degradar a plantilla Commerce', () => {
  const data = fixture();
  data.accessSecondaryA.promo_permissions_json = ['promo.site.view', 'unknown'];
  assert.deepEqual(promo.storedPromoPermissions(data.accessSecondaryA), []);
  assert.deepEqual(
    promo.resolveEffectivePromoPermissions(data.app, data.secondaryA, data.storeA, data.siteA, data.entitlementA),
    [],
  );
});

test('realtime directo no permite suscribirse a datos Promo ni a grants privados', () => {
  const data = fixture();
  for (const topic of ['promo_sites', 'promo_draft_documents', 'promo_site_entitlements', 'store_user_access']) {
    assert.throws(() => enforcement.enforceRealtimeSubscribe({
      app: data.app,
      auth: data.secondaryA,
      subscriptions: [topic],
      next() { throw new Error('realtime_should_not_continue'); },
    }), (error) => error && error.code === 'permission_denied');
  }
});
