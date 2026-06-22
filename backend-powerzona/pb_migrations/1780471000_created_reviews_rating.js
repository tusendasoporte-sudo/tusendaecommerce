/// <reference path="../pb_data/types.d.ts" />


const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const REVIEW_OWNER_READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE}) || (${STORE_STAFF_READ_RULE})`;
const REVIEW_OWNER_WRITE_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE})`;

const STORE_ADMIN_ORDER_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_ORDER_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const STORE_ADMIN_ORDER_ITEM_RULE = '@request.auth.role = "store_admin" && order.store = @request.auth.store';
const STORE_STAFF_ORDER_ITEM_READ_RULE = '@request.auth.role = "store_staff" && order.store = @request.auth.store';

const PUBLIC_ORDER_RECEIPT_RULE = 'order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != ""';
const PUBLIC_ORDER_ITEM_RECEIPT_RULE = 'order.order_number = @request.query.order_number && order.receipt_token = @request.query.token && order.receipt_token != ""';
const PUBLIC_ORDER_REVIEW_RULE = 'review_token = @request.query.review_token && review_token != "" && review_requested_at != "" && status = "delivered"';
const PUBLIC_ORDER_ITEM_REVIEW_RULE = 'order.review_token = @request.query.review_token && order.review_token != "" && order.review_requested_at != "" && order.status = "delivered"';

const PUBLIC_STORE_REVIEW_CREATE_RULE = '@request.auth.id = "" && status = "pending" && verified_purchase = false && featured = false && source = "public_store" && type = "store" && store != "" && product = "" && order = ""';
const PUBLIC_PRODUCT_REVIEW_CREATE_RULE = '@request.auth.id = "" && status = "pending" && verified_purchase = false && featured = false && source = "public_product" && type = "product" && store != "" && product != "" && product.store = store && order = ""';
const PUBLIC_ORDER_REVIEW_CREATE_RULE = '@request.auth.id = "" && status = "pending" && source = "order_review_link" && verified_purchase = true && featured = false && order != "" && order.review_token = @request.query.review_token && order.review_token != "" && order.review_requested_at != "" && order.status = "delivered" && store = order.store && ((type = "store" && product = "") || (type = "product" && product != "" && product.store = order.store))';

const REVIEW_WHATSAPP_MESSAGE = "Hola {cliente} \ud83d\udc4b\n\nGracias por tu compra en {tienda}.\n\nNos ayudar\u00eda mucho si puedes dejar una rese\u00f1a sobre tu experiencia y los productos que recibiste.\n\nPuedes hacerlo aqu\u00ed:\n{link_rese\u00f1a}\n\nGracias \ud83d\ude4c";

const SETTINGS_FIELD_IDS = [
  "text1780471035",
  "number1780471034",
  "bool1780471032",
  "bool1780471031",
  "bool1780471030",
  "bool1780471029",
  "bool1780471028",
  "bool1780471027",
  "bool1780471026",
  "bool1780471025",
];

const ORDERS_FIELD_IDS = [
  "date1780471042",
  "date1780471041",
  "date1780471040",
  "number1780471039",
  "date1780471038",
  "text1780471037",
];

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

function addIndexIfNeeded(collection, indexName, unique, columns, where) {
  try {
    collection.getIndex(indexName);
  } catch (_) {
    collection.addIndex(indexName, unique, columns, where || "");
  }
}

function removeIndexIfExists(collection, indexName) {
  try {
    collection.removeIndex(indexName);
  } catch (_) {}
}

function removeFieldByIdIfExists(collection, fieldId) {
  try {
    collection.fields.removeById(fieldId);
  } catch (_) {}
}

function addBoolField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    "hidden": false,
    "id": id,
    "name": name,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool",
    "default": defaultValue
  }));
}

function addNumberField(collection, id, name, defaultValue, min, max, onlyInt) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    "hidden": false,
    "id": id,
    "max": max,
    "min": min,
    "name": name,
    "onlyInt": onlyInt,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
    "default": defaultValue
  }));
}

