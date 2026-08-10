/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/master/stores/create",
  (e) => require(`${__hooks}/pz_master_store_creation_lib.js`).handleCreate(e),
  (e) => require(`${__hooks}/pz_master_store_creation_lib.js`).requireAuthenticatedUser(e),
  $apis.requireAuth(),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog()
);

onRecordUpdateRequest(
  (e) => require(`${__hooks}/pz_master_store_creation_lib.js`).enforceFixedCurrencyUpdate(e),
  "currencies"
);

onRecordCreateRequest(
  (e) => require(`${__hooks}/pz_master_store_creation_lib.js`).rejectDuplicateFixedCurrencyCreate(e),
  "currencies"
);

onRecordDeleteRequest(
  (e) => require(`${__hooks}/pz_master_store_creation_lib.js`).rejectFixedCurrencyDelete(e),
  "currencies"
);
