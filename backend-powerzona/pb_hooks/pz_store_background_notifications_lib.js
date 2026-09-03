/// <reference path="../pb_data/types.d.ts" />

const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);

const STORE_PLAN_NOTIFICATION_TYPES = Object.freeze([
  "plan_expiring_soon",
  "plan_expiring_critical",
  "plan_grace_period",
  "plan_expired",
]);

const INVENTORY_SETTING_FIELDS = Object.freeze([
  "notifications_enabled",
  "notify_low_stock",
  "notify_out_of_stock",
  "low_stock_threshold",
]);
const PENDING_SETTING_FIELDS = Object.freeze([
  "notifications_enabled",
  "notify_pending_order",
  "pending_order_hours",
]);
const COMPLETED_RAFFLE_STATUSES = Object.freeze([
  "winner_published",
  "no_winner_published",
  "finalized",
  "archived",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try { return record.get(key); } catch (_) {}
  }
  return record[key];
}

function recordString(record, key) {
  if (!record) return "";
  if (typeof record.getString === "function") {
    try { return String(record.getString(key) || "").trim(); } catch (_) {}
  }
  const value = recordValue(record, key);
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBoolean(record, key) {
  const value = recordValue(record, key);
  if (typeof value === "string") return !["", "0", "false", "no", "off"].includes(value.trim().toLowerCase());
  return Boolean(value);
}

function recordNumber(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isFinite(value) ? value : 0;
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

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function dateMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, limit, offset, params) {
  try {
    return app.findRecordsByFilter(collection, filter || "", sort || "", limit || 200, offset || 0, params || {}) || [];
  } catch (_) {
    return [];
  }
}

function findAllRecords(app, collection, filter, sort, params, maxRecords) {
  const rows = [];
  const pageSize = 200;
  const maximum = Math.max(pageSize, Number(maxRecords || 10000));
  for (let offset = 0; offset < maximum; offset += pageSize) {
    const page = findRecords(app, collection, filter, sort || "id", pageSize, offset, params);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.slice(0, maximum);
}

function settingsForStore(app, storeId) {
  return findFirst(app, "settings", "store = {:store}", { store: storeId });
}

function storeIsActive(store) {
  const status = recordString(store, "status");
  return Boolean(store) && (!status || status === "active");
}

function notificationsEnabled(settings) {
  return Boolean(settings) && recordValue(settings, "notifications_enabled") !== false;
}

function metadataObject(record) {
  const value = recordValue(record, "metadata_json");
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try { return JSON.parse(String(value || "{}")); } catch (_) { return {}; }
}

function matchingNotifications(app, storeId, type, entityCollection, entityId) {
  return findRecords(
    app,
    "store_notifications",
    "store = {:store} && type = {:type} && entity_collection = {:collection} && entity_id = {:entity}",
    "-created",
    50,
    0,
    { store: storeId, type, collection: entityCollection, entity: entityId },
  ).filter((item) => (
    relationId(item, "store") === storeId
    && recordString(item, "type") === type
    && recordString(item, "entity_collection") === entityCollection
    && recordString(item, "entity_id") === entityId
  ));
}

function latestNotification(app, storeId, type, entityCollection, entityId) {
  const rows = matchingNotifications(app, storeId, type, entityCollection, entityId);
  rows.sort((a, b) => dateMs(recordString(b, "created")) - dateMs(recordString(a, "created")));
  return rows[0] || null;
}

function hasNotificationAnyStatus(app, storeId, type, entityCollection, entityId) {
  return Boolean(latestNotification(app, storeId, type, entityCollection, entityId));
}

function sourceNotificationCovered(app, storeId, type, entityCollection, entityId, sourceUpdated) {
  const current = latestNotification(app, storeId, type, entityCollection, entityId);
  if (!current) return false;
  if (recordString(current, "status") === "unread") return true;
  const metadata = metadataObject(current);
  if (sourceUpdated && String(metadata.source_updated || "") === String(sourceUpdated)) return true;
  const sourceTime = dateMs(sourceUpdated);
  const notificationTime = dateMs(recordString(current, "updated") || recordString(current, "created"));
  return Number.isFinite(sourceTime) && Number.isFinite(notificationTime)
    ? sourceTime <= notificationTime + 60000
    : true;
}

function createNotification(app, values) {
  const notification = new Record(app.findCollectionByNameOrId("store_notifications"), {});
  notification.set("store", values.storeId);
  notification.set("type", values.type);
  notification.set("title", bounded(values.title, 160));
  notification.set("message", bounded(values.message, 600));
  notification.set("status", "unread");
  notification.set("priority", ["normal", "important", "critical"].includes(values.priority) ? values.priority : "normal");
  notification.set("target_url", bounded(values.targetUrl, 300));
  notification.set("entity_collection", bounded(values.entityCollection, 80));
  notification.set("entity_id", bounded(values.entityId, 80));
  notification.set("metadata_json", values.metadata || {});
  app.save(notification);
  return notification;
}

function storePlanNotificationType(state) {
  if (state === "expiring") return "plan_expiring_soon";
  if (state === "critical") return "plan_expiring_critical";
  if (state === "grace") return "plan_grace_period";
  if (state === "expired") return "plan_expired";
  return "";
}

function storePlanCycleId(store, state) {
  const plan = String(state.plan || "plan").replace(/[^a-z0-9]/gi, "").slice(0, 12);
  const startedKey = String(state.plan_started_at || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 17);
  const expirationKey = String(state.plan_expires_at || "")
    .replace(/[^0-9]/g, "")
    .slice(0, 17);
  return `${String(store.id || "").slice(0, 15)}_${plan}_${startedKey}_${expirationKey}`.slice(0, 80);
}

function storePlanNotificationCopy(state) {
  const trial = state.plan === "free";
  if (state.state === "expired") {
    return {
      title: trial ? "Tu prueba gratuita venció" : `Tu ${state.plan_name} venció`,
      message: trial
        ? "Tus datos están conservados. Contrata un plan Básico o Premium para continuar."
        : "Tus datos están conservados. Renueva la suscripción para recuperar el acceso del plan.",
      priority: "critical",
    };
  }
  if (state.state === "grace") {
    const graceDate = plans.getHavanaCivilDateKey(state.grace_expires_at) || "la fecha indicada";
    return {
      title: "Suscripción en periodo de gracia",
      message: `Tu ${state.plan_name} venció. Renueva antes del ${graceDate}; todos tus datos permanecen conservados.`,
      priority: "critical",
    };
  }
  const days = Math.max(0, Number(state.days_remaining || 0));
  const when = days === 0 ? "hoy" : `en ${days} ${days === 1 ? "día" : "días"}`;
  return {
    title: trial ? "Tu prueba gratuita está por vencer" : `Tu ${state.plan_name} está por vencer`,
    message: trial
      ? `La prueba vence ${when}. Contrata un plan Básico o Premium para continuar sin interrupciones.`
      : `La suscripción vence ${when}. Renueva por 1, 6 o 12 meses para continuar sin interrupciones.`,
    priority: state.state === "critical" ? "critical" : "important",
  };
}

function processStorePlanLifecycle(app, store, now) {
  if (!storeIsActive(store)) return null;
  let state;
  try {
    state = plans.resolvePlanState(store, asDate(now));
  } catch (_) {
    return null;
  }
  const type = storePlanNotificationType(state.state);
  if (!type || state.plan_is_permanent || !state.plan_expires_at) return null;
  const entityId = storePlanCycleId(store, state);
  if (!entityId || hasNotificationAnyStatus(app, store.id, type, "stores", entityId)) return null;
  const copy = storePlanNotificationCopy(state);
  return createNotification(app, {
    storeId: store.id,
    type,
    title: copy.title,
    message: copy.message,
    priority: copy.priority,
    targetUrl: `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/account#plan`,
    entityCollection: "stores",
    entityId,
    metadata: {
      plan: state.plan,
      plan_name: state.plan_name,
      lifecycle_state: state.state,
      days_remaining: state.days_remaining,
      plan_expires_at: state.plan_expires_at,
      grace_expires_at: state.grace_expires_at,
      data_preserved: true,
    },
  });
}

function archiveStorePlanNotifications(app, storeId, now) {
  if (!app || !storeId) return 0;
  const archivedAt = asDate(now).toISOString();
  const rows = findAllRecords(
    app,
    "store_notifications",
    "store = {:store}",
    "id",
    { store: storeId },
    1000,
  );
  let archived = 0;
  rows.forEach((notification) => {
    if (!STORE_PLAN_NOTIFICATION_TYPES.includes(recordString(notification, "type"))
      || recordString(notification, "status") === "archived") return;
    try {
      notification.set("status", "archived");
      notification.set("archived_at", archivedAt);
      app.save(notification);
      archived += 1;
    } catch (_) {}
  });
  return archived;
}

function inventoryConfig(settings) {
  return {
    lowStock: recordValue(settings, "notify_low_stock") !== false,
    outOfStock: recordValue(settings, "notify_out_of_stock") !== false,
    threshold: Math.max(1, Math.floor(recordNumber(settings, "low_stock_threshold") || 3)),
  };
}

function stockValue(record) {
  return Math.max(0, Math.floor(recordNumber(record, "stock")));
}

function productTracksStock(product) {
  return recordValue(product, "track_stock") !== false;
}

function productInventoryAlert(product, settings) {
  if (!product || !productTracksStock(product) || recordBoolean(product, "has_variations")) return null;
  const config = inventoryConfig(settings);
  const stock = stockValue(product);
  const name = recordString(product, "name") || "Producto sin nombre";
  const visible = recordValue(product, "active") !== false;
  const preorder = recordBoolean(product, "allow_preorder");
  if (stock <= 0) {
    if (!config.outOfStock) return null;
    return {
      type: "out_of_stock",
      title: "Producto agotado",
      message: `${name} está agotado${preorder ? " y permite preorder" : ""}${visible ? " · Visible en tienda." : " · Oculto."}`,
      priority: visible && !preorder ? "critical" : "important",
      metadata: { product_id: product.id, product_name: name, stock, visible, preorder },
    };
  }
  if (stock <= config.threshold) {
    if (!config.lowStock) return null;
    return {
      type: "low_stock",
      title: "Stock bajo",
      message: `${name} tiene ${stock} unidad${stock === 1 ? "" : "es"} disponible${stock === 1 ? "" : "s"}.`,
      priority: "important",
      metadata: { product_id: product.id, product_name: name, stock, threshold: config.threshold, visible },
    };
  }
  return null;
}

function variationInventoryAlert(variation, product, settings) {
  if (!variation || !product || !productTracksStock(product) || !recordBoolean(product, "has_variations")) return null;
  const config = inventoryConfig(settings);
  const stock = stockValue(variation);
  const productName = recordString(product, "name") || "Producto";
  const variationName = `${recordString(variation, "variation_type") || "Variación"}: ${recordString(variation, "value") || "Sin valor"}`;
  const visible = recordValue(product, "active") !== false && recordValue(variation, "active") !== false;
  const preorder = recordBoolean(variation, "allow_preorder");
  if (stock <= 0) {
    if (!config.outOfStock) return null;
    return {
      type: "out_of_stock",
      title: "Variación agotada",
      message: `${productName} · ${variationName} está agotada${preorder ? " y permite preorder" : ""}${visible ? " · Visible en tienda." : " · Oculta."}`,
      priority: visible && !preorder ? "critical" : "important",
      metadata: {
        product_id: product.id, product_name: productName, variation_id: variation.id,
        variation_name: variationName, stock, visible, preorder,
      },
    };
  }
  if (stock <= config.threshold) {
    if (!config.lowStock) return null;
    return {
      type: "low_stock",
      title: "Stock bajo de variación",
      message: `${productName} · ${variationName} tiene ${stock} unidad${stock === 1 ? "" : "es"} disponible${stock === 1 ? "" : "s"}.`,
      priority: "important",
      metadata: {
        product_id: product.id, product_name: productName, variation_id: variation.id,
        variation_name: variationName, stock, threshold: config.threshold, visible,
      },
    };
  }
  return null;
}

function saveInventoryAlert(app, store, record, entityCollection, alert, now) {
  if (!alert || !record || !store) return null;
  const sourceUpdated = recordString(record, "updated") || recordString(record, "created") || asDate(now).toISOString();
  if (sourceNotificationCovered(app, store.id, alert.type, entityCollection, record.id, sourceUpdated)) return null;
  return createNotification(app, {
    storeId: store.id,
    type: alert.type,
    title: alert.title,
    message: alert.message,
    priority: alert.priority,
    targetUrl: entityCollection === "products"
      ? `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/products?product=${encodeURIComponent(record.id)}`
      : `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/products?product=${encodeURIComponent(relationId(record, "product"))}&variation=${encodeURIComponent(record.id)}`,
    entityCollection,
    entityId: record.id,
    metadata: { ...alert.metadata, source_updated: sourceUpdated },
  });
}

function processProductInventory(app, product, now, suppliedSettings, suppliedStore) {
  const storeId = relationId(product, "store");
  const store = suppliedStore || findRecord(app, "stores", storeId);
  const settings = suppliedSettings || settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings)) return null;
  const alert = productInventoryAlert(product, settings);
  return saveInventoryAlert(app, store, product, "products", alert, now);
}

