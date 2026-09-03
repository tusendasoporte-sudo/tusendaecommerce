/// <reference path="../pb_data/types.d.ts" />

"use strict";

const catalog = typeof __hooks === "undefined"
  ? require("./pz_plan_catalog_lib.js")
  : require(`${__hooks}/pz_plan_catalog_lib.js`);
const promoPlans = typeof __hooks === "undefined"
  ? require("./pz_promo_plan_lib.js")
  : require(`${__hooks}/pz_promo_plan_lib.js`);

const PRODUCT_QUOTA_FIELD = "max_products";
const PRODUCT_QUOTA_NEAR_RATIO = 0.8;
const PRODUCT_QUOTA_STATES = Object.freeze([
  "available",
  "near_limit",
  "limit_reached",
  "over_limit",
  "unavailable",
]);

const SAFE_ERRORS = Object.freeze({
  product_limit_reached: Object.freeze({
    status: 409,
    field: PRODUCT_QUOTA_FIELD,
    message: "La tienda alcanzó el límite de productos de su plan. Elimina un producto para liberar cupo o cambia de plan.",
  }),
  product_quota_unavailable: Object.freeze({
    status: 503,
    field: PRODUCT_QUOTA_FIELD,
    message: "No se pudo determinar un límite de productos válido. La creación quedó bloqueada para proteger el catálogo.",
  }),
  product_store_immutable: Object.freeze({
    status: 409,
    field: "store",
    message: "No se puede trasladar un producto existente a otra tienda.",
  }),
});

class ProductQuotaError extends Error {
  constructor(code, details) {
    const safeCode = Object.prototype.hasOwnProperty.call(SAFE_ERRORS, code)
      ? code
      : "product_quota_unavailable";
    super(SAFE_ERRORS[safeCode].message);
    this.name = "ProductQuotaError";
    this.code = safeCode;
    this.details = details || null;
  }
}

function fail(code, details) {
  throw new ProductQuotaError(code, details);
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
}

function recordId(record) {
  return String(record && (record.id || recordValue(record, "id")) || "").trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  return String(Array.isArray(value) ? value[0] || "" : value || "").trim();
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail("product_quota_unavailable");
  return number;
}

function validLimit(value) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0) fail("product_quota_unavailable");
  return limit;
}

function limitForPlan(plan) {
  if (catalog.CATALOG_CONTRACT !== "tusenda84.commercial-plan-catalog.v1") {
    fail("product_quota_unavailable");
  }
  try {
    return validLimit(catalog.getPlanDefinition("ecommerce", String(plan || "").trim()).capabilities.max_products);
  } catch (error) {
    if (error instanceof ProductQuotaError) throw error;
    fail("product_quota_unavailable");
  }
}

function limitForStore(store) {
  if (!store) fail("product_quota_unavailable");
  return limitForPlan(recordString(store, "plan"));
}

function quotaState(usedValue, limitValue) {
  const used = nonNegativeInteger(usedValue);
  const limit = validLimit(limitValue);
  const overBy = Math.max(0, used - limit);
  const remaining = Math.max(0, limit - used);
  const percentage = Math.round((used / limit) * 10000) / 100;
  let state = "available";
  if (used > limit) state = "over_limit";
  else if (used === limit) state = "limit_reached";
  else if (used >= Math.ceil(limit * PRODUCT_QUOTA_NEAR_RATIO)) state = "near_limit";
  return Object.freeze({
    catalog_contract: catalog.CATALOG_CONTRACT,
    store_type: "ecommerce",
    used,
    limit,
    remaining,
    over_by: overBy,
    percentage,
    state,
    can_create: used < limit,
  });
}

function quotaForPlan(plan, used) {
  return Object.freeze({
    plan: String(plan || "").trim(),
    ...quotaState(used, limitForPlan(plan)),
  });
}

function unavailableQuota(store, usedValue) {
  const used = Number(usedValue);
  return Object.freeze({
    catalog_contract: catalog.CATALOG_CONTRACT,
    store_type: "ecommerce",
    plan: recordString(store, "plan") || null,
    used: Number.isSafeInteger(used) && used >= 0 ? used : 0,
    limit: null,
    remaining: null,
    over_by: null,
    percentage: null,
    state: "unavailable",
    can_create: false,
  });
}

function productQuotaViewFromUsage(store, used) {
  try {
    return quotaForPlan(recordString(store, "plan"), used);
  } catch (_) {
    return unavailableQuota(store, used);
  }
}

function countStoreProducts(app, storeId) {
  if (!app || !storeId || !app.db || typeof app.db !== "function") fail("product_quota_unavailable");
  try {
    const row = typeof DynamicModel === "function"
      ? new DynamicModel({ total: 0 })
      : { total: 0 };
    app.db().newQuery(`
      SELECT COUNT(*) AS total
      FROM products
      WHERE store = {:storeId}
    `).bind({ storeId }).one(row);
    return nonNegativeInteger(row.total);
  } catch (error) {
    if (error instanceof ProductQuotaError) throw error;
    fail("product_quota_unavailable");
  }
}

