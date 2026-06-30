/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function addTextField(collection, id, name, max = 0) {
  if (hasField(collection, name)) return;

  collection.fields.add(new Field({
    id,
    name,
    type: "text",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    min: 0,
    max,
    pattern: "",
    autogeneratePattern: "",
    primaryKey: false,
  }));
}

migrate((app) => {
  const collection = findCollectionSafe(app, "order_items");
  if (!collection) return;

  addTextField(collection, "text1780472801", "item_image_url", 0);
  addTextField(collection, "text1780472802", "item_image_alt", 180);

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "order_items");
  if (!collection) return;

  ["text1780472802", "text1780472801"].forEach((id) => {
    try {
      collection.fields.removeById(id);
    } catch (_) {}
  });

  app.save(collection);
});
