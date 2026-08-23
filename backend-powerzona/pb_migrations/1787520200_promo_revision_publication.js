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

function relationField(id, name, collectionId, required, hidden, cascadeDelete) {
  return {
    cascadeDelete: cascadeDelete === true, collectionId, hidden: hidden === true, id,
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
  const themes = app.findCollectionByNameOrId("promo_theme_releases");
  const bindings = app.findCollectionByNameOrId("promo_domain_bindings");
  const media = app.findCollectionByNameOrId("promo_media_assets");

  const revisions = privateCollection(
    "pbc_1787520201",
    "promo_revisions",
    [
      idField("text17875220101"),
      relationField("relation75220102", "site", sites.id, true, false, true),
      numberField("number1787522103", "sequence", true, 1, null),
      numberField("number1787522104", "schema_version", true, 1, 1),
      jsonField("json17875220105", "snapshot_json", 1024 * 1024, true, true),
      textField("text17875220106", "snapshot_sha256", 64, 64, true, true, "^[a-f0-9]{64}$"),
      relationField("relation75220107", "theme_release", themes.id, true, false, false),
      textField("text17875220108", "default_locale", 2, 35, true, false, "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$"),
      jsonField("json17875220109", "published_locales_json", 4 * 1024, true, false),
      numberField("number1787522110", "source_draft_version", true, 1, null),
      relationField("relation75220111", "created_by", users.id, true, false, false),
      autoDateField("autodate75220112", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_revision_sequence` ON `promo_revisions` (`site`, `sequence`)",
      "CREATE UNIQUE INDEX `ux_promo_revision_digest` ON `promo_revisions` (`site`, `snapshot_sha256`)",
      "CREATE INDEX `ix_promo_revision_created` ON `promo_revisions` (`site`, `created`)",
      "CREATE INDEX `ix_promo_revision_theme` ON `promo_revisions` (`theme_release`, `created`)",
    ],
  );
  app.save(revisions);

  const refs = privateCollection(
    "pbc_1787520202",
    "promo_revision_media_refs",
    [
      idField("text17875220201"),
      relationField("relation75220202", "site", sites.id, true, false, true),
      relationField("relation75220203", "revision", revisions.id, true, false, false),
      relationField("relation75220204", "media_asset", media.id, true, false, false),
      textField("text17875220205", "use_key", 1, 120, true, false, "^[a-z][a-z0-9_-]{0,119}$"),
      autoDateField("autodate75220206", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_revision_media_use` ON `promo_revision_media_refs` (`revision`, `use_key`)",
      "CREATE INDEX `ix_promo_revision_media_asset` ON `promo_revision_media_refs` (`media_asset`, `revision`)",
      "CREATE INDEX `ix_promo_revision_media_site` ON `promo_revision_media_refs` (`site`, `revision`)",
    ],
  );
  app.save(refs);

  const slots = privateCollection(
    "pbc_1787520203",
    "promo_publication_slots",
    [
      idField("text17875220301"),
      relationField("relation75220302", "site", sites.id, true, false, true),
      selectField("select1787522303", "state", ["unpublished", "active", "paused"], true),
      relationField("relation75220304", "published_revision", revisions.id, false, false, false),
      selectField("select1787522305", "canonical_mode", ["platform", "custom"], true),
      relationField("relation75220306", "primary_binding", bindings.id, false, false, false),
      numberField("number1787522307", "generation", false, 0, null),
      relationField("relation75220308", "published_by", users.id, false, false, false),
      dateField("date17875220309", "published_at", false),
      autoDateField("autodate75220310", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_publication_site` ON `promo_publication_slots` (`site`)",
      "CREATE INDEX `ix_promo_publication_state` ON `promo_publication_slots` (`state`, `updated`)",
      "CREATE INDEX `ix_promo_publication_revision` ON `promo_publication_slots` (`published_revision`)",
      "CREATE INDEX `ix_promo_publication_canonical` ON `promo_publication_slots` (`canonical_mode`, `primary_binding`, `state`)",
    ],
  );
  app.save(slots);

  const events = privateCollection(
    "pbc_1787520204",
    "promo_publication_events",
    [
      idField("text17875220401"),
      relationField("relation75220402", "site", sites.id, true, false, true),
      selectField("select1787522403", "operation", ["publish", "rollback", "unpublish", "binding_switch", "pause", "resume"], true),
      selectField("select1787522404", "result", ["succeeded", "rejected", "failed"], true),
      numberField("number1787522405", "generation_before", true, 0, null),
      numberField("number1787522406", "generation_after", true, 0, null),
      relationField("relation75220407", "from_revision", revisions.id, false, false, false),
      relationField("relation75220408", "to_revision", revisions.id, false, false, false),
      relationField("relation75220409", "from_binding", bindings.id, false, false, false),
      relationField("relation75220410", "to_binding", bindings.id, false, false, false),
      selectField("select1787522411", "from_canonical_mode", ["platform", "custom"], false),
      selectField("select1787522412", "to_canonical_mode", ["platform", "custom"], false),
      relationField("relation75220413", "actor", users.id, false, false, false),
      jsonField("json17875220414", "actor_snapshot_json", 4 * 1024, true, true),
      textField("text17875220415", "reason", 1, 500, true, false, ""),
      textField("text17875220416", "idempotency_key", 16, 128, true, true, "^[A-Za-z0-9._:-]{16,128}$"),
      textField("text17875220417", "revision_sha256", 0, 64, false, true, "^(?:[a-f0-9]{64})?$"),
      textField("text17875220418", "error_class", 0, 80, false, true, "^[A-Za-z0-9._:-]*$"),
      autoDateField("autodate75220419", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_publication_idempotency` ON `promo_publication_events` (`site`, `idempotency_key`)",
      "CREATE INDEX `ix_promo_publication_events_created` ON `promo_publication_events` (`site`, `created`)",
      "CREATE INDEX `ix_promo_publication_generation` ON `promo_publication_events` (`site`, `generation_after`)",
      "CREATE INDEX `ix_promo_publication_target` ON `promo_publication_events` (`to_revision`, `created`)",
    ],
  );
  return app.save(events);
}, (app) => {
  const names = [
    "promo_publication_events",
    "promo_publication_slots",
    "promo_revision_media_refs",
    "promo_revisions",
  ];
  assertEmptyForRollback(app, names);
  for (const name of names) app.delete(app.findCollectionByNameOrId(name));
});
