/// <reference path="../pb_data/types.d.ts" />

const storePermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const storeCapabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const promoPlans = typeof __hooks === "undefined"
  ? require("./pz_promo_plan_lib.js")
  : require(`${__hooks}/pz_promo_plan_lib.js`);

const PROMO_ACCESS_FIELD = "promo_permissions_json";
const PROMO_ACCESS_VERSION_FIELD = "promo_permissions_version";
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);
const MASTER_ROLE = "master_admin";

const PROMO_BOOLEAN_CAPABILITY_KEYS = Object.freeze([
  "promo_site_enabled",
  "publish_enabled",
  "custom_domain_enabled",
  "theme_customization_enabled",
  "multilanguage_enabled",
  "language_selector_enabled",
  "video_enabled",
  "analytics_enabled",
  "landing_qr_bridge_enabled",
]);

const PROMO_NUMERIC_CAPABILITY_KEYS = Object.freeze([
  "max_services",
  "max_gallery_assets",
  "max_locales",
  "max_videos",
  "max_storage_bytes",
]);

const PROMO_CAPABILITY_KEYS = Object.freeze([
  ...PROMO_BOOLEAN_CAPABILITY_KEYS,
  ...PROMO_NUMERIC_CAPABILITY_KEYS,
]);

const PROMO_IMAGE_QUOTA_OPTIONS = Object.freeze(Array.from(new Set(
  promoPlanImageQuotaOptions(),
)).sort((left, right) => left - right));

function promoPlanImageQuotaOptions() {
  return promoPlans.PROMO_PLAN_CODES.reduce(
    (values, code) => values.concat(promoPlans.PROMO_PLAN_IMAGE_QUOTA_OPTIONS[code]),
    [],
  );
}

const PROMO_CAPABILITY_LIMITS = Object.freeze({
  max_services: 50,
  max_gallery_assets: Math.max(...PROMO_IMAGE_QUOTA_OPTIONS),
  max_locales: 10,
  max_videos: 3,
  max_storage_bytes: 250 * 1024 * 1024,
});

const PROMO_CAPABILITY_CATALOG = Object.freeze(PROMO_CAPABILITY_KEYS.reduce((catalog, key) => {
  catalog[key] = Object.freeze({
    key,
    kind: PROMO_NUMERIC_CAPABILITY_KEYS.includes(key) ? "limit" : "boolean",
    field: key,
    hard_limit: Object.prototype.hasOwnProperty.call(PROMO_CAPABILITY_LIMITS, key)
      ? PROMO_CAPABILITY_LIMITS[key]
      : null,
  });
  return catalog;
}, {}));

const PROMO_ASSIGNABLE_PERMISSION_KEYS = Object.freeze([
  "promo.site.view",
  "promo.content.manage",
  "promo.media.manage",
  "promo.theme.select",
  "promo.appearance.manage",
  "promo.translations.manage",
  "promo.contact.manage",
  "promo.reviews.manage",
  "promo.analytics.view",
  "promo.publish",
]);

const PROMO_RESERVED_PERMISSION_KEYS = Object.freeze([
  "promo.site.lifecycle.manage",
  "promo.entitlements.manage",
  "promo.domains.manage",
  "promo.theme_releases.manage",
  "promo.publication.rollback",
  "promo.support.access",
]);

const PROMO_PERMISSION_KEYS = Object.freeze([
  ...PROMO_ASSIGNABLE_PERMISSION_KEYS,
  ...PROMO_RESERVED_PERMISSION_KEYS,
]);

const PROMO_PERMISSION_DEPENDENCIES = Object.freeze({
  "promo.content.manage": Object.freeze(["promo.site.view"]),
  "promo.media.manage": Object.freeze(["promo.site.view"]),
  "promo.theme.select": Object.freeze(["promo.site.view"]),
  "promo.appearance.manage": Object.freeze(["promo.site.view"]),
  "promo.translations.manage": Object.freeze(["promo.site.view"]),
  "promo.contact.manage": Object.freeze(["promo.site.view"]),
  "promo.reviews.manage": Object.freeze(["promo.site.view"]),
  "promo.analytics.view": Object.freeze(["promo.site.view"]),
  "promo.publish": Object.freeze(["promo.site.view"]),
});

