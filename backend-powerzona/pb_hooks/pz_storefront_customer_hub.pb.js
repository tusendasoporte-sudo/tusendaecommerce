/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/storefront/v1/customer-hub",
  (e) => require(`${__hooks}/pz_storefront_customer_hub_lib.js`).handleGet(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/customer-hub",
  (e) => require(`${__hooks}/pz_storefront_customer_hub_lib.js`).handlePost(e),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
