/// <reference path="../pb_data/types.d.ts" />

const STRICT_NETWORK_EVENT_TYPES = ["hosting_blocked", "abusive_ip_detected", "abusive_ip_blocked"];
const STRICT_CACHE_FIELDS = [
  ["bool1786356001", "hosting_consensus", "bool"],
  ["number1786356002", "provider_confidence", "number", 100],
  ["bool1786356003", "abuse_available", "bool"],
  ["number1786356004", "abuse_score", "number", 100],
  ["number1786356005", "abuse_total_reports", "number", 1000000000],
  ["number1786356006", "abuse_distinct_users", "number", 1000000000],
  ["date1786356007", "abuse_last_reported_at", "date"],
  ["bool1786356008", "abuse_block_candidate", "bool"],
  ["text1786356009", "classifier_version", "text"],
];

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function hasField(collection, name) {
  try { return !!collection.fields.getByName(name); } catch (_) { return false; }
}

function addSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  const current = Array.isArray(field.values) ? field.values : [];
  const next = current.slice();
  values.forEach((value) => { if (!next.includes(value)) next.push(value); });
  field.values = next;
}

function removeSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  const current = Array.isArray(field.values) ? field.values : [];
  field.values = current.filter((value) => !values.includes(value));
}

function addStrictCacheFields(cache) {
  STRICT_CACHE_FIELDS.forEach(([id, name, type, maximum]) => {
    if (hasField(cache, name)) return;
    if (type === "bool") {
      cache.fields.add(new Field({
        "default": false, "hidden": false, "id": id, "name": name,
        "presentable": false, "required": false, "system": false, "type": "bool"
      }));
      return;
    }
    if (type === "number") {
      cache.fields.add(new Field({
        "hidden": false, "id": id, "max": maximum, "min": 0, "name": name,
        "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number"
      }));
      return;
    }
    if (type === "date") {
      cache.fields.add(new Field({
        "hidden": false, "id": id, "max": "", "min": "", "name": name,
        "presentable": false, "required": false, "system": false, "type": "date"
      }));
      return;
    }
    cache.fields.add(new Field({
      "autogeneratePattern": "", "hidden": false, "id": id, "max": 40, "min": 0,
      "name": name, "pattern": "^[A-Za-z0-9._:-]*$", "presentable": false,
      "primaryKey": false, "required": false, "system": false, "type": "text"
    }));
  });
  addSelectValues(cache, "verdict", ["abusive_ip"]);
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("store_security_events");
  addSelectValues(events, "event_type", STRICT_NETWORK_EVENT_TYPES);
  app.save(events);

  const cache = app.findCollectionByNameOrId("store_security_ip_reputation_cache");
  addStrictCacheFields(cache);
  app.save(cache);
}, (app) => {
  const events = findCollectionSafe(app, "store_security_events");
  if (events) {
    try {
      const rows = app.findRecordsByFilter(
        "store_security_events",
        "event_type = 'hosting_blocked' || event_type = 'abusive_ip_detected' || event_type = 'abusive_ip_blocked'",
        "",
        0,
        0,
        {},
      ) || [];
      rows.forEach((row) => app.delete(row));
    } catch (_) {}
    removeSelectValues(events, "event_type", STRICT_NETWORK_EVENT_TYPES);
    app.save(events);
  }

  const cache = findCollectionSafe(app, "store_security_ip_reputation_cache");
  if (cache) {
    STRICT_CACHE_FIELDS.forEach(([id]) => {
      try { cache.fields.removeById(id); } catch (_) {}
    });
    removeSelectValues(cache, "verdict", ["abusive_ip"]);
    app.save(cache);
  }
});
