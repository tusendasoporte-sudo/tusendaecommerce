/// <reference path="../pb_data/types.d.ts" />

const DUPLICATE_USD_ID = "qmedtz0hcb6ufjf";
const CANONICAL_USD_ID = "piepj7egaqsdokj";

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
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

function relationId(record, key) {
  const current = value(record, key);
  if (Array.isArray(current)) return String(current[0] || "").trim();
  return String(current || "").trim();
}

function normalizedCode(record) {
  return text(record, "code").toUpperCase().replace(/\s+/g, "");
}

function listRecords(app, collection, filter, params) {
  let offset = 0;
  const limit = 200;
  const records = [];
  while (true) {
    const chunk = app.findRecordsByFilter(
      collection,
      filter || "",
      "created",
      limit,
      offset,
      params || {}
    ) || [];
    records.push(...chunk);
    if (chunk.length < limit) return records;
    offset += limit;
  }
}

function requireExpectedDuplicate(canonical, duplicate) {
  const canonicalStore = relationId(canonical, "store");
  const duplicateStore = relationId(duplicate, "store");
  if (normalizedCode(canonical) !== "USD"
    || normalizedCode(duplicate) !== "USD"
    || !canonicalStore
    || canonicalStore !== duplicateStore) {
    throw new Error("PZ_DUPLICATE_USD_SAFETY_CHECK_FAILED");
  }
}

migrate((app) => {
  const duplicate = findRecord(app, "currencies", DUPLICATE_USD_ID);
  if (!duplicate) return;

  const canonical = findRecord(app, "currencies", CANONICAL_USD_ID);
  if (!canonical) throw new Error("PZ_CANONICAL_USD_NOT_FOUND");
  requireExpectedDuplicate(canonical, duplicate);

  const settings = listRecords(
    app,
    "settings",
    "default_currency = {:duplicate}",
    { duplicate: DUPLICATE_USD_ID }
  );
  const orders = listRecords(
    app,
    "orders",
    "currency = {:duplicate}",
    { duplicate: DUPLICATE_USD_ID }
  );

  settings.forEach((record) => {
    record.set("default_currency", CANONICAL_USD_ID);
    app.save(record);
  });
  orders.forEach((record) => {
    record.set("currency", CANONICAL_USD_ID);
    app.save(record);
  });

  canonical.set("code", "USD");
  canonical.set("exchange_rate", 1);
  canonical.set("active", true);
  canonical.set("is_system", true);
  canonical.set("is_base", true);
  if (value(duplicate, "is_default") === true || settings.length > 0) {
    canonical.set("is_default", true);
  }
  app.save(canonical);
  app.delete(duplicate);
}, () => {
  // Intentional no-op: recreating a duplicate currency would corrupt store data again.
});
