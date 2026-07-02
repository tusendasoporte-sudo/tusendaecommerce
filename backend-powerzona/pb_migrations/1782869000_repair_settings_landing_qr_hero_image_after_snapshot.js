/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    collection.fields.getByName(name);
    return true;
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  if (!hasField(collection, "landing_qr_hero_image")) {
    collection.fields.add(new Field({
      id: "file1782869001",
      name: "landing_qr_hero_image",
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

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  try {
    collection.fields.removeById("file1782869001");
  } catch (_) {}
  return app.save(collection);
});
