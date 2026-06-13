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

  if (!hasField(collection, "featured_on_home")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "bool1780470101",
      "name": "featured_on_home",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "bool"
    }));
  }

  if (!hasField(collection, "featured_order")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "number1780470102",
      "max": null,
      "min": 0,
      "name": "featured_order",
      "onlyInt": true,
      "presentable": false,
      "required": false,
      "system": false,
      "type": "number"
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("categories");
  collection.fields.removeById("bool1780470101");
  collection.fields.removeById("number1780470102");
  return app.save(collection);
});
