/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/security/public-access",
  (e) => require(`${__hooks}/pz_security_enforcement_lib.js`).handlePublicAccess(e),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_security_enforcement_lib.js`).enforcePublicReviewCreate(e),
  "reviews",
);

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_security_enforcement_lib.js`).enforcePublicInteractionCreate(e),
  "store_analytics_events",
);

onRecordsListRequest(
  (e) => require(`${__hooks}/pz_security_enforcement_lib.js`).enforcePublicRead(e),
  "stores", "products", "product_variations", "categories", "subcategories",
  "orders", "order_items", "shipping_methods", "shipping_zones",
  "automatic_promotions", "manual_coupons", "gifts", "raffles", "raffle_entries",
  "reviews", "store_visual_items", "settings", "currencies",
);

onRecordViewRequest(
  (e) => require(`${__hooks}/pz_security_enforcement_lib.js`).enforcePublicRead(e),
  "stores", "products", "product_variations", "categories", "subcategories",
  "orders", "order_items", "shipping_methods", "shipping_zones",
  "automatic_promotions", "manual_coupons", "gifts", "raffles", "raffle_entries",
  "reviews", "store_visual_items", "settings", "currencies",
);

onFileDownloadRequest(
  (e) => require(`${__hooks}/pz_security_enforcement_lib.js`).enforcePublicFile(e),
  "stores", "products", "product_variations", "categories", "subcategories",
  "gifts", "raffles", "store_visual_items", "settings",
);
