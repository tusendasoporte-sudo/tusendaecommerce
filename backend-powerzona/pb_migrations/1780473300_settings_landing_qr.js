/// <reference path="../pb_data/types.d.ts" />


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

function addTextField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
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

function addJsonField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
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

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  addBoolField(collection, "bool1780473301", "landing_qr_enabled", true);
  addTextField(collection, "text1780473302", "landing_qr_title", "");
  addTextField(collection, "text1780473303", "landing_qr_subtitle", "");
  addTextField(collection, "text1780473304", "landing_qr_accent_color", "#2563eb");
  addJsonField(collection, "json1780473305", "landing_qr_links", "[]");

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  [
    "json1780473305",
    "text1780473304",
    "text1780473303",
    "text1780473302",
    "bool1780473301",
  ].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });

  return app.save(collection);
});
