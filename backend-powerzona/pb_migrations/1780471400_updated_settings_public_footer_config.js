/// <reference path="../pb_data/types.d.ts" />


function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
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

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  addJsonField(collection, "json1780471401", "footer_social_links", JSON.stringify({
    instagram: "",
    facebook: "",
    tiktok: "",
    youtube: "",
    whatsapp: "",
  }));
  addJsonField(collection, "json1780471402", "footer_trust_items", "[]");
  addTextField(collection, "text1780471403", "shipping_delivery_info", "");

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  [
    "text1780471403",
    "json1780471402",
    "json1780471401",
  ].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });
  return app.save(collection);
});
