/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244")

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463801",
    "max": 0,
    "min": 0,
    "name": "footer_title",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463802",
    "max": 0,
    "min": 0,
    "name": "footer_text",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463803",
    "max": 0,
    "min": 0,
    "name": "footer_contact_text",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463804",
    "max": 0,
    "min": 0,
    "name": "footer_extra_text",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463805",
    "max": 0,
    "min": 0,
    "name": "footer_link_1_label",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463806",
    "max": 0,
    "min": 0,
    "name": "footer_link_1_url",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463807",
    "max": 0,
    "min": 0,
    "name": "footer_link_2_label",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780463808",
    "max": 0,
    "min": 0,
    "name": "footer_link_2_url",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244")

  collection.fields.removeById("text1780463801")
  collection.fields.removeById("text1780463802")
  collection.fields.removeById("text1780463803")
  collection.fields.removeById("text1780463804")
  collection.fields.removeById("text1780463805")
  collection.fields.removeById("text1780463806")
  collection.fields.removeById("text1780463807")
  collection.fields.removeById("text1780463808")

  return app.save(collection)
})
