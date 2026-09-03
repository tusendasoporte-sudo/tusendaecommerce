/// <reference path="../pb_data/types.d.ts" />

const TAXONOMY_INDEXES = Object.freeze([
  ["categories", "idx_categories_store_slug", "store, slug"],
  ["subcategories", "idx_subcategories_store_slug", "store, slug"],
  ["subcategories", "idx_subcategories_store_category_name", "store, category, name"],
]);

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function addIndexIfMissing(collection, name, columns) {
  try { if (collection.getIndex(name)) return; } catch (_) {}
  collection.addIndex(name, false, columns, "");
}

function removeIndexIfPresent(collection, name) {
  try { collection.removeIndex(name); } catch (_) {}
}

migrate((app) => {
  TAXONOMY_INDEXES.forEach(([collectionName, indexName, columns]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    addIndexIfMissing(collection, indexName, columns);
    app.save(collection);
  });
}, (app) => {
  TAXONOMY_INDEXES.forEach(([collectionName, indexName]) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    removeIndexIfPresent(collection, indexName);
    app.save(collection);
  });
});
