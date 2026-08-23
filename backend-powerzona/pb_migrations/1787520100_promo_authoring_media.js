/// <reference path="../pb_data/types.d.ts" />

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, min, max, required, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: required === true, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required, cascadeDelete) {
  return {
    cascadeDelete: cascadeDelete === true, collectionId, hidden: false, id,
    maxSelect: 1, minSelect: required ? 1 : 0, name, presentable: false,
    required: required === true, system: false, type: "relation",
  };
}

function selectField(id, name, values, required) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: required === true, system: false, type: "select", values,
  };
}

function numberField(id, name, required, min, max) {
  return {
    hidden: false, id, max: max === undefined ? null : max,
    min: min === undefined ? null : min, name, onlyInt: true,
    presentable: false, required: required === true, system: false, type: "number",
  };
}

function jsonField(id, name, maxSize, required, hidden) {
  return {
    hidden: hidden === true, id, maxSize, name, presentable: false,
    required: required === true, system: false, type: "json",
  };
}

function dateField(id, name, required) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: required === true, system: false, type: "date",
  };
}

function fileField(id, name) {
  return {
    hidden: false, id, maxSelect: 1, maxSize: 25 * 1024 * 1024,
    mimeTypes: ["image/webp", "video/mp4", "video/webm"], name,
    presentable: false, protected: true, required: true, system: false,
    thumbs: [], type: "file",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: onUpdate === true,
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

function assertEmptyForRollback(app, names) {
  for (const name of names) {
    const rows = app.findRecordsByFilter(name, "", "", 1, 0);
    if (rows && rows.length) throw new Error("unsafe_rollback_promo_data");
  }
}

migrate((app) => {
  const sites = app.findCollectionByNameOrId("promo_sites");
  const users = app.findCollectionByNameOrId("users");

  const drafts = privateCollection(
    "pbc_1787520101",
    "promo_draft_documents",
    [
      idField("text17875210101"),
      relationField("relation75210102", "site", sites.id, true, true),
      numberField("number1787521103", "schema_version", true, 1, 1),
      jsonField("json17875210104", "document_json", 1024 * 1024, true, true),
      numberField("number1787521105", "version", true, 1, null),
      textField("text17875210106", "document_sha256", 64, 64, true, true, "^[a-f0-9]{64}$"),
      relationField("relation75210107", "created_by", users.id, true, false),
      relationField("relation75210108", "updated_by", users.id, true, false),
      autoDateField("autodate75210109", "created", false),
      autoDateField("autodate75210110", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_draft_site` ON `promo_draft_documents` (`site`)",
      "CREATE INDEX `ix_promo_draft_updated` ON `promo_draft_documents` (`site`, `updated`)",
    ],
  );
  app.save(drafts);

  const media = privateCollection(
    "pbc_1787520102",
    "promo_media_assets",
    [
      idField("text17875210201"),
      relationField("relation75210202", "site", sites.id, true, true),
      selectField("select1787521203", "kind", ["image", "video"], true),
      selectField("select1787521204", "purpose", ["hero", "service", "gallery", "owner", "footer", "social", "video_poster"], true),
      selectField("select1787521205", "status", ["uploaded", "processing", "ready", "rejected", "retired", "quarantined"], true),
      fileField("file17875210206", "file"),
      selectField("select1787521207", "mime_detected", ["image/webp", "video/mp4", "video/webm"], false),
      textField("text17875210208", "sha256", 0, 64, false, true, "^(?:[a-f0-9]{64})?$"),
      numberField("number1787521209", "bytes", false, 1, 25 * 1024 * 1024),
      numberField("number1787521210", "width", false, 1, 16384),
      numberField("number1787521211", "height", false, 1, 16384),
      numberField("number1787521212", "duration_ms", false, 0, 30 * 60 * 1000),
      relationField("relation75210214", "created_by", users.id, true, false),
      dateField("date17875210215", "ready_at", false),
      dateField("date17875210216", "retired_at", false),
      autoDateField("autodate75210217", "created", false),
      autoDateField("autodate75210218", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_media_site_sha` ON `promo_media_assets` (`site`, `sha256`) WHERE `sha256` != ''",
      "CREATE INDEX `ix_promo_media_site_state` ON `promo_media_assets` (`site`, `status`, `kind`, `created`)",
      "CREATE INDEX `ix_promo_media_site_purpose` ON `promo_media_assets` (`site`, `purpose`, `status`)",
    ],
  );
  app.save(media);

  // PocketBase 0.39 validates relation targets before the collection insert.
  // Add the self relation only after the target collection exists.
  media.fields.add(new Field(
    relationField("relation75210213", "poster_asset", media.id, false, false),
  ));
  media.indexes = [
    ...media.indexes,
    "CREATE INDEX `ix_promo_media_poster` ON `promo_media_assets` (`poster_asset`)",
  ];
  return app.save(media);
}, (app) => {
  const names = ["promo_media_assets", "promo_draft_documents"];
  assertEmptyForRollback(app, names);
  for (const name of names) app.delete(app.findCollectionByNameOrId(name));
});
