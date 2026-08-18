/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST", "/api/pz/master/admin-app-releases/detail",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterDetail(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/master/admin-app-releases/configure",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterConfigure(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(4096), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/master/admin-app-releases/brand/upload",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterBrandUpload(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(2200000), $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET", "/api/pz/master/admin-app-brand-assets/{asset}/{filename}",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterBrandDownload(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(0), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/master/admin-app-releases/preview",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterPreview(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(2048), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/master/admin-app-releases/confirm",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterConfirm(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(2048), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/master/admin-app-releases/action",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleMasterAction(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(4096), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/admin-app/releases/portal",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleAdminPortal(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/admin-app/releases/ticket",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleAdminTicket(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/admin-app/releases/policy",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleAdminPolicy(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(2048), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/admin-app/releases/check-in",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleAdminCheckIn(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(2048), $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET", "/api/pz/admin-app-downloads/{artifact}/{ticket}/{filename}",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleAdminDownload(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(0), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/internal/admin-app-builds/claim",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleRunnerClaim(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireRunner(e),
  $apis.bodyLimit(1024), $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET", "/api/pz/internal/admin-app-brand-assets/{asset}/{filename}",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleRunnerBrandDownload(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireRunner(e),
  $apis.bodyLimit(0), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/internal/admin-app-builds/artifacts/upload",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleRunnerUpload(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireRunner(e),
  $apis.bodyLimit(106000000), $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST", "/api/pz/internal/admin-app-builds/complete",
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).handleRunnerComplete(e),
  (e) => require(`${__hooks}/pz_admin_app_releases_lib.js`).requireRunner(e),
  $apis.bodyLimit(16384), $apis.skipSuccessActivityLog()
);
