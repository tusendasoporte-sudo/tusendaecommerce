/// <reference path="../pb_data/types.d.ts" />

"use strict";

const STORE_STORAGE_CRITICAL_BYTES = 35 * 1024 * 1024 * 1024;
const STORE_STORAGE_HARD_LIMIT_BYTES = 40 * 1024 * 1024 * 1024;
const STORE_STORAGE_CACHE_MS = 60 * 1000;
const STORE_STORAGE_CACHE_KEY = "pz_store_storage_usage_v1";
const MASTER_NOTIFICATIONS_COLLECTION = "master_notifications";
const MASTER_NOTIFICATION_GROUP = "store-storage-critical-35-gib";
const MASTER_NOTIFICATION_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

class StoreStorageBudgetError extends Error {
  constructor(code) {
    super(code === "store_storage_full" ? code : "store_storage_unavailable");
    this.name = "StoreStorageBudgetError";
    this.code = this.message;
  }
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function appStore(app) {
  try {
    return app && typeof app.store === "function" ? app.store() : null;
  } catch (_) {
    return null;
  }
}

function readCachedUsage(app, now) {
  const store = appStore(app);
  if (!store || typeof store.get !== "function") return null;
  try {
    const parsed = JSON.parse(String(store.get(STORE_STORAGE_CACHE_KEY) || ""));
    const measuredAt = Number(parsed.measured_at_ms);
    const bytes = Number(parsed.bytes);
    const objects = Number(parsed.objects);
    if (!Number.isFinite(measuredAt) || measuredAt <= 0
      || !Number.isSafeInteger(bytes) || bytes < 0
      || !Number.isSafeInteger(objects) || objects < 0
      || now.getTime() - measuredAt > STORE_STORAGE_CACHE_MS) return null;
    return { bytes, objects, measuredAt };
  } catch (_) {
    return null;
  }
}

function writeCachedUsage(app, usage, now) {
  const store = appStore(app);
  if (!store || typeof store.set !== "function") return;
  try {
    store.set(STORE_STORAGE_CACHE_KEY, JSON.stringify({
      bytes: nonNegativeInteger(usage.bytes),
      objects: nonNegativeInteger(usage.objects),
      measured_at_ms: now.getTime(),
    }));
  } catch (_) {}
}

function invalidateStoreStorageUsage(app) {
  const store = appStore(app);
  if (!store || typeof store.remove !== "function") return;
  try { store.remove(STORE_STORAGE_CACHE_KEY); } catch (_) {}
}

function scanStoreStorageUsage(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (Number.isNaN(now.getTime()) || !app || typeof app.newFilesystem !== "function") {
    throw new StoreStorageBudgetError("store_storage_unavailable");
  }
  let filesystem = null;
  try {
    filesystem = app.newFilesystem();
    const objects = filesystem.list("") || [];
    const usage = { bytes: 0, objects: 0 };
    for (const item of objects) {
      if (item && item.isDir) continue;
      const size = Number(item && item.size);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new StoreStorageBudgetError("store_storage_unavailable");
      }
      usage.bytes += size;
      usage.objects += 1;
      if (!Number.isSafeInteger(usage.bytes)) {
        throw new StoreStorageBudgetError("store_storage_unavailable");
      }
    }
    writeCachedUsage(app, usage, now);
    return { ...usage, measuredAt: now.getTime() };
  } catch (error) {
    if (error instanceof StoreStorageBudgetError) throw error;
    throw new StoreStorageBudgetError("store_storage_unavailable");
  } finally {
    try { if (filesystem) filesystem.close(); } catch (_) {}
  }
}

function storeStorageUsage(app, options) {
  const now = options && options.now instanceof Date ? options.now : new Date();
  if (Number.isNaN(now.getTime())) throw new StoreStorageBudgetError("store_storage_unavailable");
  if (!(options && options.force)) {
    const cached = readCachedUsage(app, now);
    if (cached) return cached;
  }
  return scanStoreStorageUsage(app, now);
}

function storageBudgetView(usage, incomingBytes) {
  const incoming = nonNegativeInteger(incomingBytes);
  const projectedBytes = usage.bytes + incoming;
  if (!Number.isSafeInteger(projectedBytes)) {
    throw new StoreStorageBudgetError("store_storage_unavailable");
  }
  return Object.freeze({
    bytes: usage.bytes,
    objects: usage.objects,
    projected_bytes: projectedBytes,
    critical: projectedBytes >= STORE_STORAGE_CRITICAL_BYTES,
    critical_bytes: STORE_STORAGE_CRITICAL_BYTES,
    hard_limit_bytes: STORE_STORAGE_HARD_LIMIT_BYTES,
    remaining_bytes: Math.max(0, STORE_STORAGE_HARD_LIMIT_BYTES - projectedBytes),
  });
}

