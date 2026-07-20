/// <reference path="../pb_data/types.d.ts" />

// PocketBase API rules remain the tenant boundary. Granular authorization is
// enforced by pz_store_permission_enforcement.pb.js before these writes reach
// persistence. Expanding the existing store_admin branch lets an authorized
// store_staff operation reach that hook. The one formerly broad anonymous
// branch is narrowed to the public events that the hook can verify from their
// referenced records; Master and cross-store conditions remain unchanged.
const STORE_ADMIN_CLAUSE = '@request.auth.role = "store_admin"';
const STORE_USER_CLAUSE = '(@request.auth.role = "store_admin" || @request.auth.role = "store_staff")';
const MASTER_ADMIN_CLAUSE = '@request.auth.role = "master_admin"';
const NOTIFICATIONS_PREVIOUS_CREATE_RULE = '(@request.auth.id = "" && @request.body.store != "") || (@request.auth.role = "master_admin") || ((@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && @request.body.store = @request.auth.store)';
const NOTIFICATIONS_VERIFIED_PUBLIC_CREATE_CLAUSE = '(@request.auth.id = "" && @request.body.store != "" && @request.body.entity_id != "" && ((@request.body.type = "review_pending" && (@request.body.entity_collection = "reviews" || @request.body.entity_collection = "orders")) || (@request.body.type = "raffle_entry_created" && @request.body.entity_collection = "raffle_entries")))';
const NOTIFICATIONS_HARDENED_CREATE_RULE = `(${NOTIFICATIONS_VERIFIED_PUBLIC_CREATE_CLAUSE}) || (${MASTER_ADMIN_CLAUSE}) || (${STORE_USER_CLAUSE} && @request.body.store = @request.auth.store)`;

const GRANULAR_WRITE_COLLECTIONS = Object.freeze([
  "products",
  "product_variations",
  "categories",
  "subcategories",
  "settings",
  "store_visual_items",
  "currencies",
  "orders",
  "shipping_methods",
  "shipping_zones",
  "automatic_promotions",
  "manual_coupons",
  "manual_coupon_usages",
  "gifts",
  "raffles",
  "raffle_entries",
  "reviews",
  "store_notifications",
  "store_analytics_events",
  "store_security_settings",
  "store_security_events",
  "store_security_blocks",
  "store_visitor_sessions",
  "store_customers",
]);

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function replaceClause(rule, from, to) {
  if (rule === null || rule === undefined) return rule;
  const text = String(rule);
  if (!text.includes(from)) return rule;
  return text.split(from).join(to);
}

function recordString(record, key) {
  if (!record) return "";
  try { return String(record.getString(key) || "").trim(); } catch (_) {}
  try { return String(record.get(key) || "").trim(); } catch (_) {}
  return String(record[key] || "").trim();
}

function safeHistoricalNotificationTarget(app, notification) {
  const storeId = recordString(notification, "store");
  let store = null;
  try { store = app.findRecordById("stores", storeId); } catch (_) {}
  const slug = recordString(store, "slug");
  if (!slug) return "";

  const fallback = `/t/${encodeURIComponent(slug)}/admin/notifications`;
  const target = recordString(notification, "target_url");
  if (!target || !target.startsWith("/") || target.startsWith("//")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;

  const pathname = target.split(/[?#]/, 1)[0];
  const adminBase = `/t/${encodeURIComponent(slug)}/admin`;
  const pathSegments = pathname.split("/");
  if (pathSegments.some((segment) => segment === "." || segment === "..")) return fallback;
  if (pathname.includes("%")) return fallback;
  if (pathname !== adminBase && !pathname.startsWith(`${adminBase}/`)) return fallback;
  return target;
}

function hardenStoreNotifications(app) {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;
  // The request hook resolves the referenced entity, verifies tenant/status,
  // and replaces every client-controlled presentation field. The API rule
  // only lets those narrowly enumerated public events reach that hook.
  collection.createRule = NOTIFICATIONS_HARDENED_CREATE_RULE;
  app.save(collection);

  const pageSize = 200;
  let offset = 0;
  while (true) {
    const records = app.findRecordsByFilter("store_notifications", "", "id", pageSize, offset) || [];
    records.forEach((record) => {
      const current = recordString(record, "target_url");
      const safe = safeHistoricalNotificationTarget(app, record);
      if (current === safe) return;
      record.set("target_url", safe);
      app.save(record);
    });
    if (records.length < pageSize) break;
    offset += records.length;
  }
}

function restoreStoreNotificationsCreateRule(app) {
  const collection = findCollectionSafe(app, "store_notifications");
  if (!collection) return;
  collection.createRule = NOTIFICATIONS_PREVIOUS_CREATE_RULE;
  app.save(collection);
}

function transformWriteRules(app, from, to) {
  GRANULAR_WRITE_COLLECTIONS.forEach((name) => {
    const collection = findCollectionSafe(app, name);
    if (!collection) return;
    collection.listRule = replaceClause(collection.listRule, from, to);
    collection.viewRule = replaceClause(collection.viewRule, from, to);
    collection.createRule = replaceClause(collection.createRule, from, to);
    collection.updateRule = replaceClause(collection.updateRule, from, to);
    collection.deleteRule = replaceClause(collection.deleteRule, from, to);
    app.save(collection);
  });
}

migrate((app) => {
  transformWriteRules(app, STORE_ADMIN_CLAUSE, STORE_USER_CLAUSE);
  hardenStoreNotifications(app);
}, (app) => {
  transformWriteRules(app, STORE_USER_CLAUSE, STORE_ADMIN_CLAUSE);
  restoreStoreNotificationsCreateRule(app);
});
