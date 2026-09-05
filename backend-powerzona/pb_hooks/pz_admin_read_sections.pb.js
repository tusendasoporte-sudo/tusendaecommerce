/// <reference path="../pb_data/types.d.ts" />

routerAdd("POST", "/api/pz/admin/read/catalog-detail-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleSectionBootstrap(e, "catalog-detail"),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog());

routerAdd("POST", "/api/pz/admin/read/catalog-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleSectionBootstrap(e, "catalog"),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog());
routerAdd("POST", "/api/pz/admin/read/dashboard-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleSectionBootstrap(e, "dashboard"),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog());
routerAdd("POST", "/api/pz/admin/read/profits-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleSectionBootstrap(e, "profits"),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog());
routerAdd("POST", "/api/pz/admin/read/gifts-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleSectionBootstrap(e, "gifts"),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog());
routerAdd("POST", "/api/pz/admin/read/shipping-bootstrap",
  (e) => require(`${__hooks}/pz_admin_read_lib.js`).handleSectionBootstrap(e, "shipping"),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(), $apis.bodyLimit(1024), $apis.skipSuccessActivityLog());
