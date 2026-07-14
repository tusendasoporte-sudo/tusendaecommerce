/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/global-overview",
  (e) => require(`${__hooks}/pz_master_overview_lib.js`).handleGlobalOverview(e),
  (e) => require(`${__hooks}/pz_master_overview_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-overview",
  (e) => require(`${__hooks}/pz_master_overview_lib.js`).handleStoreOverview(e),
  (e) => require(`${__hooks}/pz_master_overview_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/price-watch-page",
  (e) => require(`${__hooks}/pz_master_overview_lib.js`).handlePriceWatchPage(e),
  (e) => require(`${__hooks}/pz_master_overview_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
