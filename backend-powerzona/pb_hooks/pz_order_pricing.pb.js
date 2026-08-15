/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/checkout/orders",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleCheckout(e),
  $apis.bodyLimit(65536),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/checkout/coupon-attribution",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleCouponAttribution(e),
  $apis.bodyLimit(65536),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/admin/orders/{orderId}/transition",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderTransition(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/admin/orders/{orderId}/receipt-token",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderReceiptToken(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/admin/orders/{orderId}/review-token",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderReviewToken(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "DELETE",
  "/api/pz/admin/orders/{orderId}",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderDelete(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "PATCH",
  "/api/pz/admin/orders/{orderId}/items/{itemId}/quantity",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderItemQuantity(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/admin/orders/{orderId}/items",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderItemAdd(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "DELETE",
  "/api/pz/admin/orders/{orderId}/items/{itemId}",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderItemDelete(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/admin/orders/{orderId}/items/{itemId}/price-adjustments",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderItemAdjustment(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/admin/orders/{orderId}/items/{itemId}/price-adjustments/reset",
  (e) => require(`${__hooks}/pz_order_pricing_lib.js`).handleOrderItemAdjustmentReset(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_order_pricing_lib.js`);
  const safe = lib.canonicalizeOrderItemRecord(e.app, e.record, new Date());
  if (safe) lib.raiseOrderRequestError(safe);
  return e.next();
}, "order_items");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_order_pricing_lib.js`);
  const safe = lib.canonicalizeOrderItemRecord(e.app, e.record, new Date());
  if (safe) lib.raiseOrderRequestError(safe);
  return e.next();
}, "order_items");

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_order_pricing_lib.js`);
  const safe = lib.canonicalizeOrderRecord(e.app, e.record);
  if (safe) lib.raiseOrderRequestError(safe);
  return e.next();
}, "orders");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_order_pricing_lib.js`);
  const safe = lib.canonicalizeOrderRecord(e.app, e.record);
  if (safe) lib.raiseOrderRequestError(safe);
  return e.next();
}, "orders");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_order_pricing_lib.js`).recalculateOrderAfterItemMutation(e);
}, "order_items");

onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_order_pricing_lib.js`).recalculateOrderAfterItemMutation(e);
}, "order_items");

onRecordAfterDeleteSuccess((e) => {
  return require(`${__hooks}/pz_order_pricing_lib.js`).recalculateOrderAfterItemMutation(e);
}, "order_items");
