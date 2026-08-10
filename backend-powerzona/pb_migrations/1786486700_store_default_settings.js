/// <reference path="../pb_data/types.d.ts" />

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

function normalizedCurrencyCode(record) {
  return text(record, "code").toUpperCase().replace(/\s+/g, "");
}

function storeOrderPrefix(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toUpperCase();
  const words = normalized.split(/[^A-Z]+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).map((word) => word[0]).join("");
  return String(words[0] || "MT").slice(0, 2) || "MT";
}

function createDefaultSettings(app, collection, store, usd) {
  const storeName = text(store, "name") || "Mi tienda";
  const settings = new Record(collection, {});
  settings.set("store_name", storeName);
  settings.set("whatsapp_number", text(store, "owner_phone"));
  settings.set("default_currency", usd.id);
  settings.set("order_prefix", storeOrderPrefix(storeName));
  settings.set("public_category_columns", "1");
  settings.set("notifications_enabled", true);
  settings.set("notify_new_order", true);
  settings.set("notify_pending_order", true);
  settings.set("notify_review_pending", true);
  settings.set("pending_order_hours", 2);
  settings.set("notification_priority_enabled", true);
  settings.set("notification_priority_important_min_usd", 50);
  settings.set("notification_priority_critical_min_usd", 100);
  settings.set("notification_show_order_subtotal", true);
  settings.set("notification_bell_priority_colors", true);
  settings.set("notify_low_stock", true);
  settings.set("low_stock_threshold", 3);
  settings.set("notify_out_of_stock", true);
  settings.set("notification_cleanup_enabled", true);
  settings.set("notification_cleanup_days", 15);
  settings.set("cover_mode", "single");
  settings.set("business_hours_mode", "always_available");
  settings.set("allow_orders_when_closed", true);
  settings.set("maintenance_mode", false);
  settings.set("active", true);
  settings.set("store", store.id);
  app.save(settings);
  return settings;
}

migrate((app) => {
  const settingsCollection = app.findCollectionByNameOrId("settings");
  const whatsappField = settingsCollection.fields.getByName("whatsapp_number");
  if (whatsappField && whatsappField.required === true) {
    whatsappField.required = false;
    app.save(settingsCollection);
  }

  listRecords(app, "stores", "").forEach((store) => {
    const existing = listRecords(app, "settings", "store = {:store}", { store: store.id });
    if (existing.length) return;

    const usd = listRecords(app, "currencies", "store = {:store}", { store: store.id })
      .find((currency) => normalizedCurrencyCode(currency) === "USD") || null;
    if (!usd) throw new Error(`missing_usd_for_store_settings:${store.id}`);
    createDefaultSettings(app, settingsCollection, store, usd);
  });
}, () => {
  // Records are retained because they can receive commercial references after creation.
});
