/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);

const STORE_ACCESS_COLLECTION = "store_user_access";
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);

const RESERVED_PERMISSIONS = Object.freeze([
  "team.manage",
  "plan.manage",
  "primary_admin.replace",
  "premium_downgrade.confirm",
  "global_cleanup.execute",
]);

const ASSIGNABLE_PERMISSION_KEYS = Object.freeze([
  "catalog.view",
  "catalog.products.create",
  "catalog.products.edit",
  "catalog.products.delete",
  "catalog.products.visibility",
  "catalog.products.price",
  "catalog.products.stock",
  "catalog.products.images",
  "catalog.categories.manage",
  "catalog.expirations.manage",
  "orders.view",
  "orders.status.manage",
  "orders.items.manage",
  "orders.price_adjustment",
  "orders.cancel_delete",
  "orders.contact_customer",
  "shipping.manage",
  "promotions.manage",
  "coupons.manage",
  "gifts.manage",
  "raffles.manage",
  "marketing.push.manage",
  "reviews.manage",
  "notifications.view",
  "analytics.view",
  "landing_qr.manage",
  "store.settings.manage",
  "security.view",
  "security.manage",
]);

const PERMISSION_KEYS = Object.freeze([
  ...ASSIGNABLE_PERMISSION_KEYS,
  ...RESERVED_PERMISSIONS,
]);

const PRIMARY_ADMIN_RESERVED_PERMISSIONS = Object.freeze([
  "team.manage",
  "plan.manage",
  "premium_downgrade.confirm",
]);

const PRIMARY_ADMIN_PERMISSION_KEYS = Object.freeze([
  ...ASSIGNABLE_PERMISSION_KEYS,
  ...PRIMARY_ADMIN_RESERVED_PERMISSIONS,
]);

const PERMISSION_DEPENDENCIES = Object.freeze({
  "catalog.products.create": Object.freeze(["catalog.view"]),
  "catalog.products.edit": Object.freeze(["catalog.view"]),
  "catalog.products.delete": Object.freeze(["catalog.view"]),
  "catalog.products.visibility": Object.freeze(["catalog.view"]),
  "catalog.products.price": Object.freeze(["catalog.view"]),
  "catalog.products.stock": Object.freeze(["catalog.view"]),
  "catalog.products.images": Object.freeze(["catalog.view"]),
  "catalog.categories.manage": Object.freeze(["catalog.view"]),
  "catalog.expirations.manage": Object.freeze(["catalog.view"]),
  "orders.status.manage": Object.freeze(["orders.view"]),
  "orders.items.manage": Object.freeze(["orders.view", "catalog.view"]),
  "orders.price_adjustment": Object.freeze(["orders.view"]),
  "orders.cancel_delete": Object.freeze(["orders.view"]),
  "orders.contact_customer": Object.freeze(["orders.view"]),
  "reviews.manage": Object.freeze(["orders.view"]),
  "security.manage": Object.freeze(["security.view"]),
});

const PERMISSION_CAPABILITIES = Object.freeze({
  "catalog.expirations.manage": "product_expiration_tools_enabled",
  "raffles.manage": "raffles_enabled",
  "marketing.push.manage": "push_campaigns_enabled",
  "landing_qr.manage": "landing_qr_enabled",
  "security.view": "security_enabled",
  "security.manage": "security_enabled",
});

const PERMISSION_LABELS = Object.freeze({
  "catalog.view": "Ver catálogo",
  "catalog.products.create": "Crear productos",
  "catalog.products.edit": "Editar productos",
  "catalog.products.delete": "Eliminar productos",
  "catalog.products.visibility": "Cambiar visibilidad de productos",
  "catalog.products.price": "Gestionar precios de productos",
  "catalog.products.stock": "Gestionar inventario",
  "catalog.products.images": "Gestionar fotos de productos",
  "catalog.categories.manage": "Gestionar categorías",
  "catalog.expirations.manage": "Gestionar vencimientos",
  "orders.view": "Ver pedidos",
  "orders.status.manage": "Cambiar estado de pedidos",
  "orders.items.manage": "Gestionar artículos de pedidos",
  "orders.price_adjustment": "Ajustar precios de pedidos",
  "orders.cancel_delete": "Cancelar o eliminar pedidos",
  "orders.contact_customer": "Contactar clientes de pedidos",
  "shipping.manage": "Gestionar envíos",
  "promotions.manage": "Gestionar promociones",
  "coupons.manage": "Gestionar cupones",
  "gifts.manage": "Gestionar regalos",
  "raffles.manage": "Gestionar rifas",
  "marketing.push.manage": "Gestionar campañas push públicas",
  "reviews.manage": "Gestionar reseñas",
  "notifications.view": "Ver notificaciones",
  "analytics.view": "Ver analíticas",
  "landing_qr.manage": "Gestionar Landing QR",
  "store.settings.manage": "Gestionar ajustes de la tienda",
  "security.view": "Ver Seguridad",
  "security.manage": "Gestionar Seguridad",
  "team.manage": "Gestionar equipo",
  "plan.manage": "Gestionar plan",
  "primary_admin.replace": "Reemplazar administrador principal",
  "premium_downgrade.confirm": "Confirmar downgrade Premium",
  "global_cleanup.execute": "Ejecutar limpieza global",
});

