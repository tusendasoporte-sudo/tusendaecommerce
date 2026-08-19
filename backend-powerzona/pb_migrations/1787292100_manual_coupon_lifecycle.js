/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const coupons = app.findCollectionByNameOrId("manual_coupons");
  const code = coupons.fields.getByName("code");
  code.min = 2;
  code.max = 8;
  code.pattern = "^[\\x20-\\x7E]{2,8}$";
  app.save(coupons);

  const usages = app.findCollectionByNameOrId("manual_coupon_usages");
  const coupon = usages.fields.getByName("coupon");
  coupon.required = false;
  coupon.minSelect = 0;
  coupon.cascadeDelete = false;
  app.save(usages);
}, (app) => {
  const coupons = app.findCollectionByNameOrId("manual_coupons");
  const code = coupons.fields.getByName("code");
  code.min = 2;
  code.max = 40;
  code.pattern = "^[A-Za-z0-9_-]+$";
  app.save(coupons);

  const usages = app.findCollectionByNameOrId("manual_coupon_usages");
  const coupon = usages.fields.getByName("coupon");
  coupon.required = true;
  coupon.minSelect = 1;
  coupon.cascadeDelete = false;
  app.save(usages);
});
