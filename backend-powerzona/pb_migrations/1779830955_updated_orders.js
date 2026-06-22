/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3527180448")

  collection.fields.addAt(16, new Field({
    "help": "",
    "hidden": false,
    "id": "number587084009",
    "max": null,
    "min": null,
    "name": "local_currency_total",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(17, new Field({
    "help": "",
    "hidden": false,
    "id": "number3413590934",
    "max": null,
    "min": null,
    "name": "usd_only_total",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(18, new Field({
    "help": "",
    "hidden": false,
    "id": "number1869071786",
    "max": null,
    "min": null,
    "name": "shipping_cup",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(19, new Field({
    "help": "",
    "hidden": false,
    "id": "number3412805686",
    "max": null,
    "min": null,
    "name": "exchange_rate_used",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3527180448")

  collection.fields.removeById("number587084009")

  collection.fields.removeById("number3413590934")

  collection.fields.removeById("number1869071786")

  collection.fields.removeById("number3412805686")

  return app.save(collection)
})
