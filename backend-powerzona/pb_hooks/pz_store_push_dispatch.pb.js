/// <reference path="../pb_data/types.d.ts" />

onRecordAfterCreateSuccess((e) => {
  return require(`${__hooks}/pz_store_push_dispatch_lib.js`).continueNotificationCreated(e);
}, "store_notifications");
