/// <reference path="../pb_data/types.d.ts" />

const APP_SET_FIELD_ID = "text17867520001";
const APP_SET_INDEX = "CREATE UNIQUE INDEX `idx_storefront_installations_app_set` ON `storefront_installations` (`app_config`, `app_set_digest`) WHERE `app_set_digest` != ''";

migrate((app) => {
  const collection = app.findCollectionByNameOrId("storefront_installations");
  let field = null;
  try { field = collection.fields.getByName("app_set_digest"); } catch (_) {}
  if (!field) {
    collection.fields.add(new Field({
      autogeneratePattern: "",
      hidden: true,
      id: APP_SET_FIELD_ID,
      max: 64,
      min: 0,
      name: "app_set_digest",
      pattern: "^[a-f0-9]{64}$",
      presentable: false,
      primaryKey: false,
      required: false,
      system: false,
      type: "text",
    }));
  }
  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  if (!indexes.some((index) => String(index).includes("idx_storefront_installations_app_set"))) {
    collection.indexes = [...indexes, APP_SET_INDEX];
  }
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("storefront_installations");
  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((index) => !String(index).includes("idx_storefront_installations_app_set"));
  let field = null;
  try { field = collection.fields.getByName("app_set_digest"); } catch (_) {}
  if (field) collection.fields.removeById(APP_SET_FIELD_ID);
  app.save(collection);
});
