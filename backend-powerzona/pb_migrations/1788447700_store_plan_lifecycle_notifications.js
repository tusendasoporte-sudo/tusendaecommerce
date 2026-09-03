/// <reference path="../pb_data/types.d.ts" />

const STORE_PLAN_NOTIFICATION_TYPES = [
  "plan_expiring_soon",
  "plan_expiring_critical",
  "plan_grace_period",
  "plan_expired",
];

function notificationTypeField(app) {
  try {
    return app.findCollectionByNameOrId("store_notifications").fields.getByName("type");
  } catch (_) {
    return null;
  }
}

function normalizedValues(field) {
  return Array.isArray(field && field.values) ? field.values.filter(Boolean) : [];
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("store_notifications");
  const field = notificationTypeField(app);
  if (!field) return;
  const values = normalizedValues(field);
  STORE_PLAN_NOTIFICATION_TYPES.forEach((type) => {
    if (!values.includes(type)) values.push(type);
  });
  field.values = values;
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("store_notifications");
  const field = notificationTypeField(app);
  if (!field) return;
  field.values = normalizedValues(field).filter(
    (type) => !STORE_PLAN_NOTIFICATION_TYPES.includes(type),
  );
  app.save(collection);
});
