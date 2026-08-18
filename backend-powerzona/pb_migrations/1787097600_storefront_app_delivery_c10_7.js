/// <reference path="../pb_data/types.d.ts" />

const PROFILE_DOWNLOAD_NONCE_FIELD = "text17870976001";
const ARTIFACT_FILE_FIELD = "file17870976002";
const ARTIFACT_MAX_BYTES = 100 * 1024 * 1024;

function rows(app, collection, filter) {
  return app.findRecordsByFilter(collection, filter || "", "", 1, 0) || [];
}

function textField(id, name, max, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: 0,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: false, system: false, type: "text",
  };
}

function fileField(id, name) {
  return {
    hidden: true,
    id,
    maxSelect: 1,
    maxSize: ARTIFACT_MAX_BYTES,
    mimeTypes: [
      "application/vnd.android.package-archive",
      "application/octet-stream",
      "application/zip",
      "application/json",
      "text/plain",
    ],
    name,
    presentable: false,
    protected: true,
    required: false,
    system: false,
    thumbs: [],
    type: "file",
  };
}

migrate((app) => {
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  profiles.fields.add(new Field(textField(
    PROFILE_DOWNLOAD_NONCE_FIELD,
    "download_nonce",
    64,
    true,
    "^[A-Za-z0-9_-]{43}$"
  )));
  artifacts.fields.add(new Field(fileField(ARTIFACT_FILE_FIELD, "file")));
  const lifecycle = artifacts.fields.getByName("lifecycle_status");
  lifecycle.values = Array.from(new Set(["staged", ...(lifecycle.values || [])]));
  app.save(profiles);
  app.save(artifacts);
}, (app) => {
  if (rows(app, "storefront_app_build_profiles", "download_nonce != ''").length
    || rows(app, "storefront_app_artifacts", "file != '' || lifecycle_status = 'staged'").length) {
    throw new Error("unsafe_rollback_storefront_app_delivery_c10_7");
  }
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const artifacts = app.findCollectionByNameOrId("storefront_app_artifacts");
  profiles.fields.removeById(PROFILE_DOWNLOAD_NONCE_FIELD);
  artifacts.fields.removeById(ARTIFACT_FILE_FIELD);
  const lifecycle = artifacts.fields.getByName("lifecycle_status");
  lifecycle.values = (lifecycle.values || []).filter((value) => value !== "staged");
  app.save(profiles);
  app.save(artifacts);
});
