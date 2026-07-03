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

function keepAnalyticsRetentionAt30(app) {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  const field = getFieldSafe(settings, "analytics_retention_days");
  if (!field || field.type !== "number") return;

  field.max = 30;
  field.default = 30;
  app.save(settings);
}

migrate((app) => {
  keepAnalyticsRetentionAt30(app);
}, (app) => {
  keepAnalyticsRetentionAt30(app);
});
