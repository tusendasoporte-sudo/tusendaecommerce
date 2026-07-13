/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_OWN_STORE_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_OWN_STORE_RULE})`;

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const orders = app.findCollectionByNameOrId("orders");

  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385301", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385302", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385303", "max": 120, "min": 0, "name": "display_name", "pattern": "", "presentable": true, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385304", "max": 15, "min": 8, "name": "phone_normalized", "pattern": "^\\d{8,15}$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385305", "max": 128, "min": 0, "name": "phone_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "date1783385306", "max": "", "min": "", "name": "first_order_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1783385307", "max": "", "min": "", "name": "last_order_at", "presentable": true, "required": false, "system": false, "type": "date" },
      { "cascadeDelete": false, "collectionId": orders.id, "hidden": false, "id": "relation1783385308", "maxSelect": 1, "minSelect": 0, "name": "last_order", "presentable": false, "required": false, "system": false, "type": "relation" },
      { "default": 0, "hidden": false, "id": "number1783385309", "max": null, "min": 0, "name": "orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": 0, "hidden": false, "id": "number1783385310", "max": null, "min": 0, "name": "pending_orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": 0, "hidden": false, "id": "number1783385311", "max": null, "min": 0, "name": "confirmed_orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": 0, "hidden": false, "id": "number1783385312", "max": null, "min": 0, "name": "preparing_orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": 0, "hidden": false, "id": "number1783385313", "max": null, "min": 0, "name": "delivered_orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": 0, "hidden": false, "id": "number1783385314", "max": null, "min": 0, "name": "cancelled_orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": 0, "hidden": false, "id": "number1783385315", "max": null, "min": 0, "name": "confirmed_total_usd", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385316", "max": 240, "min": 0, "name": "last_address", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385317", "max": 120, "min": 0, "name": "last_municipality", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "default": "normal", "hidden": false, "id": "select1783385318", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["normal", "watch", "blocked"] },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385319", "max": 4000, "min": 0, "name": "internal_notes", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "autodate1783385320", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1783385321", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783385300",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_store_customers_store_phone` ON `store_customers` (`store`, `phone_normalized`)",
      "CREATE INDEX `idx_store_customers_store_status_updated` ON `store_customers` (`store`, `status`, `updated`)",
      "CREATE INDEX `idx_store_customers_store_last_order_at` ON `store_customers` (`store`, `last_order_at`)",
      "CREATE INDEX `idx_store_customers_phone_hmac` ON `store_customers` (`phone_hmac`)"
    ],
    "listRule": READ_RULE,
    "name": "store_customers",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": READ_RULE
  });

  return app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "store_customers");
  if (collection) return app.delete(collection);
});
