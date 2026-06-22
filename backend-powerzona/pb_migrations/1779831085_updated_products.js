/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.addAt(14, new Field({
    "help": "",
    "hidden": false,
    "id": "number3988810005",
    "max": null,
    "min": null,
    "name": "profit_margin",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.removeById("number3988810005")

  return app.save(collection)
})
