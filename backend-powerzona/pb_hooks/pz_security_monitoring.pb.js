/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/security/track-navigation",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleTrackNavigation(e),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/resolve-ips",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleResolveIps(e),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/activity-page",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleSecurityActivityPage(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/visitors-page",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleSecurityVisitorsPage(e),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/visitor-detail",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleSecurityVisitorDetail(e),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/customer-detail",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleCustomerDetail(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/monitoring-summary",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleMonitoringSummary(e),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/customer-lifecycle",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleCustomerLifecycle(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/customer-observation",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleCustomerObservation(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/block-action",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleSecurityBlockAction(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/blocks-page",
  (e) => require(`${__hooks}/pz_security_monitoring_lib.js`).handleSecurityBlocksPage(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

cronAdd(
  "pz_security_visitor_retention",
  "17 4 * * *",
  () => require(`${__hooks}/pz_security_monitoring_lib.js`).handleVisitorRetentionCleanup()
);

cronAdd(
  "pz_security_blocks_expiry",
  "13 * * * *",
  () => require(`${__hooks}/pz_security_monitoring_lib.js`).handleSecurityBlocksExpiry()
);
