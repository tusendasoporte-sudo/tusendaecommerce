/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244");

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool1780467201",
    "name": "marketing_bar_active",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }));

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780467202",
    "max": 0,
    "min": 0,
    "name": "marketing_bar_text",
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
    "id": "text1780467203",
    "max": 0,
    "min": 0,
    "name": "marketing_bar_button_text",
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
    "id": "text1780467204",
    "max": 0,
    "min": 0,
    "name": "marketing_bar_url",
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

  collection.fields.removeById("bool1780467201");
  collection.fields.removeById("text1780467202");
  collection.fields.removeById("text1780467203");
  collection.fields.removeById("text1780467204");

  return app.save(collection);
});
