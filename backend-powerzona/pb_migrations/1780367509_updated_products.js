/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.addAt(20, new Field({
    "help": "",
    "hidden": false,
    "id": "select2242842000",
    "maxSelect": 0,
    "name": "variation_view",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "buttons",
      "dropdown",
      "checkbox"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.removeById("select2242842000")

  return app.save(collection)
})
