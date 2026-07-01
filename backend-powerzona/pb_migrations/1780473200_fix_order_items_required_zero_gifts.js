/// <reference path="../pb_data/types.d.ts" />

const NUMERIC_FIELDS_ALLOW_ZERO = [
  "unit_price_usd",
  "line_total_usd",
  "variation_price_usd",
  "unit_price_selected_currency",
  "line_total_selected_currency",
  "unit_price_original_usd",
  "unit_price_final_usd",
  "line_subtotal_original_usd",
  "line_discount_usd",
  "line_subtotal_final_usd",
  "unit_profit_usd",
  "line_profit_usd",
  "coupon_discount_usd",
  "gift_min_order_usd",
];

const PROFIT_FIELDS = ["unit_profit_usd", "line_profit_usd"];
const PUBLIC_CREATE_RULE = '@request.auth.id = ""';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function patchField(collection, fieldName, patcher) {
  try {
    const field = collection.fields.getByName(fieldName);
    if (!field) return;
    patcher(field);
  } catch (_) {}
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
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
  if (hasField(collection, name)) {
    patchField(collection, name, (field) => {
      field.required = false;
    });
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
  if (hasField(collection, name)) {
    patchNumberField(collection, name);
    return;
  }

  collection.fields.add(new Field({
    "hidden": false,
    "id": id,
    "max": null,
    "min": null,
    "name": name,
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
    "default": 0
  }));
}

function ensureGiftRelation(collection, gifts) {
  if (hasField(collection, "gift")) {
    patchField(collection, "gift", (field) => {
      field.required = false;
      field.minSelect = 0;
      field.maxSelect = 0;
      if (gifts?.id) field.collectionId = gifts.id;
    });
    return;
  }

  collection.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": gifts.id,
    "hidden": false,
    "id": "relation1780473201",
    "maxSelect": 0,
    "minSelect": 0,
    "name": "gift",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }));
}

function patchNumberField(collection, fieldName) {
  patchField(collection, fieldName, (field) => {
    field.required = false;
    if (PROFIT_FIELDS.includes(fieldName)) {
      field.min = null;
      return;
    }
    if (field.min !== null && Number(field.min) > 0) {
      field.min = 0;
    }
  });
}

migrate((app) => {
  const collection = findCollectionSafe(app, "order_items");
  const gifts = findCollectionSafe(app, "gifts");
  if (!collection) return;

  patchField(collection, "product", (field) => {
    field.required = false;
    field.minSelect = 0;
  });
  patchField(collection, "variation", (field) => {
    field.required = false;
    field.minSelect = 0;
  });

  if (gifts) ensureGiftRelation(collection, gifts);
  ensureBoolField(collection, "bool1780473202", "is_gift");
  ensureNumberField(collection, "number1780473203", "gift_min_order_usd");
  NUMERIC_FIELDS_ALLOW_ZERO.forEach((fieldName) => patchNumberField(collection, fieldName));
  ensurePublicCreateRule(collection);

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "order_items");
  if (!collection) return;

  ensurePublicCreateRule(collection);
  app.save(collection);
});
