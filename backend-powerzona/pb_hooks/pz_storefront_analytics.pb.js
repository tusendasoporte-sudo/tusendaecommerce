/// <reference path="../pb_data/types.d.ts" />

const analyticsAuth = (e) => require(`${__hooks}/pz_storefront_analytics_lib.js`).requireAuthenticatedUser(e);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/analytics/installations",
  (e) => require(`${__hooks}/pz_storefront_analytics_lib.js`).handleInstallationsAnalytics(e),
  analyticsAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(512),
  $apis.skipSuccessActivityLog(),
);

cronAdd(
  "pz_storefront_push_analytics_daily",
  "17 * * * *",
  () => {
    try {
      require(`${__hooks}/pz_storefront_analytics_lib.js`).refreshAllStoreDailyStats($app, new Date());
    } catch (_) {
      try { $app.logger().error("Storefront analytics aggregation failed safely.", "code", "PZ_STOREFRONT_ANALYTICS_AGGREGATION_FAILED"); } catch (_) {}
    }
  },
);

cronAdd(
  "pz_storefront_push_analytics_cleanup",
  "42 * * * *",
  () => {
    try {
      require(`${__hooks}/pz_storefront_analytics_lib.js`).cleanupExpiredAnalytics($app, new Date());
    } catch (_) {
      try { $app.logger().error("Storefront analytics cleanup failed safely.", "code", "PZ_STOREFRONT_ANALYTICS_CLEANUP_FAILED"); } catch (_) {}
    }
  },
);