function processVariationInventory(app, variation, now, suppliedSettings, suppliedStore, suppliedProduct) {
  const product = suppliedProduct || findRecord(app, "products", relationId(variation, "product"));
  const storeId = relationId(product, "store");
  const store = suppliedStore || findRecord(app, "stores", storeId);
  const settings = suppliedSettings || settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings)) return null;
  const alert = variationInventoryAlert(variation, product, settings);
  return saveInventoryAlert(app, store, variation, "product_variations", alert, now);
}

function processStoreInventory(app, storeId, now) {
  const store = findRecord(app, "stores", storeId);
  const settings = settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings)) return 0;
  const products = findAllRecords(app, "products", "store = {:store}", "id", { store: storeId }, 20000);
  const productById = new Map(products.map((product) => [product.id, product]));
  let created = 0;
  products.forEach((product) => { if (processProductInventory(app, product, now, settings, store)) created += 1; });
  const variations = findAllRecords(app, "product_variations", "product.store = {:store}", "id", { store: storeId }, 50000);
  variations.forEach((variation) => {
    const product = productById.get(relationId(variation, "product")) || null;
    if (processVariationInventory(app, variation, now, settings, store, product)) created += 1;
  });
  return created;
}

function orderProductsSubtotal(order) {
  for (const field of ["subtotal_after_discount_usd", "subtotal", "subtotal_original_usd"]) {
    const value = recordNumber(order, field);
    if (value > 0) return value;
  }
  return Math.max(0, (recordNumber(order, "usd_total") || recordNumber(order, "total"))
    - (recordNumber(order, "shipping") || recordNumber(order, "shipping_usd") || recordNumber(order, "shipping_original_usd")));
}

