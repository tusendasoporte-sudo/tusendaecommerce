/// <reference path="../pb_data/types.d.ts" />

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  const records = app.findRecordsByFilter(
    "settings",
    "notification_cleanup_days = 60 || notification_cleanup_days = 0 || notification_cleanup_days = null",
    "",
    200,
    0
  );

  records.forEach((record) => {
    record.set("notification_cleanup_days", 15);
    app.save(record);
  });
}, (app) => {
  const settings = findCollectionSafe(app, "settings");
  if (!settings) return;

  const records = app.findRecordsByFilter(
    "settings",
    "notification_cleanup_days = 15",
    "",
    200,
    0
  );

  records.forEach((record) => {
    record.set("notification_cleanup_days", 60);
    app.save(record);
  });
});
