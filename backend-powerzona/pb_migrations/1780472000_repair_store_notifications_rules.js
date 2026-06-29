/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_USER_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';
const PUBLIC_CREATE_RULE = '@request.auth.id = "" && store != ""';

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  collection.createRule = `(${PUBLIC_CREATE_RULE}) || (${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.viewRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.deleteRule = MASTER_ADMIN_RULE;

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;

  collection.createRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.listRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.viewRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.updateRule = `(${MASTER_ADMIN_RULE}) || (${STORE_USER_RULE})`;
  collection.deleteRule = MASTER_ADMIN_RULE;

  app.save(collection);
});
