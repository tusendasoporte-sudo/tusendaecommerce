/// <reference path="../pb_data/types.d.ts" />


const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const STORE_OWNER_READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE}) || (${STORE_STAFF_READ_RULE})`;
const STORE_OWNER_WRITE_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE})`;
const PUBLIC_ACTIVE_OR_STORE_READ_RULE = `(active = true) || (${STORE_OWNER_READ_RULE})`;

const STORE_ADMIN_ORDER_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_ORDER_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const STORE_ADMIN_ORDER_ITEM_RULE = '@request.auth.role = "store_admin" && order.store = @request.auth.store';
const STORE_STAFF_ORDER_ITEM_READ_RULE = '@request.auth.role = "store_staff" && order.store = @request.auth.store';
const PUBLIC_ORDER_RECEIPT_RULE = 'order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != ""';
const PUBLIC_ORDER_ITEM_RECEIPT_RULE = 'order.order_number = @request.query.order_number && order.receipt_token = @request.query.token && order.receipt_token != ""';
const PUBLIC_CREATE_RULE = '@request.auth.id = ""';

const COUPON_USAGE_READ_RULE = `(${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && (coupon.store = @request.auth.store || order.store = @request.auth.store)) || (@request.auth.role = "store_staff" && (coupon.store = @request.auth.store || order.store = @request.auth.store))`;
const COUPON_USAGE_WRITE_RULE = `(${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && (coupon.store = @request.auth.store || order.store = @request.auth.store))`;

const STORE_INDEXES = [
  ["settings", "idx_settings_store"],
  ["shipping_zones", "idx_shipping_zones_store"],
  ["gifts", "idx_gifts_store"],
  ["manual_coupons", "idx_manual_coupons_store"],
  ["automatic_promotions", "idx_automatic_promotions_store"],
];

const STORE_SCOPED_ACTIVE_COLLECTIONS = [
  "shipping_zones",
  "automatic_promotions",
  "manual_coupons",
  "gifts",
  "settings",
];

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function addIndexIfNeeded(collection, indexName, unique, columns) {
  try {
    collection.getIndex(indexName);
    return;
  } catch (_) {
    collection.addIndex(indexName, unique, columns, "");
  }
}

function removeIndexIfExists(collection, indexName) {
  try {
    collection.removeIndex(indexName);
  } catch (_) {}
}

function applyActiveStoreRules(collection) {
  collection.listRule = PUBLIC_ACTIVE_OR_STORE_READ_RULE;
  collection.viewRule = PUBLIC_ACTIVE_OR_STORE_READ_RULE;
  collection.createRule = STORE_OWNER_WRITE_RULE;
  collection.updateRule = STORE_OWNER_WRITE_RULE;
  collection.deleteRule = STORE_OWNER_WRITE_RULE;
}

migrate((app) => {
  STORE_SCOPED_ACTIVE_COLLECTIONS.forEach((collectionName) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    applyActiveStoreRules(collection);
    app.save(collection);
  });

  const couponUsages = findCollectionSafe(app, "manual_coupon_usages");
  if (couponUsages) {
    couponUsages.listRule = COUPON_USAGE_READ_RULE;
    couponUsages.viewRule = COUPON_USAGE_READ_RULE;
    couponUsages.createRule = `(${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${COUPON_USAGE_WRITE_RULE})`;
    couponUsages.updateRule = COUPON_USAGE_WRITE_RULE;
    couponUsages.deleteRule = COUPON_USAGE_WRITE_RULE;
    app.save(couponUsages);
  }

  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    orders.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE}) || (${STORE_STAFF_ORDER_READ_RULE}) || (${PUBLIC_ORDER_RECEIPT_RULE})`;
    orders.viewRule = orders.listRule;
    orders.createRule = `(${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
    orders.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
    orders.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
    app.save(orders);
  }

  const orderItems = findCollectionSafe(app, "order_items");
  if (orderItems) {
    orderItems.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE}) || (${STORE_STAFF_ORDER_ITEM_READ_RULE}) || (${PUBLIC_ORDER_ITEM_RECEIPT_RULE})`;
    orderItems.viewRule = orderItems.listRule;
    orderItems.createRule = `(${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    orderItems.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    orderItems.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    app.save(orderItems);
  }

  STORE_INDEXES.forEach(([collectionName, indexName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    addIndexIfNeeded(collection, indexName, false, "store");
    app.save(collection);
  });

  const coupons = findCollectionSafe(app, "manual_coupons");
  if (coupons) {
    removeIndexIfExists(coupons, "idx_manual_coupons_code");
    addIndexIfNeeded(coupons, "idx_manual_coupons_store_code", true, "store, code");
    app.save(coupons);
  }
}, (app) => {
  STORE_SCOPED_ACTIVE_COLLECTIONS.forEach((collectionName) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    collection.listRule = 'active = true || @request.auth.id != ""';
    collection.viewRule = 'active = true || @request.auth.id != ""';
    collection.createRule = '@request.auth.id != ""';
    collection.updateRule = '@request.auth.id != ""';
    collection.deleteRule = '@request.auth.id != ""';
    app.save(collection);
  });

  const couponUsages = findCollectionSafe(app, "manual_coupon_usages");
  if (couponUsages) {
    couponUsages.listRule = '@request.auth.id != ""';
    couponUsages.viewRule = '@request.auth.id != ""';
    couponUsages.createRule = '@request.auth.id = "" || @request.auth.id != ""';
    couponUsages.updateRule = '@request.auth.id != ""';
    couponUsages.deleteRule = '@request.auth.id != ""';
    app.save(couponUsages);
  }

  const coupons = findCollectionSafe(app, "manual_coupons");
  if (coupons) {
    removeIndexIfExists(coupons, "idx_manual_coupons_store_code");
    addIndexIfNeeded(coupons, "idx_manual_coupons_code", true, "code");
    app.save(coupons);
  }
});
