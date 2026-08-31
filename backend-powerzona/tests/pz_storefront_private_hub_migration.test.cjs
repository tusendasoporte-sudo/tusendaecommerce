'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const migrationPath = path.resolve(__dirname, '../pb_migrations/1787700000_storefront_private_inbox_coupon_wallet.js');
const source = fs.readFileSync(migrationPath, 'utf8');

class FakeFields extends Array {
  add(field) { this.push(field); }
  getByName(name) {
    const field = this.find((item) => item.name === name);
    if (!field) throw new Error('not_found');
    return field;
  }
  removeById(id) {
    const index = this.findIndex((item) => item.id === id);
    if (index >= 0) this.splice(index, 1);
  }
}

class FakeField { constructor(values) { Object.assign(this, values); } }
class FakeCollection {
  constructor(values) {
    Object.assign(this, values);
    this.fields = FakeFields.from(values.fields || []);
  }
}

class FakeRecord {
  constructor(values) { this.values = { ...values }; this.id = values.id; }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  set(key, value) { this.values[key] = value; }
}

test('migración crea cartera cerrada y retroalimenta la bandeja de entregas existentes', () => {
  let up;
  let down;
  vm.runInNewContext(source, {
    Collection: FakeCollection,
    Field: FakeField,
    Date,
    Error,
    Object,
    String,
    Array,
    migrate(forward, rollback) { up = forward; down = rollback; },
  }, { filename: migrationPath });

  const campaign = new FakeRecord({
    id: 'campaignhub0001', title: 'Oferta', body: 'Mensaje', target_type: 'coupon',
    target_path: '/t/powerzona?coupon=AHORRA',
  });
  const delivery = new FakeRecord({
    id: 'deliverhub00001', campaign: campaign.id, created: '2026-08-31T12:00:00.000Z',
  });
  const collections = new Map([
    ['stores', { id: 'pbc_stores', name: 'stores' }],
    ['storefront_installations', { id: 'pbc_installations', name: 'storefront_installations' }],
    ['manual_coupons', { id: 'pbc_coupons', name: 'manual_coupons' }],
    ['push_campaign_deliveries', new FakeCollection({ id: 'pbc_deliveries', name: 'push_campaign_deliveries', fields: [], indexes: [] })],
  ]);
  const app = {
    findCollectionByNameOrId(name) {
      const value = collections.get(name);
      if (!value) throw new Error('not_found');
      return value;
    },
    findRecordsByFilter(name, _filter, _sort, _limit, offset) {
      if (name === 'push_campaign_deliveries') return offset ? [] : [delivery];
      return [];
    },
    findRecordById(name, id) {
      if (name === 'push_campaigns' && id === campaign.id) return campaign;
      throw new Error('not_found');
    },
    save(value) {
      if (value && value.name) collections.set(value.name, value);
      return value;
    },
    delete(value) { collections.delete(value.name); },
  };

  up(app);
  const wallet = collections.get('storefront_installation_coupons');
  assert.ok(wallet);
  assert.equal(wallet.listRule, null);
  assert.equal(wallet.viewRule, null);
  assert.ok(wallet.indexes.some((index) => index.includes('idx_storefront_installation_coupons_selected')));
  const deliveries = collections.get('push_campaign_deliveries');
  assert.ok(deliveries.fields.getByName('inbox_read_at'));
  assert.ok(deliveries.fields.getByName('inbox_expires_at'));
  assert.equal(delivery.get('inbox_title'), 'Oferta');
  assert.equal(delivery.get('inbox_target_path'), '/t/powerzona?coupon=AHORRA');
  assert.equal(delivery.get('inbox_expires_at'), '2026-09-30T12:00:00.000Z');

  down(app);
  assert.equal(collections.has('storefront_installation_coupons'), false);
  assert.throws(() => deliveries.fields.getByName('inbox_title'), /not_found/);
  assert.equal(deliveries.indexes.some((index) => index.includes('idx_push_deliveries_private_inbox')), false);
});
