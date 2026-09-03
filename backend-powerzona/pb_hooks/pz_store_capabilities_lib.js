/// <reference path="../pb_data/types.d.ts" />

const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);
const catalog = typeof __hooks === "undefined"
  ? require("./pz_plan_catalog_lib.js")
  : require(`${__hooks}/pz_plan_catalog_lib.js`);

const BOOLEAN_CAPABILITY_KEYS = Object.freeze([
  "categories_enabled",
  "subcategories_enabled",
  "admin_android_app_enabled",
  "customer_android_app_enabled",
  "raffles_enabled",
  "security_enabled",
  "landing_qr_enabled",
  "product_expiration_tools_enabled",
  "push_campaigns_enabled",
]);

const NUMERIC_CAPABILITY_KEYS = Object.freeze([
  "max_products",
  "max_active_users",
  "max_devices_per_user",
  "max_store_devices",
  "max_product_images",
]);

const CAPABILITY_KEYS = Object.freeze([
  ...NUMERIC_CAPABILITY_KEYS,
  ...BOOLEAN_CAPABILITY_KEYS,
]);

const SAFE_ERROR_DEFINITIONS = Object.freeze({
  invalid_capability: Object.freeze({
    status: 500,
    message: "Esta función no está disponible temporalmente.",
  }),
  invalid_plan_data: Object.freeze({
    status: 503,
    message: "Esta función no está disponible temporalmente.",
  }),
  capability_not_in_plan: Object.freeze({
    status: 403,
    message: "Esta función no está incluida en el plan actual.",
  }),
  capability_not_enabled: Object.freeze({
    status: 403,
    message: "Esta función opcional no está habilitada para la tienda.",
  }),
  limit_exceeded: Object.freeze({
    status: 403,
    message: "Alcanzaste el límite permitido por tu plan.",
  }),
  plan_expired: Object.freeze({
    status: 403,
    message: "Esta función no está disponible temporalmente.",
  }),
});

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try {
      return record.get(key);
    } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try {
      return record.getString(key);
    } catch (_) {}
  }
  return record[key];
}

function booleanValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeText(value) {
  try {
    return String(value === null || value === undefined ? "" : value).trim();
  } catch (_) {
    return "";
  }
}

function isValidCapabilityKey(value) {
  return typeof value === "string" && CAPABILITY_KEYS.includes(value);
}

function capabilityKind(capabilityKey) {
  return NUMERIC_CAPABILITY_KEYS.includes(capabilityKey) ? "limit" : "boolean";
}

function knownPlanFromStore(storeOrValues) {
  const plan = safeText(recordValue(storeOrValues, "plan"));
  return plans.isValidPlanCode(plan) ? plan : null;
}

function recordId(recordOrValues) {
  return safeText(recordValue(recordOrValues, "id") || (recordOrValues && recordOrValues.id));
}

function optionalCapabilityEnabledByStore(app, storeOrValues, capabilityKey) {
  const policy = catalog.getOptionalCapabilityPolicy(capabilityKey);
  const storeId = recordId(storeOrValues);
  if (!policy || policy.setting_collection !== "store_security_settings" || !app || !storeId) return false;
  let settings = null;
  if (typeof app.findRecordsByFilter === "function") {
    try {
      const records = Array.from(app.findRecordsByFilter(
        policy.setting_collection,
        "store = {:store}",
        "id",
        2,
        0,
        { store: storeId },
      ) || []);
      settings = records.length === 1 ? records[0] : null;
    } catch (_) {
      settings = null;
    }
  } else if (typeof app.findFirstRecordByFilter === "function") {
    try {
      settings = app.findFirstRecordByFilter(
        policy.setting_collection,
        "store = {:store}",
        { store: storeId },
      );
    } catch (_) {
      settings = null;
    }
  }
  const mode = safeText(recordValue(settings, "mode"));
  return !!settings
    && booleanValue(recordValue(settings, "enabled"))
    && ["monitoring", "protection"].includes(mode);
}

function resolveOptionalCapabilityEnabled(storeOrValues, capabilityKey, options) {
  const policy = catalog.getOptionalCapabilityPolicy(capabilityKey);
  if (!policy) return null;
  if (options && Object.prototype.hasOwnProperty.call(options, "optionalCapabilityEnabled")) {
    if (typeof options.optionalCapabilityEnabled !== "boolean") {
      throw new TypeError("invalid_optional_capability_state");
    }
    return options.optionalCapabilityEnabled;
  }
  return optionalCapabilityEnabledByStore(options && options.app, storeOrValues, capabilityKey);
}

