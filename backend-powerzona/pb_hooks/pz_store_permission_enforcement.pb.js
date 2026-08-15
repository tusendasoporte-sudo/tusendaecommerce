/// <reference path="../pb_data/types.d.ts" />

routerUse(new Middleware(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforcePublicProductReadCachePolicy(e),
  -900,
));

routerUse(new Middleware(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceRaffleFileCachePolicy(e),
  -899,
));

onRecordsListRequest(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceRead(e),
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "manual_coupon_usages",
  "gifts", "raffles", "raffle_entries", "reviews", "store_notifications",
  "store_analytics_events", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_events", "store_security_blocks",
  "store_visitor_sessions", "store_customers",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "push_media", "push_campaigns", "push_campaign_deliveries", "push_events", "push_daily_stats",
);

onRecordViewRequest(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceRead(e),
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "manual_coupon_usages",
  "gifts", "raffles", "raffle_entries", "reviews", "store_notifications",
  "store_analytics_events", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_events", "store_security_blocks",
  "store_visitor_sessions", "store_customers",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "push_media", "push_campaigns", "push_campaign_deliveries", "push_events", "push_daily_stats",
);

// Per-field privacy must run at PocketBase's serialization boundary. Request
// hooks above still enforce collection access and tenant isolation.
onRecordEnrich(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceEnrich(e),
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "manual_coupon_usages",
  "gifts", "raffles", "raffle_entries", "reviews", "store_notifications",
  "store_analytics_events", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_events", "store_security_blocks",
  "store_visitor_sessions", "store_customers",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "push_media", "push_campaigns", "push_campaign_deliveries", "push_events", "push_daily_stats",
);

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceMutation(e, "", "create"),
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "manual_coupon_usages",
  "gifts", "raffles", "raffle_entries", "reviews", "store_notifications",
  "store_analytics_events", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_events", "store_security_blocks",
  "store_visitor_sessions", "store_customers",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "push_media", "push_campaigns", "push_campaign_deliveries", "push_events", "push_daily_stats",
);

onRecordUpdateRequest(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceMutation(e, "", "update"),
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "manual_coupon_usages",
  "gifts", "raffles", "raffle_entries", "reviews", "store_notifications",
  "store_analytics_events", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_events", "store_security_blocks",
  "store_visitor_sessions", "store_customers",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "push_media", "push_campaigns", "push_campaign_deliveries", "push_events", "push_daily_stats",
);

onRecordDeleteRequest(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceMutation(e, "", "delete"),
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "manual_coupon_usages",
  "gifts", "raffles", "raffle_entries", "reviews", "store_notifications",
  "store_analytics_events", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_events", "store_security_blocks",
  "store_visitor_sessions", "store_customers",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "push_media", "push_campaigns", "push_campaign_deliveries", "push_events", "push_daily_stats",
);

onFileDownloadRequest(
  (e) => require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceFileDownload(e),
  "settings", "raffles",
);

onRealtimeSubscribeRequest((e) => {
  return require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceRealtimeSubscribe(e);
});

onRealtimeMessageSend((e) => {
  return require(`${__hooks}/pz_store_permission_enforcement_lib.js`).enforceRealtimeMessage(e);
});
