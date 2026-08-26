/// <reference path="../pb_data/types.d.ts" />

"use strict";

const analytics = typeof __hooks === "undefined"
  ? require("./pz_promo_analytics_lib.js")
  : require(`${__hooks}/pz_promo_analytics_lib.js`);
const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const domain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);
const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const shellApi = typeof __hooks === "undefined"
  ? require("./pz_promo_shell_api_lib.js")
  : require(`${__hooks}/pz_promo_shell_api_lib.js`);

const RAW_RETENTION_DAYS = 7;
const DAILY_RETENTION_DAYS = 400;
const CLEANUP_BATCH_SIZE = 200;
const CLEANUP_MAX_BATCHES = 10;
const SAFE_PRIVATE_ERRORS = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "invalid_payload", "promo_analytics_unavailable",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    if (typeof record.get === "function") return record.get(key);
    if (typeof record.getString === "function") return record.getString(key);
  } catch (_) {}
  return record[key];
}

function recordId(record) {
  return String(record && (record.id || recordValue(record, "id")) || "").trim();
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return String(value === undefined || value === null ? "" : value).trim();
}

function recordNumber(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isFinite(value) ? value : 0;
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "") : "";
  if (value && typeof value === "object") return String(value.id || "");
  return String(value || "");
}

function findExact(app, collection, filter, params) {
  const rows = Array.from(app.findRecordsByFilter(collection, filter, "id", 2, 0, params || {}) || []);
  return rows.length === 1 ? rows[0] : null;
}

function noQuery(info) {
  let query = {};
  try { query = JSON.parse(JSON.stringify(info && info.query || {})); } catch (_) { return false; }
  return query && typeof query === "object" && !Array.isArray(query) && Object.keys(query).length === 0;
}

function requestHeader(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return String(headers.get(name) || headers.get(normalized) || "").trim().slice(0, 80);
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return key ? String(headers[key] || "").trim().slice(0, 80) : "";
}

function setHeaders(e, hostScoped) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    if (hostScoped) headers.set("Vary", "Host");
  } catch (_) {}
}

function analyticsReady(app) {
  try {
    const events = app.findCollectionByNameOrId("promo_analytics_events");
    const daily = app.findCollectionByNameOrId("promo_analytics_daily");
    data.assertCollectionRulesClosed(events);
    data.assertCollectionRulesClosed(daily);
    return Boolean(events.fields.getByName("content_generation"))
      && Array.from(events.fields.getByName("event_type").values || []).includes("landing_qr_open")
      && Array.from(daily.fields.getByName("event_type").values || []).includes("landing_qr_open");
  } catch (_) { return false; }
}

function entitlementFor(app, siteId) {
  return findExact(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
}

function enabledFor(app, context) {
  const siteId = recordId(context && context.site);
  const entitlement = context && context.entitlement && relationId(context.entitlement, "site") === siteId
    ? context.entitlement : entitlementFor(app, siteId);
  return Boolean(siteId && entitlement
    && promo.resolvePromoCapabilityAccess(entitlement, "analytics_enabled").allowed);
}

function platformCollectorContext(app, publicSlug, parsed) {
  const context = shellApi.publishedPlatformContext(app, publicSlug);
  if (!context || context.source !== "platform" || context.action !== "serve" || !enabledFor(app, context)) return null;
  const shell = shellApi.resolvePlatformShell(app, publicSlug, { explicitLocale: parsed.locale });
  if (!shell || shell.route.action !== "serve" || shell.route.source !== "platform" || !shell.profile
    || shell.profile.site.public_slug !== publicSlug) return null;
  return { context, profile: shell.profile };
}

function hostCollectorContext(app, e, info, parsed) {
  const headers = shellApi.authoritativeRequestHeaders(e, info);
  const context = domain.resolveHostContext(app, headers, { trustedProxy: false });
  if (!context || context.binding_role !== "primary"
    || context.authority.hostname_ascii !== context.canonical_hostname || !enabledFor(app, context)) return null;
  const shell = shellApi.resolveHostShell(app, headers, { explicitLocale: parsed.locale });
  if (!shell || shell.route.action !== "serve" || shell.route.source !== "custom" || !shell.profile
    || shell.profile.site.public_slug !== recordString(context.site, "public_slug")) return null;
  return { context, profile: shell.profile };
}

function setRecord(record, values) {
  for (const [key, value] of Object.entries(values)) record.set(key, value);
  return record;
}

function saveEvent(app, resolved, parsed, now) {
  const context = resolved.context;
  const siteId = recordId(context.site);
  const contentGeneration = Math.trunc(Number(context.generation));
  const projected = analytics.validateAgainstProfile(parsed, resolved.profile);
  if (!siteId || !Number.isSafeInteger(contentGeneration) || contentGeneration < 1) {
    throw new Error("promo_analytics_unavailable");
  }
  const dedupeKey = `${parsed.eventType}:${parsed.eventId}`;
  const duplicate = findExact(
    app,
    "promo_analytics_events",
    "site = {:site} && dedupe_key = {:dedupe}",
    { site: siteId, dedupe: dedupeKey },
  );
  if (duplicate) return false;
  const day = analytics.utcDay(now);
  const occurredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + RAW_RETENTION_DAYS * 86400000).toISOString();
  const event = setRecord(new Record(app.findCollectionByNameOrId("promo_analytics_events"), {}), {
    site: siteId,
    revision: "",
    content_generation: contentGeneration,
    event_type: parsed.eventType,
    day,
    locale: parsed.locale,
    theme_key: projected.themeKey,
    section_key: parsed.sectionKey,
    action_type: projected.actionType,
    device_class: "unknown",
    dedupe_key: dedupeKey,
    occurred_at: occurredAt,
    expires_at: expiresAt,
  });
  data.assertPromoRecord(app, "promo_analytics_events", event, "create");
  app.save(event);

  const filter = "site = {:site} && day = {:day} && event_type = {:type} && locale = {:locale}"
    + " && theme_key = {:theme} && dimension_key = {:dimension}";
  const params = {
    site: siteId, day, type: parsed.eventType, locale: parsed.locale,
    theme: projected.themeKey, dimension: projected.dimensionKey,
  };
  const existing = findExact(app, "promo_analytics_daily", filter, params);
  const daily = existing || new Record(app.findCollectionByNameOrId("promo_analytics_daily"), {});
  setRecord(daily, {
    site: siteId,
    day,
    event_type: parsed.eventType,
    locale: parsed.locale,
    theme_key: projected.themeKey,
    dimension_key: projected.dimensionKey,
    event_count: Math.max(0, Math.trunc(recordNumber(existing, "event_count"))) + 1,
    unique_count: 0,
  });
  data.assertPromoRecord(app, "promo_analytics_daily", daily, existing ? "update" : "create");
  app.save(daily);
  return true;
}

