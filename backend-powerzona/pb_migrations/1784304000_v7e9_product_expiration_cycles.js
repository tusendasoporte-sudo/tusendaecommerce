/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function fieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function addExpirationSetting(settings) {
  if (!settings || fieldSafe(settings, "notify_expiration_alerts")) return false;
  settings.fields.add(new Field({
    id: "bool1784304001",
    name: "notify_expiration_alerts",
    type: "bool",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    default: true,
  }));
  return true;
}

function addNotificationTypes(notifications) {
  const typeField = fieldSafe(notifications, "type");
  if (!typeField) return false;
  const values = Array.isArray(typeField.values) ? typeField.values.filter(Boolean) : [];
  const required = [
    "product_expiring_soon",
    "product_expiring_critical",
    "product_expired",
    "variation_expiring_soon",
    "variation_expiring_critical",
    "variation_expired",
  ];
  let changed = false;
  required.forEach((value) => {
    if (!values.includes(value)) {
      values.push(value);
      changed = true;
    }
  });
  if (changed) typeField.values = values;
  return changed;
}

function backfillExpirationSetting(app) {
  const limit = 200;
  let offset = 0;
  while (true) {
    let records = [];
    try {
      records = app.findRecordsByFilter("settings", "", "created", limit, offset) || [];
    } catch (_) {
      records = [];
    }
    if (!records.length) break;
    records.forEach((record) => {
      record.set("notify_expiration_alerts", true);
      app.save(record);
    });
    if (records.length < limit) break;
    offset += records.length;
  }
}

function relationField(id, name, collection, required, cascadeDelete) {
  return {
    cascadeDelete: cascadeDelete === true,
    collectionId: collection.id,
    hidden: false,
    id,
    maxSelect: 1,
    minSelect: required ? 1 : 0,
    name,
    presentable: false,
    required,
    system: false,
    type: "relation",
  };
}

function textField(id, name, max, required) {
  return {
    autogeneratePattern: "",
    hidden: false,
    id,
    max,
    min: required ? 1 : 0,
    name,
    pattern: "",
    presentable: false,
    primaryKey: false,
    required,
    system: false,
    type: "text",
  };
}

migrate((app) => {
  const settings = findCollectionSafe(app, "settings");
  const expirationSettingAdded = addExpirationSetting(settings);
  if (expirationSettingAdded) {
    app.save(settings);
    backfillExpirationSetting(app);
  }

  const notifications = findCollectionSafe(app, "store_notifications");
  if (notifications && addNotificationTypes(notifications)) app.save(notifications);

  if (findCollectionSafe(app, "product_expiration_cycles")) return;
  const stores = findCollectionSafe(app, "stores");
  const products = findCollectionSafe(app, "products");
  const variations = findCollectionSafe(app, "product_variations");
  if (!stores || !products || !variations || !notifications) return;

  const cycles = new Collection({
    id: "pbc_1784304000",
    name: "product_expiration_cycles",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        autogeneratePattern: "[a-z0-9]{15}",
        hidden: false,
        id: "text1784304002",
        max: 15,
        min: 15,
        name: "id",
        pattern: "^[a-z0-9]+$",
        presentable: false,
        primaryKey: true,
        required: true,
        system: true,
        type: "text",
      },
      relationField("relation1784304003", "store", stores, true, true),
      relationField("relation1784304004", "product", products, true, true),
      relationField("relation1784304005", "variation", variations, false, true),
      relationField("relation1784304006", "notification", notifications, false, false),
      textField("text1784304007", "entity_collection", 40, true),
      textField("text1784304008", "entity_id", 15, true),
      textField("text1784304009", "expiration_date", 10, true),
      {
        hidden: false,
        id: "number1784304010",
        max: 90,
        min: 0,
        name: "threshold",
        onlyInt: true,
        presentable: false,
        required: true,
        system: false,
        type: "number",
      },
      textField("text1784304011", "cycle_key", 120, true),
      {
        hidden: false,
        id: "autodate1784304012",
        name: "created",
        onCreate: true,
        onUpdate: false,
        presentable: false,
        system: false,
        type: "autodate",
      },
      {
        hidden: false,
        id: "autodate1784304013",
        name: "updated",
        onCreate: true,
        onUpdate: true,
        presentable: false,
        system: false,
        type: "autodate",
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_product_expiration_cycles_key` ON `product_expiration_cycles` (`cycle_key`)",
      "CREATE INDEX `idx_product_expiration_cycles_store_product` ON `product_expiration_cycles` (`store`, `product`)",
      "CREATE INDEX `idx_product_expiration_cycles_notification` ON `product_expiration_cycles` (`notification`)",
    ],
  });
  app.save(cycles);
}, (app) => {
  const cycles = findCollectionSafe(app, "product_expiration_cycles");
  if (cycles) app.delete(cycles);
  const settings = findCollectionSafe(app, "settings");
  if (settings) {
    try {
      settings.fields.removeById("bool1784304001");
      app.save(settings);
    } catch (_) {}
  }
});
