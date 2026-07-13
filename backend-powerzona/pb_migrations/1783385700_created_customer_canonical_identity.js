/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_OWN_STORE_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_OWN_STORE_RULE})`;

const CUSTOMER_FIELD_IDS = [
  "relation1783385701",
  "date1783385702",
  "select1783385703",
  "number1783385704",
  "number1783385705",
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
  if (hasField(collection, field.name)) return;
  collection.fields.add(new Field(field));
}

function addIndexIfNeeded(collection, indexName, sql) {
  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  if (indexes.some((index) => String(index).includes(indexName))) return;
  collection.indexes = indexes.concat(sql);
}

function removeIndexIfExists(collection, indexName) {
  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((index) => !String(index).includes(indexName));
}

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const customers = app.findCollectionByNameOrId("store_customers");
  const users = app.findCollectionByNameOrId("users");

  addFieldIfMissing(customers, {
    "cascadeDelete": false,
    "collectionId": customers.id,
    "hidden": true,
    "id": "relation1783385701",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "merged_into",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  });
  addFieldIfMissing(customers, {
    "hidden": true,
    "id": "date1783385702",
    "max": "",
    "min": "",
    "name": "merged_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  });
  addFieldIfMissing(customers, {
    "hidden": true,
    "id": "select1783385703",
    "maxSelect": 1,
    "name": "merge_reason",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": ["auto_device", "auto_phone", "manual", "backfill"]
  });
  addFieldIfMissing(customers, {
    "default": 0,
    "hidden": false,
    "id": "number1783385704",
    "max": null,
    "min": 0,
    "name": "phones_count",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  });
  addFieldIfMissing(customers, {
    "default": 0,
    "hidden": false,
    "id": "number1783385705",
    "max": null,
    "min": 0,
    "name": "devices_count",
    "onlyInt": true,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  });
  addIndexIfNeeded(customers, "idx_store_customers_store_merged_updated", "CREATE INDEX `idx_store_customers_store_merged_updated` ON `store_customers` (`store`, `merged_into`, `updated`)");
  addIndexIfNeeded(customers, "idx_store_customers_merged_into", "CREATE INDEX `idx_store_customers_merged_into` ON `store_customers` (`merged_into`)");
  app.save(customers);

  if (!findCollectionSafe(app, "store_customer_phones")) {
    const phones = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385711", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385712", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385713", "maxSelect": 1, "minSelect": 1, "name": "customer", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": false, "id": "text1783385714", "max": 15, "min": 8, "name": "phone_normalized", "pattern": "^\\d{8,15}$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385715", "max": 128, "min": 0, "name": "phone_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "hidden": false, "id": "date1783385716", "max": "", "min": "", "name": "first_seen_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "hidden": false, "id": "date1783385717", "max": "", "min": "", "name": "last_seen_at", "presentable": true, "required": false, "system": false, "type": "date" },
        { "default": 0, "hidden": false, "id": "number1783385718", "max": null, "min": 0, "name": "orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": false, "hidden": false, "id": "bool1783385719", "name": "is_primary", "presentable": true, "required": false, "system": false, "type": "bool" },
        { "hidden": false, "id": "autodate1783385720", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1783385721", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1783385701",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_store_customer_phones_store_phone` ON `store_customer_phones` (`store`, `phone_normalized`)",
        "CREATE INDEX `idx_store_customer_phones_store_customer` ON `store_customer_phones` (`store`, `customer`)"
      ],
      "listRule": READ_RULE,
      "name": "store_customer_phones",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": READ_RULE
    });
    app.save(phones);
  }

  if (!findCollectionSafe(app, "store_customer_devices")) {
    const devices = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385731", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385732", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385733", "maxSelect": 1, "minSelect": 1, "name": "customer", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385734", "max": 128, "min": 1, "name": "browser_token_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "hidden": false, "id": "date1783385735", "max": "", "min": "", "name": "first_seen_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "hidden": false, "id": "date1783385736", "max": "", "min": "", "name": "last_seen_at", "presentable": true, "required": false, "system": false, "type": "date" },
        { "default": 0, "hidden": false, "id": "number1783385737", "max": null, "min": 0, "name": "orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385738", "max": 128, "min": 0, "name": "latest_ip_hmac", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": false, "id": "text1783385739", "max": 120, "min": 0, "name": "latest_ip_masked", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385740", "max": 4096, "min": 0, "name": "latest_ip_encrypted", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "default": "unknown", "hidden": false, "id": "select1783385741", "maxSelect": 1, "name": "latest_ip_family", "presentable": false, "required": true, "system": false, "type": "select", "values": ["ipv4", "ipv6", "unknown"] },
        { "default": "unavailable", "hidden": false, "id": "select1783385742", "maxSelect": 1, "name": "latest_capture_status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["complete", "partial", "unavailable"] },
        { "autogeneratePattern": "", "default": "v1", "hidden": true, "id": "text1783385743", "max": 20, "min": 0, "name": "crypto_version", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "hidden": false, "id": "autodate1783385744", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1783385745", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1783385702",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_store_customer_devices_store_browser` ON `store_customer_devices` (`store`, `browser_token_hmac`)",
        "CREATE INDEX `idx_store_customer_devices_store_customer` ON `store_customer_devices` (`store`, `customer`)"
      ],
      "listRule": READ_RULE,
      "name": "store_customer_devices",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": READ_RULE
    });
    app.save(devices);
  }

  if (!findCollectionSafe(app, "store_customer_links")) {
    const links = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385751", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385752", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385753", "maxSelect": 1, "minSelect": 1, "name": "canonical_customer", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "cascadeDelete": false, "collectionId": customers.id, "hidden": false, "id": "relation1783385754", "maxSelect": 1, "minSelect": 1, "name": "linked_customer", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "hidden": false, "id": "select1783385755", "maxSelect": 1, "name": "link_type", "presentable": true, "required": true, "system": false, "type": "select", "values": ["auto_device", "auto_phone", "manual", "backfill"] },
        { "default": "active", "hidden": false, "id": "select1783385756", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["active", "reversed"] },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385757", "max": 500, "min": 0, "name": "reason_internal", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "cascadeDelete": false, "collectionId": users.id, "hidden": false, "id": "relation1783385758", "maxSelect": 1, "minSelect": 0, "name": "created_by", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "hidden": false, "id": "autodate1783385759", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1783385760", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1783385703",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_store_customer_links_store_linked` ON `store_customer_links` (`store`, `linked_customer`)",
        "CREATE INDEX `idx_store_customer_links_store_canonical` ON `store_customer_links` (`store`, `canonical_customer`)"
      ],
      "listRule": READ_RULE,
      "name": "store_customer_links",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": READ_RULE
    });
    app.save(links);
  }
}, (app) => {
  const links = findCollectionSafe(app, "store_customer_links");
  if (links) app.delete(links);

  const devices = findCollectionSafe(app, "store_customer_devices");
  if (devices) app.delete(devices);

  const phones = findCollectionSafe(app, "store_customer_phones");
  if (phones) app.delete(phones);

  const customers = findCollectionSafe(app, "store_customers");
  if (!customers) return;

  removeIndexIfExists(customers, "idx_store_customers_store_merged_updated");
  removeIndexIfExists(customers, "idx_store_customers_merged_into");
  CUSTOMER_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(customers, id));
  return app.save(customers);
});
