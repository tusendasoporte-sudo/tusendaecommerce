/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/themes/catalog",
  (e) => require(`${__hooks}/pz_promo_theme_api_lib.js`).handleCatalogRead(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/themes/releases/update",
  (e) => require(`${__hooks}/pz_promo_theme_api_lib.js`).handleReleaseUpdate(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
