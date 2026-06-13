/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("categories");

  if (!hasField(collection, "description")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text1780470301",
      "max": 0,
      "min": 0,
      "name": "description",
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
  const collection = app.findCollectionByNameOrId("categories");
  collection.fields.removeById("text1780470301");
  return app.save(collection);
});
