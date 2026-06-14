/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-21-30-19A-AJUSTES-VISUALES-20260613
// Agrega portada tipo carrusel, tipo de negocio estructurado y direccion estructurada en settings.

function fieldExists(collection, name) {
  try {
    collection.fields.getByName(name);
    return true;
  } catch (_) {
    return false;
  }
}

function addTextField(collection, id, name, defaultValue) {
  if (fieldExists(collection, name)) return;
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
    max: 0,
    pattern: "",
    autogeneratePattern: "",
    default: defaultValue || "",
  }));
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  addTextField(collection, "text1780470701", "cover_mode", "single");
  addTextField(collection, "text1780470702", "province", "");
  addTextField(collection, "text1780470703", "municipality", "");
  addTextField(collection, "text1780470704", "address_detail", "");

  if (!fieldExists(collection, "business_types")) {
    collection.fields.add(new Field({
      id: "json1780470705",
      name: "business_types",
      type: "json",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      maxSize: 0,
      default: "[]",
    }));
  }

  if (!fieldExists(collection, "cover_gallery")) {
    collection.fields.add(new Field({
      id: "file1780470706",
      name: "cover_gallery",
      type: "file",
      system: false,
      required: false,
      hidden: false,
      presentable: false,
      protected: false,
      maxSelect: 4,
      maxSize: 5242880,
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
      thumbs: ["700x260", "1200x420"],
    }));
  }

  addTextField(collection, "text1780470707", "cover_gallery_order", "[]");

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  ["text1780470707", "file1780470706", "json1780470705", "text1780470704", "text1780470703", "text1780470702", "text1780470701"].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });
  return app.save(collection);
});
