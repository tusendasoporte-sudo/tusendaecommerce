/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/sites/{publicSlug}/locales",
  (e) => require(`${__hooks}/pz_promo_i18n_api_lib.js`).handleNeutralProjection(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/sites/{publicSlug}/locales/{locale}",
  (e) => require(`${__hooks}/pz_promo_i18n_api_lib.js`).handleExplicitProjection(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);
