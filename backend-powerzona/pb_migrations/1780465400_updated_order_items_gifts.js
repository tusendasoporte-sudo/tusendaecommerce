/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-V40-ORDER-ITEMS-REGALOS-20260604
// Permite guardar regalos dentro de order_items sin producto normal.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940");
  const productField = collection.fields.getByName("product");
  if (productField) productField.required = false;

  collection.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1780465200",
    "hidden": false,
    "id": "relation1780465401",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "gift",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }));

  collection.fields.add(new Field({
    "hidden": false,
    "id": "bool1780465402",
    "name": "is_gift",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }));

  collection.fields.add(new Field({
    "hidden": false,
    "id": "number1780465403",
    "max": null,
    "min": 0,
    "name": "gift_min_order_usd",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2456927940");
  const productField = collection.fields.getByName("product");
  if (productField) productField.required = true;
  collection.fields.removeById("relation1780465401");
  collection.fields.removeById("bool1780465402");
  collection.fields.removeById("number1780465403");
  return app.save(collection);
});
