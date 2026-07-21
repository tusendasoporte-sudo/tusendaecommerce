/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/store/products/history/summary",
  (e) => require(`${__hooks}/pz_product_history_lib.js`).handleSummary(e),
  (e) => require(`${__hooks}/pz_product_history_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/store/products/history/list",
  (e) => require(`${__hooks}/pz_product_history_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_product_history_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/store/products/history/detail",
  (e) => require(`${__hooks}/pz_product_history_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_product_history_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
