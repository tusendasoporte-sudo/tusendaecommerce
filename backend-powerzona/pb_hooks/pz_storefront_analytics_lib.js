/// <reference path="../pb_data/types.d.ts" />

"use strict";

const schema = typeof __hooks === "undefined"
  ? require("./pz_storefront_push_schema_lib.js")
  : require(`${__hooks}/pz_storefront_push_schema_lib.js`);
const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const storeAnalytics = typeof __hooks === "undefined"
  ? require("./pz_store_analytics_lib.js")
  : require(`${__hooks}/pz_store_analytics_lib.js`);
const masterDashboard = typeof __hooks === "undefined"
  ? require("./pz_master_dashboard_lib.js")
  : require(`${__hooks}/pz_master_dashboard_lib.js`);
const activity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const installationSecurity = typeof __hooks === "undefined"
  ? require("./pz_storefront_installations_lib.js")
  : require(`${__hooks}/pz_storefront_installations_lib.js`);
const appDownloadAnalytics = typeof __hooks === "undefined"
  ? require("./pz_storefront_app_download_analytics_lib.js")
  : require(`${__hooks}/pz_storefront_app_download_analytics_lib.js`);
const manualCoupons = typeof __hooks === "undefined"
  ? require("./pz_manual_coupons_lib.js")
  : require(`${__hooks}/pz_manual_coupons_lib.js`);

const EVENTS_COLLECTION = "push_events";
const DELIVERIES_COLLECTION = "push_campaign_deliveries";
const CAMPAIGNS_COLLECTION = "push_campaigns";
const INSTALLATIONS_COLLECTION = "storefront_installations";
const APP_CONFIGS_COLLECTION = "storefront_app_configs";
const DAILY_COLLECTION = "push_daily_stats";
const ORDER_LINKS_COLLECTION = "storefront_order_links";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const STOREFRONT_PATH_PATTERN = /^\/t\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*)?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%\/?-]*)?$/;
const EVENT_TYPES = Object.freeze(["opened", "destination_viewed"]);
const ANALYTICS_RANGES = Object.freeze({ today: 1, "7": 7, "15": 15, "30": 30, "90": 90 });
const ATTRIBUTION_WINDOW_MS = schema.RETENTION_POLICY.attribution_days * 86_400_000;
const RAW_RETENTION_DAYS = schema.RETENTION_POLICY.event_days;
const ACTIVE_INSTALLATION_WINDOW_DAYS = 30;
const INSTALLATION_DETAILS_PAGE_SIZE = 10;

class StorefrontAnalyticsError extends Error {
  constructor(code) {
    super(code);
    this.name = "StorefrontAnalyticsError";
    this.code = code;
  }
}

function safeText(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max || 500);
}

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
  return safeText(recordValue(record, key), 4096);
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordId(record) {
  return safeText(record && record.id || recordString(record, "id"), 15);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return safeText(value[0], 15);
  if (value && typeof value === "object") return safeText(value.id, 15);
  return safeText(value, 15);
}

