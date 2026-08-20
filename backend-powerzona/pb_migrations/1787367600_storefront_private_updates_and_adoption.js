/// <reference path="../pb_data/types.d.ts" />

const TICKETS = "storefront_app_update_tickets";
const PROFILE_ORIGIN = "sel17873676001";
const PROFILE_BRANDING_MODE = "sel17873676002";
const PROFILE_ADOPTED_AT = "date17873676003";
const ARTIFACT_UPDATE_STATE = "sel17873676004";

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

function textField(id, name, max, required, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function selectField(id, name, values) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: false, system: false, type: "select", values,
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

function hasField(collection, name) {
  try { return !!collection.fields.getByName(name); } catch (_) { return false; }
}

function rows(app, collection, filter, limit) {
  return app.findRecordsByFilter(collection, filter || "", "+created", limit || 5000, 0) || [];
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const appConfigs = app.findCollectionByNameOrId("storefront_app_configs");
  const installations = app.findCollectionByNameOrId("storefront_installations");
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");

  if (!hasField(profiles, "origin")) {
    profiles.fields.add(new Field(selectField(PROFILE_ORIGIN, "origin", ["generated", "adopted_existing"])));
    profiles.fields.add(new Field(selectField(PROFILE_BRANDING_MODE, "branding_mode", ["managed_assets", "inherit_existing"])));
    profiles.fields.add(new Field(dateField(PROFILE_ADOPTED_AT, "adopted_at", false, false)));
  }
  if (!hasField(artifacts, "update_delivery_status")) {
    artifacts.fields.add(new Field(selectField(
      ARTIFACT_UPDATE_STATE,
      "update_delivery_status",
      ["active", "paused", "withdrawn"]
    )));
  }
  app.save(profiles);
  app.save(artifacts);

  rows(app, "storefront_app_build_profiles").forEach((profile) => {
    if (!profile.get("origin")) profile.set("origin", "generated");
    if (!profile.get("branding_mode")) profile.set("branding_mode", "managed_assets");
    app.save(profile);
  });
  rows(app, "storefront_app_artifacts", "kind = 'apk'").forEach((artifact) => {
    if (!artifact.get("update_delivery_status")) {
      artifact.set("update_delivery_status", artifact.get("release_status") === "published" ? "active" : "");
      app.save(artifact);
    }
  });

  let tickets = null;
  try { tickets = app.findCollectionByNameOrId(TICKETS); } catch (_) {}
  if (!tickets) {
    tickets = privateCollection(
      "pbc_1787367601",
      TICKETS,
      [
        idField("txt17873676101"),
        relationField("rel17873676102", "store", stores.id, true, false),
        relationField("rel17873676103", "app_config", appConfigs.id, true, false),
        relationField("rel17873676104", "installation", installations.id, true, true),
        relationField("rel17873676105", "artifact", artifacts.id, true, true),
        textField("txt17873676106", "token_digest", 64, true, true, "^[a-f0-9]{64}$"),
        dateField("dat17873676107", "expires_at", true, true),
        dateField("dat17873676108", "used_at", false, true),
        autoDateField("aut17873676109", "created", false),
      ],
      [
        "CREATE UNIQUE INDEX `idx_storefront_app_update_tickets_digest` ON `storefront_app_update_tickets` (`token_digest`)",
        "CREATE INDEX `idx_storefront_app_update_tickets_expiry` ON `storefront_app_update_tickets` (`expires_at`)",
        "CREATE INDEX `idx_storefront_app_update_tickets_installation` ON `storefront_app_update_tickets` (`installation`, `created`)",
      ],
    );
    app.save(tickets);
  }
}, (app) => {
  if (rows(app, TICKETS, "", 1).length
    || rows(app, "storefront_app_build_profiles", "origin = 'adopted_existing' || adopted_at != ''", 1).length
    || rows(app, "storefront_app_artifacts", "update_delivery_status = 'paused' || update_delivery_status = 'withdrawn'", 1).length) {
    throw new Error("unsafe_rollback_storefront_private_updates_and_adoption");
  }
  try { app.delete(app.findCollectionByNameOrId(TICKETS)); } catch (_) {}
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  for (const id of [PROFILE_ADOPTED_AT, PROFILE_BRANDING_MODE, PROFILE_ORIGIN]) {
    try { profiles.fields.removeById(id); } catch (_) {}
  }
  try { artifacts.fields.removeById(ARTIFACT_UPDATE_STATE); } catch (_) {}
  app.save(profiles);
  app.save(artifacts);
});
