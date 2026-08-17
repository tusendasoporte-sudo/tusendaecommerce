/// <reference path="../pb_data/types.d.ts" />

const APP_CONFIG_PROJECT_ID_FIELD = "text17868384001";
const APP_CONFIG_PROJECT_NUMBER_FIELD = "text17868384002";

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

function numberField(id, name, required, min, max) {
  return {
    hidden: false, id, max: max === undefined ? null : max, min: min === undefined ? null : min,
    name, onlyInt: true, presentable: false, required: !!required, system: false, type: "number",
  };
}

function jsonField(id, name, maxSize, hidden) {
  return {
    hidden: hidden === true, id, maxSize, name, presentable: false,
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

function privateCollection(id, name, fields, indexes) {
  return new Collection({
    id, name, type: "base", system: false,
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields, indexes,
  });
}

function addAppConfigProjectFields(appConfigs) {
  let projectId = null;
  let projectNumber = null;
  try { projectId = appConfigs.fields.getByName("firebase_project_id"); } catch (_) {}
  try { projectNumber = appConfigs.fields.getByName("firebase_project_number"); } catch (_) {}
  if (!projectId) appConfigs.fields.add(new Field(textField(
    APP_CONFIG_PROJECT_ID_FIELD,
    "firebase_project_id",
    128,
    false,
    false,
    "^[a-z][a-z0-9-]{4,28}[a-z0-9]$"
  )));
  if (!projectNumber) appConfigs.fields.add(new Field(textField(
    APP_CONFIG_PROJECT_NUMBER_FIELD,
    "firebase_project_number",
    20,
    false,
    true,
    "^[0-9]{6,20}$"
  )));
  const indexes = Array.isArray(appConfigs.indexes) ? appConfigs.indexes : [];
  if (!indexes.some((index) => String(index).includes("idx_storefront_app_configs_project"))) {
    appConfigs.indexes = [...indexes,
      "CREATE UNIQUE INDEX `idx_storefront_app_configs_project` ON `storefront_app_configs` (`firebase_project_id`) WHERE `firebase_project_id` != ''"];
  }
}

function hasRows(app, collection) {
  const rows = app.findRecordsByFilter(collection, "", "", 1, 0);
  return !!(rows && rows.length);
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const appConfigs = app.findCollectionByNameOrId("storefront_app_configs");
  addAppConfigProjectFields(appConfigs);
  app.save(appConfigs);

  const profiles = privateCollection(
    "pbc_1786838401",
    "storefront_app_build_profiles",
    [
      idField("text17868384101"),
      relationField("rel17868384102", "store", stores.id, true, false),
      relationField("rel17868384103", "app_config", appConfigs.id, false, false),
      textField("text17868384104", "app_key", 64, true, false, "^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$"),
      textField("text17868384105", "display_name", 120, true, false),
      textField("text17868384106", "package_name", 190, true, false, "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"),
      textField("text17868384107", "store_url", 500, true, false, "^https://"),
      textField("text17868384108", "brand_key", 64, true, false, "^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$"),
      selectField("sel17868384109", "distribution", ["play_and_direct", "direct"], true, false),
      selectField("sel17868384110", "status", ["draft", "queued", "provisioned", "needs_attention", "retired"], true, false),
      textField("text17868384111", "firebase_project_id", 128, false, false, "^[a-z][a-z0-9-]{4,28}[a-z0-9]$"),
      textField("text17868384112", "firebase_project_number", 20, false, true, "^[0-9]{6,20}$"),
      textField("text17868384113", "firebase_app_id", 255, false, true),
      textField("text17868384114", "signing_cert_sha256", 95, false, false, "^[A-F0-9:]{95}$"),
      textField("text17868384115", "upload_cert_sha256", 95, false, false, "^[A-F0-9:]{95}$"),
      numberField("num17868384116", "current_version_code", false, 1, 2147483647),
      textField("text17868384117", "current_version_name", 40, false, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      textField("text17868384122", "current_engine_version", 40, false, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      textField("text17868384123", "current_engine_revision", 40, false, false, "^[a-f0-9]{40}$"),
      relationField("rel17868384118", "created_by", users.id, true, false),
      relationField("rel17868384119", "updated_by", users.id, true, false),
      autoDateField("auto17868384120", "created", false),
      autoDateField("auto17868384121", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_storefront_app_build_profiles_store` ON `storefront_app_build_profiles` (`store`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_build_profiles_app_key` ON `storefront_app_build_profiles` (`app_key`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_build_profiles_package` ON `storefront_app_build_profiles` (`package_name`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_build_profiles_project` ON `storefront_app_build_profiles` (`firebase_project_id`) WHERE `firebase_project_id` != ''",
    ]
  );
  app.save(profiles);

  const jobs = privateCollection(
    "pbc_1786838402",
    "storefront_app_build_jobs",
    [
      idField("text17868384201"),
      relationField("rel17868384202", "store", stores.id, true, false),
      relationField("rel17868384203", "profile", profiles.id, false, false),
      selectField("sel17868384204", "operation", ["provision", "update"], true, false),
      selectField("sel17868384205", "status", ["preview", "queued", "claimed", "succeeded", "failed", "needs_attention", "canceled"], true, false),
      textField("text17868384206", "preview_hash", 64, true, false, "^[a-f0-9]{64}$"),
      jsonField("json17868384207", "request_json", 32768, true),
      jsonField("json17868384208", "preview_json", 32768, false),
      dateField("date17868384209", "preview_expires_at", true, false),
      relationField("rel17868384210", "created_by", users.id, true, false),
      relationField("rel17868384211", "confirmed_by", users.id, false, false),
      dateField("date17868384212", "confirmed_at", false, false),
      textField("text17868384213", "runner_id", 100, false, false, "^[A-Za-z0-9._:-]+$"),
      textField("text17868384214", "failure_code", 80, false, false, "^[a-z0-9_:-]+$"),
      dateField("date17868384215", "started_at", false, false),
      dateField("date17868384216", "completed_at", false, false),
      autoDateField("auto17868384217", "created", false),
      autoDateField("auto17868384218", "updated", true),
      relationField("rel17868384219", "delivery_sender", users.id, false, true),
      relationField("rel17868384220", "delivery_recipient", users.id, false, true),
      selectField("sel17868384221", "delivery_status", ["pending", "marked_sent"], false, false),
      textField("text17868384222", "delivery_sender_whatsapp", 15, false, true, "^[1-9][0-9]{7,14}$"),
      textField("text17868384223", "delivery_recipient_whatsapp", 15, false, true, "^[1-9][0-9]{7,14}$"),
      textField("text17868384224", "delivery_message_sha256", 64, false, true, "^[a-f0-9]{64}$"),
      dateField("date17868384225", "delivery_marked_at", false, false),
    ],
    [
      "CREATE INDEX `idx_storefront_app_build_jobs_store_created` ON `storefront_app_build_jobs` (`store`, `created`)",
      "CREATE INDEX `idx_storefront_app_build_jobs_status_created` ON `storefront_app_build_jobs` (`status`, `created`)",
      "CREATE INDEX `idx_storefront_app_build_jobs_delivery` ON `storefront_app_build_jobs` (`store`, `delivery_status`, `completed_at`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_build_jobs_preview_hash` ON `storefront_app_build_jobs` (`preview_hash`)",
    ]
  );
  app.save(jobs);

  const artifacts = privateCollection(
    "pbc_1786838403",
    "storefront_app_artifacts",
    [
      idField("text17868384301"),
      relationField("rel17868384302", "store", stores.id, true, false),
      relationField("rel17868384303", "profile", profiles.id, true, false),
      relationField("rel17868384304", "job", jobs.id, true, false),
      selectField("sel17868384305", "kind", ["apk", "aab", "checksums", "instructions", "build_manifest"], true, false),
      selectField("sel17868384306", "visibility", ["store_delivery", "master_only"], true, false),
      textField("text17868384307", "file_name", 220, true, false, "^[A-Za-z0-9._-]+$"),
      textField("text17868384308", "storage_locator", 1000, true, true),
      textField("text17868384309", "sha256", 64, true, false, "^[a-f0-9]{64}$"),
      numberField("num17868384310", "bytes", true, 1, null),
      numberField("num17868384311", "version_code", true, 1, 2147483647),
      textField("text17868384312", "version_name", 40, true, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      autoDateField("auto17868384313", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `idx_storefront_app_artifacts_job_kind` ON `storefront_app_artifacts` (`job`, `kind`)",
      "CREATE INDEX `idx_storefront_app_artifacts_store_created` ON `storefront_app_artifacts` (`store`, `created`)",
    ]
  );
  app.save(artifacts);
}, (app) => {
  for (const name of ["storefront_app_artifacts", "storefront_app_build_jobs", "storefront_app_build_profiles"]) {
    if (hasRows(app, name)) throw new Error("unsafe_rollback_storefront_app_build_data");
  }
  const appConfigs = app.findCollectionByNameOrId("storefront_app_configs");
  const configured = app.findRecordsByFilter(
    "storefront_app_configs",
    "firebase_project_id != '' || firebase_project_number != ''",
    "",
    1,
    0
  );
  if (configured && configured.length) throw new Error("unsafe_rollback_storefront_firebase_project_data");
  for (const name of ["storefront_app_artifacts", "storefront_app_build_jobs", "storefront_app_build_profiles"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
  try { appConfigs.fields.removeById(APP_CONFIG_PROJECT_ID_FIELD); } catch (_) {}
  try { appConfigs.fields.removeById(APP_CONFIG_PROJECT_NUMBER_FIELD); } catch (_) {}
  appConfigs.indexes = (Array.isArray(appConfigs.indexes) ? appConfigs.indexes : [])
    .filter((index) => !String(index).includes("idx_storefront_app_configs_project"));
  app.save(appConfigs);
});
