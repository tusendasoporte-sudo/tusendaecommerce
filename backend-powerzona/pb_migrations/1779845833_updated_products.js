/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  // update field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "select1180077873",
    "maxSelect": 0,
    "name": "delivery_mode",
    "presentable": true,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "delivery",
      "pickup",
      "both"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  // update field
  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "select1180077873",
    "maxSelect": 0,
    "name": "delivery_mode",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "delivery",
      "pickup",
      "both"
    ]
  }))

  return app.save(collection)
})
