/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-21-30-2-TU-SENDA-84-STORE-RELATIONS-20260610
// Agrega relacion store a colecciones principales y asigna los datos existentes a PowerZona.
// No toca product_variations, order_items ni manual_coupon_usages para evitar duplicar relaciones derivadas.

const STORE_RELATION_TARGETS = [
  ["products", "relation1780469101", "idx_products_store"],
  ["categories", "relation1780469102", "idx_categories_store"],
  ["subcategories", "relation1780469103", "idx_subcategories_store"],
  ["settings", "relation1780469104", ""],
  ["shipping_zones", "relation1780469105", ""],
  ["gifts", "relation1780469106", ""],
  ["automatic_promotions", "relation1780469107", "idx_automatic_promotions_store"],
  ["manual_coupons", "relation1780469108", "idx_manual_coupons_store"],
  ["orders", "relation1780469109", "idx_orders_store"],
  ["store_visual_items", "relation1780469110", ""],
];

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function addStoreFieldIfMissing(collection, fieldId, storesCollectionId) {
  if (hasField(collection, "store")) return false;

  collection.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": storesCollectionId,
    "hidden": false,
    "id": fieldId,
    "maxSelect": 1,
    "minSelect": 0,
    "name": "store",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }));

  return true;
}

function addIndexIfNeeded(collection, indexName) {
  if (!indexName) return;

  try {
    collection.getIndex(indexName);
    return;
  } catch (_) {
    collection.addIndex(indexName, false, "store", "");
  }
}

function removeIndexIfExists(collection, indexName) {
  if (!indexName) return;

  try {
    collection.removeIndex(indexName);
  } catch (_) {}
}

function assignPowerZonaStore(app, collectionName, powerzonaId) {
  let offset = 0;
  const limit = 200;

  while (true) {
    let records = [];
    try {
      records = app.findRecordsByFilter(collectionName, "", "", limit, offset);
    } catch (_) {
      return;
    }

    if (!records || records.length === 0) return;

    records.forEach((record) => {
      if (record.get("store") === powerzonaId) return;
      record.set("store", powerzonaId);
      app.save(record);
    });

    if (records.length < limit) return;
    offset += limit;
  }
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const powerzona = app.findFirstRecordByData("stores", "slug", "powerzona");

  STORE_RELATION_TARGETS.forEach(([collectionName, fieldId, indexName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;

    addStoreFieldIfMissing(collection, fieldId, stores.id);
    addIndexIfNeeded(collection, indexName);
    app.save(collection);

    assignPowerZonaStore(app, collectionName, powerzona.id);
  });
}, (app) => {
  STORE_RELATION_TARGETS.forEach(([collectionName, fieldId, indexName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;

    removeIndexIfExists(collection, indexName);

    try {
      collection.fields.removeById(fieldId);
    } catch (_) {}

    app.save(collection);
  });
});
