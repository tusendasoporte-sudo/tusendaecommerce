/// <reference path="../pb_data/types.d.ts" />

const TYPE = "security_blocked_attempt";

function notificationTypeField(collection) {
  try { return collection.fields.getByName("type"); }
  catch (_) { return null; }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("store_notifications");
  const field = notificationTypeField(collection);
  if (!field) return;
  const values = Array.isArray(field.values) ? field.values.slice() : [];
  if (!values.includes(TYPE)) values.push(TYPE);
  field.values = values;
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("store_notifications");
  const field = notificationTypeField(collection);
  if (!field) return;
  field.values = (Array.isArray(field.values) ? field.values : []).filter((value) => value !== TYPE);
  return app.save(collection);
});