function productQuotaView(app, store, knownUsage) {
  if (promoPlans.isPromoStore(app, store)) return null;
  try {
    const used = knownUsage === undefined
      ? countStoreProducts(app, recordId(store))
      : nonNegativeInteger(knownUsage);
    return productQuotaViewFromUsage(store, used);
  } catch (_) {
    return unavailableQuota(store, knownUsage);
  }
}

function assertProductCreationAllowed(app, store) {
  const storeId = recordId(store);
  if (!app || !storeId) fail("product_quota_unavailable");
  const used = countStoreProducts(app, storeId);
  const quota = quotaForPlan(recordString(store, "plan"), used);
  if (!quota.can_create) fail("product_limit_reached", quota);
  return quota;
}

function quotaFoundationReady(app) {
  if (!app) return false;
  try {
    const products = app.findCollectionByNameOrId("products");
    const stores = app.findCollectionByNameOrId("stores");
    return !!products.fields.getByName("store") && !!stores.fields.getByName("plan");
  } catch (_) {
    return false;
  }
}

function findStore(app, storeId) {
  try { return app.findRecordById("stores", storeId); } catch (_) { return null; }
}

function acquireStoreQuotaLock(app, storeId) {
  try {
    app.db().newQuery(`
      UPDATE stores
      SET id = id
      WHERE id = {:storeId}
    `).bind({ storeId }).execute();
  } catch (_) {
    fail("product_quota_unavailable");
  }
}

function appIsTransactional(app) {
  if (!app || typeof app.isTransactional !== "function") return false;
  try { return app.isTransactional() === true; } catch (_) { return false; }
}

function raiseProductQuotaError(error) {
  if (!(error instanceof ProductQuotaError) && !Object.prototype.hasOwnProperty.call(SAFE_ERRORS, error && error.code)) {
    throw error;
  }
  const code = Object.prototype.hasOwnProperty.call(SAFE_ERRORS, error && error.code)
    ? error.code
    : "product_quota_unavailable";
  const definition = SAFE_ERRORS[code];
  if (typeof ApiError === "function" && typeof ValidationError === "function") {
    const data = {};
    data[definition.field] = new ValidationError(code, definition.message);
    throw new ApiError(definition.status, definition.message, data);
  }
  throw error;
}

function handleProductCreate(e) {
  if (!e || !e.record || !quotaFoundationReady(e.app)) return e.next();
  const originalApp = e.app;
  let result;
  const run = (app) => {
    try { e.app = app; } catch (_) {}
    const storeId = relationId(e.record, "store");
    const initialStore = findStore(app, storeId);
    if (!initialStore) fail("product_quota_unavailable");
    if (promoPlans.isPromoStore(app, initialStore)) {
      result = e.next();
      return;
    }
    acquireStoreQuotaLock(app, storeId);
    const lockedStore = findStore(app, storeId);
    if (!lockedStore || promoPlans.isPromoStore(app, lockedStore)) fail("product_quota_unavailable");
    assertProductCreationAllowed(app, lockedStore);
    result = e.next();
  };
  try {
    if (appIsTransactional(originalApp)) {
      run(originalApp);
    } else if (originalApp && typeof originalApp.runInTransaction === "function") {
      originalApp.runInTransaction(run);
    } else {
      fail("product_quota_unavailable");
    }
    return result;
  } catch (error) {
    return raiseProductQuotaError(error);
  } finally {
    try { e.app = originalApp; } catch (_) {}
  }
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function handleProductUpdate(e) {
  if (!e || !e.record || !quotaFoundationReady(e.app)) return e.next();
  try {
    const original = originalRecord(e.record);
    const previousStoreId = relationId(original, "store");
    const nextStoreId = relationId(e.record, "store");
    const previousStore = findStore(e.app, previousStoreId);
    if (previousStore && promoPlans.isPromoStore(e.app, previousStore)) return e.next();
    if (!previousStoreId || !nextStoreId || previousStoreId !== nextStoreId) {
      fail("product_store_immutable");
    }
    return e.next();
  } catch (error) {
    return raiseProductQuotaError(error);
  }
}

function getSafeProductQuotaError(error) {
  const code = Object.prototype.hasOwnProperty.call(SAFE_ERRORS, error && error.code)
    ? error.code
    : "product_quota_unavailable";
  return Object.freeze({ code, ...SAFE_ERRORS[code] });
}

module.exports = {
  PRODUCT_QUOTA_FIELD,
  PRODUCT_QUOTA_NEAR_RATIO,
  PRODUCT_QUOTA_STATES,
  ProductQuotaError,
  assertProductCreationAllowed,
  countStoreProducts,
  getSafeProductQuotaError,
  handleProductCreate,
  handleProductUpdate,
  limitForPlan,
  limitForStore,
  productQuotaView,
  productQuotaViewFromUsage,
  quotaForPlan,
  quotaFoundationReady,
  quotaState,
  unavailableQuota,
};
