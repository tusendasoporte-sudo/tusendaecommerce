/// <reference path="../pb_data/types.d.ts" />

const PROFILE_LAST_ALLOCATED = "num17872812001";
const ARTIFACT_RELEASE_STATUS = "sel17872812002";
const ARTIFACT_APPROVED_AT = "date17872812003";
const ARTIFACT_APPROVED_BY = "rel17872812004";
const ARTIFACT_PUBLISHED_AT = "date17872812005";
const ARTIFACT_PUBLISHED_BY = "rel17872812006";

function numberField(id, name) {
  return { hidden: false, id, max: 2147483647, min: 0, name, onlyInt: true, presentable: false, required: false, system: false, type: "number" };
}

function selectField(id, name, values) {
  return { hidden: false, id, maxSelect: 1, name, presentable: false, required: false, system: false, type: "select", values };
}

function dateField(id, name) {
  return { hidden: false, id, max: "", min: "", name, presentable: false, required: false, system: false, type: "date" };
}

function relationField(id, name, collectionId) {
  return { cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1, minSelect: 0, name, presentable: false, required: false, system: false, type: "relation" };
}

function rows(app, collection, filter, limit) {
  return app.findRecordsByFilter(collection, filter || "", "+created", limit || 5000, 0) || [];
}

function hasField(collection, name) {
  try { return !!collection.fields.getByName(name); } catch (_) { return false; }
}

migrate((app) => {
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  const users = app.findCollectionByNameOrId("users");

  if (!hasField(profiles, "last_allocated_version_code")) {
    profiles.fields.add(new Field(numberField(PROFILE_LAST_ALLOCATED, "last_allocated_version_code")));
  }
  if (!hasField(artifacts, "release_status")) {
    artifacts.fields.add(new Field(selectField(ARTIFACT_RELEASE_STATUS, "release_status", ["candidate", "approved", "published"])));
    artifacts.fields.add(new Field(dateField(ARTIFACT_APPROVED_AT, "approved_at")));
    artifacts.fields.add(new Field(relationField(ARTIFACT_APPROVED_BY, "approved_by", users.id)));
    artifacts.fields.add(new Field(dateField(ARTIFACT_PUBLISHED_AT, "published_at")));
    artifacts.fields.add(new Field(relationField(ARTIFACT_PUBLISHED_BY, "published_by", users.id)));
  }
  app.save(profiles);
  app.save(artifacts);

  rows(app, "storefront_app_build_profiles").forEach((profile) => {
    profile.set("last_allocated_version_code", Number(profile.get("current_version_code") || 0));
    app.save(profile);
  });
  rows(app, "storefront_app_artifacts", "kind = 'apk'").forEach((artifact) => {
    const lifecycle = artifact.get("lifecycle_status");
    artifact.set("release_status", lifecycle === "available" ? "published" : lifecycle === "staged" ? "candidate" : "");
    app.save(artifact);
  });
}, (app) => {
  const protectedRows = rows(
    app,
    "storefront_app_artifacts",
    "release_status = 'candidate' || release_status = 'approved' || approved_at != '' || published_at != ''",
    1,
  );
  if (protectedRows.length) throw new Error("unsafe_rollback_storefront_candidate_release_data");

  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  for (const id of [ARTIFACT_PUBLISHED_BY, ARTIFACT_PUBLISHED_AT, ARTIFACT_APPROVED_BY, ARTIFACT_APPROVED_AT, ARTIFACT_RELEASE_STATUS]) {
    try { artifacts.fields.removeById(id); } catch (_) {}
  }
  try { profiles.fields.removeById(PROFILE_LAST_ALLOCATED); } catch (_) {}
  app.save(artifacts);
  app.save(profiles);
});
