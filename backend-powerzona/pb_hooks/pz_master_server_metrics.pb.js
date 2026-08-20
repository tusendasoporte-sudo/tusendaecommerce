/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/master/server-metrics",
  (e) => require(`${__hooks}/pz_master_server_metrics_lib.js`).handleServerMetrics(e),
  (e) => require(`${__hooks}/pz_master_server_metrics_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.skipSuccessActivityLog()
);