function orderPriority(order, settings, fallback) {
  if (recordValue(settings, "notification_priority_enabled") === false) return fallback || "important";
  const important = Math.max(0, recordNumber(settings, "notification_priority_important_min_usd") || 50);
  const critical = Math.max(important, recordNumber(settings, "notification_priority_critical_min_usd") || 100);
  const subtotal = orderProductsSubtotal(order);
  return subtotal >= critical ? "critical" : subtotal >= important ? "important" : "normal";
}

function processStorePendingOrders(app, storeId, now, suppliedSettings, suppliedStore) {
  const store = suppliedStore || findRecord(app, "stores", storeId);
  const settings = suppliedSettings || settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings) || recordValue(settings, "notify_pending_order") === false) return 0;
  const hours = Math.max(1, Math.floor(recordNumber(settings, "pending_order_hours") || 2));
  const cutoff = new Date(asDate(now).getTime() - hours * 60 * 60 * 1000);
  const orders = findAllRecords(
    app,
    "orders",
    "store = {:store} && status = \"pending\" && created <= {:cutoff}",
    "created",
    { store: storeId, cutoff: cutoff.toISOString() },
    20000,
  );
  let created = 0;
  orders.forEach((order) => {
    if (relationId(order, "store") !== storeId || recordString(order, "status") !== "pending") return;
    const createdAt = dateMs(recordString(order, "created"));
    if (!Number.isFinite(createdAt) || createdAt > cutoff.getTime()) return;
    if (hasNotificationAnyStatus(app, storeId, "pending_order", "orders", order.id)) return;
    const subtotal = orderProductsSubtotal(order);
    const priority = orderPriority(order, settings, "important");
    const subtotalText = recordValue(settings, "notification_show_order_subtotal") !== false && subtotal > 0
      ? ` - Productos: $${subtotal.toFixed(2)} USD sin envío`
      : "";
    createNotification(app, {
      storeId,
      type: "pending_order",
      title: "Pedido pendiente sin atender",
      message: `Pedido #${recordString(order, "order_number") || order.id} lleva más de ${hours} horas pendiente${subtotalText}.`,
      priority,
      targetUrl: `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/orders/${encodeURIComponent(order.id)}`,
      entityCollection: "orders",
      entityId: order.id,
      metadata: {
        order_number: recordString(order, "order_number"), hours,
        products_subtotal_usd: subtotal, shipping_excluded: true, priority_rule: priority,
      },
    });
    created += 1;
  });
  return created;
}

