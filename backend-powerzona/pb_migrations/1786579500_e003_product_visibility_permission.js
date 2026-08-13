/// <reference path="../pb_data/types.d.ts" />

const E003_VISIBILITY_PERMISSION = "catalog.products.visibility";
const E003_VISIBILITY_TEMPLATES = Object.freeze(["secondary_admin", "catalog_inventory"]);

function e003RecordValue(record, key) {
  if (!record) return undefined;
  try { if (typeof record.get === "function") return record.get(key); } catch (_) {}
  return record[key];
}

function e003PermissionList(record) {
  const value = e003RecordValue(record, "permissions_json");
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch (_) {}
  }
  return [];
}

function repairE003VisibilityPermissions(app) {
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter("store_user_access", "", "id", pageSize, offset) || [];
    batch.forEach((record) => {
      const template = String(e003RecordValue(record, "template_code") || "");
      if (!E003_VISIBILITY_TEMPLATES.includes(template)) return;
      const permissions = e003PermissionList(record);
      if (permissions.includes(E003_VISIBILITY_PERMISSION)) return;
      record.set("permissions_json", [...permissions, E003_VISIBILITY_PERMISSION]);
      app.save(record);
    });
    if (batch.length < pageSize) return;
    offset += batch.length;
  }
}

migrate((app) => {
  app.findCollectionByNameOrId("store_user_access");
  repairE003VisibilityPermissions(app);
}, (_app) => {
  // Reparación aditiva de permisos previstos por plantilla. No se elimina en
  // rollback porque no es posible distinguirlo de un permiso concedido antes.
});
