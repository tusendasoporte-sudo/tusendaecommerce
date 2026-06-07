/// <reference path="../pb_data/types.d.ts" />
// PZ-MIGRATION-V1-AJUSTES-GENERALES-PUBLICOS-20260603
// Agrega campos públicos a settings para portada, logo, dirección, horarios, bienvenida, servicios y reseña.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244")

  collection.fields.add(new Field({
    "hidden": false,
    "id": "file1780459001",
    "maxSelect": 0,
    "maxSize": 5242880,
    "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
    "name": "cover_image",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": ["700x260", "1200x420"],
    "type": "file"
  }))

  collection.fields.add(new Field({
    "hidden": false,
    "id": "file1780459002",
    "maxSelect": 0,
    "maxSize": 3145728,
    "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
    "name": "logo_image",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": ["160x160", "300x300"],
    "type": "file"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780459003",
    "max": 0,
    "min": 0,
    "name": "address",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780459004",
    "max": 0,
    "min": 0,
    "name": "business_hours",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780459005",
    "max": 0,
    "min": 0,
    "name": "welcome_text",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780459006",
    "max": 0,
    "min": 0,
    "name": "public_services_text",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  collection.fields.add(new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text1780459007",
    "max": 0,
    "min": 0,
    "name": "reviews_text",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2769025244")

  collection.fields.removeById("file1780459001")
  collection.fields.removeById("file1780459002")
  collection.fields.removeById("text1780459003")
  collection.fields.removeById("text1780459004")
  collection.fields.removeById("text1780459005")
  collection.fields.removeById("text1780459006")
  collection.fields.removeById("text1780459007")

  return app.save(collection)
})
