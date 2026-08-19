/// <reference path="../pb_data/types.d.ts" />

routerUse(new Middleware(
  (e) => {
    require(`${__hooks}/pz_store_user_devices_lib.js`).captureAndScrubAuthUserAgent(e);
    // PocketBase 0.39.8 requiere propagar explícitamente el ApiError de hooks posteriores.
    try {
      return e.next();
    } catch (error) {
      throw error;
    }
  },
  -1000
));

routerAdd(
  "POST",
  "/api/pz/master/store-user-devices/list",
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-user-devices/revoke",
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).handleRevoke(e),
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-user-devices/delete",
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).handleDelete(e),
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-user-devices/audit",
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).handleAudit(e),
  (e) => require(`${__hooks}/pz_store_user_devices_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

onRecordAuthWithPasswordRequest((e) => {
  require(`${__hooks}/pz_store_user_devices_lib.js`).enforceLoginDevice(e);
  require(`${__hooks}/pz_master_store_users_lib.js`).enforceTemporaryPasswordAuthentication(e);
  return e.next();
}, "users");

onRecordAuthRefreshRequest((e) => {
  require(`${__hooks}/pz_store_user_devices_lib.js`).enforceRefreshDevice(e);
  require(`${__hooks}/pz_master_store_users_lib.js`).enforceTemporaryPasswordAuthentication(e);
  return e.next();
}, "users");
