/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  collection.fields.addAt(7, new Field({
    "help": "",
    "hidden": false,
    "id": "file3309110367",
    "maxSelect": 1,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "image",
    "presentable": true,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2734288031")

  collection.fields.addAt(7, new Field({
    "help": "",
    "hidden": false,
    "id": "file3309110367",
    "maxSelect": 10,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "image",
    "presentable": true,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
})
