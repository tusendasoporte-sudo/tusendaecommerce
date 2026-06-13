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

  if (!hasField(collection, "store_description")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text1780469901",
      "max": 0,
      "min": 0,
      "name": "store_description",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  collection.fields.removeById("text1780469901");
  return app.save(collection);
});
