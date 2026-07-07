/// <reference path="../pb_data/types.d.ts" />

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addJsonField(collection, id, name, defaultValue) {
  if (getFieldSafe(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "json",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    maxSize: 0,
    default: defaultValue,
  }));
}

function addPrizeDisplayModeField(collection) {
  if (getFieldSafe(collection, "prizes_display_mode")) return;
  collection.fields.add(new Field({
    id: "select1783384302",
    name: "prizes_display_mode",
    type: "select",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    maxSelect: 1,
    values: ["fixed", "carousel"],
  }));
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("raffles");
  addJsonField(collection, "json1783384301", "prizes_json", "[]");
  addPrizeDisplayModeField(collection);

  const imagesField = getFieldSafe(collection, "images");
  if (imagesField && Number(imagesField.maxSelect || 0) < 12) {
    imagesField.maxSelect = 12;
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("raffles");
  ["select1783384302", "json1783384301"].forEach((id) => {
    try {
      collection.fields.removeById(id);
    } catch (_) {
    }
  });

  return app.save(collection);
});