function raffleDrawKey(raffle) {
  return recordString(raffle, "draw_at").replace(/[^0-9TZ]/g, "").slice(0, 32) || "sinfecha";
}

function raffleResultPublished(raffle) {
  return COMPLETED_RAFFLE_STATUSES.includes(recordString(raffle, "status"))
    || Boolean(recordString(raffle, "winner_number"))
    || Boolean(recordString(raffle, "no_winner_number"))
    || Boolean(recordString(raffle, "result_published_at"));
}

function countActiveRaffleEntries(app, storeId, raffleId) {
  return findAllRecords(
    app,
    "raffle_entries",
    "store = {:store} && raffle = {:raffle} && status = \"active\"",
    "id",
    { store: storeId, raffle: raffleId },
    100000,
  ).filter((entry) => (
    relationId(entry, "store") === storeId
    && relationId(entry, "raffle") === raffleId
    && recordString(entry, "status") === "active"
  )).length;
}

function processDueRaffle(app, raffle, now, suppliedSettings, suppliedStore) {
  if (!raffle || !recordBoolean(raffle, "is_configured") || raffleResultPublished(raffle)) return null;
  const drawTime = dateMs(recordString(raffle, "draw_at"));
  if (!Number.isFinite(drawTime) || drawTime > asDate(now).getTime()) return null;
  const storeId = relationId(raffle, "store");
  const store = suppliedStore || findRecord(app, "stores", storeId);
  const settings = suppliedSettings || settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings)) return null;
  const entityId = `${raffle.id}_${raffleDrawKey(raffle)}`.slice(0, 80);
  if (hasNotificationAnyStatus(app, storeId, "system_warning", "raffles", entityId)) return null;
  const entries = countActiveRaffleEntries(app, storeId, raffle.id);
  const name = recordString(raffle, "title") || `Rifa ${recordNumber(raffle, "slot_number") || ""}`.trim() || "Rifa";
  return createNotification(app, {
    storeId,
    type: "system_warning",
    title: "Resultado de rifa pendiente",
    message: entries > 0
      ? `La fecha del sorteo de ${name} ya llegó. Revisa y publica el resultado.`
      : `La fecha del sorteo de ${name} ya llegó. Publica el número sorteado para cerrar la rifa.`,
    priority: "critical",
    targetUrl: `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/promos/raffles`,
    entityCollection: "raffles",
    entityId,
    metadata: {
      subtype: "raffle_result_due", raffle_id: raffle.id, raffle_title: recordString(raffle, "title"),
      draw_at: recordString(raffle, "draw_at"), active_entries: entries,
    },
  });
}

