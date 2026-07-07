/// <reference path="../pb_data/types.d.ts" />

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addTextField(collection, id, name, max) {
  if (getFieldSafe(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "text",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    primaryKey: false,
    min: 0,
    max,
    pattern: "",
    autogeneratePattern: "",
  }));
}

migrate((app) => {
  const raffles = app.findCollectionByNameOrId("raffles");
  addTextField(raffles, "text1783384901", "winner_message", 1800);
  app.save(raffles);
}, (app) => {
  const raffles = app.findCollectionByNameOrId("raffles");
  try { raffles.fields.removeById("text1783384901"); } catch (_) {}
  app.save(raffles);
});
