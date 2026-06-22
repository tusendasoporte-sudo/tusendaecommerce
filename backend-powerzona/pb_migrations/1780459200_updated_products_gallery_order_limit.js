/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")

  collection.fields.addAt(5, new Field({
    "help": "Orden JSON de los nombres de archivo en images. La primera imagen es la portada pública.",
    "hidden": false,
    "id": "text2459200001",
    "max": 0,
    "min": 0,
    "name": "image_order",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.addAt(4, new Field({
    "help": "Hasta 4 fotos por producto. La primera, según image_order, se usa como portada.",
    "hidden": false,
    "id": "file3760176746",
    "maxSelect": 4,
    "maxSize": 2097152,
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],
    "name": "images",
    "presentable": true,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [
      "300x300",
      "900x900"
    ],
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4092854851")
  collection.fields.removeById("text2459200001")
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "file3760176746",
    "maxSelect": 10,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "images",
    "presentable": true,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))
  return app.save(collection)
})
