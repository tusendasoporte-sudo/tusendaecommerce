/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    "createRule": '@request.auth.id = "" || @request.auth.id != ""',
    "deleteRule": '@request.auth.role = "master_admin"',
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text1780471601",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_1780469000",
        "hidden": false,
        "id": "relation1780471602",
        "maxSelect": 1,
        "minSelect": 1,
        "name": "store",
        "presentable": true,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471603",
        "max": 20,
        "min": 10,
        "name": "day",
        "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471604",
        "max": 80,
        "min": 6,
        "name": "visitor_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471605",
        "max": 80,
        "min": 0,
        "name": "session_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1780471606",
        "maxSelect": 1,
        "name": "page_type",
        "presentable": true,
        "required": true,
        "system": false,
        "type": "select",
        "values": ["store_home", "category", "subcategory", "product", "gifts", "search", "checkout", "other"]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471607",
        "max": 120,
        "min": 0,
        "name": "entity_type",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471608",
        "max": 120,
        "min": 0,
        "name": "entity_id",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471609",
        "max": 240,
        "min": 0,
        "name": "path",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471610",
        "max": 240,
        "min": 0,
        "name": "referrer",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1780471611",
        "max": 260,
        "min": 0,
        "name": "user_agent",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "autodate1780471612",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate1780471613",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_1780471600",
    "indexes": [
      "CREATE INDEX `idx_store_analytics_store_day` ON `store_analytics_events` (`store`, `day`)",
      "CREATE INDEX `idx_store_analytics_store_created` ON `store_analytics_events` (`store`, `created`)",
      "CREATE INDEX `idx_store_analytics_store_visitor_day` ON `store_analytics_events` (`store`, `visitor_id`, `day`)"
    ],
    "listRule": '(@request.auth.role = "master_admin") || ((@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store)',
    "name": "store_analytics_events",
    "system": false,
    "type": "base",
    "updateRule": '@request.auth.role = "master_admin"',
    "viewRule": '(@request.auth.role = "master_admin") || ((@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store)'
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1780471600");
  if (collection) return app.delete(collection);
});
