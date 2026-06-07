/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780467101",
    "max": 3,
    "min": 0,
    "name": "order_prefix",
    "pattern": "^[A-Za-z]{0,3}$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");
  collection.fields.removeById("text1780467101");
  return app.save(collection);
});
