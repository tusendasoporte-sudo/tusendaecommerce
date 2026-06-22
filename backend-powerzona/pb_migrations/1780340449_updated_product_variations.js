/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  collection.fields.removeById("number810771065")

  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "number3067803474",
    "max": null,
    "min": null,
    "name": "price_usd",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(5, new Field({
    "help": "",
    "hidden": false,
    "id": "number1220888422",
    "max": null,
    "min": null,
    "name": "cost_usd",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(7, new Field({
    "help": "",
    "hidden": false,
    "id": "file3309110367",
    "maxSelect": 10,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "image",
    "presentable": true,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  collection.fields.addAt(8, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text4144812898",
    "max": 0,
    "min": 0,
    "name": "internal_ref",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.addAt(9, new Field({
    "help": "",
    "hidden": false,
    "id": "number1169138922",
    "max": null,
    "min": null,
    "name": "sort_order",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.addAt(10, new Field({
    "help": "",
    "hidden": false,
    "id": "bool3217001970",
    "name": "allow_preorder",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "number810771065",
    "max": null,
    "min": null,
    "name": "extra_price",
    "onlyInt": false,
    "presentable": true,
    "required": false,
    "system": false,
    "type": "number"
  }))

  collection.fields.removeById("number3067803474")

  collection.fields.removeById("number1220888422")

  collection.fields.removeById("file3309110367")

  collection.fields.removeById("text4144812898")

  collection.fields.removeById("number1169138922")

  collection.fields.removeById("bool3217001970")

  return app.save(collection)
})
