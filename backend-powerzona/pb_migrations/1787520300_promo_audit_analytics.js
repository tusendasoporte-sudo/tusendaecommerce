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
  const revisions = app.findCollectionByNameOrId("promo_revisions");

  const audit = privateCollection(
    "pbc_1787520301",
    "promo_audit_events",
    [
      idField("text17875230101"),
      textField("text17875230102", "scope_key", 1, 80, true, false, "^(?:global|site:[a-z0-9]{15})$"),
      relationField("relation75230103", "site", sites.id, false, true),
      relationField("relation75230104", "actor", users.id, false, false),
      jsonField("json17875230105", "actor_snapshot_json", 4 * 1024, true, true),
      selectField("select1787523106", "origin", ["store_admin", "master_admin", "system", "migration"], true),
      selectField("select1787523107", "module", ["content", "media", "publication", "domain", "theme", "localization", "contact", "entitlement", "security", "support"], true),
      textField("text17875230108", "action", 1, 100, true, false, "^[a-z][a-z0-9_.:-]{0,99}$"),
      selectField("select1787523109", "severity", ["normal", "important", "critical"], true),
      textField("text17875230110", "resource_type", 1, 80, true, false, "^[a-z][a-z0-9_.:-]{0,79}$"),
      textField("text17875230111", "resource_id_snapshot", 0, 80, false, true, "^[A-Za-z0-9._:-]*$"),
      jsonField("json17875230112", "changed_paths_json", 16 * 1024, false, true),
      jsonField("json17875230113", "previous_values_json", 64 * 1024, false, true),
      jsonField("json17875230114", "new_values_json", 64 * 1024, false, true),
      textField("text17875230115", "summary", 1, 500, true, false, ""),
      textField("text17875230116", "source_event_key", 1, 255, true, true, "^[A-Za-z0-9._:-]+$"),
      textField("text17875230117", "correlation_id", 0, 80, false, true, "^[A-Za-z0-9._:-]*$"),
      autoDateField("autodate75230118", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_audit_source` ON `promo_audit_events` (`scope_key`, `source_event_key`)",
      "CREATE INDEX `ix_promo_audit_site_created` ON `promo_audit_events` (`site`, `created`)",
      "CREATE INDEX `ix_promo_audit_module_created` ON `promo_audit_events` (`scope_key`, `module`, `created`)",
      "CREATE INDEX `ix_promo_audit_resource_created` ON `promo_audit_events` (`scope_key`, `resource_type`, `resource_id_snapshot`, `created`)",
    ],
  );
  app.save(audit);

  const analytics = privateCollection(
    "pbc_1787520302",
    "promo_analytics_events",
    [
      idField("text17875230201"),
      relationField("relation75230202", "site", sites.id, true, true),
      relationField("relation75230203", "revision", revisions.id, true, false),
      selectField("select1787523204", "event_type", ["page_view", "section_view", "contact_activate"], true),
      textField("text17875230205", "day", 10, 10, true, false, "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
      textField("text17875230206", "locale", 2, 35, true, false, "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$"),
      textField("text17875230207", "theme_key", 1, 140, true, false, "^[a-z0-9._-]+@[0-9A-Za-z.-]+$"),
      textField("text17875230208", "section_key", 0, 64, false, false, "^(?:[a-z][a-z0-9_-]{0,63})?$"),
      selectField("select1787523209", "action_type", ["whatsapp", "phone", "email", "internal_form", "approved_live_chat"], false),
      selectField("select1787523210", "device_class", ["mobile", "tablet", "desktop", "unknown"], false),
      textField("text17875230211", "dedupe_key", 0, 128, false, true, "^[A-Za-z0-9._:-]*$"),
      dateField("date17875230212", "occurred_at", true),
      dateField("date17875230213", "expires_at", true),
      autoDateField("autodate75230214", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_analytics_dedupe` ON `promo_analytics_events` (`site`, `dedupe_key`) WHERE `dedupe_key` != ''",
      "CREATE INDEX `ix_promo_analytics_site_time` ON `promo_analytics_events` (`site`, `occurred_at`)",
      "CREATE INDEX `ix_promo_analytics_type_time` ON `promo_analytics_events` (`site`, `event_type`, `occurred_at`)",
      "CREATE INDEX `ix_promo_analytics_expiry` ON `promo_analytics_events` (`expires_at`)",
    ],
  );
  app.save(analytics);

  const daily = privateCollection(
    "pbc_1787520303",
    "promo_analytics_daily",
    [
      idField("text17875230301"),
      relationField("relation75230302", "site", sites.id, true, true),
      textField("text17875230303", "day", 10, 10, true, false, "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
      selectField("select1787523304", "event_type", ["page_view", "section_view", "contact_activate"], true),
      textField("text17875230305", "locale", 2, 35, true, false, "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$"),
      textField("text17875230306", "theme_key", 1, 140, true, false, "^[a-z0-9._-]+@[0-9A-Za-z.-]+$"),
      textField("text17875230307", "dimension_key", 0, 80, false, false, "^[a-z0-9_-]*$"),
      numberField("number1787523308", "event_count", true, 0, null),
      numberField("number1787523309", "unique_count", true, 0, null),
      autoDateField("autodate75230310", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_analytics_daily_bucket` ON `promo_analytics_daily` (`site`, `day`, `event_type`, `locale`, `theme_key`, `dimension_key`)",
      "CREATE INDEX `ix_promo_analytics_daily_site_day` ON `promo_analytics_daily` (`site`, `day`)",
    ],
  );
  return app.save(daily);
}, (app) => {
  const names = ["promo_analytics_daily", "promo_analytics_events", "promo_audit_events"];
  assertEmptyForRollback(app, names);
  for (const name of names) app.delete(app.findCollectionByNameOrId(name));
});
