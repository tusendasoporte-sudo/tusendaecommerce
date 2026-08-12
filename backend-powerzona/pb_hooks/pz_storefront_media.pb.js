/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/storefront/v1/media/upload",
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).handleUpload(e),
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth("users"),
  $apis.bodyLimit(8650752),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/media/list",
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth("users"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/media/delete",
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).handleDelete(e),
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth("users"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/storefront/v1/media/file/{record}/{filename}",
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).handlePublicFile(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

onFileDownloadRequest(
  (e) => require(`${__hooks}/pz_storefront_media_lib.js`).handleFileDownload(e),
  "push_media"
);

cronAdd(
  "pz_storefront_push_media_expiry",
  "*/5 * * * *",
  () => require(`${__hooks}/pz_storefront_media_lib.js`).cleanupExpiredMedia($app, new Date())
);

cronAdd(
  "pz_store_storage_budget_monitor",
  "7 * * * *",
  () => require(`${__hooks}/pz_store_storage_budget_lib.js`).monitorStoreStorageBudget($app, new Date())
);
