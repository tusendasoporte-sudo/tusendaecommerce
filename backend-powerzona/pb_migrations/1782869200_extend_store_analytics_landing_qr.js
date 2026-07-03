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

function addSelectValue(collection, fieldName, value) {
  const field = getFieldSafe(collection, fieldName);
  if (!field || field.type !== "select") return;

  const values = Array.isArray(field.values) ? field.values : [];
  if (values.includes(value)) return;

  field.values = [...values, value];
}

function removeSelectValue(collection, fieldName, value) {
  const field = getFieldSafe(collection, fieldName);
  if (!field || field.type !== "select") return;

  field.values = (Array.isArray(field.values) ? field.values : [])
    .filter((item) => item !== value);
}

function addIndex(collection, index) {
  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  if (indexes.includes(index)) return;
  collection.indexes = [...indexes, index];
}

function removeIndex(collection, name) {
  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((index) => !String(index || "").includes(name));
}

migrate((app) => {
  const analytics = findCollectionSafe(app, "store_analytics_events");

  if (analytics) {
    addSelectValue(analytics, "page_type", "landing_qr");
    addSelectValue(analytics, "event_type", "landing_qr_view");
    addSelectValue(analytics, "event_type", "landing_qr_click");

    addTextField(analytics, "text1782869201", "link_id", 80);
    addTextField(analytics, "text1782869202", "link_type", 40);
    addTextField(analytics, "text1782869203", "link_icon", 40);
    addTextField(analytics, "text1782869204", "link_label", 100);
    addTextField(analytics, "text1782869205", "link_url", 240);

    addIndex(analytics, "CREATE INDEX `idx_store_analytics_landing_qr_type_day` ON `store_analytics_events` (`store`, `event_type`, `day`)");
    addIndex(analytics, "CREATE INDEX `idx_store_analytics_landing_qr_link_created` ON `store_analytics_events` (`store`, `link_id`, `created`)");

    app.save(analytics);
  }

}, (app) => {
  const analytics = findCollectionSafe(app, "store_analytics_events");

  if (analytics) {
    [
      "text1782869205",
      "text1782869204",
      "text1782869203",
      "text1782869202",
      "text1782869201",
    ].forEach((id) => {
      try {
        analytics.fields.removeById(id);
      } catch (_) {}
    });

    removeSelectValue(analytics, "event_type", "landing_qr_click");
    removeSelectValue(analytics, "event_type", "landing_qr_view");
    removeSelectValue(analytics, "page_type", "landing_qr");
    removeIndex(analytics, "idx_store_analytics_landing_qr_type_day");
    removeIndex(analytics, "idx_store_analytics_landing_qr_link_created");

    app.save(analytics);
  }
});
