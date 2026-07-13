/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_OWN_STORE_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_OWN_STORE_RULE})`;

const CUSTOMER_FIELD_IDS = ["select1783385901"];
const AUDIT_FIELD_IDS = ["text1783385902", "select1783385903", "date1783385904"];
const AUDIT_BASE_ACTIONS = ["archive_customer", "restore_customer", "delete_customer_profile", "auto_restore_customer"];
const AUDIT_BLOCK_ACTIONS = ["customer_watch_enabled", "customer_watch_disabled", "block_created", "block_revoked", "block_expired"];

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
  if (hasField(collection, field.name)) return;
  collection.fields.add(new Field(field));
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

function resetSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  field.values = values.slice();
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const customers = app.findCollectionByNameOrId("store_customers");
  const users = app.findCollectionByNameOrId("users");

  addFieldIfMissing(customers, {
    "hidden": true,
    "id": "select1783385901",
    "maxSelect": 1,
    "name": "block_restore_status",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["normal", "watch"]
  });
  app.save(customers);

  const audit = app.findCollectionByNameOrId("store_security_audit");
  addSelectValues(audit, "action", AUDIT_BLOCK_ACTIONS);
  addFieldIfMissing(audit, {
    "autogeneratePattern": "",
    "hidden": true,
    "id": "text1783385902",
    "max": 40,
    "min": 0,
    "name": "block_record_id",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  });
  addFieldIfMissing(audit, {
    "hidden": true,
    "id": "select1783385903",
    "maxSelect": 1,
    "name": "block_scope",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["orders", "reviews", "raffles", "all_interactions", "full_access"]
  });
  addFieldIfMissing(audit, {
    "hidden": true,
    "id": "date1783385904",
    "max": "",
    "min": "",
    "name": "block_expires_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  });
  app.save(audit);

  if (!findCollectionSafe(app, "store_security_blocks")) {
    const blocks = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385911", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385912", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385913", "maxSelect": 1, "minSelect": 1, "name": "customer", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "hidden": false, "id": "select1783385914", "maxSelect": 1, "name": "scope", "presentable": true, "required": true, "system": false, "type": "select", "values": ["orders", "reviews", "raffles", "all_interactions", "full_access"] },
        { "default": "active", "hidden": false, "id": "select1783385915", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["active", "expired", "revoked"] },
        { "default": false, "hidden": false, "id": "bool1783385916", "name": "match_phone", "presentable": false, "required": false, "system": false, "type": "bool" },
        { "default": false, "hidden": false, "id": "bool1783385917", "name": "match_device", "presentable": false, "required": false, "system": false, "type": "bool" },
        { "default": false, "hidden": false, "id": "bool1783385918", "name": "match_ip", "presentable": false, "required": false, "system": false, "type": "bool" },
        { "default": "any", "hidden": false, "id": "select1783385919", "maxSelect": 1, "name": "match_mode", "presentable": false, "required": true, "system": false, "type": "select", "values": ["any", "all"] },
        { "hidden": true, "id": "json1783385920", "maxSize": 0, "name": "phone_hmac_values", "presentable": false, "required": false, "system": false, "type": "json" },
        { "hidden": true, "id": "json1783385921", "maxSize": 0, "name": "device_hmac_values", "presentable": false, "required": false, "system": false, "type": "json" },
        { "hidden": true, "id": "json1783385922", "maxSize": 0, "name": "ip_hmac_values", "presentable": false, "required": false, "system": false, "type": "json" },
        { "hidden": false, "id": "select1783385923", "maxSelect": 1, "name": "duration", "presentable": true, "required": true, "system": false, "type": "select", "values": ["hours_24", "days_7", "days_30", "permanent"] },
        { "hidden": false, "id": "date1783385924", "max": "", "min": "", "name": "starts_at", "presentable": true, "required": true, "system": false, "type": "date" },
        { "hidden": false, "id": "date1783385925", "max": "", "min": "", "name": "expires_at", "presentable": true, "required": false, "system": false, "type": "date" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385926", "max": 500, "min": 0, "name": "reason_internal", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "cascadeDelete": false, "collectionId": users.id, "hidden": false, "id": "relation1783385927", "maxSelect": 1, "minSelect": 0, "name": "created_by", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "hidden": false, "id": "date1783385928", "max": "", "min": "", "name": "revoked_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "cascadeDelete": false, "collectionId": users.id, "hidden": false, "id": "relation1783385929", "maxSelect": 1, "minSelect": 0, "name": "revoked_by", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385930", "max": 500, "min": 0, "name": "revoke_reason", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "hidden": false, "id": "autodate1783385931", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1783385932", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1783385900",
      "indexes": [
        "CREATE INDEX `idx_store_security_blocks_store_customer_status` ON `store_security_blocks` (`store`, `customer`, `status`)",
        "CREATE INDEX `idx_store_security_blocks_store_status_expires` ON `store_security_blocks` (`store`, `status`, `expires_at`)",
        "CREATE INDEX `idx_store_security_blocks_store_scope_status` ON `store_security_blocks` (`store`, `scope`, `status`)",
        "CREATE INDEX `idx_store_security_blocks_store_created` ON `store_security_blocks` (`store`, `created`)"
      ],
      "listRule": READ_RULE,
      "name": "store_security_blocks",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": READ_RULE
    });
    app.save(blocks);
  }
}, (app) => {
  const blocks = findCollectionSafe(app, "store_security_blocks");
  if (blocks) app.delete(blocks);

  const audit = findCollectionSafe(app, "store_security_audit");
  if (audit) {
    AUDIT_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(audit, id));
    resetSelectValues(audit, "action", AUDIT_BASE_ACTIONS);
    app.save(audit);
  }

  const customers = findCollectionSafe(app, "store_customers");
  if (!customers) return;
  CUSTOMER_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(customers, id));
  return app.save(customers);
});
