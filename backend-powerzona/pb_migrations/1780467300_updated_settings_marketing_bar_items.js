/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780467301",
    "max": 0,
    "min": 0,
    "name": "marketing_bar_items_json",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }));

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780467302",
    "max": 10,
    "min": 0,
    "name": "marketing_bar_theme",
    "pattern": "^(black|gold|green|red|blue)?$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");

  collection.fields.removeById("text1780467301");
  collection.fields.removeById("text1780467302");

  return app.save(collection);
});
