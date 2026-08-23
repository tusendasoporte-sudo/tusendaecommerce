/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/domains/list",
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/domains/create",
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).handleCreate(e),
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/domains/verify",
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).handleVerify(e),
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/domains/status/update",
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).handleStatusUpdate(e),
  (e) => require(`${__hooks}/pz_promo_domain_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
