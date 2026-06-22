/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_4092854851",
    "help": "Producto padre requerido. Cascade delete activo para permitir borrar productos con variaciones.",
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
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  collection.fields.addAt(1, new Field({
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
