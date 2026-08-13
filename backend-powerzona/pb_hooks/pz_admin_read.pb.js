/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/admin/read/products-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleProductsBootstrap(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/admin/read/orders-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleOrdersBootstrap(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog(),
);
