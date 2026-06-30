/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

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

function addNumberField(collection, id, name, defaultValue) {
  if (hasField(collection, name)) return;

  collection.fields.add(new Field({
    id,
    name,
    type: "number",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    min: 0,
    max: null,
    onlyInt: false,
    default: defaultValue,
  }));
}

migrate((app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  addBoolField(settings, "bool1780472201", "notification_priority_enabled", true);
  addNumberField(settings, "number1780472202", "notification_priority_important_min_usd", 50);
  addNumberField(settings, "number1780472203", "notification_priority_critical_min_usd", 100);
  addBoolField(settings, "bool1780472204", "notification_show_order_subtotal", true);
  addBoolField(settings, "bool1780472205", "notification_bell_priority_colors", true);

  app.save(settings);
}, (app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  [
    "bool1780472205",
    "bool1780472204",
    "number1780472203",
    "number1780472202",
    "bool1780472201",
  ].forEach((id) => {
    try {
      settings.fields.removeById(id);
    } catch (_) {}
  });

  app.save(settings);
});
