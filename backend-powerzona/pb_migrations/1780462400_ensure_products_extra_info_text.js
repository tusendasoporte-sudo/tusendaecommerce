/// <reference path="../pb_data/types.d.ts" />
// PZ-PRODUCT-EXTRA-INFO-V3-ENSURE-FIELD-20260603
// Garantiza que products.extra_info exista para guardar hasta 3 datos editables por producto.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  let hasExtraInfo = false
  try {
    hasExtraInfo = !!collection.fields.getByName("extra_info")
  } catch (_) {
    hasExtraInfo = false
  }

  if (!hasExtraInfo) {
    collection.fields.addAt(12, new Field({
      "help": "JSON con hasta 3 datos editables del producto. Ej: [{\"label\":\"Marca\",\"value\":\"Spring Valley\"}]",
      "hidden": false,
      "id": "text2462400001",
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
