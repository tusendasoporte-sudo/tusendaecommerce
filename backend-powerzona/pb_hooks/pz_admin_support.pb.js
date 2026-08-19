/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/admin/support-contact",
  (e) => require(`${__hooks}/pz_admin_support_lib.js`).handleSupportContact(e),
  (e) => require(`${__hooks}/pz_admin_support_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog(),
);