const PERMISSION_GROUPS = Object.freeze({
  catalog: Object.freeze(ASSIGNABLE_PERMISSION_KEYS.filter((key) => key.startsWith("catalog."))),
  orders: Object.freeze(ASSIGNABLE_PERMISSION_KEYS.filter((key) => key.startsWith("orders."))),
  shipping: Object.freeze(["shipping.manage"]),
  promotions: Object.freeze(["promotions.manage", "coupons.manage", "gifts.manage", "raffles.manage", "marketing.push.manage"]),
  operations: Object.freeze(["reviews.manage", "notifications.view", "analytics.view", "landing_qr.manage"]),
  settings_security: Object.freeze(["store.settings.manage", "security.view", "security.manage"]),
});

const PERMISSION_CATALOG = Object.freeze(PERMISSION_KEYS.reduce((catalog, key) => {
  catalog[key] = Object.freeze({
    key,
    label: PERMISSION_LABELS[key],
    assignable: !RESERVED_PERMISSIONS.includes(key),
    reserved: RESERVED_PERMISSIONS.includes(key),
    dependencies: PERMISSION_DEPENDENCIES[key] || Object.freeze([]),
    capability: PERMISSION_CAPABILITIES[key] || null,
  });
  return catalog;
}, {}));

function frozenTemplate(code, label, permissions) {
  return Object.freeze({
    code,
    label,
    permissions: Object.freeze(permissions.slice()),
  });
}

const PERMISSION_TEMPLATES = Object.freeze({
  secondary_admin: frozenTemplate(
    "secondary_admin",
    "Administrador secundario",
    ASSIGNABLE_PERMISSION_KEYS,
  ),
  catalog_inventory: frozenTemplate(
    "catalog_inventory",
    "Productos e inventario",
    [
      "catalog.view",
      "catalog.products.create",
      "catalog.products.edit",
      "catalog.products.visibility",
      "catalog.products.price",
      "catalog.products.stock",
      "catalog.products.images",
      "catalog.categories.manage",
      "catalog.expirations.manage",
    ],
  ),
  orders_shipping: frozenTemplate(
    "orders_shipping",
    "Pedidos y envíos",
    [
      "orders.view",
      "orders.status.manage",
      "orders.items.manage",
      "orders.contact_customer",
      "shipping.manage",
    ],
  ),
  marketing_promotions: frozenTemplate(
    "marketing_promotions",
    "Marketing y promociones",
    [
      "promotions.manage",
      "coupons.manage",
      "gifts.manage",
      "raffles.manage",
      "marketing.push.manage",
      "analytics.view",
      "landing_qr.manage",
    ],
  ),
  read_only: frozenTemplate(
    "read_only",
    "Solo lectura",
    [
      "catalog.view",
      "orders.view",
      "analytics.view",
    ],
  ),
  custom: frozenTemplate("custom", "Personalizado", []),
});

class PermissionValidationError extends Error {
  constructor(issue, permission) {
    super("invalid_permissions");
    this.name = "PermissionValidationError";
    this.code = "invalid_permissions";
    this.issue = issue;
    this.permission = permission || "";
  }
}

class StorePermissionError extends Error {
  constructor(permission) {
    super("No tienes permiso para realizar esta acción.");
    this.name = "StorePermissionError";
    this.status = 403;
    this.code = "permission_denied";
    this.permission = typeof permission === "string" ? permission : "";
  }
}

