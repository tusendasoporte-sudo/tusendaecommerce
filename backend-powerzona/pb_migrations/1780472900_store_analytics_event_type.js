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

migrate((app) => {
  const collection = findCollectionSafe(app, "store_analytics_events");
  if (!collection) return;

  if (!hasField(collection, "event_type")) {
    collection.fields.add(new Field({
      id: "select1780472901",
      name: "event_type",
      type: "select",
      system: false,
      required: false,
      hidden: false,
      presentable: true,
      maxSelect: 1,
      values: ["pageview", "heartbeat"],
    }));
  }

  const indexes = Array.isArray(collection.indexes) ? collection.indexes : [];
  const eventTypeIndex = "CREATE INDEX `idx_store_analytics_store_event_type_created` ON `store_analytics_events` (`store`, `event_type`, `created`)";
  if (!indexes.includes(eventTypeIndex)) {
    collection.indexes = [...indexes, eventTypeIndex];
  }

  app.save(collection);
}, (app) => {
  const collection = findCollectionSafe(app, "store_analytics_events");
  if (!collection) return;

  try {
    collection.fields.removeById("select1780472901");
  } catch (_) {}

  collection.indexes = (Array.isArray(collection.indexes) ? collection.indexes : [])
    .filter((index) => !String(index).includes("idx_store_analytics_store_event_type_created"));

  app.save(collection);
});
