/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/store-products",
  (e) => require(`${__hooks}/pz_master_products_lib.js`).handleStoreProducts(e),
  (e) => require(`${__hooks}/pz_master_products_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/store-product-detail",
  (e) => require(`${__hooks}/pz_master_products_lib.js`).handleStoreProductDetail(e),
  (e) => require(`${__hooks}/pz_master_products_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
