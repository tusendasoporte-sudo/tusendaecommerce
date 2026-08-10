/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/store-push/register",
  (e) => require(`${__hooks}/pz_store_push_devices_lib.js`).handleRegister(e),
  (e) => require(`${__hooks}/pz_store_push_devices_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth("users"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/store-push/disable",
  (e) => require(`${__hooks}/pz_store_push_devices_lib.js`).handleDisable(e),
  (e) => require(`${__hooks}/pz_store_push_devices_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth("users"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
