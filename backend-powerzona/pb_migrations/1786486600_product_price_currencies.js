/// <reference path="../pb_data/types.d.ts" />

const PRODUCT_PRICE_FIELD_IDS = Object.freeze([
  "relation1786486601",
  "number1786486602",
  "number1786486603",
  "number1786486604",
]);
const VARIATION_PRICE_FIELD_IDS = Object.freeze([
  "relation1786486611",
  "number1786486612",
  "number1786486613",
  "number1786486614",
]);

function addFieldIfMissing(collection, options) {
  try {
    const existing = collection.fields.getByName(options.name);
    if (existing) return existing;
  } catch (_) {}
  const field = new Field(options);
  collection.fields.add(field);
  return field;
}

function numberField(id, name) {
  return {
    default: 0,
    hidden: false,
    id,
    max: null,
    min: 0,
    name,
    onlyInt: false,
    presentable: true,
    required: false,
    system: false,
    type: "number",
  };
}

function relationField(id, name, collectionId) {
  return {
    cascadeDelete: false,
    collectionId,
    hidden: false,
    id,
    maxSelect: 1,
    minSelect: 0,
    name,
    presentable: true,
    required: false,
    system: false,
    type: "relation",
  };
}

function value(record, key) {
  try { return record.get(key); } catch (_) { return undefined; }
}

function relationId(record, key) {
  const current = value(record, key);
  return Array.isArray(current) ? String(current[0] || "").trim() : String(current || "").trim();
}

function number(record, key) {
  const parsed = Number(value(record, key));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
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

function usdCurrencyForStore(app, storeId, cache) {
  if (!storeId) return null;
  if (Object.prototype.hasOwnProperty.call(cache, storeId)) return cache[storeId];
  let currency = null;
  try {
    currency = app.findFirstRecordByFilter(
      "currencies",
      "store = {:store} && code = 'USD'",
      { store: storeId },
    );
  } catch (_) {}
  cache[storeId] = currency;
  return currency;
}

migrate((app) => {
  const currencies = app.findCollectionByNameOrId("currencies");
  const products = app.findCollectionByNameOrId("products");
  const variations = app.findCollectionByNameOrId("product_variations");

  addFieldIfMissing(products, relationField(PRODUCT_PRICE_FIELD_IDS[0], "price_currency", currencies.id));
  addFieldIfMissing(products, numberField(PRODUCT_PRICE_FIELD_IDS[1], "regular_price_amount"));
  addFieldIfMissing(products, numberField(PRODUCT_PRICE_FIELD_IDS[2], "offer_price_amount"));
  addFieldIfMissing(products, numberField(PRODUCT_PRICE_FIELD_IDS[3], "cost_amount"));
  app.save(products);

  addFieldIfMissing(variations, relationField(VARIATION_PRICE_FIELD_IDS[0], "price_currency", currencies.id));
  addFieldIfMissing(variations, numberField(VARIATION_PRICE_FIELD_IDS[1], "price_amount"));
  addFieldIfMissing(variations, numberField(VARIATION_PRICE_FIELD_IDS[2], "offer_price_amount"));
  addFieldIfMissing(variations, numberField(VARIATION_PRICE_FIELD_IDS[3], "cost_amount"));
  app.save(variations);

  const usdByStore = {};
  const productStoreById = {};
  listRecords(app, "products", "").forEach((product) => {
    const storeId = relationId(product, "store");
    productStoreById[product.id] = storeId;
    const usd = usdCurrencyForStore(app, storeId, usdByStore);
    if (!usd) return;
    const base = number(product, "base_price_usd");
    const regular = number(product, "regular_price_usd") || base;
    product.set("price_currency", usd.id);
    product.set("regular_price_amount", regular);
    product.set("offer_price_amount", number(product, "offer_price_usd"));
    product.set("cost_amount", number(product, "cost_usd"));
    app.save(product);
  });

  listRecords(app, "product_variations", "").forEach((variation) => {
    const productId = relationId(variation, "product");
    let storeId = productStoreById[productId] || "";
    if (!storeId) {
      try { storeId = relationId(app.findRecordById("products", productId), "store"); } catch (_) {}
    }
    const usd = usdCurrencyForStore(app, storeId, usdByStore);
    if (!usd) return;
    variation.set("price_currency", usd.id);
    variation.set("price_amount", number(variation, "price_usd"));
    variation.set("offer_price_amount", number(variation, "offer_price_usd"));
    variation.set("cost_amount", number(variation, "cost_usd"));
    app.save(variation);
  });
}, (app) => {
  const products = app.findCollectionByNameOrId("products");
  PRODUCT_PRICE_FIELD_IDS.forEach((id) => {
    try { products.fields.removeById(id); } catch (_) {}
  });
  app.save(products);

  const variations = app.findCollectionByNameOrId("product_variations");
  VARIATION_PRICE_FIELD_IDS.forEach((id) => {
    try { variations.fields.removeById(id); } catch (_) {}
  });
  app.save(variations);
});
