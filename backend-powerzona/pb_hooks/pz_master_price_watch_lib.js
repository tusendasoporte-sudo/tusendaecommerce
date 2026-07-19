/// <reference path="../pb_data/types.d.ts" />

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const WATCHES_COLLECTION = "master_product_watches";
const EVENTS_COLLECTION = "master_product_price_events";
const HISTORY_PAGE_SIZE = 10;
const MAX_TARGET_PRICE_USD = 999999999.99;
const ACTOR_CONTEXT_TTL_MS = 30000;
const ACTOR_CONTEXT_PREFIX = "pz:m7p2:actor:";
const ALLOWED_ACTOR_ROLES = ["store_admin", "store_staff", "master_admin"];
const WATCH_ACTIONS = ["enable", "pause", "resume"];
const LOG_MESSAGES = {
  PZ_MASTER_PRICE_WATCH_HOOK_FAILED: "PowerZona master price watch hook continued safely.",
  PZ_MASTER_PRICE_WATCH_QUERY_FAILED: "PowerZona master price watch query failed safely.",
  PZ_MASTER_PRICE_EVENT_FAILED: "PowerZona master price event failed safely.",
};

function logPriceWatch(code) {
  try {
    $app.logger().error(LOG_MESSAGES[code] || LOG_MESSAGES.PZ_MASTER_PRICE_WATCH_HOOK_FAILED, "code", code);
  } catch (_) {}
}

function continueActorRequest(e) {
  let key = "";
  try {
    key = captureActorContext(e);
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_HOOK_FAILED");
    return e.next();
  }
  try {
    return e.next();
  } catch (error) {
    clearActorContext(key);
    throw error;
  }
}

