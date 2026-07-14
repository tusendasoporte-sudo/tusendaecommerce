/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/product-watch-action",
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).handleProductWatchAction(e),
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/product-price-history",
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).handleProductPriceHistory(e),
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

onRecordUpdateRequest(
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).continueActorRequest(e),
  "products",
  "product_variations"
);
onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).continueActorRequest(e),
  "product_variations"
);
onRecordDeleteRequest(
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).continueActorRequest(e),
  "products",
  "product_variations"
);

onRecordAfterUpdateSuccess(
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).continuePriceWatchSuccess(e, "update"),
  "products",
  "product_variations"
);

onRecordAfterCreateSuccess(
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).continuePriceWatchSuccess(e, "create"),
  "product_variations"
);

onRecordAfterDeleteSuccess(
  (e) => require(`${__hooks}/pz_master_price_watch_lib.js`).continuePriceWatchSuccess(e, "delete"),
  "products",
  "product_variations"
);
