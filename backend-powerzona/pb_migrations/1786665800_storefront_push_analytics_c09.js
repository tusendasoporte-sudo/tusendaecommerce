/// <reference path="../pb_data/types.d.ts" />

const C09_RETENTION_DAYS = 90;
const PREVIOUS_RAW_RETENTION_DAYS = 180;

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

function numberField(id, name) {
  return {
    hidden: false, id, max: null, min: 0, name, onlyInt: true,
    presentable: false, required: false, system: false, type: "number",
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

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function addField(collection, definition) {
  if (!fieldByName(collection, definition.name)) collection.fields.add(new Field(definition));
}

function removeField(collection, name) {
  const field = fieldByName(collection, name);
  if (field) collection.fields.removeById(field.id);
}

function addIndex(collection, name, unique, columns, where) {
  try { if (collection.getIndex(name)) return; } catch (_) {}
  collection.addIndex(name, unique, columns, where || "");
}

function removeIndex(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

function forEachRecord(app, collection, callback) {
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const records = app.findRecordsByFilter(collection, "", "id", pageSize, offset, {}) || [];
    records.forEach(callback);
    if (records.length < pageSize) break;
  }
}

function recordValue(record, key) {
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record && record[key];
}

function parsedDate(value) {
  const date = new Date(String(value || "").trim());
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : parsedDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function technicalRetentionBase(record) {
  return parsedDate(recordValue(record, "accepted_at"))
    || parsedDate(recordValue(record, "received_at"))
    || parsedDate(recordValue(record, "created"))
    || new Date();
}

function configureAnalyticsRetention(app, maximum) {
  const settings = app.findCollectionByNameOrId("settings");
  const field = fieldByName(settings, "analytics_retention_days");
  if (field && field.type === "number") {
    field.max = maximum;
    field.default = maximum;
    app.save(settings);
  }
  forEachRecord(app, "settings", (record) => {
    const current = Math.floor(Number(recordValue(record, "analytics_retention_days")) || 0);
    const next = maximum === 90 ? 90 : Math.max(1, Math.min(30, current || 30));
    if (current === next) return;
    record.set("analytics_retention_days", next);
    app.save(record);
  });
}

migrate((app) => {
  const campaigns = app.findCollectionByNameOrId("push_campaigns");
  const deliveries = app.findCollectionByNameOrId("push_campaign_deliveries");
  const events = app.findCollectionByNameOrId("push_events");
  const orderLinks = app.findCollectionByNameOrId("storefront_order_links");
  const orders = app.findCollectionByNameOrId("orders");
  const coupons = app.findCollectionByNameOrId("manual_coupons");
  const stores = app.findCollectionByNameOrId("stores");

  addField(campaigns, dateField("date17866658001", "redacted_at", false, false));
  addIndex(campaigns, "idx_push_campaigns_redacted_retention", false, "redacted_at, delete_after", "");
  app.save(campaigns);

  addField(orderLinks, textField("text17866658002", "campaign_id_snapshot", 15, false, true, "^[a-z0-9]{15}$"));
  addField(orderLinks, textField("text17866658003", "delivery_id_snapshot", 15, false, true, "^[a-z0-9]{15}$"));
  addField(orderLinks, textField("text17866658004", "coupon_id_snapshot", 15, false, true, "^[a-z0-9]{15}$"));
  addField(orderLinks, selectField("select17866658005", "attribution_source", ["none", "coupon", "destination_viewed"], false, false));
  addField(orderLinks, dateField("date17866658006", "touch_at", false, false));
  addField(orderLinks, dateField("date17866658007", "attributed_at", false, false));
  addIndex(
    orderLinks,
    "idx_storefront_order_links_order_unique",
    true,
    "`order`",
    "attribution_source IN ('coupon','destination_viewed')",
  );
  addIndex(orderLinks, "idx_storefront_order_links_campaign_snapshot", false, "store, campaign_id_snapshot, created", "");
  app.save(orderLinks);

  addField(events, relationField("relation17866658008", "order", orders.id, false, true));
  addField(events, relationField("relation17866658009", "coupon", coupons.id, false, true));
  addIndex(events, "idx_push_events_delivery_tap_unique", true, "delivery, event_type", "event_type IN ('opened','destination_viewed')");
  addIndex(events, "idx_push_events_coupon_unique", true, "campaign, installation, coupon, event_type", "event_type = 'coupon_applied'");
  addIndex(events, "idx_push_events_order_unique", true, "`order`, event_type", "event_type = 'order_attributed'");
  addIndex(events, "idx_push_events_installation_type_received", false, "store, installation, event_type, received_at", "");
  app.save(events);

  const daily = privateCollection(
    "pbc_1786665800",
    "push_daily_stats",
    [
      idField("text17866658101"),
      relationField("relation17866658102", "store", stores.id, true, false),
      relationField("relation17866658103", "campaign", campaigns.id, false, false),
      selectField("select17866658104", "scope", ["store_installations", "campaign_funnel"], true, false),
      textField("text17866658105", "scope_key", 32, true, false, "^(?:store|[a-z0-9]{15})$"),
      textField("text17866658106", "day_key", 10, true, false, "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"),
      numberField("number17866658107", "installations_vigentes"),
      numberField("number17866658108", "installations_new"),
      numberField("number17866658109", "installations_disabled"),
      numberField("number17866658110", "installations_invalid"),
      numberField("number17866658111", "permission_granted"),
      numberField("number17866658112", "permission_denied"),
      numberField("number17866658113", "permission_unknown"),
      numberField("number17866658114", "selected"),
      numberField("number17866658115", "accepted"),
      numberField("number17866658116", "failed_permanent"),
      numberField("number17866658117", "invalid_fid"),
      numberField("number17866658118", "unknown"),
      numberField("number17866658119", "canceled"),
      numberField("number17866658120", "retrying"),
      numberField("number17866658121", "opened"),
      numberField("number17866658122", "destination_viewed"),
      numberField("number17866658123", "coupon_applied"),
      numberField("number17866658124", "orders_attributed"),
      numberField("number17866658125", "buyer_installations"),
      numberField("number17866658126", "orders_vigentes"),
      numberField("number17866658127", "orders_canceled"),
      dateField("date17866658128", "delete_after", true, false),
      autoDateField("autodate17866658129", "created", false),
      autoDateField("autodate17866658130", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_push_daily_stats_scope_day` ON `push_daily_stats` (`store`, `scope`, `scope_key`, `day_key`)",
      "CREATE INDEX `idx_push_daily_stats_store_day` ON `push_daily_stats` (`store`, `day_key`)",
      "CREATE INDEX `idx_push_daily_stats_campaign_day` ON `push_daily_stats` (`campaign`, `day_key`)",
      "CREATE INDEX `idx_push_daily_stats_retention` ON `push_daily_stats` (`delete_after`)",
    ],
  );
  app.save(daily);

  forEachRecord(app, "push_campaign_deliveries", (record) => {
    record.set("delete_after", addDays(technicalRetentionBase(record), C09_RETENTION_DAYS));
    app.save(record);
  });
  forEachRecord(app, "push_events", (record) => {
    record.set("delete_after", addDays(technicalRetentionBase(record), C09_RETENTION_DAYS));
    app.save(record);
  });
  configureAnalyticsRetention(app, 90);
}, (app) => {
  const rows = app.findRecordsByFilter("push_daily_stats", "", "", 1, 0, {}) || [];
  const redacted = app.findRecordsByFilter(
    "push_campaigns", 'redacted_at != ""', "", 1, 0, {},
  ) || [];
  const attributedLinks = app.findRecordsByFilter(
    "storefront_order_links", 'campaign_id_snapshot != "" || attributed_at != ""', "", 1, 0, {},
  ) || [];
  const attributedEvents = app.findRecordsByFilter(
    "push_events", 'event_type = "coupon_applied" || event_type = "order_attributed"', "", 1, 0, {},
  ) || [];
  if (rows.length || redacted.length || attributedLinks.length || attributedEvents.length) {
    throw new Error("unsafe_rollback_storefront_push_analytics_data");
  }
  app.delete(app.findCollectionByNameOrId("push_daily_stats"));

  const events = app.findCollectionByNameOrId("push_events");
  [
    "idx_push_events_delivery_tap_unique",
    "idx_push_events_coupon_unique",
    "idx_push_events_order_unique",
    "idx_push_events_installation_type_received",
  ].forEach((name) => removeIndex(events, name));
  removeField(events, "coupon");
  removeField(events, "order");
  app.save(events);

  const orderLinks = app.findCollectionByNameOrId("storefront_order_links");
  removeIndex(orderLinks, "idx_storefront_order_links_order_unique");
  removeIndex(orderLinks, "idx_storefront_order_links_campaign_snapshot");
  [
    "attributed_at", "touch_at", "attribution_source", "coupon_id_snapshot",
    "delivery_id_snapshot", "campaign_id_snapshot",
  ].forEach((name) => removeField(orderLinks, name));
  app.save(orderLinks);

  const campaigns = app.findCollectionByNameOrId("push_campaigns");
  removeIndex(campaigns, "idx_push_campaigns_redacted_retention");
  removeField(campaigns, "redacted_at");
  app.save(campaigns);
  forEachRecord(app, "push_campaign_deliveries", (record) => {
    record.set("delete_after", addDays(technicalRetentionBase(record), PREVIOUS_RAW_RETENTION_DAYS));
    app.save(record);
  });
  forEachRecord(app, "push_events", (record) => {
    record.set("delete_after", addDays(technicalRetentionBase(record), PREVIOUS_RAW_RETENTION_DAYS));
    app.save(record);
  });
  configureAnalyticsRetention(app, 30);
});
