/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.addAt(15, new Field({
    "help": "",
    "hidden": false,
    "id": "number2734277259",
    "max": null,
    "min": null,
    "name": "variation_price_usd",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.addAt(15, new Field({
    "help": "",
    "hidden": false,
    "id": "number2734277259",
    "max": null,
    "min": null,
    "name": "variation_price_usd",
    "onlyInt": false,
    "presentable": true,
    "required": true,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
})
