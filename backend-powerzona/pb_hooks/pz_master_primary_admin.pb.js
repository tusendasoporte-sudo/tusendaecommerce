/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/primary-admin/status",
  (e) => require(`${__hooks}/pz_master_primary_admin_lib.js`).handleStatus(e),
  (e) => require(`${__hooks}/pz_master_primary_admin_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/primary-admin/assign",
  (e) => require(`${__hooks}/pz_master_primary_admin_lib.js`).handleAssign(e),
  (e) => require(`${__hooks}/pz_master_primary_admin_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/primary-admin/replace",
  (e) => require(`${__hooks}/pz_master_primary_admin_lib.js`).handleReplace(e),
  (e) => require(`${__hooks}/pz_master_primary_admin_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

onRecordUpdateRequest((e) => {
  require(`${__hooks}/pz_master_primary_admin_lib.js`).rejectDirectPrimaryAdminMutation(e);
  return e.next();
}, "stores");

onRecordCreateRequest((e) => {
  require(`${__hooks}/pz_master_primary_admin_lib.js`).rejectDirectPrimaryAdminMutation(e);
  return e.next();
}, "stores");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/pz_master_primary_admin_lib.js`).rejectDirectProtectedPrimaryUserMutation(e, "update");
  return e.next();
}, "users");

onRecordDeleteRequest((e) => {
  require(`${__hooks}/pz_master_primary_admin_lib.js`).rejectDirectProtectedPrimaryUserMutation(e, "delete");
  return e.next();
}, "users");
