/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-V38-REGALOS-PROFESIONALES-20260604
// Crea la colección gifts para regalos por reglas: sin precio, sin variaciones y con stock propio.

migrate((app) => {
  const collection = new Collection({
    "id": "pbc_1780465200",
    "name": "gifts",
    "type": "base",
    "system": false,
    "listRule": "active = true",
    "viewRule": "active = true",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "indexes": [],
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text3208210256", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780465201", "max": 0, "min": 0, "name": "name", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780465202", "max": 0, "min": 0, "name": "description", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "file1780465203", "maxSelect": 1, "maxSize": 5242880, "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"], "name": "image", "presentable": false, "protected": false, "required": false, "system": false, "thumbs": ["300x300", "700x700"], "type": "file" },
      { "hidden": false, "id": "number1780465204", "max": null, "min": 0, "name": "min_order_usd", "onlyInt": false, "presentable": true, "required": true, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780465205", "max": null, "min": 0, "name": "stock", "onlyInt": true, "presentable": true, "required": true, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780465206", "max": null, "min": null, "name": "sort_order", "onlyInt": false, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "bool1780465207", "name": "active", "presentable": true, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "autodate2990389176", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate3332085495", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ]
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1780465200");
  return app.delete(collection);
});
