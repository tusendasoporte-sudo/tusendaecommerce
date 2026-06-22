/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool1780465301",
    "name": "gifts_public_active",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }));

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1780465302",
    "max": 0,
    "min": 0,
    "name": "gifts_public_title",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");
  collection.fields.removeById("bool1780465301");
  collection.fields.removeById("text1780465302");
  return app.save(collection);
});
