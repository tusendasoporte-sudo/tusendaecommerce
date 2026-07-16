const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const libraryPath = path.resolve(__dirname, '../pb_hooks/pz_master_store_deletion_lib.js');
const source = fs.readFileSync(libraryPath, 'utf8');
const sandbox = {
  module: { exports: {} },
  exports: {},
  Date,
  Error,
  Math,
  Object,
  String,
};

vm.runInNewContext(
  `${source}\n;globalThis.__deletionTestApi = { executeDeletionPlan, cleanPreservedMasterUsers, deleteExpected };`,
  sandbox,
  { filename: libraryPath },
);

const { executeDeletionPlan, cleanPreservedMasterUsers, deleteExpected } = sandbox.__deletionTestApi;

test('preserva la notificación personal y la cuenta Master relacionada por error', () => {
  const storeId = 'storetestm7ui11';
  const store = { collection: 'stores', id: storeId };
  const master = {
    collection: 'users', id: 'mastertestm7ui1', role: 'master_admin', store: storeId,
    set(key, value) { this[key] = value; },
  };
  const staff = { collection: 'users', id: 'stafftestm7ui11', role: 'store_staff', store: storeId };
  const notifications = [
    { collection: 'master_notifications', id: 'direct', store: storeId },
    { collection: 'master_notifications', id: 'product', store: '', product: { store: storeId } },
    { collection: 'master_notifications', id: 'staff', store: '', recipient: staff },
    { collection: 'master_notifications', id: 'master-personal', store: '', recipient: master },
  ];
  const records = {
    stores: [store],
    users: [master, staff],
    master_notifications: notifications,
  };

  const app = {
    findRecordsByFilter(collection, filter, _sort, _limit, _offset, params) {
      assert.equal(params.storeId, storeId);
      if (collection === 'master_notifications') {
        assert.match(filter, /recipient\.role = "store_admin"/);
        assert.match(filter, /recipient\.role = "store_staff"/);
        return records.master_notifications.filter((notification) => (
          notification.store === storeId
          || (notification.store === '' && notification.product?.store === storeId)
          || (
            notification.store === ''
            && notification.recipient?.store === storeId
            && ['store_admin', 'store_staff'].includes(notification.recipient.role)
          )
        ));
      }
      if (collection === 'users' && filter.includes('role = "master_admin"')) {
        return records.users.filter((user) => user.store === storeId && user.role === 'master_admin');
      }
      if (collection === 'users' && filter.includes('role = "store_admin"')) {
        return records.users.filter((user) => user.store === storeId && ['store_admin', 'store_staff'].includes(user.role));
      }
      return [];
    },
    delete(record) {
      const collection = records[record.collection];
      const index = collection.indexOf(record);
      if (index >= 0) collection.splice(index, 1);
    },
    save() {},
  };

  const counts = {
    master_notifications: 3,
    price_events: 0,
    price_watches: 0,
    coupon_usages: 0,
    order_items: 0,
    reviews: 0,
    product_variations: 0,
    raffle_entries: 0,
    visitor_pageviews: 0,
    user_device_audit: 0,
    user_devices: 0,
    customer_links: 0,
    customer_devices: 0,
    customer_phones: 0,
    security_events: 0,
    security_blocks: 0,
    security_audit: 0,
    visitor_sessions: 0,
    store_notifications: 0,
    analytics_events: 0,
    promotions: 0,
    coupons: 0,
    raffles: 0,
    gifts: 0,
    visual_items: 0,
    orders: 0,
    customers: 0,
    products: 0,
    subcategories: 0,
    categories: 0,
    shipping_zones: 0,
    settings: 0,
    currencies: 0,
    security_settings: 0,
  };

  assert.equal(executeDeletionPlan(app, storeId, counts), 3);
  assert.deepEqual(records.master_notifications.map((item) => item.id), ['master-personal']);
  assert.equal(cleanPreservedMasterUsers(app, storeId, 1), 1);
  assert.equal(master.store, '');
  assert.equal(deleteExpected(app, 'users', 'store = {:storeId} && (role = "store_admin" || role = "store_staff")', storeId, 1), 1);
  app.delete(store);

  assert.deepEqual(records.stores, []);
  assert.deepEqual(records.users, [master]);
  assert.deepEqual(records.master_notifications, [notifications[0]]);
});
