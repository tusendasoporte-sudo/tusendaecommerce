/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/store/marketing/selectors",
  (e) => require(`${__hooks}/pz_store_marketing_selectors_lib.js`).handleSelectors(e),
  (e) => require(`${__hooks}/pz_store_marketing_selectors_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);
