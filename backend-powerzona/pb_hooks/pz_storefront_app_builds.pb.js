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
  "/api/pz/internal/storefront-app-builds/artifacts/upload",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleRunnerArtifactUpload(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireRunner(e),
  $apis.bodyLimit(106000000),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/storefront-app-downloads/{artifact}/{capability}/{filename}",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleArtifactDownload(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/master/storefront-app-artifacts/{artifact}/{filename}",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleMasterArtifactDownload(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/internal/storefront-app-builds/brand-assets/{job}/{kind}",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleRunnerBrandAssetFile(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireRunner(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/brand-assets/upload",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleBrandAssetUpload(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(12845056),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/master/storefront-app-builds/brand-assets/file/{asset}/{filename}",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleBrandAssetFile(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/adopt-existing",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleAdoptExisting(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
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
  "/api/pz/master/storefront-app-builds/release-action",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleReleaseAction(e),
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

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/cancel",
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).handleCancel(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/storefront-app-builds/admin-action",
  (e) => require(`${__hooks}/pz_storefront_app_admin_lib.js`).handleAdminAction(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/internal/storefront-app-admin-actions/claim",
  (e) => require(`${__hooks}/pz_storefront_app_admin_lib.js`).handleRunnerAdminClaim(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireRunner(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/internal/storefront-app-admin-actions/complete",
  (e) => require(`${__hooks}/pz_storefront_app_admin_lib.js`).handleRunnerAdminComplete(e),
  (e) => require(`${__hooks}/pz_storefront_app_builds_lib.js`).requireRunner(e),
  $apis.bodyLimit(16384),
  $apis.skipSuccessActivityLog()
);