function accepted(e) {
  return e.json(202, { ok: true, contract: analytics.ACCEPTED_CONTRACT });
}

function handleCollect(e, source) {
  const hostScoped = source === "custom";
  setHeaders(e, hostScoped);
  let info;
  let parsed;
  try {
    info = e.requestInfo();
    if (!info || !noQuery(info)) throw new analytics.PromoAnalyticsError("invalid_payload", 400);
    parsed = analytics.parseCollect(info.body || {});
  } catch (_) {
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  try {
    if (!analyticsReady(e.app)) {
      try { e.app.logger().error("Promo analytics schema unavailable.", "code", "PZ_PROMO_ANALYTICS_SCHEMA_UNAVAILABLE"); } catch (_) {}
      return accepted(e);
    }
    const publicSlug = source === "platform" ? String(e.request.pathValue("publicSlug") || "").trim() : "";
    e.app.runInTransaction((app) => {
      const resolved = source === "platform"
        ? platformCollectorContext(app, publicSlug, parsed)
        : hostCollectorContext(app, e, info, parsed);
      if (resolved) saveEvent(app, resolved, parsed, new Date());
    });
  } catch (error) {
    // Public analytics is deliberately non-oracular and never blocks navigation.
    try { e.app.logger().error("Promo analytics collection failed safely.", "code", "PZ_PROMO_ANALYTICS_COLLECTION_FAILED"); } catch (_) {}
  }
  return accepted(e);
}

function requireAuthenticatedUser(e) {
  setHeaders(e, false);
  if (!e || !e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function privateError(e, error) {
  const raw = String(error && (error.code || error.message) || "promo_analytics_unavailable");
  const code = SAFE_PRIVATE_ERRORS.has(raw) ? raw : "promo_analytics_unavailable";
  const status = error && Number.isInteger(error.status) ? error.status
    : code === "invalid_payload" ? 400
      : ["promo_not_found", "store_not_promo"].includes(code) ? 404
        : code === "promo_analytics_unavailable" ? 503 : 403;
  return e.json(status, { ok: false, error: code });
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model || {}));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return Array.from(rows || []);
}

function groupedCounts(app, siteId, bounds) {
  const params = { site: siteId, from: bounds.from, to: bounds.to };
  const where = "site = {:site} AND day >= {:from} AND day <= {:to}";
  const totals = queryRows(app, `
    SELECT event_type, COALESCE(SUM(event_count), 0) AS count
    FROM promo_analytics_daily WHERE ${where} GROUP BY event_type
  `, params, { event_type: "", count: 0 });
  const days = queryRows(app, `
    SELECT day, event_type, COALESCE(SUM(event_count), 0) AS count
    FROM promo_analytics_daily WHERE ${where} GROUP BY day, event_type ORDER BY day
  `, params, { day: "", event_type: "", count: 0 });
  const sections = queryRows(app, `
    SELECT dimension_key, COALESCE(SUM(event_count), 0) AS count
    FROM promo_analytics_daily WHERE ${where} AND event_type = 'section_view'
    GROUP BY dimension_key ORDER BY count DESC, dimension_key LIMIT 20
  `, params, { dimension_key: "", count: 0 });
  const contacts = queryRows(app, `
    SELECT dimension_key, COALESCE(SUM(event_count), 0) AS count
    FROM promo_analytics_daily WHERE ${where} AND event_type = 'contact_activate'
    GROUP BY dimension_key ORDER BY count DESC, dimension_key
  `, params, { dimension_key: "", count: 0 });
  const locales = queryRows(app, `
    SELECT locale, COALESCE(SUM(event_count), 0) AS count
    FROM promo_analytics_daily WHERE ${where} GROUP BY locale ORDER BY count DESC, locale LIMIT 10
  `, params, { locale: "", count: 0 });
  return { contacts, days, locales, sections, totals };
}

function countRows(rows, key) {
  return rows.map((row) => ({ key: recordString(row, key), count: Math.max(0, Math.trunc(recordNumber(row, "count"))) }))
    .filter((row) => row.key && row.count > 0);
}

function summaryResponse(app, siteId, rangeDays, now) {
  const bounds = analytics.rangeBounds(now, rangeDays);
  const rows = groupedCounts(app, siteId, bounds);
  const totals = analytics.emptyCounts();
  rows.totals.forEach((row) => analytics.addCount(totals, recordString(row, "event_type"), recordNumber(row, "count")));
  const byDay = new Map();
  for (let cursor = new Date(`${bounds.from}T00:00:00.000Z`); analytics.utcDay(cursor) <= bounds.to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = analytics.utcDay(cursor);
    byDay.set(day, { day, ...analytics.emptyCounts() });
  }
  rows.days.forEach((row) => {
    const item = byDay.get(recordString(row, "day"));
    if (item) analytics.addCount(item, recordString(row, "event_type"), recordNumber(row, "count"));
  });
  return {
    ok: true,
    contract: analytics.SUMMARY_CONTRACT,
    range: { days: rangeDays, from: bounds.from, to: bounds.to },
    totals,
    by_day: Array.from(byDay.values()),
    sections: countRows(rows.sections, "dimension_key"),
    contact_actions: countRows(rows.contacts, "dimension_key"),
    locales: countRows(rows.locales, "locale"),
    privacy: { unique_visitors_measured: false, raw_event_retention_days: RAW_RETENTION_DAYS },
  };
}

function handleSummary(e) {
  setHeaders(e, false);
  try {
    if (!analyticsReady(e.app)) throw new analytics.PromoAnalyticsError("promo_analytics_unavailable", 503);
    const info = e.requestInfo();
    if (!info || !noQuery(info) || !e.auth) throw new analytics.PromoAnalyticsError("invalid_payload", 400);
    const parsed = analytics.parseSummary(info.body || {});
    const decision = promo.requirePromoAction(e.app, e.auth, "promo.analytics.view", {
      requestedStoreId: requestHeader(info, "X-PZ-Promo-Store"),
    });
    return e.json(200, summaryResponse(e.app, recordId(decision.site), parsed.rangeDays, new Date()));
  } catch (error) { return privateError(e, error); }
}

function cleanupExpiredAnalytics(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error("promo_analytics_cleanup_invalid_time");
  let removedRaw = 0;
  let removedDaily = 0;
  for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch += 1) {
    const records = Array.from(app.findRecordsByFilter(
      "promo_analytics_events", "expires_at <= {:now}", "expires_at,id",
      CLEANUP_BATCH_SIZE, 0, { now: now.toISOString() },
    ) || []);
    records.forEach((record) => app.delete(record));
    removedRaw += records.length;
    if (records.length < CLEANUP_BATCH_SIZE) break;
  }
  const cutoff = new Date(now.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - DAILY_RETENTION_DAYS + 1);
  for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch += 1) {
    const records = Array.from(app.findRecordsByFilter(
      "promo_analytics_daily", "day < {:cutoff}", "day,id",
      CLEANUP_BATCH_SIZE, 0, { cutoff: analytics.utcDay(cutoff) },
    ) || []);
    records.forEach((record) => app.delete(record));
    removedDaily += records.length;
    if (records.length < CLEANUP_BATCH_SIZE) break;
  }
  return { removedRaw, removedDaily };
}

module.exports = {
  CLEANUP_BATCH_SIZE,
  DAILY_RETENTION_DAYS,
  RAW_RETENTION_DAYS,
  analyticsReady,
  cleanupExpiredAnalytics,
  groupedCounts,
  handleCollect,
  handleSummary,
  hostCollectorContext,
  platformCollectorContext,
  requireAuthenticatedUser,
  saveEvent,
  summaryResponse,
};
