/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3527180448")

  // add field
  collection.fields.addAt(22, new Field({
    "help": "Marca si esta orden ya descontó inventario para evitar dobles descuentos.",
    "hidden": false,
    "id": "bool1780060000",
    "name": "stock_deducted",
    "presentable": true,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3527180448")

  // remove field
  collection.fields.removeById("bool1780060000")

  return app.save(collection)
})
