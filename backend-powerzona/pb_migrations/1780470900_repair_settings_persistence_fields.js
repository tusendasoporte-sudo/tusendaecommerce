/// <reference path="../pb_data/types.d.ts" />


const DEFAULT_BUSINESS_HOURS = {
  monday: { enabled: false, open: "09:00", close: "18:00" },
  tuesday: { enabled: false, open: "09:00", close: "18:00" },
  wednesday: { enabled: false, open: "09:00", close: "18:00" },
  thursday: { enabled: false, open: "09:00", close: "18:00" },
  friday: { enabled: false, open: "09:00", close: "18:00" },
  saturday: { enabled: false, open: "09:00", close: "18:00" },
  sunday: { enabled: false, open: "09:00", close: "18:00" },
};

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
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

function addBoolField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;
  collection.fields.add(new Field({
    id,
    name,
    type: "bool",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    default: defaultValue,
  }));
}

function addCoverFileField(collection, id, name, maxSelect) {
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
    maxSelect,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    thumbs: ["700x260", "1200x420"],
  }));
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("settings");

  addTextField(collection, "text1780470901", "cover_mode", "single");
  addCoverFileField(collection, "file1780470902", "cover_image_1", 1);
  addCoverFileField(collection, "file1780470903", "cover_image_2", 1);
  addCoverFileField(collection, "file1780470904", "cover_image_3", 1);
  addCoverFileField(collection, "file1780470905", "cover_image_4", 1);
  addCoverFileField(collection, "file1780470906", "cover_gallery", 4);
  addTextField(collection, "text1780470907", "cover_gallery_order", "[]");

  addTextField(collection, "text1780470908", "province", "");
  addTextField(collection, "text1780470909", "municipality", "");
  addTextField(collection, "text1780470910", "address_detail", "");
  addJsonField(collection, "json1780470911", "business_types", "[]");

  addTextField(collection, "text1780470912", "business_hours_mode", "always_available");
  addJsonField(collection, "json1780470913", "business_hours", JSON.stringify(DEFAULT_BUSINESS_HOURS));
  addTextField(collection, "text1780470914", "closed_message", "Estamos fuera de horario, pero puedes realizar tu pedido. Lo atenderemos en horario laboral.");
  addTextField(collection, "text1780470915", "temporarily_closed_message", "Estamos cerrados temporalmente. Puedes realizar tu pedido y te responderemos pronto.");
  addBoolField(collection, "bool1780470916", "allow_orders_when_closed", true);

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("settings");
  [
    "bool1780470916",
    "text1780470915",
    "text1780470914",
    "json1780470913",
    "text1780470912",
    "json1780470911",
    "text1780470910",
    "text1780470909",
    "text1780470908",
    "text1780470907",
    "file1780470906",
    "file1780470905",
    "file1780470904",
    "file1780470903",
    "file1780470902",
    "text1780470901",
  ].forEach((id) => {
    try { collection.fields.removeById(id); } catch (_) {}
  });
  return app.save(collection);
});
