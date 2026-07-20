/// <reference path="../pb_data/types.d.ts" />

const PZ_ACTIVITY_MUTATION_COLLECTIONS = [
  "products", "product_variations", "categories", "subcategories", "orders", "order_items",
  "shipping_methods", "shipping_zones", "automatic_promotions", "manual_coupons", "gifts",
  "raffles", "raffle_entries", "reviews", "store_visual_items", "settings", "currencies",
  "store_security_settings", "store_security_blocks",
];
const PZ_ACTIVITY_STORE_COLLECTIONS = ["stores"];

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).handleRecordMutationRequest(e, "create"),
  ...PZ_ACTIVITY_MUTATION_COLLECTIONS, ...PZ_ACTIVITY_STORE_COLLECTIONS,
);

onRecordUpdateRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).handleRecordMutationRequest(e, "update"),
  ...PZ_ACTIVITY_MUTATION_COLLECTIONS, ...PZ_ACTIVITY_STORE_COLLECTIONS,
);

onRecordDeleteRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).handleRecordMutationRequest(e, "delete"),
  ...PZ_ACTIVITY_MUTATION_COLLECTIONS,
);

onRecordDeleteRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).rejectDirectStoreDeletion(e),
  ...PZ_ACTIVITY_STORE_COLLECTIONS,
);

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).rejectDirectActivityMutation(e),
  "store_activity_audit", "store_activity_reviews",
);
onRecordUpdateRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).rejectDirectActivityMutation(e),
  "store_activity_audit", "store_activity_reviews",
);
onRecordDeleteRequest(
  (e) => require(`${__hooks}/pz_store_activity_audit_lib.js`).rejectDirectActivityMutation(e),
  "store_activity_audit", "store_activity_reviews",
);

routerAdd(
  "POST",
  "/api/pz/store/activity/summary",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleSummary(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/activity/list",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleList(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/activity/detail",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleDetail(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/activity/review",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleReview(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/activity/user-report",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleUserReport(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/activity/self",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleSelf(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/store/activity/last-modified",
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).handleLastModified(e),
  (e) => require(`${__hooks}/pz_store_activity_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(16384),
  $apis.skipSuccessActivityLog(),
);
