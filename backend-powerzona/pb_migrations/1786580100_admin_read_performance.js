/// <reference path="../pb_data/types.d.ts" />

const ADMIN_READ_INDEXES = [
  ["orders", "idx_orders_store_created", "store, created"],
  ["order_items", "idx_order_items_order_created", "`order`, created"],
  ["products", "idx_products_store_name", "store, name"],
  ["product_variations", "idx_product_variations_product_type_value", "product, variation_type, value"],
  ["categories", "idx_categories_store_order_name", "store, `order`, name"],
  ["subcategories", "idx_subcategories_store_order_name", "store, `order`, name"],
  ["shipping_zones", "idx_shipping_zones_store_municipality_zone", "store, municipality, zone"],
  ["currencies", "idx_currencies_store_default_base_code", "store, is_default, is_base, code"],
];

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function addIndexIfNeeded(collection, name, columns) {
  try { if (collection.getIndex(name)) return; } catch (_) {}
  collection.addIndex(name, false, columns, "");
}

function removeIndexIfExists(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

migrate((app) => {
  ADMIN_READ_INDEXES.forEach(([collectionName, indexName, columns]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    addIndexIfNeeded(collection, indexName, columns);
    app.save(collection);
  });
}, (app) => {
  ADMIN_READ_INDEXES.forEach(([collectionName, indexName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    removeIndexIfExists(collection, indexName);
    app.save(collection);
  });
});