const PROMO_PERMISSION_CAPABILITIES = Object.freeze({
  "promo.site.view": Object.freeze(["promo_site_enabled"]),
  "promo.content.manage": Object.freeze(["promo_site_enabled"]),
  "promo.media.manage": Object.freeze(["promo_site_enabled"]),
  "promo.theme.select": Object.freeze(["promo_site_enabled"]),
  "promo.appearance.manage": Object.freeze(["promo_site_enabled", "theme_customization_enabled"]),
  "promo.translations.manage": Object.freeze(["promo_site_enabled", "multilanguage_enabled"]),
  "promo.contact.manage": Object.freeze(["promo_site_enabled"]),
  "promo.reviews.manage": Object.freeze(["promo_site_enabled"]),
  "promo.analytics.view": Object.freeze(["promo_site_enabled", "analytics_enabled"]),
  "promo.publish": Object.freeze(["promo_site_enabled", "publish_enabled"]),
});

const PROMO_PERMISSION_LABELS = Object.freeze({
  "promo.site.view": "Ver Tienda Promo",
  "promo.content.manage": "Gestionar contenido Promo",
  "promo.media.manage": "Gestionar medios Promo",
  "promo.theme.select": "Seleccionar tema Promo",
  "promo.appearance.manage": "Personalizar apariencia Promo",
  "promo.translations.manage": "Gestionar traducciones Promo",
  "promo.contact.manage": "Gestionar contacto Promo",
  "promo.reviews.manage": "Gestionar reseñas de tienda Promo",
  "promo.analytics.view": "Ver analíticas Promo",
  "promo.publish": "Publicar Tienda Promo",
  "promo.site.lifecycle.manage": "Gestionar ciclo de vida Promo",
  "promo.entitlements.manage": "Gestionar capacidades Promo",
  "promo.domains.manage": "Gestionar dominios Promo",
  "promo.theme_releases.manage": "Gestionar releases de temas Promo",
  "promo.publication.rollback": "Revertir publicación Promo",
  "promo.support.access": "Acceder a soporte Promo",
});

const PROMO_PERMISSION_CATALOG = Object.freeze(PROMO_PERMISSION_KEYS.reduce((catalog, key) => {
  const reserved = PROMO_RESERVED_PERMISSION_KEYS.includes(key);
  catalog[key] = Object.freeze({
    key,
    label: PROMO_PERMISSION_LABELS[key],
    assignable: !reserved,
    reserved,
    dependencies: PROMO_PERMISSION_DEPENDENCIES[key] || Object.freeze([]),
    capabilities: PROMO_PERMISSION_CAPABILITIES[key] || Object.freeze([]),
  });
  return catalog;
}, {}));

function action(permission, capabilities, siteStatuses, options) {
  const settings = options || {};
  return Object.freeze({
    permission,
    capabilities: Object.freeze((capabilities || []).slice()),
    capability_amounts: Object.freeze({ ...(settings.capabilityAmounts || {}) }),
    site_statuses: Object.freeze((siteStatuses || []).slice()),
    store_statuses: Object.freeze((settings.storeStatuses || ["active"]).slice()),
    scope: settings.scope === "master" ? "master" : "store",
    commerce_permission: settings.commercePermission || null,
    commerce_capability: settings.commerceCapability || null,
  });
}

const ADMIN_SITE_STATES = Object.freeze(["draft", "active", "paused"]);
const ACTIVE_SITE_STATES = Object.freeze(["draft", "active"]);
const MASTER_RECOVERY_SITE_STATES = Object.freeze(["draft", "active", "paused", "suspended", "retired"]);
const MASTER_RECOVERY_STORE_STATES = Object.freeze(["active", "paused", "suspended"]);

