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
