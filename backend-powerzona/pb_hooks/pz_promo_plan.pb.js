/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/plan",
  (e) => require(`${__hooks}/pz_promo_plan_api_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_promo_plan_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/plan/change",
  (e) => require(`${__hooks}/pz_promo_plan_api_lib.js`).handleChange(e),
  (e) => require(`${__hooks}/pz_promo_plan_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/plan/renew",
  (e) => require(`${__hooks}/pz_promo_plan_api_lib.js`).handleRenew(e),
  (e) => require(`${__hooks}/pz_promo_plan_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
