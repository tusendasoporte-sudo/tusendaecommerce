/// <reference path="../pb_data/types.d.ts" />

"use strict";

const DELIVERIES_COLLECTION = "push_campaign_deliveries";
const DELIVERY_TRIGGERS = Object.freeze([
  "fcm",
  "websocket_sync",
  "foreground_poll",
  "resume_sync",
  "workmanager",
  "native_sync_legacy",
]);

function selectField(id, name, values) {
  return {
    hidden: false,
    id,
    maxSelect: 1,
    name,
    presentable: false,
    required: false,
    system: false,
    type: "select",
    values,
  };
}

function dateField(id, name) {
  return {
    hidden: false,
    id,
    max: "",
    min: "",
    name,
    presentable: false,
    required: false,
    system: false,
    type: "date",
  };
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

function recordValue(record, key) {
  try { return record.get(key); } catch (_) { return record && record[key]; }
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
}

function timestamp(value) {
  const parsed = new Date(String(value || "").trim());
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function inferredTrigger(record) {
  const fcmReceivedAt = timestamp(recordString(record, "fcm_received_at"));
  const displayedAt = timestamp(
    recordString(record, "displayed_at") || recordString(record, "native_delivered_at"),
  );
  if (fcmReceivedAt && (!displayedAt || fcmReceivedAt <= displayedAt)) return "fcm";
  if (displayedAt) return "native_sync_legacy";
  return "";
}

function forEachRecord(app, callback) {
  for (let offset = 0; ; offset += 200) {
    const records = app.findRecordsByFilter(DELIVERIES_COLLECTION, "", "id", 200, offset, {}) || [];
    records.forEach(callback);
    if (records.length < 200) break;
  }
}

migrate((app) => {
  const deliveries = app.findCollectionByNameOrId(DELIVERIES_COLLECTION);
  addField(deliveries, selectField(
    "sel17884480001",
    "delivery_trigger",
    DELIVERY_TRIGGERS,
  ));
  addField(deliveries, dateField("dat17884480002", "displayed_at"));
  addIndex(deliveries, "idx_push_deliveries_store_created", false, "store, created", "");
  app.save(deliveries);

  forEachRecord(app, (record) => {
    let changed = false;
    const legacyDisplayedAt = recordString(record, "native_delivered_at");
    if (!recordString(record, "displayed_at") && legacyDisplayedAt) {
      record.set("displayed_at", legacyDisplayedAt);
      changed = true;
    }
    if (!recordString(record, "delivery_trigger")) {
      const trigger = inferredTrigger(record);
      if (trigger) {
        record.set("delivery_trigger", trigger);
        changed = true;
      }
    }
    if (changed) app.save(record);
  });
}, (app) => {
  const rows = app.findRecordsByFilter(
    DELIVERIES_COLLECTION,
    'delivery_trigger != "" || displayed_at != ""',
    "",
    1,
    0,
    {},
  ) || [];
  if (rows.length) throw new Error("unsafe_rollback_storefront_delivery_transport_observability");

  const deliveries = app.findCollectionByNameOrId(DELIVERIES_COLLECTION);
  removeIndex(deliveries, "idx_push_deliveries_store_created");
  removeField(deliveries, "delivery_trigger");
  removeField(deliveries, "displayed_at");
  app.save(deliveries);
});
