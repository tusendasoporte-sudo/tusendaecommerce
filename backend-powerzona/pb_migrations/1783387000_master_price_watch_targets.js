/// <reference path="../pb_data/types.d.ts" />

const WATCH_FIELD_IDS = [
  "bool1783387001",
  "number1783387002",
  "date1783387003",
  "relation1783387004",
];
const EVENT_FIELD_IDS = [
  "bool1783387011",
  "number1783387012",
  "bool1783387013",
  "number1783387014",
  "select1783387015",
];
const NOTIFICATION_FIELD_IDS = ["select1783387021"];
const TARGET_INDEX = "idx_master_product_watches_store_status_target";

function addFieldIfMissing(collection, field) {
  try {
    if (collection.fields.getByName(field.name)) return;
  } catch (_) {}
  collection.fields.add(new Field(field));
}

function addIndexIfMissing(collection, name, sql) {
  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  if (indexes.some((index) => String(index).includes(name))) return;
  collection.indexes = indexes.concat(sql);
}

function removeIndex(collection, name) {
  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((index) => !String(index).includes(name));
}

function removeFields(collection, ids) {
  ids.forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });
}

function boolField(id, name) {
  return {
    default: false, hidden: false, id, name, presentable: false,
    required: false, system: false, type: "bool",
  };
}

function numberField(id, name) {
  return {
    default: 0, hidden: false, id, max: 999999999.99, min: 0, name,
    onlyInt: false, presentable: false, required: false, system: false, type: "number",
  };
}

function dateField(id, name) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: false, system: false, type: "date",
  };
}

function relationField(id, name, collectionId) {
  return {
    cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1,
    minSelect: 0, name, presentable: false, required: false,
    system: false, type: "relation",
  };
}

function toneField(id, name) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: false, system: false, type: "select", values: ["normal", "critical"],
  };
}

migrate((app) => {
  const watches = app.findCollectionByNameOrId("master_product_watches");
  const events = app.findCollectionByNameOrId("master_product_price_events");
  const notifications = app.findCollectionByNameOrId("master_notifications");
  const users = app.findCollectionByNameOrId("users");

  addFieldIfMissing(watches, boolField(WATCH_FIELD_IDS[0], "target_alert_enabled"));
  addFieldIfMissing(watches, numberField(WATCH_FIELD_IDS[1], "target_price_usd"));
  addFieldIfMissing(watches, dateField(WATCH_FIELD_IDS[2], "target_updated_at"));
  addFieldIfMissing(watches, relationField(WATCH_FIELD_IDS[3], "target_updated_by", users.id));
  addIndexIfMissing(
    watches,
    TARGET_INDEX,
    "CREATE INDEX `idx_master_product_watches_store_status_target` ON `master_product_watches` (`store`, `status`, `target_alert_enabled`)"
  );
  app.save(watches);

  addFieldIfMissing(events, boolField(EVENT_FIELD_IDS[0], "target_alert_enabled_snapshot"));
  addFieldIfMissing(events, numberField(EVENT_FIELD_IDS[1], "target_price_usd_snapshot"));
  addFieldIfMissing(events, boolField(EVENT_FIELD_IDS[2], "target_met_snapshot"));
  addFieldIfMissing(events, numberField(EVENT_FIELD_IDS[3], "effective_price_after_usd"));
  addFieldIfMissing(events, toneField(EVENT_FIELD_IDS[4], "notification_tone"));
  app.save(events);

  addFieldIfMissing(notifications, toneField(NOTIFICATION_FIELD_IDS[0], "tone"));
  app.save(notifications);

  app.db().newQuery(`
    UPDATE master_product_watches
    SET target_alert_enabled = 0,
        target_price_usd = COALESCE(target_price_usd, 0)
  `).execute();
  app.db().newQuery(`
    UPDATE master_product_price_events
    SET target_alert_enabled_snapshot = 0,
        target_price_usd_snapshot = 0,
        target_met_snapshot = 0,
        effective_price_after_usd = 0,
        notification_tone = 'normal'
  `).execute();
  app.db().newQuery(`UPDATE master_notifications SET tone = 'normal'`).execute();

  events.fields.getByName("notification_tone").required = true;
  notifications.fields.getByName("tone").required = true;
  app.save(events);
  return app.save(notifications);
}, (app) => {
  const notifications = app.findCollectionByNameOrId("master_notifications");
  removeFields(notifications, NOTIFICATION_FIELD_IDS);
  app.save(notifications);

  const events = app.findCollectionByNameOrId("master_product_price_events");
  removeFields(events, EVENT_FIELD_IDS);
  app.save(events);

  const watches = app.findCollectionByNameOrId("master_product_watches");
  removeIndex(watches, TARGET_INDEX);
  removeFields(watches, WATCH_FIELD_IDS);
  return app.save(watches);
});
