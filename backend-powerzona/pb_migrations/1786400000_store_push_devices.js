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

function relationField(id, name, collectionId) {
  return {
    cascadeDelete: true, collectionId, hidden: false, id, maxSelect: 1,
    minSelect: 1, name, presentable: false, required: true,
    system: false, type: "relation",
  };
}

function selectField(id, name, values) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: true, system: false, type: "select", values,
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

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const collection = new Collection({
    id: "pbc_1786400000",
    name: "store_push_devices",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1786400001"),
      relationField("relation1786400002", "store", stores.id),
      relationField("relation1786400003", "user", users.id),
      textField("text1786400004", "installation_id", 255, true, true),
      textField("text1786400005", "installation_digest", 64, true, true),
      textField("text1786400006", "app_id", 190, true, false),
      selectField("select1786400007", "platform", ["android"]),
      selectField("select1786400008", "status", ["active", "disabled", "invalid"]),
      textField("text1786400009", "device_label", 120, false, false),
      textField("text1786400010", "os_version", 40, false, false),
      textField("text1786400011", "app_version", 40, false, false),
      dateField("date1786400012", "last_seen_at", true),
      dateField("date1786400013", "disabled_at", false),
      autoDateField("autodate1786400014", "created", false),
      autoDateField("autodate1786400015", "updated", true),
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_store_push_devices_installation` ON `store_push_devices` (`installation_digest`)",
      "CREATE INDEX `idx_store_push_devices_store_status` ON `store_push_devices` (`store`, `status`)",
      "CREATE INDEX `idx_store_push_devices_user_status` ON `store_push_devices` (`user`, `status`)",
      "CREATE INDEX `idx_store_push_devices_seen` ON `store_push_devices` (`status`, `last_seen_at`)",
    ],
  });
  return app.save(collection);
}, (app) => {
  try {
    return app.delete(app.findCollectionByNameOrId("store_push_devices"));
  } catch (_) {}
});