function parsedDate(value) {
  const date = new Date(String(value || "").trim());
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : parsedDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function findRecordsStrict(app, collection, filter, sort, limit, offset, params) {
  return Array.from(app.findRecordsByFilter(
    collection,
    filter || "",
    sort || "id",
    Math.max(1, Math.min(Number(limit) || 200, 500)),
    Math.max(0, Number(offset) || 0),
    params || {},
  ) || []);
}

function findRecords(app, collection, filter, sort, limit, offset, params) {
  try { return findRecordsStrict(app, collection, filter, sort, limit, offset, params); }
  catch (_) { return []; }
}

function queryRows(app, sql, bindings, defaults) {
  try {
    const rows = typeof arrayOf === "function" && typeof DynamicModel !== "undefined"
      ? arrayOf(new DynamicModel(defaults || {}))
      : [];
    app.db().newQuery(sql).bind(bindings || {}).all(rows);
    return Array.from(rows || []);
  } catch (_) { return []; }
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function hasAmbiguousStorefrontPath(value) {
  const queryIndex = value.indexOf("?");
  const path = queryIndex < 0 ? value : value.slice(0, queryIndex);
  const lower = path.toLowerCase();
  return path.includes("\\")
    || lower.includes("%2f")
    || lower.includes("%5c")
    || path.includes("/../")
    || path.endsWith("/..")
    || path.includes("/./")
    || path.endsWith("/.");
}

function canonicalPath(value) {
  const raw = safeText(value, 500);
  if (!raw || raw.includes("://") || raw.startsWith("//") || !raw.startsWith("/t/")
    || raw.includes("#") || !STOREFRONT_PATH_PATTERN.test(raw)
    || hasAmbiguousStorefrontPath(raw)) return "";
  const queryIndex = raw.indexOf("?");
  const pathname = queryIndex < 0 ? raw : raw.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : raw.slice(queryIndex + 1);
  const canonical = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return query ? `${canonical}?${query}` : canonical;
}

function canonicalDestinationPath(value) {
  const raw = safeText(value, 500);
  const storefront = canonicalPath(raw);
  if (storefront) return storefront;
  if (!/^\/orden\/[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{6,80}$/.test(raw)) return "";
  return raw;
}

function expectedCampaignPath(app, campaign, installationId, storeId) {
  const direct = canonicalPath(recordString(campaign, "target_path"));
  if (recordString(campaign, "target_type") !== "order") return direct;
  const orderId = relationId(campaign, "target_order");
  const link = orderId ? findFirst(
    app,
    ORDER_LINKS_COLLECTION,
    'store = {:store} && installation = {:installation} && order = {:order} && status = "active"',
    { store: storeId, installation: installationId, order: orderId },
  ) : null;
  const order = orderId ? findRecord(app, "orders", orderId) : null;
  const number = recordString(order, "order_number");
  const token = recordString(order, "receipt_token");
  if (!link || relationId(order, "store") !== storeId
    || !/^[A-Za-z0-9_-]{1,80}$/.test(number)
    || !/^[A-Za-z0-9_-]{6,80}$/.test(token)) return "";
  return canonicalDestinationPath(`/orden/${number}/${token}`);
}

function deterministicEventKey(eventType, deliveryId) {
  return `${eventType}:${deliveryId}`;
}

function recordNativeEvent(app, resolved, payload, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const eventType = safeText(payload && payload.eventType, 30);
  const deliveryId = safeText(payload && payload.deliveryId, 15);
  const idempotencyKey = safeText(payload && payload.idempotencyKey, 128);
  const installation = resolved && resolved.installation;
  const installationId = recordId(installation);
  const storeId = resolved && safeText(resolved.storeId, 15);
  if (!EVENT_TYPES.includes(eventType) || !RECORD_ID_PATTERN.test(deliveryId)
    || !RECORD_ID_PATTERN.test(installationId) || !RECORD_ID_PATTERN.test(storeId)
    || idempotencyKey !== deterministicEventKey(eventType, deliveryId)) {
    throw new StorefrontAnalyticsError("invalid_payload");
  }

  const existing = findFirst(
    app,
    EVENTS_COLLECTION,
    "installation = {:installation} && idempotency_key = {:key}",
    { installation: installationId, key: idempotencyKey },
  );
  if (existing) {
    return Object.freeze({ ok: true, event_type: eventType, recorded_at: recordString(existing, "received_at"), duplicate: true });
  }

  const delivery = findRecord(app, DELIVERIES_COLLECTION, deliveryId);
  if (!delivery || relationId(delivery, "store") !== storeId
    || relationId(delivery, "installation") !== installationId
    || recordString(delivery, "status") !== "accepted") {
    throw new StorefrontAnalyticsError("delivery_not_eligible");
  }
  const acceptedAt = parsedDate(recordValue(delivery, "accepted_at"));
  if (!acceptedAt || now.getTime() < acceptedAt.getTime()
    || now.getTime() >= acceptedAt.getTime() + ATTRIBUTION_WINDOW_MS) {
    throw new StorefrontAnalyticsError("event_window_expired");
  }
  const campaignId = relationId(delivery, "campaign");
  const campaign = findRecord(app, CAMPAIGNS_COLLECTION, campaignId);
  if (!campaign || relationId(campaign, "store") !== storeId) {
    throw new StorefrontAnalyticsError("delivery_not_eligible");
  }
  let verifiedCouponId = "";
  if (eventType === "destination_viewed") {
    const opened = findFirst(
      app,
      EVENTS_COLLECTION,
      'delivery = {:delivery} && installation = {:installation} && event_type = "opened"',
      { delivery: deliveryId, installation: installationId },
    );
    const expectedPath = expectedCampaignPath(app, campaign, installationId, storeId);
    const reportedPath = recordString(campaign, "target_type") === "order"
      && payload.targetPath === "__order_verified__"
      ? expectedPath
      : canonicalDestinationPath(payload.targetPath);
    if (!opened || !expectedPath || reportedPath !== expectedPath) {
      throw new StorefrontAnalyticsError("destination_not_verified");
    }
    verifiedCouponId = relationId(campaign, "target_coupon");
  }

  const clientOccurredAt = parsedDate(payload.clientOccurredAt);
  const event = new Record(app.findCollectionByNameOrId(EVENTS_COLLECTION), {});
  event.set("store", storeId);
  event.set("campaign", campaignId);
  event.set("delivery", deliveryId);
  event.set("installation", installationId);
  event.set("event_type", eventType);
  event.set("idempotency_key", idempotencyKey);
  event.set("occurred_at", now.toISOString());
  event.set("received_at", now.toISOString());
  event.set("schema_version", "1");
  event.set("metadata_json", clientOccurredAt ? { client_occurred_at: clientOccurredAt.toISOString() } : {});
  event.set("coupon", verifiedCouponId);
  event.set("delete_after", addDays(now, RAW_RETENTION_DAYS));
  schema.assertTenantIsolation(app, EVENTS_COLLECTION, event);
  try { app.save(event); }
  catch (error) {
    const duplicate = findFirst(
      app,
      EVENTS_COLLECTION,
      "installation = {:installation} && idempotency_key = {:key}",
      { installation: installationId, key: idempotencyKey },
    );
    if (duplicate) {
      return Object.freeze({ ok: true, event_type: eventType, recorded_at: recordString(duplicate, "received_at"), duplicate: true });
    }
    throw error;
  }
  upsertCampaignDailyStats(app, campaignId, now);
  return Object.freeze({ ok: true, event_type: eventType, recorded_at: now.toISOString(), duplicate: false });
}

function latestEvent(app, filter, params, now) {
  const event = findRecords(app, EVENTS_COLLECTION, filter, "-received_at,-id", 1, 0, params)[0] || null;
  const receivedAt = event ? parsedDate(recordValue(event, "received_at")) : null;
  if (!event || !receivedAt || receivedAt.getTime() > now.getTime()
    || receivedAt.getTime() + ATTRIBUTION_WINDOW_MS <= now.getTime()) return null;
  return event;
}

function activeCouponByCode(app, storeId, codeValue, now) {
  const code = manualCoupons.normalizeCouponCode(codeValue);
  if (!manualCoupons.validCouponCode(code)) return null;
  const coupon = findFirst(
    app,
    "manual_coupons",
    "store = {:store} && code = {:code}",
    { store: storeId, code },
  );
  if (!coupon || recordValue(coupon, "active") === false) return null;
  const startsAt = parsedDate(recordValue(coupon, "starts_at"));
  const endsAt = parsedDate(recordValue(coupon, "ends_at"));
  if ((startsAt && startsAt.getTime() > now.getTime())
    || (endsAt && endsAt.getTime() <= now.getTime())) return null;
  const unlimited = recordBool(coupon, "unlimited_uses");
  const maximum = Number(recordValue(coupon, "max_uses") || 0);
  const used = Number(recordValue(coupon, "used_count") || 0);
  if (!unlimited && maximum > 0 && used >= maximum) return null;
  return coupon;
}

function createAttributedEvent(app, values, now) {
  const event = new Record(app.findCollectionByNameOrId(EVENTS_COLLECTION), {});
  event.set("store", values.storeId);
  event.set("campaign", values.campaignId);
  event.set("delivery", values.deliveryId);
  event.set("installation", values.installationId);
  event.set("event_type", values.eventType);
  event.set("idempotency_key", values.idempotencyKey);
  event.set("occurred_at", now.toISOString());
  event.set("received_at", now.toISOString());
  event.set("schema_version", "1");
  event.set("metadata_json", {});
  event.set("coupon", values.couponId || "");
  event.set("order", values.orderId || "");
  event.set("delete_after", addDays(now, RAW_RETENTION_DAYS));
  schema.assertTenantIsolation(app, EVENTS_COLLECTION, event);
  app.save(event);
  return event;
}

function recordCouponApplied(app, sessionContext, storeIdValue, couponCode, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const storeId = safeText(storeIdValue, 15);
  const installationId = recordId(sessionContext && sessionContext.installation);
  if (!sessionContext || sessionContext.storeId !== storeId
    || !RECORD_ID_PATTERN.test(storeId) || !RECORD_ID_PATTERN.test(installationId)) return null;
  const coupon = activeCouponByCode(app, storeId, couponCode, now);
  if (!coupon) return null;
  const couponId = recordId(coupon);
  const touch = latestEvent(
    app,
    'store = {:store} && installation = {:installation} && event_type = "destination_viewed" && coupon = {:coupon}',
    { store: storeId, installation: installationId, coupon: couponId },
    now,
  );
  if (!touch) return null;
  const campaignId = relationId(touch, "campaign");
  const deliveryId = relationId(touch, "delivery");
  const existing = findFirst(
    app,
    EVENTS_COLLECTION,
    'campaign = {:campaign} && installation = {:installation} && coupon = {:coupon} && event_type = "coupon_applied"',
    { campaign: campaignId, installation: installationId, coupon: couponId },
  );
  if (existing) return existing;
  const event = createAttributedEvent(app, {
    storeId, campaignId, deliveryId, installationId, couponId,
    eventType: "coupon_applied",
    idempotencyKey: `coupon:${campaignId}:${couponId}`,
  }, now);
  upsertCampaignDailyStats(app, campaignId, now);
  return event;
}

function attributeOrder(app, sessionContext, order, plan, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const orderId = recordId(order);
  const storeId = relationId(order, "store");
  const installationId = recordId(sessionContext && sessionContext.installation);
  if (!sessionContext || sessionContext.storeId !== storeId
    || !RECORD_ID_PATTERN.test(orderId) || !RECORD_ID_PATTERN.test(installationId)) return null;
  const existing = findFirst(
    app,
    ORDER_LINKS_COLLECTION,
    'order = {:order} && attribution_source != "" && attribution_source != "none"',
    { order: orderId },
  );
  if (existing) return existing;

  const couponId = recordId(plan && plan.couponRecord);
  let source = "destination_viewed";
  let touch = null;
  if (couponId) {
    touch = latestEvent(
      app,
      'store = {:store} && installation = {:installation} && coupon = {:coupon} && event_type = "coupon_applied"',
      { store: storeId, installation: installationId, coupon: couponId },
      now,
    );
    if (touch) source = "coupon";
  }
  if (!touch) {
    touch = latestEvent(
      app,
      'store = {:store} && installation = {:installation} && event_type = "destination_viewed"',
      { store: storeId, installation: installationId },
      now,
    );
  }
  if (!touch) return null;
  const touchAt = parsedDate(recordValue(touch, "received_at"));
  const campaignId = relationId(touch, "campaign");
  const deliveryId = relationId(touch, "delivery");
  if (!touchAt || !RECORD_ID_PATTERN.test(campaignId) || !RECORD_ID_PATTERN.test(deliveryId)) return null;

  const existingLink = findFirst(
    app,
    ORDER_LINKS_COLLECTION,
    "order = {:order} && installation = {:installation}",
    { order: orderId, installation: installationId },
  );
  const link = existingLink || new Record(app.findCollectionByNameOrId(ORDER_LINKS_COLLECTION), {});
  link.set("store", storeId);
  link.set("installation", installationId);
  link.set("order", orderId);
  if (!existingLink) link.set("status", "active");
  link.set("attribution_expires_at", addDays(touchAt, schema.RETENTION_POLICY.attribution_days));
  link.set("campaign_id_snapshot", campaignId);
  link.set("delivery_id_snapshot", deliveryId);
  link.set("coupon_id_snapshot", source === "coupon" ? couponId : "");
  link.set("attribution_source", source);
  link.set("touch_at", touchAt.toISOString());
  link.set("attributed_at", now.toISOString());
  schema.assertTenantIsolation(app, ORDER_LINKS_COLLECTION, link);
  try { app.save(link); }
  catch (error) {
    const duplicate = findFirst(
      app,
      ORDER_LINKS_COLLECTION,
      'order = {:order} && attribution_source != "" && attribution_source != "none"',
      { order: orderId },
    );
    if (duplicate) return duplicate;
    throw error;
  }
  createAttributedEvent(app, {
    storeId, campaignId, deliveryId, installationId, orderId,
    couponId: source === "coupon" ? couponId : "",
    eventType: "order_attributed",
    idempotencyKey: `order:${orderId}`,
  }, now);
  upsertCampaignDailyStats(app, campaignId, now);
  return link;
}

function periodForRange(range, nowValue) {
  const days = ANALYTICS_RANGES[range];
  if (!days) throw new StorefrontAnalyticsError("invalid_payload");
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const shared = masterDashboard.buildPeriod(range, now);
  return {
    range,
    days,
    start: new Date(shared.startIso),
    end: now,
    dayWindows: shared.days.map((day) => ({
      day: day.day,
      start: new Date(day.startIso).getTime(),
      end: new Date(day.endIso).getTime(),
    })),
  };
}

function dayInPeriod(value, period) {
  const date = parsedDate(value);
  if (!date) return "";
  const timestamp = date.getTime();
  let low = 0;
  let high = period.dayWindows.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const current = period.dayWindows[middle];
    if (timestamp < current.start) high = middle - 1;
    else if (timestamp >= current.end) low = middle + 1;
    else return current.day;
  }
  return "";
}

function installationRows(app, storeId) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(app, INSTALLATIONS_COLLECTION, "store = {:store}", "id", 500, offset, { store: storeId });
    all.push(...page);
    if (page.length < 500) return all;
  }
}

