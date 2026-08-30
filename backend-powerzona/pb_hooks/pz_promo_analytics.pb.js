/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/promo/public/v1/analytics/sites/{publicSlug}/events",
  (e) => require(`${__hooks}/pz_promo_analytics_api_lib.js`).handleCollect(e, "platform"),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/promo/private/v1/analytics/summary",
  (e) => require(`${__hooks}/pz_promo_analytics_api_lib.js`).handleSummary(e),
  (e) => require(`${__hooks}/pz_promo_analytics_api_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(512),
  $apis.skipSuccessActivityLog(),
);

cronAdd(
  "pz_promo_analytics_cleanup",
  "53 3 * * *",
  () => {
    try {
      require(`${__hooks}/pz_promo_analytics_api_lib.js`).cleanupExpiredAnalytics($app, new Date());
    } catch (_) {
      try { $app.logger().error("Promo analytics cleanup failed safely.", "code", "PZ_PROMO_ANALYTICS_CLEANUP_FAILED"); } catch (_) {}
    }
  },
);
