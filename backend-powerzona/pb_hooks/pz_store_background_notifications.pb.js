/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueInventoryChanged(e, "products", "create");
}, "products");

onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueInventoryChanged(e, "products", "update");
}, "products");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueInventoryChanged(e, "product_variations", "create");
}, "product_variations");

onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueInventoryChanged(e, "product_variations", "update");
}, "product_variations");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueSettingsChanged(e, "create");
}, "settings");

onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueSettingsChanged(e, "update");
}, "settings");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueReviewCreated(e);
}, "reviews");

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueRaffleChanged(e);
}, "raffles");

onRecordAfterUpdateSuccess((e) => {
  return require(`${__hooks}/pz_store_background_notifications_lib.js`).continueRaffleChanged(e);
}, "raffles");

cronAdd(
  "pz_store_background_notifications",
  "*/5 * * * *",
  () => require(`${__hooks}/pz_store_background_notifications_lib.js`).processAllTimedNotifications($app, new Date())
);
