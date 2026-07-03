/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function getFieldSafe(collection, name) {
  try {
    return collection.fields.getByName(name);
  } catch (_) {
    return null;
  }
}

function getFieldType(field) {
  if (!field) return "";
  if (typeof field.type === "function") return field.type();
  return String(field.type || "");
}

function ensureSelectValue(collection, fieldName, value) {
  const field = getFieldSafe(collection, fieldName);
  if (!field) {
    throw new Error(`No existe el campo ${fieldName} en store_analytics_events.`);
  }

  const type = getFieldType(field);
  if (type && type !== "select") {
    throw new Error(`El campo ${fieldName} existe, pero no es select.`);
  }

  const values = Array.isArray(field.values) ? field.values : [];
  if (!values.includes(value)) {
    field.values = [...values, value];
  }
}

function ensureEventTypeValue(collection, value) {
  const field = getFieldSafe(collection, "event_type");
  if (!field) return;

  const type = getFieldType(field);
  if (type !== "select") return;

  const values = Array.isArray(field.values) ? field.values : [];
  if (!values.includes(value)) {
    field.values = [...values, value];
  }
}

function hasField(collection, name) {
  return !!getFieldSafe(collection, name);
}

function addTextField(collection, id, name, max) {
  if (hasField(collection, name)) return;

  collection.fields.add(new Field({
    id,
    name,
    type: "text",
    system: false,
    required: false,
    hidden: false,
    presentable: false,
    autogeneratePattern: "",
    pattern: "",
    min: 0,
    max,
    primaryKey: false,
  }));
}

function ensureIndex(collection, indexName, indexSql) {
  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  if (indexes.some((index) => String(index || "").includes(indexName))) return;
  collection.indexes = [...indexes, indexSql];
}

migrate((app) => {
  const analytics = findCollectionSafe(app, "store_analytics_events");

  if (!analytics) {
    throw new Error("No existe la coleccion store_analytics_events.");
  }

  ensureSelectValue(analytics, "page_type", "landing_qr");
  ensureEventTypeValue(analytics, "landing_qr_view");
  ensureEventTypeValue(analytics, "landing_qr_click");

  addTextField(analytics, "text1782869401", "link_id", 80);
  addTextField(analytics, "text1782869402", "link_type", 40);
  addTextField(analytics, "text1782869403", "link_icon", 40);
  addTextField(analytics, "text1782869404", "link_label", 100);
  addTextField(analytics, "text1782869405", "link_url", 240);

  ensureIndex(
    analytics,
    "idx_store_analytics_landing_qr_type_day",
    "CREATE INDEX `idx_store_analytics_landing_qr_type_day_repair` ON `store_analytics_events` (`store`, `event_type`, `day`)"
  );
  ensureIndex(
    analytics,
    "idx_store_analytics_landing_qr_link_created",
    "CREATE INDEX `idx_store_analytics_landing_qr_link_created_repair` ON `store_analytics_events` (`store`, `link_id`, `created`)"
  );

  app.save(analytics);

  const verifyCollection = app.findCollectionByNameOrId("store_analytics_events");
  const verifyPageType = getFieldSafe(verifyCollection, "page_type");
  const verifyValues = Array.isArray(verifyPageType?.values) ? verifyPageType.values : [];

  if (!verifyValues.includes("landing_qr")) {
    throw new Error("No se pudo agregar landing_qr a store_analytics_events.page_type.");
  }

  ["link_id", "link_type", "link_icon", "link_label", "link_url"].forEach((name) => {
    if (!hasField(verifyCollection, name)) {
      throw new Error(`No se pudo crear el campo ${name} en store_analytics_events.`);
    }
  });
}, (app) => {
  const analytics = findCollectionSafe(app, "store_analytics_events");
  if (!analytics) return;

  const pageType = getFieldSafe(analytics, "page_type");
  if (pageType && Array.isArray(pageType.values)) {
    pageType.values = pageType.values.filter((item) => item !== "landing_qr");
  }

  [
    "text1782869405",
    "text1782869404",
    "text1782869403",
    "text1782869402",
    "text1782869401",
  ].forEach((id) => {
    try {
      analytics.fields.removeById(id);
    } catch (_) {}
  });

  analytics.indexes = (Array.isArray(analytics.indexes) ? analytics.indexes : [])
    .filter((index) => {
      const value = String(index || "");
      return !value.includes("idx_store_analytics_landing_qr_type_day_repair")
        && !value.includes("idx_store_analytics_landing_qr_link_created_repair");
    });

  app.save(analytics);
});
