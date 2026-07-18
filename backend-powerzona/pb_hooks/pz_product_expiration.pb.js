/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateDateWriteRequest(e, "products");
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "products");
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateDateWriteRequest(e, "products");
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "products");
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateDateWriteRequest(e, "product_variations");
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "product_variations");
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateDateWriteRequest(e, "product_variations");
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "product_variations");

onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateOrderItemRequest(e);
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "order_items");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateOrderItemRequest(e);
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "order_items");

onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateExpirationSettingsRequest(e);
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "settings");
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/pz_product_expiration_lib.js`);
  const safe = lib.validateExpirationSettingsRequest(e);
  if (safe) lib.raiseExpirationRequestError(safe);
  return e.next();
}, "settings");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_product_expiration_lib.js`).continueAfterExpirationSideEffect(e, "products", "change");
}, "products");
onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_product_expiration_lib.js`).continueAfterExpirationSideEffect(e, "products", "change");
}, "products");
onRecordAfterDeleteSuccess((e) => {
  return require(`${__hooks}/pz_product_expiration_lib.js`).continueAfterExpirationSideEffect(e, "products", "delete");
}, "products");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_product_expiration_lib.js`).continueAfterExpirationSideEffect(e, "product_variations", "change");
}, "product_variations");
onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_product_expiration_lib.js`).continueAfterExpirationSideEffect(e, "product_variations", "change");
}, "product_variations");
onRecordAfterDeleteSuccess((e) => {
  return require(`${__hooks}/pz_product_expiration_lib.js`).continueAfterExpirationSideEffect(e, "product_variations", "delete");
}, "product_variations");

routerAdd(
  "POST",
  "/api/pz/admin/product-expirations",
  (e) => require(`${__hooks}/pz_product_expiration_lib.js`).handleAdminExpirationQuery(e),
  (e) => require(`${__hooks}/pz_product_expiration_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(1024),
  $apis.skipSuccessActivityLog()
);

cronAdd(
  "pz_v7e9_product_expiration_alerts",
  "8 * * * *",
  () => require(`${__hooks}/pz_product_expiration_lib.js`).processAllExpirationAlerts($app, new Date())
);
