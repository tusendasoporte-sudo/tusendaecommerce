/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/stores/catalog",
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).handleCatalogRead(e),
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/overview",
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).handleOverviewRead(e),
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/lifecycle/update",
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).handleLifecycleUpdate(e),
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/master/v1/preferences/update",
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).handlePreferencesUpdate(e),
  (e) => require(`${__hooks}/pz_promo_master_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
