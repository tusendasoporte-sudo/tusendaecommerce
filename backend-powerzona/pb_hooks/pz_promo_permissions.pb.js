/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/access/context",
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).handleAccessContext(e),
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/team/detail",
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).handleTeamDetail(e),
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/team/update-permissions",
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).handlePermissionsUpdate(e),
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/master/entitlements/update",
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).handleEntitlementsUpdate(e),
  (e) => require(`${__hooks}/pz_promo_permissions_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);
