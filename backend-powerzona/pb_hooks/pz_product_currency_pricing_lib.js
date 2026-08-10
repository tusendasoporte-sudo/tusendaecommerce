/// <reference path="../pb_data/types.d.ts" />

const PRICE_SCALE = 1000000;
const PRODUCT_SOURCE_FIELDS = Object.freeze([
  "price_currency", "regular_price_amount", "offer_price_amount", "cost_amount",
]);
const PRODUCT_CANONICAL_FIELDS = Object.freeze([
  "base_price_usd", "regular_price_usd", "offer_price_usd", "cost_usd", "is_offer",
]);
const VARIATION_SOURCE_FIELDS = Object.freeze([
  "price_currency", "price_amount", "offer_price_amount", "cost_amount",
]);
const VARIATION_CANONICAL_FIELDS = Object.freeze([
  "price_usd", "offer_price_usd", "cost_usd", "is_offer",
]);

function value(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) { return record[key]; }
}

function relationId(record, key) {
  const current = value(record, key);
  if (Array.isArray(current)) return String(current[0] || "").trim();
  if (current && typeof current === "object") return String(current.id || "").trim();
  return String(current || "").trim();
}

function recordNumber(record, key) {
  const parsed = Number(value(record, key));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordBool(record, key) {
  const current = value(record, key);
  return current === true || current === 1 || current === "1" || String(current || "").toLowerCase() === "true";
}

function originalRecord(record) {
  try { return typeof record.original === "function" ? record.original() : null; } catch (_) { return null; }
}

function requestBody(e) {
  try { return e.requestInfo().body || {}; } catch (_) { return {}; }
}

function bodyHas(body, key) {
  if (!body) return false;
  if (typeof body.has === "function") return body.has(key);
  return Object.prototype.hasOwnProperty.call(body, key)
    || Object.prototype.hasOwnProperty.call(body, `${key}+`)
    || Object.prototype.hasOwnProperty.call(body, `${key}-`);
}

function anyBodyField(body, fields) {
  return fields.some((field) => bodyHas(body, field));
}

function rounded(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round((parsed + Number.EPSILON) * PRICE_SCALE) / PRICE_SCALE;
}

function nonNegative(value) {
  return Math.max(0, rounded(value));
}

function toUsd(amount, rate) {
  return nonNegative(nonNegative(amount) / rate);
}

function fromUsd(amount, rate) {
  return nonNegative(nonNegative(amount) * rate);
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findUsdCurrency(app, storeId) {
  if (!storeId) return null;
  try {
    return app.findFirstRecordByFilter(
      "currencies",
      "store = {:store} && code = 'USD'",
      { store: storeId },
    );
  } catch (_) {
    return null;
  }
}

function resolveCurrency(app, storeId, requestedId) {
  const currency = findRecord(app, "currencies", requestedId) || findUsdCurrency(app, storeId);
  if (!currency || relationId(currency, "store") !== storeId) return null;
  const rate = recordNumber(currency, "exchange_rate");
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return { record: currency, id: String(currency.id || ""), rate };
}

function validationError(message, field) {
  const error = new Error(String(message || "Configuracion de precio no valida."));
  error.field = String(field || "price_currency");
  return error;
}

function raisePricingRequestError(error) {
  if (!error) return;
  const field = String(error.field || "price_currency");
  const message = String(error.message || "Configuracion de precio no valida.");
  if (typeof BadRequestError === "function") {
    throw new BadRequestError(message, {
      [field]: { code: "product_price_currency", message },
    });
  }
  throw error;
}

function sourceAmount(record, original, body, sourceField, canonicalField, rate, currencyChanged) {
  if (bodyHas(body, sourceField)) return nonNegative(recordNumber(record, sourceField));
  if (currencyChanged || bodyHas(body, canonicalField)) return fromUsd(recordNumber(record, canonicalField), rate);
  if (original) return nonNegative(recordNumber(record, sourceField));
  return fromUsd(recordNumber(record, canonicalField), rate);
}

function normalizeProductPricingRequest(e) {
  const record = e && e.record;
  if (!record) return null;
  const body = requestBody(e);
  const original = originalRecord(record);
  if (original && !anyBodyField(body, PRODUCT_SOURCE_FIELDS.concat(PRODUCT_CANONICAL_FIELDS))) return null;

  const storeId = relationId(record, "store") || relationId(original, "store");
  if (!storeId) return validationError("No se pudo identificar la tienda del producto.", "store");
  const requestedCurrencyId = relationId(record, "price_currency") || relationId(original, "price_currency");
  const currency = resolveCurrency(e.app, storeId, requestedCurrencyId);
  if (!currency) {
    // Compatibilidad de transición: algunos fixtures/tenants legacy pueden
    // crear registros canónicos antes de que exista su USD. Un cliente que
    // selecciona explícitamente moneda nunca puede omitir esta validación.
    if (!requestedCurrencyId && !bodyHas(body, "price_currency") && !anyBodyField(body, PRODUCT_SOURCE_FIELDS.slice(1))) return null;
    return validationError("Selecciona una moneda valida de esta tienda.", "price_currency");
  }

  const originalCurrencyId = relationId(original, "price_currency");
  const currencyChanged = Boolean(original && originalCurrencyId && originalCurrencyId !== currency.id);
  const regularFallback = recordNumber(record, "regular_price_usd") || recordNumber(record, "base_price_usd");
  if (!recordNumber(record, "regular_price_usd") && regularFallback > 0) record.set("regular_price_usd", regularFallback);

  const regularAmount = sourceAmount(record, original, body, "regular_price_amount", "regular_price_usd", currency.rate, currencyChanged);
  const offerAmount = sourceAmount(record, original, body, "offer_price_amount", "offer_price_usd", currency.rate, currencyChanged);
  const costAmount = sourceAmount(record, original, body, "cost_amount", "cost_usd", currency.rate, currencyChanged);
  const isOffer = recordBool(record, "is_offer");
  if (isOffer && (!(regularAmount > 0) || !(offerAmount > 0) || offerAmount >= regularAmount)) {
    return validationError("El precio de oferta debe ser mayor que 0 y menor que el precio normal.", "offer_price_amount");
  }

  const regularUsd = toUsd(regularAmount, currency.rate);
  const offerUsd = isOffer ? toUsd(offerAmount, currency.rate) : 0;
  record.set("price_currency", currency.id);
  record.set("regular_price_amount", regularAmount);
  record.set("offer_price_amount", isOffer ? offerAmount : 0);
  record.set("cost_amount", costAmount);
  record.set("regular_price_usd", regularUsd);
  record.set("offer_price_usd", offerUsd);
  record.set("cost_usd", toUsd(costAmount, currency.rate));
  record.set("base_price_usd", isOffer ? offerUsd : regularUsd);
  return null;
}

function resolveVariationProduct(app, record, original) {
  return findRecord(app, "products", relationId(record, "product") || relationId(original, "product"));
}

function normalizeVariationPricingRequest(e) {
  const record = e && e.record;
  if (!record) return null;
  const body = requestBody(e);
  const original = originalRecord(record);
  if (original && !anyBodyField(body, VARIATION_SOURCE_FIELDS.concat(VARIATION_CANONICAL_FIELDS).concat(["product"]))) return null;

  const product = resolveVariationProduct(e.app, record, original);
  if (!product) return validationError("No se pudo identificar el producto padre.", "product");
  const storeId = relationId(product, "store");
  const parentCurrencyId = relationId(product, "price_currency");
  const currency = resolveCurrency(e.app, storeId, parentCurrencyId);
  if (!currency) {
    if (!parentCurrencyId && !anyBodyField(body, VARIATION_SOURCE_FIELDS)) return null;
    return validationError("El producto padre no tiene una moneda valida.", "price_currency");
  }

  const originalCurrencyId = relationId(original, "price_currency");
  const currencyChanged = Boolean(original && originalCurrencyId && originalCurrencyId !== currency.id);
  const priceAmount = sourceAmount(record, original, body, "price_amount", "price_usd", currency.rate, currencyChanged);
  const offerAmount = sourceAmount(record, original, body, "offer_price_amount", "offer_price_usd", currency.rate, currencyChanged);
  const costAmount = sourceAmount(record, original, body, "cost_amount", "cost_usd", currency.rate, currencyChanged);
  const isOffer = recordBool(record, "is_offer");
  if (isOffer && (!(priceAmount > 0) || !(offerAmount > 0) || offerAmount >= priceAmount)) {
    return validationError("El precio de oferta debe ser mayor que 0 y menor que el precio normal.", "offer_price_amount");
  }

  record.set("price_currency", currency.id);
  record.set("price_amount", priceAmount);
  record.set("offer_price_amount", isOffer ? offerAmount : 0);
  record.set("cost_amount", costAmount);
  record.set("price_usd", toUsd(priceAmount, currency.rate));
  record.set("offer_price_usd", isOffer ? toUsd(offerAmount, currency.rate) : 0);
  record.set("cost_usd", toUsd(costAmount, currency.rate));
  return null;
}

function listRecords(app, collection, filter, params) {
  let offset = 0;
  const limit = 200;
  const records = [];
  while (true) {
    const chunk = app.findRecordsByFilter(collection, filter || "", "created", limit, offset, params || {}) || [];
    records.push(...chunk);
    if (chunk.length < limit) return records;
    offset += limit;
  }
}

function synchronizeVariationCurrency(app, variation, currency) {
  const priceUsd = recordNumber(variation, "price_usd");
  const offerUsd = recordNumber(variation, "offer_price_usd");
  const costUsd = recordNumber(variation, "cost_usd");
  variation.set("price_currency", currency.id);
  variation.set("price_amount", fromUsd(priceUsd, currency.rate));
  variation.set("offer_price_amount", fromUsd(offerUsd, currency.rate));
  variation.set("cost_amount", fromUsd(costUsd, currency.rate));
  app.save(variation);
}

function syncVariationsAfterProductCurrencyChange(e) {
  const record = e && e.record;
  const original = originalRecord(record);
  if (!record || !original) return;
  const previousId = relationId(original, "price_currency");
  const nextId = relationId(record, "price_currency");
  if (!nextId || previousId === nextId) return;
  const currency = resolveCurrency(e.app, relationId(record, "store"), nextId);
  if (!currency) return;
  listRecords(e.app, "product_variations", "product = {:product}", { product: record.id })
    .forEach((variation) => synchronizeVariationCurrency(e.app, variation, currency));
}

function recalculateProduct(app, product, rate) {
  const regularAmount = recordNumber(product, "regular_price_amount");
  const offerAmount = recordNumber(product, "offer_price_amount");
  const regularUsd = toUsd(regularAmount, rate);
  const isOffer = recordBool(product, "is_offer") && offerAmount > 0 && offerAmount < regularAmount;
  product.set("regular_price_usd", regularUsd);
  product.set("offer_price_usd", isOffer ? toUsd(offerAmount, rate) : 0);
  product.set("cost_usd", toUsd(recordNumber(product, "cost_amount"), rate));
  product.set("base_price_usd", isOffer ? toUsd(offerAmount, rate) : regularUsd);
  app.save(product);
}

function recalculateVariation(app, variation, rate) {
  const priceAmount = recordNumber(variation, "price_amount");
  const offerAmount = recordNumber(variation, "offer_price_amount");
  const isOffer = recordBool(variation, "is_offer") && offerAmount > 0 && offerAmount < priceAmount;
  variation.set("price_usd", toUsd(priceAmount, rate));
  variation.set("offer_price_usd", isOffer ? toUsd(offerAmount, rate) : 0);
  variation.set("cost_usd", toUsd(recordNumber(variation, "cost_amount"), rate));
  app.save(variation);
}

function repriceRecordsAfterCurrencyRateChange(e) {
  const currency = e && e.record;
  if (!currency) return;
  const original = originalRecord(currency);
  const rate = recordNumber(currency, "exchange_rate");
  const previousRate = recordNumber(original, "exchange_rate");
  if (!(rate > 0) || (original && rate === previousRate)) return;
  const currencyId = String(currency.id || "");
  listRecords(e.app, "products", "price_currency = {:currency}", { currency: currencyId })
    .forEach((product) => recalculateProduct(e.app, product, rate));
  listRecords(e.app, "product_variations", "price_currency = {:currency}", { currency: currencyId })
    .forEach((variation) => recalculateVariation(e.app, variation, rate));
}

function continueProductCurrencySync(e) {
  const result = e.next();
  try { syncVariationsAfterProductCurrencyChange(e); } catch (_) {
    try { e.app.logger().error("PowerZona product variation currency sync failed safely.", "code", "PZ_PRODUCT_CURRENCY_SYNC_FAILED"); } catch (_) {}
  }
  return result;
}

function continueCurrencyReprice(e) {
  const result = e.next();
  try { repriceRecordsAfterCurrencyRateChange(e); } catch (_) {
    try { e.app.logger().error("PowerZona currency repricing failed safely.", "code", "PZ_CURRENCY_REPRICE_FAILED"); } catch (_) {}
  }
  return result;
}

module.exports = {
  continueCurrencyReprice,
  continueProductCurrencySync,
  fromUsd,
  normalizeProductPricingRequest,
  normalizeVariationPricingRequest,
  raisePricingRequestError,
  recalculateProduct,
  recalculateVariation,
  repriceRecordsAfterCurrencyRateChange,
  rounded,
  syncVariationsAfterProductCurrencyChange,
  toUsd,
};
