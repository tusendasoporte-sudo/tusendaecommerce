'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const hub = require('../pb_hooks/pz_storefront_customer_hub_lib.js');

const STORE = 'storehub0000001';
const INSTALLATION = 'installhub00001';
const OTHER_INSTALLATION = 'installhub00002';
const CAMPAIGN = 'campaignhub0001';
const DELIVERY = 'deliverhub00001';
const COUPON = 'couponhub000001';

class FakeRecord {
  constructor(collection, values = {}) {
    this.collection = typeof collection === 'string' ? collection : collection.name;
    this.values = { ...values };
    this.id = values.id || '';
  }
  get(key) { return key === 'id' ? this.id : this.values[key]; }
  set(key, value) { if (key === 'id') this.id = value; else this.values[key] = value; }
}

global.Record = FakeRecord;

function fixture() {
  const data = {
    storefront_installation_coupons: [],
    storefront_installations: [
      new FakeRecord('storefront_installations', { id: INSTALLATION, store: STORE, status: 'active' }),
      new FakeRecord('storefront_installations', { id: OTHER_INSTALLATION, store: STORE, status: 'active' }),
    ],
    push_campaigns: [new FakeRecord('push_campaigns', {
      id: CAMPAIGN, store: STORE, title: 'Oferta privada', body: 'Abre tu cupón',
      target_type: 'coupon', target_path: '/t/powerzona?coupon=AHORRA',
    })],
    push_campaign_deliveries: [new FakeRecord('push_campaign_deliveries', {
      id: DELIVERY, store: STORE, campaign: CAMPAIGN, installation: INSTALLATION,
      status: 'accepted', inbox_title: 'Oferta privada', inbox_body: 'Abre tu cupón',
      inbox_target_type: 'coupon', inbox_target_path: '/t/powerzona?coupon=AHORRA',
      inbox_expires_at: '2026-09-30T00:00:00.000Z', created: '2026-08-31T12:00:00.000Z',
    })],
    manual_coupons: [new FakeRecord('manual_coupons', {
      id: COUPON, store: STORE, code: 'AHORRA', active: true, unlimited_uses: true,
      scope: 'order', discount_type: 'percentage', discount_value: 10,
      customer_message: 'Ahorra 10% en tu pedido.', starts_at: '2026-08-01T00:00:00.000Z',
      ends_at: '2026-09-30T23:59:59.000Z', used_count: 0,
    })],
  };
  let sequence = 1;
  const app = {
    data,
    findCollectionByNameOrId(name) { return { name }; },
    findRecordById(collection, id) {
      const record = (data[collection] || []).find((item) => item.id === id);
      if (!record) throw new Error('not_found');
      return record;
    },
    findFirstRecordByFilter(collection, _filter, params = {}) {
      const record = this.findRecordsByFilter(collection, _filter, '', 500, 0, params)[0];
      if (!record) throw new Error('not_found');
      return record;
    },
    findRecordsByFilter(collection, filter, _sort, limit, _offset, params = {}) {
      let rows = (data[collection] || []).slice();
      if (params.installation) rows = rows.filter((item) => item.get('installation') === params.installation);
      if (params.code) rows = rows.filter((item) => item.get('coupon_code') === params.code || item.get('code') === params.code);
      if (params.store) rows = rows.filter((item) => item.get('store') === params.store);
      if (filter.includes('status = "accepted"')) rows = rows.filter((item) => item.get('status') === 'accepted');
      if (filter.includes('status = "active"')) rows = rows.filter((item) => item.get('status') === 'active');
      if (filter.includes('selected = true')) rows = rows.filter((item) => item.get('selected') === true);
      return rows.slice(0, limit);
    },
    save(record) {
      if (!record.id) record.id = `wallethub${String(sequence++).padStart(6, '0')}`;
      const rows = data[record.collection] || (data[record.collection] = []);
      if (!rows.includes(record)) rows.push(record);
      return record;
    },
  };
  const session = {
    storeId: STORE,
    installation: data.storefront_installations[0],
    appConfig: new FakeRecord('storefront_app_configs', { id: 'appconfighub001', store: STORE, store_path_prefix: '/t/powerzona' }),
  };
  return { app, session };
}

