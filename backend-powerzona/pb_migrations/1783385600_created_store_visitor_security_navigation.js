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

  const sessions = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385601", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385602", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385603", "max": 10, "min": 10, "name": "day", "pattern": "^\\d{4}-\\d{2}-\\d{2}$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385604", "max": 128, "min": 1, "name": "visitor_key_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385605", "max": 128, "min": 0, "name": "browser_token_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385606", "max": 80, "min": 0, "name": "analytics_visitor_id", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385607", "max": 80, "min": 0, "name": "analytics_session_id", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385608", "maxSelect": 1, "minSelect": 0, "name": "customer", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "hidden": false, "id": "date1783385609", "max": "", "min": "", "name": "first_seen_at", "presentable": true, "required": true, "system": false, "type": "date" },
      { "hidden": false, "id": "date1783385610", "max": "", "min": "", "name": "last_seen_at", "presentable": true, "required": true, "system": false, "type": "date" },
      { "default": 1, "hidden": false, "id": "number1783385611", "max": null, "min": 1, "name": "pageviews_count", "onlyInt": true, "presentable": true, "required": false, "system": false, "type": "number" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385612", "max": 240, "min": 0, "name": "entry_path", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385613", "max": 240, "min": 0, "name": "last_path", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385614", "max": 128, "min": 0, "name": "latest_ip_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385615", "max": 120, "min": 0, "name": "latest_ip_masked", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385616", "max": 4096, "min": 0, "name": "latest_ip_encrypted", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "default": "unknown", "hidden": false, "id": "select1783385617", "maxSelect": 1, "name": "latest_ip_family", "presentable": false, "required": true, "system": false, "type": "select", "values": ["ipv4", "ipv6", "unknown"] },
      { "default": "unavailable", "hidden": false, "id": "select1783385618", "maxSelect": 1, "name": "latest_capture_status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["complete", "partial", "unavailable"] },
      { "autogeneratePattern": "", "default": "v1", "hidden": true, "id": "text1783385619", "max": 20, "min": 0, "name": "crypto_version", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "autodate1783385620", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1783385621", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783385600",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_store_visitor_sessions_store_day_key` ON `store_visitor_sessions` (`store`, `day`, `visitor_key_hmac`)",
      "CREATE INDEX `idx_store_visitor_sessions_store_day_last_seen` ON `store_visitor_sessions` (`store`, `day`, `last_seen_at`)",
      "CREATE INDEX `idx_store_visitor_sessions_store_customer_day` ON `store_visitor_sessions` (`store`, `customer`, `day`)",
      "CREATE INDEX `idx_store_visitor_sessions_store_ip_day` ON `store_visitor_sessions` (`store`, `latest_ip_hmac`, `day`)"
    ],
    "listRule": READ_RULE,
    "name": "store_visitor_sessions",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": READ_RULE
  });

  app.save(sessions);

  const pageviews = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385651", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385652", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": sessions.id, "hidden": false, "id": "relation1783385653", "maxSelect": 1, "minSelect": 1, "name": "visitor_session", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385654", "maxSelect": 1, "minSelect": 0, "name": "customer", "presentable": true, "required": false, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385655", "max": 200, "min": 1, "name": "event_key", "pattern": "", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385656", "max": 10, "min": 10, "name": "day", "pattern": "^\\d{4}-\\d{2}-\\d{2}$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "select1783385657", "maxSelect": 1, "name": "page_type", "presentable": true, "required": true, "system": false, "type": "select", "values": ["store_home", "category", "subcategory", "product", "gifts", "search", "checkout", "landing_qr", "other"] },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385658", "max": 120, "min": 0, "name": "entity_type", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385659", "max": 120, "min": 0, "name": "entity_id", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385660", "max": 240, "min": 0, "name": "path", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385661", "max": 128, "min": 0, "name": "ip_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783385662", "max": 120, "min": 0, "name": "ip_masked", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783385663", "max": 4096, "min": 0, "name": "ip_encrypted", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "default": "unknown", "hidden": false, "id": "select1783385664", "maxSelect": 1, "name": "ip_family", "presentable": false, "required": true, "system": false, "type": "select", "values": ["ipv4", "ipv6", "unknown"] },
      { "default": "unavailable", "hidden": false, "id": "select1783385665", "maxSelect": 1, "name": "capture_status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["complete", "partial", "unavailable"] },
      { "autogeneratePattern": "", "default": "v1", "hidden": true, "id": "text1783385666", "max": 20, "min": 0, "name": "crypto_version", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "date1783385667", "max": "", "min": "", "name": "occurred_at", "presentable": true, "required": true, "system": false, "type": "date" },
      { "hidden": false, "id": "autodate1783385668", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783385601",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_store_visitor_pageviews_event_key` ON `store_visitor_pageviews` (`event_key`)",
      "CREATE INDEX `idx_store_visitor_pageviews_store_day_occurred` ON `store_visitor_pageviews` (`store`, `day`, `occurred_at`)",
      "CREATE INDEX `idx_store_visitor_pageviews_session_occurred` ON `store_visitor_pageviews` (`visitor_session`, `occurred_at`)",
      "CREATE INDEX `idx_store_visitor_pageviews_store_ip_day` ON `store_visitor_pageviews` (`store`, `ip_hmac`, `day`)",
      "CREATE INDEX `idx_store_visitor_pageviews_store_customer_day` ON `store_visitor_pageviews` (`store`, `customer`, `day`)"
    ],
    "listRule": READ_RULE,
    "name": "store_visitor_pageviews",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": READ_RULE
  });

  return app.save(pageviews);
}, (app) => {
  const pageviews = findCollectionSafe(app, "store_visitor_pageviews");
  if (pageviews) app.delete(pageviews);

  const sessions = findCollectionSafe(app, "store_visitor_sessions");
  if (sessions) return app.delete(sessions);
});
