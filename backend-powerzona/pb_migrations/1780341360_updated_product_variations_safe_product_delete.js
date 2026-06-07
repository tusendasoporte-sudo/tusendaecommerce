/// <reference path="../pb_data/types.d.ts" />
// PZ-PRODUCT-VARIATIONS-BORRADO-SEGURO-V2-20260601
// Permite borrar un producto aunque tenga variaciones.
// Las variaciones reales se eliminan en cascada, mientras order_items conserva historial fijo.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  // product_variations.product sigue siendo requerido para crear/editar variaciones normales,
  // pero ahora usa cascadeDelete para que PocketBase elimine las variaciones cuando se borra el producto padre.
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "pbc_4092854851",
    "help": "Relación requerida al producto padre. Al borrar el producto, sus variaciones se eliminan automáticamente.",
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
