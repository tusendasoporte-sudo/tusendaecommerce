/// <reference path="../pb_data/types.d.ts" />

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const SYSTEM_CURRENCY_DEFAULTS = Object.freeze([
  Object.freeze({ code: "USD", name: "Dolar estadounidense", symbol: "$", active: true, isBase: true }),
  Object.freeze({ code: "CUP", name: "Peso cubano", symbol: "CUP", active: false, isBase: false }),
  Object.freeze({ code: "EUR", name: "Euro", symbol: "EUR", active: false, isBase: false }),
  Object.freeze({ code: "CASHAPP", name: "CashApp", symbol: "$", active: false, isBase: false }),
  Object.freeze({ code: "ZELLE", name: "Zelle", symbol: "Zelle", active: false, isBase: false }),
]);

function listRecords(app, collectionName, filter, params) {
  let offset = 0;
  const limit = 200;
  const records = [];
  while (true) {
    const chunk = app.findRecordsByFilter(collectionName, filter || "", "created", limit, offset, params || {});
    if (!chunk || !chunk.length) return records;
    records.push(...chunk);
    if (chunk.length < limit) return records;
    offset += limit;
  }
}

function value(record, key) {
  try {
    return record.get(key);
  } catch (_) {
    return undefined;
  }
}

function text(record, key) {
  return String(value(record, key) || "").trim();
}

function normalizedCode(record) {
  return text(record, "code").toUpperCase().replace(/\s+/g, "");
}

function settingsForStore(app, storeId) {
  try {
    return app.findFirstRecordByFilter("settings", "store = {:store}", { store: storeId });
  } catch (_) {
    return null;
  }
}

function createOrRepairSystemCurrency(app, collection, storeId, existing, definition) {
  const currency = existing || new Record(collection, {});
  const currentRate = Number(value(currency, "exchange_rate"));
  currency.set("store", storeId);
  currency.set("code", definition.code);
  currency.set("name", text(currency, "name") || definition.name);
  currency.set("symbol", text(currency, "symbol") || definition.symbol);
  currency.set("exchange_rate", definition.code === "USD"
    ? 1
    : (Number.isFinite(currentRate) && currentRate >= 0 ? currentRate : 1));
  currency.set("active", definition.code === "USD" ? true : (existing ? value(currency, "active") === true : false));
  currency.set("is_system", true);
  currency.set("is_base", definition.isBase);
  app.save(currency);
  return currency;
}

function ensureSystemCurrenciesForStore(app, collection, store) {
  const currencies = listRecords(app, "currencies", "store = {:store}", { store: store.id });
  const settings = settingsForStore(app, store.id);
  const configuredDefaultId = text(settings, "default_currency");
  const configuredDefault = currencies.find((currency) => (
    currency.id === configuredDefaultId
    && (value(currency, "active") === true || normalizedCode(currency) === "USD")
  )) || null;
  const flaggedDefault = currencies.find((currency) => (
    value(currency, "active") === true && value(currency, "is_default") === true
  )) || null;
  const selectedDefault = configuredDefault || flaggedDefault;

  const systemCurrencies = SYSTEM_CURRENCY_DEFAULTS.map((definition) => {
    const existing = currencies.find((currency) => normalizedCode(currency) === definition.code) || null;
    const currency = createOrRepairSystemCurrency(app, collection, store.id, existing, definition);
    if (!currencies.includes(currency)) currencies.push(currency);
    return currency;
  });
  const usd = systemCurrencies[0];
  const defaultCurrency = selectedDefault || usd;

  currencies.forEach((currency) => {
    let changed = false;
    const shouldBeBase = currency.id === usd.id;
    const shouldBeDefault = currency.id === defaultCurrency.id;
    if (value(currency, "is_base") !== shouldBeBase) {
      currency.set("is_base", shouldBeBase);
      changed = true;
    }
    if (value(currency, "is_default") !== shouldBeDefault) {
      currency.set("is_default", shouldBeDefault);
      changed = true;
    }
    if (changed) app.save(currency);
  });

  if (settings && !configuredDefaultId) {
    settings.set("default_currency", defaultCurrency.id);
    app.save(settings);
  }
}

function fixedCurrencyDeleteRule() {
  return `((${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE}))`
    + ' && is_system != true'
    + ' && code != "USD"'
    + ' && code != "CUP"'
    + ' && code != "EUR"'
    + ' && code != "CASHAPP"'
    + ' && code != "ZELLE"';
}

migrate((app) => {
  const currencies = app.findCollectionByNameOrId("currencies");
  currencies.deleteRule = fixedCurrencyDeleteRule();
  app.save(currencies);
  listRecords(app, "stores", "").forEach((store) => ensureSystemCurrenciesForStore(app, currencies, store));
}, (app) => {
  const currencies = app.findCollectionByNameOrId("currencies");
  currencies.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE} && is_system != true && code != "USD" && code != "CUP" && code != "EUR" && code != "CASHAPP" && code != "ZELLE")`;
  app.save(currencies);
  // System currencies are retained because they may already have commercial relations.
});
