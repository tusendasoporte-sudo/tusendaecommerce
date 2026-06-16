/// <reference path="../pb_data/types.d.ts" />

// PZ-CURRENCIES-BASE-FIELD-20260616
// Agrega is_base para separar la moneda base interna de la moneda predeterminada publica.

function hasField(collection, name) {
  try {
    return !!collection.fields.getByName(name);
  } catch (_) {
    return false;
  }
}

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

migrate((app) => {
  const collection = app.findCollectionByNameOrId("currencies");
  if (!hasField(collection, "is_base")) {
    collection.fields.add(new Field({
      default: false,
      hidden: false,
      id: "bool1780471201",
      name: "is_base",
      presentable: true,
      required: false,
      system: false,
      type: "bool",
    }));
    app.save(collection);
  }

  const seenUsdByStore = {};
  listRecords(app, "currencies", "").forEach((record) => {
    const code = normalizeCode(record.get("code"));
    const store = String(record.get("store") || "");
    const storeKey = store || "__global__";
    const shouldBeBase = code === "USD" && !seenUsdByStore[storeKey];
    if (code === "USD" && !seenUsdByStore[storeKey]) seenUsdByStore[storeKey] = record.id;

    let changed = false;
    if (record.get("is_base") !== shouldBeBase) {
      record.set("is_base", shouldBeBase);
      changed = true;
    }
    if (shouldBeBase && Number(record.get("exchange_rate") || 0) !== 1) {
      record.set("exchange_rate", 1);
      changed = true;
    }
    if (shouldBeBase && record.get("active") !== true) {
      record.set("active", true);
      changed = true;
    }
    if (changed) app.save(record);
  });
}, (app) => {
  const collection = app.findCollectionByNameOrId("currencies");
  try { collection.fields.removeById("bool1780471201"); } catch (_) {}
  app.save(collection);
});
