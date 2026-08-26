/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("promo_site_entitlements");
  const field = collection.fields.getByName("max_gallery_assets");
  field.max = 150;
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("promo_site_entitlements");
  const field = collection.fields.getByName("max_gallery_assets");
  field.max = 24;
  app.save(collection);
});
