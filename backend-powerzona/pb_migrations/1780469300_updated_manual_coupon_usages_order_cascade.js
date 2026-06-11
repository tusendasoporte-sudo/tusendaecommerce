/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-21-30-8A-MANUAL-COUPON-USAGES-ORDER-CASCADE-20260610
// Allows administrative order cleanup when an order has an applied manual coupon.

migrate((app) => {
  const collection = app.findCollectionByNameOrId("manual_coupon_usages");
  const orderField = collection.fields.getByName("order");

  orderField.cascadeDelete = true;

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("manual_coupon_usages");
  const orderField = collection.fields.getByName("order");

  orderField.cascadeDelete = false;

  return app.save(collection);
});
