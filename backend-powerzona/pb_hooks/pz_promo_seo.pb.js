/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/seo/sites/{publicSlug}/sitemap",
  (e) => require(`${__hooks}/pz_promo_seo_api_lib.js`).handlePlatform(e, "sitemap"),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/seo/sites/{publicSlug}/robots",
  (e) => require(`${__hooks}/pz_promo_seo_api_lib.js`).handlePlatform(e, "robots"),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/seo/host/sitemap",
  (e) => require(`${__hooks}/pz_promo_seo_api_lib.js`).handleHost(e, "sitemap"),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/promo/public/v1/seo/host/robots",
  (e) => require(`${__hooks}/pz_promo_seo_api_lib.js`).handleHost(e, "robots"),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);
