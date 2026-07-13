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
  const customers = app.findCollectionByNameOrId("store_customers");
  const orders = app.findCollectionByNameOrId("orders");

  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385501", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385502", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385503", "maxSelect": 1, "minSelect": 0, "name": "customer", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": orders.id, "hidden": false, "id": "relation1783385504", "maxSelect": 1, "minSelect": 0, "name": "order", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385505", "max": 200, "min": 1, "name": "event_key", "pattern": "", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "select1783385506", "maxSelect": 1, "name": "event_type", "presentable": true, "required": true, "system": false, "type": "select", "values": ["order_created", "order_rejected", "review_submitted", "raffle_entry", "blocked_attempt", "admin_action"] },
      { "hidden": false, "id": "select1783385507", "maxSelect": 1, "name": "source_type", "presentable": true, "required": true, "system": false, "type": "select", "values": ["order", "review", "raffle", "system", "admin"] },
      { "default": "normal", "hidden": false, "id": "select1783385508", "maxSelect": 1, "name": "risk_level", "presentable": true, "required": true, "system": false, "type": "select", "values": ["normal", "suspicious", "blocked"] },
      { "default": "allowed", "hidden": false, "id": "select1783385509", "maxSelect": 1, "name": "decision", "presentable": true, "required": true, "system": false, "type": "select", "values": ["allowed", "monitored", "blocked"] },
      { "hidden": false, "id": "select1783385510", "maxSelect": 1, "name": "mode_at_event", "presentable": false, "required": true, "system": false, "type": "select", "values": ["monitoring", "protection"] },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385511", "max": 128, "min": 0, "name": "phone_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385512", "max": 128, "min": 0, "name": "ip_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385513", "max": 80, "min": 0, "name": "ip_masked", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385514", "max": 4096, "min": 0, "name": "ip_encrypted", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "default": "unknown", "hidden": false, "id": "select1783385515", "maxSelect": 1, "name": "ip_family", "presentable": false, "required": true, "system": false, "type": "select", "values": ["ipv4", "ipv6", "unknown"] },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385516", "max": 128, "min": 0, "name": "browser_token_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "default": "unavailable", "hidden": false, "id": "select1783385517", "maxSelect": 1, "name": "capture_status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["complete", "partial", "unavailable"] },
      { "autogeneratePattern": "", "default": "v1", "hidden": true, "id": "text1783385518", "max": 20, "min": 0, "name": "crypto_version", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": true, "id": "json1783385519", "maxSize": 0, "name": "metadata_json", "presentable": false, "required": false, "system": false, "type": "json" },
      { "hidden": false, "id": "date1783385520", "max": "", "min": "", "name": "occurred_at", "presentable": true, "required": true, "system": false, "type": "date" },
      { "hidden": false, "id": "autodate1783385521", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783385500",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_store_security_events_event_key` ON `store_security_events` (`event_key`)",
      "CREATE INDEX `idx_store_security_events_store_occurred` ON `store_security_events` (`store`, `occurred_at`)",
      "CREATE INDEX `idx_store_security_events_store_customer_occurred` ON `store_security_events` (`store`, `customer`, `occurred_at`)",
      "CREATE INDEX `idx_store_security_events_store_order` ON `store_security_events` (`store`, `order`)",
      "CREATE INDEX `idx_store_security_events_store_ip_occurred` ON `store_security_events` (`store`, `ip_hmac`, `occurred_at`)",
      "CREATE INDEX `idx_store_security_events_store_phone_occurred` ON `store_security_events` (`store`, `phone_hmac`, `occurred_at`)",
      "CREATE INDEX `idx_store_security_events_store_browser_occurred` ON `store_security_events` (`store`, `browser_token_hmac`, `occurred_at`)"
    ],
    "listRule": READ_RULE,
    "name": "store_security_events",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": READ_RULE
  });

  return app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "store_security_events");
  if (collection) return app.delete(collection);
});
