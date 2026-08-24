/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/domains/cloudflare/simulate",
  (e) => require(`${__hooks}/pz_promo_cloudflare_api_lib.js`).handleSimulate(e),
  (e) => require(`${__hooks}/pz_promo_cloudflare_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