function safeText(value) {
  try {
    return String(value === null || value === undefined ? "" : value).trim();
  } catch (_) {
    return "";
  }
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try {
      const value = record.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try {
      return record.getString(key);
    } catch (_) {}
  }
  return record[key];
}

function relationId(value) {
  if (Array.isArray(value)) return relationId(value[0]);
  if (value && typeof value === "object") {
    return safeText(value.id || recordValue(value, "id"));
  }
  return safeText(value);
}

function recordId(recordOrId) {
  if (recordOrId && typeof recordOrId === "object") {
    return relationId(recordOrId.id || recordValue(recordOrId, "id"));
  }
  return relationId(recordOrId);
}

function resolveRecord(app, collection, recordOrId) {
  if (recordOrId && typeof recordOrId === "object") return recordOrId;
  const id = recordId(recordOrId);
  if (!app || !id || typeof app.findRecordById !== "function") return null;
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function parsePermissionInput(input) {
  if (input === null || input === undefined || input === "") return [];
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  throw new PermissionValidationError("permissions_not_array");
}

function normalizePermissions(input) {
  const values = parsePermissionInput(input);
  const selected = new Set();

  values.forEach((rawPermission) => {
    if (typeof rawPermission !== "string") {
      throw new PermissionValidationError("permission_not_string");
    }
    const permission = rawPermission.trim();
    if (!PERMISSION_KEYS.includes(permission)) {
      throw new PermissionValidationError("unknown_permission", permission);
    }
    if (RESERVED_PERMISSIONS.includes(permission)) {
      throw new PermissionValidationError("reserved_permission", permission);
    }
    selected.add(permission);
  });

  let changed = true;
  while (changed) {
    changed = false;
    [...selected].forEach((permission) => {
      const dependencies = PERMISSION_DEPENDENCIES[permission] || [];
      dependencies.forEach((dependency) => {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      });
    });
  }

  return ASSIGNABLE_PERMISSION_KEYS.filter((permission) => selected.has(permission));
}

function isValidTemplateCode(code) {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(PERMISSION_TEMPLATES, code);
}

function resolveTemplatePermissions(code) {
  const normalizedCode = safeText(code);
  if (!isValidTemplateCode(normalizedCode)) {
    throw new PermissionValidationError("unknown_template", normalizedCode);
  }
  return normalizePermissions(PERMISSION_TEMPLATES[normalizedCode].permissions);
}

function primaryAdminId(store) {
  return relationId(recordValue(store, "primary_admin_user"));
}

function isPrimaryAdmin(app, userOrId, storeOrId) {
  const store = resolveRecord(app, "stores", storeOrId);
  const userId = recordId(userOrId);
  return !!store && !!userId && !!primaryAdminId(store) && primaryAdminId(store) === userId;
}

function belongsToStore(user, store) {
  const storeId = recordId(store);
  return !!storeId && relationId(recordValue(user, "store")) === storeId;
}

function isPendingPrimaryStoreAdmin(user, store) {
  return !primaryAdminId(store)
    && safeText(recordValue(user, "role")) === "store_admin"
    && safeText(recordValue(user, "status")) === "active"
    && belongsToStore(user, store);
}

function effectiveMaxActiveUsers(store) {
  const access = capabilities.resolveStoreCapabilityAccess(
    store,
    "max_active_users",
    { enforceExpiration: true },
  );
  if (!access || access.allowed !== true || !Number.isInteger(access.limit) || access.limit < 1) return 1;
  return access.limit;
}

function additionalUserAllowedByPlan(app, user, store) {
  const maxActiveUsers = effectiveMaxActiveUsers(store);
  const primaryId = primaryAdminId(store);
  const availableSlots = Math.max(0, maxActiveUsers - (primaryId ? 1 : 0));
  if (availableSlots < 1) return false;
  if (!app || typeof app.findRecordsByFilter !== "function") return true;
  try {
    const records = app.findRecordsByFilter(
      "users",
      'store = {:store} && status = "active" && (role = "store_admin" || role = "store_staff") && id != {:primary}',
      "created,id",
      availableSlots,
      0,
      { store: recordId(store), primary: primaryId },
    ) || [];
    return records.some((record) => recordId(record) === recordId(user));
  } catch (_) {
    return false;
  }
}

function isBlockedByPlan(app, userOrId, storeOrId) {
  const user = resolveRecord(app, "users", userOrId);
  const store = resolveRecord(app, "stores", storeOrId);
  if (!user || !store || !belongsToStore(user, store)) return true;
  if (isPrimaryAdmin(app, user, store)) return false;
  // A legacy migration with multiple active store_admin records must not pick
  // an arbitrary winner. Keep every pending admin operational until Master
  // assigns the explicit principal; reserved principal permissions remain
  // unavailable in resolveEffectiveStorePermissions().
  if (isPendingPrimaryStoreAdmin(user, store)) return false;

  return !additionalUserAllowedByPlan(app, user, store);
}

function findAccessRecord(app, storeId, userId) {
  if (!app || !storeId || !userId) return null;
  const filter = "store = {:store} && user = {:user}";
  const params = { store: storeId, user: userId };
  if (typeof app.findFirstRecordByFilter === "function") {
    try {
      return app.findFirstRecordByFilter(STORE_ACCESS_COLLECTION, filter, params);
    } catch (_) {
      return null;
    }
  }
  if (typeof app.findRecordsByFilter === "function") {
    try {
      const records = app.findRecordsByFilter(STORE_ACCESS_COLLECTION, filter, "id", 1, 0, params) || [];
      return records[0] || null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function capabilityAllowsPermission(app, store, permission) {
  const capability = PERMISSION_CAPABILITIES[permission];
  if (!capability) return true;
  return capabilities.hasStoreCapability(store, capability, { app, enforceExpiration: true });
}

function filterPlanCapabilities(app, store, permissions) {
  return permissions.filter((permission) => capabilityAllowsPermission(app, store, permission));
}

function resolveEffectiveStorePermissions(app, userOrId, storeOrId) {
  const user = resolveRecord(app, "users", userOrId);
  const store = resolveRecord(app, "stores", storeOrId);
  if (!user || !store) return [];

  const userId = recordId(user);
  const storeId = recordId(store);
  const role = safeText(recordValue(user, "role"));
  const status = safeText(recordValue(user, "status"));
  if (!userId || !storeId || status !== "active" || !STORE_ROLES.includes(role) || !belongsToStore(user, store)) {
    return [];
  }

  const primary = isPrimaryAdmin(app, user, store);
  const pendingPrimaryAdmin = isPendingPrimaryStoreAdmin(user, store);
  if (!primary && isBlockedByPlan(app, user, store)) return [];

  let assigned;
  if (primary) {
    assigned = PRIMARY_ADMIN_PERMISSION_KEYS.slice();
  } else if (pendingPrimaryAdmin) {
    // Migration ambiguity must not choose a principal or remove existing operational access.
    // Reserved permissions remain unavailable until Master configures the explicit principal.
    assigned = ASSIGNABLE_PERMISSION_KEYS.slice();
  } else {
    const accessRecord = findAccessRecord(app, storeId, userId);
    if (!accessRecord) return [];
    try {
      const stored = typeof accessRecord.getStringSlice === "function"
        ? accessRecord.getStringSlice("permissions_json")
        : recordValue(accessRecord, "permissions_json");
      assigned = normalizePermissions(stored);
    } catch (_) {
      return [];
    }
  }

  return filterPlanCapabilities(app, store, assigned);
}

function hasStorePermission(app, user, store, permission) {
  if (!PERMISSION_KEYS.includes(permission)) return false;
  return resolveEffectiveStorePermissions(app, user, store).includes(permission);
}

function requireStorePermission(app, user, store, permission) {
  if (!hasStorePermission(app, user, store, permission)) {
    throw new StorePermissionError(permission);
  }
  return true;
}

module.exports = {
  ASSIGNABLE_PERMISSION_KEYS,
  PERMISSION_CAPABILITIES,
  PERMISSION_CATALOG,
  PERMISSION_DEPENDENCIES,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSION_TEMPLATES,
  PRIMARY_ADMIN_PERMISSION_KEYS,
  PRIMARY_ADMIN_RESERVED_PERMISSIONS,
  PermissionValidationError,
  RESERVED_PERMISSIONS,
  STORE_ACCESS_COLLECTION,
  StorePermissionError,
  additionalUserAllowedByPlan,
  effectiveMaxActiveUsers,
  hasStorePermission,
  isBlockedByPlan,
  isPrimaryAdmin,
  isValidTemplateCode,
  normalizePermissions,
  resolveEffectiveStorePermissions,
  resolveTemplatePermissions,
  requireStorePermission,
};
