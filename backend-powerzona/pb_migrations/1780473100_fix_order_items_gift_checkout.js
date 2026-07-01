/// <reference path="../pb_data/types.d.ts" />

const PUBLIC_CREATE_RULE = '@request.auth.id = ""';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function ensurePublicCreateRule(collection) {
  const rule = String(collection.createRule || "").trim();
  if (!rule) {
    collection.createRule = PUBLIC_CREATE_RULE;
    return;
  }
  if (!rule.includes(PUBLIC_CREATE_RULE)) {
    collection.createRule = `(${PUBLIC_CREATE_RULE}) || (${rule})`;
  }
}

function ensureBoolField(collection, id, name) {
  const field = getFieldSafe(collection, name);
  if (field) {
    field.required = false;
    return;
  }

  collection.fields.add(new Field({
    "hidden": false,
    "id": id,
    "name": name,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool",
    "default": false
  }));
}

function ensureNumberField(collection, id, name) {
  const field = getFieldSafe(collection, name);
  if (field) {
    field.required = false;
    field.min = 0;
    field.onlyInt = false;
    return;
  }

  collection.fields.add(new Field({
    "hidden": false,
    "id": id,
    "max": null,
    "min": 0,
    "name": name,
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
    "default": 0
  }));
}

function ensureGiftRelationField(collection, giftsCollection) {
  const field = getFieldSafe(collection, "gift");
  if (field) {
    field.required = false;
    field.minSelect = 0;
    field.maxSelect = 0;
    if (giftsCollection?.id) field.collectionId = giftsCollection.id;
    return;
  }

  collection.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": giftsCollection.id,
    "hidden": false,
    "id": "relation1780473101",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "gift",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }));
}

migrate((app) => {
  const collection = findCollectionSafe(app, "order_items");
  const gifts = findCollectionSafe(app, "gifts");
  if (!collection || !gifts) return;

  const productField = getFieldSafe(collection, "product");
  if (productField) {
    productField.required = false;
    productField.minSelect = 0;
  }

  ensureGiftRelationField(collection, gifts);
  ensureBoolField(collection, "bool1780473102", "is_gift");
  ensureNumberField(collection, "number1780473103", "gift_min_order_usd");
  ensurePublicCreateRule(collection);

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "order_items");
  if (!collection) return;

  ensurePublicCreateRule(collection);
  app.save(collection);
});