test('bandeja lista solo la entrega de la instalación y conserva el destino cupón', () => {
  const { app, session } = fixture();
  const state = hub.hubState(app, session, new Date('2026-08-31T14:00:00.000Z'));
  assert.equal(state.inbox.items.length, 1);
  assert.equal(state.inbox.unread_count, 1);
  assert.equal(state.inbox.items[0].coupon_code, 'AHORRA');
  assert.equal(state.inbox.items[0].target_path, '/t/powerzona?coupon=AHORRA');
});

test('leer y borrar una notificación nunca afecta otra instalación', () => {
  const { app, session } = fixture();
  const now = new Date('2026-08-31T14:00:00.000Z');
  hub.mutateHub(app, session, { action: 'notification_mark_read', notification_id: DELIVERY }, now);
  assert.ok(app.data.push_campaign_deliveries[0].get('inbox_read_at'));
  session.installation = app.data.storefront_installations[1];
  assert.throws(
    () => hub.mutateHub(app, session, { action: 'notification_delete', notification_id: DELIVERY }, now),
    (error) => error.code === 'notification_not_found',
  );
});

test('el borrado de leídas conserva las pendientes y la retención excluye vencidas', () => {
  const { app, session } = fixture();
  const now = new Date('2026-08-31T14:00:00.000Z');
  const second = new FakeRecord('push_campaign_deliveries', {
    id: 'deliverhub00002', store: STORE, campaign: CAMPAIGN, installation: INSTALLATION,
    status: 'accepted', inbox_title: 'Segunda', inbox_body: 'Pendiente',
    inbox_target_type: 'home', inbox_target_path: '/t/powerzona',
    inbox_expires_at: '2026-09-30T00:00:00.000Z', created: '2026-08-31T13:00:00.000Z',
  });
  app.data.push_campaign_deliveries.push(second);
  hub.mutateHub(app, session, { action: 'notification_mark_read', notification_id: DELIVERY }, now);
  hub.mutateHub(app, session, { action: 'notifications_delete', scope: 'read' }, now);
  let state = hub.hubState(app, session, now);
  assert.deepEqual(state.inbox.items.map((item) => item.id), [second.id]);
  assert.equal(state.inbox.unread_count, 1);

  second.set('inbox_expires_at', '2026-08-30T23:59:59.000Z');
  state = hub.hubState(app, session, now);
  assert.equal(state.inbox.items.length, 0);
});

test('cada mutación rechaza campos adicionales para cerrar el contrato', () => {
  const { app, session } = fixture();
  assert.throws(
    () => hub.mutateHub(app, session, {
      action: 'notification_mark_read', notification_id: DELIVERY, installation: OTHER_INSTALLATION,
    }, new Date('2026-08-31T14:00:00.000Z')),
    (error) => error.code === 'invalid_payload',
  );
});

test('adquirir es idempotente, selecciona un solo cupón y la orden lo marca usado', () => {
  const { app, session } = fixture();
  const now = new Date('2026-08-31T14:00:00.000Z');
  const payload = { action: 'coupon_claim', code: 'ahorra', source: 'link' };
  hub.mutateHub(app, session, payload, now);
  hub.mutateHub(app, session, payload, now);
  assert.equal(app.data.storefront_installation_coupons.length, 1);
  let state = hub.hubState(app, session, now);
  assert.equal(state.coupons.selected_code, 'AHORRA');
  assert.equal(state.coupons.items[0].selected, true);

  hub.markCouponUsed(app, session, 'AHORRA', now);
  state = hub.hubState(app, session, now);
  assert.equal(state.coupons.items.length, 0);
  assert.equal(app.data.storefront_installation_coupons[0].get('status'), 'used');
});

test('un cupón vencido no puede incorporarse a la cartera', () => {
  const { app, session } = fixture();
  app.data.manual_coupons[0].set('ends_at', '2026-08-01T00:00:00.000Z');
  assert.throws(
    () => hub.mutateHub(app, session, { action: 'coupon_claim', code: 'AHORRA', source: 'code' }, new Date('2026-08-31T14:00:00.000Z')),
    (error) => error.code === 'coupon_expired',
  );
});
