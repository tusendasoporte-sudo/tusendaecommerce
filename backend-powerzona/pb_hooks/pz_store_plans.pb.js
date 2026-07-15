/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_store_plans_lib.js`).handleStoreCreateRequest(e),
  "stores"
);

onRecordCreate(
  (e) => require(`${__hooks}/pz_store_plans_lib.js`).handleStoreCreate(e),
  "stores"
);
