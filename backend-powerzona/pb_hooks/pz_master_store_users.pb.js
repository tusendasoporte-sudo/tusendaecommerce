/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/store-users/summary",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleSummary(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/list",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/detail",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/create",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleCreate(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/update",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleUpdate(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/delete",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleDelete(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/change-password",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleChangePassword(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/revoke-sessions",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleRevokeSessions(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-users/audit",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleAudit(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/store/account/change-password",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleSelfPasswordChange(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/store/account/change-temporary-password",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleTemporaryPasswordChange(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/store/account/revoke-sessions",
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).handleSelfRevokeSessions(e),
  (e) => require(`${__hooks}/pz_master_store_users_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

onRecordAuthWithPasswordRequest((e) => {
  require(`${__hooks}/pz_master_store_users_lib.js`).rejectSuspendedAuthentication(e);
  return e.next();
}, "users");

onRecordAuthRefreshRequest((e) => {
  require(`${__hooks}/pz_master_store_users_lib.js`).rejectSuspendedAuthentication(e);
  return e.next();
}, "users");
