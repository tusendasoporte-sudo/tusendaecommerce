/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/delete",
  (e) => require(`${__hooks}/pz_promo_review_delete_api_lib.js`).handleDelete(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
