/// <reference path="../pb_data/types.d.ts" />


migrate((app) => {
  const collection = new Collection({
    "createRule": '@request.auth.id != ""',
    "deleteRule": 'protected != true && @request.auth.id != ""',
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1780469001", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780469002", "max": 140, "min": 1, "name": "name", "pattern": "", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780469003", "max": 80, "min": 1, "name": "slug", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$", "presentable": true, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "file1780469004", "maxSelect": 1, "maxSize": 5242880, "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"], "name": "logo", "presentable": false, "protected": false, "required": false, "system": false, "thumbs": ["120x120", "300x300"], "type": "file" },
      { "hidden": false, "id": "file1780469005", "maxSelect": 1, "maxSize": 10485760, "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"], "name": "banner", "presentable": false, "protected": false, "required": false, "system": false, "thumbs": ["700x300", "1400x500"], "type": "file" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780469006", "max": 140, "min": 0, "name": "owner_name", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "exceptDomains": [], "hidden": false, "id": "email1780469007", "name": "owner_email", "onlyDomains": [], "presentable": false, "required": false, "system": false, "type": "email" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1780469008", "max": 60, "min": 0, "name": "owner_phone", "pattern": "", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
      { "hidden": false, "id": "select1780469009", "maxSelect": 1, "name": "status", "presentable": true, "required": true, "system": false, "type": "select", "values": ["active", "paused", "suspended"] },
      { "hidden": false, "id": "select1780469010", "maxSelect": 1, "name": "plan", "presentable": true, "required": true, "system": false, "type": "select", "values": ["free", "basic", "premium"] },
      { "hidden": false, "id": "bool1780469011", "name": "featured", "presentable": true, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "number1780469012", "max": null, "min": 0, "name": "views_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "number1780469013", "max": null, "min": 0, "name": "orders_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
      { "hidden": false, "id": "bool1780469014", "name": "protected", "presentable": false, "required": false, "system": false, "type": "bool" },
      { "hidden": false, "id": "autodate1780469015", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1780469016", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1780469000",
    "indexes": ["CREATE UNIQUE INDEX `idx_stores_slug` ON `stores` (`slug`)"],
    "listRule": 'status = "active" || @request.auth.id != ""',
    "name": "stores",
    "system": false,
    "type": "base",
    "updateRule": '@request.auth.id != ""',
    "viewRule": 'status = "active" || @request.auth.id != ""'
  });

  app.save(collection);

  const powerzona = new Record(collection, {
    "name": "PowerZona",
    "slug": "powerzona",
    "status": "active",
    "plan": "premium",
    "featured": true,
    "views_count": 0,
    "orders_count": 0,
    "protected": true
  });

  return app.save(powerzona);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1780469000");
  return app.delete(collection);
});
