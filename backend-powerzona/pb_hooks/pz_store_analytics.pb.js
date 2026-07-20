/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/store/analytics/summary",
  (e) => require(`${__hooks}/pz_store_analytics_lib.js`).handleSummary(e),
  (e) => require(`${__hooks}/pz_store_analytics_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(512),
  $apis.skipSuccessActivityLog(),
);
