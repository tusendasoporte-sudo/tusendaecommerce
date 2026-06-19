/// <reference path="../pb_data/types.d.ts" />

// PZ-MIGRATION-FOOTER-EXTRA-LINKS-ACTIVE-20260619
// Agrega switches para mostrar u ocultar los dos botones extra del footer publico.

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function addBoolField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    hidden: false,
    id,
    name,
    presentable: false,
    required: false,
    system: false,
    type: "bool",
    default: defaultValue,
  }));
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  addBoolField(collection, "bool1780471501", "footer_link_1_active", true);
  addBoolField(collection, "bool1780471502", "footer_link_2_active", true);

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  [
    "bool1780471502",
    "bool1780471501",
  ].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });

  return app.save(collection);
});
