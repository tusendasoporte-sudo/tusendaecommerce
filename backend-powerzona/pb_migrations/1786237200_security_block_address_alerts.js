/// <reference path="../pb_data/types.d.ts" />

const EVENT_TYPE = "blocked_address_match";
const NOTIFICATION_TYPE = "security_address_match";

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function addSelectValue(collection, fieldName, value) {
  const field = collection.fields.getByName(fieldName);
  const values = Array.isArray(field.values) ? field.values.slice() : [];
  if (!values.includes(value)) values.push(value);
  field.values = values;
}

function removeSelectValue(collection, fieldName, value) {
  const field = collection.fields.getByName(fieldName);
  field.values = (Array.isArray(field.values) ? field.values : []).filter((item) => item !== value);
}

function deleteByFilter(app, collection, filter, params) {
  while (true) {
    const records = app.findRecordsByFilter(collection, filter, "id", 200, 0, params || {}) || [];
    if (!records.length) return;
    records.forEach((record) => app.delete(record));
  }
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const customers = app.findCollectionByNameOrId("store_customers");
  const orders = app.findCollectionByNameOrId("orders");
  const blocks = app.findCollectionByNameOrId("store_security_blocks");

  if (!findCollectionSafe(app, "store_security_block_addresses")) {
    const collection = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1786237201", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": true, "collectionId": stores.id, "hidden": false, "id": "relation1786237202", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": false, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": true, "collectionId": blocks.id, "hidden": false, "id": "relation1786237203", "maxSelect": 1, "minSelect": 1, "name": "block", "presentable": false, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": customers.id, "hidden": true, "id": "relation1786237204", "maxSelect": 1, "minSelect": 0, "name": "source_customer", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": orders.id, "hidden": true, "id": "relation1786237205", "maxSelect": 1, "minSelect": 0, "name": "source_order", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1786237206", "max": 128, "min": 64, "name": "address_hmac", "pattern": "^[a-f0-9]{64}$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "autogeneratePattern": "", "default": "v1", "hidden": true, "id": "text1786237207", "max": 20, "min": 1, "name": "normalization_version", "pattern": "", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "hidden": false, "id": "autodate1786237208", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1786237200",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_security_block_address_unique` ON `store_security_block_addresses` (`store`, `block`, `address_hmac`)",
        "CREATE INDEX `idx_security_block_address_lookup` ON `store_security_block_addresses` (`store`, `address_hmac`)"
      ],
      "listRule": null,
      "name": "store_security_block_addresses",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": null
    });
    app.save(collection);
  }

  const events = app.findCollectionByNameOrId("store_security_events");
  addSelectValue(events, "event_type", EVENT_TYPE);
  app.save(events);

  const notifications = app.findCollectionByNameOrId("store_notifications");
  addSelectValue(notifications, "type", NOTIFICATION_TYPE);
  return app.save(notifications);
}, (app) => {
  const notifications = findCollectionSafe(app, "store_notifications");
  if (notifications) {
    deleteByFilter(app, "store_notifications", "type = {:type}", { type: NOTIFICATION_TYPE });
    removeSelectValue(notifications, "type", NOTIFICATION_TYPE);
    app.save(notifications);
  }

  const events = findCollectionSafe(app, "store_security_events");
  if (events) {
    deleteByFilter(app, "store_security_events", "event_type = {:type}", { type: EVENT_TYPE });
    removeSelectValue(events, "event_type", EVENT_TYPE);
    app.save(events);
  }

  const collection = findCollectionSafe(app, "store_security_block_addresses");
  if (collection) return app.delete(collection);
});
