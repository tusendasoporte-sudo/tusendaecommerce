/// <reference path="../pb_data/types.d.ts" />

const SETTINGS_VPN_POLICY_FIELD_ID = "select1786233601";
const VPN_EVENT_TYPES = ["vpn_detected", "vpn_blocked", "vpn_check_unavailable"];
const VPN_AUDIT_ACTIONS = ["vpn_policy_updated"];

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

function addSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  const current = Array.isArray(field.values) ? field.values : [];
  const next = current.slice();
  values.forEach((value) => {
    if (!next.includes(value)) next.push(value);
  });
  field.values = next;
}

function removeSelectValues(collection, fieldName, values) {
  const field = collection.fields.getByName(fieldName);
  const current = Array.isArray(field.values) ? field.values : [];
  field.values = current.filter((value) => !values.includes(value));
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const settings = app.findCollectionByNameOrId("store_security_settings");
  if (!hasField(settings, "vpn_policy")) {
    settings.fields.add(new Field({
      "default": "off",
      "hidden": false,
      "id": SETTINGS_VPN_POLICY_FIELD_ID,
      "maxSelect": 1,
      "name": "vpn_policy",
      "presentable": false,
      "required": false,
      "system": false,
      "type": "select",
      "values": ["off", "monitor", "block"]
    }));
    app.save(settings);
  }

  const events = app.findCollectionByNameOrId("store_security_events");
  addSelectValues(events, "event_type", VPN_EVENT_TYPES);
  app.save(events);

  const audit = app.findCollectionByNameOrId("store_security_audit");
  addSelectValues(audit, "action", VPN_AUDIT_ACTIONS);
  app.save(audit);

  if (!findCollectionSafe(app, "store_security_ip_reputation_cache")) {
    const cache = new Collection({
      "createRule": null,
      "deleteRule": null,
      "fields": [
        { "autogeneratePattern": "[a-z0-9]{15}", "hidden": false, "id": "text1786233611", "max": 15, "min": 15, "name": "id", "pattern": "^[a-z0-9]+$", "presentable": false, "primaryKey": true, "required": true, "system": true, "type": "text" },
        { "cascadeDelete": true, "collectionId": stores.id, "hidden": false, "id": "relation1786233612", "maxSelect": 1, "minSelect": 1, "name": "store", "presentable": false, "required": true, "system": false, "type": "relation" },
        { "autogeneratePattern": "", "hidden": true, "id": "text1786233613", "max": 200, "min": 32, "name": "ip_hmac", "pattern": "^[A-Za-z0-9._:-]+$", "presentable": false, "primaryKey": false, "required": true, "system": false, "type": "text" },
        { "default": "unavailable", "hidden": false, "id": "select1786233614", "maxSelect": 1, "name": "verdict", "presentable": false, "required": true, "system": false, "type": "select", "values": ["clean", "vpn_or_proxy", "unavailable"] },
        { "default": false, "hidden": false, "id": "bool1786233615", "name": "is_vpn", "presentable": false, "required": false, "system": false, "type": "bool" },
        { "default": false, "hidden": false, "id": "bool1786233616", "name": "is_proxy", "presentable": false, "required": false, "system": false, "type": "bool" },
        { "default": false, "hidden": false, "id": "bool1786233617", "name": "is_tor", "presentable": false, "required": false, "system": false, "type": "bool" },
        { "hidden": false, "id": "date1786233618", "max": "", "min": "", "name": "checked_at", "presentable": false, "required": true, "system": false, "type": "date" },
        { "hidden": false, "id": "date1786233619", "max": "", "min": "", "name": "expires_at", "presentable": false, "required": true, "system": false, "type": "date" },
        { "hidden": false, "id": "autodate1786233620", "name": "created", "onCreate": true, "onUpdate": false, "presentable": false, "system": false, "type": "autodate" },
        { "hidden": false, "id": "autodate1786233621", "name": "updated", "onCreate": true, "onUpdate": true, "presentable": false, "system": false, "type": "autodate" }
      ],
      "id": "pbc_1786233600",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_security_ip_reputation_unique` ON `store_security_ip_reputation_cache` (`store`, `ip_hmac`)",
        "CREATE INDEX `idx_security_ip_reputation_expiry` ON `store_security_ip_reputation_cache` (`store`, `expires_at`)"
      ],
      "listRule": null,
      "name": "store_security_ip_reputation_cache",
      "system": false,
      "type": "base",
      "updateRule": null,
      "viewRule": null
    });
    app.save(cache);
  }
}, (app) => {
  const cache = findCollectionSafe(app, "store_security_ip_reputation_cache");
  if (cache) app.delete(cache);

  const events = findCollectionSafe(app, "store_security_events");
  if (events) {
    try {
      const rows = app.findRecordsByFilter("store_security_events", "event_type = 'vpn_detected' || event_type = 'vpn_blocked' || event_type = 'vpn_check_unavailable'", "", 0, 0, {}) || [];
      rows.forEach((row) => app.delete(row));
    } catch (_) {}
    removeSelectValues(events, "event_type", VPN_EVENT_TYPES);
    app.save(events);
  }

  const audit = findCollectionSafe(app, "store_security_audit");
  if (audit) {
    try {
      const rows = app.findRecordsByFilter("store_security_audit", "action = 'vpn_policy_updated'", "", 0, 0, {}) || [];
      rows.forEach((row) => app.delete(row));
    } catch (_) {}
    removeSelectValues(audit, "action", VPN_AUDIT_ACTIONS);
    app.save(audit);
  }

  const settings = findCollectionSafe(app, "store_security_settings");
  if (!settings) return;
  try {
    settings.fields.removeById(SETTINGS_VPN_POLICY_FIELD_ID);
  } catch (_) {}
  return app.save(settings);
});
