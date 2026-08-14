/// <reference path="../pb_data/types.d.ts" />

const campaignAuth = (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).requireAuthenticatedUser(e);

routerAdd(
  "GET",
  "/api/pz/storefront/v1/campaigns",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleList(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "GET",
  "/api/pz/storefront/v1/campaigns/{id}",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleDetail(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/campaigns/save",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleSave(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(16384),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/campaigns/audience-preview",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleAudiencePreview(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/campaigns/schedule",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleSchedule(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/campaigns/cancel",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleCancel(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/campaigns/duplicate",
  (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`).handleDuplicate(e),
  campaignAuth,
  $apis.requireAuth("users"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);

cronAdd(
  "pz_storefront_push_campaigns",
  "* * * * *",
  () => {
    try {
      require(`${__hooks}/pz_storefront_campaigns_lib.js`).runCampaignScheduler($app, new Date());
    } catch (_) {
      try { $app.logger().error("Storefront campaign scheduler failed safely.", "code", "PZ_STOREFRONT_CAMPAIGN_SCHEDULER_FAILED"); } catch (_) {}
    }
  },
);
