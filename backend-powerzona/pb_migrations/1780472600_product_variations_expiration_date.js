/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = findCollectionSafe(app, "product_variations");
  if (!collection) return;

  if (!hasField(collection, "expiration_date")) {
    collection.fields.add(new Field({
      "help": "",
      "hidden": false,
      "id": "date1780472601",
      "max": "",
      "min": "",
      "name": "expiration_date",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "date"
    }));
  }

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "product_variations");
  if (!collection) return;

  try {
    collection.fields.removeById("date1780472601");
  } catch (_) {}

  app.save(collection);
});