function groupedValues(rows, field, predicate) {
  const counts = {};
  rows.filter(predicate || (() => true)).forEach((row) => {
    const value = recordString(row, field) || "Sin dato";
    counts[value] = (counts[value] || 0) + 1;
  });
  const items = Object.keys(counts).map((label) => ({ label: safeText(label, 120), count: counts[label] }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 20);
  return items;
}

function activeInstallationBounds(nowValue) {
  const end = nowValue instanceof Date ? new Date(nowValue.getTime()) : new Date(nowValue || Date.now());
  return {
    end,
    cutoff: new Date(end.getTime() - ACTIVE_INSTALLATION_WINDOW_DAYS * 86_400_000),
  };
}

function activeInstallationFilter() {
  return 'store = {:store} && status = "active" && last_seen_at >= {:cutoff} && last_seen_at <= {:end}';
}

function activeInstallationParams(storeId, bounds) {
  return { store: storeId, cutoff: bounds.cutoff.toISOString(), end: bounds.end.toISOString() };
}

function activeInstallationCount(app, storeId, bounds) {
  const counted = queryRows(app, `
    SELECT COUNT(*) AS total
    FROM storefront_installations
    WHERE store = {:store}
      AND status = 'active'
      AND last_seen_at >= {:cutoff}
      AND last_seen_at <= {:end}
  `, activeInstallationParams(storeId, bounds), { total: 0 });
  if (counted.length) return nonNegativeInteger(counted[0].total);
  let total = 0;
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(
      app,
      INSTALLATIONS_COLLECTION,
      activeInstallationFilter(),
      "id",
      500,
      offset,
      activeInstallationParams(storeId, bounds),
    );
    total += page.length;
    if (page.length < 500) return total;
  }
}

