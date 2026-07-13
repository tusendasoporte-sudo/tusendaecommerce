/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/security/register-order",
  (e) => require(`${__hooks}/pz_security_identity_lib.js`).handleRegisterOrder(e),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/backfill-customers",
  (e) => require(`${__hooks}/pz_security_identity_lib.js`).handleBackfill(e),
  $apis.requireSuperuserAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/backfill-customer-identity",
  (e) => require(`${__hooks}/pz_security_identity_lib.js`).handleBackfill(e),
  $apis.requireSuperuserAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/customers-page",
  (e) => require(`${__hooks}/pz_security_identity_lib.js`).handleCustomersPage(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  "POST",
  "/api/pz/security/merge-customers",
  (e) => require(`${__hooks}/pz_security_identity_lib.js`).handleMergeCustomers(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

onRecordAfterUpdateSuccess(
  (e) => {
    try {
      require(`${__hooks}/pz_security_identity_lib.js`).handleOrderUpdate(e);
    } catch (_) {
      try {
        $app.logger().error("PowerZona security identity hook continued safely.", "code", "PZ_SEC_ORDER_UPDATE_HOOK_FAILED");
      } catch (_) {}
    }
    return e.next();
  },
  "orders"
);

onRecordAfterDeleteSuccess(
  (e) => {
    try {
      require(`${__hooks}/pz_security_identity_lib.js`).handleOrderDelete(e);
    } catch (_) {
      try {
        $app.logger().error("PowerZona security identity hook continued safely.", "code", "PZ_SEC_ORDER_DELETE_HOOK_FAILED");
      } catch (_) {}
    }
    return e.next();
  },
  "orders"
);
