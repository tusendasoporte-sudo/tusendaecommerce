/// <reference path="../pb_data/types.d.ts" />

const EVENT_TYPE_FIELD_ID = "select1787523204";
const DAILY_TYPE_FIELD_ID = "select1787523304";
const UNIQUE_COUNT_FIELD_ID = "number1787523309";
const LANDING_QR_EVENT = "landing_qr_open";

function expectedField(collection, id) {
  const field = collection.fields.getByName("event_type");
  if (!field || field.id !== id || field.name !== "event_type") {
    throw new Error("incompatible_promo_analytics_event_type");
  }
  return field;
}

function addValue(field) {
  const values = Array.from(field.values || []);
  if (!values.includes(LANDING_QR_EVENT)) field.values = [...values, LANDING_QR_EVENT];
}

function removeValue(field) {
  field.values = Array.from(field.values || []).filter((value) => value !== LANDING_QR_EVENT);
}

function assertSafeRollback(app, collection) {
  const rows = app.findRecordsByFilter(
    collection,
    "event_type = {:type}",
    "id",
    1,
    0,
    { type: LANDING_QR_EVENT },
  ) || [];
  if (rows.length) throw new Error("unsafe_rollback_promo_analytics_landing_qr");
}

function expectedUniqueCount(collection) {
  const field = collection.fields.getByName("unique_count");
  if (!field || field.id !== UNIQUE_COUNT_FIELD_ID || field.name !== "unique_count") {
    throw new Error("incompatible_promo_analytics_unique_count");
  }
  return field;
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("promo_analytics_events");
  const daily = app.findCollectionByNameOrId("promo_analytics_daily");
  addValue(expectedField(events, EVENT_TYPE_FIELD_ID));
  addValue(expectedField(daily, DAILY_TYPE_FIELD_ID));
  // PocketBase 0.39 treats numeric zero as blank when a number field is required.
  // DATA remains the authoritative integer/nonnegative guard and unique_count is
  // intentionally always zero because Promo does not create visitor identities.
  expectedUniqueCount(daily).required = false;
  app.save(events);
  app.save(daily);
}, (app) => {
  const events = app.findCollectionByNameOrId("promo_analytics_events");
  const daily = app.findCollectionByNameOrId("promo_analytics_daily");
  assertSafeRollback(app, "promo_analytics_events");
  assertSafeRollback(app, "promo_analytics_daily");
  removeValue(expectedField(events, EVENT_TYPE_FIELD_ID));
  removeValue(expectedField(daily, DAILY_TYPE_FIELD_ID));
  expectedUniqueCount(daily).required = true;
  app.save(events);
  app.save(daily);
});
