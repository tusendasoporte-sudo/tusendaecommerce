/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.addAt(14, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text4107484973",
    "max": 0,
    "min": 0,
    "name": "variation_label",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

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
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.removeById("text4107484973")

  collection.fields.removeById("number2734277259")

  return app.save(collection)
})
