/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

  // V5 FIX:
  // En tu base actual el campo product_ref ya existe, por eso NO se vuelve a crear.
  // Solo ajustamos la relación product para que no sea requerida y permita borrar
  // productos reales sin romper order_items históricos.
  collection.fields.addAt(2, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_4092854851",
    "help": "Relación opcional al producto real. La orden conserva historial fijo aunque el producto se borre.",
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940")

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

  return app.save(collection)
})
