'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const analytics = require('../pb_hooks/pz_promo_analytics_lib.js');
const analyticsApi = require('../pb_hooks/pz_promo_analytics_api_lib.js');
const data = require('../pb_hooks/pz_promo_data_lib.js');

const EVENT_ID = '8f9760e2-1847-4b9c-83e8-2f09724e9e50';

function event(eventType, extra = {}) {
  return {
    contract: analytics.COLLECT_CONTRACT,
    event_id: EVENT_ID,
    event_type: eventType,
    locale: 'es',
    ...extra,
  };
}

function profile() {
  return {
    locale: { effective: 'es' },
    theme: { theme_id: 'promo.black-gold', version: '1.0.0' },
    sections: [{ key: 'hero' }, { key: 'contacto' }],
    contact_action: { available: true, action: { type: 'whatsapp' } },
    landing_qr_link: { enabled: true, link: { href: 'https://tusenda84.com/t/demo/links' } },
  };
}

test('collector acepta solo cuatro familias y payload exacto sin PII', () => {
  for (const type of ['page_view', 'contact_activate', 'landing_qr_open']) {
    assert.equal(analytics.parseCollect(event(type)).eventType, type);
  }
  assert.equal(analytics.parseCollect(event('section_view', { section_key: 'hero' })).sectionKey, 'hero');
  for (const poisoned of [
    { ...event('page_view'), url: 'https://example.test/path?secret=1' },
    { ...event('page_view'), referrer: 'https://search.example' },
    { ...event('contact_activate'), action_type: 'whatsapp' },
    { ...event('page_view'), visitor_id: 'visitor' },
    { ...event('section_view'), section_key: 'hero', query: 'utm_source=qr' },
  ]) assert.throws(() => analytics.parseCollect(poisoned), /invalid_payload/);
  assert.throws(() => analytics.parseCollect(event('page_view', { locale: 'ES' })), /invalid_payload/);
  assert.throws(() => analytics.parseCollect({ ...event('page_view'), event_id: 'not-a-uuid' }), /invalid_payload/);
});

test('dimensiones se derivan del contenido vivo y Landing QR falla cerrado', () => {
  const current = profile();
  assert.deepEqual(analytics.validateAgainstProfile(analytics.parseCollect(event('page_view')), current), {
    actionType: '', dimensionKey: '', themeKey: 'promo.black-gold@1.0.0',
  });
  assert.equal(
    analytics.validateAgainstProfile(analytics.parseCollect(event('section_view', { section_key: 'hero' })), current).dimensionKey,
    'hero',
  );
  assert.equal(
    analytics.validateAgainstProfile(analytics.parseCollect(event('contact_activate')), current).actionType,
    'whatsapp',
  );
  assert.equal(
    analytics.validateAgainstProfile(analytics.parseCollect(event('landing_qr_open')), current).dimensionKey,
    '',
  );
  assert.throws(() => analytics.validateAgainstProfile(
    analytics.parseCollect(event('landing_qr_open')),
    { ...current, landing_qr_link: { enabled: false, link: null } },
  ), /promo_analytics_unavailable/);
  assert.throws(() => analytics.validateAgainstProfile(
    analytics.parseCollect(event('section_view', { section_key: 'otro' })), current,
  ), /promo_analytics_unavailable/);
});

test('DATA admite landing_qr_open con generación viva y conserva tenant estricto', () => {
  const siteId = 'site00000000001';
  const revision = { id: 'revision0000001', site: siteId };
  const app = {
    findRecordById(collection, id) {
      if (collection === 'promo_sites' && id === siteId) return { id };
      if (collection === 'promo_revisions' && id === revision.id) return revision;
      throw new Error('not_found');
    },
  };
  const row = {
    site: siteId, revision: '', content_generation: 3,
    event_type: 'landing_qr_open', section_key: '', action_type: '', locale: 'es',
  };
  assert.equal(data.assertPromoRecord(app, 'promo_analytics_events', row, 'create'), true);
  assert.throws(() => data.assertPromoRecord(app, 'promo_analytics_events', {
    ...row, content_generation: 0,
  }, 'create'), /invalid_promo_content_generation/);
  assert.throws(() => data.assertPromoRecord(app, 'promo_analytics_events', {
    ...row, revision: 'revision0000002',
  }, 'create'), /invalid_promo_relation/);
  assert.throws(() => data.assertPromoRecord(app, 'promo_analytics_events', {
    ...row, action_type: 'whatsapp',
  }, 'create'), /invalid_promo_analytics_action/);
});

