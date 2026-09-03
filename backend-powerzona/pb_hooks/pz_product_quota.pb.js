/// <reference path="../pb_data/types.d.ts" />

onRecordCreate(
  (e) => require(`${__hooks}/pz_product_quota_lib.js`).handleProductCreate(e),
  "products",
);

onRecordUpdate(
  (e) => require(`${__hooks}/pz_product_quota_lib.js`).handleProductUpdate(e),
  "products",
);
