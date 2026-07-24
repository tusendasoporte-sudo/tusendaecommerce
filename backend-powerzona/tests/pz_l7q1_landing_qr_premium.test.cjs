'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const enforcement = require('../pb_hooks/pz_store_permission_enforcement_lib.js');

const STORE_ID = 'storel7q100001';
const OTHER_STORE_ID = 'storel7q100002';
const USER_ID = 'staffl7q100001';

function record(id, values = {}, original = null) {
  const hidden = new Set();
  return {
    id,
    ...values,
    hidden,
    get(key) { return this[key]; },
    fieldsData() {
      const copy = {};
      Object.keys(this).forEach((key) => {
        if (!['hidden', 'get', 'fieldsData', 'hide', 'original'].includes(key)) copy[key] = this[key];
      });
      return copy;
    },
    hide(...fields) { fields.forEach((field) => hidden.add(field)); return this; },
    original() { return original; },
  };
}

function fixture({
  plan = 'premium',
  permissions = ['landing_qr.manage'],
  enabled = true,
  expiresAt = '2099-12-31T23:59:59.000Z',
} = {}) {
  const store = record(STORE_ID, {
    slug: 'tienda-l7q1',
    status: 'active',
    primary_admin_user: '',
    plan,
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: expiresAt,
    plan_is_permanent: false,
  });
  const user = record(USER_ID, {
    role: 'store_staff',
    status: 'active',
    store: STORE_ID,
  });
  const access = record('accessl7q10001', {
    store: STORE_ID,
    user: USER_ID,
    permissions_json: permissions,
  });
  const settings = record('settingsl7q1001', {
    store: STORE_ID,
    active: true,
    store_name: 'Tienda L7Q1',
    whatsapp_number: '+53 55555555',
    welcome_text: 'Bienvenidos',
    logo_image: 'logo.webp',
    landing_qr_enabled: enabled,
    landing_qr_title: 'Mis enlaces',
    landing_qr_subtitle: 'Contenido conservado',
    landing_qr_accent_color: '#2563eb',
    landing_qr_links: [{ id: 'store', label: 'Tienda', url: '/t/tienda-l7q1' }],
    landing_qr_hero_image: 'hero.webp',
  });
  const otherStore = record(OTHER_STORE_ID, {
    slug: 'otra-tienda',
    status: 'active',
    plan: 'basic',
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: '2099-12-31T23:59:59.000Z',
    plan_is_permanent: false,
  });
  const tables = {
    stores: [store, otherStore],
    users: [user],
    settings: [settings],
    store_user_access: [access],
  };
  const app = {
    findRecordById(collection, id) {
      const found = (tables[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findFirstRecordByFilter(collection, _filter, params) {
      if (collection === 'store_user_access') {
        const found = tables.store_user_access.find((item) =>
          item.store === params.store && item.user === params.user);
        if (found) return found;
      }
      throw new Error('not_found');
    },
    findRecordsByFilter(collection, _filter, _sort, limit = 500, offset = 0, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.store) rows = rows.filter((item) => item.store === params.store);
      return rows.slice(offset, offset + limit);
    },
  };
  return { app, store, user, settings, otherStore };
}

function updateEvent(data, body, current = data.settings) {
  const original = record(current.id, { ...current });
  const target = record(current.id, { ...current }, original);
  let nextCalls = 0;
  return {
    target,
    run() {
      enforcement.enforceMutation({
        app: data.app,
        auth: data.user,
        record: target,
        collection: { name: 'settings' },
        requestInfo: () => ({ body }),
        next() { nextCalls += 1; },
      }, 'settings', 'update');
      return nextCalls;
    },
  };
}

function assertPermissionDenied(callback, permission = 'landing_qr.manage') {
  assert.throws(callback, (error) =>
    error.code === 'permission_denied' && error.permission === permission);
}

function analyticsRecord(data, overrides = {}) {
  return record('eventl7q100001', {
    store: data.store.id,
    event_type: 'landing_qr_view',
    page_type: 'landing_qr',
    entity_type: 'landing_qr',
    entity_id: data.store.id,
    path: `/t/${data.store.slug}/links`,
    ...overrides,
  });
}

function runAnonymousAnalytics(data, event) {
  let nextCalls = 0;
  enforcement.enforceMutation({
    app: data.app,
    auth: null,
    record: event,
    collection: { name: 'store_analytics_events' },
    next() { nextCalls += 1; },
  }, 'store_analytics_events', 'create');
  return nextCalls;
}

test('L7Q1: Free/Básico rechaza cualquier landing_qr_* y append/delete de imagen', () => {
  for (const plan of ['free', 'basic']) {
    const data = fixture({
      plan,
      permissions: ['store.settings.manage', 'landing_qr.manage'],
    });
    for (const body of [
      { landing_qr_title: 'Bloqueado' },
      { landing_qr_future_field: 'Bloqueado' },
      { 'landing_qr_hero_image+': 'nueva.webp' },
      { 'landing_qr_hero_image-': 'hero.webp' },
    ]) {
      assertPermissionDenied(() => updateEvent(data, body).run());
    }
  }
});

test('L7Q1: Premium exige permiso granular y permite solo al actor autorizado', () => {
  const allowed = fixture({ permissions: ['landing_qr.manage'] });
  assert.equal(updateEvent(allowed, { landing_qr_title: 'Autorizado' }).run(), 1);

  const denied = fixture({ permissions: ['store.settings.manage', 'analytics.view'] });
  assertPermissionDenied(() => updateEvent(denied, { landing_qr_title: 'No' }).run());
});

test('L7Q1: update cross-store de settings falla como recurso inexistente', () => {
  const data = fixture();
  const foreignOriginal = record('settingsforeign1', {
    store: OTHER_STORE_ID,
    landing_qr_title: 'Otra tienda',
  });
  const foreign = record('settingsforeign1', {
    store: OTHER_STORE_ID,
    landing_qr_title: 'Ataque',
  }, foreignOriginal);
  assert.throws(() => enforcement.enforceMutation({
    app: data.app,
    auth: data.user,
    record: foreign,
    collection: { name: 'settings' },
    requestInfo: () => ({ body: { landing_qr_title: 'Ataque' } }),
    next() {},
  }, 'settings', 'update'), /requested resource|not_found/i);
});

test('L7Q1: lectura privada redacta Landing QR sin ocultar campos públicos generales', () => {
  const basic = fixture({
    plan: 'basic',
    permissions: ['store.settings.manage', 'landing_qr.manage'],
  });
  enforcement.redactSettingsRecord(basic.app, basic.user, basic.settings);
  for (const field of [
    'landing_qr_enabled',
    'landing_qr_title',
    'landing_qr_subtitle',
    'landing_qr_accent_color',
    'landing_qr_links',
    'landing_qr_hero_image',
  ]) {
    assert.equal(basic.settings.hidden.has(field), true, field);
  }
  for (const field of ['store_name', 'whatsapp_number', 'welcome_text', 'logo_image']) {
    assert.equal(basic.settings.hidden.has(field), false, field);
  }

  const premiumWithoutPermission = fixture({ permissions: ['store.settings.manage'] });
  enforcement.redactSettingsRecord(
    premiumWithoutPermission.app,
    premiumWithoutPermission.user,
    premiumWithoutPermission.settings,
  );
  assert.equal(premiumWithoutPermission.settings.hidden.has('landing_qr_links'), true);
});

test('L7Q1: fields/filter/sort no infieren Landing QR y default_currency sigue disponible', () => {
  const basic = fixture({
    plan: 'basic',
    permissions: ['store.settings.manage', 'landing_qr.manage'],
  });
  const read = (query) => enforcement.enforceRead({
    app: basic.app,
    auth: basic.user,
    collection: { name: 'settings' },
    requestInfo: () => ({ query }),
    next() {},
  }, 'settings');

  for (const query of [
    { fields: 'id,landing_qr_title' },
    { filter: 'landing_qr_enabled=true' },
    { sort: 'landing_qr_title' },
  ]) {
    assertPermissionDenied(() => read(query), 'query.restricted');
  }
  assert.doesNotThrow(() => read({
    filter: `store="${STORE_ID}" && active=true`,
    sort: '-updated',
    expand: 'default_currency',
  }));
});

test('L7Q1: downgrade, expiración y upgrade preservan exactamente configuración e imagen', () => {
  const data = fixture();
  const before = JSON.stringify({
    enabled: data.settings.landing_qr_enabled,
    title: data.settings.landing_qr_title,
    subtitle: data.settings.landing_qr_subtitle,
    color: data.settings.landing_qr_accent_color,
    links: data.settings.landing_qr_links,
    hero: data.settings.landing_qr_hero_image,
  });

  data.store.plan = 'basic';
  assert.equal(enforcement.landingQrCapabilityAllowed(data.store), false);
  assert.equal(JSON.stringify({
    enabled: data.settings.landing_qr_enabled,
    title: data.settings.landing_qr_title,
    subtitle: data.settings.landing_qr_subtitle,
    color: data.settings.landing_qr_accent_color,
    links: data.settings.landing_qr_links,
    hero: data.settings.landing_qr_hero_image,
  }), before);

  data.store.plan = 'premium';
  data.store.plan_expires_at = '2000-01-01T00:00:00.000Z';
  assertPermissionDenied(() => updateEvent(data, { landing_qr_title: 'Vencido' }).run());
  assert.equal(data.settings.landing_qr_title, 'Mis enlaces');

  data.store.plan_expires_at = '2099-12-31T23:59:59.000Z';
  assert.equal(enforcement.landingQrPublicAvailable(data.app, data.store, data.settings), true);
  assert.equal(JSON.stringify({
    enabled: data.settings.landing_qr_enabled,
    title: data.settings.landing_qr_title,
    subtitle: data.settings.landing_qr_subtitle,
    color: data.settings.landing_qr_accent_color,
    links: data.settings.landing_qr_links,
    hero: data.settings.landing_qr_hero_image,
  }), before);
});

test('L7Q1: REST directo no crea vistas/clics si falta capacidad o activación', () => {
  const basic = fixture({ plan: 'basic' });
  assert.throws(
    () => runAnonymousAnalytics(basic, analyticsRecord(basic)),
    /requested resource|not_found/i,
  );

  const disabled = fixture({ enabled: false });
  assert.throws(
    () => runAnonymousAnalytics(disabled, analyticsRecord(disabled, { event_type: 'landing_qr_click' })),
    /requested resource|not_found/i,
  );

  const active = fixture();
  assert.equal(runAnonymousAnalytics(active, analyticsRecord(active)), 1);
  assert.equal(runAnonymousAnalytics(active, analyticsRecord(active, {
    event_type: 'pageview',
    page_type: 'store_home',
    entity_type: 'store',
    entity_id: active.store.id,
    path: `/t/${active.store.slug}`,
  })), 1);
});

test('L7Q1: archivo hero y hook público fallan cerrados por capacidad sin borrar el archivo', () => {
  const basic = fixture({ plan: 'basic' });
  assert.throws(() => enforcement.enforceFileDownload({
    app: basic.app,
    auth: null,
    record: basic.settings,
    collection: { name: 'settings' },
    fileField: { name: 'landing_qr_hero_image' },
    next() {},
  }), /requested resource|not_found/i);
  assert.equal(basic.settings.landing_qr_hero_image, 'hero.webp');

  const premium = fixture({ enabled: false });
  let nextCalls = 0;
  enforcement.enforceFileDownload({
    app: premium.app,
    auth: null,
    record: premium.settings,
    collection: { name: 'settings' },
    fileField: { name: 'landing_qr_hero_image' },
    next() { nextCalls += 1; },
  });
  assert.equal(nextCalls, 1);
});

test('L7Q1: hook registra protección de descargas y no introduce migraciones', () => {
  const hook = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'pb_hooks', 'pz_store_permission_enforcement.pb.js'),
    'utf8',
  );
  assert.match(hook, /onFileDownloadRequest\(/);
  assert.match(hook, /enforceFileDownload\(e\)/);
});
