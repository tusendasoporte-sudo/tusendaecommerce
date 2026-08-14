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

[
  ["/api/pz/storefront/v1/campaigns/save", "handleSave", 16384],
  ["/api/pz/storefront/v1/campaigns/audience-preview", "handleAudiencePreview", 2048],
  ["/api/pz/storefront/v1/campaigns/schedule", "handleSchedule", 4096],
  ["/api/pz/storefront/v1/campaigns/cancel", "handleCancel", 2048],
  ["/api/pz/storefront/v1/campaigns/duplicate", "handleDuplicate", 2048],
].forEach(([path, handler, bodyLimit]) => {
  routerAdd(
    "POST",
    path,
    (e) => require(`${__hooks}/pz_storefront_campaigns_lib.js`)[handler](e),
    campaignAuth,
    $apis.requireAuth("users"),
    $apis.bodyLimit(bodyLimit),
    $apis.skipSuccessActivityLog(),
  );
});

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
