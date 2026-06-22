/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "number2829990864",
    "max": null,
    "min": null,
    "name": "unit_price_usd",
    "onlyInt": false,
    "presentable": true,
    "required": true,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(12, new Field({
    "help": "",
    "hidden": false,
    "id": "number2242083091",
    "max": null,
    "min": null,
    "name": "unit_profit_usd",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(13, new Field({
    "help": "",
    "hidden": false,
    "id": "number951123000",
    "max": null,
    "min": null,
    "name": "line_profit_usd",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.removeById("number2829990864")

  collection.fields.removeById("number2242083091")

  collection.fields.removeById("number951123000")

  return app.save(collection)
})
