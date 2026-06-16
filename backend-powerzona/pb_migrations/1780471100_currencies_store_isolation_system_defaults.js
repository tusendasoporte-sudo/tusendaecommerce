/// <reference path="../pb_data/types.d.ts" />

// PZ-CURRENCIES-STORE-ISOLATION-SYSTEM-DEFAULTS-20260616
// Aisla currencies por tienda, marca monedas fijas y permite administracion segura por store_admin.

const MASTER_ADMIN_RULE = '@request.auth.role = "master_admin"';
const STORE_ADMIN_RULE = '@request.auth.role = "store_admin" && store = @request.auth.store';
const STORE_STAFF_READ_RULE = '@request.auth.role = "store_staff" && store = @request.auth.store';
const STORE_OWNER_READ_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE}) || (${STORE_STAFF_READ_RULE})`;
const PUBLIC_ACTIVE_READ_RULE = 'active = true';
const STORE_OWNER_WRITE_RULE = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE})`;
const SYSTEM_CODES = ["USD", "CUP", "EUR", "CASHAPP", "ZELLE"];
const SYSTEM_DEFAULTS = {
  USD: { name: "Dolar estadounidense", symbol: "$", exchange_rate: 1, active: true, is_default: true },
  CUP: { name: "Peso cubano", symbol: "CUP", exchange_rate: 1, active: true, is_default: false },
  EUR: { name: "Euro", symbol: "EUR", exchange_rate: 1, active: false, is_default: false },
  CASHAPP: { name: "CashApp", symbol: "$", exchange_rate: 1, active: false, is_default: false },
  ZELLE: { name: "Zelle", symbol: "Zelle", exchange_rate: 1, active: false, is_default: false },
};

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

function addStoreFieldIfMissing(collection, storesCollectionId) {
  if (hasField(collection, "store")) return;
  collection.fields.add(new Field({
    cascadeDelete: false,
    collectionId: storesCollectionId,
    hidden: false,
    id: "relation1780471101",
    maxSelect: 1,
    minSelect: 0,
    name: "store",
    presentable: false,
    required: false,
    system: false,
    type: "relation",
  }));
}

function addSystemFieldIfMissing(collection) {
  if (hasField(collection, "is_system")) return;
  collection.fields.add(new Field({
    default: false,
    hidden: false,
    id: "bool1780471102",
    name: "is_system",
    presentable: true,
    required: false,
    system: false,
    type: "bool",
  }));
}

function addIndexIfNeeded(collection, indexName, unique, columns) {
  try {
    collection.getIndex(indexName);
    return;
  } catch (_) {
    try {
      collection.addIndex(indexName, unique, columns, "");
    } catch (error) {
      console.log(`No se pudo crear el indice ${indexName}: ${error && error.message ? error.message : error}`);
    }
  }
}

function removeIndexIfExists(collection, indexName) {
  try {
    collection.removeIndex(indexName);
  } catch (_) {}
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function findCurrency(app, storeId, code) {
  try {
    return app.findFirstRecordByFilter("currencies", `store = "${storeId}" && code = "${code}"`);
  } catch (_) {
    return null;
  }
}

function listRecords(app, collectionName, filter) {
  let offset = 0;
  const limit = 200;
  const records = [];
  while (true) {
    const chunk = app.findRecordsByFilter(collectionName, filter || "", "created", limit, offset);
    if (!chunk || !chunk.length) return records;
    records.push(...chunk);
    if (chunk.length < limit) return records;
    offset += limit;
  }
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const powerzona = app.findFirstRecordByData("stores", "slug", "powerzona");
  const currenciesCollection = app.findCollectionByNameOrId("currencies");

  addStoreFieldIfMissing(currenciesCollection, stores.id);
  addSystemFieldIfMissing(currenciesCollection);
  currenciesCollection.listRule = `(${PUBLIC_ACTIVE_READ_RULE}) || (${STORE_OWNER_READ_RULE})`;
  currenciesCollection.viewRule = currenciesCollection.listRule;
  currenciesCollection.createRule = STORE_OWNER_WRITE_RULE;
  currenciesCollection.updateRule = STORE_OWNER_WRITE_RULE;
  currenciesCollection.deleteRule = `(${MASTER_ADMIN_RULE}) || (${STORE_ADMIN_RULE} && is_system != true && code != "USD" && code != "CUP" && code != "EUR" && code != "CASHAPP" && code != "ZELLE")`;
  addIndexIfNeeded(currenciesCollection, "idx_currencies_store", false, "store");
  app.save(currenciesCollection);

  const existing = listRecords(app, "currencies", "");
  existing.forEach((record) => {
    const code = normalizeCode(record.get("code"));
    record.set("code", code);
    if (!record.get("store")) record.set("store", powerzona.id);
    if (SYSTEM_CODES.includes(code)) record.set("is_system", true);
    if (code === "USD") {
      record.set("exchange_rate", 1);
      record.set("active", true);
    }
    app.save(record);
  });

  SYSTEM_CODES.forEach((code) => {
    const defaults = SYSTEM_DEFAULTS[code];
    const record = findCurrency(app, powerzona.id, code) || new Record(currenciesCollection, {});
    const alreadyExists = !!record.id;
    record.set("store", powerzona.id);
    record.set("code", code);
    record.set("name", record.get("name") || defaults.name);
    record.set("symbol", record.get("symbol") || defaults.symbol);
    record.set("exchange_rate", code === "USD" ? 1 : Number(record.get("exchange_rate") || defaults.exchange_rate || 1));
    record.set("active", alreadyExists ? record.get("active") !== false : defaults.active);
    record.set("is_default", code === "USD" ? (record.get("is_default") === true || defaults.is_default) : record.get("is_default") === true);
    record.set("is_system", true);
    app.save(record);
  });

  try {
    const updatedCollection = app.findCollectionByNameOrId("currencies");
    addIndexIfNeeded(updatedCollection, "idx_currencies_store_code", true, "store, code");
    app.save(updatedCollection);
  } catch (error) {
    console.log(`No se pudo guardar el indice unico idx_currencies_store_code. Revisa duplicados existentes: ${error && error.message ? error.message : error}`);
  }
}, (app) => {
  const currenciesCollection = findCollectionSafe(app, "currencies");
  if (!currenciesCollection) return;
  removeIndexIfExists(currenciesCollection, "idx_currencies_store_code");
  removeIndexIfExists(currenciesCollection, "idx_currencies_store");
  currenciesCollection.listRule = "active = true";
  currenciesCollection.viewRule = "active = true";
  currenciesCollection.createRule = null;
  currenciesCollection.updateRule = null;
  currenciesCollection.deleteRule = null;
  try { currenciesCollection.fields.removeById("bool1780471102"); } catch (_) {}
  try { currenciesCollection.fields.removeById("relation1780471101"); } catch (_) {}
  app.save(currenciesCollection);
});
