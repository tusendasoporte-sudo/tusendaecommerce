/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    collection.fields.getByName(name);
    return true;
  } catch (_) {
    return false;
  }
}

function getFieldByName(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  const existingField = getFieldByName(collection, "landing_qr_hero_image");

  if (!existingField) {
    collection.fields.add(new FileField({
      id: "file1782869101",
      name: "landing_qr_hero_image",
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

    app.save(collection);
  }

  const verifyCollection = app.findCollectionByNameOrId("settings");
  const verifyField = getFieldByName(verifyCollection, "landing_qr_hero_image");

  if (!verifyField) {
    throw new Error("No se pudo crear el campo landing_qr_hero_image en settings.");
  }

  if (typeof verifyField.type === "function" && verifyField.type() !== "file") {
    throw new Error("El campo landing_qr_hero_image existe, pero no es tipo file.");
  }

  return;
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");

  try {
    const field = collection.fields.getByName("landing_qr_hero_image");
    collection.fields.removeById(field.getId ? field.getId() : "file1782869101");
    return app.save(collection);
  } catch (_) {
    return;
  }
});
