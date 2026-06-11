/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-21-30-13-USERS-MASTER-ADMIN-RULES-20260611
// Permite que solo el Master Admin gestione usuarios de tienda desde la API.

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  users.listRule = MASTER_ADMIN_RULE;
  users.viewRule = `@request.auth.id = id || ${MASTER_ADMIN_RULE}`;
  users.createRule = MASTER_ADMIN_RULE;
  users.updateRule = MASTER_ADMIN_RULE;
  users.deleteRule = MASTER_ADMIN_RULE;

  return app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");

  users.listRule = null;
  users.viewRule = null;
  users.createRule = "";
  users.updateRule = '@request.auth.id = id';
  users.deleteRule = null;

  return app.save(users);
});