function continuePriceWatchSuccess(e, operation) {
  const nextResult = e.next();
  try {
    const collection = recordCollectionName(e && e.record);
    if (collection === "products") {
      if (operation === "update") handleProductUpdate(e.record);
      else if (operation === "delete") handleProductDelete(e.record);
    } else if (collection === "product_variations") {
      handleVariationMutation(e.record, operation);
    }
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_HOOK_FAILED");
  }
  return nextResult;
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

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function bodyKeys(body) {
  if (!body || typeof body !== "object") return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function exactPayload(body, allowedKeys) {
  const keys = bodyKeys(body).sort();
  const expected = allowedKeys.slice().sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function recordString(record, key) {
  if (!record) return "";
  try {
    return String(record.getString(key) || "").trim();
  } catch (_) {
    try {
      return String(record.get(key) || "").trim();
    } catch (_) {
      return "";
    }
  }
}

function recordNumber(record, key) {
  if (!record) return 0;
  try {
    const value = Number(record.getFloat(key));
    return Number.isFinite(value) ? value : 0;
  } catch (_) {
    try {
      const value = Number(record.get(key));
      return Number.isFinite(value) ? value : 0;
    } catch (_) {
      return 0;
    }
  }
}

function recordBoolean(record, key) {
  if (!record) return false;
  try {
    return record.getBool(key) === true;
  } catch (_) {
    const value = record.get(key);
    return value === true || value === 1 || value === "1" || value === "true";
  }
}

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isValidRecordId(value) {
  return RECORD_ID_PATTERN.test(String(value || "").trim());
}

function safeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function roundMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function moneyEqual(left, right) {
  return Math.round(roundMoney(left) * 100) === Math.round(roundMoney(right) * 100);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const result = {};
  Object.keys(value).sort().forEach((key) => {
    result[key] = stableValue(value[key]);
  });
  return result;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function fingerprint(snapshot) {
  return $security.sha256(stableStringify(snapshot));
}

function parseJson(value, fallback) {
  if (Array.isArray(value) && value.every((item) => Number.isInteger(Number(item)) && Number(item) >= 0 && Number(item) <= 255)) {
    try {
      let decoded = "";
      for (let index = 0; index < value.length; index += 1) decoded += String.fromCharCode(Number(value[index]));
      return JSON.parse(decoded);
    } catch (_) {
      return fallback;
    }
  }
  if (value && typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return fallback;
    }
  }
  try {
    return JSON.parse(String(value || ""));
  } catch (_) {
    return fallback;
  }
}

function recordJson(record, key, fallback) {
  try {
    return parseJson(record.get(key), fallback);
  } catch (_) {
    return fallback;
  }
}

function findRecordByIdSafe(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function findFirstSafe(app, collection, filter, params) {
  try {
    return app.findFirstRecordByFilter(collection, filter, params || {});
  } catch (_) {
    return null;
  }
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function queryOne(app, sql, bindings, model) {
  const rows = queryRows(app, sql, bindings, model);
  return rows.length ? rows[0] : null;
}

function productSnapshotPrice(product) {
  const base = roundMoney(recordNumber(product, "base_price_usd"));
  const storedRegular = roundMoney(recordNumber(product, "regular_price_usd"));
  const normal = storedRegular > 0 ? storedRegular : base;
  const storedOffer = roundMoney(recordNumber(product, "offer_price_usd"));
  const offerValid = recordBoolean(product, "is_offer") && storedOffer > 0
    && (storedRegular > storedOffer || base > storedOffer);
  const effective = offerValid ? storedOffer : base > 0 ? base : normal;
  return {
    regular: normal,
    offer_active: offerValid,
    offer: offerValid ? storedOffer : 0,
    effective: roundMoney(effective),
  };
}

function variationSnapshotRow(row) {
  const regular = roundMoney(row.priceUsd);
  const storedOffer = roundMoney(row.offerPriceUsd);
  const offerValid = (row.isOffer === true || row.isOffer === 1 || row.isOffer === "1")
    && storedOffer > 0
    && storedOffer < regular;
  const type = boundedString(row.variationType, 100);
  const value = boundedString(row.value, 120);
  return {
    id: boundedString(row.variationId, 15),
    label: boundedString(type && value ? `${type}: ${value}` : value || type || "Variación", 220),
    active: row.active === true || row.active === 1 || row.active === "1",
    regular,
    offer_active: offerValid,
    offer: offerValid ? storedOffer : 0,
    effective: offerValid ? storedOffer : regular,
  };
}

function variationSnapshotPrice(variation) {
  return variationSnapshotRow({
    variationId: recordString(variation, "id"),
    variationType: recordString(variation, "variation_type"),
    value: recordString(variation, "value"),
    active: recordBoolean(variation, "active"),
    priceUsd: recordNumber(variation, "price_usd"),
    isOffer: recordBoolean(variation, "is_offer"),
    offerPriceUsd: recordNumber(variation, "offer_price_usd"),
  });
}

function effectiveCommercialPrice(product, variation) {
  return variation ? variationSnapshotPrice(variation) : productSnapshotPrice(product);
}

function variationRows(app, productId) {
  return queryRows(app, `
    SELECT
      id AS variationId,
      variation_type AS variationType,
      value AS value,
      active AS active,
      price_usd AS priceUsd,
      is_offer AS isOffer,
      offer_price_usd AS offerPriceUsd
    FROM product_variations
    WHERE product = {:productId}
    ORDER BY id ASC
  `, { productId }, {
    variationId: "", variationType: "", value: "", active: false,
    priceUsd: 0, isOffer: false, offerPriceUsd: 0,
  }).map(variationSnapshotRow).filter((item) => isValidRecordId(item.id));
}

function activeRange(variations) {
  const prices = variations
    .filter((item) => item.active && item.regular > 0 && item.effective > 0)
    .map((item) => roundMoney(item.effective));
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) };
}

function buildSnapshot(app, productOrId) {
  const product = typeof productOrId === "string"
    ? findRecordByIdSafe(app, "products", productOrId)
    : productOrId;
  if (!product || !isValidRecordId(product.id)) return null;
  const variations = variationRows(app, product.id);
  const hasVariations = recordBoolean(product, "has_variations") || variations.length > 0;
  return {
    has_variations: hasVariations,
    product: hasVariations
      ? { regular: 0, offer_active: false, offer: 0, effective: 0 }
      : productSnapshotPrice(product),
    variations,
    active_range: hasVariations ? activeRange(variations) : { min: 0, max: 0 },
  };
}

function findWatch(app, storeId, productId, status) {
  const statusClause = status ? " && status = {:status}" : "";
  return findFirstSafe(
    app,
    WATCHES_COLLECTION,
    `store = {:storeId} && product_id_snapshot = {:productId}${statusClause}`,
    { storeId, productId, status: status || "" }
  );
}

function findActiveWatchByProduct(app, productId) {
  return findFirstSafe(
    app,
    WATCHES_COLLECTION,
    'product_id_snapshot = {:productId} && status = "active"',
    { productId }
  );
}

function watchResponse(watch) {
  return {
    id: isValidRecordId(watch && watch.id) ? String(watch.id) : "",
    status: recordString(watch, "status") || "none",
    started_at: safeIsoDate(recordString(watch, "started_at")),
    paused_at: safeIsoDate(recordString(watch, "paused_at")),
    deleted_at: safeIsoDate(recordString(watch, "deleted_at")),
    target_alert_enabled: recordBoolean(watch, "target_alert_enabled"),
    target_price_usd: roundMoney(recordNumber(watch, "target_price_usd")),
    target_updated_at: safeIsoDate(recordString(watch, "target_updated_at")),
  };
}

function systemActor() {
  return { id: "", name: "Sistema", role: "system", source: "system" };
}

function recordCollectionName(record) {
  try {
    return boundedString(record.collection().name, 100);
  } catch (_) {
    return "";
  }
}

function actorContextKey(record) {
  const collection = recordCollectionName(record);
  const id = boundedString(record && record.id, 15);
  return collection && isValidRecordId(id) ? `${collection}:${id}` : "";
}

function actorStoreKey(key) {
  return key ? `${ACTOR_CONTEXT_PREFIX}${key}` : "";
}

function clearExpiredActorContexts() {
  const now = Date.now();
  const store = $app.store();
  const all = store.getAll() || {};
  Object.keys(all).forEach((key) => {
    if (!key.startsWith(ACTOR_CONTEXT_PREFIX)) return;
    const context = parseJson(all[key], null);
    if (!context || Number(context.expiresAt) <= now) store.remove(key);
  });
}

function captureActorContext(e) {
  clearExpiredActorContexts();
  const key = actorContextKey(e && e.record);
  const role = recordString(e && e.auth, "role");
  if (!key || !ALLOWED_ACTOR_ROLES.includes(role)) return "";
  $app.store().set(actorStoreKey(key), JSON.stringify({
    id: isValidRecordId(e.auth.id) ? String(e.auth.id) : "",
    name: boundedString(recordString(e.auth, "display_name") || recordString(e.auth, "name"), 160) || "Usuario",
    role,
    source: "request",
    expiresAt: Date.now() + ACTOR_CONTEXT_TTL_MS,
  }));
  return key;
}

function clearActorContext(key) {
  const storeKey = actorStoreKey(key);
  if (storeKey) $app.store().remove(storeKey);
}

function consumeActorContext(record) {
  clearExpiredActorContexts();
  const key = actorContextKey(record);
  const storeKey = actorStoreKey(key);
  const context = storeKey ? parseJson($app.store().get(storeKey), null) : null;
  if (storeKey) $app.store().remove(storeKey);
  return context || systemActor();
}

function parseWatchActionPayload(body) {
  if (!exactPayload(body, ["store_id", "product_id", "action"])) return null;
  const storeId = bodyValue(body, "store_id");
  const productId = bodyValue(body, "product_id");
  const action = bodyValue(body, "action");
  if (typeof storeId !== "string" || !isValidRecordId(storeId)) return null;
  if (typeof productId !== "string" || !isValidRecordId(productId)) return null;
  if (typeof action !== "string" || !WATCH_ACTIONS.includes(action)) return null;
  return { storeId: storeId.trim(), productId: productId.trim(), action };
}

function parseHistoryPayload(body) {
  if (!exactPayload(body, ["store_id", "product_id", "page"])) return null;
  const storeId = bodyValue(body, "store_id");
  const productId = bodyValue(body, "product_id");
  const page = bodyValue(body, "page");
  if (typeof storeId !== "string" || !isValidRecordId(storeId)) return null;
  if (typeof productId !== "string" || !isValidRecordId(productId)) return null;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  return { storeId: storeId.trim(), productId: productId.trim(), page };
}

function parseWatchDetailPayload(body) {
  if (!exactPayload(body, ["watch_id", "page"])) return null;
  const watchId = bodyValue(body, "watch_id");
  const page = bodyValue(body, "page");
  if (typeof watchId !== "string" || !isValidRecordId(watchId)) return null;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  return { watchId: watchId.trim(), page };
}

function hasMoneyPrecision(value) {
  return Math.abs((Number(value) * 100) - Math.round(Number(value) * 100)) < 0.0000001;
}

function parseWatchTargetPayload(body) {
  if (!exactPayload(body, ["watch_id", "target_alert_enabled", "target_price_usd"])) {
    return { error: "invalid_payload" };
  }
  const watchId = bodyValue(body, "watch_id");
  const enabled = bodyValue(body, "target_alert_enabled");
  const target = bodyValue(body, "target_price_usd");
  if (typeof watchId !== "string" || !isValidRecordId(watchId) || typeof enabled !== "boolean") {
    return { error: "invalid_payload" };
  }
  if (typeof target !== "number" || !Number.isFinite(target)
    || target < 0 || target > MAX_TARGET_PRICE_USD || !hasMoneyPrecision(target)
    || (enabled && target <= 0)) {
    return { error: "invalid_target_price" };
  }
  return { error: "", watchId: watchId.trim(), enabled, target: roundMoney(target) };
}

function isMasterRequest(info) {
  return recordString(info && info.auth, "role") === "master_admin";
}

function isActiveMasterRequest(info) {
  return isMasterRequest(info) && recordString(info && info.auth, "status") === "active";
}

function handleProductWatchAction(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseWatchActionPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const product = findRecordByIdSafe($app, "products", parsed.productId);
    if (!product || recordString(product, "store") !== parsed.storeId) {
      return e.json(404, { ok: false, error: "product_not_found" });
    }
    const actorId = recordString(info.auth, "id");
    let result = { watch: null, status: 500, error: "watch_action_failed" };
    $app.runInTransaction((txApp) => {
      const txProduct = findRecordByIdSafe(txApp, "products", parsed.productId);
      if (!txProduct || recordString(txProduct, "store") !== parsed.storeId) {
        result = { watch: null, status: 404, error: "product_not_found" };
        return;
      }
      let watch = findWatch(txApp, parsed.storeId, parsed.productId, "");
      const now = new Date().toISOString();
      if (parsed.action === "enable") {
        if (watch && recordString(watch, "status") === "active") {
          result = { watch, status: 200, error: "" };
          return;
        }
        if (watch) {
          result = { watch: null, status: 409, error: "invalid_transition" };
          return;
        }
        const snapshot = buildSnapshot(txApp, txProduct);
        if (!snapshot) return;
        watch = new Record(txApp.findCollectionByNameOrId(WATCHES_COLLECTION), {});
        watch.set("store", parsed.storeId);
        watch.set("product", parsed.productId);
        watch.set("product_id_snapshot", parsed.productId);
        watch.set("product_name_snapshot", boundedString(recordString(txProduct, "name"), 180));
        watch.set("product_slug_snapshot", boundedString(recordString(txProduct, "slug"), 180));
        watch.set("status", "active");
        watch.set("last_snapshot", snapshot);
        watch.set("last_fingerprint", fingerprint(snapshot));
        watch.set("started_at", now);
        watch.set("paused_at", "");
        watch.set("deleted_at", "");
        watch.set("target_alert_enabled", false);
        watch.set("target_price_usd", 0);
        watch.set("target_updated_at", "");
        watch.set("target_updated_by", "");
        watch.set("created_by", actorId);
        watch.set("updated_by", actorId);
        txApp.save(watch);
        result = { watch, status: 200, error: "" };
        return;
      }
      if (!watch || recordString(watch, "status") === "deleted") {
        result = { watch: null, status: 404, error: "watch_not_found" };
        return;
      }
      if (parsed.action === "pause") {
        if (recordString(watch, "status") === "active") {
          watch.set("status", "paused");
          watch.set("paused_at", now);
          watch.set("updated_by", actorId);
          txApp.save(watch);
        }
        result = { watch, status: 200, error: "" };
        return;
      }
      if (recordString(watch, "status") === "paused") {
        const snapshot = buildSnapshot(txApp, txProduct);
        if (!snapshot) return;
        watch.set("status", "active");
        watch.set("paused_at", "");
        watch.set("last_snapshot", snapshot);
        watch.set("last_fingerprint", fingerprint(snapshot));
        watch.set("product_name_snapshot", boundedString(recordString(txProduct, "name"), 180));
        watch.set("product_slug_snapshot", boundedString(recordString(txProduct, "slug"), 180));
        watch.set("updated_by", actorId);
        txApp.save(watch);
      }
      result = { watch, status: 200, error: "" };
    });
    if (!result.watch) return e.json(result.status, { ok: false, error: result.error });
    return e.json(200, { ok: true, watch: watchResponse(result.watch) });
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_QUERY_FAILED");
    return e.json(500, { ok: false, error: "watch_action_failed" });
  }
}

function rangeEqual(left, right) {
  return moneyEqual(left && left.min, right && right.min) && moneyEqual(left && left.max, right && right.max);
}

function publicRange(snapshot) {
  if (!snapshot) return { min: 0, max: 0 };
  if (snapshot.has_variations) return snapshot.active_range || { min: 0, max: 0 };
  const effective = roundMoney(snapshot.product && snapshot.product.effective);
  return { min: effective, max: effective };
}

function effectivePriceFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return 0;
  if (snapshot.has_variations) {
    const variations = Array.isArray(snapshot.variations) ? snapshot.variations : [];
    const validPrices = variations
      .filter((variation) => variation && variation.active === true)
      .map((variation) => roundMoney(variation.effective))
      .filter((price) => price > 0);
    return validPrices.length ? roundMoney(Math.min.apply(null, validPrices)) : 0;
  }
  const effective = roundMoney(snapshot.product && snapshot.product.effective);
  return effective > 0 ? effective : 0;
}

function targetConfiguration(watch) {
  const price = roundMoney(recordNumber(watch, "target_price_usd"));
  return {
    enabled: recordBoolean(watch, "target_alert_enabled") && price > 0,
    price: price > 0 ? price : 0,
  };
}

function targetMetForPrice(configuration, price) {
  return configuration.enabled && price > 0 && price <= configuration.price;
}

function priceNotificationCopy(change, before, after, configuration, productName, productDeleted) {
  const beforePrice = effectivePriceFromSnapshot(before);
  const afterPrice = productDeleted ? 0 : effectivePriceFromSnapshot(after);
  const previousMet = targetMetForPrice(configuration, beforePrice);
  const targetMet = targetMetForPrice(configuration, afterPrice);
  const safeName = boundedString(productName, 180) || "Producto";
  if (productDeleted) {
    return {
      type: "product_deleted",
      tone: "normal",
      targetMet: false,
      afterPrice: 0,
      title: `Producto eliminado: ${safeName}`.slice(0, 180),
      message: `El producto seguido ${safeName} fue eliminado.`.slice(0, 500),
    };
  }

  let title = `Precio cambiado: ${safeName}`;
  if (targetMet) title = `${previousMet ? "Precio bajo el objetivo" : "Precio objetivo alcanzado"}: ${safeName}`;
  else if (previousMet) title = `Precio por encima del objetivo: ${safeName}`;

  let message = beforePrice > 0 && afterPrice > 0 && !moneyEqual(beforePrice, afterPrice)
    ? `El precio cambió de ${formatUsd(beforePrice)} a ${formatUsd(afterPrice)}.`
    : `${boundedString(change && change.summary, 360) || "Se registró un cambio real de precio"}.`;
  if (configuration.enabled) {
    message += ` Objetivo configurado: ${formatUsd(configuration.price)}.`;
    if (after && after.has_variations) message += ` Precio mínimo actual: ${formatUsd(afterPrice)}.`;
  }
  return {
    type: targetMet ? "product_price_target_reached" : "product_price_changed",
    tone: targetMet ? "critical" : "normal",
    targetMet,
    afterPrice,
    title: title.slice(0, 180),
    message: message.slice(0, 500),
  };
}

function formatUsd(value) {
  return `$${roundMoney(value).toFixed(2)}`;
}

function productChange(before, after) {
  if (!before || !after) return null;
  if (!before.has_variations && !after.has_variations) {
    const oldPrice = before.product || {};
    const newPrice = after.product || {};
    if (!oldPrice.offer_active && newPrice.offer_active) {
      return { type: "product_offer_activated", entityType: "product", summary: `Oferta activada en ${formatUsd(newPrice.offer)}` };
    }
    if (oldPrice.offer_active && !newPrice.offer_active) {
      return { type: "product_offer_disabled", entityType: "product", summary: `Oferta desactivada; precio efectivo ${formatUsd(newPrice.effective)}` };
    }
    if (oldPrice.offer_active && newPrice.offer_active && !moneyEqual(oldPrice.offer, newPrice.offer)) {
      return { type: "product_offer_changed", entityType: "product", summary: `Oferta cambió de ${formatUsd(oldPrice.offer)} a ${formatUsd(newPrice.offer)}` };
    }
    if (!moneyEqual(oldPrice.regular, newPrice.regular)) {
      return { type: "product_regular_price_changed", entityType: "product", summary: `Precio normal cambió de ${formatUsd(oldPrice.regular)} a ${formatUsd(newPrice.regular)}` };
    }
    return null;
  }
  if (!rangeEqual(publicRange(before), publicRange(after))) {
    const oldRange = publicRange(before);
    const newRange = publicRange(after);
    return {
      type: "product_range_changed",
      entityType: "catalog",
      summary: `Rango comercial cambió de ${formatUsd(oldRange.min)}–${formatUsd(oldRange.max)} a ${formatUsd(newRange.min)}–${formatUsd(newRange.max)}`,
    };
  }
  return null;
}

function variationById(snapshot, variationId) {
  const variations = snapshot && Array.isArray(snapshot.variations) ? snapshot.variations : [];
  return variations.find((item) => item && item.id === variationId) || null;
}

function variationChange(operation, variationId, before, after) {
  const oldVariation = variationById(before, variationId);
  const newVariation = variationById(after, variationId);
  const oldRange = before && before.active_range ? before.active_range : { min: 0, max: 0 };
  const newRange = after && after.active_range ? after.active_range : { min: 0, max: 0 };
  const rangeChanged = !rangeEqual(oldRange, newRange);
  if (operation === "create") {
    if (!newVariation || !newVariation.active || newVariation.regular <= 0) return null;
    return { type: "variation_added", entityType: "variation", variation: newVariation, summary: `Variación activa agregada: ${newVariation.label} (${formatUsd(newVariation.effective)})` };
  }
  if (operation === "delete") {
    if (!oldVariation || !oldVariation.active || oldVariation.regular <= 0) return null;
    return { type: "variation_removed", entityType: "variation", variation: oldVariation, summary: `Variación activa eliminada: ${oldVariation.label}` };
  }
  if (!oldVariation || !newVariation) return null;
  if (oldVariation.active && newVariation.active) {
    if (!oldVariation.offer_active && newVariation.offer_active) {
      return { type: "variation_offer_activated", entityType: "variation", variation: newVariation, summary: `Oferta activada en ${newVariation.label}: ${formatUsd(newVariation.offer)}` };
    }
    if (oldVariation.offer_active && !newVariation.offer_active) {
      return { type: "variation_offer_disabled", entityType: "variation", variation: newVariation, summary: `Oferta desactivada en ${newVariation.label}` };
    }
    if (oldVariation.offer_active && newVariation.offer_active && !moneyEqual(oldVariation.offer, newVariation.offer)) {
      return { type: "variation_offer_changed", entityType: "variation", variation: newVariation, summary: `Oferta de ${newVariation.label} cambió de ${formatUsd(oldVariation.offer)} a ${formatUsd(newVariation.offer)}` };
    }
    if (!moneyEqual(oldVariation.regular, newVariation.regular)) {
      return { type: "variation_regular_price_changed", entityType: "variation", variation: newVariation, summary: `Precio de ${newVariation.label} cambió de ${formatUsd(oldVariation.regular)} a ${formatUsd(newVariation.regular)}` };
    }
  }
  if (rangeChanged) {
    return {
      type: "product_range_changed",
      entityType: "catalog",
      variation: newVariation || oldVariation,
      summary: `Rango comercial cambió de ${formatUsd(oldRange.min)}–${formatUsd(oldRange.max)} a ${formatUsd(newRange.min)}–${formatUsd(newRange.max)}`,
    };
  }
  return null;
}

function eventExists(app, dedupeKey) {
  return !!findFirstSafe(app, EVENTS_COLLECTION, "dedupe_key = {:dedupeKey}", { dedupeKey });
}

function createPriceEvent(app, watch, product, before, after, change, actor, variationId, productDeleted) {
  const beforeFingerprint = fingerprint(before || {});
  const afterFingerprint = fingerprint(after || {});
  const identity = variationId || recordString(watch, "product_id_snapshot");
  const dedupeKey = `price:${watch.id}:${$security.sha256(`${change.type}:${identity}:${beforeFingerprint}:${afterFingerprint}`)}`;
  if (eventExists(app, dedupeKey)) return false;
  const configuration = targetConfiguration(watch);
  const notification = priceNotificationCopy(
    change,
    before,
    after,
    configuration,
    recordString(watch, "product_name_snapshot"),
    productDeleted
  );
  const collection = app.findCollectionByNameOrId(EVENTS_COLLECTION);
  const event = new Record(collection, {});
  const variation = change.variation || variationById(after, variationId) || variationById(before, variationId);
  event.set("store", recordString(watch, "store"));
  event.set("watch", watch.id);
  event.set("product", productDeleted ? "" : recordString(watch, "product"));
  event.set("product_id_snapshot", recordString(watch, "product_id_snapshot"));
  event.set("product_name_snapshot", boundedString(recordString(watch, "product_name_snapshot"), 180));
  event.set("product_slug_snapshot", boundedString(recordString(watch, "product_slug_snapshot"), 180));
  event.set("variation", !productDeleted && variationId && findRecordByIdSafe(app, "product_variations", variationId) ? variationId : "");
  event.set("variation_id_snapshot", variationId || "");
  event.set("variation_label_snapshot", boundedString(variation && variation.label, 220));
  event.set("entity_type", change.entityType);
  event.set("change_type", change.type);
  event.set("summary", boundedString(change.summary, 500));
  event.set("before_state", before || {});
  event.set("after_state", after || {});
  event.set("actor", actor.id || "");
  event.set("actor_name_snapshot", boundedString(actor.name, 160));
  event.set("actor_role_snapshot", boundedString(actor.role, 40));
  event.set("source", actor.source === "request" ? "request" : "system");
  event.set("dedupe_key", dedupeKey.slice(0, 180));
  event.set("target_alert_enabled_snapshot", configuration.enabled);
  event.set("target_price_usd_snapshot", configuration.price);
  event.set("target_met_snapshot", notification.targetMet);
  event.set("effective_price_after_usd", notification.afterPrice);
  event.set("notification_tone", notification.tone);
  app.save(event);
  try {
    require(`${__hooks}/pz_master_notifications_lib.js`).createProductNotification(app, {
      type: notification.type,
      tone: notification.tone,
      storeId: recordString(watch, "store"),
      productIdSnapshot: recordString(watch, "product_id_snapshot"),
      productName: recordString(watch, "product_name_snapshot"),
      watchId: watch.id,
      eventKey: dedupeKey,
      title: notification.title,
      message: notification.message,
    });
  } catch (_) {
    try {
      $app.logger().error("PowerZona master notification create failed safely.", "code", "PZ_MASTER_NOTIFICATION_CREATE_FAILED");
    } catch (_) {}
  }
  return true;
}

function updateWatchBaseline(app, watch, product, snapshot, nextFingerprint) {
  watch.set("last_snapshot", snapshot);
  watch.set("last_fingerprint", nextFingerprint);
  if (product) {
    watch.set("product_name_snapshot", boundedString(recordString(product, "name"), 180));
    watch.set("product_slug_snapshot", boundedString(recordString(product, "slug"), 180));
  }
  app.save(watch);
}

function handleProductUpdate(record) {
  const actor = consumeActorContext(record);
  try {
    if (!record || !isValidRecordId(record.id)) return;
    if (!findActiveWatchByProduct($app, record.id)) return;
    $app.runInTransaction((txApp) => {
      const product = findRecordByIdSafe(txApp, "products", record.id);
      const watch = product ? findActiveWatchByProduct(txApp, record.id) : null;
      if (!product || !watch) return;
      const before = recordJson(watch, "last_snapshot", null);
      const after = buildSnapshot(txApp, product);
      if (!before || !after) return;
      const nextFingerprint = fingerprint(after);
      if (recordString(watch, "last_fingerprint") === nextFingerprint) {
        if (recordString(watch, "product_name_snapshot") !== boundedString(recordString(product, "name"), 180)
          || recordString(watch, "product_slug_snapshot") !== boundedString(recordString(product, "slug"), 180)) {
          updateWatchBaseline(txApp, watch, product, after, nextFingerprint);
        }
        return;
      }
      const change = productChange(before, after);
      updateWatchBaseline(txApp, watch, product, after, nextFingerprint);
      if (change) createPriceEvent(txApp, watch, product, before, after, change, actor, "", false);
    });
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_HOOK_FAILED");
  }
}

function handleVariationMutation(record, operation) {
  const actor = consumeActorContext(record);
  try {
    if (!record || !isValidRecordId(record.id)) return;
    const productId = recordString(record, "product");
    if (!isValidRecordId(productId)) return;
    if (!findActiveWatchByProduct($app, productId)) return;
    $app.runInTransaction((txApp) => {
      const product = findRecordByIdSafe(txApp, "products", productId);
      if (!product) return;
      const watch = findActiveWatchByProduct(txApp, productId);
      if (!watch) return;
      const before = recordJson(watch, "last_snapshot", null);
      const after = buildSnapshot(txApp, product);
      if (!before || !after) return;
      const nextFingerprint = fingerprint(after);
      if (recordString(watch, "last_fingerprint") === nextFingerprint) return;
      const change = variationChange(operation, record.id, before, after);
      updateWatchBaseline(txApp, watch, product, after, nextFingerprint);
      if (change) createPriceEvent(txApp, watch, product, before, after, change, actor, record.id, false);
    });
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_HOOK_FAILED");
  }
}

function handleProductDelete(record) {
  const actor = consumeActorContext(record);
  try {
    if (!record || !isValidRecordId(record.id)) return;
    $app.runInTransaction((txApp) => {
      const watch = findFirstSafe(
        txApp,
        WATCHES_COLLECTION,
        'product_id_snapshot = {:productId} && (status = "active" || status = "paused")',
        { productId: record.id }
      );
      if (!watch) return;
      const wasActive = recordString(watch, "status") === "active";
      const before = recordJson(watch, "last_snapshot", {});
      const after = parseJson(stableStringify(before), {});
      after.deleted = true;
      watch.set("status", "deleted");
      watch.set("product", "");
      watch.set("deleted_at", new Date().toISOString());
      if (actor.id) watch.set("updated_by", actor.id);
      txApp.save(watch);
      if (!wasActive) return;
      const change = {
        type: "product_deleted",
        entityType: "product",
        summary: `Producto seguido eliminado: ${boundedString(recordString(watch, "product_name_snapshot"), 180) || "Producto"}`,
      };
      createPriceEvent(txApp, watch, null, before, after, change, actor, "", true);
    });
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_HOOK_FAILED");
  }
}

function statePrice(snapshot, variationId, key) {
  if (variationId) {
    const variation = variationById(snapshot, variationId);
    return roundMoney(variation && variation[key]);
  }
  return roundMoney(snapshot && snapshot.product && snapshot.product[key]);
}

function mapHistoryRow(row) {
  const before = parseJson(row.beforeState, {});
  const after = parseJson(row.afterState, {});
  const variationId = isValidRecordId(row.variationId) ? String(row.variationId) : "";
  const tone = row.notificationTone === "critical" ? "critical" : "normal";
  return {
    id: isValidRecordId(row.eventId) ? String(row.eventId) : "",
    change_type: boundedString(row.changeType, 60),
    summary: boundedString(row.summary, 500),
    variation_label: boundedString(row.variationLabel, 220),
    before_regular_price_usd: statePrice(before, variationId, "regular"),
    after_regular_price_usd: statePrice(after, variationId, "regular"),
    before_effective_price_usd: statePrice(before, variationId, "effective"),
    after_effective_price_usd: statePrice(after, variationId, "effective"),
    before_range_min_usd: roundMoney(before && before.active_range && before.active_range.min),
    before_range_max_usd: roundMoney(before && before.active_range && before.active_range.max),
    after_range_min_usd: roundMoney(after && after.active_range && after.active_range.min),
    after_range_max_usd: roundMoney(after && after.active_range && after.active_range.max),
    effective_price_before_usd: effectivePriceFromSnapshot(before),
    effective_price_after_usd: roundMoney(row.effectivePriceAfter) || effectivePriceFromSnapshot(after),
    target_alert_enabled: row.targetAlertEnabled === true || row.targetAlertEnabled === 1 || row.targetAlertEnabled === "1",
    target_price_usd: roundMoney(row.targetPrice),
    target_met: row.targetMet === true || row.targetMet === 1 || row.targetMet === "1",
    notification_tone: tone,
    actor_name: boundedString(row.actorName, 160) || "Sistema",
    actor_role: boundedString(row.actorRole, 40) || "system",
    source: row.source === "request" ? "request" : "system",
    created: safeIsoDate(row.created),
  };
}

function historyForWatch(app, watchId, requestedPage) {
  const count = queryOne(app, `
    SELECT COUNT(*) AS totalItems FROM master_product_price_events WHERE watch = {:watchId}
  `, { watchId }, { totalItems: 0 }) || {};
  const totalItems = nonNegativeInteger(count.totalItems);
  const totalPages = Math.max(1, Math.ceil(totalItems / HISTORY_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rows = queryRows(app, `
    SELECT
      id AS eventId,
      change_type AS changeType,
      summary AS summary,
      variation_id_snapshot AS variationId,
      variation_label_snapshot AS variationLabel,
      before_state AS beforeState,
      after_state AS afterState,
      target_alert_enabled_snapshot AS targetAlertEnabled,
      target_price_usd_snapshot AS targetPrice,
      target_met_snapshot AS targetMet,
      effective_price_after_usd AS effectivePriceAfter,
      notification_tone AS notificationTone,
      actor_name_snapshot AS actorName,
      actor_role_snapshot AS actorRole,
      source AS source,
      created AS created
    FROM master_product_price_events
    WHERE watch = {:watchId}
    ORDER BY datetime(created) DESC, id DESC
    LIMIT {:limit} OFFSET {:offset}
  `, { watchId, limit: HISTORY_PAGE_SIZE, offset: (page - 1) * HISTORY_PAGE_SIZE }, {
    eventId: "", changeType: "", summary: "", variationId: "", variationLabel: "",
    beforeState: "", afterState: "", targetAlertEnabled: false, targetPrice: 0,
    targetMet: false, effectivePriceAfter: 0, notificationTone: "normal",
    actorName: "", actorRole: "", source: "", created: "",
  });
  return {
    page,
    per_page: HISTORY_PAGE_SIZE,
    total_items: totalItems,
    total_pages: totalPages,
    items: rows.map(mapHistoryRow).filter((item) => item.id),
  };
}

function handleProductPriceHistory(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseHistoryPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const product = findRecordByIdSafe($app, "products", parsed.productId);
    const watch = findWatch($app, parsed.storeId, parsed.productId, "");
    if ((!product || recordString(product, "store") !== parsed.storeId) && !watch) {
      return e.json(404, { ok: false, error: "product_not_found" });
    }
    if (!watch) {
      return e.json(200, {
        ok: true,
        watch: { status: "none", started_at: "", paused_at: "", deleted_at: "" },
        page: { page: 1, per_page: HISTORY_PAGE_SIZE, total_items: 0, total_pages: 1, items: [] },
      });
    }
    return e.json(200, {
      ok: true,
      watch: watchResponse(watch),
      page: historyForWatch($app, watch.id, parsed.page),
    });
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_QUERY_FAILED");
    return e.json(500, { ok: false, error: "price_history_failed" });
  }
}

function handleProductWatchDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isActiveMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseWatchDetailPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const watch = findRecordByIdSafe($app, WATCHES_COLLECTION, parsed.watchId);
    if (!watch) return e.json(404, { ok: false, error: "watch_not_found" });
    const storeId = recordString(watch, "store");
    const store = findRecordByIdSafe($app, "stores", storeId);
    if (!store || !isValidRecordId(storeId)) return e.json(404, { ok: false, error: "watch_not_found" });

    const productId = recordString(watch, "product");
    const candidateProduct = isValidRecordId(productId) ? findRecordByIdSafe($app, "products", productId) : null;
    const product = candidateProduct && recordString(candidateProduct, "store") === storeId ? candidateProduct : null;
    const currentSnapshot = product ? buildSnapshot($app, product) : null;
    const baselineSnapshot = recordJson(watch, "last_snapshot", {});
    const initialRow = queryOne($app, `
      SELECT before_state AS beforeState
      FROM master_product_price_events
      WHERE watch = {:watchId}
      ORDER BY datetime(created) ASC, id ASC
      LIMIT 1
    `, { watchId: watch.id }, { beforeState: "" });
    const initialSnapshot = initialRow ? parseJson(initialRow.beforeState, baselineSnapshot) : baselineSnapshot;
    const currentPrice = product ? effectivePriceFromSnapshot(currentSnapshot) : 0;
    const initialPrice = effectivePriceFromSnapshot(initialSnapshot);
    const configuration = targetConfiguration(watch);
    const targetMet = targetMetForPrice(configuration, currentPrice);
    const lastChange = queryOne($app, `
      SELECT summary AS summary, created AS created
      FROM master_product_price_events
      WHERE watch = {:watchId}
      ORDER BY datetime(created) DESC, id DESC
      LIMIT 1
    `, { watchId: watch.id }, { summary: "", created: "" }) || {};
    const identitySnapshot = currentSnapshot || baselineSnapshot || {};

    return e.json(200, {
      ok: true,
      watch: watchResponse(watch),
      store: {
        id: storeId,
        name: boundedString(recordString(store, "name"), 160) || "Tienda",
        slug: boundedString(recordString(store, "slug"), 120),
      },
      product: {
        id: product ? String(product.id) : "",
        name: boundedString(product ? recordString(product, "name") : recordString(watch, "product_name_snapshot"), 180) || "Producto eliminado",
        slug: boundedString(product ? recordString(product, "slug") : recordString(watch, "product_slug_snapshot"), 180),
        exists: !!product,
        has_variations: identitySnapshot.has_variations === true,
      },
      pricing: {
        current_effective_price_usd: currentPrice,
        initial_effective_price_usd: initialPrice,
        difference_from_start_usd: currentPrice > 0 && initialPrice > 0 ? roundMoney(currentPrice - initialPrice) : 0,
        target_met: targetMet,
        amount_to_target_usd: configuration.enabled && currentPrice > configuration.price
          ? roundMoney(currentPrice - configuration.price) : 0,
      },
      last_change: {
        summary: boundedString(lastChange.summary, 500),
        created: safeIsoDate(lastChange.created),
      },
      history: historyForWatch($app, watch.id, parsed.page),
    });
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_QUERY_FAILED");
    return e.json(500, { ok: false, error: "watch_detail_failed" });
  }
}

