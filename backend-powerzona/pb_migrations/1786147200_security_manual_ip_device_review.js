/// <reference path="../pb_data/types.d.ts" />

const BLOCK_FIELD_IDS = [
  "bool1786147201",
  "text1786147202",
  "text1786147203",
  "select1786147204",
  "select1786147205",
  "bool1786147206",
];
const AUDIT_ACTIONS = [
  "block_device_candidate_detected",
  "block_device_candidate_confirmed",
  "block_device_candidate_dismissed",
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

function addFieldIfMissing(collection, field) {
  if (!hasField(collection, field.name)) collection.fields.add(new Field(field));
}

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

function addSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  const current = Array.isArray(field.values) ? field.values : [];
  const next = current.slice();
  values.forEach((value) => {
    if (!next.includes(value)) next.push(value);
  });
  field.values = next;
}

function removeSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  const current = Array.isArray(field.values) ? field.values : [];
  field.values = current.filter((value) => !values.includes(value));
}

migrate((app) => {
  const blocks = app.findCollectionByNameOrId("store_security_blocks");
  const users = app.findCollectionByNameOrId("users");
  const stores = app.findCollectionByNameOrId("stores");
  const customerField = blocks.fields.getByName("customer");
  customerField.required = false;
  customerField.minSelect = 0;

  addFieldIfMissing(blocks, {
    "default": false,
    "hidden": false,
    "id": "bool1786147201",
    "name": "manual_ip",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  });
  addFieldIfMissing(blocks, {
    "autogeneratePattern": "",
    "hidden": true,
    "id": "text1786147202",
    "max": 100,
    "min": 0,
    "name": "manual_ip_masked",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  });
  addFieldIfMissing(blocks, {
    "autogeneratePattern": "",
    "hidden": true,
    "id": "text1786147203",
    "max": 2048,
    "min": 0,
    "name": "manual_ip_encrypted",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  });
  addFieldIfMissing(blocks, {
    "hidden": true,
    "id": "select1786147204",
    "maxSelect": 1,
    "name": "manual_ip_family",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["ipv4", "ipv6", "unknown"]
  });
  addFieldIfMissing(blocks, {
    "hidden": true,
    "id": "select1786147205",
    "maxSelect": 1,
    "name": "manual_ip_capture_status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["unavailable", "partial", "complete"]
  });
  addFieldIfMissing(blocks, {
    "default": false,
    "hidden": false,
    "id": "bool1786147206",
    "name": "review_device_candidates",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  });
  app.save(blocks);

  const audit = app.findCollectionByNameOrId("store_security_audit");
  addSelectValues(audit, "action", AUDIT_ACTIONS);
  app.save(audit);

  if (!findCollectionSafe(app, "store_security_block_device_candidates")) {
    const candidates = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1786147211", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": true, "collectionId": stores.id, "hidden": false, "id": "relation1786147212", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": false, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": true, "collectionId": blocks.id, "hidden": false, "id": "relation1786147213", "maxSelect": 1, "minSelect": 1, "name": "block", "presentable": false, "required": true, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1786147214", "max": 200, "min": 32, "name": "device_hmac", "pattern": "^[A-Za-z0-9._:-]+$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "default": "pending", "hidden": false, "id": "select1786147215", "maxSelect": 1, "name": "status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["pending", "confirmed", "dismissed"] },
        { "hidden": false, "id": "date1786147216", "max": "", "min": "", "name": "first_seen_at", "presentable": false, "required": true, "system": false, "type": "date" },
        { "hidden": false, "id": "date1786147217", "max": "", "min": "", "name": "last_seen_at", "presentable": false, "required": true, "system": false, "type": "date" },
        { "hidden": false, "id": "number1786147218", "max": null, "min": 0, "name": "attempts_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "hidden": false, "id": "date1786147219", "max": "", "min": "", "name": "confirmed_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "cascadeDelete": false, "collectionId": users.id, "hidden": false, "id": "relation1786147220", "maxSelect": 1, "minSelect": 0, "name": "confirmed_by", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "hidden": false, "id": "date1786147221", "max": "", "min": "", "name": "dismissed_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "cascadeDelete": false, "collectionId": users.id, "hidden": false, "id": "relation1786147222", "maxSelect": 1, "minSelect": 0, "name": "dismissed_by", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "hidden": false, "id": "autodate1786147223", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1786147224", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1786147200",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_security_block_device_candidate_unique` ON `store_security_block_device_candidates` (`store`, `block`, `device_hmac`)",
        "CREATE INDEX `idx_security_block_device_candidate_status` ON `store_security_block_device_candidates` (`store`, `block`, `status`, `last_seen_at`)"
      ],
      "listRule": null,
      "name": "store_security_block_device_candidates",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": null
    });
    app.save(candidates);
  }
}, (app) => {
  const candidates = findCollectionSafe(app, "store_security_block_device_candidates");
  if (candidates) app.delete(candidates);

  const audit = findCollectionSafe(app, "store_security_audit");
  if (audit) {
    removeSelectValues(audit, "action", AUDIT_ACTIONS);
    app.save(audit);
  }

  const blocks = findCollectionSafe(app, "store_security_blocks");
  if (!blocks) return;
  try {
    const manualBlocks = app.findRecordsByFilter("store_security_blocks", "customer = \"\"", "", 0, 0, {}) || [];
    manualBlocks.forEach((block) => app.delete(block));
  } catch (_) {}
  BLOCK_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(blocks, id));
  const customerField = blocks.fields.getByName("customer");
  customerField.required = true;
  customerField.minSelect = 1;
  return app.save(blocks);
});
