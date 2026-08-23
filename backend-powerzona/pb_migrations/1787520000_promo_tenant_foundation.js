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

function selectField(id, name, values, required, hidden) {
  return {
    hidden: hidden === true, id, maxSelect: 1, name, presentable: false,
    required: required === true, system: false, type: "select", values,
  };
}

function boolField(id, name) {
  return {
    hidden: false, id, name, presentable: false, required: false,
    system: false, type: "bool",
  };
}

function numberField(id, name, required, min, max) {
  return {
    hidden: false, id, max: max === undefined ? null : max,
    min: min === undefined ? null : min, name, onlyInt: true,
    presentable: false, required: required === true, system: false, type: "number",
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
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");

  const sites = privateCollection(
    "pbc_1787520001",
    "promo_sites",
    [
      idField("text17875200101"),
      relationField("relation75200102", "store", stores.id, true, false, false),
      textField("text17875200103", "public_slug", 1, 80, true, false, "^[a-z0-9]+(?:-[a-z0-9]+)*$"),
      selectField("select1787520104", "status", ["draft", "active", "paused", "suspended", "retired"], true, false),
      numberField("number1787520105", "contract_version", true, 1, 1),
      relationField("relation75200106", "created_by", users.id, true, false, false),
      relationField("relation75200107", "updated_by", users.id, true, false, false),
      autoDateField("autodate75200108", "created", false),
      autoDateField("autodate75200109", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_sites_store` ON `promo_sites` (`store`)",
      "CREATE UNIQUE INDEX `ux_promo_sites_public_slug` ON `promo_sites` (`public_slug`)",
      "CREATE INDEX `ix_promo_sites_status` ON `promo_sites` (`status`, `updated`)",
    ],
  );
  app.save(sites);

  const entitlements = privateCollection(
    "pbc_1787520002",
    "promo_site_entitlements",
    [
      idField("text17875200201"),
      relationField("relation75200202", "site", sites.id, true, false, true),
      selectField("select1787520203", "source", ["unassigned", "contract", "addon", "master_override"], true, false),
      boolField("bool17875200204", "promo_site_enabled"),
      boolField("bool17875200205", "publish_enabled"),
      boolField("bool17875200206", "custom_domain_enabled"),
      boolField("bool17875200207", "theme_customization_enabled"),
      boolField("bool17875200208", "multilanguage_enabled"),
      boolField("bool17875200209", "video_enabled"),
      boolField("bool17875200210", "analytics_enabled"),
      boolField("bool17875200211", "landing_qr_bridge_enabled"),
      numberField("number1787520212", "max_services", false, 0, 50),
      numberField("number1787520213", "max_gallery_assets", false, 0, 24),
      numberField("number1787520214", "max_locales", false, 0, 10),
      numberField("number1787520215", "max_videos", false, 0, 3),
      numberField("number1787520216", "max_storage_bytes", false, 0, 262144000),
      dateField("date17875200217", "valid_from", false),
      dateField("date17875200218", "valid_until", false),
      relationField("relation75200219", "updated_by", users.id, true, false, false),
      autoDateField("autodate75200220", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_entitlements_site` ON `promo_site_entitlements` (`site`)",
      "CREATE INDEX `ix_promo_entitlements_enabled_until` ON `promo_site_entitlements` (`promo_site_enabled`, `valid_until`)",
    ],
  );
  app.save(entitlements);

  const themes = privateCollection(
    "pbc_1787520003",
    "promo_theme_releases",
    [
      idField("text17875200301"),
      textField("text17875200302", "theme_id", 1, 100, true, false, "^[a-z0-9]+(?:[._-][a-z0-9]+)*$"),
      textField("text17875200303", "version", 1, 32, true, false, "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$"),
      selectField("select1787520304", "status", ["draft", "approved", "deprecated", "retired", "blocked"], true, false),
      textField("text17875200305", "renderer_key", 1, 100, true, false, "^[a-z0-9]+(?:[._-][a-z0-9]+)*$"),
      numberField("number1787520306", "contract_version", true, 1, null),
      textField("text17875200307", "manifest_sha256", 64, 64, true, true, "^[a-f0-9]{64}$"),
      textField("text17875200308", "token_schema_sha256", 64, 64, true, true, "^[a-f0-9]{64}$"),
      relationField("relation75200309", "approved_by", users.id, false, false, false),
      dateField("date17875200310", "approved_at", false),
      dateField("date17875200311", "retired_at", false),
      autoDateField("autodate75200312", "created", false),
      autoDateField("autodate75200313", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_theme_release` ON `promo_theme_releases` (`theme_id`, `version`)",
      "CREATE INDEX `ix_promo_theme_status` ON `promo_theme_releases` (`status`, `updated`)",
    ],
  );
  app.save(themes);

  const bindings = privateCollection(
    "pbc_1787520004",
    "promo_domain_bindings",
    [
      idField("text17875200401"),
      relationField("relation75200402", "site", sites.id, true, false, true),
      textField("text17875200403", "hostname_ascii", 1, 253, true, false, "^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$"),
      textField("text17875200404", "hostname_display", 1, 253, true, false, ""),
      selectField("select1787520405", "role", ["primary", "alias"], true, false),
      selectField("select1787520406", "status", ["pending", "verified", "active", "paused", "revoked", "released"], true, false),
      boolField("bool17875200407", "is_current"),
      selectField("select1787520408", "verification_method", ["manual", "dns", "http"], false, false),
      textField("text17875200409", "verification_evidence_sha256", 0, 64, false, true, "^(?:[a-f0-9]{64})?$"),
      textField("text17875200410", "provider_reference", 0, 160, false, true, "^[A-Za-z0-9._:-]*$"),
      numberField("number1787520411", "state_version", true, 1, null),
      relationField("relation75200412", "verified_by", users.id, false, false, false),
      dateField("date17875200413", "verified_at", false),
      dateField("date17875200414", "activated_at", false),
      dateField("date17875200415", "retired_at", false),
      autoDateField("autodate75200416", "created", false),
      autoDateField("autodate75200417", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_domain_current_host` ON `promo_domain_bindings` (`hostname_ascii`) WHERE `is_current` = 1",
      "CREATE UNIQUE INDEX `ux_promo_domain_current_primary` ON `promo_domain_bindings` (`site`) WHERE `is_current` = 1 AND `role` = 'primary'",
      "CREATE INDEX `ix_promo_domain_lookup` ON `promo_domain_bindings` (`hostname_ascii`, `is_current`, `status`)",
      "CREATE INDEX `ix_promo_domain_site_state` ON `promo_domain_bindings` (`site`, `status`, `role`, `updated`)",
    ],
  );
  return app.save(bindings);
}, (app) => {
  const names = [
    "promo_domain_bindings",
    "promo_theme_releases",
    "promo_site_entitlements",
    "promo_sites",
  ];
  assertEmptyForRollback(app, names);
  for (const name of names) app.delete(app.findCollectionByNameOrId(name));
});