function handleProductWatchTarget(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isActiveMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseWatchTargetPayload(info.body || {});
    if (parsed.error) {
      return e.json(parsed.error === "invalid_payload" ? 400 : 422, { ok: false, error: parsed.error });
    }
    let result = null;
    $app.runInTransaction((txApp) => {
      const watch = findRecordByIdSafe(txApp, WATCHES_COLLECTION, parsed.watchId);
      if (!watch) return;
      const currentTarget = roundMoney(recordNumber(watch, "target_price_usd"));
      const target = parsed.target > 0 ? parsed.target : currentTarget;
      const now = new Date().toISOString();
      watch.set("target_alert_enabled", parsed.enabled);
      watch.set("target_price_usd", target);
      watch.set("target_updated_at", now);
      watch.set("target_updated_by", recordString(info.auth, "id"));
      txApp.save(watch);
      const productId = recordString(watch, "product");
      const product = isValidRecordId(productId) ? findRecordByIdSafe(txApp, "products", productId) : null;
      const currentPrice = product ? effectivePriceFromSnapshot(buildSnapshot(txApp, product)) : 0;
      result = {
        watch: watchResponse(watch),
        pricing: {
          current_effective_price_usd: currentPrice,
          target_met: parsed.enabled && target > 0 && currentPrice > 0 && currentPrice <= target,
          amount_to_target_usd: parsed.enabled && currentPrice > target ? roundMoney(currentPrice - target) : 0,
        },
      };
    });
    if (!result) return e.json(404, { ok: false, error: "watch_not_found" });
    return e.json(200, Object.assign({ ok: true }, result));
  } catch (_) {
    logPriceWatch("PZ_MASTER_PRICE_WATCH_QUERY_FAILED");
    return e.json(500, { ok: false, error: "watch_target_update_failed" });
  }
}

module.exports = {
  captureActorContext,
  clearActorContext,
  clearExpiredActorContexts,
  continueActorRequest,
  continuePriceWatchSuccess,
  effectiveCommercialPrice,
  effectivePriceFromSnapshot,
  handleProductDelete,
  handleProductPriceHistory,
  handleProductUpdate,
  handleProductWatchAction,
  handleProductWatchDetail,
  handleProductWatchTarget,
  handleVariationMutation,
  parseWatchDetailPayload,
  parseWatchTargetPayload,
  priceNotificationCopy,
  requireAuthenticatedUser,
  targetMetForPrice,
  productSnapshotPrice,
  variationSnapshotPrice,
};
