/// <reference path="../pb_data/types.d.ts" />

const PROFILE_FIELDS = Object.freeze({
  distributionStatus: "sel17869248001",
  distributionReason: "sel17869248002",
  distributionChangedAt: "date17869248003",
  distributionChangedBy: "rel17869248004",
  lifecycleStatus: "sel17869248005",
  deletionRequestedAt: "date17869248006",
  deletionRecoverUntil: "date17869248007",
  deletionRequestedBy: "rel17869248008",
  deletionConfirmationSha256: "txt17869248009",
  deletedAt: "date17869248010",
});
const ARTIFACT_FIELDS = Object.freeze({
  lifecycleStatus: "sel17869248101",
  deletionAction: "rel17869248102",
  deletedAt: "date17869248103",
  deletedBy: "rel17869248104",
});
const ACTIONS_COLLECTION = "storefront_app_admin_actions";

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

function rows(app, collection, filter, limit) {
  return app.findRecordsByFilter(collection, filter || "", "", limit || 1, 0) || [];
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");

  profiles.fields.add(new Field(selectField(PROFILE_FIELDS.distributionStatus, "distribution_status", ["active", "withdrawn"], true, false)));
  profiles.fields.add(new Field(selectField(PROFILE_FIELDS.distributionReason, "distribution_reason", ["manual", "plan_downgrade", "app_deletion", "artifacts_deleted"], false, false)));
  profiles.fields.add(new Field(dateField(PROFILE_FIELDS.distributionChangedAt, "distribution_changed_at", false, false)));
  profiles.fields.add(new Field(relationField(PROFILE_FIELDS.distributionChangedBy, "distribution_changed_by", users.id, false, true)));
  profiles.fields.add(new Field(selectField(PROFILE_FIELDS.lifecycleStatus, "lifecycle_status", ["active", "deletion_scheduled", "deleted"], true, false)));
  profiles.fields.add(new Field(dateField(PROFILE_FIELDS.deletionRequestedAt, "deletion_requested_at", false, false)));
  profiles.fields.add(new Field(dateField(PROFILE_FIELDS.deletionRecoverUntil, "deletion_recover_until", false, false)));
  profiles.fields.add(new Field(relationField(PROFILE_FIELDS.deletionRequestedBy, "deletion_requested_by", users.id, false, true)));
  profiles.fields.add(new Field(textField(PROFILE_FIELDS.deletionConfirmationSha256, "deletion_confirmation_sha256", 64, false, true, "^[a-f0-9]{64}$")));
  profiles.fields.add(new Field(dateField(PROFILE_FIELDS.deletedAt, "deleted_at", false, false)));
  app.save(profiles);

  const actions = new Collection({
    id: "pbc_1786924801",
    name: ACTIONS_COLLECTION,
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("txt17869248201"),
      relationField("rel17869248202", "store", stores.id, true, false),
      relationField("rel17869248203", "profile", profiles.id, true, false),
      selectField("sel17869248204", "type", ["delete_artifacts", "delete_app"], true, false),
      selectField("sel17869248205", "status", ["queued", "scheduled", "claimed", "succeeded", "failed", "needs_attention", "canceled"], true, false),
      dateField("date17869248206", "not_before", false, false),
      jsonField("json17869248207", "target_json", 131072, true),
      relationField("rel17869248208", "requested_by", users.id, true, true),
      textField("txt17869248209", "confirmation_sha256", 64, true, true, "^[a-f0-9]{64}$"),
      textField("txt17869248210", "reason", 500, false, false),
      textField("txt17869248211", "runner_id", 100, false, false, "^[A-Za-z0-9._:-]+$"),
      textField("txt17869248212", "failure_code", 80, false, false, "^[a-z0-9_:-]+$"),
      dateField("date17869248213", "started_at", false, false),
      dateField("date17869248214", "completed_at", false, false),
      autoDateField("auto17869248215", "created", false),
      autoDateField("auto17869248216", "updated", true),
    ],
    indexes: [
      "CREATE INDEX `idx_storefront_app_admin_actions_queue` ON `storefront_app_admin_actions` (`status`, `not_before`, `created`)",
      "CREATE INDEX `idx_storefront_app_admin_actions_profile` ON `storefront_app_admin_actions` (`profile`, `created`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_admin_actions_active` ON `storefront_app_admin_actions` (`profile`) WHERE `status` = 'queued' OR `status` = 'scheduled' OR `status` = 'claimed'",
    ],
  });
  app.save(actions);

  artifacts.fields.add(new Field(selectField(ARTIFACT_FIELDS.lifecycleStatus, "lifecycle_status", ["available", "deletion_queued", "deleted"], true, false)));
  artifacts.fields.add(new Field(relationField(ARTIFACT_FIELDS.deletionAction, "deletion_action", actions.id, false, true)));
  artifacts.fields.add(new Field(dateField(ARTIFACT_FIELDS.deletedAt, "deleted_at", false, false)));
  artifacts.fields.add(new Field(relationField(ARTIFACT_FIELDS.deletedBy, "deleted_by", users.id, false, true)));
  const storageLocator = artifacts.fields.getByName("storage_locator");
  storageLocator.required = false;
  storageLocator.min = 0;
  app.save(artifacts);

  rows(app, "storefront_app_build_profiles", "", 10000).forEach((profile) => {
    const retired = String(profile.get("status") || "") === "retired";
    profile.set("distribution_status", retired ? "withdrawn" : "active");
    profile.set("distribution_reason", retired ? "manual" : "");
    profile.set("lifecycle_status", retired ? "deleted" : "active");
    app.save(profile);
  });
  rows(app, "storefront_app_artifacts", "", 10000).forEach((artifact) => {
    artifact.set("lifecycle_status", "available");
    app.save(artifact);
  });
}, (app) => {
  if (rows(app, ACTIONS_COLLECTION, "", 1).length
    || rows(app, "storefront_app_build_profiles", "distribution_status != 'active' || lifecycle_status != 'active'", 1).length
    || rows(app, "storefront_app_artifacts", "lifecycle_status != 'available'", 1).length) {
    throw new Error("unsafe_rollback_storefront_app_admin_c10_6");
  }
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  const storageLocator = artifacts.fields.getByName("storage_locator");
  storageLocator.required = true;
  storageLocator.min = 1;
  Object.values(ARTIFACT_FIELDS).forEach((id) => artifacts.fields.removeById(id));
  app.save(artifacts);
  app.delete(app.findCollectionByNameOrId(ACTIONS_COLLECTION));
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  Object.values(PROFILE_FIELDS).forEach((id) => profiles.fields.removeById(id));
  app.save(profiles);
});
