/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  // update field
  collection.fields.addAt(19, new Field({
    "help": "",
    "hidden": false,
    "id": "bool1666150804",
    "name": "track_stock",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  // update field
  collection.fields.addAt(19, new Field({
    "help": "",
    "hidden": false,
    "id": "bool1666150804",
    "name": "productstrack_stock_Bool",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
})