function processStoreDueRaffles(app, storeId, now, suppliedSettings, suppliedStore) {
  const store = suppliedStore || findRecord(app, "stores", storeId);
  const settings = suppliedSettings || settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings)) return 0;
  const raffles = findAllRecords(app, "raffles", "store = {:store} && is_configured = true", "draw_at", { store: storeId }, 1000);
  let created = 0;
  raffles.forEach((raffle) => { if (processDueRaffle(app, raffle, now, settings, store)) created += 1; });
  return created;
}

function reviewTarget(store) {
  return `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/store-settings#rating-pending`;
}

function pendingOrderReviews(app, storeId, orderId) {
  return findAllRecords(
    app,
    "reviews",
    "store = {:store} && order = {:order} && status = \"pending\"",
    "created",
    { store: storeId, order: orderId },
    200,
  ).filter((review) => (
    relationId(review, "store") === storeId
    && relationId(review, "order") === orderId
    && recordString(review, "status") === "pending"
  ));
}

function processPendingReview(app, review, now) {
  if (!review || recordString(review, "status") !== "pending") return null;
  const storeId = relationId(review, "store");
  const store = findRecord(app, "stores", storeId);
  const settings = settingsForStore(app, storeId);
  if (!storeIsActive(store) || !notificationsEnabled(settings) || recordValue(settings, "notify_review_pending") === false) return null;
  const customer = recordString(review, "customer_name") || "Cliente";
  const orderId = relationId(review, "order");
  const orderSource = recordString(review, "source") === "order_review_link" && Boolean(orderId);
  const entityCollection = orderSource ? "orders" : "reviews";
  const entityId = orderSource ? orderId : review.id;
  let message;
  let metadata;
  if (orderSource) {
    const order = findRecord(app, "orders", orderId);
    const reviews = pendingOrderReviews(app, storeId, orderId);
    const count = Math.max(1, reviews.length);
    message = `${customer} dejó ${count} reseña${count === 1 ? "" : "s"} de la orden #${recordString(order, "order_number") || orderId}.`;
    metadata = {
      order_id: orderId, order_number: recordString(order, "order_number"), customer_name: customer,
      review_count: count, review_ids: reviews.map((item) => item.id).filter(Boolean), source: "order_review_link",
    };
  } else {
    const productId = relationId(review, "product");
    const product = findRecord(app, "products", productId);
    const isProduct = recordString(review, "type") === "product" || Boolean(productId);
    const rating = Math.max(0, Math.min(5, recordNumber(review, "rating")));
    message = `${customer} dejó una reseña de ${isProduct ? "producto" : "tienda"} con ${rating} estrellas.`;
    metadata = {
      review_id: review.id, customer_name: customer, rating,
      source: recordString(review, "source") || (isProduct ? "public_product" : "public_store"),
      ...(isProduct ? { product_id: productId, product_name: recordString(product, "name") } : {}),
    };
  }
  const current = latestNotification(app, storeId, "review_pending", entityCollection, entityId);
  if (current && recordString(current, "status") === "unread") {
    if (orderSource) {
      current.set("message", bounded(message, 600));
      current.set("metadata_json", metadata);
      app.save(current);
    }
    return null;
  }
  return createNotification(app, {
    storeId,
    type: "review_pending",
    title: "Nueva reseña pendiente",
    message,
    priority: "important",
    targetUrl: reviewTarget(store),
    entityCollection,
    entityId,
    metadata: { ...metadata, source_created: recordString(review, "created") || asDate(now).toISOString() },
  });
}