function buildInstallationDetails(app, context, pagination, nowValue, options) {
  const requestedPage = Number(pagination && pagination.page);
  const perPage = Number(pagination && pagination.perPage);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1
    || perPage !== INSTALLATION_DETAILS_PAGE_SIZE) {
    throw new StorefrontAnalyticsError("invalid_payload");
  }
  const bounds = activeInstallationBounds(nowValue);
  const totalItems = activeInstallationCount(app, context.storeId, bounds);
  const totalPages = Math.max(1, Math.ceil(totalItems / INSTALLATION_DETAILS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rows = totalItems ? findRecordsStrict(
    app,
    INSTALLATIONS_COLLECTION,
    activeInstallationFilter(),
    "-last_seen_at,-id",
    INSTALLATION_DETAILS_PAGE_SIZE,
    (page - 1) * INSTALLATION_DETAILS_PAGE_SIZE,
    activeInstallationParams(context.storeId, bounds),
  ) : [];
  const appConfigs = new Map();
  const referenceFor = options && typeof options.referenceFor === "function"
    ? options.referenceFor
    : (storeId, installationId) => installationSecurity.installationAdminReference(storeId, installationId);
  const items = rows.map((row) => {
    const appConfigId = relationId(row, "app_config");
    if (!appConfigs.has(appConfigId)) appConfigs.set(appConfigId, findRecord(app, APP_CONFIGS_COLLECTION, appConfigId));
    const appConfig = appConfigs.get(appConfigId);
    if (!appConfig || relationId(appConfig, "store") !== context.storeId) {
      throw new StorefrontAnalyticsError("analytics_failed");
    }
    return {
      installation_code: referenceFor(context.storeId, recordId(row)),
      device_model: recordString(row, "device_model") || "Modelo no informado",
      app_version: recordString(row, "app_version") || "Sin dato",
      android_version: recordString(row, "android_version") || "Sin dato",
    };
  });
  return {
    ok: true,
    page,
    per_page: INSTALLATION_DETAILS_PAGE_SIZE,
    total_items: totalItems,
    total_pages: totalPages,
    active_estimate_window_days: ACTIVE_INSTALLATION_WINDOW_DAYS,
    generated_at: bounds.end.toISOString(),
    items,
  };
}

function buildInstallationAnalytics(app, context, range, nowValue) {
  const period = periodForRange(range, nowValue);
  const rows = installationRows(app, context.storeId);
  const inPeriod = (value) => {
    const date = parsedDate(value);
    return Boolean(date && date.getTime() >= period.start.getTime() && date.getTime() <= period.end.getTime());
  };
  const activeCutoff = period.end.getTime() - ACTIVE_INSTALLATION_WINDOW_DAYS * 86_400_000;
  const currentActive = rows.filter((row) => {
    if (recordString(row, "status") !== "active") return false;
    const lastSeen = parsedDate(recordValue(row, "last_seen_at"));
    return Boolean(lastSeen && lastSeen.getTime() >= activeCutoff && lastSeen.getTime() <= period.end.getTime());
  });
  const fresh = currentActive.filter((row) => inPeriod(recordValue(row, "first_seen_at")));
  const disabled = rows.filter((row) => inPeriod(recordValue(row, "disabled_at")));
  const statusCounts = { active: 0, disabled: 0, invalid: 0, revoked: 0 };
  const permissionCounts = { granted: 0, denied: 0, unknown: 0 };
  rows.forEach((row) => {
    const status = recordString(row, "status");
    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) statusCounts[status] += 1;
  });
  statusCounts.active = currentActive.length;
  currentActive.forEach((row) => {
    const permission = recordString(row, "notification_permission");
    if (Object.prototype.hasOwnProperty.call(permissionCounts, permission)) permissionCounts[permission] += 1;
  });
  const daily = {};
  const ensureDay = (day) => {
    if (!daily[day]) daily[day] = { day, new_installations: 0, bajas_detectadas: 0 };
    return daily[day];
  };
  period.dayWindows.forEach((item) => ensureDay(item.day));
  fresh.forEach((row) => {
    const day = dayInPeriod(recordValue(row, "first_seen_at"), period);
    if (day) ensureDay(day).new_installations += 1;
  });
  disabled.forEach((row) => {
    const day = dayInPeriod(recordValue(row, "disabled_at"), period);
    if (day) ensureDay(day).bajas_detectadas += 1;
  });
  const appDelivery = appDownloadAnalytics.buildDownloadAnalytics(app, context.storeId, {
    includeMaster: false,
    now: period.end,
    periodStart: period.start,
    periodEnd: period.end,
  });
  return {
    ok: true,
    range: period.range,
    period_days: period.days,
    active_estimate_window_days: ACTIVE_INSTALLATION_WINDOW_DAYS,
    generated_at: period.end.toISOString(),
    time_zone: masterDashboard.ANALYTICS_TIME_ZONE,
    metrics: {
      instalaciones_vigentes_ahora: currentActive.length,
      instalaciones_nuevas: fresh.length,
      bajas_detectadas: disabled.length,
    },
    status: statusCounts,
    permission: permissionCounts,
    daily: Object.values(daily).sort((left, right) => left.day.localeCompare(right.day)),
    distributions: {
      app_versions: groupedValues(currentActive, "app_version"),
      android_versions: groupedValues(currentActive, "android_version"),
      device_models: groupedValues(currentActive, "device_model"),
    },
    app_delivery: appDelivery,
    measurement_note: `Estimación basada en instalaciones vigentes con actividad durante los últimos ${ACTIVE_INSTALLATION_WINDOW_DAYS} días. Las bajas son detecciones técnicas, no desinstalaciones confirmadas.`,
  };
}

