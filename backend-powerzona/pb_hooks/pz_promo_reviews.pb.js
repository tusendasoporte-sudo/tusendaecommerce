/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/list",
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/moderate",
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).handleModerate(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
