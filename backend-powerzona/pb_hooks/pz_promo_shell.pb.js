/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/shell/sites/{publicSlug}",
  (e) => require(`${__hooks}/pz_promo_shell_api_lib.js`).handlePlatform(e, false),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/shell/sites/{publicSlug}/locales/{locale}",
  (e) => require(`${__hooks}/pz_promo_shell_api_lib.js`).handlePlatform(e, true),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/shell/host",
  (e) => require(`${__hooks}/pz_promo_shell_api_lib.js`).handleHost(e, false),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/shell/host/locales/{locale}",
  (e) => require(`${__hooks}/pz_promo_shell_api_lib.js`).handleHost(e, true),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/shell/stores/{storeSlug}",
  (e) => require(`${__hooks}/pz_promo_shell_api_lib.js`).handleCommerceBridge(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);
