/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/store/access/context",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleAccessContext(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/summary",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleSummary(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/list",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/detail",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/create",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleCreate(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(16384),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/update",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleUpdate(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(16384),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/suspend",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleSuspend(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/reactivate",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleReactivate(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/issue-temporary-access",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleIssueTemporaryAccess(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/revoke-sessions",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleRevokeSessions(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/revoke-devices",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleRevokeDevices(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/delete",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleDelete(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/team/audit",
  (e) => require(`${__hooks}/pz_store_team_lib.js`).handleAudit(e),
  (e) => require(`${__hooks}/pz_store_team_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

onRecordAuthWithPasswordRequest((e) => {
  require(`${__hooks}/pz_store_team_lib.js`).rejectBlockedByPlanAuthentication(e);
  return e.next();
}, "users");

onRecordAuthRefreshRequest((e) => {
  require(`${__hooks}/pz_store_team_lib.js`).rejectBlockedByPlanAuthentication(e);
  return e.next();
}, "users");
