/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1287526725")

  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "number3807468395",
    "max": null,
    "min": null,
    "name": "price_usd",
    "onlyInt": false,
    "presentable": true,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1287526725")

  collection.fields.addAt(3, new Field({
    "help": "",
    "hidden": false,
    "id": "number3807468395",
    "max": null,
    "min": null,
    "name": "price_cup",
    "onlyInt": false,
    "presentable": true,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
