/// <reference path="../pb_data/types.d.ts" />

const PROFILE_ICON_ASSET_FIELD = "rel17868456001";
const PROFILE_SPLASH_ASSET_FIELD = "rel17868456002";

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

function selectField(id, name, values, required) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function numberField(id, name, max) {
  return {
    hidden: false, id, max, min: 1, name, onlyInt: true, presentable: false,
    required: true, system: false, type: "number",
  };
}

function fileField(id, name) {
  return {
    hidden: true, id, maxSelect: 1, maxSize: 8 * 1024 * 1024, mimeTypes: ["image/png"],
    name, presentable: false, protected: true, required: true, system: false,
    thumbs: [], type: "file",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

function rows(app, collection, filter) {
  return app.findRecordsByFilter(collection, filter || "", "", 1, 0) || [];
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  const assets = new Collection({
    id: "pbc_1786845601",
    name: "storefront_app_brand_assets",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text17868456101"),
      relationField("rel17868456102", "store", stores.id, true, false),
      selectField("sel17868456103", "kind", ["icon", "splash"], true),
      fileField("file17868456104", "file"),
      textField("text17868456105", "sha256", 64, true, false, "^[a-f0-9]{64}$"),
      numberField("num17868456106", "width", 4096),
      numberField("num17868456107", "height", 4096),
      numberField("num17868456108", "bytes", 8 * 1024 * 1024),
      selectField("sel17868456109", "source_format", ["jpeg", "png", "webp"], true),
      numberField("num17868456110", "source_width", 8000),
      numberField("num17868456111", "source_height", 8000),
      textField("text17868456112", "normalizer_version", 80, true, false, "^[a-z0-9._-]{8,80}$"),
      selectField("sel17868456113", "status", ["active", "retired"], true),
      relationField("rel17868456114", "created_by", users.id, true, true),
      autoDateField("auto17868456115", "created", false),
      autoDateField("auto17868456116", "updated", true),
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_storefront_app_brand_assets_active` ON `storefront_app_brand_assets` (`store`, `kind`) WHERE `status` = 'active'",
      "CREATE INDEX `idx_storefront_app_brand_assets_history` ON `storefront_app_brand_assets` (`store`, `kind`, `created`)",
      "CREATE INDEX `idx_storefront_app_brand_assets_sha` ON `storefront_app_brand_assets` (`sha256`)",
    ],
  });
  app.save(assets);
  profiles.fields.add(new Field(relationField(PROFILE_ICON_ASSET_FIELD, "icon_asset", assets.id, false, false)));
  profiles.fields.add(new Field(relationField(PROFILE_SPLASH_ASSET_FIELD, "splash_asset", assets.id, false, false)));
  app.save(profiles);
}, (app) => {
  const profiles = app.findCollectionByNameOrId("storefront_app_build_profiles");
  if (rows(app, "storefront_app_brand_assets", "").length
    || rows(app, "storefront_app_build_profiles", "icon_asset != '' || splash_asset != ''").length) {
    throw new Error("unsafe_rollback_storefront_app_brand_assets");
  }
  profiles.fields.removeById(PROFILE_ICON_ASSET_FIELD);
  profiles.fields.removeById(PROFILE_SPLASH_ASSET_FIELD);
  app.save(profiles);
  app.delete(app.findCollectionByNameOrId("storefront_app_brand_assets"));
});
