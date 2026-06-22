/// <reference path="../pb_data/types.d.ts" />

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
      "id": "text2462200001",
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
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  try {
    const field = collection.fields.getByName("extra_info")
    if (field?.id === "text2462200001") {
      collection.fields.removeById("text2462200001")
    }
  } catch (_) {}

  return app.save(collection)
})
