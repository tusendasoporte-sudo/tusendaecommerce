/// <reference path="../pb_data/types.d.ts" />

function expirationCyclesCollection(app) {
  try {
    return app.findCollectionByNameOrId("product_expiration_cycles");
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const collection = expirationCyclesCollection(app);
  if (!collection) return;
  const field = collection.fields.getByName("threshold");
  // PocketBase treats numeric zero as blank for a required number field.
  // The collection is private and V7E9 always writes a validated threshold,
  // so optional storage is required to persist the official 0-day cycle.
  field.required = false;
  return app.save(collection);
}, (app) => {
  const collection = expirationCyclesCollection(app);
  if (!collection) return;
  const field = collection.fields.getByName("threshold");
  field.required = true;
  return app.save(collection);
});
