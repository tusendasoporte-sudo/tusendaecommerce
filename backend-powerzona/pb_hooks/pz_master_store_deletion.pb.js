/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/store-delete-preview",
  (e) => require(`${__hooks}/pz_master_store_deletion_lib.js`).handleStoreDeletePreview(e),
  (e) => require(`${__hooks}/pz_master_store_deletion_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-delete-execute",
  (e) => require(`${__hooks}/pz_master_store_deletion_lib.js`).handleStoreDeleteExecute(e),
  (e) => require(`${__hooks}/pz_master_store_deletion_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
