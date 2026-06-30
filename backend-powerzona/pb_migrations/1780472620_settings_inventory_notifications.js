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

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function setFieldDefault(collection, name, defaultValue) {
  const field = getFieldSafe(collection, name);
  if (!field) return;
  field.default = defaultValue;
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
    onlyInt: true,
    default: defaultValue,
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

      if (record.get("notify_product_expiring") !== true) {
        record.set("notify_product_expiring", true);
        changed = true;
      }

      if (record.get("notify_product_expired") !== true) {
        record.set("notify_product_expired", true);
        changed = true;
      }

      if (record.get("notify_variation_expiration") !== true) {
        record.set("notify_variation_expiration", true);
        changed = true;
      }

      if (!Number(record.get("product_expiring_days_before"))) {
        record.set("product_expiring_days_before", 30);
        changed = true;
      }

      if (record.get("product_expiring_critical_days") === null || record.get("product_expiring_critical_days") === undefined) {
        record.set("product_expiring_critical_days", 7);
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

  addBoolField(settings, "bool1780472621", "notify_product_expiring", true);
  addNumberField(settings, "number1780472622", "product_expiring_days_before", 30);
  addNumberField(settings, "number1780472623", "product_expiring_critical_days", 7);
  addBoolField(settings, "bool1780472624", "notify_product_expired", true);
  addBoolField(settings, "bool1780472625", "notify_variation_expiration", true);
  addBoolField(settings, "bool1780472626", "notify_low_stock", true);
  addNumberField(settings, "number1780472627", "low_stock_threshold", 3);
  addBoolField(settings, "bool1780472628", "notify_out_of_stock", true);

  setFieldDefault(settings, "notify_product_expiring", true);
  setFieldDefault(settings, "product_expiring_days_before", 30);
  setFieldDefault(settings, "product_expiring_critical_days", 7);
  setFieldDefault(settings, "notify_product_expired", true);
  setFieldDefault(settings, "notify_variation_expiration", true);
  setFieldDefault(settings, "notify_low_stock", true);
  setFieldDefault(settings, "low_stock_threshold", 3);
  setFieldDefault(settings, "notify_out_of_stock", true);

  app.save(settings);
  backfillExistingSettings(app);
}, (app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  [
    "bool1780472628",
    "number1780472627",
    "bool1780472626",
    "bool1780472625",
    "bool1780472624",
    "number1780472623",
    "number1780472622",
    "bool1780472621",
  ].forEach((id) => {
    try {
      settings.fields.removeById(id);
    } catch (_) {}
  });

  app.save(settings);
});
