/// <reference path="../pb_data/types.d.ts" />
// PZ-MIGRATION-FEATURED-ORDER-V1-20260603
// Agrega featured_order a products para ordenar Productos destacados desde Organización Visual.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.addAt(17, new Field({
    "help": "Orden visual usado cuando featured=true.",
    "hidden": false,
    "id": "number2456000001",
    "max": null,
    "min": null,
    "name": "featured_order",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")
  collection.fields.removeById("number2456000001")
  return app.save(collection)
})
