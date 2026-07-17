/// <reference path="../pb_data/types.d.ts" />

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const NOTIFICATIONS_COLLECTION = "master_notifications";
const PAGE_SIZE = 10;
const GROUP_WINDOW_MS = 10 * 60 * 1000;
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000;
const RETENTION_BATCH_SIZE = 200;
const RETENTION_MAX_BATCHES = 100;
const STATUSES = ["all", "unread", "read", "archived"];
const CATEGORIES = ["all", "products", "security", "stores", "system"];
const LOG_MESSAGES = {
  PZ_MASTER_NOTIFICATION_CREATE_FAILED: "PowerZona master notification create failed safely.",
  PZ_MASTER_NOTIFICATION_QUERY_FAILED: "PowerZona master notification query failed safely.",
  PZ_MASTER_NOTIFICATION_ACTION_FAILED: "PowerZona master notification action failed safely.",
  PZ_MASTER_NOTIFICATIONS_RETENTION_FAILED: "PowerZona master notification retention failed safely.",
};

function logNotification(code) {
  try {
    $app.logger().error(LOG_MESSAGES[code] || LOG_MESSAGES.PZ_MASTER_NOTIFICATION_QUERY_FAILED, "code", code);
  } catch (_) {}
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
    const value = Number(record.get(key));
    return Number.isFinite(value) ? value : 0;
  }
}

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function safeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function isValidRecordId(value) {
  return RECORD_ID_PATTERN.test(String(value || "").trim());
}

function isMasterRequest(info) {
  return recordString(info && info.auth, "role") === "master_admin";
}

function isSafeActionUrl(value) {
  const url = boundedString(value, 500);
  if (!url || url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return url === "/master" || url.startsWith("/master/");
}

function safeActionUrl(value) {
  return isSafeActionUrl(value) ? boundedString(value, 500) : "/master/notifications";
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

function parseFeedPayload(body) {
  if (!exactPayload(body, ["limit"])) return null;
  const limit = bodyValue(body, "limit");
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10) return null;
  return { limit };
}

function parsePagePayload(body) {
  if (!exactPayload(body, ["page", "status", "category"])) return null;
  const page = bodyValue(body, "page");
  const status = bodyValue(body, "status");
  const category = bodyValue(body, "category");
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  if (typeof status !== "string" || !STATUSES.includes(status)) return null;
  if (typeof category !== "string" || !CATEGORIES.includes(category)) return null;
  return { page, status, category };
}

function parseActionPayload(body) {
  const action = bodyValue(body, "action");
  if (action === "mark_all_read" || action === "delete_all") {
    return exactPayload(body, ["action"]) ? { action, notificationId: "" } : null;
  }
  if (!exactPayload(body, ["action", "notification_id"])) return null;
  const notificationId = bodyValue(body, "notification_id");
  if (!["mark_read", "archive", "delete"].includes(action) || typeof notificationId !== "string" || !isValidRecordId(notificationId)) return null;
  return { action, notificationId: notificationId.trim() };
}

const NOTIFICATION_SELECT = `
  SELECT
    n.id AS notificationId,
    n.type AS type,
    n.category AS category,
    COALESCE(s.name, '') AS storeName,
    n.title AS title,
    n.message AS message,
    n.action_url AS actionUrl,
    n.tone AS tone,
    n.status AS status,
    n.event_count AS eventCount,
    n.created AS created,
    n.last_event_at AS lastEventAt
  FROM master_notifications n
  LEFT JOIN stores s ON s.id = n.store
`;

const NOTIFICATION_MODEL = {
  notificationId: "", type: "", category: "", storeName: "", title: "", message: "",
  actionUrl: "", tone: "normal", status: "", eventCount: 0, created: "", lastEventAt: "",
};

function mapNotificationRow(row) {
  const status = boundedString(row.status, 20);
  const category = boundedString(row.category, 40);
  return {
    id: isValidRecordId(row.notificationId) ? String(row.notificationId) : "",
    type: boundedString(row.type, 60),
    category: CATEGORIES.includes(category) && category !== "all" ? category : "system",
    store_name: boundedString(row.storeName, 160),
    title: boundedString(row.title, 180),
    message: boundedString(row.message, 500),
    action_url: safeActionUrl(row.actionUrl),
    tone: row.tone === "critical" ? "critical" : "normal",
    status: STATUSES.includes(status) && status !== "all" ? status : "unread",
    event_count: Math.max(1, nonNegativeInteger(row.eventCount)),
    created: safeIsoDate(row.created),
    last_event_at: safeIsoDate(row.lastEventAt),
  };
}

function handleNotificationsFeed(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseFeedPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const recipientId = recordString(info.auth, "id");
    const count = queryOne($app, `
      SELECT COUNT(*) AS unreadCount
      FROM master_notifications
      WHERE recipient = {:recipientId} AND status = 'unread'
    `, { recipientId }, { unreadCount: 0 }) || {};
    const rows = queryRows($app, `${NOTIFICATION_SELECT}
      WHERE n.recipient = {:recipientId} AND n.status != 'archived'
      ORDER BY datetime(n.last_event_at) DESC, datetime(n.created) DESC, n.id DESC
      LIMIT {:limit}
    `, { recipientId, limit: parsed.limit }, NOTIFICATION_MODEL);
    return e.json(200, {
      ok: true,
      unread_count: nonNegativeInteger(count.unreadCount),
      items: rows.map(mapNotificationRow).filter((item) => item.id),
    });
  } catch (_) {
    logNotification("PZ_MASTER_NOTIFICATION_QUERY_FAILED");
    return e.json(500, { ok: false, error: "notifications_failed" });
  }
}

