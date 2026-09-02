/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/storefront/v1/installations/register",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "installations_register"),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v2/installations/register",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "installations_register_core"),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v2/installations/firebase",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "installations_firebase_enrich"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v2/diagnostics",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "diagnostics_batch"),
  $apis.bodyLimit(24576),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v2/notifications/sync",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "notifications_sync"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v2/notifications/ack",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "notifications_ack"),
  $apis.bodyLimit(12288),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v2/realtime/ticket",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "realtime_ticket"),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/installations/heartbeat",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "installations_heartbeat"),
  $apis.bodyLimit(7168),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/installations/permission",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "installations_permission"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);
routerAdd(
  "POST",
  "/api/pz/storefront/v1/installations/disable",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "installations_disable"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/session/bootstrap",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "session_bootstrap"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/session/bootstrap/consume",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "session_consume"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/campaigns/resolve-target",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "campaigns_resolve_target"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/updates/policy",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "updates_policy"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/updates/ticket",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "updates_ticket"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/updates/verified",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "updates_verified"),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "GET",
  "/api/pz/storefront-app-updates/{artifact}/{ticket}/{filename}",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleUpdateDownload(e),
  $apis.bodyLimit(0),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/storefront/v1/events",
  (e) => require(`${__hooks}/pz_storefront_installations_lib.js`).handleAction(e, "events_record"),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

cronAdd(
  "pz_storefront_resilient_installation_cleanup",
  "*/15 * * * *",
  () => {
    try {
      const result = require(`${__hooks}/pz_storefront_installations_lib.js`)
        .cleanupResilientInstallationData($app, new Date());
      if (result.failed > 0) {
        try {
          $app.logger().error(
            "Storefront resilient installation cleanup was partially blocked.",
            "code", "PZ_STOREFRONT_RESILIENT_CLEANUP_PARTIAL",
            "failed", result.failed,
          );
        } catch (_) {}
      }
    } catch (_) {
      try {
        $app.logger().error(
          "Storefront resilient installation cleanup failed safely.",
          "code", "PZ_STOREFRONT_RESILIENT_CLEANUP_FAILED",
        );
      } catch (_) {}
    }
  },
);
