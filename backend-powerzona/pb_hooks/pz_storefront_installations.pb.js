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
