/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_4092854851",
    "help": "Relación opcional al producto real. El historial fijo vive en product_ref/product_name.",
    "hidden": false,
    "id": "relation3544843437",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "product",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2734288031",
    "help": "Relación opcional a la variación real. El historial fijo vive en variation_ref/variation_label.",
    "hidden": false,
    "id": "relation1654338538",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "variation",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  collection.fields.addAt(16, new Field({
    "autogeneratePattern": "",
    "help": "Copia fija del ID/ref del producto al momento de crear la orden.",
    "hidden": false,
    "id": "text2059184301",
    "max": 0,
    "min": 0,
    "name": "product_ref",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  collection.fields.removeById("text2059184301")

  collection.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_4092854851",
    "help": "",
    "hidden": false,
    "id": "relation3544843437",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "product",
    "presentable": true,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_2734288031",
    "help": "",
    "hidden": false,
    "id": "relation1654338538",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "variation",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
