/// <reference path="../pb_data/types.d.ts" />

const STORE_PRIMARY_ADMIN_FIELD_ID = "relation1784595601";
const STORE_PRIMARY_ADMIN_INDEX = "idx_stores_primary_admin_user_unique";
const STORE_ACCESS_COLLECTION_ID = "pbc_1784595600";
const STORE_ACCESS_FIELD_IDS = Object.freeze({
  id: "text1784595602",
  store: "relation1784595603",
  user: "relation1784595604",
  template: "select1784595605",
  permissions: "json1784595606",
  createdBy: "relation1784595607",
  updatedBy: "relation1784595608",
  created: "autodate1784595609",
  updated: "autodate1784595610",
});
const AUDIT_FIELD_IDS = Object.freeze([
  "select1784595611",
  "select1784595612",
  "json1784595613",
  "json1784595614",
]);
const TEMPLATE_CODES = Object.freeze([
  "secondary_admin",
  "catalog_inventory",
  "orders_shipping",
  "marketing_promotions",
  "read_only",
  "custom",
]);
const LEGACY_OPERATIONAL_PERMISSIONS = Object.freeze([
  "catalog.view",
  "catalog.products.create",
  "catalog.products.edit",
  "catalog.products.delete",
  "catalog.products.visibility",
  "catalog.products.price",
  "catalog.products.stock",
  "catalog.products.images",
  "catalog.categories.manage",
  "catalog.expirations.manage",
  "orders.view",
  "orders.status.manage",
  "orders.items.manage",
  "orders.price_adjustment",
  "orders.cancel_delete",
  "orders.contact_customer",
  "shipping.manage",
  "promotions.manage",
  "coupons.manage",
  "gifts.manage",
  "raffles.manage",
  "reviews.manage",
  "notifications.view",
  "analytics.view",
  "landing_qr.manage",
  "store.settings.manage",
  "security.view",
  "security.manage",
]);
const LEGACY_READ_ONLY_PERMISSIONS = Object.freeze([
  "catalog.view",
  "orders.view",
  "notifications.view",
  "analytics.view",
]);
const TEAM_AUDIT_ACTIONS = Object.freeze([
  "team_user_created",
  "team_user_updated",
  "team_user_suspended",
  "team_user_reactivated",
  "team_permissions_changed",
  "team_template_changed",
  "team_sessions_revoked",
  "team_devices_revoked",
  "team_temporary_password_issued",
  "primary_admin_assigned",
  "primary_admin_replaced",
  "plan_access_locked",
  "plan_access_restored",
]);

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function fieldSafe(collection, name) {
  if (!collection) return null;
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addFieldIfMissing(collection, options) {
  const existing = fieldSafe(collection, options.name);
  if (existing) return existing;
  const field = new Field(options);
  collection.fields.add(field);
  return field;
}

function removeFieldByIdIfExists(collection, id) {
  if (!collection) return;
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

function addIndexIfMissing(collection, name, unique, columns, where) {
  try {
    if (collection.getIndex(name)) return;
  } catch (_) {}
  collection.addIndex(name, unique === true, columns, where || "");
}

function removeIndexIfExists(collection, name) {
  try {
    collection.removeIndex(name);
  } catch (_) {}
}

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}",
    hidden: false,
    id,
    max: 15,
    min: 15,
    name: "id",
    pattern: "^[a-z0-9]+$",
    presentable: false,
    primaryKey: true,
    required: true,
    system: true,
    type: "text",
  };
}

function relationField(id, name, collectionId, required, hidden, cascadeDelete) {
  return {
    cascadeDelete: cascadeDelete === true,
    collectionId,
    hidden: hidden === true,
    id,
    maxSelect: 1,
    minSelect: required ? 1 : 0,
    name,
    presentable: false,
    required: required === true,
    system: false,
    type: "relation",
  };
}

function selectField(id, name, values, required, hidden) {
  return {
    hidden: hidden === true,
    id,
    maxSelect: 1,
    name,
    presentable: false,
    required: required === true,
    system: false,
    type: "select",
    values: values.slice(),
  };
}

function jsonField(id, name, required) {
  return {
    hidden: true,
    id,
    maxSize: 65536,
    name,
    presentable: false,
    required: required === true,
    system: false,
    type: "json",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false,
    id,
    name,
    onCreate: true,
    onUpdate: onUpdate === true,
    presentable: false,
    system: false,
    type: "autodate",
  };
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try {
      const value = record.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try {
      return record.getString(key);
    } catch (_) {}
  }
  return record[key];
}

function relationId(value) {
  if (Array.isArray(value)) return relationId(value[0]);
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function backfillPrimaryAdmins(app) {
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const stores = app.findRecordsByFilter("stores", "", "id", pageSize, offset) || [];
    if (!stores.length) break;

    stores.forEach((store) => {
      if (relationId(recordValue(store, "primary_admin_user"))) return;
      const activeAdmins = app.findRecordsByFilter(
        "users",
        'store = {:store} && role = "store_admin" && status = "active"',
        "created,id",
        2,
        0,
        { store: store.id },
      ) || [];
      if (activeAdmins.length !== 1) return;
      store.set("primary_admin_user", activeAdmins[0].id);
      app.save(store);
    });

    if (stores.length < pageSize) break;
    offset += stores.length;
  }
}