const PROMO_ACTION_CATALOG = Object.freeze({
  "promo.site.view": action("promo.site.view", ["promo_site_enabled"], ADMIN_SITE_STATES),
  "promo.content.manage": action("promo.content.manage", ["promo_site_enabled"], ADMIN_SITE_STATES),
  "promo.media.manage": action("promo.media.manage", ["promo_site_enabled", "max_storage_bytes"], ADMIN_SITE_STATES, {
    capabilityAmounts: { max_storage_bytes: 1 },
  }),
  "promo.media.video.manage": action("promo.media.manage", ["promo_site_enabled", "video_enabled", "max_videos"], ADMIN_SITE_STATES, {
    capabilityAmounts: { max_videos: 1 },
  }),
  "promo.theme.select": action("promo.theme.select", ["promo_site_enabled"], ADMIN_SITE_STATES),
  "promo.appearance.manage": action("promo.appearance.manage", ["promo_site_enabled", "theme_customization_enabled"], ADMIN_SITE_STATES),
  "promo.translations.manage": action("promo.translations.manage", ["promo_site_enabled", "multilanguage_enabled", "max_locales"], ADMIN_SITE_STATES, {
    capabilityAmounts: { max_locales: 2 },
  }),
  "promo.contact.manage": action("promo.contact.manage", ["promo_site_enabled"], ADMIN_SITE_STATES),
  "promo.reviews.manage": action("promo.reviews.manage", ["promo_site_enabled"], ADMIN_SITE_STATES),
  "promo.analytics.view": action("promo.analytics.view", ["promo_site_enabled", "analytics_enabled"], ["active"]),
  "promo.publication.publish": action("promo.publish", ["promo_site_enabled", "publish_enabled"], ACTIVE_SITE_STATES),
  "promo.landing_qr.bridge.manage": action("promo.content.manage", ["promo_site_enabled", "landing_qr_bridge_enabled"], ADMIN_SITE_STATES, {
    commercePermission: "landing_qr.manage",
    commerceCapability: "landing_qr_enabled",
  }),
  "promo.master.site.lifecycle": action("promo.site.lifecycle.manage", [], MASTER_RECOVERY_SITE_STATES, {
    scope: "master",
    storeStatuses: MASTER_RECOVERY_STORE_STATES,
  }),
  "promo.master.entitlements.manage": action("promo.entitlements.manage", [], MASTER_RECOVERY_SITE_STATES, {
    scope: "master",
    storeStatuses: MASTER_RECOVERY_STORE_STATES,
  }),
  "promo.master.domains.manage": action("promo.domains.manage", ["promo_site_enabled", "custom_domain_enabled"], ["draft", "active", "paused"], {
    scope: "master",
    storeStatuses: MASTER_RECOVERY_STORE_STATES,
  }),
  "promo.master.theme_releases.manage": action("promo.theme_releases.manage", [], MASTER_RECOVERY_SITE_STATES, {
    scope: "master",
    storeStatuses: MASTER_RECOVERY_STORE_STATES,
  }),
  "promo.master.publication.rollback": action("promo.publication.rollback", ["promo_site_enabled", "publish_enabled"], ["active", "paused"], {
    scope: "master",
    storeStatuses: MASTER_RECOVERY_STORE_STATES,
  }),
  "promo.master.support": action("promo.support.access", [], MASTER_RECOVERY_SITE_STATES, {
    scope: "master",
    storeStatuses: MASTER_RECOVERY_STORE_STATES,
  }),
});

const PROMO_ACTION_KEYS = Object.freeze(Object.keys(PROMO_ACTION_CATALOG));

class PromoPermissionValidationError extends Error {
  constructor(issue, key) {
    super("invalid_promo_permissions");
    this.name = "PromoPermissionValidationError";
    this.code = "invalid_promo_permissions";
    this.issue = issue || "invalid_promo_permissions";
    this.key = key || "";
  }
}

class PromoAccessError extends Error {
  constructor(code, status) {
    super(code || "promo_access_denied");
    this.name = "PromoAccessError";
    this.code = code || "promo_access_denied";
    this.status = Number.isInteger(status) ? status : 403;
  }
}

function safeText(value) {
  try {
    if (value && typeof value.string === "function") return String(value.string() || "").trim();
    return String(value === undefined || value === null ? "" : value).trim();
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
    try { return record.getString(key); } catch (_) {}
  }
  return record[key];
}

function recordString(record, key) {
  return safeText(recordValue(record, key));
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return safeText(value[0] && value[0].id || value[0]);
  if (value && typeof value === "object") return safeText(value.id || recordValue(value, "id"));
  return safeText(value);
}

function recordId(recordOrId) {
  if (recordOrId && typeof recordOrId === "object") {
    return safeText(recordOrId.id || recordValue(recordOrId, "id"));
  }
  return safeText(recordOrId);
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordInteger(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isSafeInteger(value) ? value : null;
}

function parseJsonArray(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  if (value && typeof value === "object") {
    try {
      const parsed = JSON.parse(JSON.stringify(value));
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === "string") {
        const reparsed = JSON.parse(parsed);
        if (Array.isArray(reparsed)) return reparsed;
      }
    } catch (_) {}
  }
  throw new PromoPermissionValidationError("permissions_not_array");
}

