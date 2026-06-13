/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  if (!hasField(collection, "public_category_columns")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "select1780470201",
      "maxSelect": 1,
      "name": "public_category_columns",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["1", "2"]
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  collection.fields.removeById("select1780470201");
  return app.save(collection);
});
