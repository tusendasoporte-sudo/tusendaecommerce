/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");

  collection.fields.add(new Field({
    "hidden": false,
    "id": "file1780465501",
    "maxSelect": 1,
    "maxSize": 5242880,
    "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
    "name": "gifts_public_image",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": ["300x200", "700x420"],
    "type": "file"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");
  collection.fields.removeById("file1780465501");
  return app.save(collection);
});
