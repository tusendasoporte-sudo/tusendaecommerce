/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/candidates/create",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handleCandidateCreate(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/preview",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handlePreview(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/preview/context",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handlePreviewContext(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/publish",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handlePublish(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/canonical/switch",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handleBindingSwitch(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/rollback",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handleRollback(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/unpublish",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handleUnpublish(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/pause",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handlePause(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/publication/resume",
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).handleResume(e),
  (e) => require(`${__hooks}/pz_promo_publish_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
