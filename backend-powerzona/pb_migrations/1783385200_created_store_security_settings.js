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

  const collection = new Collection({
    "createRule": MASTER_ADMIN_RULE,
    "deleteRule": MASTER_ADMIN_RULE,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385201", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385202", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "default": false, "hidden": false, "id": "bool1783385203", "name": "enabled", "presentable": true, "required": false, "system": false, "type": "bool" },
      { "default": "disabled", "hidden": false, "id": "select1783385204", "maxSelect": 1, "name": "mode", "presentable": true, "required": true, "system": false, "type": "select", "values": ["disabled", "monitoring", "protection"] },
      { "default": false, "hidden": false, "id": "bool1783385205", "name": "manual_blocking_enabled", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "default": false, "hidden": false, "id": "bool1783385206", "name": "full_access_blocking_enabled", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "default": false, "hidden": false, "id": "bool1783385207", "name": "permanent_blocks_enabled", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "default": 30, "hidden": false, "id": "number1783385208", "max": 90, "min": 30, "name": "retention_days", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "default": "hidden", "hidden": false, "id": "select1783385209", "maxSelect": 1, "name": "ip_visibility", "presentable": false, "required": true, "system": false, "type": "select", "values": ["hidden", "partial", "full"] },
      { "default": false, "hidden": false, "id": "bool1783385210", "name": "notify_blocked_attempts", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "autodate1783385211", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1783385212", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783385200",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_store_security_settings_store` ON `store_security_settings` (`store`)"
    ],
    "listRule": READ_RULE,
    "name": "store_security_settings",
    "system": false,
    "type": "base",
    "updateRule": MASTER_ADMIN_RULE,
    "viewRule": READ_RULE
  });

  return app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "store_security_settings");
  if (collection) return app.delete(collection);
});
