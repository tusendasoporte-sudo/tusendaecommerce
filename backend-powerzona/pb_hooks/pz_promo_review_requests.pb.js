/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/reviews/sites/{publicSlug}",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePublicList(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/public/v1/reviews/sites/{publicSlug}/submit",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePublicSubmit(e),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/public/v1/reviews/sites/{publicSlug}/request",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handleRequestContext(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/requests/create",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePrivateCreate(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/requests/list",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePrivateList(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/requests/reveal",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePrivateReveal(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/requests/revoke",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePrivateRevoke(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/reviews/requests/delete",
  (e) => require(`${__hooks}/pz_promo_review_requests_api_lib.js`).handlePrivateDelete(e),
  (e) => require(`${__hooks}/pz_promo_reviews_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
