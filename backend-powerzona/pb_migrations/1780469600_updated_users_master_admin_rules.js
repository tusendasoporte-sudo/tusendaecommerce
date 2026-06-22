/// <reference path="../pb_data/types.d.ts" />


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
