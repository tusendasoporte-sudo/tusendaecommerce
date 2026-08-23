/// <reference path="../pb_data/types.d.ts" />

const STORE_STATUSES = Object.freeze(["active", "suspended"]);
const STORE_TYPES = Object.freeze(["commerce", "promo"]);
const STORE_NAME_MAX_LENGTH = 140;
const STORE_SLUG_MAX_LENGTH = 80;
const OWNER_PHONE_MAX_LENGTH = 60;
const SYSTEM_CURRENCY_DEFAULTS = Object.freeze([
  Object.freeze({ code: "USD", name: "Dolar estadounidense", symbol: "$", active: true, isDefault: true, isBase: true }),
  Object.freeze({ code: "CUP", name: "Peso cubano", symbol: "CUP", active: false, isDefault: false, isBase: false }),
  Object.freeze({ code: "EUR", name: "Euro", symbol: "EUR", active: false, isDefault: false, isBase: false }),
  Object.freeze({ code: "CASHAPP", name: "CashApp", symbol: "$", active: false, isDefault: false, isBase: false }),
  Object.freeze({ code: "ZELLE", name: "Zelle", symbol: "Zelle", active: false, isDefault: false, isBase: false }),
]);
const SYSTEM_CURRENCY_CODES = Object.freeze(SYSTEM_CURRENCY_DEFAULTS.map((definition) => definition.code));

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    return record.get(key);
  } catch (_) {
    try {
      return record.getString(key);
    } catch (_) {
      return record[key];
    }
  }
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
}

function normalizedCurrencyCode(record) {
  return recordString(record, "code").toUpperCase().replace(/\s+/g, "");
}

function originalRecord(record) {
  try {
    return typeof record.original === "function" ? record.original() : null;
  } catch (_) {
    return null;
  }
}

function throwFixedCurrencyError(message) {
  const safeMessage = String(message || "Operacion no permitida.");
  if (typeof ForbiddenError === "function") throw new ForbiddenError(safeMessage);
  const error = new Error(safeMessage);
  error.code = "fixed_currency";
  throw error;
}

function enforceFixedCurrencyUpdate(e) {
  const current = e && e.record;
  const original = originalRecord(current) || current;
  const originalCode = normalizedCurrencyCode(original);
  if (!SYSTEM_CURRENCY_CODES.includes(originalCode)) return e.next();
  if (normalizedCurrencyCode(current) !== originalCode
    || recordString(current, "store") !== recordString(original, "store")) {
    throwFixedCurrencyError("No puedes cambiar la identidad de una moneda fija del sistema.");
  }
  current.set("is_system", true);
  current.set("is_base", originalCode === "USD");
  if (originalCode === "USD") {
    current.set("active", true);
    current.set("exchange_rate", 1);
  } else if (recordValue(current, "is_default") === true) {
    current.set("active", true);
  }
  return e.next();
}

function rejectFixedCurrencyDelete(e) {
  if (SYSTEM_CURRENCY_CODES.includes(normalizedCurrencyCode(e && e.record))) {
    throwFixedCurrencyError("No puedes eliminar una moneda fija del sistema.");
  }
  return e.next();
}

function rejectDuplicateFixedCurrencyCreate(e) {
  const current = e && e.record;
  const code = normalizedCurrencyCode(current);
  if (!SYSTEM_CURRENCY_CODES.includes(code)) return e.next();

  const storeId = recordString(current, "store");
  if (!storeId) return e.next();
  const app = e && e.app;
  if (!app || typeof app.findRecordsByFilter !== "function") {
    throw new Error("currency_validation_unavailable");
  }

  const existing = (app.findRecordsByFilter(
    "currencies",
    "store = {:store} && code = {:code}",
    "id",
    1,
    0,
    { store: storeId, code }
  ) || [])[0] || null;
  if (existing) throwFixedCurrencyError("Ya existe esta moneda fija para la tienda.");

  current.set("code", code);
  return e.next();
}

function isActiveMaster(record) {
  return recordString(record, "role") === "master_admin"
    && recordString(record, "status").toLowerCase() === "active";
}

function exactPayload(body, allowedKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeStoreSlug(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, STORE_SLUG_MAX_LENGTH);
}

