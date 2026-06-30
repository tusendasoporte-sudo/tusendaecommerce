/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_ARCHIVED_DELETE_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store && status = "archived"';

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

migrate((app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  if (!hasField(collection, "archived_at")) {
    collection.fields.add(new Field({
      id: "date1780472701",
      name: "archived_at",
      type: "date",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      min: "",
      max: "",
    }));
  }

  collection.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_ARCHIVED_DELETE_RULE})`;

  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  const cleanupIndex = "CREATE INDEX `idx_store_notifications_cleanup_archived` ON `store_notifications` (`store`, `status`, `archived_at`)";
  if (!indexes.includes(cleanupIndex)) {
    collection.indexes = [...indexes, cleanupIndex];
  }

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  try {
    collection.fields.removeById("date1780472701");
  } catch (_) {}

  collection.deleteRule = MASTER_ADMIN_RULE;
  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((index) => !String(index).includes("idx_store_notifications_cleanup_archived"));

  app.save(collection);
});
