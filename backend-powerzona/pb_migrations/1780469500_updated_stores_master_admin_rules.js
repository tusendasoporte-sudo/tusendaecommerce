/// <reference path="../pb_data/types.d.ts" />


const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");

  stores.createRule = MASTER_ADMIN_RULE;
  stores.updateRule = MASTER_ADMIN_RULE;
  stores.deleteRule = `protected != true && ${MASTER_ADMIN_RULE}`;

  return app.save(stores);
}, (app) => {
  const stores = app.findCollectionByNameOrId("stores");

  stores.createRule = '@request.auth.id != ""';
  stores.updateRule = '@request.auth.id != ""';
  stores.deleteRule = 'protected != true && @request.auth.id != ""';

  return app.save(stores);
});