function parseCreateStorePayload(body) {
  const legacyPayload = exactPayload(body, ["name", "slug", "status", "owner_phone"]);
  const typedPayload = exactPayload(body, ["name", "slug", "status", "owner_phone", "store_type"]);
  if (!legacyPayload && !typedPayload) return null;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const rawSlug = typeof body.slug === "string" ? body.slug.trim() : "";
  const slug = normalizeStoreSlug(rawSlug);
  const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
  const ownerPhone = typeof body.owner_phone === "string" ? body.owner_phone.trim() : "";
  const storeType = typedPayload && typeof body.store_type === "string"
    ? body.store_type.trim().toLowerCase()
    : "commerce";
  if (!name || name.length > STORE_NAME_MAX_LENGTH) return null;
  if (!rawSlug || slug !== rawSlug.toLowerCase() || slug.length > STORE_SLUG_MAX_LENGTH) return null;
  if (!STORE_STATUSES.includes(status)) return null;
  if (!STORE_TYPES.includes(storeType)) return null;
  if (ownerPhone.length > OWNER_PHONE_MAX_LENGTH) return null;
  return { name, slug, status, ownerPhone, ...(typedPayload ? { storeType } : {}) };
}

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function storeSlugExists(app, slug) {
  try {
    app.findFirstRecordByFilter("stores", "slug = {:slug}", { slug });
    return true;
  } catch (_) {
    return false;
  }
}

function createSystemCurrency(app, storeId, definition) {
  const currency = new Record(app.findCollectionByNameOrId("currencies"), {});
  currency.set("store", storeId);
  currency.set("code", definition.code);
  currency.set("name", definition.name);
  currency.set("symbol", definition.symbol);
  currency.set("exchange_rate", 1);
  currency.set("active", definition.active);
  currency.set("is_default", definition.isDefault);
  currency.set("is_system", true);
  currency.set("is_base", definition.isBase);
  app.save(currency);
  return currency;
}

function createSystemCurrencies(app, storeId) {
  return SYSTEM_CURRENCY_DEFAULTS.map((definition) => createSystemCurrency(app, storeId, definition));
}

function storeOrderPrefix(value, fallback) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toUpperCase();
  const words = normalized.split(/[^A-Z]+/).filter(Boolean);
  const prefix = words.length >= 2
    ? words.slice(0, 2).map((word) => word[0]).join("")
    : String(words[0] || "").slice(0, 2);
  const safeFallback = String(fallback || "MT").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  return prefix || safeFallback || "MT";
}

function createDefaultStoreSettings(app, store, defaultCurrency) {
  if (!store || !store.id || !defaultCurrency || !defaultCurrency.id) {
    throw new Error("store_settings_dependencies_missing");
  }

  const storeName = recordString(store, "name") || "Mi tienda";
  const settings = new Record(app.findCollectionByNameOrId("settings"), {});
  settings.set("store_name", storeName);
  settings.set("whatsapp_number", recordString(store, "owner_phone"));
  settings.set("default_currency", defaultCurrency.id);
  settings.set("order_prefix", storeOrderPrefix(storeName));
  settings.set("public_category_columns", "1");
  settings.set("notifications_enabled", true);
  settings.set("notify_new_order", true);
  settings.set("notify_pending_order", true);
  settings.set("notify_review_pending", true);
  settings.set("pending_order_hours", 2);
  settings.set("notification_priority_enabled", true);
  settings.set("notification_priority_important_min_usd", 50);
  settings.set("notification_priority_critical_min_usd", 100);
  settings.set("notification_show_order_subtotal", true);
  settings.set("notification_bell_priority_colors", true);
  settings.set("notify_low_stock", true);
  settings.set("low_stock_threshold", 3);
  settings.set("notify_out_of_stock", true);
  settings.set("notification_cleanup_enabled", true);
  settings.set("notification_cleanup_days", 15);
  settings.set("cover_mode", "single");
  settings.set("business_hours_mode", "always_available");
  settings.set("allow_orders_when_closed", true);
  settings.set("maintenance_mode", false);
  settings.set("active", true);
  settings.set("store", store.id);
  app.save(settings);
  return settings;
}

function createBaseStore(app, actor, payload) {
  if (storeSlugExists(app, payload.slug)) throw new Error("store_slug_exists");

  const store = new Record(app.findCollectionByNameOrId("stores"), {});
  store.set("name", payload.name);
  store.set("slug", payload.slug);
  store.set("status", payload.status);
  store.set("owner_phone", payload.ownerPhone);
  store.set("plan", "free");
  store.set("featured", false);
  store.set("featured_order", 0);
  store.set("views_count", 0);
  store.set("orders_count", 0);
  store.set("protected", false);
  store.set("plan_updated_by", actor.id);
  app.save(store);
  return store;
}

