/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/sites/{publicSlug}",
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).handlePublicProjection(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/draft/read",
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).handleDraftRead(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/draft/update",
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).handleDraftUpdate(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1100000),
  $apis.skipSuccessActivityLog()
);
