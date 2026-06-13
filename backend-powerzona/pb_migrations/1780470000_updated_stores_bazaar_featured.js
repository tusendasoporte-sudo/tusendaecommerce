/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("stores");

  if (!hasField(collection, "featured_order")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "number1780470001",
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

  if (!hasField(collection, "bazaar_image")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "file1780470002",
      "maxSelect": 1,
      "maxSize": 5242880,
      "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
      "name": "bazaar_image",
      "presentable": false,
      "protected": false,
      "required": false,
      "system": false,
      "thumbs": ["700x300", "1200x520"],
      "type": "file"
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("stores");
  collection.fields.removeById("number1780470001");
  collection.fields.removeById("file1780470002");
  return app.save(collection);
});