test('rangos UTC y retención no crean identidad de visitante', () => {
  assert.deepEqual(analytics.rangeBounds(new Date('2026-08-24T23:59:59.000Z'), 7), {
    from: '2026-08-18', to: '2026-08-24',
  });
  const expired = [{ id: 'raw1' }, { id: 'raw2' }];
  const oldDaily = [{ id: 'daily1' }];
  const deleted = [];
  const calls = [];
  const app = {
    findRecordsByFilter(collection, filter, sort, limit, offset, params) {
      calls.push({ collection, filter, params });
      if (collection === 'promo_analytics_events') return expired.splice(0);
      return oldDaily.splice(0);
    },
    delete(record) { deleted.push(record.id); },
  };
  assert.deepEqual(analyticsApi.cleanupExpiredAnalytics(app, new Date('2026-08-24T12:00:00.000Z')), {
    removedRaw: 2, removedDaily: 1,
  });
  assert.deepEqual(deleted, ['raw1', 'raw2', 'daily1']);
  assert.equal(calls[1].params.cutoff, '2025-07-21');
});

test('migración añade Landing QR de forma idempotente y rollback exige vacío', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../pb_migrations/1787520600_promo_analytics_landing_qr.js'), 'utf8');
  let up; let down;
  vm.runInNewContext(source, { Error, migrate(forward, rollback) { up = forward; down = rollback; } });
  const makeCollection = (id, dailyCollection = false) => {
    const field = { id, name: 'event_type', type: 'select', values: ['page_view', 'section_view', 'contact_activate'] };
    const unique = { id: 'number1787523309', name: 'unique_count', required: true };
    return {
      fields: { getByName(name) { return name === 'event_type' ? field : (dailyCollection && name === 'unique_count' ? unique : null); } },
      field, unique,
    };
  };
  const events = makeCollection('select1787523204');
  const daily = makeCollection('select1787523304', true);
  const rows = { promo_analytics_events: [], promo_analytics_daily: [] };
  const app = {
    findCollectionByNameOrId(name) { return name === 'promo_analytics_events' ? events : daily; },
    findRecordsByFilter(name) { return rows[name]; },
    save() {},
  };
  up(app); up(app);
  assert.equal(events.field.values.filter((value) => value === 'landing_qr_open').length, 1);
  assert.equal(daily.field.values.filter((value) => value === 'landing_qr_open').length, 1);
  assert.equal(daily.unique.required, false);
  rows.promo_analytics_events.push({ id: 'event' });
  assert.throws(() => down(app), /unsafe_rollback/);
  rows.promo_analytics_events.length = 0;
  down(app);
  assert.equal(events.field.values.includes('landing_qr_open'), false);
  assert.equal(daily.unique.required, true);
});

test('rutas son Promo-only, acotadas y sin integración externa', () => {
  const routes = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_promo_analytics.pb.js'), 'utf8');
  const api = fs.readFileSync(path.resolve(__dirname, '../pb_hooks/pz_promo_analytics_api_lib.js'), 'utf8');
  assert.match(routes, /analytics\/sites\/\{publicSlug\}\/events/);
  assert.match(routes, /analytics\/host\/events/);
  assert.match(routes, /private\/v1\/analytics\/summary/);
  assert.match(routes, /bodyLimit\(1024\)/);
  assert.match(api, /promo\.analytics\.view/);
  assert.match(api, /binding_role !== "primary"/);
  assert.doesNotMatch(`${routes}\n${api}`, /Cloudflare|api[_-]?token|Authorization.*Bearer|store_analytics_events/i);
});
