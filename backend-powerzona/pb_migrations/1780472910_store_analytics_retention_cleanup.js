/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ANALYTICS_DELETE_RULE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store';

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
    max: 30,
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

migrate((app) => {
  const settings = findCollectionSafe(app, "settings");

  if (settings) {
    addBoolField(settings, "bool1780472911", "analytics_cleanup_enabled", true);
    addNumberField(settings, "number1780472912", "analytics_retention_days", 30);
    addDateField(settings, "date1780472913", "analytics_cleanup_last_run_at");
    addBoolField(settings, "bool1780472914", "analytics_heartbeat_enabled", false);

    app.save(settings);
  }

  const analytics = findCollectionSafe(app, "store_analytics_events");

  if (analytics) {
    analytics.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ANALYTICS_DELETE_RULE})`;

    const indexes = Array.isArray(analytics.indexes) ? analytics.indexes : [];
    const cleanupIndex = "CREATE INDEX `idx_store_analytics_cleanup_store_created` ON `store_analytics_events` (`store`, `created`)";

    const hasCleanupIndex = indexes.some((index) => {
      const value = String(index || "");
      const normalized = value.replace(/\s+/g, " ").toLowerCase();
      return value.includes("idx_store_analytics_cleanup_store_created")
        || (
          normalized.includes("on `store_analytics_events`")
          && normalized.includes("(`store`, `created`)")
        );
    });

    if (!hasCleanupIndex) {
      analytics.indexes = [...indexes, cleanupIndex];
    }

    app.save(analytics);
  }
}, (app) => {
  const settings = findCollectionSafe(app, "settings");

  if (settings) {
    [
      "bool1780472914",
      "date1780472913",
      "number1780472912",
      "bool1780472911",
    ].forEach((id) => {
      try {
        settings.fields.removeById(id);
      } catch (_) {}
    });

    app.save(settings);
  }

  const analytics = findCollectionSafe(app, "store_analytics_events");

  if (analytics) {
    analytics.deleteRule = MASTER_ADMIN_RULE;
    analytics.indexes = (Array.isArray(analytics.indexes) ? analytics.indexes : [])
      .filter((index) => {
        const value = String(index || "");
        return !value.includes("idx_store_analytics_cleanup_store_created");
      });

    app.save(analytics);
  }
});
