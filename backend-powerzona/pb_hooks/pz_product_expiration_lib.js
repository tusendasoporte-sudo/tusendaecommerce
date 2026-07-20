/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);
const teamPermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);

const CAPABILITY = "product_expiration_tools_enabled";
const CYCLES_COLLECTION = "product_expiration_cycles";
const EXPIRATION_NOTIFICATION_TYPES = Object.freeze([
  "product_expiring_soon",
  "product_expiring_critical",
  "product_expired",
  "variation_expiring_soon",
  "variation_expiring_critical",
  "variation_expired",
]);
const THRESHOLDS = Object.freeze([90, 60, 30, 0]);
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try { return record.get(key); } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try { return record.getString(key); } catch (_) {}
  }
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value === "object" && typeof value.string === "function") {
    try { return String(value.string() || "").trim(); } catch (_) { return ""; }
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function boundedText(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function findRecord(app, collection, id) {
  if (!app || !RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, limit, offset, params) {
  try {
    return app.findRecordsByFilter(collection, filter || "", sort || "", limit || 200, offset || 0, params || {}) || [];
  } catch (_) {
    return [];
  }
}

function findAllRecordsStrict(app, collection, filter, sort, params) {
  const records = [];
  const limit = 500;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter(collection, filter || "", sort || "id", limit, offset, params || {}) || [];
    records.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return records;
}

function isValidCivilDateParts(year, month, day) {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.getUTCFullYear() === year && value.getUTCMonth() + 1 === month && value.getUTCDate() === day;
}

function normalizeCivilDate(value, allowPocketBaseDateTime) {
  if (value === null || value === undefined || value === "") return "";
  let raw = value;
  if (value && typeof value === "object" && typeof value.string === "function") {
    try { raw = value.string(); } catch (_) { return null; }
  } else if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    raw = value.toISOString();
  }
  const text = String(raw || "").trim();
  const candidate = allowPocketBaseDateTime === true ? text.slice(0, 10) : text;
  const match = CIVIL_DATE_PATTERN.exec(candidate);
  if (!match) return null;
  if (allowPocketBaseDateTime === true && text.length > 10 && !/^\d{4}-\d{2}-\d{2}(?:[ T]00:00:00(?:\.\d{1,9})?Z?)?$/.test(text)) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidCivilDateParts(year, month, day) ? candidate : null;
}

function civilDayNumber(value) {
  const key = normalizeCivilDate(value, true);
  if (!key) return null;
  const match = CIVIL_DATE_PATTERN.exec(key);
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

function havanaTodayKey(now) {
  return plans.getHavanaCivilDateKey(now === undefined ? new Date() : now);
}

function daysUntilExpiration(expirationDate, now) {
  const target = civilDayNumber(expirationDate);
  const today = civilDayNumber(havanaTodayKey(now));
  return target === null || today === null ? null : target - today;
}

function isExpired(expirationDate, now) {
  const days = daysUntilExpiration(expirationDate, now);
  return days !== null && days <= 0;
}

function currentThreshold(daysLeft) {
  if (!Number.isInteger(daysLeft)) return null;
  if (daysLeft <= 0) return 0;
  if (daysLeft <= 30) return 30;
  if (daysLeft <= 60) return 60;
  if (daysLeft <= 90) return 90;
  return null;
}

function storeExpirationEnabled(store) {
  return capabilities.resolveStoreCapabilityAccess(store, CAPABILITY).allowed === true;
}

function variationOtherwiseSellable(product, variation) {
  if (!variation || recordBool(variation, "active") === false && recordValue(variation, "active") !== undefined) return false;
  const price = Number(recordValue(variation, "price_usd") || recordValue(variation, "precio_usd") || 0);
  if (!(price > 0)) return false;
  if (recordValue(product, "track_stock") === false) return true;
  return Number(recordValue(variation, "stock") || 0) > 0 || recordBool(variation, "allow_preorder");
}

function evaluateCommercialAvailability(input) {
  const source = input || {};
  const store = source.store || null;
  const product = source.product || null;
  const variations = Array.isArray(source.variations) ? source.variations : [];
  const selectedVariation = source.variation || null;
  if (!storeExpirationEnabled(store)) return { available: true, reason: "capability_inactive", mode: "none" };

  const generalDate = normalizeCivilDate(recordValue(product, "expiration_date"), true) || "";
  const ownDates = variations
    .map((variation) => normalizeCivilDate(recordValue(variation, "expiration_date"), true) || "")
    .filter(Boolean);
  const mode = ownDates.length ? "variations" : generalDate ? "general" : "none";

  if (mode === "general" && isExpired(generalDate, source.now)) {
    return { available: false, reason: "product_expired", mode };
  }
  if (selectedVariation && mode === "variations") {
    const ownDate = normalizeCivilDate(recordValue(selectedVariation, "expiration_date"), true) || "";
    if (ownDate && isExpired(ownDate, source.now)) {
      return { available: false, reason: "variation_expired", mode };
    }
    return { available: true, reason: "available", mode };
  }
  if (!selectedVariation && recordBool(product, "has_variations") && mode === "variations") {
    const candidates = variations.filter((variation) => variationOtherwiseSellable(product, variation));
    if (candidates.length && candidates.every((variation) => {
      const date = normalizeCivilDate(recordValue(variation, "expiration_date"), true) || "";
      return date && isExpired(date, source.now);
    })) {
      return { available: false, reason: "all_sellable_variations_expired", mode };
    }
  }
  return { available: true, reason: "available", mode };
}

function requestBody(e) {
  try { return e.requestInfo().body || {}; } catch (_) { return {}; }
}

function bodyHas(body, key) {
  return !!body && Object.prototype.hasOwnProperty.call(body, key);
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function safeRequestError(code, message, field, status) {
  return { code, message, field: field || "expiration_date", status: status || 400 };
}

function raiseExpirationRequestError(safe) {
  const error = safe || {};
  const message = String(error.message || "No se pudo completar la operación.");
  const data = {};
  data[String(error.field || "expiration_date")] = new ValidationError(String(error.code || "invalid_expiration_date"), message);
  const status = Number(error.status) || 400;
  if (status === 404 && typeof NotFoundError === "function") throw new NotFoundError(message, data);
  if (status === 403 && typeof ForbiddenError === "function") throw new ForbiddenError(message, data);
  if (status >= 500 && typeof InternalServerError === "function") throw new InternalServerError(message, data);
  throw new BadRequestError(message, data);
}

function requestAuthRecord(e) {
  if (e && e.auth) return e.auth;
  try {
    const info = e && typeof e.requestInfo === "function" ? e.requestInfo() : null;
    return info && info.auth ? info.auth : null;
  } catch (_) {
    return null;
  }
}

function authCanManageStore(e, storeId) {
  const auth = requestAuthRecord(e);
  const role = recordString(auth, "role");
  if (role === "master_admin") return recordString(auth, "status").toLowerCase() !== "suspended";
  if (!authBelongsToActiveStore(e, storeId)) return false;
  const app = e && e.app ? e.app : (typeof $app === "undefined" ? null : $app);
  const store = findRecord(app, "stores", storeId);
  return !!store && teamPermissions.hasStorePermission(
    app,
    auth,
    store,
    "catalog.expirations.manage"
  );
}

function authBelongsToActiveStore(e, storeId) {
  const auth = requestAuthRecord(e);
  const role = recordString(auth, "role");
  if (role === "master_admin") return recordString(auth, "status").toLowerCase() !== "suspended";
  return ["store_admin", "store_staff"].includes(role)
    && relationId(auth, "store") === storeId
    && recordString(auth, "status").toLowerCase() !== "suspended";
}

function authBelongsToAnotherStore(e, storeId) {
  const auth = requestAuthRecord(e);
  return ["store_admin", "store_staff"].includes(recordString(auth, "role"))
    && relationId(auth, "store")
    && relationId(auth, "store") !== storeId;
}

function variationsForProduct(app, productId) {
  return findRecords(app, "product_variations", "product = {:product}", "sort_order", 500, 0, { product: productId });
}

function resolveDateRequestRecords(e, collectionName) {
  const app = e && e.app;
  const record = e && e.record;
  if (!app || !record) return null;
  if (collectionName === "products") {
    const storeId = relationId(record, "store");
    return { storeId, store: findRecord(app, "stores", storeId), product: record, variation: null };
  }
  const productId = relationId(record, "product");
  const product = findRecord(app, "products", productId);
  const storeId = relationId(product, "store");
  return { storeId, store: findRecord(app, "stores", storeId), product, variation: record };
}

function createProductExpirationAutoClearActivity(app, e, resolved, previousDate, nextVariationDate) {
  const product = resolved && resolved.product;
  const variation = resolved && resolved.variation;
  const storeId = resolved && resolved.storeId;
  if (!product || !variation || !storeId || !previousDate) return null;
  const productLabel = boundedText(recordString(product, "name") || "Producto", 180);
  const productVersion = boundedText(recordString(product, "updated") || previousDate, 60).replace(/\s+/g, "T");
  return storeActivity.createActivity(app, {
    storeId,
    actor: requestAuthRecord(e),
    module: "catalog",
    action: "product_expiration_cleared_for_variation",
    severity: "important",
    resourceType: "product",
    resourceId: recordString(product, "id") || String(product.id || ""),
    resourceLabel: productLabel,
    changedFields: ["expiration_date"],
    previousValues: { expiration_date: previousDate },
    newValues: { expiration_date: "" },
    summary: `Eliminó el vencimiento general de ${productLabel} al definir uno por variación`,
    sourceEventKey: `expiration:auto-clear:${String(product.id || "")}:${String(variation.id || "")}:${productVersion}:${nextVariationDate}`,
  });
}

function validateDateWriteRequest(e, collectionName) {
  const body = requestBody(e);
  if (!bodyHas(body, "expiration_date")) return null;
  // PocketBase may expose an already parsed date field as midnight UTC in
  // requestInfo().body even when the client sent the canonical YYYY-MM-DD.
  const normalized = normalizeCivilDate(bodyValue(body, "expiration_date"), true);
  if (normalized === null) return safeRequestError("invalid_expiration_date", "Escribe una fecha de vencimiento válida.");
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (!resolved || !resolved.store || !resolved.product || !resolved.storeId) {
    return safeRequestError("expiration_management_unavailable", "La fecha de vencimiento no está disponible temporalmente.", "expiration_date", 503);
  }
  if (authBelongsToAnotherStore(e, resolved.storeId)) {
    return safeRequestError("expiration_not_found", "No se encontrÃ³ el recurso solicitado.", "expiration_date", 404);
  }
  if (!authBelongsToActiveStore(e, resolved.storeId)) {
    return safeRequestError("expiration_unauthorized", "No tienes permiso para modificar esta fecha.", "expiration_date", 403);
  }
  if (!storeExpirationEnabled(resolved.store)) {
    return safeRequestError("expiration_premium_required", "Esta función está disponible solo en el plan Premium.", "expiration_date", 403);
  }
  if (!authCanManageStore(e, resolved.storeId)) {
    return safeRequestError("permission_denied", "No tienes permiso para modificar esta fecha.", "expiration_date", 403);
  }

  if (collectionName === "products" && normalized) {
    const hasVariationDates = variationsForProduct(e.app, e.record.id).some((variation) => {
      return Boolean(normalizeCivilDate(recordValue(variation, "expiration_date"), true));
    });
    if (hasVariationDates) {
      return safeRequestError("expiration_modes_conflict", "Elimina las fechas de las variaciones antes de usar una fecha general.");
    }
  }

  if (collectionName === "product_variations" && normalized) {
    const productDate = normalizeCivilDate(recordValue(resolved.product, "expiration_date"), true) || "";
    if (productDate) {
      clearEntityExpirationState(e.app, "products", resolved.product.id);
      resolved.product.set("expiration_date", "");
      e.app.save(resolved.product);
      createProductExpirationAutoClearActivity(e.app, e, resolved, productDate, normalized);
    }
  }
  return null;
}

function appIsTransactional(app) {
  if (!app || typeof app.isTransactional !== "function") return false;
  try { return app.isTransactional() === true; } catch (_) { return false; }
}

function handleDateWriteRequest(e, collectionName) {
  const originalApp = e && e.app;
  let result;
  const run = (app) => {
    try { e.app = app; } catch (_) {}
    const safe = validateDateWriteRequest(e, collectionName);
    if (safe) raiseExpirationRequestError(safe);
    result = e.next();
  };
  try {
    if (originalApp && typeof originalApp.runInTransaction === "function" && !appIsTransactional(originalApp)) {
      originalApp.runInTransaction(run);
    } else {
      run(originalApp);
    }
    return result;
  } finally {
    try { e.app = originalApp; } catch (_) {}
  }
}

function settingsStore(app, record) {
  const storeId = relationId(record, "store");
  return { storeId, store: findRecord(app, "stores", storeId) };
}

function validateExpirationSettingsRequest(e) {
  const body = requestBody(e);
  if (!bodyHas(body, "notify_expiration_alerts")) return null;
  const resolved = settingsStore(e.app, e.record);
  if (resolved.store && authBelongsToAnotherStore(e, resolved.storeId)) {
    return safeRequestError("expiration_not_found", "No se encontrÃ³ el recurso solicitado.", "notify_expiration_alerts", 404);
  }
  if (!resolved.store || !authBelongsToActiveStore(e, resolved.storeId)) {
    return safeRequestError("expiration_unauthorized", "No tienes permiso para modificar estas alertas.", "notify_expiration_alerts", 403);
  }
  if (!storeExpirationEnabled(resolved.store)) {
    return safeRequestError("expiration_premium_required", "Esta función está disponible solo en el plan Premium.", "notify_expiration_alerts", 403);
  }
  if (!authCanManageStore(e, resolved.storeId)) {
    return safeRequestError("permission_denied", "No tienes permiso para modificar estas alertas.", "notify_expiration_alerts", 403);
  }
  return null;
}

function loadProductVariationsForStore(app, products) {
  const productIds = new Set(products.map((product) => String(product.id || "")).filter(Boolean));
  if (!productIds.size) return [];
  return findRecords(app, "product_variations", "", "product,sort_order", 10000, 0, {})
    .filter((variation) => productIds.has(relationId(variation, "product")));
}

function productExpirationGroups(app, storeId, now) {
  const products = findRecords(app, "products", "store = {:store}", "name", 10000, 0, { store: storeId });
  const variations = loadProductVariationsForStore(app, products);
  const variationsByProduct = {};
  variations.forEach((variation) => {
    const productId = relationId(variation, "product");
    if (!variationsByProduct[productId]) variationsByProduct[productId] = [];
    variationsByProduct[productId].push(variation);
  });
  return products.map((product) => {
    const dates = [];
    const general = normalizeCivilDate(recordValue(product, "expiration_date"), true) || "";
    if (general) dates.push({ kind: "product", id: product.id, name: recordString(product, "name"), date: general, days: daysUntilExpiration(general, now) });
    (variationsByProduct[product.id] || []).forEach((variation) => {
      const date = normalizeCivilDate(recordValue(variation, "expiration_date"), true) || "";
      if (!date) return;
      const name = [recordString(variation, "variation_type") || "Variación", recordString(variation, "value") || "Sin valor"].join(": ");
      dates.push({ kind: "variation", id: variation.id, name, date, days: daysUntilExpiration(date, now) });
    });
    return { product, dates };
  }).filter((group) => group.dates.length);
}

function expirationSummary(groups) {
  let expired = 0;
  let upcoming30 = 0;
  groups.forEach((group) => {
    if (group.dates.some((item) => item.days <= 0)) expired += 1;
    else if (group.dates.some((item) => item.days > 0 && item.days <= 30)) upcoming30 += 1;
  });
  return { expired_products: expired, upcoming_30_products: upcoming30 };
}

function clampPage(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function parseAdminQueryPayload(body) {
  const keys = Object.keys(body || {}).filter((key) => typeof body[key] !== "function").sort();
  const allowedKeys = ["page", "page_size", "query", "view", "window_days"];
  if (!keys.includes("page") || !keys.includes("view") || !keys.includes("window_days")) return null;
  if (keys.some((key) => !allowedKeys.includes(key))) return null;
  const view = bodyValue(body, "view");
  const windowDays = Number(bodyValue(body, "window_days"));
  const page = clampPage(bodyValue(body, "page"));
  const rawPageSize = bodyValue(body, "page_size");
  const pageSize = rawPageSize === undefined || rawPageSize === null ? 10 : rawPageSize;
  const rawQuery = bodyValue(body, "query");
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || ![5, 10].includes(pageSize)) return null;
  if (rawQuery !== undefined && rawQuery !== null && typeof rawQuery !== "string") return null;
  const query = String(rawQuery || "").trim().replace(/\s+/g, " ");
  if (!["summary", "expired", "upcoming"].includes(view)) return null;
  if (![30, 60, 90].includes(windowDays)) return null;
  if (query.length > 80) return null;
  return { view, windowDays, page, pageSize, query };
}

function filterAdminExpirationItems(items, query) {
  const normalizeSearchText = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const needle = normalizeSearchText(query);
  if (!needle) return items;
  return items.filter((item) => {
    if (normalizeSearchText(item.name).includes(needle)) return true;
    return (item.affected_variations || []).some((variation) => normalizeSearchText(variation.name).includes(needle));
  });
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function handleAdminExpirationQuery(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const role = recordString(info.auth, "role");
    if (!info.auth || !["store_admin", "store_staff"].includes(role)) return e.json(403, { ok: false, error: "unauthorized" });
    const storeId = relationId(info.auth, "store");
    const store = findRecord($app, "stores", storeId);
    if (!store || !storeExpirationEnabled(store)) return e.json(403, { ok: false, error: "premium_required" });
    if (!authCanManageStore(e, storeId)) return e.json(403, { ok: false, error: "permission_denied" });
    const parsed = parseAdminQueryPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const groups = productExpirationGroups($app, storeId, new Date());
    const summary = expirationSummary(groups);
    if (parsed.view === "summary") return e.json(200, { ok: true, summary, page: 1, page_size: parsed.pageSize, total_pages: 1, total_items: 0, items: [] });

    const selected = filterAdminExpirationItems(groups.map((group) => {
      const hasExpired = group.dates.some((item) => item.days <= 0);
      const affected = parsed.view === "expired"
        ? group.dates.filter((item) => item.days <= 0)
        : hasExpired ? [] : group.dates.filter((item) => item.days > 0 && item.days <= parsed.windowDays);
      if (!affected.length) return null;
      affected.sort((left, right) => left.days - right.days || left.name.localeCompare(right.name));
      const primary = affected[0];
      return {
        product_id: String(group.product.id || "").slice(0, 15),
        name: boundedText(recordString(group.product, "name") || "Producto", 160),
        mode: affected.some((item) => item.kind === "variation") ? "variations" : "general",
        expiration_date: primary.date,
        days_left: primary.days,
        affected_variations: affected.filter((item) => item.kind === "variation").map((item) => ({
          id: String(item.id || "").slice(0, 15),
          name: boundedText(item.name, 160),
          expiration_date: item.date,
          days_left: item.days,
        })),
      };
    }).filter(Boolean).sort((left, right) => left.days_left - right.days_left || left.name.localeCompare(right.name)), parsed.query);
    const totalItems = selected.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / parsed.pageSize));
    const page = Math.min(parsed.page, totalPages);
    return e.json(200, {
      ok: true,
      summary,
      page,
      page_size: parsed.pageSize,
      total_pages: totalPages,
      total_items: totalItems,
      items: selected.slice((page - 1) * parsed.pageSize, page * parsed.pageSize),
    });
  } catch (_) {
    return e.json(500, { ok: false, error: "expiration_query_failed" });
  }
}

function loadOrderAvailabilityRecords(app, record) {
  const orderId = relationId(record, "order");
  const order = findRecord(app, "orders", orderId);
  const storeId = relationId(order, "store");
  const store = findRecord(app, "stores", storeId);
  if (!order || !store || !storeId) return null;
  if (!storeExpirationEnabled(store)) return { order, store, storeId, capabilityInactive: true };
  const productId = relationId(record, "product");
  const product = findRecord(app, "products", productId);
  if (!product || relationId(product, "store") !== storeId) return null;
  const variations = variationsForProduct(app, product.id);
  const variationId = relationId(record, "variation");
  const variation = variationId ? variations.find((item) => item.id === variationId) || null : null;
  if (variationId && !variation) return null;
  return { order, store, storeId, product, variations, variation, capabilityInactive: false };
}

function canonicalizeOrderItem(record, resolved) {
  const product = resolved.product;
  const variation = resolved.variation;
  record.set("product_name", boundedText(recordString(product, "name") || "Producto", 180));
  record.set("product_ref", String(product.id || "").slice(0, 15));
  record.set("only_usd", recordBool(product, "only_usd"));
  if (variation) {
    const label = boundedText(`${recordString(variation, "variation_type") || "Variación"}: ${recordString(variation, "value") || "Sin valor"}`, 180);
    record.set("variation_name", label);
    record.set("variation_label", label);
    record.set("variation_ref", boundedText(recordString(variation, "internal_ref"), 180));
  } else {
    record.set("variation_name", "");
    record.set("variation_label", "");
    record.set("variation_ref", "");
  }
}

function validateOrderItemRequest(e) {
  if (!e || !e.record || recordBool(e.record, "is_gift")) return null;
  const resolved = loadOrderAvailabilityRecords(e.app, e.record);
  if (!resolved) return safeRequestError("product_unavailable", "Este producto ya no está disponible.", "product");
  if (resolved.capabilityInactive) return null;
  if (recordValue(resolved.product, "active") === false) {
    return safeRequestError("product_unavailable", "Este producto ya no está disponible.", "product");
  }
  if (recordBool(resolved.product, "has_variations") && !resolved.variation) {
    return safeRequestError("variation_required", "Selecciona una variación disponible.", "variation");
  }
  if (resolved.variation && recordValue(resolved.variation, "active") === false) {
    return safeRequestError("product_unavailable", "Este producto ya no está disponible.", "variation");
  }
  if (resolved.variation && recordValue(resolved.product, "track_stock") !== false
    && Number(recordValue(resolved.variation, "stock") || 0) <= 0
    && !recordBool(resolved.variation, "allow_preorder")) {
    return safeRequestError("product_unavailable", "Este producto ya no está disponible.", "variation");
  }
  if (!resolved.variation && !recordBool(resolved.product, "has_variations")
    && recordValue(resolved.product, "track_stock") !== false
    && Number(recordValue(resolved.product, "stock") || 0) <= 0
    && !recordBool(resolved.product, "allow_preorder")) {
    return safeRequestError("product_unavailable", "Este producto ya no está disponible.", "product");
  }
  const availability = evaluateCommercialAvailability({
    store: resolved.store,
    product: resolved.product,
    variations: resolved.variations,
    variation: resolved.variation,
    now: new Date(),
  });
  if (!availability.available) return safeRequestError("product_unavailable", "Este producto ya no está disponible.", "product");
  canonicalizeOrderItem(e.record, resolved);
  return null;
}

function cycleKey(storeId, entityCollection, entityId, date, threshold) {
  return `${storeId}:${entityCollection}:${entityId}:${date}:${threshold}`;
}

function cycleExists(app, key) {
  return findRecords(app, CYCLES_COLLECTION, "cycle_key = {:key}", "", 1, 0, { key }).length > 0;
}

function expirationSettingsEnabled(app, storeId) {
  const settings = findRecords(app, "settings", "store = {:store} && active = true", "-updated", 1, 0, { store: storeId })[0] || null;
  return !settings || (recordValue(settings, "notifications_enabled") !== false && recordValue(settings, "notify_expiration_alerts") !== false);
}

function notificationSpec(kind, threshold) {
  const variation = kind === "variation";
  if (threshold === 0) return {
    type: variation ? "variation_expired" : "product_expired",
    title: variation ? "Variación vencida" : "Producto vencido",
    priority: "critical",
  };
  if (threshold === 30) return {
    type: variation ? "variation_expiring_critical" : "product_expiring_critical",
    title: variation ? "Variación próxima a vencer" : "Producto próximo a vencer",
    priority: "important",
  };
  return {
    type: variation ? "variation_expiring_soon" : "product_expiring_soon",
    title: variation ? "Variación próxima a vencer" : "Producto próximo a vencer",
    priority: "normal",
  };
}

function safeTarget(store, productId, variationId) {
  const slug = recordString(store, "slug").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80) || "powerzona";
  const query = `?product=${productId}${variationId ? `&variation=${variationId}` : ""}`;
  return `/t/${slug}/admin/products${query}`;
}

function fillNotification(notification, store, product, candidates, threshold) {
  const spec = notificationSpec(candidates[0].kind, threshold);
  const names = candidates.map((item) => item.name).filter(Boolean).slice(0, 12);
  const date = candidates[0].date;
  const days = candidates[0].days;
  const productName = boundedText(recordString(product, "name") || "Producto", 160);
  const timing = threshold === 0 ? `venció el ${date}` : `vence en ${days} día${days === 1 ? "" : "s"} (${date})`;
  const message = candidates[0].kind === "variation"
    ? `${productName} · ${names.join(", ")} ${timing}.`
    : `${productName} ${timing}.`;
  notification.set("store", store.id);
  notification.set("type", spec.type);
  notification.set("title", spec.title);
  notification.set("message", boundedText(message, 600));
  notification.set("status", "unread");
  notification.set("priority", spec.priority);
  notification.set("target_url", safeTarget(store, product.id, candidates.length === 1 && candidates[0].kind === "variation" ? candidates[0].id : ""));
  notification.set("entity_collection", candidates[0].kind === "variation" ? "product_variations" : "products");
  notification.set("entity_id", `${String(product.id || "").slice(0, 15)}_${candidates[0].kind}_${threshold}_${date}`.slice(0, 80));
  notification.set("metadata_json", {
    source: "v7e9_product_expiration",
    product_id: product.id,
    expiration_date: date,
    threshold,
    variation_ids: candidates.filter((item) => item.kind === "variation").map((item) => item.id),
  });
  return notification;
}

function createNotification(app, store, product, candidates, threshold) {
  const collection = app.findCollectionByNameOrId("store_notifications");
  const notification = new Record(collection, {});
  fillNotification(notification, store, product, candidates, threshold);
  app.save(notification);
  return notification;
}

function existingGroupNotification(app, store, product, candidate, threshold) {
  const entityCollection = candidate.kind === "variation" ? "product_variations" : "products";
  const cycles = findRecords(app, CYCLES_COLLECTION, `
    store = {:store} && product = {:product} && expiration_date = {:date}
      && threshold = {:threshold} && entity_collection = {:collection}
  `, "created", 50, 0, {
    store: store.id,
    product: product.id,
    date: candidate.date,
    threshold,
    collection: entityCollection,
  });
  for (const cycle of cycles) {
    const notification = findRecord(app, "store_notifications", relationId(cycle, "notification"));
    if (notification) return notification;
  }
  return null;
}

function createCycle(app, store, product, candidate, threshold, notification) {
  const key = cycleKey(store.id, candidate.kind === "variation" ? "product_variations" : "products", candidate.id, candidate.date, threshold);
  if (cycleExists(app, key)) return null;
  const collection = app.findCollectionByNameOrId(CYCLES_COLLECTION);
  const cycle = new Record(collection, {});
  cycle.set("store", store.id);
  cycle.set("product", product.id);
  cycle.set("variation", candidate.kind === "variation" ? candidate.id : "");
  cycle.set("notification", notification ? notification.id : "");
  cycle.set("entity_collection", candidate.kind === "variation" ? "product_variations" : "products");
  cycle.set("entity_id", candidate.id);
  cycle.set("expiration_date", candidate.date);
  cycle.set("threshold", threshold);
  cycle.set("cycle_key", key);
  app.save(cycle);
  return cycle;
}

function processStoreExpirationAlerts(app, store, now) {
  if (!store || !storeExpirationEnabled(store) || !expirationSettingsEnabled(app, store.id)) return { notifications: 0, cycles: 0 };
  const groups = productExpirationGroups(app, store.id, now);
  let notificationCount = 0;
  let cycleCount = 0;
  groups.forEach((group) => {
    const due = group.dates.filter((item) => currentThreshold(item.days) !== null && !cycleExists(
      app,
      cycleKey(store.id, item.kind === "variation" ? "product_variations" : "products", item.id, item.date, currentThreshold(item.days))
    ));
    const grouped = {};
    due.forEach((item) => {
      const threshold = currentThreshold(item.days);
      const key = `${item.kind}:${item.date}:${threshold}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    Object.keys(grouped).forEach((key) => {
      const candidates = grouped[key];
      const threshold = currentThreshold(candidates[0].days);
      let notification = existingGroupNotification(app, store, group.product, candidates[0], threshold);
      if (!notification) {
        notification = createNotification(app, store, group.product, candidates, threshold);
        notificationCount += 1;
      }
      candidates.forEach((candidate) => {
        if (createCycle(app, store, group.product, candidate, threshold, notification)) cycleCount += 1;
      });
      if (notificationCount === 0 || candidates[0].kind === "variation") {
        const allCandidates = group.dates.filter((item) => item.kind === candidates[0].kind
          && item.date === candidates[0].date
          && currentThreshold(item.days) === threshold);
        fillNotification(notification, store, group.product, allCandidates, threshold);
        app.save(notification);
      }
    });
  });
  return { notifications: notificationCount, cycles: cycleCount };
}

function processAllExpirationAlerts(app, now) {
  const stores = findRecords(app, "stores", "", "id", 10000, 0, {});
  return stores.reduce((summary, store) => {
    try {
      const result = processStoreExpirationAlerts(app, store, now);
      summary.notifications += result.notifications;
      summary.cycles += result.cycles;
    } catch (_) {
      try { app.logger().error("PowerZona expiration cron continued safely.", "code", "PZ_EXPIRATION_STORE_CRON_FAILED"); } catch (_) {}
      summary.failures += 1;
    }
    return summary;
  }, { notifications: 0, cycles: 0, failures: 0 });
}

function deleteRecordSafe(app, record) {
  try { app.delete(record); return true; } catch (_) { return false; }
}

function clearEntityExpirationState(app, entityCollection, entityId) {
  const cycles = findRecords(app, CYCLES_COLLECTION, "entity_collection = {:collection} && entity_id = {:id}", "", 500, 0, {
    collection: entityCollection,
    id: entityId,
  });
  const notificationIds = new Set(cycles.map((cycle) => relationId(cycle, "notification")).filter(Boolean));
  cycles.forEach((cycle) => deleteRecordSafe(app, cycle));
  notificationIds.forEach((notificationId) => {
    const remaining = findRecords(app, CYCLES_COLLECTION, "notification = {:notification}", "created", 500, 0, { notification: notificationId });
    if (!remaining.length) {
      const notification = findRecord(app, "store_notifications", notificationId);
      if (notification) deleteRecordSafe(app, notification);
      return;
    }
    const notification = findRecord(app, "store_notifications", notificationId);
    const first = remaining[0];
    const store = findRecord(app, "stores", relationId(first, "store"));
    const product = findRecord(app, "products", relationId(first, "product"));
    if (!notification || !store || !product) return;
    const candidates = remaining.map((cycle) => {
      const kind = recordString(cycle, "entity_collection") === "product_variations" ? "variation" : "product";
      const entity = kind === "variation"
        ? findRecord(app, "product_variations", recordString(cycle, "entity_id"))
        : product;
      if (!entity) return null;
      const name = kind === "variation"
        ? `${recordString(entity, "variation_type") || "Variación"}: ${recordString(entity, "value") || "Sin valor"}`
        : recordString(product, "name");
      const date = recordString(cycle, "expiration_date");
      return { kind, id: entity.id, name, date, days: daysUntilExpiration(date, new Date()) };
    }).filter(Boolean);
    if (!candidates.length) return;
    fillNotification(notification, store, product, candidates, Number(recordValue(first, "threshold") || 0));
    app.save(notification);
  });
  return cycles.length;
}

function handleExpirationRecordChange(e, collectionName) {
  const record = e && e.record;
  if (!record) return;
  const currentDate = normalizeCivilDate(recordValue(record, "expiration_date"), true) || "";
  const original = originalRecord(record);
  const previousDate = original ? normalizeCivilDate(recordValue(original, "expiration_date"), true) || "" : "";
  if (original ? currentDate === previousDate : !currentDate) return;
  const entityCollection = collectionName;
  clearEntityExpirationState(e.app, entityCollection, record.id);
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (resolved && resolved.store) processStoreExpirationAlerts(e.app, resolved.store, new Date());
}

function handleExpirationRecordDelete(e, collectionName) {
  const record = e && e.record;
  if (!record) return;
  clearEntityExpirationState(e.app, collectionName, record.id);
}

function continueAfterExpirationSideEffect(e, collectionName, action) {
  try {
    if (action === "delete") handleExpirationRecordDelete(e, collectionName);
    else handleExpirationRecordChange(e, collectionName);
  } catch (_) {
    try { e.app.logger().error("PowerZona expiration side effect continued safely.", "code", "PZ_EXPIRATION_SIDE_EFFECT_FAILED"); } catch (_) {}
  }
  return e.next();
}

function queryCount(app, sql, bindings, model) {
  try {
    const rows = arrayOf(new DynamicModel(model));
    app.db().newQuery(sql).bind(bindings || {}).all(rows);
    const value = rows[0] && Number(rows[0].count || 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch (_) {
    return 0;
  }
}

function getStoreExpirationCleanupPreview(app, storeId) {
  if (!RECORD_ID_PATTERN.test(String(storeId || ""))) return { products: 0, variations: 0, notifications: 0, cycles: 0 };
  const products = queryCount(app, "SELECT COUNT(*) AS count FROM products WHERE store = {:store} AND expiration_date != ''", { store: storeId }, { count: 0 });
  const variations = queryCount(app, `
    SELECT COUNT(*) AS count FROM product_variations
    WHERE expiration_date != '' AND product IN (SELECT id FROM products WHERE store = {:store})
  `, { store: storeId }, { count: 0 });
  const cycles = queryCount(app, "SELECT COUNT(*) AS count FROM product_expiration_cycles WHERE store = {:store}", { store: storeId }, { count: 0 });
  const notifications = queryCount(app, `
    SELECT COUNT(*) AS count FROM store_notifications
    WHERE store = {:store} AND type IN ('product_expiring_soon','product_expiring_critical','product_expired','variation_expiring_soon','variation_expiring_critical','variation_expired')
  `, { store: storeId }, { count: 0 });
  return { products, variations, notifications, cycles };
}

function expirationCleanupAuditContext(options) {
  const source = options && typeof options === "object" ? options : {};
  const actor = source.actor || null;
  const actorId = String(actor && actor.id || "").trim();
  const planAuditId = String(source.planAuditId || source.plan_audit_id || "").trim();
  if (recordString(actor, "role") !== "master_admin"
    || !RECORD_ID_PATTERN.test(actorId)
    || !RECORD_ID_PATTERN.test(planAuditId)) {
    throw new Error("expiration_cleanup_audit_context_required");
  }
  return { actor, planAuditId };
}

function expirationCleanupLabel(collectionName, record, product) {
  if (collectionName === "products") return boundedText(recordString(record, "name") || "Producto", 180);
  const type = boundedText(recordString(record, "variation_type") || "Variación", 80);
  const value = boundedText(recordString(record, "value") || "Sin valor", 80);
  const productName = boundedText(recordString(product, "name"), 80);
  return boundedText(`${type}: ${value}${productName ? ` · ${productName}` : ""}`, 180);
}

function createExpirationDowngradeCleanupActivity(app, context, storeId, collectionName, record, product, previousDate) {
  const isProduct = collectionName === "products";
  const resourceType = isProduct ? "product" : "product_variation";
  const label = expirationCleanupLabel(collectionName, record, product);
  return storeActivity.createActivity(app, {
    storeId,
    actor: context.actor,
    module: "catalog",
    action: `${resourceType}_expiration_cleared_for_plan_downgrade`,
    severity: "critical",
    resourceType,
    resourceId: String(record.id || ""),
    resourceLabel: label,
    changedFields: ["expiration_date"],
    previousValues: { expiration_date: previousDate },
    newValues: { expiration_date: "" },
    summary: `Eliminó el vencimiento de ${label} por cambio de plan`,
    sourceEventKey: `expiration:downgrade:${context.planAuditId}:${collectionName}:${String(record.id || "")}`,
  });
}

function cleanupStoreExpirationData(app, storeId, options) {
  const auditContext = expirationCleanupAuditContext(options);
  const before = getStoreExpirationCleanupPreview(app, storeId);
  const products = findAllRecordsStrict(app, "products", "store = {:store}", "id", { store: storeId });
  const productIds = new Set(products.map((product) => product.id));
  const productsById = new Map(products.map((product) => [String(product.id || ""), product]));
  products.forEach((product) => {
    const rawDate = recordString(product, "expiration_date");
    if (!rawDate) return;
    const previousDate = normalizeCivilDate(rawDate, true) || "Configurado";
    product.set("expiration_date", "");
    app.save(product);
    createExpirationDowngradeCleanupActivity(
      app, auditContext, storeId, "products", product, product, previousDate
    );
  });
  findAllRecordsStrict(app, "product_variations", "", "id", {}).forEach((variation) => {
    const productId = relationId(variation, "product");
    if (!productIds.has(productId)) return;
    const rawDate = recordString(variation, "expiration_date");
    if (!rawDate) return;
    const previousDate = normalizeCivilDate(rawDate, true) || "Configurado";
    variation.set("expiration_date", "");
    app.save(variation);
    createExpirationDowngradeCleanupActivity(
      app, auditContext, storeId, "product_variations", variation,
      productsById.get(productId) || null, previousDate
    );
  });
  findAllRecordsStrict(app, CYCLES_COLLECTION, "store = {:store}", "id", { store: storeId }).forEach((cycle) => app.delete(cycle));
  findAllRecordsStrict(app, "store_notifications", "store = {:store}", "id", { store: storeId })
    .filter((notification) => EXPIRATION_NOTIFICATION_TYPES.includes(recordString(notification, "type")))
    .forEach((notification) => app.delete(notification));
  return before;
}

module.exports = {
  CAPABILITY,
  CYCLES_COLLECTION,
  EXPIRATION_NOTIFICATION_TYPES,
  THRESHOLDS,
  cleanupStoreExpirationData,
  continueAfterExpirationSideEffect,
  createExpirationDowngradeCleanupActivity,
  createProductExpirationAutoClearActivity,
  cycleKey,
  currentThreshold,
  daysUntilExpiration,
  evaluateCommercialAvailability,
  expirationSummary,
  filterAdminExpirationItems,
  getStoreExpirationCleanupPreview,
  handleAdminExpirationQuery,
  handleDateWriteRequest,
  handleExpirationRecordChange,
  handleExpirationRecordDelete,
  havanaTodayKey,
  isExpired,
  normalizeCivilDate,
  parseAdminQueryPayload,
  processAllExpirationAlerts,
  processStoreExpirationAlerts,
  raiseExpirationRequestError,
  requireAuthenticatedUser(e) {
    setPrivateHeaders(e);
    if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
    return e.next();
  },
  storeExpirationEnabled,
  validateDateWriteRequest,
  validateExpirationSettingsRequest,
  validateOrderItemRequest,
  variationOtherwiseSellable,
};