function deliveryStatusCounts(app, campaignId) {
  const counts = {
    pending: 0, claimed: 0, accepted: 0, failed_transient: 0,
    failed_permanent: 0, invalid_fid: 0, unknown: 0, canceled: 0,
  };
  const rows = queryRows(app, `
    SELECT status, COUNT(*) AS total
    FROM push_campaign_deliveries
    WHERE campaign = {:campaign}
    GROUP BY status
  `, { campaign: campaignId }, { status: "", total: 0 });
  if (rows.length) {
    rows.forEach((row) => {
      const status = safeText(row.status, 30);
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] = nonNegativeInteger(row.total);
    });
    return counts;
  }
  for (const status of Object.keys(counts)) {
    for (let offset = 0; ; offset += 500) {
      const page = findRecordsStrict(
        app,
        DELIVERIES_COLLECTION,
        "campaign = {:campaign} && status = {:status}",
        "id",
        500,
        offset,
        { campaign: campaignId, status },
      );
      counts[status] += page.length;
      if (page.length < 500) break;
    }
  }
  return counts;
}

function eventInstallations(app, campaignId) {
  const result = { opened: new Set(), destination_viewed: new Set(), coupon_applied: new Set(), order_attributed: new Set() };
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(app, EVENTS_COLLECTION, "campaign = {:campaign}", "id", 500, offset, { campaign: campaignId });
    page.forEach((event) => {
      const type = recordString(event, "event_type");
      if (result[type]) result[type].add(relationId(event, "installation"));
    });
    if (page.length < 500) return result;
  }
}

