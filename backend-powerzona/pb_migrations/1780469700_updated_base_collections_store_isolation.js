/// <reference path="../pb_data/types.d.ts" />


const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const STORE_OWNER_READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE}) || (${STORE_STAFF_READ_RULE})`;
const STORE_OWNER_WRITE_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE})`;
const PUBLIC_ACTIVE_OR_STORE_READ_RULE = `(active = true) || (${STORE_OWNER_READ_RULE})`;

const STORE_BASE_COLLECTIONS = [
  "settings",
  "categories",
  "subcategories",
  "products",
  "store_visual_items",
];

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function applyStoreRules(collection) {
  collection.listRule = PUBLIC_ACTIVE_OR_STORE_READ_RULE;
  collection.viewRule = PUBLIC_ACTIVE_OR_STORE_READ_RULE;
  collection.createRule = STORE_OWNER_WRITE_RULE;
  collection.updateRule = STORE_OWNER_WRITE_RULE;
  collection.deleteRule = STORE_OWNER_WRITE_RULE;
}

migrate((app) => {
  STORE_BASE_COLLECTIONS.forEach((collectionName) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    applyStoreRules(collection);
    app.save(collection);
  });

  const variations = findCollectionSafe(app, "product_variations");
  if (variations) {
    const variationPublicReadRule = `(active = true) || (${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && product.store = @request.auth.store) || (@request.auth.role = "store_staff" && product.store = @request.auth.store)`;
    const variationWriteRule = `(${MASTER_ADMIN_RULE}) || (@request.auth.role = "store_admin" && product.store = @request.auth.store)`;
    variations.listRule = variationPublicReadRule;
    variations.viewRule = variationPublicReadRule;
    variations.createRule = variationWriteRule;
    variations.updateRule = variationWriteRule;
    variations.deleteRule = variationWriteRule;
    app.save(variations);
  }
}, (app) => {
  STORE_BASE_COLLECTIONS.forEach((collectionName) => {
    const collection = findCollectionSafe(app, collectionName);
    if (!collection) return;
    collection.listRule = '@request.auth.id != ""';
    collection.viewRule = '@request.auth.id != ""';
    collection.createRule = '@request.auth.id != ""';
    collection.updateRule = '@request.auth.id != ""';
    collection.deleteRule = '@request.auth.id != ""';
    app.save(collection);
  });

  const variations = findCollectionSafe(app, "product_variations");
  if (variations) {
    variations.listRule = '@request.auth.id != "" || active = true';
    variations.viewRule = '@request.auth.id != "" || active = true';
    variations.createRule = '@request.auth.id != ""';
    variations.updateRule = '@request.auth.id != ""';
    variations.deleteRule = '@request.auth.id != ""';
    app.save(variations);
  }
});