function findAccessSafe(app, storeId, userId) {
  try {
    return app.findFirstRecordByFilter(
      "store_user_access",
      "store = {:store} && user = {:user}",
      { store: storeId, user: userId },
    );
  } catch (_) {
    return null;
  }
}

function backfillStoreUserAccess(app) {
  const accessCollection = app.findCollectionByNameOrId("store_user_access");
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const users = app.findRecordsByFilter(
      "users",
      'role = "store_admin" || role = "store_staff"',
      "created,id",
      pageSize,
      offset,
    ) || [];
    users.forEach((user) => {
      const storeId = relationId(recordValue(user, "store"));
      if (!storeId || findAccessSafe(app, storeId, user.id)) return;
      let store;
      try { store = app.findRecordById("stores", storeId); } catch (_) { store = null; }
      if (!store || relationId(recordValue(store, "primary_admin_user")) === user.id) return;
      const isAdmin = String(recordValue(user, "role") || "") === "store_admin";
      const access = new Record(accessCollection, {});
      access.set("store", storeId);
      access.set("user", user.id);
      access.set("template_code", isAdmin ? "secondary_admin" : "read_only");
      access.set("permissions_json", (isAdmin ? LEGACY_OPERATIONAL_PERMISSIONS : LEGACY_READ_ONLY_PERMISSIONS).slice());
      app.save(access);
    });
    if (users.length < pageSize) break;
    offset += users.length;
  }
}

function extendAuditSchema(audit) {
  const action = fieldSafe(audit, "action");
  if (action) {
    const values = Array.isArray(action.values) ? action.values.filter(Boolean) : [];
    TEAM_AUDIT_ACTIONS.forEach((value) => {
      if (!values.includes(value)) values.push(value);
    });
    action.values = values;
  }
  addFieldIfMissing(audit, selectField(
    AUDIT_FIELD_IDS[0],
    "previous_template_code",
    TEMPLATE_CODES,
    false,
    true,
  ));
  addFieldIfMissing(audit, selectField(
    AUDIT_FIELD_IDS[1],
    "new_template_code",
    TEMPLATE_CODES,
    false,
    true,
  ));
  addFieldIfMissing(audit, jsonField(AUDIT_FIELD_IDS[2], "previous_permissions_json", false));
  addFieldIfMissing(audit, jsonField(AUDIT_FIELD_IDS[3], "new_permissions_json", false));
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");

  addFieldIfMissing(stores, relationField(
    STORE_PRIMARY_ADMIN_FIELD_ID,
    "primary_admin_user",
    users.id,
    false,
    true,
  ));
  addIndexIfMissing(
    stores,
    STORE_PRIMARY_ADMIN_INDEX,
    true,
    "primary_admin_user",
    "`primary_admin_user` != ''",
  );
  app.save(stores);

  if (!findCollectionSafe(app, "store_user_access")) {
    const access = new Collection({
      id: STORE_ACCESS_COLLECTION_ID,
      name: "store_user_access",
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField(STORE_ACCESS_FIELD_IDS.id),
        relationField(STORE_ACCESS_FIELD_IDS.store, "store", stores.id, true, true, true),
        relationField(STORE_ACCESS_FIELD_IDS.user, "user", users.id, true, true, true),
        selectField(STORE_ACCESS_FIELD_IDS.template, "template_code", TEMPLATE_CODES, true, true),
        // PocketBase treats [] as empty for a required JSON field. Keep the
        // field schema-optional so the valid custom/no-permissions state can
        // be stored; the private write API always sets and validates an array.
        jsonField(STORE_ACCESS_FIELD_IDS.permissions, "permissions_json", false),
        relationField(STORE_ACCESS_FIELD_IDS.createdBy, "created_by", users.id, false, true),
        relationField(STORE_ACCESS_FIELD_IDS.updatedBy, "updated_by", users.id, false, true),
        autoDateField(STORE_ACCESS_FIELD_IDS.created, "created", false),
        autoDateField(STORE_ACCESS_FIELD_IDS.updated, "updated", true),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_store_user_access_store_user` ON `store_user_access` (`store`, `user`)",
        "CREATE INDEX `idx_store_user_access_user` ON `store_user_access` (`user`)",
        "CREATE INDEX `idx_store_user_access_template` ON `store_user_access` (`store`, `template_code`)",
      ],
    });
    app.save(access);
  }

  const audit = findCollectionSafe(app, "store_user_audit");
  if (audit) {
    extendAuditSchema(audit);
    app.save(audit);
  }

  backfillPrimaryAdmins(app);
  backfillStoreUserAccess(app);
}, (app) => {
  const access = findCollectionSafe(app, "store_user_access");
  if (access) app.delete(access);

  const audit = findCollectionSafe(app, "store_user_audit");
  if (audit) {
    AUDIT_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(audit, id));
    const action = fieldSafe(audit, "action");
    if (action && Array.isArray(action.values)) {
      action.values = action.values.filter((value) => !TEAM_AUDIT_ACTIONS.includes(value));
    }
    app.save(audit);
  }

  const stores = findCollectionSafe(app, "stores");
  if (stores) {
    removeIndexIfExists(stores, STORE_PRIMARY_ADMIN_INDEX);
    removeFieldByIdIfExists(stores, STORE_PRIMARY_ADMIN_FIELD_ID);
    app.save(stores);
  }
});
