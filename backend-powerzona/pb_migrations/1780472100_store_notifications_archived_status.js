/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function normalizeValues(field) {
  return Array.isArray(field?.values) ? field.values.filter(Boolean) : [];
}

migrate((app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  const statusField = getFieldSafe(collection, "status");
  if (!statusField) return;

  const values = normalizeValues(statusField);
  if (!values.includes("archived")) {
    statusField.values = [...values, "archived"];
    app.save(collection);
  }
}, (app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  const statusField = getFieldSafe(collection, "status");
  if (!statusField) return;

  const values = normalizeValues(statusField).filter((value) => value !== "archived");
  statusField.values = values.length ? values : ["unread", "read"];
  app.save(collection);
});