function fieldChanged(record, field) {
  const original = originalRecord(record);
  if (!original) return true;
  return JSON.stringify(recordValue(original, field)) !== JSON.stringify(recordValue(record, field));
}

function anyFieldChanged(record, fields) {
  return fields.some((field) => fieldChanged(record, field));
}

function continueInventoryChanged(e, collectionName, action) {
  try {
    const record = e && e.record;
    const relevant = collectionName === "products"
      ? ["stock", "track_stock", "has_variations", "active", "allow_preorder"]
      : ["stock", "active", "allow_preorder", "product"];
    if (record && (action === "create" || anyFieldChanged(record, relevant))) {
      if (collectionName === "products") {
        processProductInventory(e.app, record, new Date());
        if (recordBoolean(record, "has_variations")) {
          const variations = findAllRecords(e.app, "product_variations", "product = {:product}", "id", { product: record.id }, 10000);
          variations.forEach((variation) => processVariationInventory(e.app, variation, new Date(), null, null, record));
        }
      } else {
        processVariationInventory(e.app, record, new Date());
      }
    }
  } catch (_) {
    try { e.app.logger().error("PowerZona background inventory notification failed safely.", "code", "PZ_BACKGROUND_INVENTORY_FAILED"); } catch (_) {}
  }
  return e.next();
}