function campaignMetrics(app, campaignId, storeId) {
  const campaign = findRecord(app, CAMPAIGNS_COLLECTION, campaignId);
  if (!campaign || (storeId && relationId(campaign, "store") !== storeId)) {
    throw new StorefrontAnalyticsError("campaign_not_found");
  }
  const counts = deliveryStatusCounts(app, campaignId);
  const events = eventInstallations(app, campaignId);
  const selected = Object.values(counts).reduce((sum, value) => sum + nonNegativeInteger(value), 0);
  const orderLinks = [];
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(
      app,
      ORDER_LINKS_COLLECTION,
      "store = {:store} && campaign_id_snapshot = {:campaign}",
      "id",
      500,
      offset,
      { store: relationId(campaign, "store"), campaign: campaignId },
    );
    orderLinks.push(...page);
    if (page.length < 500) break;
  }
  let canceledOrders = 0;
  const buyerInstallations = new Set();
  orderLinks.forEach((link) => {
    buyerInstallations.add(relationId(link, "installation"));
    const order = findRecord(app, "orders", relationId(link, "order"));
    if (recordString(order, "status") === "cancelled") canceledOrders += 1;
  });
  const couponCampaign = Boolean(relationId(campaign, "target_coupon"));
  return {
    selected,
    accepted: counts.accepted,
    failed_confirmed: counts.failed_permanent + counts.invalid_fid,
    failed_permanent: counts.failed_permanent,
    invalid_fid: counts.invalid_fid,
    unknown: counts.unknown,
    canceled: counts.canceled,
    retrying: counts.failed_transient,
    pending: counts.pending,
    claimed: counts.claimed,
    opened: events.opened.size,
    destination_viewed: events.destination_viewed.size,
    coupon_applied: events.coupon_applied.size,
    coupon_applicable: couponCampaign,
    orders_attributed: orderLinks.length,
    buyer_installations: buyerInstallations.size,
    orders_vigentes: Math.max(0, orderLinks.length - canceledOrders),
    orders_canceled: canceledOrders,
    denominators: {
      acceptance: selected,
      failures: selected,
      opened: counts.accepted,
      destination_viewed: events.opened.size,
      coupon_applied: couponCampaign ? events.destination_viewed.size : null,
      conversion: events.destination_viewed.size,
    },
    measurement_note: "Firebase aceptado no equivale a entregado, mostrado ni leído. Las métricas cuentan instalaciones, salvo las órdenes indicadas explícitamente.",
  };
}

