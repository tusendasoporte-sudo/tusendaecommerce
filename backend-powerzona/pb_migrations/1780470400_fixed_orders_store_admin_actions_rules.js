/// <reference path="../pb_data/types.d.ts" />

// PZ-HOTFIX-21-30-18-ORDER-ADMIN-ACTIONS-20260613
// Permite que store_admin gestione pedidos de su propia tienda sin superuser.
// Mantiene el checkout publico y el comprobante publico por token.

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_ORDER_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_ORDER_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const STORE_ADMIN_ORDER_ITEM_RULE = '@request.auth.role = "store_admin" && order.store = @request.auth.store';
const STORE_STAFF_ORDER_ITEM_READ_RULE = '@request.auth.role = "store_staff" && order.store = @request.auth.store';
const PUBLIC_ORDER_RECEIPT_RULE = 'order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != ""';
const PUBLIC_ORDER_ITEM_RECEIPT_RULE = 'order.order_number = @request.query.order_number && order.receipt_token = @request.query.token && order.receipt_token != ""';
const PUBLIC_CREATE_RULE = '@request.auth.id = ""';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
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

  const gifts = findCollectionSafe(app, "gifts");
  if (gifts) {
    const giftReadRule = `(active = true) || (${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && store = @request.auth.store) || (@request.auth.role = "store_staff" && store = @request.auth.store)`;
    const giftWriteRule = `(${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && store = @request.auth.store)`;
    gifts.listRule = giftReadRule;
    gifts.viewRule = giftReadRule;
    gifts.createRule = giftWriteRule;
    gifts.updateRule = giftWriteRule;
    gifts.deleteRule = giftWriteRule;
    app.save(gifts);
  }
}, (app) => {
  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    orders.listRule = '@request.auth.id != "" || (order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != "")';
    orders.viewRule = orders.listRule;
    orders.createRule = '@request.auth.id = "" || @request.auth.id != ""';
    orders.updateRule = null;
    orders.deleteRule = null;
    app.save(orders);
  }

  const orderItems = findCollectionSafe(app, "order_items");
  if (orderItems) {
    orderItems.listRule = '@request.auth.id != "" || (order.order_number = @request.query.order_number && order.receipt_token = @request.query.token && order.receipt_token != "")';
    orderItems.viewRule = orderItems.listRule;
    orderItems.createRule = '@request.auth.id = "" || @request.auth.id != ""';
    orderItems.updateRule = null;
    orderItems.deleteRule = null;
    app.save(orderItems);
  }

  const gifts = findCollectionSafe(app, "gifts");
  if (gifts) {
    gifts.listRule = "active = true";
    gifts.viewRule = "active = true";
    gifts.createRule = null;
    gifts.updateRule = null;
    gifts.deleteRule = null;
    app.save(gifts);
  }
});
