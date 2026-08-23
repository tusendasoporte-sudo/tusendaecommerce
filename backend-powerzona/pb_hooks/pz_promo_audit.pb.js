/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/audit/list",
  (e) => require(`${__hooks}/pz_promo_audit_api_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_promo_audit_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/audit/detail",
  (e) => require(`${__hooks}/pz_promo_audit_api_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_promo_audit_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
