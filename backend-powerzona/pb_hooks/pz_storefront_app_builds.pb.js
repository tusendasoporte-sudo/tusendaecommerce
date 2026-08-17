/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/updates",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleEngineUpdates(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/whatsapp/settings",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleWhatsappSettings(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/whatsapp/preview",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleWhatsappPreview(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/whatsapp/marked-sent",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleWhatsappMarkedSent(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/internal/storefront-app-builds/claim",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleRunnerClaim(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireRunner(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/internal/storefront-app-builds/complete",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleRunnerComplete(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireRunner(e),
  $apis.bodyLimit(65536),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/preview",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handlePreview(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(16384),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/confirm",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleConfirm(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/retry",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleRetry(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);