function activeMasterRecipients(app) {
  try {
    return app.findRecordsByFilter(
      "users",
      'role = "master_admin" && status = "active"',
      "id",
      500,
      0,
    ) || [];
  } catch (_) {
    return [];
  }
}

function criticalNotificationMessage(bytes) {
  const gib = Math.round((bytes / (1024 * 1024 * 1024)) * 100) / 100;
  return `El almacenamiento físico de tiendas usa ${gib} GiB. El límite de cargas es 40 GiB.`;
}

function notifyCriticalStoreStorage(app, budget, nowValue) {
  if (!budget || !budget.critical) return 0;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (Number.isNaN(now.getTime())) return 0;
  let collection = null;
  try { collection = app.findCollectionByNameOrId(MASTER_NOTIFICATIONS_COLLECTION); } catch (_) { return 0; }
  let notified = 0;
  activeMasterRecipients(app).forEach((recipient) => {
    try {
      const existing = app.findRecordsByFilter(
        MASTER_NOTIFICATIONS_COLLECTION,
        'recipient = {:recipientId} && group_key = {:groupKey} && status = "unread"',
        "-last_event_at",
        1,
        0,
        { recipientId: recipient.id, groupKey: MASTER_NOTIFICATION_GROUP },
      ) || [];
      if (existing.length) {
        const notification = existing[0];
        const count = Math.max(1, Number(notification.get("event_count")) || 1) + 1;
        notification.set("event_count", count);
        notification.set("message", criticalNotificationMessage(budget.projected_bytes));
        notification.set("last_event_at", now.toISOString());
        app.save(notification);
        notified += 1;
        return;
      }
      const notification = new Record(collection, {});
      notification.set("recipient", recipient.id);
      notification.set("type", "store_storage_critical");
      notification.set("category", "system");
      notification.set("store", "");
      notification.set("product", "");
      notification.set("product_id_snapshot", "");
      notification.set("product_name_snapshot", "");
      notification.set("title", "Almacenamiento de tiendas en nivel crítico");
      notification.set("message", criticalNotificationMessage(budget.projected_bytes));
      notification.set("action_url", "/master");
      notification.set("tone", "critical");
      notification.set("status", "unread");
      notification.set("group_key", MASTER_NOTIFICATION_GROUP);
      notification.set("event_count", 1);
      notification.set("first_event_at", now.toISOString());
      notification.set("last_event_at", now.toISOString());
      notification.set("read_at", "");
      notification.set("archived_at", "");
      notification.set("expires_at", new Date(now.getTime() + MASTER_NOTIFICATION_RETENTION_MS).toISOString());
      app.save(notification);
      notified += 1;
    } catch (_) {
      try {
        app.logger().error(
          "Store storage critical notification failed safely.",
          "code",
          "PZ_STORE_STORAGE_NOTIFICATION_FAILED",
        );
      } catch (_) {}
    }
  });
  return notified;
}

function assertStoreStorageBudget(app, incomingBytes, options) {
  const incoming = Number(incomingBytes);
  if (!Number.isSafeInteger(incoming) || incoming < 0) {
    throw new StoreStorageBudgetError("store_storage_unavailable");
  }
  const now = options && options.now instanceof Date ? options.now : new Date();
  const usage = storeStorageUsage(app, { now, force: !!(options && options.force) });
  const budget = storageBudgetView(usage, incoming);
  notifyCriticalStoreStorage(app, budget, now);
  if (budget.projected_bytes > STORE_STORAGE_HARD_LIMIT_BYTES) {
    throw new StoreStorageBudgetError("store_storage_full");
  }
  return budget;
}

function recordStoreStorageIncrease(app, bytes, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const cached = readCachedUsage(app, now);
  const incoming = nonNegativeInteger(bytes);
  if (!cached || !incoming) return;
  writeCachedUsage(app, {
    bytes: cached.bytes + incoming,
    objects: cached.objects + 1,
  }, now);
}

function monitorStoreStorageBudget(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  try {
    const usage = storeStorageUsage(app, { now, force: true });
    const budget = storageBudgetView(usage, 0);
    const notified = notifyCriticalStoreStorage(app, budget, now);
    return { ...budget, notified };
  } catch (error) {
    try {
      app.logger().error(
        "Store storage budget monitor failed safely.",
        "code",
        "PZ_STORE_STORAGE_MONITOR_FAILED",
      );
    } catch (_) {}
    throw error;
  }
}

module.exports = {
  STORE_STORAGE_CACHE_MS,
  STORE_STORAGE_CRITICAL_BYTES,
  STORE_STORAGE_HARD_LIMIT_BYTES,
  StoreStorageBudgetError,
  assertStoreStorageBudget,
  invalidateStoreStorageUsage,
  monitorStoreStorageBudget,
  notifyCriticalStoreStorage,
  recordStoreStorageIncrease,
  scanStoreStorageUsage,
  storageBudgetView,
  storeStorageUsage,
};
