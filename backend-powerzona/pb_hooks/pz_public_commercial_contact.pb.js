/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/public/commercial-contact",
  (e) => require(`${__hooks}/pz_admin_support_lib.js`).handlePublicCommercialContact(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog(),
);