function pageWhere(parsed) {
  const clauses = ["n.recipient = {:recipientId}"];
  if (parsed.status !== "all") clauses.push("n.status = {:status}");
  if (parsed.category !== "all") clauses.push("n.category = {:category}");
  return clauses.join(" AND ");
}

function handleNotificationsPage(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parsePagePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const bindings = {
      recipientId: recordString(info.auth, "id"), status: parsed.status, category: parsed.category,
    };
    const where = pageWhere(parsed);
    const count = queryOne($app, `SELECT COUNT(*) AS totalItems FROM master_notifications n WHERE ${where}`, bindings, { totalItems: 0 }) || {};
    const totalItems = nonNegativeInteger(count.totalItems);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    const rows = queryRows($app, `${NOTIFICATION_SELECT}
      WHERE ${where}
      ORDER BY datetime(n.last_event_at) DESC, datetime(n.created) DESC, n.id DESC
      LIMIT {:limit} OFFSET {:offset}
    `, Object.assign({}, bindings, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }), NOTIFICATION_MODEL);
    return e.json(200, {
      ok: true,
      page: {
        page,
        per_page: PAGE_SIZE,
        total_items: totalItems,
        total_pages: totalPages,
        items: rows.map(mapNotificationRow).filter((item) => item.id),
      },
    });
  } catch (_) {
    logNotification("PZ_MASTER_NOTIFICATION_QUERY_FAILED");
    return e.json(500, { ok: false, error: "notifications_failed" });
  }
}

function markAllRead(app, recipientId) {
  let updated = 0;
  for (let batchIndex = 0; batchIndex < RETENTION_MAX_BATCHES; batchIndex += 1) {
    const records = app.findRecordsByFilter(
      NOTIFICATIONS_COLLECTION,
      'recipient = {:recipientId} && status = "unread"',
      "created",
      RETENTION_BATCH_SIZE,
      0,
      { recipientId }
    ) || [];
    if (!records.length) break;
    const now = new Date().toISOString();
    records.forEach((record) => {
      record.set("status", "read");
      record.set("read_at", now);
      app.save(record);
      updated += 1;
    });
    if (records.length < RETENTION_BATCH_SIZE) break;
  }
  return updated;
}

