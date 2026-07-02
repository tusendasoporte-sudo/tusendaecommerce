/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    collection.fields.getByName(name);
    return true;
  } catch (_) {
    return false;
  }
}

function addFileField(collection, id, name) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "file",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    protected: false,
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    thumbs: ["600x338", "1200x675"],
  }));
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");
  addFileField(collection, "file1780473401", "landing_qr_hero_image");
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  try { collection.fields.removeById("file1780473401"); } catch (_) {}
  return app.save(collection);
});
