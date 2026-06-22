/// <reference path="../pb_data/types.d.ts" />


migrate((app) => {
  const collection = new Collection({
    "createRule": '@request.auth.id != ""',
    "deleteRule": '@request.auth.id != ""',
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1780467601", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780467602", "max": 140, "min": 1, "name": "name", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "bool1780467603", "name": "active", "presentable": true, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "select1780467604", "maxSelect": 1, "name": "type", "presentable": true, "required": true, "system": false, "type": "select", "values": ["buy_x_pay_y", "volume_discount", "product_discount", "category_discount", "subcategory_discount", "cart_subtotal_discount"] },
      { "hidden": false, "id": "select1780467605", "maxSelect": 1, "name": "scope", "presentable": true, "required": true, "system": false, "type": "select", "values": ["product", "category", "subcategory", "cart"] },
      { "hidden": false, "id": "select1780467606", "maxSelect": 1, "name": "discount_type", "presentable": true, "required": false, "system": false, "type": "select", "values": ["percentage", "fixed_usd"] },
      { "hidden": false, "id": "number1780467607", "max": null, "min": 0, "name": "discount_value", "onlyInt": false, "presentable": true, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780467608", "max": null, "min": 0, "name": "buy_qty", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780467609", "max": null, "min": 0, "name": "pay_qty", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780467610", "max": null, "min": 0, "name": "min_qty", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780467611", "max": null, "min": 0, "name": "min_subtotal_usd", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" },
      { "cascadeDelete": false, "collectionId": "pbc_4092854851", "hidden": false, "id": "relation1780467612", "maxSelect": 1, "minSelect": 0, "name": "product", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": "pbc_3292755704", "hidden": false, "id": "relation1780467613", "maxSelect": 1, "minSelect": 0, "name": "category", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": "pbc_2354486458", "hidden": false, "id": "relation1780467614", "maxSelect": 1, "minSelect": 0, "name": "subcategory", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "hidden": false, "id": "date1780467615", "max": "", "min": "", "name": "starts_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1780467616", "max": "", "min": "", "name": "ends_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780467617", "max": 160, "min": 0, "name": "badge_text", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "number1780467618", "max": null, "min": 0, "name": "priority", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "bool1780467619", "name": "stackable", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "autodate1780467620", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1780467621", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1780467600",
    "indexes": [],
    "listRule": 'active = true || @request.auth.id != ""',
    "name": "automatic_promotions",
    "system": false,
    "type": "base",
    "updateRule": '@request.auth.id != ""',
    "viewRule": 'active = true || @request.auth.id != ""'
  });

  app.save(collection);

  const orders = app.findCollectionByNameOrId("orders");
  [
    ["number1780467622", "subtotal_original_usd", "number"],
    ["number1780467623", "discount_total_usd", "number"],
    ["number1780467624", "subtotal_after_discount_usd", "number"],
  ].forEach(([id, name]) => {
    try { orders.fields.getByName(name); } catch (_) {
      orders.fields.add(new Field({ "hidden": false, "id": id, "max": null, "min": 0, "name": name, "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));
    }
  });
  try { orders.fields.getByName("promotion_summary"); } catch (_) {
    orders.fields.add(new Field({ "autogeneratePattern": "", "hidden": false, "id": "text1780467625", "max": 0, "min": 0, "name": "promotion_summary", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" }));
  }
  app.save(orders);

  const orderItems = app.findCollectionByNameOrId("order_items");
  [
    ["number1780467626", "unit_price_original_usd"],
    ["number1780467627", "unit_price_final_usd"],
    ["number1780467628", "line_subtotal_original_usd"],
    ["number1780467629", "line_discount_usd"],
    ["number1780467630", "line_subtotal_final_usd"],
  ].forEach(([id, name]) => {
    try { orderItems.fields.getByName(name); } catch (_) {
      orderItems.fields.add(new Field({ "hidden": false, "id": id, "max": null, "min": 0, "name": name, "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" }));
    }
  });
  [
    ["text1780467631", "promotion_id", 80],
    ["text1780467632", "promotion_name", 180],
    ["text1780467633", "promotion_type", 80],
  ].forEach(([id, name, max]) => {
    try { orderItems.fields.getByName(name); } catch (_) {
      orderItems.fields.add(new Field({ "autogeneratePattern": "", "hidden": false, "id": id, "max": max, "min": 0, "name": name, "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" }));
    }
  });
  app.save(orderItems);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1780467600");
  if (collection) app.delete(collection);
});
