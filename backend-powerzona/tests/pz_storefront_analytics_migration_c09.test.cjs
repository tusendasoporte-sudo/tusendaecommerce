'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1786665800_storefront_push_analytics_c09.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeField {
  constructor(values) { Object.assign(this, values); }
}

class FakeFields {
  constructor(values = []) { this.values = values.map((value) => new FakeField(value)); }
  getByName(name) {
    const field = this.values.find((value) => value.name === name);
    if (!field) throw new Error('field_not_found');
    return field;
  }
  add(field) { this.values.push(field); }
  removeById(id) { this.values = this.values.filter((field) => field.id !== id); }
}

class FakeCollection {
  constructor(values) {
    Object.assign(this, values);
    this.fields = values.fields instanceof FakeFields ? values.fields : new FakeFields(values.fields || []);
    this.indexes = Array.from(values.indexes || []);
  }
  getIndex(name) {
    const index = this.indexes.find((item) => item?.name === name || String(item).includes(`\`${name}\``));
    if (!index) throw new Error('index_not_found');
    return index;
  }
  addIndex(name, unique, columns, where) { this.indexes.push({ name, unique, columns, where }); }
  removeIndex(name) {
    this.indexes = this.indexes.filter((item) => item?.name !== name && !String(item).includes(`\`${name}\``));
  }
}

class FakeRecord {
  constructor(collection, id, values = {}) {
    this.collection = collection;
    this.id = id;
    this.values = { ...values };
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ''); }
  set(key, value) { this.values[key] = value; }
}

function loadMigration() {
  let up;
  let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Field: FakeField,
    Date,
    Error,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });
  return { up, down };
}

function baseCollection(id, name, fields = []) {
  return new FakeCollection({ id, name, fields, indexes: [] });
}

function createApp() {
  const collections = new Map([
    ['stores', baseCollection('pbc_stores', 'stores')],
    ['orders', baseCollection('pbc_orders', 'orders')],
    ['manual_coupons', baseCollection('pbc_coupons', 'manual_coupons')],
    ['push_campaigns', baseCollection('pbc_campaigns', 'push_campaigns')],
    ['push_campaign_deliveries', baseCollection('pbc_deliveries', 'push_campaign_deliveries')],
    ['push_events', baseCollection('pbc_events', 'push_events')],
    ['storefront_order_links', baseCollection('pbc_order_links', 'storefront_order_links')],
    ['settings', baseCollection('pbc_settings', 'settings', [
      { id: 'retention_field', name: 'analytics_retention_days', type: 'number', max: 30, default: 30 },
    ])],
  ]);
  const records = new Map([
    ['settings', [new FakeRecord('settings', 'settings0000001', { analytics_retention_days: 30 })]],
    ['push_campaigns', []],
    ['push_campaign_deliveries', [new FakeRecord('push_campaign_deliveries', 'delivery0000001', {
      accepted_at: '2026-08-01T00:00:00.000Z', delete_after: '2027-01-28T00:00:00.000Z',
    })]],
    ['push_events', [new FakeRecord('push_events', 'event0000000001', {
      event_type: 'opened', received_at: '2026-08-02T00:00:00.000Z', delete_after: '2027-01-29T00:00:00.000Z',
    })]],
    ['storefront_order_links', []],
  ]);
  return {
    collections,
    records,
    findCollectionByNameOrId(value) {
      const direct = collections.get(value);
      if (direct) return direct;
      for (const collection of collections.values()) if (collection.id === value) return collection;
      throw new Error('collection_not_found');
    },
    findRecordsByFilter(collection, filter, sort, limit, offset = 0) {
      let result = Array.from(records.get(collection) || []);
      const expression = String(filter || '');
      if (expression.includes('redacted_at !=')) result = result.filter((item) => item.getString('redacted_at'));
      if (expression.includes('campaign_id_snapshot !=') || expression.includes('attributed_at !=')) {
        result = result.filter((item) => item.getString('campaign_id_snapshot') || item.getString('attributed_at'));
      }
      if (expression.includes('event_type = "coupon_applied"') || expression.includes('event_type = "order_attributed"')) {
        result = result.filter((item) => ['coupon_applied', 'order_attributed'].includes(item.getString('event_type')));
      }
      return result.slice(offset, offset + (Number(limit) || result.length || 1));
    },
    save(value) {
      if (value instanceof FakeCollection) {
        collections.set(value.name, value);
        if (!records.has(value.name)) records.set(value.name, []);
      }
      return value;
    },
    delete(collection) {
      collections.delete(collection.name);
      records.delete(collection.name);
    },
  };
}

function field(collection, name) {
  return collection.fields.getByName(name);
}

test('C09 crea el agregado privado, amplía relaciones y fija exactamente 90 días', () => {
  const { up } = loadMigration();
  const app = createApp();
  up(app);

  const daily = app.collections.get('push_daily_stats');
  assert.ok(daily);
  assert.equal(daily.listRule, null);
  assert.equal(daily.viewRule, null);
  assert.equal(field(daily, 'delete_after').required, true);
  assert.equal(field(app.collections.get('push_campaigns'), 'redacted_at').type, 'date');
  assert.equal(field(app.collections.get('push_events'), 'order').cascadeDelete, false);
  assert.equal(field(app.collections.get('push_events'), 'coupon').cascadeDelete, false);
  const orderIndex = app.collections.get('storefront_order_links').getIndex('idx_storefront_order_links_order_unique');
  assert.match(orderIndex.where, /attribution_source/);
  assert.equal(field(app.collections.get('settings'), 'analytics_retention_days').max, 90);
  assert.equal(app.records.get('settings')[0].get('analytics_retention_days'), 90);
  assert.equal(app.records.get('push_campaign_deliveries')[0].getString('delete_after'), '2026-10-30T00:00:00.000Z');
  assert.equal(app.records.get('push_events')[0].getString('delete_after'), '2026-10-31T00:00:00.000Z');
});

test('rollback vacío restaura 180 días y rechaza perder cualquier evidencia C09', () => {
  const first = loadMigration();
  const clean = createApp();
  first.up(clean);
  first.down(clean);
  assert.equal(clean.collections.has('push_daily_stats'), false);
  assert.throws(() => field(clean.collections.get('push_campaigns'), 'redacted_at'), /field_not_found/);
  assert.equal(field(clean.collections.get('settings'), 'analytics_retention_days').max, 30);
  assert.equal(clean.records.get('push_campaign_deliveries')[0].getString('delete_after'), '2027-01-28T00:00:00.000Z');
  assert.equal(clean.records.get('push_events')[0].getString('delete_after'), '2027-01-29T00:00:00.000Z');

  const second = loadMigration();
  const protectedApp = createApp();
  second.up(protectedApp);
  protectedApp.records.get('push_daily_stats').push(new FakeRecord('push_daily_stats', 'daily0000000001'));
  assert.throws(() => second.down(protectedApp), /unsafe_rollback_storefront_push_analytics_data/);
  assert.equal(protectedApp.collections.has('push_daily_stats'), true);
});

test('la migración declara índices únicos para tap, cupón y orden sin cascadas', () => {
  for (const marker of [
    'idx_push_events_delivery_tap_unique',
    'idx_push_events_coupon_unique',
    'idx_push_events_order_unique',
    'idx_storefront_order_links_order_unique',
    'unsafe_rollback_storefront_push_analytics_data',
    'PREVIOUS_RAW_RETENTION_DAYS = 180',
  ]) assert.equal(source.includes(marker), true, marker);
  assert.doesNotMatch(source, /cascadeDelete:\s*true/);
});
