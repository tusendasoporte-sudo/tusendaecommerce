/// <reference path="../pb_data/types.d.ts" />

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PERIOD_DAYS = 30;
const PAGE_SIZE = 10;
const PRICE_STATUSES = ["active", "paused", "deleted", "all"];

function logOverview(code) {
  try {
    $app.logger().error("PowerZona master overview failed safely.", "code", code);
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

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function booleanValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeIsoDate(value) {
  const raw = boundedString(value, 80);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function safeSlug(value) {
  const slug = boundedString(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function safeActionUrl(value) {
  const url = boundedString(value, 500);
  if (!url || url.startsWith("//") || url.includes(":")) return "/master";
  if (url !== "/master" && !url.startsWith("/master/")) return "/master";
  return url;
}

function isRecordId(value) {
  return RECORD_ID_PATTERN.test(boundedString(value, 15));
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function exactPayload(body, keys) {
  if (!body || typeof body !== "object") return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isMaster(info) {
  return recordString(info && info.auth, "role") === "master_admin";
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

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function cutoffIso() {
  return new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function storeResponse(record) {
  return {
    id: recordString(record, "id"),
    name: boundedString(recordString(record, "name"), 160) || "Tienda",
    slug: safeSlug(recordString(record, "slug")),
    status: recordString(record, "status").toLowerCase() === "active" ? "active" : "suspended",
    featured: booleanValue(recordString(record, "featured")),
  };
}

function securityLabels(app, storeId) {
  const row = queryOne(app, `
    SELECT enabled AS enabled, mode AS mode
    FROM store_security_settings
    WHERE store = {:storeId}
    LIMIT 1
  `, { storeId }, { enabled: false, mode: "" }) || {};
  if (!booleanValue(row.enabled)) {
    return { badge: "Seguridad desactivada", status: "Seguridad desactivada" };
  }
  return {
    badge: boundedString(row.mode, 30) === "protection" ? "Protección activa" : "Solo monitoreo",
    status: "Sin alertas recientes",
  };
}

function parseGlobalPayload(body) {
  if (!exactPayload(body, ["period_days"])) return null;
  const periodDays = bodyValue(body, "period_days");
  return typeof periodDays === "number" && periodDays === PERIOD_DAYS ? { periodDays } : null;
}

function parseStorePayload(body) {
  if (!exactPayload(body, ["store_id"])) return null;
  const storeId = bodyValue(body, "store_id");
  return typeof storeId === "string" && isRecordId(storeId) ? { storeId } : null;
}

function parsePricePayload(body) {
  const keys = ["page", "status", "store_id", "search"];
  if (!exactPayload(body, keys)) return null;
  const page = bodyValue(body, "page");
  const status = bodyValue(body, "status");
  const storeId = bodyValue(body, "store_id");
  const search = bodyValue(body, "search");
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  if (typeof status !== "string" || !PRICE_STATUSES.includes(status)) return null;
  if (typeof storeId !== "string" || (storeId && !isRecordId(storeId))) return null;
  if (typeof search !== "string" || search.length > 100) return null;
  return { page, status, storeId, search: search.trim() };
}

function escapeLike(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function queryGlobalMetrics(app, recipientId) {
  const row = queryOne(app, `
    SELECT
      (SELECT COUNT(*) FROM master_product_watches WHERE status = 'active') AS activePriceWatches,
      (SELECT COUNT(*) FROM master_notifications WHERE recipient = {:recipientId} AND status = 'unread') AS unreadNotifications
  `, { recipientId }, { activePriceWatches: 0, unreadNotifications: 0 }) || {};
  return {
    active_price_watches: nonNegativeInteger(row.activePriceWatches),
    unread_notifications: nonNegativeInteger(row.unreadNotifications),
  };
}

function queryTopStores(app, cutoff) {
  return queryRows(app, `
    SELECT
      s.id AS storeId,
      s.name AS storeName,
      s.slug AS storeSlug,
      s.status AS storeStatus,
      COALESCE(o.orders30d, 0) AS orders30d,
      COALESCE(a.visitors30d, 0) AS visitors30d,
      COALESCE(a.pageviews30d, 0) AS pageviews30d,
      CASE WHEN COALESCE(o.lastActivity, '') >= COALESCE(a.lastActivity, '')
        THEN COALESCE(o.lastActivity, '') ELSE COALESCE(a.lastActivity, '') END AS lastActivityAt
    FROM stores s
    LEFT JOIN (
      SELECT store, COUNT(*) AS orders30d, MAX(created) AS lastActivity
      FROM orders WHERE datetime(created) >= datetime({:cutoff}) GROUP BY store
    ) o ON o.store = s.id
    LEFT JOIN (
      SELECT store, COUNT(*) AS pageviews30d,
        COUNT(DISTINCT CASE WHEN TRIM(visitor_id) != '' THEN visitor_id END) AS visitors30d,
        MAX(created) AS lastActivity
      FROM store_analytics_events
      WHERE event_type = 'pageview' AND datetime(created) >= datetime({:cutoff})
      GROUP BY store
    ) a ON a.store = s.id
    ORDER BY (COALESCE(o.orders30d, 0) + COALESCE(a.pageviews30d, 0)) DESC,
      datetime(lastActivityAt) DESC, s.name COLLATE NOCASE ASC
    LIMIT 5
  `, { cutoff }, {
    storeId: "", storeName: "", storeSlug: "", storeStatus: "",
    orders30d: 0, visitors30d: 0, pageviews30d: 0, lastActivityAt: "",
  }).filter((row) => isRecordId(row.storeId)).map((row) => ({
    id: String(row.storeId),
    name: boundedString(row.storeName, 160) || "Tienda",
    slug: safeSlug(row.storeSlug),
    status: boundedString(row.storeStatus, 30) === "active" ? "active" : "suspended",
    orders_30d: nonNegativeInteger(row.orders30d),
    visitors_30d: nonNegativeInteger(row.visitors30d),
    pageviews_30d: nonNegativeInteger(row.pageviews30d),
    last_activity_at: safeIsoDate(row.lastActivityAt),
    action_url: safeActionUrl(`/master/stores/${String(row.storeId)}`),
  }));
}

function queryActivity(app, storeId, limit) {
  const storeClause = storeId ? "AND store = {:storeId}" : "";
  const userClause = storeId ? "AND u.store = {:storeId}" : "";
  return queryRows(app, `
    SELECT activityType, label, detail, created, actionUrl FROM (
      SELECT 'order_created' AS activityType,
        'Nuevo pedido ' || COALESCE(NULLIF(order_number, ''), '#' || id) AS label,
        COALESCE(NULLIF(customer_name, ''), 'Cliente') AS detail,
        created AS created,
        '/master/analytics/' || store || '/orders/' || id AS actionUrl
      FROM orders WHERE 1 = 1 ${storeClause}
      UNION ALL
      SELECT 'price_changed',
        'Precio actualizado en ' || COALESCE(NULLIF(product_name_snapshot, ''), 'producto'),
        COALESCE(NULLIF(summary, ''), 'Cambio de precio registrado'),
        created,
        CASE WHEN product_id_snapshot != '' THEN '/master/products/' || store || '/' || product_id_snapshot || '#seguimiento-precio'
          ELSE '/master/price-watch?store_id=' || store END
      FROM master_product_price_events WHERE 1 = 1 ${storeClause}
      UNION ALL
      SELECT 'security_event', 'Actividad de Seguridad registrada',
        CASE WHEN action LIKE '%block%' THEN 'Bloqueo actualizado' ELSE 'Revisión de Seguridad' END,
        created, '/master/security/' || store
      FROM store_security_audit WHERE 1 = 1 ${storeClause}
      UNION ALL
      SELECT 'user_created', 'Usuario de tienda creado',
        CASE WHEN u.role = 'store_staff' THEN 'Rol: Empleado' ELSE 'Rol: Administrador' END,
        u.created, '/master/stores/' || u.store
      FROM users u WHERE (u.role = 'store_admin' OR u.role = 'store_staff') ${userClause}
    ) activity
    ORDER BY datetime(created) DESC
    LIMIT {:limit}
  `, { storeId: storeId || "", limit }, {
    activityType: "", label: "", detail: "", created: "", actionUrl: "",
  }).map((row) => ({
    type: boundedString(row.activityType, 40),
    label: boundedString(row.label, 180),
    detail: boundedString(row.detail, 260),
    created: safeIsoDate(row.created),
    action_label: row.activityType === "order_created" ? "Ver pedido"
      : row.activityType === "price_changed" ? "Ver producto"
        : row.activityType === "security_event" ? "Ver seguridad" : "Ver usuarios",
    action_url: safeActionUrl(row.actionUrl),
  }));
}

function productMetrics(app, storeId, storeActive) {
  const row = queryOne(app, `
    WITH variation_stats AS (
      SELECT product AS productId,
        COUNT(*) AS variationCount,
        SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS activeVariationCount,
        COALESCE(SUM(CASE WHEN active = 1 AND stock > 0 THEN stock ELSE 0 END), 0) AS activeVariationsStock,
        MAX(CASE WHEN active = 1 AND stock > 0 THEN 1 ELSE 0 END) AS activeVariationInStock
      FROM product_variations GROUP BY product
    ), states AS (
      SELECT p.id AS productId, p.active AS active, p.track_stock AS trackStock,
        p.stock AS storedStock, p.has_variations AS storedHasVariations,
        CASE WHEN COALESCE(p.has_variations, 0) = 1 OR COALESCE(v.variationCount, 0) > 0 THEN 1 ELSE 0 END AS hasVariations,
        COALESCE(v.activeVariationsStock, 0) AS activeVariationsStock,
        COALESCE(v.activeVariationInStock, 0) AS activeVariationInStock,
        CASE WHEN TRIM(COALESCE(p.category, '')) = '' THEN 1 ELSE COALESCE(c.active, 0) END AS categoryActive,
        CASE WHEN TRIM(COALESCE(p.subcategory, '')) = '' THEN 1 ELSE COALESCE(sc.active, 0) END AS subcategoryActive,
        COALESCE(w.status, 'none') AS watchStatus,
        COALESCE(NULLIF((SELECT low_stock_threshold FROM settings WHERE store = p.store LIMIT 1), 0), 3) AS lowStockThreshold
      FROM products p
      LEFT JOIN variation_stats v ON v.productId = p.id
      LEFT JOIN categories c ON c.id = p.category AND c.store = p.store
      LEFT JOIN subcategories sc ON sc.id = p.subcategory AND sc.store = p.store
      LEFT JOIN master_product_watches w ON w.store = p.store AND w.product_id_snapshot = p.id
      WHERE p.store = {:storeId}
    ), resolved AS (
      SELECT *,
        CASE WHEN active = 1 AND categoryActive = 1 AND subcategoryActive = 1 AND {:storeActive} = 1 THEN 1 ELSE 0 END AS publiclyVisible,
        CASE WHEN trackStock = 1 AND hasVariations = 1 AND activeVariationsStock <= 0 THEN 1
          WHEN trackStock = 1 AND hasVariations != 1 AND storedStock <= 0 THEN 1 ELSE 0 END AS noRealStock,
        CASE WHEN hasVariations = 1 THEN activeVariationsStock ELSE storedStock END AS effectiveStock
      FROM states
    )
    SELECT COUNT(*) AS total,
      COALESCE(SUM(publiclyVisible), 0) AS productsActive,
      COALESCE(SUM(CASE WHEN publiclyVisible != 1 THEN 1 ELSE 0 END), 0) AS productsHidden,
      COALESCE(SUM(noRealStock), 0) AS productsOutOfStock,
      COALESCE(SUM(CASE WHEN watchStatus = 'active' THEN 1 ELSE 0 END), 0) AS productsWatched,
      COALESCE(SUM(CASE WHEN trackStock = 1 AND effectiveStock > 0 AND effectiveStock <= lowStockThreshold THEN 1 ELSE 0 END), 0) AS lowStock
    FROM resolved
  `, { storeId, storeActive: storeActive ? 1 : 0 }, {
    total: 0, productsActive: 0, productsHidden: 0, productsOutOfStock: 0, productsWatched: 0, lowStock: 0,
  }) || {};
  return {
    products_active: nonNegativeInteger(row.productsActive),
    products_hidden: nonNegativeInteger(row.productsHidden),
    products_out_of_stock: nonNegativeInteger(row.productsOutOfStock),
    products_watched: nonNegativeInteger(row.productsWatched),
    low_stock: nonNegativeInteger(row.lowStock),
  };
}

function orderAndTrafficMetrics(app, storeId, cutoff) {
  const row = queryOne(app, `
    SELECT
      (SELECT COUNT(*) FROM orders WHERE store = {:storeId}) AS ordersTotal,
      (SELECT COUNT(*) FROM orders WHERE store = {:storeId} AND datetime(created) >= datetime({:cutoff})) AS ordersRecent,
      (SELECT COUNT(DISTINCT visitor_id) FROM store_analytics_events
        WHERE store = {:storeId} AND event_type = 'pageview' AND TRIM(visitor_id) != '' AND datetime(created) >= datetime({:cutoff})) AS visitors30d,
      (SELECT COUNT(*) FROM store_analytics_events
        WHERE store = {:storeId} AND event_type = 'pageview' AND datetime(created) >= datetime({:cutoff})) AS pageviews30d
  `, { storeId, cutoff }, { ordersTotal: 0, ordersRecent: 0, visitors30d: 0, pageviews30d: 0 }) || {};
  return {
    orders_total: nonNegativeInteger(row.ordersTotal),
    orders_recent: nonNegativeInteger(row.ordersRecent),
    visitors_30d: nonNegativeInteger(row.visitors30d),
    pageviews_30d: nonNegativeInteger(row.pageviews30d),
  };
}

function recentOrders(app, storeId) {
  return queryRows(app, `
    SELECT id AS orderId, order_number AS orderNumber, customer_name AS customerName,
      created AS created, status AS status, usd_total AS usdTotal
    FROM orders WHERE store = {:storeId}
    ORDER BY datetime(created) DESC, id DESC LIMIT 5
  `, { storeId }, {
    orderId: "", orderNumber: "", customerName: "", created: "", status: "", usdTotal: 0,
  }).filter((row) => isRecordId(row.orderId)).map((row) => ({
    id: String(row.orderId),
    order_number: boundedString(row.orderNumber, 80),
    customer_name: boundedString(row.customerName, 160) || "Cliente",
    created: safeIsoDate(row.created),
    status: boundedString(row.status, 40),
    usd_total: finiteNumber(row.usdTotal),
    action_url: safeActionUrl(`/master/analytics/${storeId}/orders/${String(row.orderId)}`),
  }));
}

function attentionMetrics(app, storeId, recipientId, product) {
  const row = queryOne(app, `
    SELECT
      (SELECT COUNT(*) FROM master_notifications WHERE recipient = {:recipientId} AND store = {:storeId} AND status = 'unread' AND category = 'products') AS unreadPrice,
      (SELECT COUNT(*) FROM master_notifications WHERE recipient = {:recipientId} AND store = {:storeId} AND status = 'unread' AND category = 'security') AS unreadSecurity
  `, { recipientId, storeId }, { unreadPrice: 0, unreadSecurity: 0 }) || {};
  return {
    out_of_stock: product.products_out_of_stock,
    hidden: product.products_hidden,
    low_stock: product.low_stock,
    unread_price_notifications: nonNegativeInteger(row.unreadPrice),
    unread_security_notifications: nonNegativeInteger(row.unreadSecurity),
  };
}

function securityMetrics(app, storeId, defaultStatus) {
  const row = queryOne(app, `
    SELECT
      COUNT(DISTINCT CASE WHEN customer != '' AND status = 'active' AND (expires_at = '' OR datetime(expires_at) > datetime('now')) THEN customer END) AS blockedCustomers,
      COUNT(CASE WHEN customer = '' AND status = 'active' AND (expires_at = '' OR datetime(expires_at) > datetime('now')) THEN 1 END) AS blockedVisitors,
      COUNT(CASE WHEN status = 'active' AND (expires_at = '' OR datetime(expires_at) > datetime('now')) THEN 1 END) AS activeBlocks
    FROM store_security_blocks WHERE store = {:storeId}
  `, { storeId }, { blockedCustomers: 0, blockedVisitors: 0, activeBlocks: 0 }) || {};
  const activeBlocks = nonNegativeInteger(row.activeBlocks);
  let statusLabel = defaultStatus;
  if (defaultStatus !== "Seguridad desactivada" && activeBlocks > 0) statusLabel = "Bloqueos activos";
  if (defaultStatus !== "Seguridad desactivada" && activeBlocks === 0) {
    const audit = queryOne(app, `SELECT COUNT(*) AS total FROM store_security_audit
      WHERE store = {:storeId} AND datetime(created) >= datetime({:cutoff})`,
      { storeId, cutoff: cutoffIso() }, { total: 0 }) || {};
    if (nonNegativeInteger(audit.total) > 0) statusLabel = "Requiere revisión";
  }
  return {
    blocked_customers: nonNegativeInteger(row.blockedCustomers),
    blocked_visitors: nonNegativeInteger(row.blockedVisitors),
    active_blocks: activeBlocks,
    status_label: statusLabel,
  };
}

function teamMetrics(app, storeId) {
  const row = queryOne(app, `
    SELECT
      COUNT(CASE WHEN status = 'active' THEN 1 END) AS activeUsers,
      COUNT(CASE WHEN status = 'active' AND role = 'store_admin' THEN 1 END) AS admins,
      COUNT(CASE WHEN status = 'active' AND role = 'store_staff' THEN 1 END) AS staff
    FROM users WHERE store = {:storeId} AND (role = 'store_admin' OR role = 'store_staff')
  `, { storeId }, { activeUsers: 0, admins: 0, staff: 0 }) || {};
  return {
    active_users: nonNegativeInteger(row.activeUsers),
    admins: nonNegativeInteger(row.admins),
    staff: nonNegativeInteger(row.staff),
  };
}

function handleGlobalOverview(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    if (!parseGlobalPayload(info.body || {})) return e.json(400, { ok: false, error: "invalid_payload" });
    const recipientId = recordString(info.auth, "id");
    return e.json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      metrics: queryGlobalMetrics($app, recipientId),
      recent_activity: queryActivity($app, "", 8),
      top_stores: queryTopStores($app, cutoffIso()),
    });
  } catch (_) {
    logOverview("PZ_MASTER_GLOBAL_OVERVIEW_FAILED");
    return e.json(500, { ok: false, error: "overview_failed" });
  }
}

function handleStoreOverview(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseStorePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const storeRecord = findRecord($app, "stores", parsed.storeId);
    if (!storeRecord) return e.json(404, { ok: false, error: "store_not_found" });
    const store = storeResponse(storeRecord);
    const labels = securityLabels($app, parsed.storeId);
    const product = productMetrics($app, parsed.storeId, store.status === "active");
    return e.json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        featured: store.featured,
        security_label: labels.badge,
      },
      metrics: Object.assign({}, orderAndTrafficMetrics($app, parsed.storeId, cutoffIso()), {
        products_active: product.products_active,
        products_hidden: product.products_hidden,
        products_out_of_stock: product.products_out_of_stock,
        products_watched: product.products_watched,
      }),
      activity: queryActivity($app, parsed.storeId, 10),
      recent_orders: recentOrders($app, parsed.storeId),
      attention: attentionMetrics($app, parsed.storeId, recordString(info.auth, "id"), product),
      security: securityMetrics($app, parsed.storeId, labels.status),
      team: teamMetrics($app, parsed.storeId),
    });
  } catch (_) {
    logOverview("PZ_MASTER_STORE_OVERVIEW_FAILED");
    return e.json(500, { ok: false, error: "overview_failed" });
  }
}

function priceWhere(payload) {
  const clauses = [];
  if (payload.status !== "all") clauses.push("w.status = {:status}");
  if (payload.storeId) clauses.push("w.store = {:storeId}");
  if (payload.search) clauses.push("LOWER(COALESCE(NULLIF(p.name, ''), w.product_name_snapshot)) LIKE {:search} ESCAPE '\\'");
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function priceBindings(payload) {
  return {
    status: payload.status,
    storeId: payload.storeId,
    search: `%${escapeLike(payload.search.toLowerCase())}%`,
    limit: PAGE_SIZE,
    offset: (payload.page - 1) * PAGE_SIZE,
  };
}

function pricePage(app, payload) {
  const where = priceWhere(payload);
  const bindings = priceBindings(payload);
  const count = queryOne(app, `
    SELECT COUNT(*) AS total
    FROM master_product_watches w
    LEFT JOIN products p ON p.id = w.product AND p.store = w.store
    ${where}
  `, bindings, { total: 0 }) || {};
  const totalItems = nonNegativeInteger(count.total);
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(payload.page, totalPages);
  bindings.offset = (page - 1) * PAGE_SIZE;
  const items = queryRows(app, `
    SELECT w.id AS watchId, w.status AS watchStatus, w.created AS watchCreated,
      w.store AS storeId, s.name AS storeName, s.slug AS storeSlug,
      COALESCE(NULLIF(p.id, ''), w.product_id_snapshot) AS productId,
      COALESCE(NULLIF(p.name, ''), w.product_name_snapshot) AS productName,
      COALESCE(NULLIF(p.slug, ''), w.product_slug_snapshot) AS productSlug,
      CASE WHEN p.id IS NULL THEN 0
        WHEN COALESCE(p.has_variations, 0) = 1 THEN COALESCE((
          SELECT MIN(CASE WHEN v.is_offer = 1 AND v.offer_price_usd > 0 AND v.offer_price_usd < v.price_usd THEN v.offer_price_usd ELSE v.price_usd END)
          FROM product_variations v WHERE v.product = p.id AND v.active = 1 AND v.price_usd > 0
        ), 0)
        WHEN p.is_offer = 1 AND p.offer_price_usd > 0 AND (p.regular_price_usd > p.offer_price_usd OR p.base_price_usd > p.offer_price_usd) THEN p.offer_price_usd
        WHEN p.base_price_usd > 0 THEN p.base_price_usd ELSE COALESCE(p.regular_price_usd, 0) END AS currentPrice,
      COALESCE((SELECT summary FROM master_product_price_events pe WHERE pe.watch = w.id ORDER BY datetime(pe.created) DESC, pe.id DESC LIMIT 1), '') AS lastChange,
      COALESCE((SELECT created FROM master_product_price_events pe WHERE pe.watch = w.id ORDER BY datetime(pe.created) DESC, pe.id DESC LIMIT 1), w.updated) AS lastChangeAt
    FROM master_product_watches w
    JOIN stores s ON s.id = w.store
    LEFT JOIN products p ON p.id = w.product AND p.store = w.store
    ${where}
    ORDER BY datetime(lastChangeAt) DESC, w.id DESC
    LIMIT {:limit} OFFSET {:offset}
  `, bindings, {
    watchId: "", watchStatus: "", watchCreated: "", storeId: "", storeName: "", storeSlug: "",
    productId: "", productName: "", productSlug: "", currentPrice: 0, lastChange: "", lastChangeAt: "",
  }).filter((row) => isRecordId(row.watchId) && isRecordId(row.storeId)).map((row) => {
    const productId = isRecordId(row.productId) ? String(row.productId) : "";
    return {
      id: String(row.watchId),
      store: { id: String(row.storeId), name: boundedString(row.storeName, 160) || "Tienda", slug: safeSlug(row.storeSlug) },
      product: { id: productId, name: boundedString(row.productName, 180) || "Producto eliminado", slug: safeSlug(row.productSlug) },
      status: PRICE_STATUSES.includes(String(row.watchStatus)) && row.watchStatus !== "all" ? String(row.watchStatus) : "deleted",
      current_price_usd: finiteNumber(row.currentPrice),
      last_change: boundedString(row.lastChange, 300),
      last_change_at: safeIsoDate(row.lastChangeAt),
      created: safeIsoDate(row.watchCreated),
      action_url: productId
        ? safeActionUrl(`/master/products/${String(row.storeId)}/${productId}#seguimiento-precio`)
        : "/master/notifications",
    };
  });
  return { page, per_page: PAGE_SIZE, total_items: totalItems, total_pages: totalPages, items };
}

function priceStores(app) {
  return queryRows(app, `
    SELECT DISTINCT s.id AS storeId, s.name AS storeName
    FROM master_product_watches w JOIN stores s ON s.id = w.store
    ORDER BY s.name COLLATE NOCASE ASC LIMIT 100
  `, {}, { storeId: "", storeName: "" }).filter((row) => isRecordId(row.storeId)).map((row) => ({
    id: String(row.storeId), name: boundedString(row.storeName, 160) || "Tienda",
  }));
}

function handlePriceWatchPage(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parsePricePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (parsed.storeId && !findRecord($app, "stores", parsed.storeId)) {
      return e.json(404, { ok: false, error: "store_not_found" });
    }
    return e.json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      page: pricePage($app, parsed),
      stores: priceStores($app),
    });
  } catch (_) {
    logOverview("PZ_MASTER_PRICE_WATCH_PAGE_FAILED");
    return e.json(500, { ok: false, error: "price_watch_failed" });
  }
}

module.exports = {
  handleGlobalOverview,
  handlePriceWatchPage,
  handleStoreOverview,
  requireAuthenticatedUser,
};
