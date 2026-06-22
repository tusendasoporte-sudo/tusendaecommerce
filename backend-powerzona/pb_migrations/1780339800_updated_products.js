/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.addAt(15, new Field({
    "help": "",
    "hidden": false,
    "id": "bool3186730701",
    "name": "has_variations",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.removeById("bool3186730701")

  return app.save(collection)
})