function dayKey(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return masterDashboard.buildPeriod("today", date).days[0].day;
}

function setNumericFields(record, values) {
  Object.keys(values).forEach((key) => record.set(key, nonNegativeInteger(values[key])));
}

function upsertCampaignDailyStats(app, campaignId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const campaign = findRecord(app, CAMPAIGNS_COLLECTION, campaignId);
  if (!campaign) return null;
  const storeId = relationId(campaign, "store");
  const key = dayKey(now);
  let record = findFirst(
    app,
    DAILY_COLLECTION,
    'store = {:store} && scope = "campaign_funnel" && scope_key = {:scopeKey} && day_key = {:day}',
    { store: storeId, scopeKey: campaignId, day: key },
  );
  if (!record) record = new Record(app.findCollectionByNameOrId(DAILY_COLLECTION), {});
  const metrics = campaignMetrics(app, campaignId, storeId);
  record.set("store", storeId);
  record.set("campaign", campaignId);
  record.set("scope", "campaign_funnel");
  record.set("scope_key", campaignId);
  record.set("day_key", key);
  setNumericFields(record, {
    selected: metrics.selected,
    accepted: metrics.accepted,
    failed_permanent: metrics.failed_permanent,
    invalid_fid: metrics.invalid_fid,
    unknown: metrics.unknown,
    canceled: metrics.canceled,
    retrying: metrics.retrying,
    opened: metrics.opened,
    destination_viewed: metrics.destination_viewed,
    coupon_applied: metrics.coupon_applied,
    orders_attributed: metrics.orders_attributed,
    buyer_installations: metrics.buyer_installations,
    orders_vigentes: metrics.orders_vigentes,
    orders_canceled: metrics.orders_canceled,
  });
  record.set("delete_after", addDays(now, schema.RETENTION_POLICY.daily_aggregate_days));
  schema.assertTenantIsolation(app, DAILY_COLLECTION, record);
  app.save(record);
  return record;
}

function upsertStoreDailyStats(app, storeId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const store = findRecord(app, "stores", storeId);
  if (!store) return null;
  const context = { storeId, store, actor: null, master: false };
  const analytics = buildInstallationAnalytics(app, context, "today", now);
  const key = dayKey(now);
  let record = findFirst(
    app,
    DAILY_COLLECTION,
    'store = {:store} && scope = "store_installations" && scope_key = "store" && day_key = {:day}',
    { store: storeId, day: key },
  );
  if (!record) record = new Record(app.findCollectionByNameOrId(DAILY_COLLECTION), {});
  record.set("store", storeId);
  record.set("campaign", "");
  record.set("scope", "store_installations");
  record.set("scope_key", "store");
  record.set("day_key", key);
  setNumericFields(record, {
    installations_vigentes: analytics.metrics.instalaciones_vigentes_ahora,
    installations_new: analytics.metrics.instalaciones_nuevas,
    installations_disabled: analytics.metrics.bajas_detectadas,
    installations_invalid: analytics.status.invalid,
    permission_granted: analytics.permission.granted,
    permission_denied: analytics.permission.denied,
    permission_unknown: analytics.permission.unknown,
  });
  record.set("delete_after", addDays(now, schema.RETENTION_POLICY.daily_aggregate_days));
  schema.assertTenantIsolation(app, DAILY_COLLECTION, record);
  app.save(record);
  return record;
}

function refreshAllStoreDailyStats(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  let updated = 0;
  for (let offset = 0; ; offset += 200) {
    const stores = findRecordsStrict(app, "stores", "", "id", 200, offset, {});
    stores.forEach((store) => {
      if (upsertStoreDailyStats(app, recordId(store), now)) updated += 1;
    });
    if (stores.length < 200) return { updated };
  }
}

function deleteDueRecords(app, collection, now) {
  let deleted = 0;
  for (;;) {
    const records = findRecordsStrict(
      app,
      collection,
      'delete_after != "" && delete_after <= {:now}',
      "delete_after,id",
      500,
      0,
      { now: now.toISOString() },
    );
    if (!records.length) return deleted;
    records.forEach((record) => { app.delete(record); deleted += 1; });
  }
}

