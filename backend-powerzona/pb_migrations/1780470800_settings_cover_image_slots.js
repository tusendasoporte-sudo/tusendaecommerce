/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-21-30-19C-COVER-SLOTS-20260613
// Agrega campos por slot para el carrusel de portada sin eliminar cover_image ni cover_gallery.

function fieldExists(collection, name) {
  try {
    collection.fields.getByName(name);
    return true;
  } catch (_) {
    return false;
  }
}

function addCoverSlotField(collection, id, name) {
  if (fieldExists(collection, name)) return;
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
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    thumbs: ["700x260", "1200x420"],
  }));
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  addCoverSlotField(collection, "file1780470801", "cover_image_1");
  addCoverSlotField(collection, "file1780470802", "cover_image_2");
  addCoverSlotField(collection, "file1780470803", "cover_image_3");
  addCoverSlotField(collection, "file1780470804", "cover_image_4");

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  ["file1780470804", "file1780470803", "file1780470802", "file1780470801"].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });
  return app.save(collection);
});
