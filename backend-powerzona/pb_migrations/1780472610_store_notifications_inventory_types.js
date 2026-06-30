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

  const typeField = getFieldSafe(collection, "type");
  if (!typeField) return;

  const values = normalizeValues(typeField);
  const additions = [
    "product_expiring_critical",
    "product_expired",
    "variation_expiring_soon",
    "variation_expiring_critical",
    "variation_expired"
  ];

  let changed = false;
  additions.forEach((value) => {
    if (!values.includes(value)) {
      values.push(value);
      changed = true;
    }
  });

  if (changed) {
    typeField.values = values;
    app.save(collection);
  }
}, (app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  const typeField = getFieldSafe(collection, "type");
  if (!typeField) return;

  const remove = new Set([
    "product_expiring_critical",
    "product_expired",
    "variation_expiring_soon",
    "variation_expiring_critical",
    "variation_expired"
  ]);

  typeField.values = normalizeValues(typeField).filter((value) => !remove.has(value));
  app.save(collection);
});
