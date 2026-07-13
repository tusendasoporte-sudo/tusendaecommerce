/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_ORDER_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_ORDER_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const PUBLIC_ORDER_RECEIPT_RULE = 'order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != ""';
const PUBLIC_ORDER_REVIEW_RULE = 'review_token = @request.query.review_token && review_token != "" && review_requested_at != "" && status = "delivered"';
const INTERNAL_IDENTITY_FIELDS_BLOCK_RULE = '@request.body.customer:isset = false && @request.body.security_registered_at:isset = false';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

function restoreOrderRules(orders) {
  orders.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE}) || (${STORE_STAFF_ORDER_READ_RULE}) || (${PUBLIC_ORDER_RECEIPT_RULE}) || (${PUBLIC_ORDER_REVIEW_RULE})`;
  orders.viewRule = orders.listRule;
  orders.createRule = `(@request.auth.id = "") || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
  orders.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
  orders.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
}

function applyProtectedOrderRules(orders) {
  restoreOrderRules(orders);
  orders.createRule = `((${orders.createRule}) && ${INTERNAL_IDENTITY_FIELDS_BLOCK_RULE})`;
  orders.updateRule = `((${orders.updateRule}) && ${INTERNAL_IDENTITY_FIELDS_BLOCK_RULE})`;
}

migrate((app) => {
  const orders = app.findCollectionByNameOrId("orders");
  const customers = app.findCollectionByNameOrId("store_customers");

  if (!hasField(orders, "customer")) {
    orders.fields.add(new Field({
      "cascadeDelete": false,
      "collectionId": customers.id,
      "hidden": true,
      "id": "relation1783385401",
      "maxSelect": 1,
      "minSelect": 0,
      "name": "customer",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "relation"
    }));
  }

  if (!hasField(orders, "security_registered_at")) {
    orders.fields.add(new Field({
      "hidden": true,
      "id": "date1783385402",
      "max": "",
      "min": "",
      "name": "security_registered_at",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "date"
    }));
  }

  applyProtectedOrderRules(orders);
  return app.save(orders);
}, (app) => {
  const orders = findCollectionSafe(app, "orders");
  if (!orders) return;

  removeFieldByIdIfExists(orders, "relation1783385401");
  removeFieldByIdIfExists(orders, "date1783385402");
  restoreOrderRules(orders);
  return app.save(orders);
});
