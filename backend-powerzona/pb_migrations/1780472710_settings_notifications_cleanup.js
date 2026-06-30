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
    min: 1,
    max: 365,
    onlyInt: true,
    default: defaultValue,
  }));
}

function addDateField(collection, id, name) {
  if (hasField(collection, name)) return;

  collection.fields.add(new Field({
    id,
    name,
    type: "date",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    min: "",
    max: "",
  }));
}

function backfillExistingSettings(app) {
  const limit = 200;
  let offset = 0;

  while (true) {
    let records = [];
    try {
      records = app.findRecordsByFilter("settings", "", "created", limit, offset);
    } catch (_) {
      records = [];
    }

    if (!records.length) break;

    records.forEach((record) => {
      let changed = false;

      if (record.get("notification_cleanup_enabled") !== true) {
        record.set("notification_cleanup_enabled", true);
        changed = true;
      }

      if (!Number(record.get("notification_cleanup_days"))) {
        record.set("notification_cleanup_days", 60);
        changed = true;
      }

      if (changed) app.save(record);
    });

    if (records.length < limit) break;
    offset += records.length;
  }
}

migrate((app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  addBoolField(settings, "bool1780472711", "notification_cleanup_enabled", true);
  addNumberField(settings, "number1780472712", "notification_cleanup_days", 60);
  addDateField(settings, "date1780472713", "notification_cleanup_last_run_at");

  app.save(settings);
  backfillExistingSettings(app);
}, (app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  [
    "date1780472713",
    "number1780472712",
    "bool1780472711",
  ].forEach((id) => {
    try {
      settings.fields.removeById(id);
    } catch (_) {}
  });

  app.save(settings);
});
