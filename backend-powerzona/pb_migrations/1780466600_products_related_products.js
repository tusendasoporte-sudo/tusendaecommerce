/// <reference path="../pb_data/types.d.ts" />
// PZ-MIGRATION-V41-PRODUCTOS-RELACIONADOS-20260605
// Agrega relación múltiple related_products en products. Máximo 4 productos.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("products")

  let hasRelatedProducts = false
  try { hasRelatedProducts = !!collection.fields.getByName("related_products") } catch (_) { hasRelatedProducts = false }

  if (!hasRelatedProducts) {
    collection.fields.add(new Field({
      "cascadeDelete": false,
      "collectionId": "pbc_4092854851",
      "help": "Productos relacionados sugeridos en la ficha pública. Máximo 4.",
      "hidden": false,
      "id": "relation1780466600",
      "maxSelect": 4,
      "minSelect": 0,
      "name": "related_products",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "relation"
    }))
  }

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("products")
  try { collection.fields.removeById(collection.fields.getByName("related_products").id) } catch (_) {}
  return app.save(collection)
})
