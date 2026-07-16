/// <reference path="../pb_data/types.d.ts" />

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required) {
  return {
    cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1,
    minSelect: required ? 1 : 0, name, presentable: false, required: !!required,
    system: false, type: "relation",
  };
}

function selectField(id, name, values, required) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function dateField(id, name, required) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

function boolField(id, name) {
  return {
    default: false, hidden: false, id, name, presentable: false,
    required: false, system: false, type: "bool",
  };
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");

  const devices = new Collection({
    id: "pbc_1783386700",
    name: "store_user_devices",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386701"),
      relationField("relation1783386702", "store", stores.id, true),
      relationField("relation1783386703", "user", users.id, true),
      textField("text1783386704", "device_digest", 64, true, true),
      selectField("select1783386705", "digest_version", ["sha256-v1"], true),
      selectField("select1783386706", "status", ["authorized", "revoked"], true),
      textField("text1783386707", "label", 120, true, false),
      textField("text1783386708", "browser_name", 40, true, false),
      textField("text1783386709", "os_name", 40, true, false),
      selectField("select1783386710", "device_type", ["desktop", "mobile", "tablet", "unknown"], true),
      dateField("date1783386711", "first_seen_at", true),
      dateField("date1783386712", "last_seen_at", true),
      dateField("date1783386713", "revoked_at", false),
      relationField("relation1783386714", "revoked_by", users.id, false),
      textField("text1783386715", "revoke_reason", 500, false, false),
      autoDateField("autodate1783386716", "created", false),
      autoDateField("autodate1783386717", "updated", true),
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_store_user_devices_user_digest` ON `store_user_devices` (`user`, `device_digest`)",
      "CREATE INDEX `idx_store_user_devices_store_status` ON `store_user_devices` (`store`, `status`)",
      "CREATE INDEX `idx_store_user_devices_store_status_digest` ON `store_user_devices` (`store`, `status`, `device_digest`)",
      "CREATE INDEX `idx_store_user_devices_user_status_seen` ON `store_user_devices` (`user`, `status`, `last_seen_at`)",
    ],
  });
  app.save(devices);

  const audit = new Collection({
    id: "pbc_1783386750",
    name: "store_user_device_audit",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386751"),
      relationField("relation1783386752", "store", stores.id, false),
      textField("text1783386753", "store_id_snapshot", 15, true, false),
      textField("text1783386754", "store_name_snapshot", 140, true, false),
      relationField("relation1783386755", "target_user", users.id, false),
      textField("text1783386756", "target_user_id_snapshot", 15, true, false),
      textField("text1783386757", "target_user_email_snapshot", 254, true, false),
      relationField("relation1783386758", "device", devices.id, false),
      textField("text1783386759", "device_id_snapshot", 15, true, false),
      textField("text1783386760", "device_label_snapshot", 120, true, false),
      textField("text1783386761", "browser_snapshot", 40, true, false),
      textField("text1783386762", "os_snapshot", 40, true, false),
      selectField("select1783386763", "device_type_snapshot", ["desktop", "mobile", "tablet", "unknown"], true),
      relationField("relation1783386764", "actor", users.id, false),
      textField("text1783386765", "actor_name_snapshot", 160, true, false),
      selectField("select1783386766", "actor_role_snapshot", ["master_admin", "store_admin", "store_staff"], true),
      selectField("select1783386767", "action", ["device_authorized", "device_revoked"], true),
      boolField("bool1783386768", "sessions_revoked"),
      textField("text1783386769", "reason", 500, false, false),
      autoDateField("autodate1783386770", "created", false),
    ],
    indexes: [
      "CREATE INDEX `idx_store_user_device_audit_store_created` ON `store_user_device_audit` (`store`, `created`)",
      "CREATE INDEX `idx_store_user_device_audit_target_created` ON `store_user_device_audit` (`target_user`, `created`)",
      "CREATE INDEX `idx_store_user_device_audit_device_created` ON `store_user_device_audit` (`device`, `created`)",
      "CREATE INDEX `idx_store_user_device_audit_action_created` ON `store_user_device_audit` (`action`, `created`)",
    ],
  });
  return app.save(audit);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("store_user_device_audit"));
  } catch (_) {}
  try {
    app.delete(app.findCollectionByNameOrId("store_user_devices"));
  } catch (_) {}
});