function cleanupExpiredAnalytics(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  return {
    events: deleteDueRecords(app, EVENTS_COLLECTION, now),
    deliveries: deleteDueRecords(app, DELIVERIES_COLLECTION, now),
    daily_stats: deleteDueRecords(app, DAILY_COLLECTION, now),
  };
}

function headerValue(info, name) {
  const headers = info && info.headers || {};
  const target = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") return safeText(headers.get(name) || headers.get(target), 80);
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase().replace(/-/g, "_") === target);
  return key ? safeText(headers[key], 80) : "";
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function parseAdminPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).filter((key) => typeof body[key] !== "function");
  if (keys.length !== 1 || keys[0] !== "range") return null;
  const range = safeText(recordValue(body, "range"), 10);
  return ANALYTICS_RANGES[range] ? { range } : null;
}

function parseInstallationDetailsPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  if (keys.length !== 2 || keys[0] !== "page" || keys[1] !== "per_page") return null;
  const page = Number(recordValue(body, "page"));
  const perPage = Number(recordValue(body, "per_page"));
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000
    || perPage !== INSTALLATION_DETAILS_PAGE_SIZE) return null;
  return { page, perPage };
}

function auditMasterRead(app, context, range, now) {
  if (!context.master) return;
  activity.createActivity(app, {
    storeId: context.storeId,
    actor: context.actor,
    module: "marketing",
    action: "push_analytics_viewed",
    severity: "normal",
    resourceType: "push_analytics",
    resourceId: context.storeId,
    resourceLabel: "Analítica agregada de la app",
    changedFields: ["range"],
    previousValues: {},
    newValues: { range },
    summary: `Consultó analítica agregada de instalaciones (${range})`,
    sourceEventKey: `push-analytics-read:${recordId(context.actor)}:${context.storeId}:${range}:${now.toISOString()}`,
  });
}

function handleInstallationsAnalytics(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parseAdminPayload(info && info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const app = e.app || $app;
    const context = storeAnalytics.loadStoreContext(
      app,
      info && info.auth || e.auth,
      headerValue(info, "X-PZ-Support-Store"),
    );
    if (!context) return e.json(403, { ok: false, error: "unauthorized" });
    if (!context.master && !permissions.hasStorePermission(app, context.actor, context.store, "analytics.view")) {
      return e.json(403, { ok: false, error: "permission_denied" });
    }
    const now = new Date();
    const result = buildInstallationAnalytics(app, context, payload.range, now);
    auditMasterRead(app, context, payload.range, now);
    return e.json(200, result);
  } catch (_) {
    return e.json(500, { ok: false, error: "analytics_failed" });
  }
}

function handleInstallationDetails(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parseInstallationDetailsPayload(info && info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const app = e.app || $app;
    const context = storeAnalytics.loadStoreContext(
      app,
      info && info.auth || e.auth,
      headerValue(info, "X-PZ-Support-Store"),
    );
    if (!context) return e.json(403, { ok: false, error: "unauthorized" });
    if (!context.master && !permissions.hasStorePermission(app, context.actor, context.store, "analytics.view")) {
      return e.json(403, { ok: false, error: "permission_denied" });
    }
    const now = new Date();
    const result = buildInstallationDetails(app, context, payload, now);
    if (context.master) {
      activity.createActivity(app, {
        storeId: context.storeId,
        actor: context.actor,
        module: "marketing",
        action: "push_installation_details_viewed",
        severity: "normal",
        resourceType: "push_analytics",
        resourceId: context.storeId,
        resourceLabel: "Detalle seguro de instalaciones",
        changedFields: ["page", "per_page"],
        previousValues: {},
        newValues: { page: result.page, per_page: result.per_page },
        summary: `Consultó detalle seguro de instalaciones (página ${result.page})`,
        sourceEventKey: `push-installation-details:${recordId(context.actor)}:${context.storeId}:${result.page}:${now.toISOString()}`,
      });
    }
    return e.json(200, result);
  } catch (_) {
    return e.json(500, { ok: false, error: "analytics_failed" });
  }
}

module.exports = {
  ACTIVE_INSTALLATION_WINDOW_DAYS,
  ANALYTICS_RANGES,
  ATTRIBUTION_WINDOW_MS,
  EVENT_TYPES,
  INSTALLATION_DETAILS_PAGE_SIZE,
  StorefrontAnalyticsError,
  buildInstallationDetails,
  buildInstallationAnalytics,
  attributeOrder,
  campaignMetrics,
  canonicalPath,
  canonicalDestinationPath,
  cleanupExpiredAnalytics,
  deterministicEventKey,
  handleInstallationDetails,
  handleInstallationsAnalytics,
  parseInstallationDetailsPayload,
  parseAdminPayload,
  periodForRange,
  recordNativeEvent,
  recordCouponApplied,
  refreshAllStoreDailyStats,
  requireAuthenticatedUser,
  upsertCampaignDailyStats,
  upsertStoreDailyStats,
};
