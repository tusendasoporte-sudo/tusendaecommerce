/// <reference path="../pb_data/types.d.ts" />

const PERIOD_DAYS = 30;
const ANALYTICS_TIME_ZONE = "America/Havana";
const ANALYTICS_RANGES = { today: 1, "7": 7, "15": 15, "30": 30 };
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PAGE_SIZE = 10;
const SALES_STATUSES = ["confirmed", "preparing", "delivered"];
const LOG_MESSAGES = {
  PZ_MASTER_ACTIVITY_SUMMARY_FAILED: "PowerZona master activity summary failed safely.",
  PZ_MASTER_ACTIVITY_QUERY_FAILED: "PowerZona master activity query failed safely.",
  PZ_MASTER_ANALYTICS_DETAIL_FAILED: "PowerZona master analytics detail failed safely.",
  PZ_MASTER_ANALYTICS_QUERY_FAILED: "PowerZona master analytics query failed safely.",
  PZ_MASTER_ORDER_DETAIL_FAILED: "PowerZona master order detail failed safely.",
  PZ_MASTER_ORDER_QUERY_FAILED: "PowerZona master order query failed safely.",
};

function logMasterActivity(code) {
  try {
    $app.logger().error(
      LOG_MESSAGES[code] || LOG_MESSAGES.PZ_MASTER_ACTIVITY_SUMMARY_FAILED,
      "code",
      code
    );
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

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function bodyKeys(body) {
  if (!body || typeof body !== "object") return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function isValidPayload(body) {
  const keys = bodyKeys(body);
  const periodDays = bodyValue(body, "period_days");
  return keys.length === 1
    && keys[0] === "period_days"
    && typeof periodDays === "number"
    && Number.isInteger(periodDays)
    && periodDays === PERIOD_DAYS;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.floor(number);
}

function safeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function booleanValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function isValidRecordId(value) {
  return RECORD_ID_PATTERN.test(String(value || "").trim());
}

function isMasterRequest(info) {
  return recordString(info && info.auth, "role") === "master_admin";
}

function findRecordByIdSafe(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function exactPayload(body, allowedKeys) {
  const keys = bodyKeys(body).sort();
  const expected = allowedKeys.slice().sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function parseAnalyticsPayload(body) {
  if (!exactPayload(body, ["store_id", "range", "pages_page"])) return null;
  const storeId = bodyValue(body, "store_id");
  const range = bodyValue(body, "range");
  const pagesPage = bodyValue(body, "pages_page");
  if (typeof storeId !== "string" || !isValidRecordId(storeId)) return null;
  if (typeof range !== "string" || !Object.prototype.hasOwnProperty.call(ANALYTICS_RANGES, range)) return null;
  if (typeof pagesPage !== "number" || !Number.isInteger(pagesPage) || pagesPage < 1) return null;
  return { storeId: storeId.trim(), range, pagesPage };
}

function parseOrderPayload(body) {
  if (!exactPayload(body, ["store_id", "order_id"])) return null;
  const storeId = bodyValue(body, "store_id");
  const orderId = bodyValue(body, "order_id");
  if (typeof storeId !== "string" || !isValidRecordId(storeId)) return null;
  if (typeof orderId !== "string" || !isValidRecordId(orderId)) return null;
  return { storeId: storeId.trim(), orderId: orderId.trim() };
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function utcParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

function havanaParts(date) {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
        timeZone: ANALYTICS_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(date);
      const mapped = {};
      parts.forEach((part) => {
        if (part.type !== "literal") mapped[part.type] = Number(part.value);
      });
      if (mapped.year && mapped.month && mapped.day) {
        return {
          year: mapped.year,
          month: mapped.month,
          day: mapped.day,
          hour: mapped.hour || 0,
          minute: mapped.minute || 0,
          second: mapped.second || 0,
        };
      }
    }
  } catch (_) {}

  // PocketBase JS runtimes without Intl use a deterministic Cuba fallback.
  // The offset is selected by the modern Havana DST calendar, never by the VPS timezone.
  const year = date.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const secondSundayMarch = 8 + ((7 - marchFirst.getUTCDay()) % 7);
  const novemberFirst = new Date(Date.UTC(year, 10, 1));
  const firstSundayNovember = 1 + ((7 - novemberFirst.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, secondSundayMarch, 5, 0, 0);
  const dstEnd = Date.UTC(year, 10, firstSundayNovember, 5, 0, 0);
  const offsetHours = date.getTime() >= dstStart && date.getTime() < dstEnd ? -4 : -5;
  return utcParts(new Date(date.getTime() + offsetHours * 60 * 60 * 1000));
}

function partsUtcValue(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0, 0);
}

function havanaOffsetMinutes(date) {
  return Math.round((partsUtcValue(havanaParts(date)) - date.getTime()) / 60000);
}

function havanaMidnightUtc(year, month, day) {
  const target = { year, month, day, hour: 0, minute: 0, second: 0 };
  let candidate = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidate = new Date(partsUtcValue(target) - havanaOffsetMinutes(candidate) * 60000);
  }
  return candidate;
}

function addCalendarDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function dateKey(parts) {
  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

function shortDayLabel(parts) {
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${parts.day} ${months[Math.max(0, Math.min(11, parts.month - 1))]}`;
}

function buildPeriod(range, now) {
  const periodDays = ANALYTICS_RANGES[range];
  const todayParts = havanaParts(now || new Date());
  const today = { year: todayParts.year, month: todayParts.month, day: todayParts.day };
  const start = addCalendarDays(today, -(periodDays - 1));
  const endExclusive = addCalendarDays(today, 1);
  const days = [];
  for (let index = 0; index < periodDays; index += 1) {
    const parts = addCalendarDays(start, index);
    const next = addCalendarDays(parts, 1);
    days.push({
      day: dateKey(parts),
      label: shortDayLabel(parts),
      startIso: havanaMidnightUtc(parts.year, parts.month, parts.day).toISOString(),
      endIso: havanaMidnightUtc(next.year, next.month, next.day).toISOString(),
    });
  }
  return {
    periodDays,
    startDay: days[0].day,
    endDay: days[days.length - 1].day,
    startIso: havanaMidnightUtc(start.year, start.month, start.day).toISOString(),
    endIso: havanaMidnightUtc(endExclusive.year, endExclusive.month, endExclusive.day).toISOString(),
    days,
  };
}

function queryRows(app, sql, bindings, model, logCode) {
  const rows = arrayOf(new DynamicModel(model));
  try {
    app.db().newQuery(sql).bind(bindings || {}).all(rows);
    return rows;
  } catch (error) {
    logMasterActivity(logCode);
    throw error;
  }
}

function queryOne(app, sql, bindings, model, logCode) {
  const rows = queryRows(app, sql, bindings, model, logCode);
  return rows.length ? rows[0] : null;
}

function buildDailyCase(period, columnName) {
  return period.days.map((day, index) => (
    `WHEN datetime(${columnName}) >= datetime({:dayStart${index}}) AND datetime(${columnName}) < datetime({:dayEnd${index}}) THEN '${day.day}'`
  )).join("\n");
}

function dailyBindings(period, extra) {
  const bindings = Object.assign({}, extra || {});
  period.days.forEach((day, index) => {
    bindings[`dayStart${index}`] = day.startIso;
    bindings[`dayEnd${index}`] = day.endIso;
  });
  return bindings;
}

function normalizeStatus(value) {
  const status = boundedString(value, 20).toLowerCase();
  return ["pending", "confirmed", "preparing", "delivered", "cancelled"].includes(status) ? status : "pending";
}

function normalizeDeliveryMethod(value) {
  const method = boundedString(value, 20).toLowerCase();
  return ["delivery", "pickup", "coordinate"].includes(method) ? method : "coordinate";
}

function normalizeProductState(row) {
  if (!boundedString(row && row.productId, 15)) return "deleted";
  if (!booleanValue(row && row.active)) return "hidden";
  const trackStock = booleanValue(row && row.trackStock);
  const stock = finiteNumber(row && row.stock);
  const variationStock = finiteNumber(row && row.variationStock);
  if (trackStock && stock <= 0 && variationStock <= 0) return "sold_out";
  return "available";
}

function safeSlug(value) {
  const slug = boundedString(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function safePublicPath(value) {
  const path = boundedString(value, 240);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "";
  if (path.includes("://") || /^(?:\/master|\/admin)(?:\/|$)/i.test(path)) return "";
  if (/^\/t\/[^/]+\/admin(?:\/|$)/i.test(path)) return "";
  return path;
}

function publicEntityPath(storeSlug, pageType, entitySlug, fallbackPath) {
  const safeStoreSlug = safeSlug(storeSlug);
  if (!safeStoreSlug) return "";
  const base = `/t/${encodeURIComponent(safeStoreSlug)}`;
  const safeEntitySlug = safeSlug(entitySlug);
  if (pageType === "store_home") return base;
  if (pageType === "product" && safeEntitySlug) return `${base}/producto/${encodeURIComponent(safeEntitySlug)}`;
  if (pageType === "category" && safeEntitySlug) return `${base}/categoria/${encodeURIComponent(safeEntitySlug)}`;
  if (pageType === "subcategory" && safeEntitySlug) return `${base}/subcategoria/${encodeURIComponent(safeEntitySlug)}`;
  if (pageType === "gifts") return `${base}/regalos`;
  if (pageType === "search") return `${base}/buscar`;
  if (pageType === "checkout") return `${base}/checkout`;
  if (pageType === "landing_qr") return `${base}/links`;
  return safePublicPath(fallbackPath);
}

function normalizePageType(value) {
  const key = boundedString(value, 40).toLowerCase().replace(/[\s-]+/g, "_");
  const known = ["store_home", "product", "category", "subcategory", "gifts", "search", "checkout", "landing_qr", "other"];
  if (["home", "store", "storefront"].includes(key)) return "store_home";
  if (["landingqr", "qr_landing"].includes(key)) return "landing_qr";
  return known.includes(key) ? key : "other";
}

function pageTypeLabel(pageType) {
  return {
    store_home: "Inicio de tienda",
    product: "Producto",
    category: "Categoría",
    subcategory: "Subcategoría",
    gifts: "Regalos",
    search: "Buscar",
    checkout: "Checkout",
    landing_qr: "Landing QR",
    other: "Página pública",
  }[pageType] || "Página pública";
}

function pageDisplayName(row, pageType) {
  const resolved = boundedString(row && row.entityName, 160);
  if (pageType === "product") return resolved ? `Producto: ${resolved}` : "Producto no disponible";
  if (pageType === "category") return resolved ? `Categoría: ${resolved}` : "Categoría no disponible";
  if (pageType === "subcategory") return resolved ? `Subcategoría: ${resolved}` : "Subcategoría no disponible";
  if (pageType === "other") return "Página pública";
  return pageTypeLabel(pageType);
}

function mapPageRow(row, storeSlug) {
  const pageType = normalizePageType(row && row.pageType);
  const entityId = isValidRecordId(row && row.entityId) ? String(row.entityId) : "";
  const entitySlug = safeSlug(row && row.entitySlug);
  return {
    page_type: pageType,
    entity_id: entityId,
    name: pageDisplayName(row, pageType),
    detail: pageTypeLabel(pageType),
    visits: nonNegativeInteger(row && row.visits),
    last_visited_at: safeIsoDate(row && row.lastVisitedAt),
    public_path: publicEntityPath(storeSlug, pageType, entitySlug, row && row.rawPath),
  };
}

function queryTraffic(app, storeId, period) {
  const metrics = queryOne(app, `
    WITH filtered AS (
      SELECT
        visitor_id,
        CASE
          WHEN TRIM(session_id) != '' THEN session_id
          ELSE 'legacy-' || day
        END AS session_key
      FROM store_analytics_events
      WHERE store = {:storeId}
        AND event_type = 'pageview'
        AND day >= {:startDay}
        AND day <= {:endDay}
    ), visitor_sessions AS (
      SELECT visitor_id, COUNT(DISTINCT session_key) AS sessions
      FROM filtered
      WHERE TRIM(visitor_id) != ''
      GROUP BY visitor_id
    )
    SELECT
      (SELECT COUNT(*) FROM filtered) AS pageviews,
      (SELECT COUNT(DISTINCT visitor_id) FROM filtered WHERE TRIM(visitor_id) != '') AS visitors,
      (SELECT COUNT(*) FROM visitor_sessions WHERE sessions >= 2) AS recurrentVisitors
  `, { storeId, startDay: period.startDay, endDay: period.endDay }, {
    pageviews: 0,
    visitors: 0,
    recurrentVisitors: 0,
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED") || {};

  const rows = queryRows(app, `
    WITH filtered AS (
      SELECT
        day,
        visitor_id,
        CASE
          WHEN TRIM(session_id) != '' THEN session_id
          ELSE 'legacy-' || day
        END AS session_key
      FROM store_analytics_events
      WHERE store = {:storeId}
        AND event_type = 'pageview'
        AND day >= {:startDay}
        AND day <= {:endDay}
    ), daily AS (
      SELECT
        day,
        COUNT(*) AS pageviews,
        COUNT(DISTINCT CASE WHEN TRIM(visitor_id) != '' THEN visitor_id END) AS visitors
      FROM filtered
      GROUP BY day
    ), recurrent AS (
      SELECT day, COUNT(*) AS recurrentVisitors
      FROM (
        SELECT day, visitor_id, COUNT(DISTINCT session_key) AS sessions
        FROM filtered
        WHERE TRIM(visitor_id) != ''
        GROUP BY day, visitor_id
      ) sessions
      WHERE sessions >= 2
      GROUP BY day
    )
    SELECT
      daily.day AS day,
      daily.pageviews AS pageviews,
      daily.visitors AS visitors,
      COALESCE(recurrent.recurrentVisitors, 0) AS recurrentVisitors
    FROM daily
    LEFT JOIN recurrent ON recurrent.day = daily.day
    ORDER BY daily.day
  `, { storeId, startDay: period.startDay, endDay: period.endDay }, {
    day: "",
    pageviews: 0,
    visitors: 0,
    recurrentVisitors: 0,
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED");

  const byDay = new Map();
  rows.forEach((row) => byDay.set(String(row.day || ""), row));
  return {
    metrics: {
      visitors: nonNegativeInteger(metrics.visitors),
      recurrent_visitors: nonNegativeInteger(metrics.recurrentVisitors),
      pageviews: nonNegativeInteger(metrics.pageviews),
    },
    daily: period.days.map((day) => {
      const row = byDay.get(day.day) || {};
      return {
        day: day.day,
        label: day.label,
        visitors: nonNegativeInteger(row.visitors),
        recurrent_visitors: nonNegativeInteger(row.recurrentVisitors),
        pageviews: nonNegativeInteger(row.pageviews),
        orders: 0,
      };
    }),
  };
}

function queryOrdersByDay(app, storeId, period) {
  const rows = queryRows(app, `
    SELECT
      CASE ${buildDailyCase(period, "created")}
        ELSE ''
      END AS day,
      COUNT(*) AS ordersCount,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmedCount,
      SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) AS preparingCount,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS deliveredCount,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledCount
    FROM orders
    WHERE store = {:storeId}
      AND datetime(created) >= datetime({:periodStart})
      AND datetime(created) < datetime({:periodEnd})
    GROUP BY day
    ORDER BY day
  `, dailyBindings(period, {
    storeId,
    periodStart: period.startIso,
    periodEnd: period.endIso,
  }), {
    day: "",
    ordersCount: 0,
    pendingCount: 0,
    confirmedCount: 0,
    preparingCount: 0,
    deliveredCount: 0,
    cancelledCount: 0,
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED");

  const byDay = new Map();
  const statuses = { pending: 0, confirmed: 0, preparing: 0, delivered: 0, cancelled: 0 };
  let total = 0;
  rows.forEach((row) => {
    const day = String(row.day || "");
    if (day) byDay.set(day, nonNegativeInteger(row.ordersCount));
    total += nonNegativeInteger(row.ordersCount);
    statuses.pending += nonNegativeInteger(row.pendingCount);
    statuses.confirmed += nonNegativeInteger(row.confirmedCount);
    statuses.preparing += nonNegativeInteger(row.preparingCount);
    statuses.delivered += nonNegativeInteger(row.deliveredCount);
    statuses.cancelled += nonNegativeInteger(row.cancelledCount);
  });
  return { total, statuses, byDay };
}

function queryTopViewedProducts(app, storeId, period) {
  return queryRows(app, `
    SELECT
      events.productId AS productId,
      COALESCE(products.name, '') AS name,
      COALESCE(products.slug, '') AS slug,
      COALESCE(products.active, 0) AS active,
      COUNT(*) AS views
    FROM (
      SELECT store, entity_id AS productId
      FROM store_analytics_events
      WHERE store = {:storeId}
        AND event_type = 'pageview'
        AND page_type = 'product'
        AND TRIM(entity_id) != ''
        AND day >= {:startDay}
        AND day <= {:endDay}
    ) events
    LEFT JOIN products ON products.id = events.productId AND products.store = events.store
    GROUP BY events.productId
    ORDER BY views DESC, name COLLATE NOCASE ASC
    LIMIT 5
  `, { storeId, startDay: period.startDay, endDay: period.endDay }, {
    productId: "",
    name: "",
    slug: "",
    active: false,
    views: 0,
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED").map((row) => {
    const exists = isValidRecordId(row.productId) && boundedString(row.name, 160) !== "";
    return {
      product_id: isValidRecordId(row.productId) ? String(row.productId) : "",
      name: exists ? boundedString(row.name, 160) : "Producto no disponible",
      slug: exists ? safeSlug(row.slug) : "",
      active: exists && booleanValue(row.active),
      views: nonNegativeInteger(row.views),
    };
  });
}

function queryLandingQr(app, storeId, period) {
  const metrics = queryOne(app, `
    WITH view_events AS (
      SELECT DISTINCT
        CASE
          WHEN TRIM(session_id) != '' THEN 'session:' || session_id || ':' || day
          WHEN TRIM(visitor_id) != '' THEN 'visitor:' || visitor_id || ':' || day
          ELSE 'event:' || id
        END AS visit_key
      FROM store_analytics_events
      WHERE store = {:storeId}
        AND day >= {:startDay}
        AND day <= {:endDay}
        AND (
          event_type = 'landing_qr_view'
          OR (event_type = 'pageview' AND page_type = 'landing_qr')
        )
    )
    SELECT
      (SELECT COUNT(*) FROM view_events) AS views,
      (SELECT COUNT(*) FROM store_analytics_events
        WHERE store = {:storeId}
          AND event_type = 'landing_qr_click'
          AND day >= {:startDay}
          AND day <= {:endDay}) AS clicks
  `, { storeId, startDay: period.startDay, endDay: period.endDay }, {
    views: 0,
    clicks: 0,
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED") || {};

  const topButtons = queryRows(app, `
    SELECT
      link_id AS linkId,
      link_type AS linkType,
      link_label AS linkLabel,
      COUNT(*) AS clicks
    FROM store_analytics_events
    WHERE store = {:storeId}
      AND event_type = 'landing_qr_click'
      AND day >= {:startDay}
      AND day <= {:endDay}
    GROUP BY link_id, link_type, link_label
    ORDER BY clicks DESC, link_label COLLATE NOCASE ASC
    LIMIT 10
  `, { storeId, startDay: period.startDay, endDay: period.endDay }, {
    linkId: "",
    linkType: "",
    linkLabel: "",
    clicks: 0,
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED").map((row) => ({
    link_id: boundedString(row.linkId, 80),
    link_type: boundedString(row.linkType, 40),
    link_label: boundedString(row.linkLabel, 100) || "Botón",
    clicks: nonNegativeInteger(row.clicks),
  }));

  return {
    views: nonNegativeInteger(metrics.views),
    clicks: nonNegativeInteger(metrics.clicks),
    top_buttons: topButtons,
  };
}

const PAGE_GROUP_CTE = `
  WITH grouped AS (
    SELECT
      CASE
        WHEN TRIM(page_type) = '' THEN 'other'
        ELSE page_type
      END AS pageType,
      CASE WHEN TRIM(entity_id) != '' THEN entity_id ELSE '' END AS entityId,
      CASE WHEN TRIM(entity_id) = '' THEN path ELSE '' END AS rawPath,
      COUNT(*) AS visits,
      MAX(created) AS lastVisitedAt
    FROM store_analytics_events
    WHERE store = {:storeId}
      AND event_type = 'pageview'
      AND day >= {:startDay}
      AND day <= {:endDay}
    GROUP BY
      CASE WHEN TRIM(page_type) = '' THEN 'other' ELSE page_type END,
      CASE WHEN TRIM(entity_id) != '' THEN entity_id ELSE path END
  ), resolved AS (
    SELECT
      grouped.pageType AS pageType,
      grouped.entityId AS entityId,
      grouped.rawPath AS rawPath,
      grouped.visits AS visits,
      grouped.lastVisitedAt AS lastVisitedAt,
      COALESCE(products.name, categories.name, subcategories.name, '') AS entityName,
      COALESCE(products.slug, categories.slug, subcategories.slug, '') AS entitySlug
    FROM grouped
    LEFT JOIN products
      ON grouped.pageType = 'product'
      AND products.id = grouped.entityId
      AND products.store = {:storeId}
    LEFT JOIN categories
      ON grouped.pageType = 'category'
      AND categories.id = grouped.entityId
      AND categories.store = {:storeId}
    LEFT JOIN subcategories
      ON grouped.pageType = 'subcategory'
      AND subcategories.id = grouped.entityId
      AND subcategories.store = {:storeId}
  )
`;

function pageRowModel() {
  return {
    pageType: "",
    entityId: "",
    rawPath: "",
    visits: 0,
    lastVisitedAt: "",
    entityName: "",
    entitySlug: "",
  };
}

function queryPages(app, storeId, storeSlug, period, requestedPage) {
  const bindings = { storeId, startDay: period.startDay, endDay: period.endDay };
  const countRow = queryOne(app, `${PAGE_GROUP_CTE}
    SELECT COUNT(*) AS totalItems FROM resolved
  `, bindings, { totalItems: 0 }, "PZ_MASTER_ANALYTICS_QUERY_FAILED") || {};
  const totalItems = nonNegativeInteger(countRow.totalItems);
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageBindings = Object.assign({}, bindings, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const items = queryRows(app, `${PAGE_GROUP_CTE}
    SELECT * FROM resolved
    ORDER BY visits DESC, entityName COLLATE NOCASE ASC, pageType ASC
    LIMIT {:limit} OFFSET {:offset}
  `, pageBindings, pageRowModel(), "PZ_MASTER_ANALYTICS_QUERY_FAILED")
    .map((row) => mapPageRow(row, storeSlug));
  const topPages = queryRows(app, `${PAGE_GROUP_CTE}
    SELECT * FROM resolved
    ORDER BY visits DESC, entityName COLLATE NOCASE ASC, pageType ASC
    LIMIT 5
  `, bindings, pageRowModel(), "PZ_MASTER_ANALYTICS_QUERY_FAILED")
    .map((row) => mapPageRow(row, storeSlug));
  return {
    topPages,
    pages: {
      page,
      per_page: PAGE_SIZE,
      total_items: totalItems,
      total_pages: totalPages,
      items,
    },
  };
}

const SALES_CTE = `
  WITH valid_items AS (
    SELECT
      oi.*,
      o.id AS orderId,
      CASE
        WHEN TRIM(oi.product) != '' THEN 'ref:' || LOWER(TRIM(oi.product))
        WHEN TRIM(oi.product_ref) != '' THEN 'ref:' || LOWER(TRIM(oi.product_ref))
        ELSE 'name:' || LOWER(TRIM(oi.product_name))
      END AS productKey,
      CASE
        WHEN TRIM(oi.variation) != '' THEN 'ref:' || LOWER(TRIM(oi.variation))
        WHEN TRIM(oi.variation_ref) != '' THEN 'ref:' || LOWER(TRIM(oi.variation_ref))
        ELSE 'name:' || LOWER(TRIM(COALESCE(NULLIF(oi.variation_label, ''), oi.variation_name)))
      END AS variationKey
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.[order]
    WHERE o.store = {:storeId}
      AND o.status IN ('confirmed', 'preparing', 'delivered')
      AND datetime(o.created) >= datetime({:periodStart})
      AND datetime(o.created) < datetime({:periodEnd})
      AND COALESCE(oi.is_gift, 0) = 0
      AND COALESCE(oi.quantity, 0) > 0
  ), product_totals AS (
    SELECT
      productKey,
      MAX(CASE WHEN TRIM(product) != '' THEN product ELSE '' END) AS currentProductId,
      MAX(CASE WHEN TRIM(product_ref) != '' THEN product_ref ELSE '' END) AS productRef,
      MAX(CASE WHEN TRIM(product_name) != '' THEN product_name ELSE '' END) AS historicalName,
      SUM(quantity) AS unitsSold,
      COUNT(DISTINCT orderId) AS ordersCount,
      SUM(COALESCE(line_total_usd, 0)) AS revenueUsd
    FROM valid_items
    GROUP BY productKey
  ), variation_totals AS (
    SELECT
      productKey,
      variationKey,
      MAX(COALESCE(NULLIF(variation_label, ''), NULLIF(variation_name, ''), '')) AS variationName,
      SUM(quantity) AS unitsSold
    FROM valid_items
    WHERE variationKey != 'name:'
    GROUP BY productKey, variationKey
  ), ranked_variations AS (
    SELECT
      productKey,
      variationName,
      unitsSold,
      ROW_NUMBER() OVER (PARTITION BY productKey ORDER BY unitsSold DESC, variationName COLLATE NOCASE ASC) AS rankNumber
    FROM variation_totals
  ), variation_stock AS (
    SELECT product, SUM(CASE WHEN active = 1 THEN COALESCE(stock, 0) ELSE 0 END) AS stock
    FROM product_variations
    GROUP BY product
  ), resolved AS (
    SELECT
      product_totals.productKey AS productKey,
      COALESCE(products.id, '') AS productId,
      COALESCE(products.name, NULLIF(product_totals.historicalName, ''), 'Producto no disponible') AS name,
      COALESCE(products.slug, '') AS slug,
      COALESCE(products.active, 0) AS active,
      COALESCE(products.track_stock, 0) AS trackStock,
      COALESCE(products.stock, 0) AS stock,
      COALESCE(variation_stock.stock, 0) AS variationStock,
      product_totals.unitsSold AS unitsSold,
      product_totals.ordersCount AS ordersCount,
      product_totals.revenueUsd AS revenueUsd,
      COALESCE(ranked_variations.variationName, '') AS topVariation,
      COALESCE(ranked_variations.unitsSold, 0) AS topVariationUnits
    FROM product_totals
    LEFT JOIN products
      ON products.store = {:storeId}
      AND (
        products.id = product_totals.currentProductId
        OR (product_totals.currentProductId = '' AND products.id = product_totals.productRef)
      )
    LEFT JOIN variation_stock ON variation_stock.product = products.id
    LEFT JOIN ranked_variations
      ON ranked_variations.productKey = product_totals.productKey
      AND ranked_variations.rankNumber = 1
  )
`;

function salesRowModel() {
  return {
    productKey: "",
    productId: "",
    name: "",
    slug: "",
    active: false,
    trackStock: false,
    stock: 0,
    variationStock: 0,
    unitsSold: 0,
    ordersCount: 0,
    revenueUsd: 0,
    topVariation: "",
    topVariationUnits: 0,
  };
}

function mapSalesRow(row) {
  const productId = isValidRecordId(row && row.productId) ? String(row.productId) : "";
  return {
    product_id: productId,
    name: boundedString(row && row.name, 180) || "Producto no disponible",
    slug: productId ? safeSlug(row && row.slug) : "",
    active: productId ? booleanValue(row && row.active) : false,
    state: normalizeProductState(row),
    units_sold: nonNegativeInteger(row && row.unitsSold),
    orders_count: nonNegativeInteger(row && row.ordersCount),
    revenue_usd: finiteNumber(row && row.revenueUsd),
    top_variation: boundedString(row && row.topVariation, 160),
    top_variation_units: nonNegativeInteger(row && row.topVariationUnits),
  };
}

function querySales(app, storeId, period) {
  const bindings = { storeId, periodStart: period.startIso, periodEnd: period.endIso };
  const totals = queryOne(app, `${SALES_CTE}
    SELECT COALESCE(SUM(unitsSold), 0) AS soldUnits, COALESCE(SUM(revenueUsd), 0) AS revenueUsd
    FROM resolved
  `, bindings, { soldUnits: 0, revenueUsd: 0 }, "PZ_MASTER_ANALYTICS_QUERY_FAILED") || {};
  const byUnits = queryRows(app, `${SALES_CTE}
    SELECT * FROM resolved
    ORDER BY unitsSold DESC, revenueUsd DESC, name COLLATE NOCASE ASC
    LIMIT 10
  `, bindings, salesRowModel(), "PZ_MASTER_ANALYTICS_QUERY_FAILED").map(mapSalesRow);
  const byRevenue = queryRows(app, `${SALES_CTE}
    SELECT * FROM resolved
    ORDER BY revenueUsd DESC, unitsSold DESC, name COLLATE NOCASE ASC
    LIMIT 10
  `, bindings, salesRowModel(), "PZ_MASTER_ANALYTICS_QUERY_FAILED").map(mapSalesRow);
  return {
    soldUnits: nonNegativeInteger(totals.soldUnits),
    revenueUsd: finiteNumber(totals.revenueUsd),
    byUnits,
    byRevenue,
  };
}

function queryRecentOrders(app, storeId) {
  return queryRows(app, `
    SELECT
      id AS orderId,
      order_number AS orderNumber,
      customer_name AS customerName,
      status AS status,
      usd_total AS usdTotal,
      delivery_method AS deliveryMethod,
      created AS created
    FROM orders
    WHERE store = {:storeId}
    ORDER BY created DESC, id DESC
    LIMIT 10
  `, { storeId }, {
    orderId: "",
    orderNumber: "",
    customerName: "",
    status: "",
    usdTotal: 0,
    deliveryMethod: "",
    created: "",
  }, "PZ_MASTER_ANALYTICS_QUERY_FAILED").map((row) => ({
    id: isValidRecordId(row.orderId) ? String(row.orderId) : "",
    order_number: boundedString(row.orderNumber, 80),
    customer_name: boundedString(row.customerName, 160) || "Cliente",
    status: normalizeStatus(row.status),
    usd_total: finiteNumber(row.usdTotal),
    delivery_method: normalizeDeliveryMethod(row.deliveryMethod),
    created: safeIsoDate(row.created),
  })).filter((row) => row.id);
}

function storeResponse(record) {
  const status = recordString(record, "status").toLowerCase() === "active" ? "active" : "suspended";
  return {
    id: recordString(record, "id"),
    name: boundedString(recordString(record, "name"), 160) || "Tienda",
    slug: safeSlug(recordString(record, "slug")),
    status,
  };
}

function handleStoreAnalyticsDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const payload = parseAnalyticsPayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });

    const storeRecord = findRecordByIdSafe($app, "stores", payload.storeId);
    if (!storeRecord) return e.json(404, { ok: false, error: "store_not_found" });
    const store = storeResponse(storeRecord);
    const period = buildPeriod(payload.range, new Date());
    const traffic = queryTraffic($app, payload.storeId, period);
    const orders = queryOrdersByDay($app, payload.storeId, period);
    traffic.daily.forEach((day) => { day.orders = orders.byDay.get(day.day) || 0; });
    const topViewedProducts = queryTopViewedProducts($app, payload.storeId, period);
    const landingQr = queryLandingQr($app, payload.storeId, period);
    const pagesResult = queryPages($app, payload.storeId, store.slug, period, payload.pagesPage);
    const sales = querySales($app, payload.storeId, period);
    const recentOrders = queryRecentOrders($app, payload.storeId);

    return e.json(200, {
      ok: true,
      range: payload.range,
      period_days: period.periodDays,
      generated_at: new Date().toISOString(),
      time_zone: ANALYTICS_TIME_ZONE,
      store,
      metrics: {
        visitors: traffic.metrics.visitors,
        recurrent_visitors: traffic.metrics.recurrent_visitors,
        pageviews: traffic.metrics.pageviews,
        orders_period: orders.total,
        sold_units: sales.soldUnits,
        product_revenue_usd: sales.revenueUsd,
      },
      order_statuses: orders.statuses,
      daily: traffic.daily,
      top_viewed_products: topViewedProducts,
      top_selling_products_by_units: sales.byUnits,
      top_selling_products_by_revenue: sales.byRevenue,
      landing_qr: landingQr,
      recent_orders: recentOrders,
      top_pages: pagesResult.topPages,
      pages: pagesResult.pages,
    });
  } catch (_) {
    logMasterActivity("PZ_MASTER_ANALYTICS_DETAIL_FAILED");
    return e.json(500, { ok: false, error: "analytics_failed" });
  }
}

function safeItemImageUrl(value) {
  const url = boundedString(value, 800);
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("://")) return url;
  if (/^https:\/\/[^\s]+$/i.test(url)) return url;
  return "";
}

function queryOrderHeader(app, storeId, orderId) {
  return queryOne(app, `
    SELECT
      id AS orderId,
      order_number AS orderNumber,
      customer_name AS customerName,
      status AS status,
      delivery_method AS deliveryMethod,
      created AS created,
      usd_total AS usdTotal,
      mixed_payment AS mixedPayment
    FROM orders
    WHERE id = {:orderId} AND store = {:storeId}
    LIMIT 1
  `, { storeId, orderId }, {
    orderId: "",
    orderNumber: "",
    customerName: "",
    status: "",
    deliveryMethod: "",
    created: "",
    usdTotal: 0,
    mixedPayment: false,
  }, "PZ_MASTER_ORDER_QUERY_FAILED");
}

function queryOrderItems(app, orderId) {
  return queryRows(app, `
    SELECT
      product_name AS productName,
      COALESCE(NULLIF(variation_label, ''), NULLIF(variation_name, ''), '') AS variationName,
      quantity AS quantity,
      unit_price_usd AS unitPriceUsd,
      line_total_usd AS lineTotalUsd,
      is_gift AS isGift,
      item_image_url AS itemImageUrl
    FROM order_items
    WHERE [order] = {:orderId}
    ORDER BY datetime(created) ASC, id ASC
    LIMIT 100
  `, { orderId }, {
    productName: "",
    variationName: "",
    quantity: 0,
    unitPriceUsd: 0,
    lineTotalUsd: 0,
    isGift: false,
    itemImageUrl: "",
  }, "PZ_MASTER_ORDER_QUERY_FAILED").map((row) => ({
    product_name: boundedString(row.productName, 180) || (booleanValue(row.isGift) ? "Regalo" : "Producto"),
    variation_name: boundedString(row.variationName, 160),
    variation_label: boundedString(row.variationName, 160),
    quantity: nonNegativeInteger(row.quantity),
    unit_price_usd: finiteNumber(row.unitPriceUsd),
    line_total_usd: finiteNumber(row.lineTotalUsd),
    is_gift: booleanValue(row.isGift),
    item_image_url: safeItemImageUrl(row.itemImageUrl),
  }));
}

function handleOrderReadonlyDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const payload = parseOrderPayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });

    const storeRecord = findRecordByIdSafe($app, "stores", payload.storeId);
    if (!storeRecord) return e.json(404, { ok: false, error: "store_not_found" });
    const order = queryOrderHeader($app, payload.storeId, payload.orderId);
    if (!order || !isValidRecordId(order.orderId)) {
      return e.json(404, { ok: false, error: "order_not_found" });
    }

    return e.json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      store: storeResponse(storeRecord),
      order: {
        id: String(order.orderId),
        order_number: boundedString(order.orderNumber, 80),
        customer_name: boundedString(order.customerName, 160) || "Cliente",
        status: normalizeStatus(order.status),
        delivery_method: normalizeDeliveryMethod(order.deliveryMethod),
        created: safeIsoDate(order.created),
        usd_total: finiteNumber(order.usdTotal),
        mixed_payment: booleanValue(order.mixedPayment),
        items: queryOrderItems($app, payload.orderId),
      },
    });
  } catch (_) {
    logMasterActivity("PZ_MASTER_ORDER_DETAIL_FAILED");
    return e.json(500, { ok: false, error: "order_failed" });
  }
}

function cutoffIso(periodDays) {
  return new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
}

function queryStoreActivity(app, cutoff) {
  const rows = arrayOf(new DynamicModel({
    storeId: "",
    ordersTotal: 0,
    orders30d: 0,
    visitors30d: 0,
    pageviews30d: 0,
    lastActivityAt: "",
  }));

  try {
    app.db().newQuery(`
      SELECT
        s.id AS storeId,
        COALESCE(o.orders_total, 0) AS ordersTotal,
        COALESCE(o.orders_30d, 0) AS orders30d,
        COALESCE(a.visitors_30d, 0) AS visitors30d,
        COALESCE(a.pageviews_30d, 0) AS pageviews30d,
        CASE
          WHEN COALESCE(o.last_order_at, '') >= COALESCE(a.last_pageview_at, '')
            THEN COALESCE(o.last_order_at, '')
          ELSE COALESCE(a.last_pageview_at, '')
        END AS lastActivityAt
      FROM stores s
      LEFT JOIN (
        SELECT
          store,
          COUNT(*) AS orders_total,
          SUM(CASE WHEN datetime(created) >= datetime({:cutoff}) THEN 1 ELSE 0 END) AS orders_30d,
          MAX(created) AS last_order_at
        FROM orders
        WHERE store != ''
        GROUP BY store
      ) o ON o.store = s.id
      LEFT JOIN (
        SELECT
          store,
          COUNT(*) AS pageviews_30d,
          COUNT(DISTINCT CASE WHEN TRIM(visitor_id) != '' THEN visitor_id END) AS visitors_30d,
          MAX(created) AS last_pageview_at
        FROM store_analytics_events
        WHERE store != ''
          AND event_type = 'pageview'
          AND datetime(created) >= datetime({:cutoff})
        GROUP BY store
      ) a ON a.store = s.id
      ORDER BY s.id
    `).bind({ cutoff }).all(rows);
  } catch (error) {
    logMasterActivity("PZ_MASTER_ACTIVITY_QUERY_FAILED");
    throw error;
  }

  return rows.map((row) => ({
    store_id: String(row.storeId || ""),
    orders_total: nonNegativeInteger(row.ordersTotal),
    orders_30d: nonNegativeInteger(row.orders30d),
    visitors_30d: nonNegativeInteger(row.visitors30d),
    pageviews_30d: nonNegativeInteger(row.pageviews30d),
    last_activity_at: safeIsoDate(row.lastActivityAt),
  })).filter((item) => item.store_id);
}

function handleStoreActivitySummary(e) {
  setPrivateHeaders(e);

  try {
    const info = e.requestInfo();
    if (recordString(info.auth, "role") !== "master_admin") {
      return e.json(403, { ok: false, error: "unauthorized" });
    }

    const body = info.body || {};
    if (!isValidPayload(body)) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }

    return e.json(200, {
      ok: true,
      period_days: PERIOD_DAYS,
      generated_at: new Date().toISOString(),
      items: queryStoreActivity($app, cutoffIso(PERIOD_DAYS)),
    });
  } catch (_) {
    logMasterActivity("PZ_MASTER_ACTIVITY_SUMMARY_FAILED");
    return e.json(500, { ok: false, error: "summary_failed" });
  }
}

module.exports = {
  ANALYTICS_TIME_ZONE,
  buildPeriod,
  handleOrderReadonlyDetail,
  handleStoreAnalyticsDetail,
  handleStoreActivitySummary,
  publicEntityPath,
  queryLandingQr,
  queryPages,
  queryTopViewedProducts,
  queryTraffic,
  requireAuthenticatedUser,
};