function createStoreWithSystemCurrencies(app, actorId, payload) {
  const actor = findRecord(app, "users", actorId);
  if (!actor || !isActiveMaster(actor)) throw new Error("unauthorized");
  const store = createBaseStore(app, actor, payload);

  const currencies = createSystemCurrencies(app, store.id);
  const settings = createDefaultStoreSettings(app, store, currencies[0]);
  return { store, currencies, settings };
}

function createStoreForMaster(app, actorId, payload) {
  if (payload.storeType !== "promo") return createStoreWithSystemCurrencies(app, actorId, payload);
  const actor = findRecord(app, "users", actorId);
  if (!actor || !isActiveMaster(actor)) throw new Error("unauthorized");
  const store = createBaseStore(app, actor, payload);
  const promoMaster = typeof __hooks === "undefined"
    ? require("./pz_promo_master_lib.js")
    : require(`${__hooks}/pz_promo_master_lib.js`);
  const foundation = promoMaster.createPromoFoundation(app, actor, store, payload.slug);
  return { store, currencies: [], settings: null, foundation, storeType: "promo" };
}

function storeResponse(record) {
  return {
    id: String(record && record.id || ""),
    name: recordString(record, "name"),
    slug: recordString(record, "slug"),
    status: recordString(record, "status"),
    plan: recordString(record, "plan"),
    owner_phone: recordString(record, "owner_phone"),
  };
}

function currencyResponse(record) {
  return {
    id: String(record && record.id || ""),
    code: recordString(record, "code"),
    is_base: recordValue(record, "is_base") === true,
    is_default: recordValue(record, "is_default") === true,
    active: recordValue(record, "active") === true,
  };
}

function settingsResponse(record) {
  return {
    id: String(record && record.id || ""),
    active: recordValue(record, "active") === true,
    default_currency: recordString(record, "default_currency"),
    order_prefix: recordString(record, "order_prefix"),
    store: recordString(record, "store"),
  };
}

function safeErrorCode(error) {
  const code = String(error && (error.code || error.message) || "").trim();
  return ["unauthorized", "session_revoked", "user_inactive", "store_slug_exists", "promo_public_slug_exists"].includes(code) ? code : "";
}

function handleCreate(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isActiveMaster(info && info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseCreateStorePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });

    let created = null;
    const actorId = recordString(info.auth, "id") || String(info.auth && info.auth.id || "").trim();
    $app.runInTransaction((txApp) => {
      if (parsed.storeType === "promo") {
        const promoPermissions = typeof __hooks === "undefined"
          ? require("./pz_promo_permissions_lib.js")
          : require(`${__hooks}/pz_promo_permissions_lib.js`);
        const liveActor = promoPermissions.requireActiveMasterSession(txApp, info.auth);
        if (recordString(liveActor, "id") !== actorId) throw new Error("unauthorized");
      }
      created = createStoreForMaster(txApp, actorId, parsed);
    });

    const response = {
      ok: true,
      store: storeResponse(created.store),
      currencies: created.currencies.map(currencyResponse),
      settings: created.settings ? settingsResponse(created.settings) : null,
    };
    if (created.storeType === "promo") {
      response.store_type = "promo";
      response.promo = {
        public_slug: recordString(created.foundation.site, "public_slug"),
        status: recordString(created.foundation.site, "status"),
      };
    }
    return e.json(201, response);
  } catch (error) {
    const code = safeErrorCode(error);
    if (["unauthorized", "session_revoked", "user_inactive"].includes(code)) {
      return e.json(403, { ok: false, error: code });
    }
    if (["store_slug_exists", "promo_public_slug_exists"].includes(code)) {
      return e.json(409, { ok: false, error: code });
    }
    try {
      $app.logger().error(
        "PowerZona master store creation failed safely.",
        "code", "PZ_MASTER_STORE_CREATE_FAILED"
      );
    } catch (_) {}
    return e.json(500, { ok: false, error: "store_create_failed" });
  }
}

module.exports = {
  SYSTEM_CURRENCY_CODES,
  SYSTEM_CURRENCY_DEFAULTS,
  STORE_TYPES,
  createBaseStore,
  createDefaultStoreSettings,
  createStoreForMaster,
  createStoreWithSystemCurrencies,
  createSystemCurrencies,
  createSystemCurrency,
  exactPayload,
  enforceFixedCurrencyUpdate,
  handleCreate,
  isActiveMaster,
  normalizeStoreSlug,
  parseCreateStorePayload,
  rejectDuplicateFixedCurrencyCreate,
  rejectFixedCurrencyDelete,
  requireAuthenticatedUser,
  storeOrderPrefix,
  storeSlugExists,
};
