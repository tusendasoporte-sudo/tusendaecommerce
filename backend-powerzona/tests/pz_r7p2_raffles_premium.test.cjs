'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const raffles = require('../pb_hooks/pz_raffles_premium_lib.js');
const enforcement = require('../pb_hooks/pz_store_permission_enforcement_lib.js');

function record(id, values = {}, original = null) {
  return {
    id,
    ...values,
    get(key) { return key === 'id' ? this.id : this[key]; },
    getString(key) { return String(this.get(key) ?? ''); },
    set(key, value) { this[key] = value; },
    original() { return original; },
  };
}

class TestRecord {
  constructor(collection) {
    this.collectionName = collection.name;
    this.id = '';
  }
  get(key) { return key === 'id' ? this.id : this[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) { this[key] = value; }
}

global.Record = TestRecord;

function fixture({ plan = 'premium', expiresAt = '', permissions = ['raffles.manage'] } = {}) {
  const store = record('storer7p2000001', {
    name: 'Tienda R7P2',
    slug: 'tienda-r7p2',
    status: 'active',
    plan,
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: expiresAt,
    plan_is_permanent: expiresAt === '',
    primary_admin_user: '',
    owner_phone: '5355555555',
  });
  const otherStore = record('storer7p2000002', {
    name: 'Otra tienda',
    slug: 'otra-r7p2',
    status: 'active',
    plan: 'basic',
    plan_started_at: '2026-07-01T00:00:00.000Z',
    plan_expires_at: '',
    plan_is_permanent: false,
  });
  const user = record('staffr7p200001', {
    role: 'store_staff',
    status: 'active',
    store: store.id,
  });
  const access = record('accessr7p20001', {
    store: store.id,
    user: user.id,
    permissions_json: permissions,
  });
  const raffle = record('raffler7p200001', {
    store: store.id,
    title: 'Rifa segura',
    slug: 'rifa-1',
    slot_number: 1,
    is_configured: true,
    access_code: 'R7-OK',
    access_code_hash: 'private-hash',
    images: ['premio.webp'],
    prizes_json: [{ id: 'premio-1', name: 'Premio', description: 'Seguro', image: 'premio.webp' }],
    prizes_display_mode: 'fixed',
    store_featured_prize_ids: ['premio-1'],
    starts_at: '2026-01-01T00:00:00.000Z',
    closes_at: '2099-12-30T00:00:00.000Z',
    draw_at: '2099-12-31T00:00:00.000Z',
    status: 'active',
    link_enabled: true,
    show_in_store: true,
    visible: true,
    selection_manually_closed: false,
  });
  const foreignRaffle = record('raffler7p200002', {
    ...raffle,
    id: 'raffler7p200002',
    store: otherStore.id,
    slug: 'rifa-1',
  });
  const settings = record('settingr7p2001', {
    store: store.id,
    active: true,
    whatsapp_number: '5355555555',
  });
  const tables = {
    stores: [store, otherStore],
    users: [user],
    store_user_access: [access],
    raffles: [raffle, foreignRaffle],
    raffle_entries: [],
    settings: [settings],
    store_notifications: [],
  };
  let sequence = 0;
  const app = {
    tables,
    findCollectionByNameOrId(name) { return { name }; },
    findRecordById(collection, id) {
      const found = (tables[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error('not_found');
      return found;
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.slug) rows = rows.filter((item) => item.slug === params.slug);
      if (params.store) rows = rows.filter((item) => item.store === params.store);
      if (params.user) rows = rows.filter((item) => item.user === params.user);
      if (params.raffle) rows = rows.filter((item) => item.raffle === params.raffle);
      if (params.value) {
        rows = rows.filter((item) => item.phone === params.value || item.chosen_number === params.value);
      }
      if (_filter.includes('active = true')) rows = rows.filter((item) => item.active === true);
      if (_filter.includes('status = "active"')) rows = rows.filter((item) => item.status === 'active');
      if (_filter.includes('status = "cancelled"')) rows = rows.filter((item) => item.status === 'cancelled');
      if (!rows.length) throw new Error('not_found');
      return rows[0];
    },
    findRecordsByFilter(collection, filter, _sort, limit = 100, offset = 0, params = {}) {
      let rows = [...(tables[collection] || [])];
      if (params.store) rows = rows.filter((item) => item.store === params.store);
      if (params.raffle) rows = rows.filter((item) => item.raffle === params.raffle);
      if (params.phone) rows = rows.filter((item) => item.phone === params.phone);
      if (filter.includes('status = "active"')) rows = rows.filter((item) => item.status === 'active');
      if (filter.includes('status = "cancelled"')) rows = rows.filter((item) => item.status === 'cancelled');
      return rows.slice(offset, offset + limit);
    },
    save(item) {
      if (!item.id) item.id = `generated${String(++sequence).padStart(6, '0')}`;
      if (!tables[item.collectionName]) tables[item.collectionName] = [];
      if (!tables[item.collectionName].includes(item)) tables[item.collectionName].push(item);
      return item;
    },
  };
  return { app, store, otherStore, user, raffle, foreignRaffle, tables };
}

function routeEvent(app, body) {
  const result = { status: 0, payload: null, headers: new Map() };
  return {
    result,
    event: {
      app,
      requestInfo: () => ({ body }),
      response: { header: () => ({ set: (key, value) => result.headers.set(key, value) }) },
      json(status, payload) {
        result.status = status;
        result.payload = payload;
        return payload;
      },
    },
  };
}

test('R7P2: Premium vigente permite snapshot público sanitizado', () => {
  const data = fixture();
  assert.equal(raffles.raffleCapabilityAllowed(data.store), true);
  const safe = raffles.publicRaffleRecord(data.raffle);
  assert.equal(safe.title, 'Rifa segura');
  assert.equal(safe.access_code, undefined);
  assert.equal(safe.access_code_hash, undefined);
  assert.equal(safe.store, undefined);
  assert.equal(JSON.stringify(safe).includes('private-hash'), false);
});

test('R7P2: Free, Básico, Premium vencido y plan inválido fallan cerrados', () => {
  for (const options of [
    { plan: 'free' },
    { plan: 'basic' },
    { plan: 'premium', expiresAt: '2000-01-01T00:00:00.000Z' },
    { plan: 'desconocido' },
  ]) {
    const data = fixture(options);
    assert.equal(raffles.raffleCapabilityAllowed(data.store), false);
    const { event, result } = routeEvent(data.app, {
      action: 'home',
      store_slug: data.store.slug,
      raffle_slug: '',
    });
    raffles.handlePublic(event);
    assert.equal(result.status, 404);
    assert.equal(result.payload.ok, false);
    assert.match(result.headers.get('Cache-Control') || '', /no-store/);
  }
});

test('R7P2: endpoint público resuelve slug canónico y no acepta IDs o campos adulterados', () => {
  const data = fixture();
  assert.equal(raffles.parsePublicPayload({
    action: 'detail',
    store_slug: data.store.slug,
    raffle_slug: 'rifa-1',
  }).raffleSlug, 'rifa-1');
  assert.equal(raffles.parsePublicPayload({
    action: 'detail',
    store_slug: data.store.slug,
    raffle_slug: 'rifa-1',
    storeId: data.otherStore.id,
  }), null);
  assert.equal(raffles.findPublicRaffle(data.app, data.store, 'rifa-1').id, data.raffle.id);
  assert.equal(raffles.findPublicRaffle(data.app, data.store, 'rifa-4'), null);
});

test('R7P2: enter bloqueado no crea entrada ni notificación', () => {
  const data = fixture({ plan: 'basic' });
  const { event, result } = routeEvent(data.app, {
    storeSlug: data.store.slug,
    raffleSlug: 'rifa-1',
    access_code: 'R7-OK',
    chosen_number: '07',
    phone: '55555555',
  });
  raffles.handleEnter(event);
  assert.equal(result.status, 404);
  assert.equal(data.tables.raffle_entries.length, 0);
  assert.equal(data.tables.store_notifications.length, 0);
});

test('R7P2: enter Premium valida código y crea una sola reserva/notificación canónica', () => {
  const data = fixture();
  const wrong = routeEvent(data.app, {
    storeSlug: data.store.slug,
    raffleSlug: 'rifa-1',
    access_code: 'MALO',
    chosen_number: '07',
    phone: '55555555',
  });
  raffles.handleEnter(wrong.event);
  assert.equal(wrong.result.status, 403);
  assert.equal(data.tables.raffle_entries.length, 0);

  const allowed = routeEvent(data.app, {
    storeSlug: data.store.slug,
    raffleSlug: 'rifa-1',
    access_code: 'R7-OK',
    chosen_number: '07',
    phone: '55555555',
  });
  raffles.handleEnter(allowed.event);
  assert.equal(allowed.result.status, 200);
  assert.equal(data.tables.raffle_entries.length, 1);
  assert.equal(data.tables.store_notifications.length, 1);
  assert.equal(JSON.stringify(data.tables.store_notifications[0]).includes('5355555555'), false);
  assert.equal(JSON.stringify(data.tables.store_notifications[0]).includes('R7-OK'), false);
});

test('R7P2: REST anónimo de rifas/participantes y mutación directa se bloquean', () => {
  const data = fixture();
  for (const collection of ['raffles', 'raffle_entries']) {
    const { event, result } = routeEvent(data.app, {});
    enforcement.enforceRead({
      ...event,
      auth: null,
      collection: { name: collection },
      next() { throw new Error('no debe continuar'); },
    }, collection);
    assert.equal(result.status, 404);
  }
  assert.throws(() => enforcement.enforceMutation({
    app: data.app,
    auth: null,
    record: record('attackr7p20001', {
      store: data.store.id,
      raffle: data.raffle.id,
      phone: '5355555555',
      chosen_number: '09',
      receipt_code: 'RF-X-ATTACK',
      status: 'active',
    }),
    collection: { name: 'raffle_entries' },
    requestInfo: () => ({ body: {} }),
    next() {},
  }, 'raffle_entries', 'create'), /requested resource|not_found/i);
});

test('R7P2: admin Premium exige raffles.manage y bloquea cruce de tenant', () => {
  const allowed = fixture();
  let nextCalls = 0;
  enforcement.enforceRead({
    app: allowed.app,
    auth: allowed.user,
    record: allowed.raffle,
    collection: { name: 'raffles' },
    requestInfo: () => ({ query: {} }),
    next() { nextCalls += 1; },
  }, 'raffles');
  assert.equal(nextCalls, 1);

  const denied = fixture({ permissions: ['analytics.view', 'store.settings.manage'] });
  assert.throws(() => enforcement.enforceRead({
    app: denied.app,
    auth: denied.user,
    record: denied.raffle,
    collection: { name: 'raffles' },
    requestInfo: () => ({ query: {} }),
    next() {},
  }, 'raffles'), (error) => error.code === 'permission_denied' && error.permission === 'raffles.manage');

  assert.throws(() => enforcement.enforceMutation({
    app: allowed.app,
    auth: allowed.user,
    record: record(allowed.foreignRaffle.id, { ...allowed.foreignRaffle }, allowed.foreignRaffle),
    collection: { name: 'raffles' },
    requestInfo: () => ({ body: { title: 'Ataque' } }),
    next() {},
  }, 'raffles', 'update'), /requested resource|not_found/i);
});

test('R7P2: archivo respeta capacidad, permiso y disponibilidad pública sin borrar', () => {
  const basic = fixture({ plan: 'basic' });
  assert.throws(() => enforcement.enforceFileDownload({
    app: basic.app,
    auth: null,
    record: basic.raffle,
    collection: { name: 'raffles' },
    fileField: { name: 'images' },
    response: { header: () => ({ set() {} }) },
    next() {},
  }), /requested resource|not_found/i);
  assert.deepEqual(basic.raffle.images, ['premio.webp']);

  const premium = fixture();
  let nextCalls = 0;
  enforcement.enforceFileDownload({
    app: premium.app,
    auth: premium.user,
    record: premium.raffle,
    collection: { name: 'raffles' },
    fileField: { name: 'images' },
    response: { header: () => ({ set() {} }) },
    next() { nextCalls += 1; },
  });
  assert.equal(nextCalls, 1);
});

test('R7P2: downgrade, vencimiento y renovación no mutan configuración', () => {
  const data = fixture();
  const before = JSON.stringify(data.raffle);
  data.store.plan = 'basic';
  assert.equal(raffles.raffleCapabilityAllowed(data.store), false);
  assert.equal(JSON.stringify(data.raffle), before);
  data.store.plan = 'premium';
  data.store.plan_expires_at = '2000-01-01T00:00:00.000Z';
  data.store.plan_is_permanent = false;
  assert.equal(raffles.raffleCapabilityAllowed(data.store), false);
  assert.equal(JSON.stringify(data.raffle), before);
  data.store.plan_expires_at = '2099-01-01T00:00:00.000Z';
  assert.equal(raffles.raffleCapabilityAllowed(data.store), true);
  assert.equal(JSON.stringify(data.raffle), before);
});

test('R7P2: realtime público y notificación anónima directa no filtran Rifas', () => {
  const data = fixture();
  assert.throws(() => enforcement.enforceRealtimeSubscribe({
    app: data.app,
    auth: null,
    subscriptions: ['raffles/*', 'raffle_entries/*'],
    next() {},
  }), (error) => error.code === 'permission_denied');
  assert.throws(() => enforcement.sanitizePublicNotificationCreate({
    app: data.app,
    record: record('notifattack0001', {
      store: data.store.id,
      type: 'raffle_entry_created',
      entity_collection: 'raffle_entries',
      entity_id: 'knownentry00001',
    }),
  }), /invalid_notification|notificaci/i);
});

test('R7P2: hooks registran REST, enrich, archivos y realtime sin migración', () => {
  const hook = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_store_permission_enforcement.pb.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '..', 'pb_hooks', 'pz_raffles_premium.pb.js'), 'utf8');
  assert.match(hook, /onRecordsListRequest\(/);
  assert.match(hook, /onRecordEnrich\(/);
  assert.match(hook, /onFileDownloadRequest\([\s\S]*?"settings", "raffles"/);
  assert.match(hook, /onRealtimeSubscribeRequest\(/);
  assert.match(routes, /\/api\/pz\/raffles\/public/);
  assert.match(routes, /\/api\/pz\/raffles\/enter/);
  assert.match(routes, /\/api\/pz\/raffles\/status/);
});

test('R7P2: mensajes públicos nuevos conservan UTF-8 legible', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../pb_hooks/pz_raffles_premium_lib.js'),
    'utf8',
  );
  assert.doesNotMatch(source, /Ã|Â|â€|ï¿½/);
  assert.match(source, /participación|número|código/);

  const data = fixture();
  data.raffle.prizes_json = Array.from(Buffer.from(JSON.stringify([
    { id: 'premio-unico', name: 'Edición única', description: 'Número ganador', image: '' },
  ]), 'utf8'));
  const publicRecord = raffles.publicRaffleRecord(data.raffle);
  assert.equal(publicRecord.prizes_json[0].name, 'Edición única');
  assert.equal(publicRecord.prizes_json[0].description, 'Número ganador');
});
