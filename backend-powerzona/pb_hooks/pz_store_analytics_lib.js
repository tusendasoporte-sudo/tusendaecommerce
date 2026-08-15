/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const masterAnalytics = typeof __hooks === "undefined"
  ? require("./pz_master_dashboard_lib.js")
  : require(`${__hooks}/pz_master_dashboard_lib.js`);

const ANALYTICS_RANGES = Object.freeze(["today", "7", "15", "30", "90"]);
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return String(value === null || value === undefined ? "" : value).trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  return body[key];
}

function bodyKeys(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function parseSummaryPayload(body) {
  const keys = bodyKeys(body).sort();
  if (keys.length !== 2 || keys[0] !== "pages_page" || keys[1] !== "range") return null;
  const range = bodyValue(body, "range");
  const pagesPage = bodyValue(body, "pages_page");
  if (typeof range !== "string" || !ANALYTICS_RANGES.includes(range)) return null;
  if (typeof pagesPage !== "number" || !Number.isInteger(pagesPage) || pagesPage < 1 || pagesPage > 100000) {
    return null;
  }
  return { range, pagesPage };
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function headerValue(info, name) {
  const lower = String(name || "").toLowerCase();
  const target = lower.replace(/-/g, "_");
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") return safeText(headers.get(name) || headers.get(lower) || headers.get(target), 80);
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase().replace(/-/g, "_") === target);
  return key ? safeText(headers[key], 80) : "";
}

function loadStoreContext(app, auth, supportStoreId) {
  const authId = recordString(auth, "id");
  if (!RECORD_ID_PATTERN.test(authId)) return null;
  const actor = findRecord(app, "users", authId);
  if (!actor) return null;
  const role = recordString(actor, "role");
  const master = role === "master_admin" && recordString(actor, "status") === "active";
  const storeId = master ? safeText(supportStoreId, 15) : relationId(actor, "store");
  if ((!master && !["store_admin", "store_staff"].includes(role))
    || recordString(actor, "status") !== "active" || !RECORD_ID_PATTERN.test(storeId)) return null;
  const store = findRecord(app, "stores", storeId);
  if (!store || (!master && recordString(store, "status") !== "active")) return null;
  if (!master && permissions.isBlockedByPlan(app, actor, store)) return null;
  return { actor, store, storeId, master };
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function safeText(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function safeSlug(value) {
  const slug = safeText(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function safeIsoDate(value) {
  const raw = safeText(value, 80);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function safeStorePublicPath(value, storeSlug) {
  const path = safeText(value, 240);
  const slug = safeSlug(storeSlug);
  if (!path || !slug || path.includes("?") || path.includes("#") || path.includes("://")) return "";
  const base = `/t/${slug}`;
  return path === base || path.startsWith(`${base}/`) ? path : "";
}

function sanitizeTraffic(traffic) {
  const metrics = traffic && traffic.metrics || {};
  const daily = Array.isArray(traffic && traffic.daily) ? traffic.daily : [];
  return {
    metrics: {
      visitors: nonNegativeInteger(metrics.visitors),
      recurrent_visitors: nonNegativeInteger(metrics.recurrent_visitors),
      pageviews: nonNegativeInteger(metrics.pageviews),
    },
    daily: daily.map((item) => ({
      day: /^\d{4}-\d{2}-\d{2}$/.test(String(item && item.day || "")) ? String(item.day) : "",
      label: safeText(item && item.label, 40),
      visitors: nonNegativeInteger(item && item.visitors),
      recurrent_visitors: nonNegativeInteger(item && item.recurrent_visitors),
      pageviews: nonNegativeInteger(item && item.pageviews),
    })),
  };
}

function sanitizeTopViewedProducts(rows, storeSlug) {
  return (Array.isArray(rows) ? rows : []).slice(0, 5).map((item) => {
    const slug = safeSlug(item && item.slug);
    return {
      name: safeText(item && item.name, 160) || "Producto no disponible",
      slug,
      active: item && item.active === true,
      views: nonNegativeInteger(item && item.views),
      public_path: slug
        ? masterAnalytics.publicEntityPath(storeSlug, "product", slug, "")
        : "",
    };
  });
}

function sanitizePage(item, storeSlug) {
  const pageType = safeText(item && item.page_type, 40).toLowerCase();
  return {
    page_type: pageType,
    name: safeText(item && item.name, 180) || "Página pública",
    detail: safeText(item && item.detail, 100),
    visits: nonNegativeInteger(item && item.visits),
    last_visited_at: safeIsoDate(item && item.last_visited_at),
    // Unknown pages originate from a raw request path. Never mirror that path
    // into the store-user analytics response.
    public_path: pageType === "other" ? "" : safeStorePublicPath(item && item.public_path, storeSlug),
  };
}

function sanitizePages(result, storeSlug) {
  const source = result || {};
  const paged = source.pages || {};
  return {
    top_pages: (Array.isArray(source.topPages) ? source.topPages : []).slice(0, 5)
      .map((item) => sanitizePage(item, storeSlug)),
    pages: {
      page: Math.max(1, nonNegativeInteger(paged.page)),
      per_page: Math.min(10, nonNegativeInteger(paged.per_page)),
      total_items: nonNegativeInteger(paged.total_items),
      total_pages: Math.max(1, nonNegativeInteger(paged.total_pages)),
      items: (Array.isArray(paged.items) ? paged.items : []).slice(0, 10)
        .map((item) => sanitizePage(item, storeSlug)),
    },
  };
}

function sanitizeLandingQr(source) {
  const landing = source || {};
  return {
    views: nonNegativeInteger(landing.views),
    clicks: nonNegativeInteger(landing.clicks),
    top_buttons: (Array.isArray(landing.top_buttons) ? landing.top_buttons : []).slice(0, 10).map((item) => ({
      link_type: safeText(item && item.link_type, 40),
      link_label: safeText(item && item.link_label, 100) || "Botón",
      clicks: nonNegativeInteger(item && item.clicks),
    })),
    daily: (Array.isArray(landing.daily) ? landing.daily : []).slice(0, 90).map((item) => ({
      day: safeText(item && item.day, 10),
      label: safeText(item && item.label, 20),
      views: nonNegativeInteger(item && item.views),
      clicks: nonNegativeInteger(item && item.clicks),
    })).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.day)),
  };
}

function buildSummary(app, context, payload, now) {
  const storeSlug = safeSlug(recordString(context.store, "slug"));
  const period = masterAnalytics.buildPeriod(payload.range, now || new Date());
  const traffic = sanitizeTraffic(masterAnalytics.queryTraffic(app, context.storeId, period));
  const products = sanitizeTopViewedProducts(
    masterAnalytics.queryTopViewedProducts(app, context.storeId, period),
    storeSlug,
  );
  const pages = sanitizePages(
    masterAnalytics.queryPages(app, context.storeId, storeSlug, period, payload.pagesPage),
    storeSlug,
  );
  const response = {
    ok: true,
    range: payload.range,
    period_days: period.periodDays,
    generated_at: (now || new Date()).toISOString(),
    time_zone: masterAnalytics.ANALYTICS_TIME_ZONE,
    metrics: traffic.metrics,
    daily: traffic.daily,
    top_viewed_products: products,
    top_pages: pages.top_pages,
    pages: pages.pages,
  };
  if (permissions.hasStorePermission(app, context.actor, context.store, "landing_qr.manage")) {
    const landingQr = masterAnalytics.queryLandingQr(app, context.storeId, period);
    response.landing_qr = sanitizeLandingQr(
      Object.assign({}, landingQr, {
        daily: masterAnalytics.queryLandingQrDaily(app, context.storeId, period),
      }),
    );
  }
  return response;
}

function handleSummary(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parseSummaryPayload(info && info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const app = e.app || $app;
    const context = loadStoreContext(app, info && info.auth, headerValue(info, "X-PZ-Support-Store"));
    if (!context) return e.json(403, { ok: false, error: "unauthorized" });
    if (!context.master && !permissions.hasStorePermission(app, context.actor, context.store, "analytics.view")) {
      return e.json(403, { ok: false, error: "permission_denied" });
    }
    return e.json(200, buildSummary(app, context, payload, new Date()));
  } catch (_) {
    return e.json(500, { ok: false, error: "analytics_failed" });
  }
}

module.exports = {
  ANALYTICS_RANGES,
  buildSummary,
  handleSummary,
  loadStoreContext,
  parseSummaryPayload,
  requireAuthenticatedUser,
  safeStorePublicPath,
  sanitizeLandingQr,
  sanitizePages,
  sanitizeTopViewedProducts,
  sanitizeTraffic,
};