function normalizePromoPermissions(input) {
  const selected = new Set();
  parseJsonArray(input).forEach((rawPermission) => {
    if (typeof rawPermission !== "string") {
      throw new PromoPermissionValidationError("permission_not_string");
    }
    const permission = rawPermission.trim();
    if (!PROMO_PERMISSION_KEYS.includes(permission)) {
      throw new PromoPermissionValidationError("unknown_permission", permission);
    }
    if (PROMO_RESERVED_PERMISSION_KEYS.includes(permission)) {
      throw new PromoPermissionValidationError("reserved_permission", permission);
    }
    selected.add(permission);
  });

  let changed = true;
  while (changed) {
    changed = false;
    [...selected].forEach((permission) => {
      (PROMO_PERMISSION_DEPENDENCIES[permission] || []).forEach((dependency) => {
        if (!selected.has(dependency)) {
          selected.add(dependency);
          changed = true;
        }
      });
    });
  }
  return PROMO_ASSIGNABLE_PERMISSION_KEYS.filter((permission) => selected.has(permission));
}

function isPromoCapabilityKey(value) {
  return typeof value === "string" && PROMO_CAPABILITY_KEYS.includes(value);
}

function isPromoPermissionKey(value) {
  return typeof value === "string" && PROMO_PERMISSION_KEYS.includes(value);
}

function isPromoActionKey(value) {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PROMO_ACTION_CATALOG, value);
}

function normalizedDate(value) {
  const raw = safeText(value);
  if (!raw) return null;
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (!Number.isFinite(parsed.getTime())) return false;
  return parsed;
}

function invalidCapabilityAccess(reason) {
  return Object.freeze({
    capability: "",
    kind: "boolean",
    configured: false,
    entitled: false,
    allowed: false,
    limit: null,
    required_amount: null,
    reason,
  });
}

function resolvePromoCapabilityAccess(entitlement, capabilityKey, options) {
  if (!isPromoCapabilityKey(capabilityKey)) return invalidCapabilityAccess("invalid_capability");
  const definition = PROMO_CAPABILITY_CATALOG[capabilityKey];
  const requiredAmount = options && Object.prototype.hasOwnProperty.call(options, "requiredAmount")
    ? Number(options.requiredAmount)
    : null;
  if (requiredAmount !== null && (!Number.isSafeInteger(requiredAmount) || requiredAmount < 0)) {
    return invalidCapabilityAccess("invalid_required_amount");
  }
  if (!entitlement) {
    return Object.freeze({
      capability: capabilityKey,
      kind: definition.kind,
      configured: false,
      entitled: false,
      allowed: false,
      limit: definition.kind === "limit" ? 0 : null,
      required_amount: requiredAmount,
      reason: "capability_missing",
    });
  }

  const source = recordString(entitlement, "source");
  const configured = ["contract", "addon", "master_override"].includes(source);
  const now = options && options.now !== undefined ? new Date(options.now) : new Date();
  const validFrom = normalizedDate(recordValue(entitlement, "valid_from"));
  const validUntil = normalizedDate(recordValue(entitlement, "valid_until"));
  if (!Number.isFinite(now.getTime()) || validFrom === false || validUntil === false) {
    return Object.freeze({
      capability: capabilityKey,
      kind: definition.kind,
      configured,
      entitled: false,
      allowed: false,
      limit: definition.kind === "limit" ? 0 : null,
      required_amount: requiredAmount,
      reason: "invalid_entitlement",
    });
  }

  let limit = null;
  let entitled = false;
  if (definition.kind === "limit") {
    limit = recordInteger(entitlement, capabilityKey);
    if (limit === null || limit < 0 || limit > PROMO_CAPABILITY_LIMITS[capabilityKey]) {
      return Object.freeze({
        capability: capabilityKey,
        kind: definition.kind,
        configured,
        entitled: false,
        allowed: false,
        limit: 0,
        required_amount: requiredAmount,
        reason: "invalid_entitlement",
      });
    }
    entitled = limit > 0;
  } else {
    entitled = recordBool(entitlement, capabilityKey);
  }

  let allowed = configured && entitled;
  let reason = allowed ? "allowed" : (configured ? "capability_not_enabled" : "capability_unassigned");
  if (capabilityKey !== "promo_site_enabled" && !recordBool(entitlement, "promo_site_enabled")) {
    allowed = false;
    reason = "promo_site_not_enabled";
  } else if (validFrom && now.getTime() < validFrom.getTime()) {
    allowed = false;
    reason = "entitlement_not_started";
  } else if (validUntil && now.getTime() >= validUntil.getTime()) {
    allowed = false;
    reason = "entitlement_expired";
  } else if (definition.kind === "limit" && requiredAmount !== null && requiredAmount > limit) {
    allowed = false;
    reason = "limit_exceeded";
  }

  return Object.freeze({
    capability: capabilityKey,
    kind: definition.kind,
    configured,
    entitled,
    allowed,
    limit,
    required_amount: requiredAmount,
    reason,
  });
}

