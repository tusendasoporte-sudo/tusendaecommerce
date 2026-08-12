/// <reference path="../pb_data/types.d.ts" />

const STOREFRONT_PUSH_PERMISSION = "marketing.push.manage";
const STOREFRONT_PUSH_TEMPLATES = ["secondary_admin", "marketing_promotions"];

function migrationRecordValue(record, key) {
  if (!record) return undefined;
  try { if (typeof record.get === "function") return record.get(key); } catch (_) {}
  return record[key];
}

function migrationPermissions(record) {
  const value = migrationRecordValue(record, "permissions_json");
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch (_) {}
  }
  return [];
}

function updateStoredPermissions(app, addPermission) {
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter("store_user_access", "", "id", pageSize, offset) || [];
    batch.forEach((record) => {
      const current = migrationPermissions(record);
      const template = String(migrationRecordValue(record, "template_code") || "");
      let next = current.slice();
      if (addPermission && STOREFRONT_PUSH_TEMPLATES.includes(template)) {
        if (!next.includes(STOREFRONT_PUSH_PERMISSION)) next.push(STOREFRONT_PUSH_PERMISSION);
      } else if (!addPermission) {
        next = next.filter((permission) => permission !== STOREFRONT_PUSH_PERMISSION);
      }
      if (next.length !== current.length || next.some((value, index) => value !== current[index])) {
        record.set("permissions_json", next);
        app.save(record);
      }
    });
    if (batch.length < pageSize) break;
    offset += batch.length;
  }
}

migrate((app) => {
  app.findCollectionByNameOrId("store_user_access");
  updateStoredPermissions(app, true);
}, (app) => {
  app.findCollectionByNameOrId("store_user_access");
  updateStoredPermissions(app, false);
});
