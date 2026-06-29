/// <reference path="../pb_data/types.d.ts" />

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

migrate((app) => {
  const collection = app.findCollectionByNameOrId("store_analytics_events");

  if (!hasField(collection, "event_type")) {
    collection.fields.add(new Field({
      "autogeneratePattern": "",
      "hidden": false,
      "id": "text1780471801",
      "max": 40,
      "min": 0,
      "name": "event_type",
      "pattern": "",
      "presentable": true,
      "primaryKey": false,
      "required": false,
      "system": false,
      "type": "text"
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("store_analytics_events");

  try { collection.fields.removeById("text1780471801"); } catch (_) {}

  return app.save(collection);
});
