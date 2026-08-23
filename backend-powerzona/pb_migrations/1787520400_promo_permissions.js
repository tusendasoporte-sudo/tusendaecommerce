/// <reference path="../pb_data/types.d.ts" />

const PROMO_PERMISSIONS_FIELD_ID = "json1787520401";
const PROMO_PERMISSIONS_VERSION_FIELD_ID = "number75204002";

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function plainArray(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) { return null; }
  }
  if (value && typeof value === "object") {
    try {
      const parsed = JSON.parse(JSON.stringify(value));
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "string") {
        const reparsed = JSON.parse(parsed);
        return Array.isArray(reparsed) ? reparsed : null;
      }
    } catch (_) {}
  }
  return null;
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  return record[key];
}

function assertSafeRollback(app) {
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const rows = app.findRecordsByFilter("store_user_access", "", "id", pageSize, offset) || [];
    for (const row of rows) {
      const permissions = plainArray(recordValue(row, "promo_permissions_json"));
      const version = Number(recordValue(row, "promo_permissions_version") || 0);
      if (permissions === null || permissions.length || !Number.isSafeInteger(version) || version !== 0) {
        throw new Error("unsafe_rollback_promo_permissions");
      }
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
}

migrate((app) => {
  const access = app.findCollectionByNameOrId("store_user_access");
  app.findCollectionByNameOrId("promo_sites");
  app.findCollectionByNameOrId("promo_site_entitlements");

  const existingPermissions = fieldByName(access, "promo_permissions_json");
  const existingVersion = fieldByName(access, "promo_permissions_version");
  if (existingPermissions && existingPermissions.id !== PROMO_PERMISSIONS_FIELD_ID) {
    throw new Error("incompatible_promo_permissions_field");
  }
  if (existingVersion && existingVersion.id !== PROMO_PERMISSIONS_VERSION_FIELD_ID) {
    throw new Error("incompatible_promo_permissions_version_field");
  }

  if (!existingPermissions) {
    access.fields.add(new Field({
      hidden: true,
      id: PROMO_PERMISSIONS_FIELD_ID,
      maxSize: 16384,
      name: "promo_permissions_json",
      presentable: false,
      required: false,
      system: false,
      type: "json",
    }));
  }
  if (!existingVersion) {
    access.fields.add(new Field({
      hidden: true,
      id: PROMO_PERMISSIONS_VERSION_FIELD_ID,
      max: 2147483647,
      min: 0,
      name: "promo_permissions_version",
      onlyInt: true,
      presentable: false,
      required: false,
      system: false,
      type: "number",
    }));
  }

  app.save(access);
}, (app) => {
  const access = app.findCollectionByNameOrId("store_user_access");
  assertSafeRollback(app);
  try { access.fields.removeById(PROMO_PERMISSIONS_VERSION_FIELD_ID); } catch (_) {}
  try { access.fields.removeById(PROMO_PERMISSIONS_FIELD_ID); } catch (_) {}
  app.save(access);
});
