/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_CREATE_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && @request.body.store = @request.auth.store';
const STORE_USER_RECORD_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';
const PUBLIC_RAFFLE_RULE = 'link_enabled = true && store.status = "active"';
const PUBLIC_ENTRY_CREATE_RULE = '@request.auth.id = "" && @request.body.store != "" && @request.body.raffle != "" && @request.body.status = "active" && raffle.store = @request.body.store && raffle.link_enabled = true && raffle.store.status = "active"';
const PUBLIC_ENTRY_RECORD_RULE = '@request.auth.id = "" && status = "active" && raffle.link_enabled = true && raffle.store.status = "active"';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addNotificationType(app) {
  const notifications = findCollectionSafe(app, "store_notifications");
  if (!notifications) return;

  const typeField = getFieldSafe(notifications, "type");
  if (!typeField || !Array.isArray(typeField.values)) return;

  if (!typeField.values.includes("raffle_entry_created")) {
    typeField.values.push("raffle_entry_created");
    app.save(notifications);
  }
}

function removeNotificationType(app) {
  const notifications = findCollectionSafe(app, "store_notifications");
  if (!notifications) return;

  const typeField = getFieldSafe(notifications, "type");
  if (!typeField || !Array.isArray(typeField.values)) return;

  typeField.values = typeField.values.filter((value) => value !== "raffle_entry_created");
  app.save(notifications);
}

migrate((app) => {
  const raffles = new Collection({
    "createRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`,
    "deleteRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783384201", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": "pbc_1780469000", "hidden": false, "id": "relation1783384202", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384203", "max": 140, "min": 1, "name": "title", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384204", "max": 90, "min": 1, "name": "slug", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384205", "max": 0, "min": 0, "name": "description", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384206", "max": 0, "min": 0, "name": "conditions", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384234", "max": 80, "min": 0, "name": "access_code", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": true, "id": "text1783384207", "max": 128, "min": 0, "name": "access_code_hash", "pattern": "^[a-f0-9]{64,128}$", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "file1783384208", "maxSelect": 12, "maxSize": 10485760, "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"], "name": "images", "presentable": false, "protected": false, "required": false, "system": false, "thumbs": ["320x220", "700x460"], "type": "file" },
      { "hidden": false, "id": "json1783384229", "maxSize": 0, "name": "prizes_json", "presentable": false, "required": false, "system": false, "type": "json" },
      { "hidden": false, "id": "select1783384230", "maxSelect": 1, "name": "prizes_display_mode", "presentable": false, "required": false, "system": false, "type": "select", "values": ["fixed", "carousel"] },
      { "hidden": false, "id": "date1783384209", "max": "", "min": "", "name": "starts_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1783384210", "max": "", "min": "", "name": "closes_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1783384211", "max": "", "min": "", "name": "draw_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "select1783384212", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["draft", "active", "selection_closed", "result_pending", "winner_published", "no_winner_published", "finalized", "archived"] },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384213", "max": 2, "min": 0, "name": "winner_number", "pattern": "^[0-9]{2}$", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384214", "max": 2, "min": 0, "name": "no_winner_number", "pattern": "^[0-9]{2}$", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "date1783384215", "max": "", "min": "", "name": "result_published_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1783384216", "max": "", "min": "", "name": "no_winner_expires_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "date1783384233", "max": "", "min": "", "name": "finalized_at", "presentable": false, "required": false, "system": false, "type": "date" },
      { "hidden": false, "id": "bool1783384231", "name": "link_enabled", "presentable": true, "required": false, "system": false, "type": "bool", "default": true },
      { "hidden": false, "id": "bool1783384232", "name": "show_in_store", "presentable": true, "required": false, "system": false, "type": "bool", "default": false },
      { "hidden": false, "id": "bool1783384217", "name": "visible", "presentable": true, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "autodate1783384218", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1783384219", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783384200",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_raffles_store_slug` ON `raffles` (`store`, `slug`)",
      "CREATE INDEX `idx_raffles_store_status_visible` ON `raffles` (`store`, `status`, `visible`)",
      "CREATE INDEX `idx_raffles_store_link_show` ON `raffles` (`store`, `link_enabled`, `show_in_store`)"
    ],
    "listRule": `(${PUBLIC_RAFFLE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`,
    "name": "raffles",
    "system": false,
    "type": "base",
    "updateRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`,
    "viewRule": `(${PUBLIC_RAFFLE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`
  });

  app.save(raffles);

  const entries = new Collection({
    "createRule": `(${PUBLIC_ENTRY_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_CREATE_RULE})`,
    "deleteRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783384220", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "cascadeDelete": false, "collectionId": "pbc_1780469000", "hidden": false, "id": "relation1783384221", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "cascadeDelete": true, "collectionId": "pbc_1783384200", "hidden": false, "id": "relation1783384222", "maxSelect": 1, "minSelect": 1, "name": "raffle", "presentable": true, "required": true, "system": false, "type": "relation" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384223", "max": 10, "min": 10, "name": "phone", "pattern": "^53[0-9]{8}$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384224", "max": 2, "min": 2, "name": "chosen_number", "pattern": "^[0-9]{2}$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1783384225", "max": 24, "min": 8, "name": "receipt_code", "pattern": "^RF-[A-Z0-9-]+$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "select1783384226", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["active", "cancelled"] },
      { "hidden": false, "id": "autodate1783384227", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1783384228", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1783384201",
    "indexes": [
      "CREATE UNIQUE INDEX `idx_raffle_entries_active_number` ON `raffle_entries` (`raffle`, `chosen_number`) WHERE `status` = 'active'",
      "CREATE UNIQUE INDEX `idx_raffle_entries_active_phone` ON `raffle_entries` (`raffle`, `phone`) WHERE `status` = 'active'",
      "CREATE INDEX `idx_raffle_entries_store_created` ON `raffle_entries` (`store`, `created`)"
    ],
    "listRule": `(${PUBLIC_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`,
    "name": "raffle_entries",
    "system": false,
    "type": "base",
    "updateRule": `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`,
    "viewRule": `(${PUBLIC_ENTRY_RECORD_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RECORD_RULE})`
  });

  app.save(entries);
  addNotificationType(app);
}, (app) => {
  removeNotificationType(app);

  const entries = findCollectionSafe(app, "raffle_entries");
  if (entries) app.delete(entries);

  const raffles = findCollectionSafe(app, "raffles");
  if (raffles) app.delete(raffles);
});
