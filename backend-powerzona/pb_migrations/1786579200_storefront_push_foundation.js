/// <reference path="../pb_data/types.d.ts" />

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

function dateField(id, name, required, hidden) {
  return {
    hidden: hidden === true, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
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

function fileField(id, name) {
  return {
    hidden: false, id, maxSelect: 1, maxSize: 768000, mimeTypes: ["image/webp"],
    name, presentable: false, protected: false, required: true, system: false,
    thumbs: [], type: "file",
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

function assertEmptyForRollback(app, names) {
  for (const name of names) {
    const records = app.findRecordsByFilter(name, "", "", 1, 0);
    if (records && records.length) throw new Error("unsafe_rollback_storefront_push_data");
  }
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const products = app.findCollectionByNameOrId("products");
  const categories = app.findCollectionByNameOrId("categories");
  const orders = app.findCollectionByNameOrId("orders");
  const raffles = app.findCollectionByNameOrId("raffles");
  const coupons = app.findCollectionByNameOrId("manual_coupons");

  const appConfigs = privateCollection(
    "pbc_1786579201",
    "storefront_app_configs",
    [
      idField("text17865792001"),
      relationField("relation17865792002", "store", stores.id, true, false),
      textField("text17865792003", "app_key", 64, true, false, "^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$"),
      textField("text17865792004", "display_name", 120, true, false),
      textField("text17865792005", "package_name", 190, true, false, "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"),
      textField("text17865792006", "firebase_app_id", 255, true, true),
      textField("text17865792007", "public_origin", 255, true, false, "^https://[^\\s/]+(?::[0-9]{1,5})?$"),
      textField("text17865792008", "store_path_prefix", 180, true, false, "^/t/[a-z0-9][a-z0-9-]*$") ,
      selectField("select17865792009", "status", ["draft", "active", "suspended", "retired"], true, false),
      numberField("number17865792010", "min_supported_version_code", false, 1, null),
      textField("text17865792011", "min_supported_version_name", 40, false, false),
      autoDateField("autodate17865792012", "created", false),
      autoDateField("autodate17865792013", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_storefront_app_configs_app_key` ON `storefront_app_configs` (`app_key`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_configs_package` ON `storefront_app_configs` (`package_name`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_configs_firebase` ON `storefront_app_configs` (`firebase_app_id`)",
      "CREATE UNIQUE INDEX `idx_storefront_app_configs_store_app` ON `storefront_app_configs` (`store`, `app_key`)",
    ],
  );
  app.save(appConfigs);

  const installations = privateCollection(
    "pbc_1786579202",
    "storefront_installations",
    [
      idField("text17865792101"),
      relationField("relation17865792102", "store", stores.id, true, false),
      relationField("relation17865792103", "app_config", appConfigs.id, true, false),
      textField("text17865792104", "fid", 1024, true, true),
      textField("text17865792105", "fid_digest", 64, true, true, "^[a-f0-9]{64}$"),
      textField("text17865792106", "credential_digest", 64, true, true, "^[a-f0-9]{64}$"),
      selectField("select17865792107", "status", ["active", "disabled", "invalid", "revoked"], true, false),
      selectField("select17865792108", "notification_permission", ["unknown", "granted", "denied"], true, false),
      textField("text17865792109", "app_version", 40, false, false),
      numberField("number17865792110", "app_version_code", false, 1, null),
      textField("text17865792111", "android_version", 40, false, false),
      textField("text17865792112", "device_model", 120, false, false),
      textField("text17865792113", "locale", 35, false, false),
      textField("text17865792114", "timezone", 80, false, false),
      dateField("date17865792115", "first_seen_at", true, false),
      dateField("date17865792116", "last_seen_at", true, false),
      dateField("date17865792117", "disabled_at", false, false),
      textField("text17865792118", "last_ip_encrypted", 4096, false, true),
      dateField("date17865792119", "ip_delete_after", false, true),
      textField("text17865792120", "country_code", 2, false, false, "^[A-Z]{2}$"),
      textField("text17865792121", "region_code", 80, false, false),
      autoDateField("autodate17865792122", "created", false),
      autoDateField("autodate17865792123", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_storefront_installations_app_fid` ON `storefront_installations` (`app_config`, `fid_digest`)",
      "CREATE UNIQUE INDEX `idx_storefront_installations_credential` ON `storefront_installations` (`credential_digest`)",
      "CREATE INDEX `idx_storefront_installations_store_status_seen` ON `storefront_installations` (`store`, `status`, `last_seen_at`)",
      "CREATE INDEX `idx_storefront_installations_store_permission` ON `storefront_installations` (`store`, `notification_permission`)",
      "CREATE INDEX `idx_storefront_installations_ip_retention` ON `storefront_installations` (`ip_delete_after`)",
    ],
  );
  app.save(installations);

  const webSessions = privateCollection(
    "pbc_1786579203",
    "storefront_web_sessions",
    [
      idField("text17865792201"),
      relationField("relation17865792202", "store", stores.id, true, false),
      relationField("relation17865792203", "installation", installations.id, true, false),
      textField("text17865792204", "session_digest", 64, true, true, "^[a-f0-9]{64}$"),
      selectField("select17865792205", "status", ["pending", "active", "consumed", "expired", "revoked"], true, false),
      dateField("date17865792206", "expires_at", true, false),
      dateField("date17865792207", "last_seen_at", false, false),
      dateField("date17865792208", "consumed_at", false, false),
      dateField("date17865792209", "delete_after", true, false),
      autoDateField("autodate17865792210", "created", false),
      autoDateField("autodate17865792211", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_storefront_web_sessions_digest` ON `storefront_web_sessions` (`session_digest`)",
      "CREATE INDEX `idx_storefront_web_sessions_scope` ON `storefront_web_sessions` (`store`, `installation`, `status`)",
      "CREATE INDEX `idx_storefront_web_sessions_expires` ON `storefront_web_sessions` (`expires_at`)",
      "CREATE INDEX `idx_storefront_web_sessions_retention` ON `storefront_web_sessions` (`delete_after`)",
    ],
  );
  app.save(webSessions);

  const orderLinks = privateCollection(
    "pbc_1786579204",
    "storefront_order_links",
    [
      idField("text17865792301"),
      relationField("relation17865792302", "store", stores.id, true, false),
      relationField("relation17865792303", "installation", installations.id, true, false),
      relationField("relation17865792304", "order", orders.id, true, false),
      selectField("select17865792305", "status", ["active", "revoked", "expired"], true, false),
      dateField("date17865792306", "attribution_expires_at", false, false),
      autoDateField("autodate17865792307", "created", false),
      autoDateField("autodate17865792308", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_storefront_order_links_installation_order` ON `storefront_order_links` (`installation`, `order`)",
      "CREATE INDEX `idx_storefront_order_links_store_status` ON `storefront_order_links` (`store`, `status`)",
    ],
  );
  app.save(orderLinks);

  const pushMedia = privateCollection(
    "pbc_1786579205",
    "push_media",
    [
      idField("text17865792401"),
      relationField("relation17865792402", "store", stores.id, true, false),
      fileField("file17865792403", "file"),
      textField("text17865792404", "sha256", 64, true, false, "^[a-f0-9]{64}$"),
      numberField("number17865792405", "width", true, 1, 4096),
      numberField("number17865792406", "height", true, 1, 4096),
      numberField("number17865792407", "bytes", true, 1, 768000),
      selectField("select17865792408", "status", ["active", "archived", "pending_delete"], true, false),
      relationField("relation17865792409", "created_by", users.id, false, false),
      dateField("date17865792410", "referenced_at", false, false),
      dateField("date17865792411", "delete_after", false, false),
      autoDateField("autodate17865792412", "created", false),
      autoDateField("autodate17865792413", "updated", true),
    ],
    [
      "CREATE INDEX `idx_push_media_store_status_created` ON `push_media` (`store`, `status`, `created`)",
      "CREATE INDEX `idx_push_media_sha256` ON `push_media` (`sha256`)",
      "CREATE INDEX `idx_push_media_retention` ON `push_media` (`delete_after`)",
    ],
  );
  app.save(pushMedia);

  const campaigns = privateCollection(
    "pbc_1786579206",
    "push_campaigns",
    [
      idField("text17865792501"),
      relationField("relation17865792502", "store", stores.id, true, false),
      relationField("relation17865792503", "created_by", users.id, false, false),
      selectField("select17865792504", "status", ["draft", "scheduled", "processing", "sent", "partially_sent", "failed", "canceled", "paused_plan"], true, false),
      textField("text17865792505", "title", 120, true, false),
      textField("text17865792506", "body", 1000, true, false),
      relationField("relation17865792507", "media", pushMedia.id, false, false),
      selectField("select17865792508", "audience_type", ["all_active", "active_7d", "active_30d", "app_version", "notification_permission", "country_region"], true, false),
      jsonField("json17865792509", "audience_config", 8192, true),
      selectField("select17865792510", "target_type", ["home", "product", "category", "section", "order", "raffle", "coupon"], true, false),
      selectField("select17865792511", "target_section", ["search", "links", "gifts", "raffles", "checkout"], false, false),
      relationField("relation17865792512", "target_product", products.id, false, false),
      relationField("relation17865792513", "target_category", categories.id, false, false),
      relationField("relation17865792514", "target_order", orders.id, false, false),
      relationField("relation17865792515", "target_raffle", raffles.id, false, false),
      relationField("relation17865792516", "target_coupon", coupons.id, false, false),
      textField("text17865792517", "target_path", 500, false, false),
      dateField("date17865792518", "scheduled_at", false, false),
      textField("text17865792519", "timezone", 80, true, false),
      numberField("number17865792520", "selected_count", false, 0, null),
      numberField("number17865792521", "accepted_count", false, 0, null),
      numberField("number17865792522", "failed_count", false, 0, null),
      numberField("number17865792523", "invalid_count", false, 0, null),
      textField("text17865792524", "lock_token", 128, false, true),
      dateField("date17865792525", "lock_expires_at", false, true),
      dateField("date17865792526", "started_at", false, false),
      dateField("date17865792527", "completed_at", false, false),
      dateField("date17865792528", "canceled_at", false, false),
      textField("text17865792529", "failure_code", 80, false, false),
      dateField("date17865792530", "delete_after", false, false),
      autoDateField("autodate17865792531", "created", false),
      autoDateField("autodate17865792532", "updated", true),
    ],
    [
      "CREATE INDEX `idx_push_campaigns_store_status_schedule` ON `push_campaigns` (`store`, `status`, `scheduled_at`)",
      "CREATE INDEX `idx_push_campaigns_store_created` ON `push_campaigns` (`store`, `created`)",
      "CREATE INDEX `idx_push_campaigns_lock` ON `push_campaigns` (`lock_expires_at`)",
      "CREATE INDEX `idx_push_campaigns_retention` ON `push_campaigns` (`delete_after`)",
    ],
  );
  app.save(campaigns);

  const deliveries = privateCollection(
    "pbc_1786579207",
    "push_campaign_deliveries",
    [
      idField("text17865792601"),
      relationField("relation17865792602", "store", stores.id, true, false),
      relationField("relation17865792603", "campaign", campaigns.id, true, false),
      relationField("relation17865792604", "installation", installations.id, true, false),
      selectField("select17865792605", "status", ["pending", "claimed", "accepted", "failed_transient", "failed_permanent", "invalid_fid", "unknown", "canceled"], true, false),
      numberField("number17865792606", "attempt_count", false, 0, 20),
      textField("text17865792607", "claim_token", 128, false, true),
      dateField("date17865792608", "lease_expires_at", false, true),
      textField("text17865792609", "firebase_message_id", 255, false, true),
      textField("text17865792610", "error_code", 80, false, false),
      dateField("date17865792611", "last_attempt_at", false, false),
      dateField("date17865792612", "accepted_at", false, false),
      dateField("date17865792613", "failed_at", false, false),
      dateField("date17865792614", "delete_after", true, false),
      autoDateField("autodate17865792615", "created", false),
      autoDateField("autodate17865792616", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_push_deliveries_campaign_installation` ON `push_campaign_deliveries` (`campaign`, `installation`)",
      "CREATE INDEX `idx_push_deliveries_campaign_status` ON `push_campaign_deliveries` (`campaign`, `status`)",
      "CREATE INDEX `idx_push_deliveries_store_status_updated` ON `push_campaign_deliveries` (`store`, `status`, `updated`)",
      "CREATE INDEX `idx_push_deliveries_lease` ON `push_campaign_deliveries` (`lease_expires_at`)",
      "CREATE INDEX `idx_push_deliveries_retention` ON `push_campaign_deliveries` (`delete_after`)",
    ],
  );
  app.save(deliveries);

  const events = privateCollection(
    "pbc_1786579208",
    "push_events",
    [
      idField("text17865792701"),
      relationField("relation17865792702", "store", stores.id, true, false),
      relationField("relation17865792703", "campaign", campaigns.id, true, false),
      relationField("relation17865792704", "delivery", deliveries.id, true, false),
      relationField("relation17865792705", "installation", installations.id, true, false),
      selectField("select17865792706", "event_type", ["opened", "destination_viewed", "coupon_applied", "order_attributed"], true, false),
      textField("text17865792707", "idempotency_key", 128, true, true, "^[A-Za-z0-9._:-]{16,128}$"),
      dateField("date17865792708", "occurred_at", true, false),
      dateField("date17865792709", "received_at", true, false),
      textField("text17865792710", "schema_version", 12, true, false, "^[0-9]+$") ,
      jsonField("json17865792711", "metadata_json", 8192, true),
      dateField("date17865792712", "delete_after", true, false),
      autoDateField("autodate17865792713", "created", false),
      autoDateField("autodate17865792714", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_push_events_installation_idempotency` ON `push_events` (`installation`, `idempotency_key`)",
      "CREATE INDEX `idx_push_events_store_campaign_type_occurred` ON `push_events` (`store`, `campaign`, `event_type`, `occurred_at`)",
      "CREATE INDEX `idx_push_events_received` ON `push_events` (`received_at`)",
      "CREATE INDEX `idx_push_events_retention` ON `push_events` (`delete_after`)",
    ],
  );
  return app.save(events);
}, (app) => {
  const names = [
    "push_events",
    "push_campaign_deliveries",
    "push_campaigns",
    "push_media",
    "storefront_order_links",
    "storefront_web_sessions",
    "storefront_installations",
    "storefront_app_configs",
  ];
  assertEmptyForRollback(app, names);
  for (const name of names) app.delete(app.findCollectionByNameOrId(name));
});
