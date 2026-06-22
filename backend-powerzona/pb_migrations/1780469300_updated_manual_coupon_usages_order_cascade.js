/// <reference path="../pb_data/types.d.ts" />


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
