/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/store-plan",
  (e) => require(`${__hooks}/pz_store_plan_management_lib.js`).handlePlanDetail(e),
  (e) => require(`${__hooks}/pz_store_plan_management_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-plan/change",
  (e) => require(`${__hooks}/pz_store_plan_management_lib.js`).handlePlanChange(e),
  (e) => require(`${__hooks}/pz_store_plan_management_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-plan/renew",
  (e) => require(`${__hooks}/pz_store_plan_management_lib.js`).handlePlanRenew(e),
  (e) => require(`${__hooks}/pz_store_plan_management_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
