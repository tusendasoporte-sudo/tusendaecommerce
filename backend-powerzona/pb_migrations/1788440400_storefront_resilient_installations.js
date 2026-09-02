/// <reference path="../pb_data/types.d.ts" />

const DIAGNOSTICS_COLLECTION = "storefront_installation_diagnostics";
const INSTALLATION_FIELD_IDS = Object.freeze({
  uuidDigest: "txt17884404001",
  identitySource: "sel17884404002",
  trustLevel: "sel17884404003",
  firebaseStatus: "sel17884404004",
  firebaseSyncedAt: "dat17884404005",
  firebaseLastError: "txt17884404006",
  lastHeartbeatAt: "dat17884404007",
});
const DELIVERY_FIELD_IDS = Object.freeze({
  fcmStatus: "sel17884404008",
  nativeStatus: "sel17884404009",
  fcmReceivedAt: "dat17884404010",
  nativeDeliveredAt: "dat17884404011",
  readAt: "dat17884404012",
  deliveryExpiresAt: "dat17884404013",
});

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required, hidden) {
  return {
    cascadeDelete: false, collectionId, hidden: hidden === true, id, maxSelect: 1,
    minSelect: required ? 1 : 0, name, presentable: false, required: !!required,
    system: false, type: "relation",
  };
}