function continueSettingsChanged(e, action) {
  try {
    const settings = e && e.record;
    const storeId = relationId(settings, "store");
    const notificationsChanged = action === "create" || fieldChanged(settings, "notifications_enabled");
    if (storeId && (action === "create" || anyFieldChanged(settings, INVENTORY_SETTING_FIELDS))) {
      processStoreInventory(e.app, storeId, new Date());
    }
    if (storeId && (action === "create" || anyFieldChanged(settings, PENDING_SETTING_FIELDS))) {
      processStorePendingOrders(e.app, storeId, new Date(), settings);
    }
    if (storeId && notificationsChanged) processStoreDueRaffles(e.app, storeId, new Date(), settings);
  } catch (_) {
    try { e.app.logger().error("PowerZona background settings notification scan failed safely.", "code", "PZ_BACKGROUND_SETTINGS_FAILED"); } catch (_) {}
  }
  return e.next();
}

function continueReviewCreated(e) {
  try { processPendingReview(e.app, e.record, new Date()); } catch (_) {
    try { e.app.logger().error("PowerZona background review notification failed safely.", "code", "PZ_BACKGROUND_REVIEW_FAILED"); } catch (_) {}
  }
  return e.next();
}

function continueRaffleChanged(e) {
  try { processDueRaffle(e.app, e.record, new Date()); } catch (_) {
    try { e.app.logger().error("PowerZona background raffle notification failed safely.", "code", "PZ_BACKGROUND_RAFFLE_FAILED"); } catch (_) {}
  }
  return e.next();
}

function processAllTimedNotifications(app, now) {
  const settingsRows = findAllRecords(app, "settings", "", "id", {}, 10000);
  let pendingOrders = 0;
  settingsRows.forEach((settings) => {
    const storeId = relationId(settings, "store");
    if (storeId) pendingOrders += processStorePendingOrders(app, storeId, now, settings);
  });
  const raffles = findAllRecords(app, "raffles", "is_configured = true", "draw_at", {}, 10000);
  let rafflesDue = 0;
  raffles.forEach((raffle) => { if (processDueRaffle(app, raffle, now)) rafflesDue += 1; });
  const stores = findAllRecords(app, "stores", "", "id", {}, 10000);
  let planLifecycle = 0;
  stores.forEach((store) => { if (processStorePlanLifecycle(app, store, now)) planLifecycle += 1; });
  return { pending_orders: pendingOrders, raffles_due: rafflesDue, plan_lifecycle: planLifecycle };
}

module.exports = {
  COMPLETED_RAFFLE_STATUSES,
  INVENTORY_SETTING_FIELDS,
  PENDING_SETTING_FIELDS,
  STORE_PLAN_NOTIFICATION_TYPES,
  archiveStorePlanNotifications,
  continueInventoryChanged,
  continueRaffleChanged,
  continueReviewCreated,
  continueSettingsChanged,
  hasNotificationAnyStatus,
  inventoryConfig,
  orderPriority,
  orderProductsSubtotal,
  processAllTimedNotifications,
  processDueRaffle,
  processPendingReview,
  processProductInventory,
  processStoreDueRaffles,
  processStoreInventory,
  processStorePendingOrders,
  processStorePlanLifecycle,
  processVariationInventory,
  productInventoryAlert,
  raffleDrawKey,
  raffleResultPublished,
  storePlanCycleId,
  storePlanNotificationCopy,
  storePlanNotificationType,
  sourceNotificationCovered,
  variationInventoryAlert,
};
