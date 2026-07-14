/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/notifications-feed",
  (e) => require(`${__hooks}/pz_master_notifications_lib.js`).handleNotificationsFeed(e),
  (e) => require(`${__hooks}/pz_master_notifications_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/notifications-page",
  (e) => require(`${__hooks}/pz_master_notifications_lib.js`).handleNotificationsPage(e),
  (e) => require(`${__hooks}/pz_master_notifications_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/master/notification-action",
  (e) => require(`${__hooks}/pz_master_notifications_lib.js`).handleNotificationAction(e),
  (e) => require(`${__hooks}/pz_master_notifications_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

cronAdd(
  "pz_master_notifications_retention",
  "37 4 * * *",
  () => require(`${__hooks}/pz_master_notifications_lib.js`).handleRetentionCleanup()
);
