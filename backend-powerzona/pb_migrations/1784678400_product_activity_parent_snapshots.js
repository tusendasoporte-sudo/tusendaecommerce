/// <reference path="../pb_data/types.d.ts" />

const PARENT_FIELD_ID = "text1784678401";
const VARIATION_FIELD_ID = "text1784678402";
const PARENT_INDEX = "CREATE INDEX `idx_store_activity_product_parent_created` ON `store_activity_audit` (`store`, `parent_product_id_snapshot`, `created`)";

function optionalSnapshotField(id, name) {
  return new Field({
    autogeneratePattern: "", hidden: true, id, max: 80, min: 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: false, system: false, type: "text",
  });
}

function hasField(collection, name) {
  try { return !!collection.fields.getByName(name); } catch (_) { return false; }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("store_activity_audit");
  if (!hasField(collection, "parent_product_id_snapshot")) {
    collection.fields.add(optionalSnapshotField(PARENT_FIELD_ID, "parent_product_id_snapshot"));
  }
  if (!hasField(collection, "variation_id_snapshot")) {
    collection.fields.add(optionalSnapshotField(VARIATION_FIELD_ID, "variation_id_snapshot"));
  }
  if (!collection.indexes.some((index) => String(index).includes("idx_store_activity_product_parent_created"))) {
    collection.indexes.push(PARENT_INDEX);
  }
  app.save(collection);
  app.db().newQuery(`
    UPDATE store_activity_audit
    SET variation_id_snapshot = resource_id_snapshot,
        parent_product_id_snapshot = COALESCE((
          SELECT product FROM product_variations
          WHERE product_variations.id = store_activity_audit.resource_id_snapshot
        ), '')
    WHERE resource_type = 'product_variation'
      AND variation_id_snapshot = ''
  `).execute();
  app.db().newQuery(`
    UPDATE store_activity_audit
    SET parent_product_id_snapshot = resource_id_snapshot
    WHERE resource_type = 'product'
      AND parent_product_id_snapshot = ''
  `).execute();
}, (app) => {
  const collection = app.findCollectionByNameOrId("store_activity_audit");
  collection.indexes = collection.indexes.filter((index) => !String(index).includes("idx_store_activity_product_parent_created"));
  try { collection.fields.removeById(VARIATION_FIELD_ID); } catch (_) {}
  try { collection.fields.removeById(PARENT_FIELD_ID); } catch (_) {}
  return app.save(collection);
});