function invalidAccess(capabilityKey, reason, plan) {
  const validCapability = isValidCapabilityKey(capabilityKey);
  return Object.freeze({
    capability: validCapability ? capabilityKey : "",
    kind: validCapability ? capabilityKind(capabilityKey) : "boolean",
    plan: plan || null,
    plan_state: "invalid",
    is_permanent: false,
    is_configured: false,
    is_expired: false,
    entitled: false,
    allowed: false,
    limit: null,
    required_amount: null,
    reason,
  });
}

function normalizeRequiredAmount(options) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, "requiredAmount")) {
    return null;
  }
  const amount = options.requiredAmount;
  if (!Number.isInteger(amount) || amount < 0) {
    throw new TypeError("invalid_required_amount");
  }
  return amount;
}

function resolveStoreCapabilityAccess(storeOrValues, capabilityKey, options) {
  if (!isValidCapabilityKey(capabilityKey)) {
    return invalidAccess(capabilityKey, "invalid_capability", knownPlanFromStore(storeOrValues));
  }

  const knownPlan = knownPlanFromStore(storeOrValues);
  try {
    if (!storeOrValues || typeof storeOrValues !== "object") {
      throw new TypeError("invalid_store_values");
    }
    if (!knownPlan) {
      throw new RangeError("invalid_plan_code");
    }
    if (knownPlan === "free" && booleanValue(recordValue(storeOrValues, "plan_is_permanent"))) {
      throw new TypeError("invalid_plan_permanence");
    }

    const state = plans.resolvePlanState(storeOrValues, options && options.now);
    const kind = capabilityKind(capabilityKey);
    const capabilityValue = state.capabilities[capabilityKey];
    let entitled = false;
    let limit = null;
    let requiredAmount = null;

    if (kind === "boolean") {
      if (typeof capabilityValue !== "boolean") throw new TypeError("invalid_capability_value");
      const optionalEnabled = resolveOptionalCapabilityEnabled(storeOrValues, capabilityKey, options);
      entitled = optionalEnabled === null ? capabilityValue : optionalEnabled;
    } else {
      if (!Number.isInteger(capabilityValue) || capabilityValue < 0) {
        throw new TypeError("invalid_capability_limit");
      }
      limit = capabilityValue;
      requiredAmount = normalizeRequiredAmount(options);
      entitled = true;
    }

    let allowed = entitled;
    const optionalPolicy = catalog.getOptionalCapabilityPolicy(capabilityKey);
    let reason = entitled ? "allowed" : optionalPolicy ? "capability_not_enabled" : "capability_not_in_plan";
    if (state.isExpired && options && options.enforceExpiration === true) {
      allowed = false;
      reason = "plan_expired";
    } else if (kind === "limit" && requiredAmount !== null && requiredAmount > limit) {
      allowed = false;
      reason = "limit_exceeded";
    }

    return Object.freeze({
      capability: capabilityKey,
      kind,
      plan: state.plan,
      plan_state: state.state,
      is_permanent: state.plan_is_permanent,
      is_configured: state.isConfigured,
      is_expired: state.isExpired,
      entitled,
      allowed,
      limit,
      required_amount: requiredAmount,
      reason,
    });
  } catch (_) {
    return invalidAccess(capabilityKey, "invalid_plan_data", knownPlan);
  }
}

function hasStoreCapability(storeOrValues, capabilityKey, options) {
  return resolveStoreCapabilityAccess(storeOrValues, capabilityKey, options).allowed;
}

class StoreCapabilityError extends Error {
  constructor(code, access) {
    const definition = SAFE_ERROR_DEFINITIONS[code] || SAFE_ERROR_DEFINITIONS.invalid_plan_data;
    super(definition.message);
    this.name = "StoreCapabilityError";
    this.code = SAFE_ERROR_DEFINITIONS[code] ? code : "invalid_plan_data";
    this.access = access || null;
  }
}

function requireStoreCapability(storeOrValues, capabilityKey, options) {
  const access = resolveStoreCapabilityAccess(storeOrValues, capabilityKey, options);
  if (!access.allowed) throw new StoreCapabilityError(access.reason, access);
  return access;
}

function getSafeCapabilityError(error) {
  const code = error && SAFE_ERROR_DEFINITIONS[error.code]
    ? error.code
    : "internal_error";
  const definition = SAFE_ERROR_DEFINITIONS[code] || SAFE_ERROR_DEFINITIONS.invalid_capability;
  return Object.freeze({
    status: definition.status,
    code,
    message: definition.message,
  });
}

module.exports = {
  BOOLEAN_CAPABILITY_KEYS,
  CAPABILITY_KEYS,
  NUMERIC_CAPABILITY_KEYS,
  optionalCapabilityEnabledByStore,
  StoreCapabilityError,
  getSafeCapabilityError,
  hasStoreCapability,
  isValidCapabilityKey,
  requireStoreCapability,
  resolveStoreCapabilityAccess,
};