function addTextField(collection, id, name, max, defaultValue) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": id,
    "max": max,
    "min": 0,
    "name": name,
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text",
    "default": defaultValue || ""
  }));
}

function addDateField(collection, id, name) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    "hidden": false,
    "id": id,
    "max": "",
    "min": "",
    "name": name,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }));
}

function applyOrderRules(orders) {
  orders.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE}) || (${STORE_STAFF_ORDER_READ_RULE}) || (${PUBLIC_ORDER_RECEIPT_RULE}) || (${PUBLIC_ORDER_REVIEW_RULE})`;
  orders.viewRule = orders.listRule;
  orders.createRule = `(@request.auth.id = "") || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
  orders.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
  orders.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
}

function applyOrderItemsRules(orderItems) {
  orderItems.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE}) || (${STORE_STAFF_ORDER_ITEM_READ_RULE}) || (${PUBLIC_ORDER_ITEM_RECEIPT_RULE}) || (${PUBLIC_ORDER_ITEM_REVIEW_RULE})`;
  orderItems.viewRule = orderItems.listRule;
  orderItems.createRule = `(@request.auth.id = "") || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
  orderItems.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
  orderItems.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
}

function restoreOrderRules(orders) {
  orders.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE}) || (${STORE_STAFF_ORDER_READ_RULE}) || (${PUBLIC_ORDER_RECEIPT_RULE})`;
  orders.viewRule = orders.listRule;
  orders.createRule = `(@request.auth.id = "") || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
  orders.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
  orders.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_RULE})`;
}

function restoreOrderItemsRules(orderItems) {
  orderItems.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE}) || (${STORE_STAFF_ORDER_ITEM_READ_RULE}) || (${PUBLIC_ORDER_ITEM_RECEIPT_RULE})`;
  orderItems.viewRule = orderItems.listRule;
  orderItems.createRule = `(@request.auth.id = "") || (${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
  orderItems.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
  orderItems.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_ORDER_ITEM_RULE})`;
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const products = app.findCollectionByNameOrId("products");
  const orders = app.findCollectionByNameOrId("orders");

  addDateField(orders, "date1780471038", "delivered_at");
  addTextField(orders, "text1780471037", "review_token", 80, "");
  addDateField(orders, "date1780471040", "review_requested_at");
  addNumberField(orders, "number1780471039", "review_request_count", 0, 0, null, true);
  addDateField(orders, "date1780471041", "review_skipped_at");
  addDateField(orders, "date1780471042", "review_completed_at");
  addIndexIfNeeded(orders, "idx_orders_review_token", false, "review_token", "");
  applyOrderRules(orders);
  app.save(orders);

  const existingReviews = findCollectionSafe(app, "reviews");
  if (!existingReviews) {
    const reviews = new Collection({
      "id": "pbc_1780471000",
      "name": "reviews",
      "type": "base",
      "system": false,
      "listRule": `(status = "approved") || (${REVIEW_OWNER_READ_RULE})`,
      "viewRule": `(status = "approved") || (${REVIEW_OWNER_READ_RULE})`,
      "createRule": `(${PUBLIC_STORE_REVIEW_CREATE_RULE}) || (${PUBLIC_PRODUCT_REVIEW_CREATE_RULE}) || (${PUBLIC_ORDER_REVIEW_CREATE_RULE}) || (${REVIEW_OWNER_WRITE_RULE})`,
      "updateRule": REVIEW_OWNER_WRITE_RULE,
      "deleteRule": REVIEW_OWNER_WRITE_RULE,
      "indexes": [
        "CREATE INDEX `idx_reviews_store_status_type` ON `reviews` (`store`, `status`, `type`)",
        "CREATE INDEX `idx_reviews_product_status` ON `reviews` (`product`, `status`)",
        "CREATE INDEX `idx_reviews_order` ON `reviews` (`order`)",
        "CREATE INDEX `idx_reviews_source` ON `reviews` (`source`)",
        "CREATE INDEX `idx_reviews_verified_purchase` ON `reviews` (`verified_purchase`)"
      ],
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1780471001", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1780471002", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "hidden": false, "id": "select1780471003", "maxSelect": 1, "name": "type", "presentable": true, "required": true, "system": false, "type": "select", "values": ["store", "product"] },
        { "cascadeDelete": false, "collectionId": products.id, "hidden": false, "id": "relation1780471004", "maxSelect": 1, "minSelect": 0, "name": "product", "presentable": true, "required": false, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": orders.id, "hidden": false, "id": "relation1780471005", "maxSelect": 1, "minSelect": 0, "name": "order", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "hidden": false, "id": "number1780471006", "max": 5, "min": 1, "name": "rating", "onlyInt": true, "presentable": true, "required": true, "system": false, "type": "number" },
        { "autogeneratePattern": "", "hidden": false, "id": "text1780471007", "max": 120, "min": 1, "name": "customer_name", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": false, "id": "text1780471008", "max": 1200, "min": 0, "name": "comment", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "hidden": false, "id": "select1780471009", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["pending", "approved", "hidden", "rejected"], "default": "pending" },
        { "hidden": false, "id": "select1780471010", "maxSelect": 1, "name": "source", "presentable": false, "required": true, "system": false, "type": "select", "values": ["public_store", "public_product", "order_review_link", "admin_created"] },
        { "hidden": false, "id": "bool1780471011", "name": "verified_purchase", "presentable": true, "required": false, "system": false, "type": "bool", "default": false },
        { "hidden": false, "id": "bool1780471012", "name": "featured", "presentable": true, "required": false, "system": false, "type": "bool", "default": false },
        { "hidden": false, "id": "date1780471013", "max": "", "min": "", "name": "approved_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "hidden": false, "id": "autodate1780471014", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1780471015", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ]
    });

    app.save(reviews);
  }

  const settings = app.findCollectionByNameOrId("settings");
  addBoolField(settings, "bool1780471025", "reviews_enabled", true);
  addBoolField(settings, "bool1780471026", "store_reviews_enabled", true);
  addBoolField(settings, "bool1780471027", "product_reviews_enabled", true);
  addBoolField(settings, "bool1780471028", "verified_order_reviews_enabled", true);
  addBoolField(settings, "bool1780471029", "reviews_require_approval", true);
  addBoolField(settings, "bool1780471030", "show_store_rating", true);
  addBoolField(settings, "bool1780471031", "show_product_rating", true);
  addBoolField(settings, "bool1780471032", "show_verified_badge", true);
  addNumberField(settings, "number1780471034", "review_request_delay_hours", 24, 0, null, true);
  addTextField(settings, "text1780471035", "review_whatsapp_message", 0, REVIEW_WHATSAPP_MESSAGE);
  app.save(settings);

  const orderItems = app.findCollectionByNameOrId("order_items");
  applyOrderItemsRules(orderItems);
  app.save(orderItems);
}, (app) => {
  const reviews = findCollectionSafe(app, "reviews");
  if (reviews) {
    app.delete(reviews);
  }

  const settings = findCollectionSafe(app, "settings");
  if (settings) {
    SETTINGS_FIELD_IDS.forEach((fieldId) => removeFieldByIdIfExists(settings, fieldId));
    app.save(settings);
  }

  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    removeIndexIfExists(orders, "idx_orders_review_token");
    ORDERS_FIELD_IDS.forEach((fieldId) => removeFieldByIdIfExists(orders, fieldId));
    restoreOrderRules(orders);
    app.save(orders);
  }

  const orderItems = findCollectionSafe(app, "order_items");
  if (orderItems) {
    restoreOrderItemsRules(orderItems);
    app.save(orderItems);
  }
});
