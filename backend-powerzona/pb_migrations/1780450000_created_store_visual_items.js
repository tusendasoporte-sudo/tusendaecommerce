/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "help": "",
        "hidden": false,
        "id": "text3208210256",
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
        "hidden": false,
        "id": "select1780450001",
        "maxSelect": 0,
        "name": "type",
        "presentable": true,
        "required": true,
        "system": false,
        "type": "select",
        "values": ["promo_visual", "acceso_rapido"]
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1780450002",
        "max": 0,
        "min": 0,
        "name": "title",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1780450003",
        "max": 0,
        "min": 0,
        "name": "description",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "file1780450004",
        "maxSelect": 0,
        "maxSize": 5242880,
        "mimeTypes": ["image/jpeg", "image/png", "image/webp", "image/gif"],
        "name": "image",
        "presentable": false,
        "protected": false,
        "required": false,
        "system": false,
        "thumbs": ["300x200", "700x420"],
        "type": "file"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1780450005",
        "max": 0,
        "min": 0,
        "name": "button_text",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1780450006",
        "maxSelect": 0,
        "name": "action_type",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": ["whatsapp", "url", "categoria", "archivo"]
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1780450007",
        "max": 0,
        "min": 0,
        "name": "target_url",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "help": "",
        "hidden": false,
        "id": "text1780450008",
        "max": 0,
        "min": 0,
        "name": "whatsapp_message",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_3292755704",
        "help": "",
        "hidden": false,
        "id": "relation1780450009",
        "maxSelect": 0,
        "minSelect": 0,
        "name": "category",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "relation"
      },
      {
        "hidden": false,
        "id": "file1780450010",
        "maxSelect": 0,
        "maxSize": 10485760,
        "mimeTypes": ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        "name": "attachment",
        "presentable": false,
        "protected": false,
        "required": false,
        "system": false,
        "thumbs": [],
        "type": "file"
      },
      {
        "help": "",
        "hidden": false,
        "id": "number1780450011",
        "max": null,
        "min": null,
        "name": "sort_order",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "help": "",
        "hidden": false,
        "id": "bool1260321794",
        "name": "active",
        "presentable": true,
        "required": false,
        "system": false,
        "type": "bool"
      },
      {
        "hidden": false,
        "id": "autodate2990389176",
        "name": "created",
        "onCreate": true,
        "onUpdate": false,
        "presentable": false,
        "system": false,
        "type": "autodate"
      },
      {
        "hidden": false,
        "id": "autodate3332085495",
        "name": "updated",
        "onCreate": true,
        "onUpdate": true,
        "presentable": false,
        "system": false,
        "type": "autodate"
      }
    ],
    "id": "pbc_1780450000",
    "indexes": [],
    "listRule": "active = true",
    "name": "store_visual_items",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": "active = true"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1780450000");
  return app.delete(collection);
});