function deleteAllNotifications(app, recipientId) {
  let updated = 0;
  for (let batchIndex = 0; batchIndex < RETENTION_MAX_BATCHES; batchIndex += 1) {
    const records = app.findRecordsByFilter(
      NOTIFICATIONS_COLLECTION,
      "recipient = {:recipientId}",
      "id",
      RETENTION_BATCH_SIZE,
      0,
      { recipientId }
    ) || [];
    if (!records.length) break;
    records.forEach((record) => {
      app.delete(record);
      updated += 1;
    });
    if (records.length < RETENTION_BATCH_SIZE) break;
  }
  return updated;
}

function handleNotificationAction(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseActionPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const recipientId = recordString(info.auth, "id");
    let result = { updated: 0, status: "" };
    $app.runInTransaction((txApp) => {
      if (parsed.action === "mark_all_read") {
        result = { updated: markAllRead(txApp, recipientId), status: "read" };
        return;
      }
      if (parsed.action === "delete_all") {
        result = { updated: deleteAllNotifications(txApp, recipientId), status: "deleted" };
        return;
      }
      const notification = findRecordByIdSafe(txApp, NOTIFICATIONS_COLLECTION, parsed.notificationId);
      if (!notification || recordString(notification, "recipient") !== recipientId) {
        result = { updated: -1, status: "" };
        return;
      }
      if (parsed.action === "delete") {
        txApp.delete(notification);
        result = { updated: 1, status: "deleted" };
        return;
      }
      const now = new Date().toISOString();
      if (parsed.action === "mark_read" && recordString(notification, "status") === "unread") {
        notification.set("status", "read");
        notification.set("read_at", now);
        txApp.save(notification);
        result = { updated: 1, status: "read" };
        return;
      }
      if (parsed.action === "archive" && recordString(notification, "status") !== "archived") {
        notification.set("status", "archived");
        notification.set("archived_at", now);
        txApp.save(notification);
        result = { updated: 1, status: "archived" };
        return;
      }
      result = { updated: 0, status: recordString(notification, "status") };
    });
    if (result.updated < 0) return e.json(404, { ok: false, error: "notification_not_found" });
    return e.json(200, { ok: true, updated: result.updated, status: result.status });
  } catch (_) {
    logNotification("PZ_MASTER_NOTIFICATION_ACTION_FAILED");
    return e.json(500, { ok: false, error: "notification_action_failed" });
  }
}

function activeMasterRecipients(app) {
  try {
    return app.findRecordsByFilter(
      "users",
      'role = "master_admin" && status = "active"',
      "id",
      500,
      0
    ) || [];
  } catch (_) {
    return [];
  }
}

function groupedMessage(eventCount, productName) {
  return `${eventCount} cambios de precio en ${boundedString(productName, 180) || "el producto"}`.slice(0, 500);
}

function createRecipientNotification(app, recipient, data, now) {
  const priceEvent = data.type === "product_price_changed" || data.type === "product_price_target_reached";
  const cutoff = new Date(new Date(now).getTime() - GROUP_WINDOW_MS).toISOString();
  const grouped = priceEvent ? null : queryOne(app, `
      SELECT id AS notificationId
      FROM master_notifications
      WHERE recipient = {:recipientId}
        AND group_key = {:groupKey}
        AND status = 'unread'
        AND datetime(last_event_at) >= datetime({:cutoff})
      ORDER BY datetime(last_event_at) DESC, id DESC
      LIMIT 1
    `, { recipientId: recipient.id, groupKey: data.groupKey, cutoff }, { notificationId: "" });
  const existing = grouped && isValidRecordId(grouped.notificationId)
    ? findRecordByIdSafe(app, NOTIFICATIONS_COLLECTION, String(grouped.notificationId))
    : null;
  if (existing) {
    const count = Math.max(1, Math.floor(recordNumber(existing, "event_count"))) + 1;
    existing.set("event_count", count);
    existing.set("last_event_at", now);
    if (data.type === "product_price_changed") existing.set("message", groupedMessage(count, data.productName));
    app.save(existing);
    return;
  }
  const collection = app.findCollectionByNameOrId(NOTIFICATIONS_COLLECTION);
  const notification = new Record(collection, {});
  notification.set("recipient", recipient.id);
  notification.set("type", data.type);
  notification.set("category", "products");
  notification.set("store", data.storeId);
  notification.set("product", data.productId || "");
  notification.set("product_id_snapshot", data.productIdSnapshot);
  notification.set("product_name_snapshot", data.productName);
  notification.set("title", data.title);
  notification.set("message", data.message);
  notification.set("action_url", safeActionUrl(data.actionUrl));
  notification.set("tone", data.tone === "critical" ? "critical" : "normal");
  notification.set("status", "unread");
  notification.set("group_key", data.groupKey);
  notification.set("event_count", 1);
  notification.set("first_event_at", now);
  notification.set("last_event_at", now);
  notification.set("read_at", "");
  notification.set("archived_at", "");
  notification.set("expires_at", new Date(new Date(now).getTime() + RETENTION_MS).toISOString());
  app.save(notification);
}

