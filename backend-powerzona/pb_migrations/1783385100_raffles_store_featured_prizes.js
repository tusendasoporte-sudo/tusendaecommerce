/// <reference path="../pb_data/types.d.ts" />

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const raffles = app.findCollectionByNameOrId("raffles");

  if (!getFieldSafe(raffles, "store_featured_prize_ids")) {
    raffles.fields.add(new Field({
      id: "json1783385101",
      name: "store_featured_prize_ids",
      type: "json",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      maxSize: 0,
      default: "[]",
    }));
  }

  return app.save(raffles);
}, (app) => {
  const raffles = app.findCollectionByNameOrId("raffles");

  try {
    raffles.fields.removeById("json1783385101");
  } catch (_) {}

  return app.save(raffles);
});
