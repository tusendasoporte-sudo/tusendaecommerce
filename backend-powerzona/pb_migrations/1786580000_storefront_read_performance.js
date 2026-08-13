/// <reference path="../pb_data/types.d.ts" />

const STOREFRONT_INDEXES = [
  ["settings", "idx_settings_store_active_updated", "store, active, updated"],
  ["categories", "idx_categories_store_active_order_name", "store, active, `order`, name"],
  ["subcategories", "idx_subcategories_store_active_order_name", "store, active, `order`, name"],
  ["products", "idx_products_store_active_created", "store, active, created"],
  ["products", "idx_products_store_active_featured_order", "store, active, featured, featured_order, updated"],
  ["products", "idx_products_store_active_category_created", "store, active, category, created"],
  ["products", "idx_products_store_active_subcategory_created", "store, active, subcategory, created"],
  ["product_variations", "idx_product_variations_product_active_sort", "product, active, sort_order"],
  ["reviews", "idx_reviews_store_status_type_featured_created", "store, status, type, featured, created"],
  ["automatic_promotions", "idx_automatic_promotions_store_active_priority", "store, active, priority, updated"],
  ["store_visual_items", "idx_store_visual_items_store_active_sort", "store, active, sort_order, title"],
  ["gifts", "idx_gifts_store_active_sort", "store, active, sort_order, name"],
  ["currencies", "idx_currencies_store_active_code", "store, active, code"],
];

const STOREFRONT_THUMBS = [
  ["categories", "image", ["300x200", "700x420"]],
  ["subcategories", "image", ["300x200", "700x420"]],
  ["product_variations", "image", ["300x300", "900x900"]],
];

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function addIndexIfNeeded(collection, indexName, columns) {
  try {
    if (collection.getIndex(indexName)) return;
  } catch (_) {}
  collection.addIndex(indexName, false, columns, "");
}

function removeIndexIfExists(collection, indexName) {
  try {
    collection.removeIndex(indexName);
  } catch (_) {}
}

function setThumbsIfPresent(collection, fieldName, thumbs) {
  try {
    collection.fields.getByName(fieldName).thumbs = thumbs;
  } catch (_) {}
}

migrate((app) => {
  STOREFRONT_INDEXES.forEach(([collectionName, indexName, columns]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    addIndexIfNeeded(collection, indexName, columns);
    app.save(collection);
  });

  STOREFRONT_THUMBS.forEach(([collectionName, fieldName, thumbs]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    setThumbsIfPresent(collection, fieldName, thumbs);
    app.save(collection);
  });
}, (app) => {
  STOREFRONT_INDEXES.forEach(([collectionName, indexName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    removeIndexIfExists(collection, indexName);
    app.save(collection);
  });

  STOREFRONT_THUMBS.forEach(([collectionName, fieldName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    setThumbsIfPresent(collection, fieldName, []);
    app.save(collection);
  });
});
