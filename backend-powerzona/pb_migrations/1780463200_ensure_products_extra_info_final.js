/// <reference path="../pb_data/types.d.ts" />
// PZ-PRODUCT-EXTRA-INFO-FINAL-20260603
// Garantiza que products.extra_info exista para guardar hasta 3 datos editables por producto.
// Importante: esta migración final usa el nombre de colección "products" para evitar problemas si el ID interno cambia.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("products")

  let hasExtraInfo = false
  try {
    hasExtraInfo = !!collection.fields.getByName("extra_info")
  } catch (_) {
    hasExtraInfo = false
  }

  if (!hasExtraInfo) {
    collection.fields.add(new Field({
      "help": "JSON texto con hasta 3 datos editables del producto. Ej: [{\"label\":\"Marca\",\"value\":\"Spring Valley\"}]",
      "hidden": false,
      "id": "text2463200001",
      "max": 0,
      "min": 0,
      "name": "extra_info",
      "pattern": "",
      "presentable": false,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }))
  }

  return app.save(collection)
}, (app) => {
  // No removemos el campo en rollback para no perder información adicional ya guardada.
  return null
})
