/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/store-activity-summary",
  (e) => require(`${__hooks}/pz_master_dashboard_lib.js`).handleStoreActivitySummary(e),
  (e) => require(`${__hooks}/pz_master_dashboard_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(512),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-analytics-detail",
  (e) => require(`${__hooks}/pz_master_dashboard_lib.js`).handleStoreAnalyticsDetail(e),
  (e) => require(`${__hooks}/pz_master_dashboard_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/order-readonly-detail",
  (e) => require(`${__hooks}/pz_master_dashboard_lib.js`).handleOrderReadonlyDetail(e),
  (e) => require(`${__hooks}/pz_master_dashboard_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);
