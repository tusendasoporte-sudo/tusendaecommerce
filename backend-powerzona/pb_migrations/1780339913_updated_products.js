/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.addAt(17, new Field({
    "help": "",
    "hidden": false,
    "id": "number1220888422",
    "max": null,
    "min": null,
    "name": "cost_usd",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.removeById("number1220888422")

  return app.save(collection)
})
