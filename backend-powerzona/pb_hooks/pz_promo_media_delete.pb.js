/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/media/delete",
  (e) => require(`${__hooks}/pz_promo_media_delete_api_lib.js`).handleDelete(e),
  (e) => require(`${__hooks}/pz_promo_pubcfg_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
