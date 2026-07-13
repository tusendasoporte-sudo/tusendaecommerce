/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_OWN_STORE_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const AUDIT_READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_OWN_STORE_RULE})`;
const ORDER_PUBLIC_RECEIPT_RULE = 'order_number = @request.query.order_number && receipt_token = @request.query.token && receipt_token != ""';
const ORDER_PUBLIC_REVIEW_RULE = 'review_token = @request.query.review_token && review_requested_at != "" && status = "delivered"';
const ORDER_STORE_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const ORDER_STORE_WRITE_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const ORDER_INTERNAL_FIELDS_BLOCK_RULE = '@request.body.customer:isset = false && @request.body.security_registered_at:isset = false && @request.body.security_identity_erased_at:isset = false';
const ORDER_PREVIOUS_INTERNAL_FIELDS_BLOCK_RULE = '@request.body.customer:isset = false && @request.body.security_registered_at:isset = false';

const CUSTOMER_FIELD_IDS = [
  "bool1783385801",
  "date1783385802",
  "relation1783385803",
  "text1783385804",
];

const ORDER_FIELD_IDS = [
  "date1783385805",
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

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
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

function orderBaseListRule() {
  return `(${MASTER_ADMIN_RULE}) || (${ORDER_STORE_WRITE_RULE}) || (${ORDER_STORE_READ_RULE}) || (${ORDER_PUBLIC_RECEIPT_RULE}) || (${ORDER_PUBLIC_REVIEW_RULE})`;
}

function applyOrderRules(orders, internalFieldsBlockRule) {
  const listRule = orderBaseListRule();
  orders.listRule = listRule;
  orders.viewRule = listRule;
  orders.createRule = `((@request.auth.id = "") || (${MASTER_ADMIN_RULE}) || (${ORDER_STORE_WRITE_RULE})) && ${internalFieldsBlockRule}`;
  orders.updateRule = `((${MASTER_ADMIN_RULE}) || (${ORDER_STORE_WRITE_RULE})) && ${internalFieldsBlockRule}`;
  orders.deleteRule = `(${MASTER_ADMIN_RULE}) || (${ORDER_STORE_WRITE_RULE})`;
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const customers = app.findCollectionByNameOrId("store_customers");
  const orders = app.findCollectionByNameOrId("orders");

  addFieldIfMissing(customers, {
    "default": false,
    "hidden": true,
    "id": "bool1783385801",
    "name": "archived",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  });
  addFieldIfMissing(customers, {
    "hidden": true,
    "id": "date1783385802",
    "max": "",
    "min": "",
    "name": "archived_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  });
  addFieldIfMissing(customers, {
    "cascadeDelete": false,
    "collectionId": users.id,
    "hidden": true,
    "id": "relation1783385803",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "archived_by",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  });
  addFieldIfMissing(customers, {
    "autogeneratePattern": "",
    "hidden": true,
    "id": "text1783385804",
    "max": 500,
    "min": 0,
    "name": "archive_reason",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  });
  addIndexIfNeeded(
    customers,
    "idx_store_customers_store_merged_archived_updated",
    "CREATE INDEX `idx_store_customers_store_merged_archived_updated` ON `store_customers` (`store`, `merged_into`, `archived`, `updated`)"
  );
  app.save(customers);

  addFieldIfMissing(orders, {
    "hidden": true,
    "id": "date1783385805",
    "max": "",
    "min": "",
    "name": "security_identity_erased_at",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  });
  applyOrderRules(orders, ORDER_INTERNAL_FIELDS_BLOCK_RULE);
  app.save(orders);

  if (!findCollectionSafe(app, "store_security_audit")) {
    const audit = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1783385811", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": false, "collectionId": stores.id, "hidden": false, "id": "relation1783385812", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": true, "required": true, "system": false, "type": "relation" },
        { "hidden": false, "id": "select1783385813", "maxSelect": 1, "name": "action", "presentable": true, "required": true, "system": false, "type": "select", "values": ["archive_customer", "restore_customer", "delete_customer_profile", "auto_restore_customer"] },
        { "cascadeDelete": false, "collectionId": users.id, "hidden": false, "id": "relation1783385814", "maxSelect": 1, "minSelect": 0, "name": "actor", "presentable": false, "required": false, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385815", "max": 40, "min": 0, "name": "subject_record_id", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1783385816", "max": 500, "min": 0, "name": "reason_internal", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "default": 0, "hidden": false, "id": "number1783385817", "max": null, "min": 0, "name": "orders_affected", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": 0, "hidden": false, "id": "number1783385818", "max": null, "min": 0, "name": "events_affected", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": 0, "hidden": false, "id": "number1783385819", "max": null, "min": 0, "name": "phones_affected", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": 0, "hidden": false, "id": "number1783385820", "max": null, "min": 0, "name": "devices_affected", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": 0, "hidden": false, "id": "number1783385821", "max": null, "min": 0, "name": "sessions_affected", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": 0, "hidden": false, "id": "number1783385822", "max": null, "min": 0, "name": "pageviews_affected", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "hidden": false, "id": "autodate1783385823", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1783385800",
      "indexes": [
        "CREATE INDEX `idx_store_security_audit_store_created` ON `store_security_audit` (`store`, `created`)",
        "CREATE INDEX `idx_store_security_audit_store_action_created` ON `store_security_audit` (`store`, `action`, `created`)"
      ],
      "listRule": AUDIT_READ_RULE,
      "name": "store_security_audit",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": AUDIT_READ_RULE
    });
    app.save(audit);
  }
}, (app) => {
  // Revertir este esquema no restaura fichas de Seguridad eliminadas durante pruebas reales.
  const audit = findCollectionSafe(app, "store_security_audit");
  if (audit) app.delete(audit);

  const orders = findCollectionSafe(app, "orders");
  if (orders) {
    ORDER_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(orders, id));
    applyOrderRules(orders, ORDER_PREVIOUS_INTERNAL_FIELDS_BLOCK_RULE);
    app.save(orders);
  }

  const customers = findCollectionSafe(app, "store_customers");
  if (!customers) return;

  removeIndexIfExists(customers, "idx_store_customers_store_merged_archived_updated");
  CUSTOMER_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(customers, id));
  return app.save(customers);
});
