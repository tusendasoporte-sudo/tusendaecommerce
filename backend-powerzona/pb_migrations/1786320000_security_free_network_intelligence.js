/// <reference path="../pb_data/types.d.ts" />

const NETWORK_EVENT_TYPES = ["network_suspected"];
const CACHE_CONTEXT_FIELDS = [
  ["text1786320001", "provider", "text"],
  ["bool1786320002", "is_datacenter", "bool"],
  ["bool1786320003", "is_abuser", "bool"],
  ["bool1786320004", "is_crawler", "bool"],
  ["bool1786320005", "is_mobile", "bool"],
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

function addCacheContextFields(cache) {
  CACHE_CONTEXT_FIELDS.forEach(([id, name, type]) => {
    if (hasField(cache, name)) return;
    if (type === "text") {
      cache.fields.add(new Field({
        "autogeneratePattern": "", "hidden": false, "id": id, "max": 80, "min": 0,
        "name": name, "pattern": "^[A-Za-z0-9._:-]*$", "presentable": false,
        "primaryKey": false, "required": false, "system": false, "type": "text"
      }));
      return;
    }
    cache.fields.add(new Field({
      "default": false, "hidden": false, "id": id, "name": name,
      "presentable": false, "required": false, "system": false, "type": "bool"
    }));
  });
  addSelectValues(cache, "verdict", ["network_suspected"]);
}

function createUsageCollection(app) {
  if (findCollectionSafe(app, "security_ip_reputation_usage")) return;
  app.save(new Collection({
    "createRule": null,
    "deleteRule": null,
    "fields": [
      { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1786320011", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1786320012", "max": 80, "min": 1, "name": "provider", "pattern": "^[A-Za-z0-9._:-]+$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "autogeneratePattern": "", "hidden": false, "id": "text1786320013", "max": 10, "min": 10, "name": "utc_day", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
      { "hidden": false, "id": "number1786320014", "max": 1000, "min": 0, "name": "requests", "onlyInt": true, "presentable": false, "required": true, "system": false, "type": "number" },
      { "hidden": false, "id": "autodate1786320015", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
      { "hidden": false, "id": "autodate1786320016", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
    ],
    "id": "pbc_1786320001",
    "indexes": ["CREATE UNIQUE INDEX `idx_security_ip_usage_day` ON `security_ip_reputation_usage` (`provider`, `utc_day`)"],
    "listRule": null,
    "name": "security_ip_reputation_usage",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  }));
}

function createTorCollections(app) {
  if (!findCollectionSafe(app, "security_tor_exit_nodes")) {
    app.save(new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1786320021", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1786320022", "max": 80, "min": 8, "name": "batch_id", "pattern": "^[A-Za-z0-9._:-]+$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1786320023", "max": 64, "min": 3, "name": "ip_address", "pattern": "^[0-9A-Fa-f:.]+$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "default": "ipv4", "hidden": false, "id": "select1786320024", "maxSelect": 1, "name": "ip_family", "presentable": false, "required": true, "system": false, "type": "select", "values": ["ipv4", "ipv6"] },
        { "hidden": false, "id": "date1786320025", "max": "", "min": "", "name": "fetched_at", "presentable": false, "required": true, "system": false, "type": "date" },
        { "hidden": false, "id": "autodate1786320026", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1786320002",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_security_tor_batch_ip` ON `security_tor_exit_nodes` (`batch_id`, `ip_address`)",
        "CREATE INDEX `idx_security_tor_lookup` ON `security_tor_exit_nodes` (`ip_address`, `batch_id`)"
      ],
      "listRule": null,
      "name": "security_tor_exit_nodes",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": null
    }));
  }

  if (!findCollectionSafe(app, "security_tor_feed_state")) {
    app.save(new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1786320031", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "autogeneratePattern": "", "hidden": false, "id": "text1786320032", "max": 40, "min": 1, "name": "state_key", "pattern": "^[A-Za-z0-9._:-]+$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1786320033", "max": 80, "min": 0, "name": "active_batch_id", "pattern": "^[A-Za-z0-9._:-]*$", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "hidden": false, "id": "date1786320034", "max": "", "min": "", "name": "refreshed_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "hidden": false, "id": "date1786320035", "max": "", "min": "", "name": "source_updated_at", "presentable": false, "required": false, "system": false, "type": "date" },
        { "hidden": false, "id": "number1786320036", "max": 50000, "min": 0, "name": "entry_count", "onlyInt": true, "presentable": false, "required": false, "system": false, "type": "number" },
        { "default": "unavailable", "hidden": false, "id": "select1786320037", "maxSelect": 1, "name": "status", "presentable": false, "required": true, "system": false, "type": "select", "values": ["valid", "stale", "unavailable"] },
        { "autogeneratePattern": "", "hidden": false, "id": "text1786320038", "max": 80, "min": 0, "name": "error_code", "pattern": "^[A-Za-z0-9._:-]*$", "presentable": false, "primaryKey": false, "required": false, "system": false, "type": "text" },
        { "hidden": false, "id": "autodate1786320039", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1786320040", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1786320003",
      "indexes": ["CREATE UNIQUE INDEX `idx_security_tor_state_key` ON `security_tor_feed_state` (`state_key`)"],
      "listRule": null,
      "name": "security_tor_feed_state",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": null
    }));
  }
}

migrate((app) => {
  const events = app.findCollectionByNameOrId("store_security_events");
  addSelectValues(events, "event_type", NETWORK_EVENT_TYPES);
  app.save(events);

  const cache = app.findCollectionByNameOrId("store_security_ip_reputation_cache");
  addCacheContextFields(cache);
  app.save(cache);

  createUsageCollection(app);
  createTorCollections(app);
}, (app) => {
  ["security_tor_feed_state", "security_tor_exit_nodes", "security_ip_reputation_usage"].forEach((name) => {
    const collection = findCollectionSafe(app, name);
    if (collection) app.delete(collection);
  });

  const cache = findCollectionSafe(app, "store_security_ip_reputation_cache");
  if (cache) {
    CACHE_CONTEXT_FIELDS.forEach(([id]) => {
      try { cache.fields.removeById(id); } catch (_) {}
    });
    removeSelectValues(cache, "verdict", ["network_suspected"]);
    app.save(cache);
  }

  const events = findCollectionSafe(app, "store_security_events");
  if (events) {
    try {
      const rows = app.findRecordsByFilter("store_security_events", "event_type = 'network_suspected'", "", 0, 0, {}) || [];
      rows.forEach((row) => app.delete(row));
    } catch (_) {}
    removeSelectValues(events, "event_type", NETWORK_EVENT_TYPES);
    app.save(events);
  }
});