function hasPromoCapability(entitlement, capabilityKey, options) {
  return resolvePromoCapabilityAccess(entitlement, capabilityKey, options).allowed === true;
}

function findRecord(app, collection, id) {
  if (!app || !id || typeof app.findRecordById !== "function") return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findByFilter(app, collection, filter, params) {
  if (!app) return [];
  if (typeof app.findRecordsByFilter === "function") {
    try {
      return Array.from(app.findRecordsByFilter(collection, filter, "id", 2, 0, params || {}) || []);
    } catch (_) { return []; }
  }
  if (typeof app.findFirstRecordByFilter === "function") {
    try {
      const record = app.findFirstRecordByFilter(collection, filter, params || {});
      return record ? [record] : [];
    } catch (_) { return []; }
  }
  return [];
}

function findPromoSiteByStore(app, storeId) {
  const records = findByFilter(app, "promo_sites", "store = {:store}", { store: storeId });
  return records.length === 1 ? records[0] : null;
}

function findPromoEntitlement(app, siteId) {
  const records = findByFilter(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
  return records.length === 1 ? records[0] : null;
}

function findPromoAccessRecord(app, storeId, userId) {
  const records = findByFilter(
    app,
    "store_user_access",
    "store = {:store} && user = {:user}",
    { store: storeId, user: userId },
  );
  return records.length === 1 ? records[0] : null;
}

function storedPromoPermissions(accessRecord) {
  if (!accessRecord) return [];
  try {
    if (typeof accessRecord.getStringSlice === "function") {
      return normalizePromoPermissions(accessRecord.getStringSlice(PROMO_ACCESS_FIELD));
    }
    return normalizePromoPermissions(recordValue(accessRecord, PROMO_ACCESS_FIELD));
  } catch (_) {
    return [];
  }
}

function permissionsAllowedByCapabilities(entitlement, input, options) {
  return input.filter((permission) => {
    const required = PROMO_PERMISSION_CAPABILITIES[permission] || [];
    return required.every((capability) => hasPromoCapability(entitlement, capability, options));
  });
}

function resolveEffectivePromoPermissions(app, userOrId, storeOrId, siteOrId, entitlementOrId, options) {
  const user = userOrId && typeof userOrId === "object" ? userOrId : findRecord(app, "users", recordId(userOrId));
  const store = storeOrId && typeof storeOrId === "object" ? storeOrId : findRecord(app, "stores", recordId(storeOrId));
  const site = siteOrId && typeof siteOrId === "object" ? siteOrId : findRecord(app, "promo_sites", recordId(siteOrId));
  const entitlement = entitlementOrId && typeof entitlementOrId === "object"
    ? entitlementOrId
    : findRecord(app, "promo_site_entitlements", recordId(entitlementOrId));
  if (!user || !store || !site || !entitlement) return [];

  const userId = recordId(user);
  const storeId = recordId(store);
  if (!userId || !storeId
    || relationId(user, "store") !== storeId
    || relationId(site, "store") !== storeId
    || recordString(user, "status") !== "active"
    || !STORE_ROLES.includes(recordString(user, "role"))) return [];
  if (storePermissions.isBlockedByPlan(app, user, store)) return [];

  const primary = storePermissions.isPrimaryAdmin(app, user, store);
  const assigned = primary
    ? PROMO_ASSIGNABLE_PERMISSION_KEYS.slice()
    : storedPromoPermissions(findPromoAccessRecord(app, storeId, userId));
  return permissionsAllowedByCapabilities(entitlement, assigned, options);
}

function tokenKey(record) {
  if (!record) return "";
  try { return safeText(record.tokenKey()); } catch (_) {}
  return recordString(record, "tokenKey");
}

function assertLiveSession(sessionUser, currentUser) {
  const sessionKey = tokenKey(sessionUser);
  const currentKey = tokenKey(currentUser);
  if (!sessionKey || !currentKey || sessionKey !== currentKey) {
    throw new PromoAccessError("session_revoked", 403);
  }
}

function requireActiveMasterSession(app, sessionUser) {
  const sessionId = recordId(sessionUser);
  const actor = findRecord(app, "users", sessionId);
  if (!sessionId || !actor) throw new PromoAccessError("unauthorized", 403);
  assertLiveSession(sessionUser, actor);
  if (recordString(actor, "status") !== "active" || recordString(actor, "role") !== MASTER_ROLE) {
    throw new PromoAccessError("unauthorized", 403);
  }
  return actor;
}

function promoCapabilitySnapshot(entitlement, options) {
  const result = {};
  PROMO_CAPABILITY_KEYS.forEach((key) => {
    const access = resolvePromoCapabilityAccess(entitlement, key, options);
    result[key] = access.kind === "limit" ? (access.allowed ? access.limit : 0) : access.allowed;
  });
  return Object.freeze(result);
}

function basePromoContext(app, sessionUser, actionKey, options) {
  if (!isPromoActionKey(actionKey)) throw new PromoAccessError("unknown_promo_action", 403);
  const actionDefinition = PROMO_ACTION_CATALOG[actionKey];
  const sessionId = recordId(sessionUser);
  const actor = findRecord(app, "users", sessionId);
  if (!sessionId || !actor) throw new PromoAccessError("unauthorized", 403);
  assertLiveSession(sessionUser, actor);
  if (recordString(actor, "status") !== "active") throw new PromoAccessError("user_inactive", 403);

  const role = recordString(actor, "role");
  const master = role === MASTER_ROLE;
  if (!master && !STORE_ROLES.includes(role)) throw new PromoAccessError("unauthorized", 403);
  if (actionDefinition.scope === "master" && !master) throw new PromoAccessError("reserved_promo_action", 403);

  const requestedStoreId = safeText(options && options.requestedStoreId);
  const actorStoreId = relationId(actor, "store");
  const storeId = master ? requestedStoreId : actorStoreId;
  if (!storeId) throw new PromoAccessError(master ? "promo_store_context_required" : "unauthorized", 403);
  if (!master && requestedStoreId && requestedStoreId !== actorStoreId) {
    throw new PromoAccessError("promo_not_found", 404);
  }

  const store = findRecord(app, "stores", storeId);
  if (!store) throw new PromoAccessError("promo_not_found", 404);
  if (!actionDefinition.store_statuses.includes(recordString(store, "status"))) {
    throw new PromoAccessError("store_inactive", 403);
  }
  if (!master && relationId(actor, "store") !== recordId(store)) {
    throw new PromoAccessError("promo_not_found", 404);
  }
  if (!master && storePermissions.isBlockedByPlan(app, actor, store)) {
    throw new PromoAccessError("blocked_by_plan", 403);
  }

  const site = findPromoSiteByStore(app, recordId(store));
  if (!site) throw new PromoAccessError("store_not_promo", 404);
  if (options && options.resourceStoreId && safeText(options.resourceStoreId) !== recordId(store)) {
    throw new PromoAccessError("promo_not_found", 404);
  }
  if (options && options.resourceSiteId && safeText(options.resourceSiteId) !== recordId(site)) {
    throw new PromoAccessError("promo_not_found", 404);
  }
  if (!actionDefinition.site_statuses.includes(recordString(site, "status"))) {
    throw new PromoAccessError("promo_site_inactive", 403);
  }
  const entitlement = findPromoEntitlement(app, recordId(site));

  return {
    action: actionDefinition,
    action_key: actionKey,
    actor,
    entitlement,
    master,
    site,
    store,
  };
}

function requireActionCapabilities(context, options) {
  for (const capability of context.action.capabilities) {
    const amount = context.action.capability_amounts[capability];
    const access = resolvePromoCapabilityAccess(context.entitlement, capability, {
      now: options && options.now,
      ...(amount === undefined ? {} : { requiredAmount: amount }),
    });
    if (!access.allowed) throw new PromoAccessError("promo_capability_denied", 403);
  }
}

function requireActionPermission(app, context, options) {
  if (context.action.scope === "master") {
    if (!PROMO_RESERVED_PERMISSION_KEYS.includes(context.action.permission)) {
      throw new PromoAccessError("reserved_promo_action", 403);
    }
    return PROMO_RESERVED_PERMISSION_KEYS.slice();
  }

  if (context.master) return PROMO_ASSIGNABLE_PERMISSION_KEYS.slice();
  const effective = resolveEffectivePromoPermissions(
    app,
    context.actor,
    context.store,
    context.site,
    context.entitlement,
    options,
  );
  if (!effective.includes(context.action.permission)) {
    throw new PromoAccessError("promo_permission_denied", 403);
  }
  return effective;
}

function requireCommerceBridge(app, context) {
  if (!context.action.commerce_permission && !context.action.commerce_capability) return;
  if (context.master) return;
  if (context.action.commerce_permission
    && !storePermissions.hasStorePermission(app, context.actor, context.store, context.action.commerce_permission)) {
    throw new PromoAccessError("commerce_permission_denied", 403);
  }
  if (context.action.commerce_capability
    && !storeCapabilities.hasStoreCapability(context.store, context.action.commerce_capability, { enforceExpiration: true })) {
    throw new PromoAccessError("commerce_capability_denied", 403);
  }
}

function requirePromoAction(app, sessionUser, actionKey, options) {
  const context = basePromoContext(app, sessionUser, actionKey, options || {});
  if (context.action.scope !== "master") {
    try { promoPlans.assertPromoOperationalAccess(context.store, actionKey, options && options.now); }
    catch (error) {
      const code = String(error && (error.code || error.message) || "promo_plan_expired");
      throw new PromoAccessError(code, 403);
    }
  }
  requireActionCapabilities(context, options || {});
  const effectivePermissions = requireActionPermission(app, context, options || {});
  requireCommerceBridge(app, context);
  return Object.freeze({
    action: actionKey,
    actor: context.actor,
    capabilities: promoCapabilitySnapshot(context.entitlement, options || {}),
    effective_permissions: Object.freeze(effectivePermissions.slice()),
    entitlement: context.entitlement,
    is_master: context.master,
    is_primary_admin: context.master
      ? false
      : storePermissions.isPrimaryAdmin(app, context.actor, context.store),
    site: context.site,
    store: context.store,
  });
}

function canPromoAction(app, sessionUser, actionKey, options) {
  try {
    requirePromoAction(app, sessionUser, actionKey, options);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  MASTER_ROLE,
  PROMO_ACCESS_FIELD,
  PROMO_ACCESS_VERSION_FIELD,
  PROMO_ACTION_CATALOG,
  PROMO_ACTION_KEYS,
  PROMO_ASSIGNABLE_PERMISSION_KEYS,
  PROMO_BOOLEAN_CAPABILITY_KEYS,
  PROMO_CAPABILITY_CATALOG,
  PROMO_CAPABILITY_KEYS,
  PROMO_CAPABILITY_LIMITS,
  PROMO_IMAGE_QUOTA_OPTIONS,
  PROMO_NUMERIC_CAPABILITY_KEYS,
  PROMO_PERMISSION_CAPABILITIES,
  PROMO_PERMISSION_CATALOG,
  PROMO_PERMISSION_DEPENDENCIES,
  PROMO_PERMISSION_KEYS,
  PROMO_RESERVED_PERMISSION_KEYS,
  PromoAccessError,
  PromoPermissionValidationError,
  canPromoAction,
  findPromoAccessRecord,
  findPromoEntitlement,
  findPromoSiteByStore,
  hasPromoCapability,
  isPromoActionKey,
  isPromoCapabilityKey,
  isPromoPermissionKey,
  normalizePromoPermissions,
  promoCapabilitySnapshot,
  recordBool,
  recordId,
  recordInteger,
  recordString,
  recordValue,
  relationId,
  resolveEffectivePromoPermissions,
  resolvePromoCapabilityAccess,
  requirePromoAction,
  requireActiveMasterSession,
  safeText,
  storedPromoPermissions,
};
