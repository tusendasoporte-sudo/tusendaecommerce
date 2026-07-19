/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_ORDER_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_ADMIN_ORDER_ITEM_RULE = '@request.auth.role = "store_admin" && order.store = @request.auth.store';
const COUPON_USAGE_WRITE_RULE = `(${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && (coupon.store = @request.auth.store || order.store = @request.auth.store))`;
const PUBLIC_CREATE_RULE = '@request.auth.id = ""';
const INTERNAL_IDENTITY_FIELDS_BLOCK_RULE = '@request.body.customer:isset = false && @request.body.security_registered_at:isset = false && @request.body.security_identity_erased_at:isset = false';

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function addIndexIfNeeded(collection, name, unique, columns, where) {
  try {
    collection.getIndex(name);
  } catch (_) {
    collection.addIndex(name, unique, columns, where || "");
  }
}

function removeIndexIfExists(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

migrate((app) => {
  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    orders.createRule = `((${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})) && ${INTERNAL_IDENTITY_FIELDS_BLOCK_RULE}`;
    addIndexIfNeeded(orders, "idx_orders_store_receipt_token", true, "store, receipt_token", "receipt_token != ''");
    app.save(orders);
  }

  const orderItems = findCollectionSafe(app, "order_items");
  if (orderItems) {
    orderItems.createRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    app.save(orderItems);
  }

  const couponUsages = findCollectionSafe(app, "manual_coupon_usages");
  if (couponUsages) {
    couponUsages.createRule = COUPON_USAGE_WRITE_RULE;
    app.save(couponUsages);
  }
}, (app) => {
  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    removeIndexIfExists(orders, "idx_orders_store_receipt_token");
    orders.createRule = `((${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})) && ${INTERNAL_IDENTITY_FIELDS_BLOCK_RULE}`;
    app.save(orders);
  }

  const orderItems = findCollectionSafe(app, "order_items");
  if (orderItems) {
    orderItems.createRule = `(${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
    app.save(orderItems);
  }

  const couponUsages = findCollectionSafe(app, "manual_coupon_usages");
  if (couponUsages) {
    couponUsages.createRule = `(${PUBLIC_CREATE_RULE}) || (${COUPON_USAGE_WRITE_RULE})`;
    app.save(couponUsages);
  }
});
