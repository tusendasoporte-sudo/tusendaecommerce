/// <reference path="../pb_data/types.d.ts" />


migrate((app) => {
  const coupons = new Collection({
    "createRule": '@request.auth.id != ""',
    "deleteRule": '@request.auth.id != ""',
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1780468201", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780468202", "max": 40, "min": 2, "name": "code", "pattern": "^[A-Za-z0-9_-]+$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780468203", "max": 140, "min": 1, "name": "name", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780468204", "max": 220, "min": 0, "name": "customer_message", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "bool1780468205", "name": "active", "presentable": true, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "select1780468206", "maxSelect": 1, "name": "scope", "presentable": true, "required": true, "system": false, "type": "select", "values": ["cart", "product", "category", "subcategory", "free_shipping"] },
      { "hidden": false, "id": "select1780468207", "maxSelect": 1, "name": "discount_type", "presentable": false, "required": false, "system": false, "type": "select", "values": ["percentage", "fixed_usd"] },
      { "hidden": false, "id": "number1780468208", "max": null, "min": 0, "name": "discount_value", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780468209", "max": null, "min": 0, "name": "min_subtotal_usd", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" },
      { "cascadeDelete": false, "collectionId": "pbc_4092854851", "hidden": false, "id": "relation1780468210", "maxSelect": 1, "minSelect": 0, "name": "product", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": "pbc_3292755704", "hidden": false, "id": "relation1780468211", "maxSelect": 1, "minSelect": 0, "name": "category", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": "pbc_2354486458", "hidden": false, "id": "relation1780468212", "maxSelect": 1, "minSelect": 0, "name": "subcategory", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "hidden": false, "id": "date1780468213", "max": "", "min": "", "name": "starts_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1780468214", "max": "", "min": "", "name": "ends_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "bool1780468215", "name": "unlimited_uses", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "number1780468216", "max": null, "min": 0, "name": "max_uses", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780468217", "max": null, "min": 0, "name": "used_count", "onlyInt": true, "presentable": true, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "autodate1780468218", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1780468219", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1780468200",
    "indexes": ["CREATE UNIQUE INDEX `idx_manual_coupons_code` ON `manual_coupons` (`code`)"],
    "listRule": 'active = true || @request.auth.id != ""',
    "name": "manual_coupons",
    "system": false,
    "type": "base",
    "updateRule": '@request.auth.id = "" || @request.auth.id != ""',
    "viewRule": 'active = true || @request.auth.id != ""'
  });
  app.save(coupons);

  const usages = new Collection({
    "createRule": '@request.auth.id = "" || @request.auth.id != ""',
    "deleteRule": '@request.auth.id != ""',
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1780468220", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": "pbc_1780468200", "hidden": false, "id": "relation1780468221", "maxSelect": 1, "minSelect": 1, "name": "coupon", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": "pbc_3527180448", "hidden": false, "id": "relation1780468222", "maxSelect": 1, "minSelect": 1, "name": "order", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780468223", "max": 60, "min": 0, "name": "coupon_code", "pattern": "", "presentable": true, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780468224", "max": 160, "min": 0, "name": "customer_name", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780468225", "max": 60, "min": 0, "name": "order_number", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "number1780468226", "max": null, "min": 0, "name": "discount_usd", "onlyInt": false, "presentable": true, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780468227", "max": null, "min": 0, "name": "shipping_discount_usd", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "autodate1780468228", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1780468229", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1780468201",
    "indexes": [],
    "listRule": '@request.auth.id != ""',
    "name": "manual_coupon_usages",
    "system": false,
    "type": "base",
    "updateRule": '@request.auth.id != ""',
    "viewRule": '@request.auth.id != ""'
  });
  app.save(usages);

  const orders = app.findCollectionByNameOrId("orders");
  [
    ["number1780468230", "coupon_discount_usd"],
    ["number1780468231", "shipping_original_usd"],
    ["number1780468232", "shipping_discount_usd"]
  ].forEach(([id, name]) => {
    try { orders.fields.getByName(name); } catch (_) {
      orders.fields.add(new Field({ "hidden": false, "id": id, "max": null, "min": 0, "name": name, "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));
    }
  });
  [
    ["text1780468233", "coupon_id", 80],
    ["text1780468234", "coupon_code", 60],
    ["text1780468235", "coupon_summary", 0]
  ].forEach(([id, name, max]) => {
    try { orders.fields.getByName(name); } catch (_) {
      orders.fields.add(new Field({ "autogeneratePattern": "", "hidden": false, "id": id, "max": max, "min": 0, "name": name, "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" }));
    }
  });
  app.save(orders);

  const orderItems = app.findCollectionByNameOrId("order_items");
  try { orderItems.fields.getByName("coupon_discount_usd"); } catch (_) {
    orderItems.fields.add(new Field({ "hidden": false, "id": "number1780468236", "max": null, "min": 0, "name": "coupon_discount_usd", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));
  }
  ["coupon_id", "coupon_code"].forEach((name, index) => {
    try { orderItems.fields.getByName(name); } catch (_) {
      orderItems.fields.add(new Field({ "autogeneratePattern": "", "hidden": false, "id": `text178046823${7 + index}`, "max": 80, "min": 0, "name": name, "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" }));
    }
  });
  app.save(orderItems);
}, (app) => {
  const usages = app.findCollectionByNameOrId("pbc_1780468201");
  if (usages) app.delete(usages);
  const coupons = app.findCollectionByNameOrId("pbc_1780468200");
  if (coupons) app.delete(coupons);
});