function selectField(id, name, values, required, hidden) {
  return {
    hidden: hidden === true, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function numberField(id, name, max) {
  return {
    hidden: false, id, max: max === undefined ? null : max, min: 0, name,
    onlyInt: true, presentable: false, required: false, system: false, type: "number",
  };
}

function jsonField(id, name, max) {
  return {
    hidden: true, id, maxSize: max, name, presentable: false,
    required: false, system: false, type: "json",
  };
}

function dateField(id, name, required, hidden) {
  return {
    hidden: hidden === true, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function addField(collection, definition) {
  if (!fieldByName(collection, definition.name)) collection.fields.add(new Field(definition));
}

function removeField(collection, name) {
  const field = fieldByName(collection, name);
  if (field) collection.fields.removeById(field.id);
}

function addIndex(collection, name, unique, columns, where) {
  try { if (collection.getIndex(name)) return; } catch (_) {}
  collection.addIndex(name, unique, columns, where || "");
}

function removeIndex(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

function forEachRecord(app, collection, callback) {
  for (let offset = 0; ; offset += 200) {
    const records = app.findRecordsByFilter(collection, "", "id", 200, offset, {}) || [];
    records.forEach(callback);
    if (records.length < 200) break;
  }
}

function recordValue(record, key) {
  try { return record.get(key); } catch (_) { return record && record[key]; }
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const appConfigs = app.findCollectionByNameOrId("storefront_app_configs");
  const installations = app.findCollectionByNameOrId("storefront_installations");
  const deliveries = app.findCollectionByNameOrId("push_campaign_deliveries");

  const fid = fieldByName(installations, "fid");
  const fidDigest = fieldByName(installations, "fid_digest");
  fid.required = false;
  fid.min = 0;
  fidDigest.required = false;
  fidDigest.min = 0;
  removeIndex(installations, "idx_storefront_installations_app_fid");
  addIndex(
    installations,
    "idx_storefront_installations_app_fid",
    true,
    "app_config, fid_digest",
    "fid_digest != ''",
  );
  addField(installations, textField(
    INSTALLATION_FIELD_IDS.uuidDigest,
    "installation_uuid_digest",
    64,
    false,
    true,
    "^[a-f0-9]{64}$",
  ));
  addField(installations, selectField(
    INSTALLATION_FIELD_IDS.identitySource,
    "identity_source",
    ["firebase_fid", "app_uuid", "migrated"],
    false,
    false,
  ));
  addField(installations, selectField(
    INSTALLATION_FIELD_IDS.trustLevel,
    "trust_level",
    ["basic", "firebase_verified", "revoked"],
    false,
    false,
  ));
  addField(installations, selectField(
    INSTALLATION_FIELD_IDS.firebaseStatus,
    "firebase_status",
    ["unknown", "unavailable", "registering", "registered", "failed"],
    false,
    false,
  ));
  addField(installations, dateField(INSTALLATION_FIELD_IDS.firebaseSyncedAt, "firebase_synced_at", false, false));
  addField(installations, textField(
    INSTALLATION_FIELD_IDS.firebaseLastError,
    "firebase_last_error",
    80,
    false,
    true,
    "^[a-z0-9_:-]{1,80}$",
  ));
  addField(installations, dateField(INSTALLATION_FIELD_IDS.lastHeartbeatAt, "last_heartbeat_at", false, false));
  addIndex(
    installations,
    "idx_storefront_installations_app_uuid",
    true,
    "app_config, installation_uuid_digest",
    "installation_uuid_digest != ''",
  );
  addIndex(
    installations,
    "idx_storefront_installations_heartbeat",
    false,
    "store, status, last_heartbeat_at",
    "",
  );
  app.save(installations);

  forEachRecord(app, "storefront_installations", (record) => {
    if (!recordString(record, "identity_source")) record.set("identity_source", "firebase_fid");
    if (!recordString(record, "trust_level")) record.set("trust_level", "firebase_verified");
    if (!recordString(record, "firebase_status")) record.set("firebase_status", "registered");
    if (!recordString(record, "firebase_synced_at")) {
      record.set("firebase_synced_at", recordString(record, "last_seen_at") || recordString(record, "updated"));
    }
    if (!recordString(record, "last_heartbeat_at")) {
      record.set("last_heartbeat_at", recordString(record, "last_seen_at") || recordString(record, "updated"));
    }
    app.save(record);
  });

  addField(deliveries, selectField(
    DELIVERY_FIELD_IDS.fcmStatus,
    "fcm_status",
    ["not_attempted", "pending", "accepted", "received", "failed_transient", "failed_permanent", "invalid"],
    false,
    false,
  ));
  addField(deliveries, selectField(
    DELIVERY_FIELD_IDS.nativeStatus,
    "native_status",
    ["pending", "delivered", "read", "expired"],
    false,
    false,
  ));
  addField(deliveries, dateField(DELIVERY_FIELD_IDS.fcmReceivedAt, "fcm_received_at", false, false));
  addField(deliveries, dateField(DELIVERY_FIELD_IDS.nativeDeliveredAt, "native_delivered_at", false, false));
  addField(deliveries, dateField(DELIVERY_FIELD_IDS.readAt, "read_at", false, false));
  addField(deliveries, dateField(DELIVERY_FIELD_IDS.deliveryExpiresAt, "delivery_expires_at", false, false));
  addIndex(deliveries, "idx_push_deliveries_native_pending", false, "installation, native_status, delivery_expires_at, created", "");
  app.save(deliveries);

  forEachRecord(app, "push_campaign_deliveries", (record) => {
    const legacy = recordString(record, "status");
    const fcmStatus = legacy === "accepted" ? "accepted"
      : legacy === "failed_transient" ? "failed_transient"
        : legacy === "failed_permanent" ? "failed_permanent"
          : legacy === "invalid_fid" ? "invalid"
            : legacy === "pending" || legacy === "claimed" ? "pending"
              : "not_attempted";
    record.set("fcm_status", fcmStatus);
    // No reencolamos campañas históricas al instalar esta migración: una APK
    // anterior no guardaba el id local y podría mostrar otra vez una campaña ya vista.
    record.set("native_status", "expired");
    if (recordString(record, "inbox_read_at")) record.set("read_at", recordString(record, "inbox_read_at"));
    if (recordString(record, "inbox_expires_at")) record.set("delivery_expires_at", recordString(record, "inbox_expires_at"));
    app.save(record);
  });

  let diagnostics = null;
  try { diagnostics = app.findCollectionByNameOrId(DIAGNOSTICS_COLLECTION); } catch (_) {}
  if (!diagnostics) {
    diagnostics = new Collection({
      id: "pbc_1788440400",
      name: DIAGNOSTICS_COLLECTION,
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField("txt17884404101"),
        relationField("rel17884404102", "store", stores.id, true, false),
        relationField("rel17884404103", "app_config", appConfigs.id, true, false),
        relationField("rel17884404104", "installation", installations.id, true, true),
        textField("txt17884404105", "idempotency_key", 128, true, true, "^[A-Za-z0-9._:-]{16,128}$"),
        selectField("sel17884404106", "event_type", [
          "APP_STARTED",
          "INTERNET_AVAILABLE",
          "BACKEND_REACHABLE",
          "INSTALLATION_UUID_CREATED",
          "FIREBASE_INITIALIZED",
          "FID_CREATED",
          "FCM_TOKEN_CREATED",
          "INSTALLATION_REGISTER_REQUEST_SENT",
          "INSTALLATION_REGISTER_RESPONSE",
          "NOTIFICATION_PERMISSION_STATUS",
          "LAST_PUSH_RECEIVED",
          "LAST_ERROR",
        ], true, false),
        selectField("sel17884404107", "result", ["started", "success", "failure", "skipped"], true, false),
        textField("txt17884404108", "error_code", 80, false, true, "^[a-z0-9_:-]{1,80}$"),
        numberField("num17884404109", "http_status", 600),
        numberField("num17884404110", "latency_ms", 600000),
        dateField("dat17884404111", "client_occurred_at", true, false),
        jsonField("jsn17884404112", "metadata_json", 4096),
        dateField("dat17884404113", "delete_after", true, false),
        autoDateField("aut17884404114", "created", false),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_storefront_diagnostics_idempotency` ON `storefront_installation_diagnostics` (`installation`, `idempotency_key`)",
        "CREATE INDEX `idx_storefront_diagnostics_support` ON `storefront_installation_diagnostics` (`store`, `installation`, `client_occurred_at`)",
        "CREATE INDEX `idx_storefront_diagnostics_retention` ON `storefront_installation_diagnostics` (`delete_after`)",
      ],
    });
    app.save(diagnostics);
  }
}, (app) => {
  const coreRows = app.findRecordsByFilter(
    "storefront_installations",
    'installation_uuid_digest != "" || fid_digest = ""',
    "",
    1,
    0,
    {},
  ) || [];
  const diagnosticRows = app.findRecordsByFilter(DIAGNOSTICS_COLLECTION, "", "", 1, 0, {}) || [];
  const nativeRows = app.findRecordsByFilter(
    "push_campaign_deliveries",
    'native_status = "delivered" || native_status = "read" || fcm_status = "received"',
    "",
    1,
    0,
    {},
  ) || [];
  if (coreRows.length || diagnosticRows.length || nativeRows.length) {
    throw new Error("unsafe_rollback_storefront_resilient_installations");
  }

  app.delete(app.findCollectionByNameOrId(DIAGNOSTICS_COLLECTION));

  const deliveries = app.findCollectionByNameOrId("push_campaign_deliveries");
  removeIndex(deliveries, "idx_push_deliveries_native_pending");
  Object.keys(DELIVERY_FIELD_IDS).forEach((key) => removeField(deliveries, ({
    fcmStatus: "fcm_status",
    nativeStatus: "native_status",
    fcmReceivedAt: "fcm_received_at",
    nativeDeliveredAt: "native_delivered_at",
    readAt: "read_at",
    deliveryExpiresAt: "delivery_expires_at",
  })[key]));
  app.save(deliveries);

  const installations = app.findCollectionByNameOrId("storefront_installations");
  removeIndex(installations, "idx_storefront_installations_app_uuid");
  removeIndex(installations, "idx_storefront_installations_heartbeat");
  Object.keys(INSTALLATION_FIELD_IDS).forEach((key) => removeField(installations, ({
    uuidDigest: "installation_uuid_digest",
    identitySource: "identity_source",
    trustLevel: "trust_level",
    firebaseStatus: "firebase_status",
    firebaseSyncedAt: "firebase_synced_at",
    firebaseLastError: "firebase_last_error",
    lastHeartbeatAt: "last_heartbeat_at",
  })[key]));
  removeIndex(installations, "idx_storefront_installations_app_fid");
  addIndex(installations, "idx_storefront_installations_app_fid", true, "app_config, fid_digest", "");
  const fid = fieldByName(installations, "fid");
  const fidDigest = fieldByName(installations, "fid_digest");
  fid.required = true;
  fid.min = 1;
  fidDigest.required = true;
  fidDigest.min = 1;
  app.save(installations);
});
