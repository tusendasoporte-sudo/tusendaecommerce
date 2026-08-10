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
const commerce = typeof __hooks === "undefined"
  ? require("./pz_product_commerce_lib.js")
  : require(`${__hooks}/pz_product_commerce_lib.js`);

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

function recordIsNew(record) {
  if (!record || typeof record.isNew !== "function") return false;
  try { return record.isNew() === true; } catch (_) { return false; }
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
  if (!text) return "";
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

  const usesVariations = commerce.usesVariations(product);
  const units = commerce.buildProductUnits(product, variations);
  const mode = usesVariations ? "variations" : "general";
  if (!usesVariations) {
    if (selectedVariation) return { available: false, reason: "variation_forbidden", mode };
    const unit = units[0] || null;
    const date = commerce.effectiveUnitExpirationDate(product, unit, variations);
    if (date && isExpired(date, source.now)) return { available: false, reason: "product_expired", mode };
    return { available: true, reason: "available", mode: date ? mode : "none" };
  }

  if (selectedVariation) {
    const variationId = recordString(selectedVariation, "id");
    const unit = units.find((candidate) => candidate.variation_id === variationId) || null;
    if (!unit) return { available: false, reason: "variation_unavailable", mode };
    const date = commerce.effectiveUnitExpirationDate(product, unit, variations);
    if (date && isExpired(date, source.now)) return { available: false, reason: "variation_expired", mode };
    return { available: true, reason: "available", mode };
  }

  const candidates = units.filter((unit) => variationOtherwiseSellable(product, unit.variation));
  if (candidates.length && candidates.every((unit) => {
    const date = commerce.effectiveUnitExpirationDate(product, unit, variations);
    return date && isExpired(date, source.now);
  })) {
    return { available: false, reason: "all_sellable_variations_expired", mode };
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
  const code = String(error.code || "invalid_expiration_date");
  data[String(error.field || "expiration_date")] = typeof ValidationError === "function"
    ? new ValidationError(code, message)
    : { code, message };
  const status = Number(error.status) || 400;
  if (status === 404 && typeof NotFoundError === "function") throw new NotFoundError(message, data);
  if (status === 403 && typeof ForbiddenError === "function") throw new ForbiddenError(message, data);
  if (status >= 500 && typeof InternalServerError === "function") throw new InternalServerError(message, data);
  if (typeof BadRequestError === "function") throw new BadRequestError(message, data);
  const fallback = new Error(code);
  fallback.code = code;
  fallback.status = status;
  fallback.data = data;
  throw fallback;
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

function requestHeader(info, name) {
  const lower = String(name || "").toLowerCase();
  const target = lower.replace(/-/g, "_");
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") return String(headers.get(name) || headers.get(lower) || headers.get(target) || "").trim().slice(0, 80);
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase().replace(/-/g, "_") === target);
  return key ? String(headers[key] || "").trim().slice(0, 80) : "";
}

function authCanManageStore(e, storeId) {
  const auth = requestAuthRecord(e);
  const app = e && e.app ? e.app : (typeof $app === "undefined" ? null : $app);
  const store = findRecord(app, "stores", storeId);
  return !!auth && recordString(auth, "role") !== "master_admin" && !!store && teamPermissions.hasStorePermission(
    app,
    auth,
    store,
    "catalog.expirations.manage"
  );
}

function authBelongsToAnotherStore(e, storeId) {
  const auth = requestAuthRecord(e);
  const authStoreId = relationId(auth, "store");
  return !!authStoreId && authStoreId !== storeId;
}

function variationsForProduct(app, productId) {
  return findAllRecordsStrict(
    app,
    "product_variations",
    "product = {:product}",
    "sort_order,id",
    { product: productId }
  );
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

function recordSnapshot(record, keys) {
  const snapshot = { id: recordString(record, "id") || String(record && record.id || "") };
  (keys || []).forEach((key) => {
    const value = recordValue(record, key);
    if (value !== undefined) snapshot[key] = value;
  });
  return snapshot;
}

function productCommerceSnapshot(record) {
  return recordSnapshot(record, [
    "store", "name", "active", "has_variations", "track_stock", "allow_preorder",
    "base_price_usd", "price_usd", "price", "cost_usd", "stock", "expiration_date",
  ]);
}

function variationCommerceSnapshot(record) {
  return recordSnapshot(record, [
    "product", "variation_type", "value", "active", "price_usd", "cost_usd", "stock",
    "allow_preorder", "expiration_date",
  ]);
}

function replaceVariationSnapshot(variations, variation) {
  const targetId = recordString(variation, "id") || String(variation && variation.id || "");
  let replaced = false;
  const result = (variations || []).map((candidate) => {
    if ((recordString(candidate, "id") || String(candidate && candidate.id || "")) !== targetId) return variationCommerceSnapshot(candidate);
    replaced = true;
    return variationCommerceSnapshot(variation);
  });
  if (!replaced && targetId) result.push(variationCommerceSnapshot(variation));
  return result;
}

function unitExpirationStates(product, variations, now) {
  const productSnapshot = productCommerceSnapshot(product);
  const variationSnapshots = (variations || []).map(variationCommerceSnapshot);
  const productName = boundedText(recordString(productSnapshot, "name") || "Producto", 160);
  const states = new Map();
  commerce.buildProductUnits(productSnapshot, variationSnapshots).forEach((unit) => {
    if (unit.active === false) return;
    const variation = unit.variation || null;
    const date = normalizeCivilDate(
      commerce.effectiveUnitExpirationDate(productSnapshot, unit, variationSnapshots),
      true
    ) || "";
    const variationName = variation
      ? `${recordString(variation, "variation_type") || "Variación"}: ${recordString(variation, "value") || "Sin valor"}`
      : "";
    const entityCollection = unit.kind === "variation" ? "product_variations" : "products";
    states.set(`${entityCollection}:${unit.entity_id}`, {
      kind: unit.kind,
      id: unit.entity_id,
      productId: unit.product_id,
      productName,
      variationName: boundedText(variationName, 160),
      date,
      expired: Boolean(date && isExpired(date, now)),
    });
  });
  return states;
}

function expirationTransitionContext(e, collectionName, now) {
  const record = e && e.record;
  const original = originalRecord(record);
  if (!record || !original || recordIsNew(record)) return null;
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (!resolved || !resolved.product) return null;
  const currentVariations = variationsForProduct(e.app, resolved.product.id);
  const beforeProduct = collectionName === "products"
    ? productCommerceSnapshot(original)
    : productCommerceSnapshot(resolved.product);
  const beforeVariations = collectionName === "product_variations"
    ? replaceVariationSnapshot(currentVariations, original)
    : currentVariations.map(variationCommerceSnapshot);
  return {
    now,
    before: unitExpirationStates(beforeProduct, beforeVariations, now),
  };
}

function currentUnitExpirationStates(e, collectionName, now) {
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (!resolved || !resolved.product) return new Map();
  let variations = variationsForProduct(e.app, resolved.product.id);
  if (collectionName === "product_variations") variations = replaceVariationSnapshot(variations, e.record);
  return unitExpirationStates(resolved.product, variations, now);
}

function administrativeActor(e) {
  const actor = requestAuthRecord(e);
  const role = recordString(actor, "role");
  const status = recordString(actor, "status").toLowerCase();
  if (!actor || !["master_admin", "store_admin", "store_staff"].includes(role)) return null;
  if (role !== "master_admin" && status !== "active") return null;
  return actor;
}

function createUnitExpirationTransitionActivities(app, e, context, collectionName) {
  const actor = administrativeActor(e);
  if (!actor || !context) return [];
  const after = currentUnitExpirationStates(e, collectionName, context.now);
  const version = boundedText(
    recordString(e && e.record, "updated") || context.now.toISOString(),
    80
  ).replace(/\s+/g, "T");
  const created = [];
  context.before.forEach((previous, key) => {
    const next = after.get(key);
    if (!next || previous.expired === next.expired) return;
    const isVariation = next.kind === "variation";
    const action = next.expired
      ? "product_unit_expired"
      : (isVariation ? "variation_expiration_corrected" : "product_expiration_corrected");
    const label = boundedText(isVariation
      ? `${next.productName} · ${next.variationName}`
      : next.productName, 180);
    const storeId = relationId(resolveDateRequestRecords(e, collectionName).product, "store");
    if (!storeId) return;
    created.push(storeActivity.createActivity(app, {
      storeId,
      actor,
      module: "catalog",
      action,
      severity: next.expired ? "critical" : "important",
      resourceType: isVariation ? "product_variation" : "product",
      resourceId: next.id,
      parentProductId: next.productId,
      variationId: isVariation ? next.id : "",
      resourceLabel: label,
      changedFields: ["expiration_date"],
      previousValues: { expiration_date: previous.date, expired: previous.expired },
      newValues: { expiration_date: next.date, expired: next.expired },
      summary: next.expired
        ? `Estado efectivo de ${label} cambió a ${isVariation ? "Vencida" : "Vencido"}`
        : `Corrigió el vencimiento de ${label}`,
      sourceEventKey: `expiration:unit:${action}:${next.id}:${previous.date || "none"}:${next.date || "none"}:${version}`,
    }));
  });
  if (collectionName === "product_variations"
    && !created.some((activity) => recordString(activity, "action") === "variation_expiration_corrected")) {
    const original = originalRecord(e && e.record);
    const previousDate = original ? normalizeCivilDate(recordValue(original, "expiration_date"), true) || "" : "";
    const nextDate = normalizeCivilDate(recordValue(e && e.record, "expiration_date"), true) || "";
    if (previousDate !== nextDate && isExpired(previousDate, context.now) && !isExpired(nextDate, context.now)) {
      const resolved = resolveDateRequestRecords(e, collectionName);
      const storeId = resolved && resolved.product ? relationId(resolved.product, "store") : "";
      const productName = boundedText(recordString(resolved && resolved.product, "name") || "Producto", 160);
      const variationName = boundedText(
        `${recordString(e.record, "variation_type") || "Variación"}: ${recordString(e.record, "value") || "Sin valor"}`,
        160
      );
      const label = boundedText(`${productName} · ${variationName}`, 180);
      if (storeId) {
        created.push(storeActivity.createActivity(app, {
          storeId,
          actor,
          module: "catalog",
          action: "variation_expiration_corrected",
          severity: "important",
          resourceType: "product_variation",
          resourceId: e.record.id,
          parentProductId: resolved.product.id,
          variationId: e.record.id,
          resourceLabel: label,
          changedFields: ["expiration_date"],
          previousValues: { expiration_date: previousDate, expired: true },
          newValues: { expiration_date: nextDate, expired: false },
          summary: `Corrigió el vencimiento de ${label}`,
          sourceEventKey: `expiration:variation:corrected:${e.record.id}:${previousDate || "none"}:${nextDate || "none"}:${version}`,
        }));
      }
    }
  }
  if (collectionName === "products"
    && !created.some((activity) => recordString(activity, "action") === "product_expiration_corrected")) {
    const original = originalRecord(e && e.record);
    const previousDate = original ? normalizeCivilDate(recordValue(original, "expiration_date"), true) || "" : "";
    const nextDate = normalizeCivilDate(recordValue(e && e.record, "expiration_date"), true) || "";
    if (previousDate !== nextDate && isExpired(previousDate, context.now) && !isExpired(nextDate, context.now)) {
      const resolved = resolveDateRequestRecords(e, collectionName);
      const storeId = resolved && resolved.product ? relationId(resolved.product, "store") : "";
      const label = boundedText(recordString(e.record, "name") || "Producto", 180);
      if (storeId) {
        created.push(storeActivity.createActivity(app, {
          storeId,
          actor,
          module: "catalog",
          action: "product_expiration_corrected",
          severity: "important",
          resourceType: "product",
          resourceId: e.record.id,
          parentProductId: e.record.id,
          resourceLabel: label,
          changedFields: ["expiration_date"],
          previousValues: { expiration_date: previousDate, expired: true },
          newValues: { expiration_date: nextDate, expired: false },
          summary: `Corrigió el vencimiento de ${label}`,
          sourceEventKey: `expiration:product:corrected:${e.record.id}:${previousDate || "none"}:${nextDate || "none"}:${version}`,
        }));
      }
    }
  }
  return created;
}

function finiteRecordNumber(record, key) {
  const raw = recordValue(record, key);
  if (raw === null || raw === undefined || raw === "") return null;
  const value = Number(raw && typeof raw.string === "function" ? raw.string() : raw);
  return Number.isFinite(value) ? value : null;
}

function configuredPrice(record, keys) {
  for (const key of keys) {
    const raw = recordValue(record, key);
    if (raw === null || raw === undefined || raw === "") continue;
    return finiteRecordNumber(record, key);
  }
  return null;
}

function nonNegativeOptionalNumber(record, key) {
  const raw = recordValue(record, key);
  if (raw === null || raw === undefined || raw === "") return true;
  const value = finiteRecordNumber(record, key);
  return value !== null && value >= 0;
}

function parentCommerceConfigurationValid(product) {
  const price = configuredPrice(product, ["base_price_usd", "price_usd", "price"]);
  if (!(price > 0) || !nonNegativeOptionalNumber(product, "cost_usd")) return false;
  if (recordValue(product, "track_stock") !== false) {
    const stock = finiteRecordNumber(product, "stock");
    if (stock === null || stock < 0) return false;
  }
  return true;
}

function variationCommerceConfigurationValid(product, variation) {
  if (!variation || recordValue(variation, "active") === false) return false;
  if (relationId(variation, "product") !== (recordString(product, "id") || String(product.id || ""))) return false;
  const price = configuredPrice(variation, ["price_usd", "price"]);
  if (!(price > 0) || !nonNegativeOptionalNumber(variation, "cost_usd")) return false;
  if (recordValue(product, "track_stock") !== false) {
    const stock = finiteRecordNumber(variation, "stock");
    if (stock === null || stock < 0) return false;
  }
  return true;
}

function variationModeTransition(e, collectionName) {
  if (collectionName !== "products") return null;
  const body = requestBody(e);
  const original = originalRecord(e && e.record);
  if (!original || recordIsNew(e && e.record) || !bodyHas(body, "has_variations")) return null;
  const previous = commerce.usesVariations(original);
  const next = commerce.usesVariations(e.record);
  return previous === next ? null : { previous, next };
}

function validateVariationModeTransition(e, collectionName) {
  const transition = variationModeTransition(e, collectionName);
  if (!transition) return null;
  if (!transition.next && !parentCommerceConfigurationValid(e.record)) {
    return safeRequestError(
      "parent_commerce_invalid",
      "Configura un precio y stock válidos para dejar de usar variaciones.",
      "has_variations"
    );
  }
  if (transition.next) {
    const validVariation = variationsForProduct(e.app, e.record.id)
      .some((variation) => variationCommerceConfigurationValid(e.record, variation));
    if (!validVariation) {
      return safeRequestError(
        "valid_variation_required",
        "Crea al menos una variación activa con precio y stock válidos.",
        "has_variations"
      );
    }
  }
  return null;
}

function clearProductExpirationState(app, product, options) {
  if (!product) return 0;
  let removed = clearEntityExpirationState(app, "products", recordString(product, "id") || product.id, options);
  variationsForProduct(app, recordString(product, "id") || product.id).forEach((variation) => {
    removed += clearEntityExpirationState(app, "product_variations", variation.id, options);
  });
  return removed;
}

function createVariationModeActivity(app, e, transition) {
  const actor = administrativeActor(e);
  const product = e && e.record;
  const storeId = relationId(product, "store");
  if (!actor || !transition || !product || !storeId) return null;
  const action = transition.next ? "product_variations_enabled" : "product_variations_disabled";
  const label = boundedText(recordString(product, "name") || "Producto", 180);
  const version = boundedText(recordString(product, "updated") || `${transition.previous}-${transition.next}`, 80).replace(/\s+/g, "T");
  return storeActivity.createActivity(app, {
    storeId,
    actor,
    module: "catalog",
    action,
    severity: "important",
    resourceType: "product",
    resourceId: recordString(product, "id") || String(product.id || ""),
    resourceLabel: label,
    changedFields: ["has_variations"],
    previousValues: { has_variations: transition.previous },
    newValues: { has_variations: transition.next },
    summary: transition.next ? `Activó las variaciones de ${label}` : `Dejó de usar variaciones en ${label}`,
    sourceEventKey: `commerce:variation-mode:${String(product.id || "")}:${version}:${transition.next ? "enabled" : "disabled"}`,
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
    return safeRequestError("expiration_not_found", "No se encontró el recurso solicitado.", "expiration_date", 404);
  }
  const auth = requestAuthRecord(e);
  if (!auth || recordString(auth, "role") === "master_admin" || recordString(auth, "status").toLowerCase() !== "active") {
    return safeRequestError("expiration_unauthorized", "No tienes permiso para modificar esta fecha.", "expiration_date", 403);
  }
  if (!storeExpirationEnabled(resolved.store)) {
    return safeRequestError("expiration_premium_required", "Esta función está disponible solo en el plan Premium.", "expiration_date", 403);
  }
  if (!authCanManageStore(e, resolved.storeId)) {
    return safeRequestError("permission_denied", "No tienes permiso para modificar esta fecha.", "expiration_date", 403);
  }

  if (e && e.record && typeof e.record.set === "function") {
    e.record.set("expiration_date", normalized || "");
  }

  if (collectionName === "products" && normalized && commerce.usesVariations(e.record)) {
    const hasVariationDates = variationsForProduct(e.app, e.record.id).some((variation) => {
      return recordValue(variation, "active") !== false
        && Boolean(normalizeCivilDate(recordValue(variation, "expiration_date"), true));
    });
    const activatingVariations = variationModeTransition(e, collectionName);
    if (hasVariationDates && !(activatingVariations && activatingVariations.next)) {
      return safeRequestError("expiration_modes_conflict", "Elimina las fechas de las variaciones antes de usar una fecha general.");
    }
  }

  if (collectionName === "product_variations" && normalized
    && commerce.usesVariations(resolved.product)
    && recordValue(e.record, "active") !== false) {
    const productDate = normalizeCivilDate(recordValue(resolved.product, "expiration_date"), true) || "";
    if (productDate) {
      clearProductExpirationState(e.app, resolved.product, { strict: true });
      resolved.product.set("expiration_date", "");
      e.app.save(resolved.product);
      createProductExpirationAutoClearActivity(e.app, e, resolved, productDate, normalized);
    }
  }

  const original = originalRecord(e.record);
  const previousDate = original ? normalizeCivilDate(recordValue(original, "expiration_date"), true) || "" : "";
  if (original && previousDate !== normalized) {
    if (collectionName === "products" || commerce.usesVariations(resolved.product)) {
      clearProductExpirationState(e.app, resolved.product, { strict: true });
    } else {
      clearEntityExpirationState(e.app, collectionName, e.record.id, { strict: true });
    }
  }
  return null;
}

function validateVariationActivationState(e, collectionName, now) {
  if (collectionName !== "product_variations" || !e || !e.record) return null;
  const body = requestBody(e);
  const original = originalRecord(e.record);
  const explicitlyActivating = bodyHas(body, "active") && recordBool(e.record, "active");
  const creatingActive = !original && recordIsNew(e.record) && recordValue(e.record, "active") !== false;
  if (!explicitlyActivating && !creatingActive) return null;
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (!resolved || !resolved.product || !resolved.store) {
    return safeRequestError("expiration_management_unavailable", "La variación no está disponible temporalmente.", "active", 503);
  }
  if (!storeExpirationEnabled(resolved.store) || !commerce.usesVariations(resolved.product)) return null;
  const variations = replaceVariationSnapshot(variationsForProduct(e.app, resolved.product.id), e.record);
  const status = commerce.variationEffectiveStatus(resolved.product, e.record, variations, now || new Date());
  if (status.expired) {
    return safeRequestError(
      "variation_expired_cannot_activate",
      "No puedes activar esta variación porque su fecha de vencimiento ya pasó. Corrige o elimina la fecha antes de activarla.",
      "active",
      409,
    );
  }
  return null;
}

function validateProductActivationState(e, collectionName, now) {
  if (collectionName !== "products" || !e || !e.record) return null;
  const body = requestBody(e);
  const original = originalRecord(e.record);
  const explicitlyShowing = bodyHas(body, "active") && recordBool(e.record, "active");
  const switchingToParent = Boolean(original && bodyHas(body, "has_variations")
    && commerce.usesVariations(original) && !commerce.usesVariations(e.record)
    && recordBool(e.record, "active"));
  const creatingVisibleParent = !original && recordIsNew(e.record)
    && !commerce.usesVariations(e.record)
    && recordValue(e.record, "active") !== false;
  if (!explicitlyShowing && !switchingToParent && !creatingVisibleParent) return null;
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (!resolved || !resolved.store) {
    return safeRequestError("expiration_management_unavailable", "El producto no está disponible temporalmente.", "active", 503);
  }
  if (!storeExpirationEnabled(resolved.store)) return null;
  const status = commerce.productEffectiveStatus(e.record, now || new Date());
  if (status.expired) {
    return safeRequestError(
      "product_expired_cannot_show",
      "No puedes mostrar este producto porque su fecha de vencimiento ya pasó. Corrige o elimina la fecha antes de mostrarlo.",
      "active",
      409,
    );
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
    const body = requestBody(e);
    const now = new Date();
    const transitionContext = expirationTransitionContext(e, collectionName, now);
    const modeTransition = variationModeTransition(e, collectionName);
    const modeSafe = validateVariationModeTransition(e, collectionName);
    if (modeSafe) raiseExpirationRequestError(modeSafe);
    const productActivationSafe = validateProductActivationState(e, collectionName, now);
    if (productActivationSafe) raiseExpirationRequestError(productActivationSafe);
    const activationSafe = validateVariationActivationState(e, collectionName, now);
    if (activationSafe) raiseExpirationRequestError(activationSafe);
    const safe = validateDateWriteRequest(e, collectionName);
    if (safe) raiseExpirationRequestError(safe);
    const original = originalRecord(e.record);
    const activeChanged = Boolean(original && bodyHas(body, "active")
      && recordBool(original, "active") !== recordBool(e.record, "active"));
    if (activeChanged && collectionName === "product_variations"
      && !recordBool(original, "active") && recordBool(e.record, "active")) {
      const resolved = resolveDateRequestRecords(e, collectionName);
      const variationDate = normalizeCivilDate(recordValue(e.record, "expiration_date"), true) || "";
      const productDate = resolved && normalizeCivilDate(recordValue(resolved.product, "expiration_date"), true) || "";
      if (resolved && commerce.usesVariations(resolved.product) && variationDate && productDate) {
        clearProductExpirationState(app, resolved.product, { strict: true });
        resolved.product.set("expiration_date", "");
        app.save(resolved.product);
        createProductExpirationAutoClearActivity(app, e, resolved, productDate, variationDate);
      }
    }
    if (modeTransition) {
      const productVariations = variationsForProduct(app, e.record.id);
      if (modeTransition.next && productVariations.some((variation) => (
        recordValue(variation, "active") !== false
        && Boolean(normalizeCivilDate(recordValue(variation, "expiration_date"), true))
      ))) {
        e.record.set("expiration_date", "");
      }
      clearProductExpirationState(app, e.record, { strict: true });
    } else if (activeChanged) {
      const resolved = resolveDateRequestRecords(e, collectionName);
      if (resolved && (collectionName === "products" || commerce.usesVariations(resolved.product))) {
        clearProductExpirationState(app, resolved.product, { strict: true });
      } else {
        clearEntityExpirationState(app, collectionName, e.record.id, { strict: true });
      }
    }
    result = e.next();
    if (bodyHas(body, "expiration_date") || modeTransition || activeChanged) {
      const resolved = resolveDateRequestRecords(e, collectionName);
      if (resolved && resolved.store) processStoreExpirationAlerts(app, resolved.store, now);
      createUnitExpirationTransitionActivities(app, e, transitionContext, collectionName);
      if (modeTransition) createVariationModeActivity(app, e, modeTransition);
    }
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
    return safeRequestError("expiration_not_found", "No se encontró el recurso solicitado.", "notify_expiration_alerts", 404);
  }
  const auth = requestAuthRecord(e);
  if (!resolved.store || !auth || recordString(auth, "role") === "master_admin" || recordString(auth, "status").toLowerCase() !== "active") {
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

function productExpirationUnits(app, storeId, now) {
  const products = findRecords(app, "products", "store = {:store}", "name", 10000, 0, { store: storeId });
  const variations = loadProductVariationsForStore(app, products);
  const variationsByProduct = {};
  variations.forEach((variation) => {
    const productId = relationId(variation, "product");
    if (!variationsByProduct[productId]) variationsByProduct[productId] = [];
    variationsByProduct[productId].push(variation);
  });
  const result = [];
  products.forEach((product) => {
    const productVariations = variationsByProduct[product.id] || [];
    commerce.buildProductUnits(product, productVariations).forEach((unit) => {
      if (unit.active === false) return;
      const date = normalizeCivilDate(
        commerce.effectiveUnitExpirationDate(product, unit, productVariations),
        true
      ) || "";
      if (!date) return;
      const variation = unit.variation || null;
      const name = unit.kind === "variation"
        ? [recordString(variation, "variation_type") || "Variación", recordString(variation, "value") || "Sin valor"].join(": ")
        : recordString(product, "name");
      result.push({
        product,
        variation,
        kind: unit.kind,
        id: unit.entity_id,
        name,
        date,
        days: daysUntilExpiration(date, now),
      });
    });
  });
  return result;
}

function expirationSummary(units) {
  let expired = 0;
  let upcoming30 = 0;
  (units || []).forEach((unit) => {
    if (unit.days <= 0) expired += 1;
    else if (unit.days <= 30) upcoming30 += 1;
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
    if (!info.auth || recordString(info.auth, "status").toLowerCase() !== "active") {
      return e.json(403, { ok: false, error: "unauthorized" });
    }
    const master = recordString(info.auth, "role") === "master_admin";
    const storeId = master ? requestHeader(info, "X-PZ-Support-Store") : relationId(info.auth, "store");
    if (!RECORD_ID_PATTERN.test(storeId)) return e.json(403, { ok: false, error: "unauthorized" });
    const app = e && e.app ? e.app : $app;
    const store = findRecord(app, "stores", storeId);
    if (!store || !storeExpirationEnabled(store)) return e.json(403, { ok: false, error: "premium_required" });
    if (!master && !authCanManageStore(e, storeId)) return e.json(403, { ok: false, error: "permission_denied" });
    const parsed = parseAdminQueryPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const units = productExpirationUnits(app, storeId, new Date());
    const summary = expirationSummary(units);
    if (parsed.view === "summary") return e.json(200, { ok: true, summary, page: 1, page_size: parsed.pageSize, total_pages: 1, total_items: 0, items: [] });

    const selected = filterAdminExpirationItems(units.filter((unit) => (
      parsed.view === "expired"
        ? unit.days <= 0
        : unit.days > 0 && unit.days <= parsed.windowDays
    )).map((unit) => {
      const isVariation = unit.kind === "variation";
      return {
        product_id: String(unit.product.id || "").slice(0, 15),
        name: boundedText(recordString(unit.product, "name") || "Producto", 160),
        mode: isVariation ? "variations" : "general",
        expiration_date: unit.date,
        days_left: unit.days,
        affected_variations: isVariation ? [{
          id: String(unit.id || "").slice(0, 15),
          name: boundedText(unit.name, 160),
          expiration_date: unit.date,
          days_left: unit.days,
        }] : [],
      };
    }).sort((left, right) => left.days_left - right.days_left || left.name.localeCompare(right.name)), parsed.query);
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
  notification.set("target_url", safeTarget(store, product.id, candidates[0].kind === "variation" ? candidates[0].id : ""));
  notification.set("entity_collection", candidates[0].kind === "variation" ? "product_variations" : "products");
  notification.set("entity_id", String(candidates[0].id || "").slice(0, 80));
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

function existingUnitNotification(app, store, product, candidate, threshold) {
  const entityCollection = candidate.kind === "variation" ? "product_variations" : "products";
  const cycles = findRecords(app, CYCLES_COLLECTION, `
    store = {:store} && product = {:product} && expiration_date = {:date}
      && threshold = {:threshold} && entity_collection = {:collection} && entity_id = {:id}
  `, "created", 50, 0, {
    store: store.id,
    product: product.id,
    date: candidate.date,
    threshold,
    collection: entityCollection,
    id: candidate.id,
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
  const units = productExpirationUnits(app, store.id, now);
  let notificationCount = 0;
  let cycleCount = 0;
  units.forEach((candidate) => {
    const threshold = currentThreshold(candidate.days);
    if (threshold === null) return;
    const entityCollection = candidate.kind === "variation" ? "product_variations" : "products";
    const key = cycleKey(store.id, entityCollection, candidate.id, candidate.date, threshold);
    if (cycleExists(app, key)) return;
    let notification = existingUnitNotification(app, store, candidate.product, candidate, threshold);
    if (!notification) {
      notification = createNotification(app, store, candidate.product, [candidate], threshold);
      notificationCount += 1;
    }
    if (createCycle(app, store, candidate.product, candidate, threshold, notification)) cycleCount += 1;
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

function clearEntityExpirationState(app, entityCollection, entityId, options) {
  const strict = options && options.strict === true;
  const remove = (record) => strict ? (app.delete(record), true) : deleteRecordSafe(app, record);
  const cycles = findRecords(app, CYCLES_COLLECTION, "entity_collection = {:collection} && entity_id = {:id}", "", 500, 0, {
    collection: entityCollection,
    id: entityId,
  });
  const notificationIds = new Set(cycles.map((cycle) => relationId(cycle, "notification")).filter(Boolean));
  cycles.forEach((cycle) => remove(cycle));
  notificationIds.forEach((notificationId) => {
    const remaining = findRecords(app, CYCLES_COLLECTION, "notification = {:notification}", "created", 500, 0, { notification: notificationId });
    if (!remaining.length) {
      const notification = findRecord(app, "store_notifications", notificationId);
      if (notification) remove(notification);
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

function handleExpirationRecordChange(e, collectionName, action) {
  const record = e && e.record;
  if (!record) return;
  const currentDate = normalizeCivilDate(recordValue(record, "expiration_date"), true) || "";
  const original = originalRecord(record);
  const previousDate = original ? normalizeCivilDate(recordValue(original, "expiration_date"), true) || "" : "";
  const dateChanged = original ? currentDate !== previousDate : Boolean(currentDate);
  const activeChanged = Boolean(original && recordBool(original, "active") !== recordBool(record, "active"));
  const modeChanged = Boolean(collectionName === "products" && original
    && commerce.usesVariations(original) !== commerce.usesVariations(record));
  const createdActiveVariation = Boolean(collectionName === "product_variations" && action === "create"
    && recordValue(record, "active") !== false);
  if (!dateChanged && !activeChanged && !modeChanged && !createdActiveVariation) return;
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (resolved && (collectionName === "products" || commerce.usesVariations(resolved.product))) {
    clearProductExpirationState(e.app, resolved.product);
  } else {
    clearEntityExpirationState(e.app, collectionName, record.id);
  }
  if (resolved && resolved.store) processStoreExpirationAlerts(e.app, resolved.store, new Date());
}

function handleExpirationRecordDelete(e, collectionName) {
  const record = e && e.record;
  if (!record) return;
  const resolved = resolveDateRequestRecords(e, collectionName);
  if (resolved && (collectionName === "products" || commerce.usesVariations(resolved.product))) {
    clearProductExpirationState(e.app, resolved.product);
  } else {
    clearEntityExpirationState(e.app, collectionName, record.id);
  }
  if (resolved && resolved.store) processStoreExpirationAlerts(e.app, resolved.store, new Date());
}

function continueAfterExpirationSideEffect(e, collectionName, action) {
  try {
    if (action === "delete") handleExpirationRecordDelete(e, collectionName);
    else handleExpirationRecordChange(e, collectionName, action);
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
    parentProductId: String(product && product.id || ""),
    variationId: isProduct ? "" : String(record.id || ""),
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
  productExpirationUnits,
  raiseExpirationRequestError,
  requireAuthenticatedUser(e) {
    setPrivateHeaders(e);
    if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
    return e.next();
  },
  storeExpirationEnabled,
  validateDateWriteRequest,
  validateExpirationSettingsRequest,
  validateProductActivationState,
  validateVariationActivationState,
  validateOrderItemRequest,
  validateVariationModeTransition,
  variationOtherwiseSellable,
};
