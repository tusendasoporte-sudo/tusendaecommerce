/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/media/upload",
  (e) => require(`${__hooks}/pz_promo_media_api_lib.js`).handleUpload(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(25 * 1024 * 1024 + 512 * 1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/media/list",
  (e) => require(`${__hooks}/pz_promo_media_api_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/media/retire",
  (e) => require(`${__hooks}/pz_promo_media_api_lib.js`).handleRetire(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/private/v1/media/{assetId}/{digest}/{filename}",
  (e) => require(`${__hooks}/pz_promo_media_api_lib.js`).handlePrivateFile(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/sites/{publicSlug}/media/{useKey}/{digest}/{filename}",
  (e) => require(`${__hooks}/pz_promo_media_api_lib.js`).handlePublicFile(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

onFileDownloadRequest(
  () => require(`${__hooks}/pz_promo_media_api_lib.js`).blockDirectFileDownload(),
  "promo_media_assets"
);
