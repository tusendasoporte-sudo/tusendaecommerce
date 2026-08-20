/// <reference path="../pb_data/types.d.ts" />

const EVENTS = "storefront_app_download_events";

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function relationField(id, name, collectionId, required, hidden) {
  return {
    cascadeDelete: false, collectionId, hidden: hidden === true, id, maxSelect: 1,
    minSelect: required ? 1 : 0, name, presentable: false, required: !!required,
    system: false, type: "relation",
  };
}

function selectField(id, name, values) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: true, system: false, type: "select", values,
  };
}

function textField(id, name, max, required, pattern) {
  return {
    autogeneratePattern: "", hidden: false, id, max, min: required ? 1 : 0,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function numberField(id, name, min, max) {
  return {
    hidden: false, id, max, min, name, onlyInt: true, presentable: false,
    required: true, system: false, type: "number",
  };
}

function dateField(id, name) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: true, system: false, type: "date",
  };
}

function autoDateField(id, name) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: false,
    presentable: false, system: false, type: "autodate",
  };
}

migrate((app) => {
  let existing = null;
  try { existing = app.findCollectionByNameOrId(EVENTS); } catch (_) {}
  if (existing) return;

  const stores = app.findCollectionByNameOrId("stores");
  const configs = app.findCollectionByNameOrId("storefront_app_configs");
  const installations = app.findCollectionByNameOrId("storefront_installations");
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  const collection = new Collection({
    id: "pbc_1787371201",
    name: EVENTS,
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("txt17873712001"),
      relationField("rel17873712002", "store", stores.id, true, false),
      relationField("rel17873712003", "app_config", configs.id, false, false),
      relationField("rel17873712004", "profile", profiles.id, true, false),
      relationField("rel17873712005", "artifact", artifacts.id, true, false),
      relationField("rel17873712006", "installation", installations.id, false, true),
      textField("txt17873712007", "event_key", 128, true, "^[A-Za-z0-9:_-]+$"),
      selectField("sel17873712008", "source", ["shared_link", "private_update", "master", "client_app"]),
      selectField("sel17873712009", "event_type", ["download_started", "download_verified", "version_activated"]),
      numberField("num17873712010", "version_code", 1, 2147483647),
      textField("txt17873712011", "version_name", 40, true, "^[A-Za-z0-9][A-Za-z0-9._+()-]{0,39}$"),
      numberField("num17873712012", "bytes", 1, 104857600),
      numberField("num17873712013", "count", 1, 2147483647),
      dateField("dat17873712014", "occurred_at"),
      autoDateField("aut17873712015", "created"),
    ],
    indexes: [
      "CREATE INDEX `idx_storefront_app_download_events_store_time` ON `storefront_app_download_events` (`store`, `occurred_at`)",
      "CREATE INDEX `idx_storefront_app_download_events_artifact_funnel` ON `storefront_app_download_events` (`artifact`, `source`, `event_type`, `occurred_at`)",
      "CREATE INDEX `idx_storefront_app_download_events_installation_version` ON `storefront_app_download_events` (`installation`, `version_code`, `event_type`)",
      "CREATE INDEX `idx_storefront_app_download_events_installation_artifact` ON `storefront_app_download_events` (`installation`, `artifact`, `event_type`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_download_events_key` ON `storefront_app_download_events` (`event_key`)",
    ],
  });
  app.save(collection);
}, (app) => {
  let rows = [];
  try { rows = app.findRecordsByFilter(EVENTS, "", "", 1, 0) || []; } catch (_) {}
  if (rows.length) throw new Error("unsafe_rollback_storefront_app_download_analytics");
  try { app.delete(app.findCollectionByNameOrId(EVENTS)); } catch (_) {}
});
