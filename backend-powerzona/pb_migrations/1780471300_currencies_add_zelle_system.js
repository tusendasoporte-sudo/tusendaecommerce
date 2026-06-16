/// <reference path="../pb_data/types.d.ts" />

// PZ-CURRENCIES-ZELLE-SYSTEM-20260616
// Garantiza ZELLE como moneda fija editable por tienda.

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
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

function findCurrency(app, storeId, code) {
  try {
    return app.findFirstRecordByFilter("currencies", `store = "${storeId}" && code = "${code}"`);
  } catch (_) {
    return null;
  }
}

migrate((app) => {
  const stores = listRecords(app, "stores", "");
  const currenciesCollection = app.findCollectionByNameOrId("currencies");

  listRecords(app, "currencies", "").forEach((record) => {
    if (normalizeCode(record.get("code")) !== "ZELLE") return;
    let changed = false;
    if (record.get("is_system") !== true) {
      record.set("is_system", true);
      changed = true;
    }
    if (record.get("is_base") !== false) {
      record.set("is_base", false);
      changed = true;
    }
    if (!Number.isFinite(Number(record.get("exchange_rate"))) || Number(record.get("exchange_rate") || 0) <= 0) {
      record.set("exchange_rate", 1);
      changed = true;
    }
    if (changed) app.save(record);
  });

  stores.forEach((store) => {
    const existing = findCurrency(app, store.id, "ZELLE");
    const record = existing || new Record(currenciesCollection, {});
    const alreadyExists = !!record.id;
    record.set("store", store.id);
    record.set("code", "ZELLE");
    record.set("name", record.get("name") || "Zelle");
    record.set("symbol", record.get("symbol") || "Zelle");
    record.set("exchange_rate", Number(record.get("exchange_rate") || 0) > 0 ? Number(record.get("exchange_rate")) : 1);
    record.set("active", alreadyExists ? record.get("active") !== false : false);
    record.set("is_default", record.get("is_default") === true);
    record.set("is_system", true);
    record.set("is_base", false);
    app.save(record);
  });
}, (_) => {
  // No se elimina ZELLE en rollback para no borrar configuraciones de tiendas existentes.
});