function createProductNotification(app, input) {
  try {
    const storeId = boundedString(input && input.storeId, 15);
    const productIdSnapshot = boundedString(input && input.productIdSnapshot, 15);
    const watchId = boundedString(input && input.watchId, 15);
    const eventKey = boundedString(input && input.eventKey, 180);
    if (!isValidRecordId(storeId) || !isValidRecordId(productIdSnapshot) || !isValidRecordId(watchId) || !eventKey) return;
    const deleted = input && input.type === "product_deleted";
    const critical = !deleted && input && input.tone === "critical";
    const productName = boundedString(input && input.productName, 180) || "Producto";
    const data = {
      type: deleted ? "product_deleted" : critical ? "product_price_target_reached" : "product_price_changed",
      tone: critical ? "critical" : "normal",
      storeId,
      productId: deleted ? "" : productIdSnapshot,
      productIdSnapshot,
      productName,
      title: boundedString(input && input.title, 180)
        || (deleted ? `Producto eliminado: ${productName}` : `Precio cambiado: ${productName}`).slice(0, 180),
      message: boundedString(input && input.message, 500)
        || (deleted ? `El producto seguido ${productName} fue eliminado.` : "Se registró un cambio real de precio.").slice(0, 500),
      actionUrl: `/master/price-watch/${encodeURIComponent(watchId)}`,
      groupKey: `${deleted ? "product_deleted" : "price_event"}:${watchId}:${eventKey.slice(-64)}`.slice(0, 180),
    };
    const now = new Date().toISOString();
    activeMasterRecipients(app).forEach((recipient) => {
      try {
        createRecipientNotification(app, recipient, data, now);
      } catch (_) {
        logNotification("PZ_MASTER_NOTIFICATION_CREATE_FAILED");
      }
    });
  } catch (_) {
    logNotification("PZ_MASTER_NOTIFICATION_CREATE_FAILED");
  }
}

function handleRetentionCleanup() {
  try {
    const now = new Date().toISOString();
    for (let batchIndex = 0; batchIndex < RETENTION_MAX_BATCHES; batchIndex += 1) {
      const records = $app.findRecordsByFilter(
        NOTIFICATIONS_COLLECTION,
        'expires_at != "" && expires_at <= {:now}',
        "expires_at,id",
        RETENTION_BATCH_SIZE,
        0,
        { now }
      ) || [];
      if (!records.length) break;
      records.forEach((record) => $app.delete(record));
      if (records.length < RETENTION_BATCH_SIZE) break;
    }
  } catch (_) {
    logNotification("PZ_MASTER_NOTIFICATIONS_RETENTION_FAILED");
  }
}

module.exports = {
  createProductNotification,
  handleNotificationAction,
  handleNotificationsFeed,
  handleNotificationsPage,
  handleRetentionCleanup,
  requireAuthenticatedUser,
};
