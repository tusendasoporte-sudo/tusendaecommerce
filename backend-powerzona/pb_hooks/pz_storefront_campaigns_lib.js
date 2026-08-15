/// <reference path="../pb_data/types.d.ts" />

"use strict";

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const schema = typeof __hooks === "undefined"
  ? require("./pz_storefront_push_schema_lib.js")
  : require(`${__hooks}/pz_storefront_push_schema_lib.js`);
const dispatch = typeof __hooks === "undefined"
  ? require("./pz_storefront_push_dispatch_lib.js")
  : require(`${__hooks}/pz_storefront_push_dispatch_lib.js`);

const CAMPAIGNS_COLLECTION = "push_campaigns";
const DELIVERIES_COLLECTION = "push_campaign_deliveries";
const INSTALLATIONS_COLLECTION = "storefront_installations";
const APP_CONFIGS_COLLECTION = "storefront_app_configs";
const MEDIA_COLLECTION = "push_media";
const CAMPAIGN_PERMISSION = "marketing.push.manage";
const CAMPAIGN_CAPABILITY = "push_campaigns_enabled";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const TIMEZONE_PATTERN = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const REGION_PATTERN = /^[A-Za-z0-9._ -]{1,80}$/;
const DAILY_CAMPAIGN_LIMIT = 10;
const MONTHLY_CAMPAIGN_LIMIT = 310;
const CAMPAIGN_TIMEZONE = "America/Havana";
const DELIVERY_RETENTION_DAYS = schema.RETENTION_POLICY.delivery_days;
const CAMPAIGN_RETENTION_DAYS = 7;
const TECHNICAL_RETENTION_DAYS = schema.RETENTION_POLICY.event_days;
const QUOTA_ENTRY_RETENTION_DAYS = 40;
const STORE_QUOTA_STATE_FIELD = "push_campaign_quota_state";
const CAMPAIGN_LOCK_SECONDS = 300;
const MAX_BATCHES_PER_RUN = 20;
const SCHEDULER_CAMPAIGN_LIMIT = 50;
const CLEANUP_CAMPAIGN_LIMIT = 100;
const DELETE_CAMPAIGN_LIMIT = 50;
const CAMPAIGN_PAGE_SIZE = 10;
const TARGET_OPTION_LIMIT = 5000;
const MEDIA_SEND_BUFFER_SECONDS = 300;
const SECTION_PATHS = Object.freeze({
  search: "/buscar",
  links: "/links",
  gifts: "/regalos",
  raffles: "/rifa",
  checkout: "/checkout",
});
const TERMINAL_DELIVERY_STATES = Object.freeze([
  "accepted", "failed_permanent", "invalid_fid", "unknown", "canceled",
]);
const SAFE_ERRORS = new Set([
  "unauthorized",
  "permission_denied",
  "plan_not_available",
  "invalid_payload",
  "campaign_not_found",
  "campaign_not_editable",
  "campaign_not_schedulable",
  "campaign_not_cancelable",
  "campaign_not_deletable",
  "campaign_already_started",
  "invalid_title",
  "invalid_body",
  "invalid_timezone",
  "timezone_mismatch",
  "invalid_audience",
  "invalid_target",
  "target_not_found",
  "target_unavailable",
  "order_audience_required",
  "order_link_required",
  "media_not_found",
  "media_unavailable",
  "media_expires_before_send",
  "app_config_unavailable",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
  "relay_not_configured",
  "campaign_save_failed",
  "campaign_schedule_failed",
  "campaign_cancel_failed",
  "campaign_duplicate_failed",
  "campaign_delete_failed",
  "campaign_processing_failed",
]);

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

function recordId(record) {
  return String(record && record.id || recordString(record, "id")).trim();
}

function isRedactedCampaign(record) {
  return Boolean(recordString(record, "redacted_at"));
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function campaignTargetReference(record, targetType) {
  const normalizedType = String(targetType || "").trim();
  if (!["product", "category", "order", "raffle", "coupon"].includes(normalizedType)) return "";
  return relationId(record, `target_${normalizedType}`);
}

function integerValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function boolValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parsedDate(value) {
  const raw = value instanceof Date ? value.toISOString() : String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function addSeconds(value, seconds) {
  const date = value instanceof Date ? new Date(value.getTime()) : parsedDate(value);
  if (!date) return "";
  date.setUTCSeconds(date.getUTCSeconds() + Math.max(0, Number(seconds) || 0));
  return date.toISOString();
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : parsedDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Math.max(0, Number(days) || 0));
  return date.toISOString();
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function exactPayload(body, requiredKeys, optionalKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body).filter((key) => typeof body[key] !== "function");
  const allowed = new Set(requiredKeys.concat(optionalKeys || []));
  return requiredKeys.every((key) => keys.includes(key)) && keys.every((key) => allowed.has(key));
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

function jsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      const normalized = JSON.parse(JSON.stringify(value));
      return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
    } catch (_) {
      return null;
    }
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function campaignQuotaState(store) {
  let value = null;
  if (store && typeof store.unmarshalJSONField === "function" && typeof DynamicModel !== "undefined") {
    try {
      const model = new DynamicModel({ timezone: "", starts: {} });
      store.unmarshalJSONField(STORE_QUOTA_STATE_FIELD, model);
      value = { timezone: model.timezone, starts: jsonObject(model.starts) || {} };
    } catch (_) {}
  }
  if (!value) value = jsonObject(recordValue(store, STORE_QUOTA_STATE_FIELD)) || {};
  const rawStarts = value.starts && typeof value.starts === "object" && !Array.isArray(value.starts)
    ? value.starts
    : {};
  const starts = {};
  Object.keys(rawStarts).forEach((campaignId) => {
    const startedAt = parsedDate(rawStarts[campaignId]);
    if (RECORD_ID_PATTERN.test(campaignId) && startedAt) starts[campaignId] = startedAt.toISOString();
  });
  return { timezone: CAMPAIGN_TIMEZONE, starts };
}

function prunedCampaignQuotaStarts(starts, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const cutoff = now.getTime() - QUOTA_ENTRY_RETENTION_DAYS * 86_400_000;
  const result = {};
  Object.keys(starts || {}).forEach((campaignId) => {
    const startedAt = parsedDate(starts[campaignId]);
    if (RECORD_ID_PATTERN.test(campaignId) && startedAt && startedAt.getTime() >= cutoff) {
      result[campaignId] = startedAt.toISOString();
    }
  });
  return result;
}

function recordCampaignQuotaUsage(app, campaign, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const campaignId = recordId(campaign);
  const storeId = relationId(campaign, "store");
  const startedAt = parsedDate(recordValue(campaign, "started_at"));
  const timezone = recordString(campaign, "timezone");
  if (!RECORD_ID_PATTERN.test(campaignId) || !RECORD_ID_PATTERN.test(storeId) || !startedAt || !isValidTimezone(timezone)) {
    return false;
  }
  const store = findRecord(app, "stores", storeId);
  if (!store) throw codedError("campaign_processing_failed");
  const state = campaignQuotaState(store);
  if (timezone !== CAMPAIGN_TIMEZONE) throw codedError("timezone_mismatch");
  const starts = prunedCampaignQuotaStarts(state.starts, now);
  if (startedAt.getTime() >= now.getTime() - QUOTA_ENTRY_RETENTION_DAYS * 86_400_000) {
    starts[campaignId] = startedAt.toISOString();
  }
  store.set(STORE_QUOTA_STATE_FIELD, { timezone: CAMPAIGN_TIMEZONE, starts });
  app.save(store);
  return true;
}

function recordAudienceConfig(record) {
  const type = recordString(record, "audience_type");
  const targetType = recordString(record, "target_type");
  if (["all_active", "active_7d", "active_30d"].includes(type) && targetType !== "order") return {};
  if (record && typeof record.unmarshalJSONField === "function" && typeof DynamicModel !== "undefined") {
    try {
      const model = new DynamicModel({
        installation_id: "",
        app_version_code: 0,
        permission: "",
        country_code: "",
        region_code: "",
      });
      record.unmarshalJSONField("audience_config", model);
      if (targetType === "order") return { installation_id: bounded(model.installation_id, 15) };
      if (type === "app_version") return { app_version_code: Number(model.app_version_code) };
      if (type === "notification_permission") return { permission: bounded(model.permission, 20) };
      if (type === "country_region") {
        const countryCode = bounded(model.country_code, 2);
        const regionCode = bounded(model.region_code, 80);
        return { country_code: countryCode, ...(regionCode ? { region_code: regionCode } : {}) };
      }
    } catch (_) {
      return null;
    }
  }
  return jsonObject(recordValue(record, "audience_config"));
}

function codedError(code) {
  const safe = SAFE_ERRORS.has(String(code || "")) ? String(code) : "campaign_processing_failed";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function safeErrorCode(error, fallback) {
  const code = String(error && (error.code || error.message) || "");
  return SAFE_ERRORS.has(code) ? code : fallback;
}

function errorStatus(code) {
  if (["unauthorized", "permission_denied", "plan_not_available"].includes(code)) return 403;
  if (["campaign_not_found", "target_not_found", "media_not_found"].includes(code)) return 404;
  if ([
    "campaign_not_editable", "campaign_not_schedulable", "campaign_not_cancelable", "campaign_not_deletable",
    "campaign_already_started", "daily_quota_exceeded", "monthly_quota_exceeded",
    "timezone_mismatch", "media_expires_before_send",
  ].includes(code)) return 409;
  if (code === "relay_not_configured") return 503;
  if (code.startsWith("invalid_")
    || ["target_unavailable", "order_audience_required", "order_link_required", "media_unavailable", "app_config_unavailable"].includes(code)) return 400;
  return 500;
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

function headerValue(info, name) {
  const target = String(name || "").toLowerCase().replace(/-/g, "_");
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") {
      const value = headers.get(name) || headers.get(target);
      if (value) return String(value).trim();
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === target
  ));
  return key ? String(headers[key] || "").trim() : "";
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecordsStrict(app, collection, filter, sort, limit, offset, params) {
  return Array.from(app.findRecordsByFilter(
    collection,
    filter,
    sort || "id",
    Math.max(1, Math.min(Number(limit) || 200, 500)),
    Math.max(0, Number(offset) || 0),
    params || {},
  ) || []);
}

function findAllRecordsStrict(app, collection, filter, sort, params, limitValue) {
  const maximum = Math.max(1, Math.min(Number(limitValue) || TARGET_OPTION_LIMIT, TARGET_OPTION_LIMIT));
  const records = [];
  for (let offset = 0; offset < maximum; offset += 500) {
    const page = findRecordsStrict(
      app,
      collection,
      filter,
      sort,
      Math.min(500, maximum - offset),
      offset,
      params,
    );
    records.push(...page);
    if (page.length < Math.min(500, maximum - offset)) break;
  }
  return records;
}

function runTransaction(app, callback) {
  let result;
  if (app && typeof app.runInTransaction === "function") {
    app.runInTransaction((txApp) => { result = callback(txApp); });
  } else {
    result = callback(app);
  }
  return result;
}

function loadCampaignAccessContext(app, auth, supportStoreId) {
  const actorId = recordString(auth, "id") || String(auth && auth.id || "").trim();
  if (!RECORD_ID_PATTERN.test(actorId)) return null;
  const actor = findRecord(app, "users", actorId);
  if (!actor || recordString(actor, "status") !== "active") return null;
  const role = recordString(actor, "role");
  const master = role === "master_admin";
  const storeId = master ? String(supportStoreId || "").trim() : relationId(actor, "store");
  if ((!master && !["store_admin", "store_staff"].includes(role))
    || !RECORD_ID_PATTERN.test(storeId)) return null;
  const store = findRecord(app, "stores", storeId);
  if (!store || recordString(store, "status") !== "active") return null;
  return { actor, actorId, store, storeId, master };
}

function assertCampaignAccess(app, context) {
  if (!context) throw codedError("unauthorized");
  const access = capabilities.resolveStoreCapabilityAccess(context.store, CAMPAIGN_CAPABILITY, {
    enforceExpiration: true,
  });
  if (!access.allowed) throw codedError("plan_not_available");
  if (!context.master
    && !permissions.hasStorePermission(app, context.actor, context.store, CAMPAIGN_PERMISSION)) {
    throw codedError("permission_denied");
  }
  return true;
}

function creatorAuthorized(app, campaign, store) {
  const creator = findRecord(app, "users", relationId(campaign, "created_by"));
  if (!creator || recordString(creator, "status") !== "active") return false;
  if (recordString(creator, "role") === "master_admin") return true;
  return relationId(creator, "store") === recordId(store)
    && permissions.hasStorePermission(app, creator, store, CAMPAIGN_PERMISSION);
}

function timezonePartsWithPocketBase(date, timezone) {
  if (typeof DateTime === "undefined") return null;
  try {
    const wallClock = date.toISOString().slice(0, 19).replace("T", " ");
    const interpreted = new DateTime(wallClock, timezone);
    const interpretedMs = Number(interpreted.unix()) * 1000;
    if (!Number.isFinite(interpretedMs)) return null;
    const offsetMs = date.getTime() - interpretedMs;
    if (Math.abs(offsetMs) > 24 * 60 * 60 * 1000) return null;
    const local = new Date(date.getTime() + offsetMs);
    return {
      year: local.getUTCFullYear(),
      month: local.getUTCMonth() + 1,
      day: local.getUTCDate(),
    };
  } catch (_) {
    return null;
  }
}

function timezonePartsWithIntl(date, timezone) {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = {};
    parts.forEach((part) => { values[part.type] = part.value; });
    return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
  } catch (_) {
    return null;
  }
}

function timezoneParts(dateValue, timezone) {
  const date = dateValue instanceof Date ? dateValue : parsedDate(dateValue);
  const zone = String(timezone || "").trim();
  if (!date || !TIMEZONE_PATTERN.test(zone)) return null;
  const parts = timezonePartsWithPocketBase(date, zone) || timezonePartsWithIntl(date, zone);
  if (!parts
    || !Number.isInteger(parts.year)
    || !Number.isInteger(parts.month)
    || !Number.isInteger(parts.day)) return null;
  return parts;
}

function isValidTimezone(value) {
  return !!timezoneParts(new Date("2026-01-15T12:00:00.000Z"), value)
    && !!timezoneParts(new Date("2026-07-15T12:00:00.000Z"), value);
}

function calendarKeys(date, timezone) {
  const parts = timezoneParts(date, timezone);
  if (!parts) throw codedError("invalid_timezone");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return { day: `${parts.year}-${month}-${day}`, month: `${parts.year}-${month}` };
}

function normalizedAudienceConfig(audienceType, value, targetType) {
  const config = jsonObject(value);
  if (!config || !schema.CAMPAIGN_AUDIENCE_TYPES.includes(audienceType)) throw codedError("invalid_audience");
  const keys = Object.keys(config).sort();
  const exact = (expected) => keys.length === expected.length
    && keys.every((key, index) => key === expected.slice().sort()[index]);

  if (targetType === "order") {
    const installationId = bounded(config.installation_id, 15);
    if (audienceType !== "all_active" || !exact(["installation_id"]) || !RECORD_ID_PATTERN.test(installationId)) {
      throw codedError("order_audience_required");
    }
    return { installation_id: installationId };
  }
  if (["all_active", "active_7d", "active_30d"].includes(audienceType)) {
    if (!exact([])) throw codedError("invalid_audience");
    return {};
  }
  if (audienceType === "app_version") {
    const versionCode = Number(config.app_version_code);
    if (!exact(["app_version_code"]) || !Number.isInteger(versionCode) || versionCode < 1) {
      throw codedError("invalid_audience");
    }
    return { app_version_code: versionCode };
  }
  if (audienceType === "notification_permission") {
    if (!exact(["permission"]) || config.permission !== "granted") throw codedError("invalid_audience");
    return { permission: "granted" };
  }
  if (audienceType === "country_region") {
    const countryCode = bounded(config.country_code, 2).toUpperCase();
    const regionCode = config.region_code === undefined ? "" : bounded(config.region_code, 80);
    const expected = regionCode ? ["country_code", "region_code"] : ["country_code"];
    if (!exact(expected) || !COUNTRY_PATTERN.test(countryCode)
      || (regionCode && !REGION_PATTERN.test(regionCode))) throw codedError("invalid_audience");
    return { country_code: countryCode, ...(regionCode ? { region_code: regionCode } : {}) };
  }
  throw codedError("invalid_audience");
}

function parseSavePayload(body) {
  const required = ["audience_config", "audience_type", "body", "target_type", "timezone", "title"];
  const optional = ["campaign_id", "media_id", "target_ref", "target_section"];
  if (!exactPayload(body, required, optional)) return null;
  const campaignId = bounded(bodyValue(body, "campaign_id"), 15);
  const mediaId = bounded(bodyValue(body, "media_id"), 15);
  const targetRef = bounded(bodyValue(body, "target_ref"), 15);
  const rawTitle = typeof bodyValue(body, "title") === "string" ? bodyValue(body, "title").trim() : "";
  const rawBody = typeof bodyValue(body, "body") === "string" ? bodyValue(body, "body").trim() : "";
  const title = rawTitle;
  const messageBody = rawBody;
  const timezone = bounded(bodyValue(body, "timezone"), 80);
  const audienceType = bounded(bodyValue(body, "audience_type"), 40);
  const targetType = bounded(bodyValue(body, "target_type"), 20);
  const targetSection = bounded(bodyValue(body, "target_section"), 30);
  if ((campaignId && !RECORD_ID_PATTERN.test(campaignId))
    || (mediaId && !RECORD_ID_PATTERN.test(mediaId))
    || (targetRef && !RECORD_ID_PATTERN.test(targetRef))) return null;
  if (!title || title.length > 120 || /[\u0000-\u001f\u007f]/.test(title)) throw codedError("invalid_title");
  if (!messageBody || messageBody.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(messageBody)) {
    throw codedError("invalid_body");
  }
  if (!schema.CAMPAIGN_TARGET_TYPES.includes(targetType)) throw codedError("invalid_target");
  if (!isValidTimezone(timezone)) throw codedError("invalid_timezone");
  if (timezone !== CAMPAIGN_TIMEZONE) throw codedError("timezone_mismatch");
  const audienceConfig = normalizedAudienceConfig(
    audienceType,
    bodyValue(body, "audience_config"),
    targetType,
  );
  return {
    campaignId,
    mediaId,
    targetRef,
    title,
    body: messageBody,
    timezone,
    audienceType,
    audienceConfig,
    targetType,
    targetSection,
  };
}

function parseCampaignIdPayload(body) {
  if (!exactPayload(body, ["campaign_id"], [])) return null;
  const campaignId = bounded(bodyValue(body, "campaign_id"), 15);
  return RECORD_ID_PATTERN.test(campaignId) ? { campaignId } : null;
}

function parseAudiencePreviewPayload(body) {
  const campaign = parseCampaignIdPayload(body);
  if (campaign) return campaign;
  if (!exactPayload(body, ["audience_config", "audience_type", "target_type"], [])) return null;
  const audienceType = bounded(bodyValue(body, "audience_type"), 40);
  const targetType = bounded(bodyValue(body, "target_type"), 20);
  if (!schema.CAMPAIGN_TARGET_TYPES.includes(targetType)) throw codedError("invalid_target");
  return {
    audienceType,
    audienceConfig: normalizedAudienceConfig(
      audienceType,
      bodyValue(body, "audience_config"),
      targetType,
    ),
    targetType,
  };
}

function parseSchedulePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const mode = bounded(bodyValue(body, "mode"), 20);
  const expected = mode === "now" ? ["campaign_id", "mode"] : ["campaign_id", "mode", "scheduled_at"];
  if (!exactPayload(body, expected, [])) return null;
  const campaignId = bounded(bodyValue(body, "campaign_id"), 15);
  if (!RECORD_ID_PATTERN.test(campaignId) || !["now", "scheduled"].includes(mode)) return null;
  const scheduledAt = mode === "now" ? null : parsedDate(bodyValue(body, "scheduled_at"));
  if (mode === "scheduled" && !scheduledAt) return null;
  return { campaignId, mode, scheduledAt };
}

function safeStoreSlug(store) {
  const slug = bounded(recordString(store, "slug"), 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function validateStoreRelation(app, collection, id, storeId) {
  const record = findRecord(app, collection, id);
  if (!record || relationId(record, "store") !== storeId) throw codedError("target_not_found");
  return record;
}

function couponAvailable(coupon, now) {
  if (!coupon || !boolValue(recordValue(coupon, "active"))) return false;
  const startsAt = parsedDate(recordValue(coupon, "starts_at"));
  const endsAt = parsedDate(recordValue(coupon, "ends_at"));
  return (!startsAt || startsAt.getTime() <= now.getTime())
    && (!endsAt || endsAt.getTime() >= now.getTime());
}

function raffleAvailable(raffle, now) {
  if (!raffle
    || !boolValue(recordValue(raffle, "is_configured"))
    || !boolValue(recordValue(raffle, "link_enabled"))
    || boolValue(recordValue(raffle, "selection_manually_closed"))) return false;
  const status = recordString(raffle, "status");
  if ([
    "draft", "scheduled", "selection_closed", "result_pending", "winner_published",
    "no_winner_published", "finalized", "archived",
  ].includes(status)) return false;
  const startsAt = parsedDate(recordValue(raffle, "starts_at"));
  const closesAt = parsedDate(recordValue(raffle, "closes_at"));
  const drawAt = parsedDate(recordValue(raffle, "draw_at"));
  return (!startsAt || startsAt.getTime() <= now.getTime())
    && !!closesAt
    && closesAt.getTime() > now.getTime()
    && (!drawAt || drawAt.getTime() > now.getTime());
}

function targetOption(id, label, detail) {
  const option = { id: bounded(id, 15), label: bounded(label, 180) };
  const safeDetail = bounded(detail, 180);
  if (safeDetail) option.detail = safeDetail;
  return option;
}

function sortTargetOptions(options) {
  return options.sort((left, right) => {
    const a = String(left.label || "").toLowerCase();
    const b = String(right.label || "").toLowerCase();
    if (a === b) return String(left.id).localeCompare(String(right.id));
    return a.localeCompare(b);
  });
}

function listTargetOptions(app, context, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  const recordsForStore = (collection, sort) => findAllRecordsStrict(
    app,
    collection,
    "store = {:store}",
    sort,
    { store: context.storeId },
    TARGET_OPTION_LIMIT,
  );
  const validSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recordString(value, "slug").toLowerCase());
  const categories = recordsForStore("categories", "name,id")
    .filter((item) => boolValue(recordValue(item, "active")) && validSlug(item))
    .map((item) => targetOption(recordId(item), recordString(item, "name") || "Categoría"));
  const products = recordsForStore("products", "name,id")
    .filter((item) => boolValue(recordValue(item, "active")) && validSlug(item))
    .map((item) => targetOption(
      recordId(item),
      recordString(item, "name") || "Producto",
      recordString(item, "internal_ref"),
    ));
  const raffles = recordsForStore("raffles", "title,id")
    .filter((item) => raffleAvailable(item, now) && validSlug(item))
    .map((item) => targetOption(
      recordId(item),
      recordString(item, "title") || recordString(item, "name") || "Rifa activa",
      recordString(item, "closes_at"),
    ));
  const coupons = recordsForStore("manual_coupons", "code,id")
    .filter((item) => couponAvailable(item, now) && /^[A-Za-z0-9_-]{2,40}$/.test(recordString(item, "code")))
    .map((item) => ({
      id: bounded(recordId(item), 15),
      code: bounded(recordString(item, "code"), 40).toUpperCase(),
    }));
  return {
    categories: sortTargetOptions(categories),
    products: sortTargetOptions(products),
    raffles: sortTargetOptions(raffles),
    coupons: coupons.sort((left, right) => left.code.localeCompare(right.code)),
  };
}

function resolveTarget(app, store, targetType, targetRef, targetSection, audienceConfig, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const storeId = recordId(store);
  const slug = safeStoreSlug(store);
  if (!slug) throw codedError("invalid_target");
  const base = `/t/${slug}`;
  const result = {
    target_path: base,
    target_section: "",
    target_product: "",
    target_category: "",
    target_order: "",
    target_raffle: "",
    target_coupon: "",
  };
  if (targetType === "home") {
    if (targetRef || targetSection) throw codedError("invalid_target");
    return result;
  }
  if (targetType === "section") {
    if (targetRef || !schema.CAMPAIGN_TARGET_SECTIONS.includes(targetSection)) throw codedError("invalid_target");
    result.target_section = targetSection;
    result.target_path = `${base}${SECTION_PATHS[targetSection]}`;
    return result;
  }
  if (!RECORD_ID_PATTERN.test(targetRef) || targetSection) throw codedError("invalid_target");
  if (targetType === "product") {
    const product = validateStoreRelation(app, "products", targetRef, storeId);
    const productSlug = bounded(recordString(product, "slug"), 120).toLowerCase();
    if (!boolValue(recordValue(product, "active")) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(productSlug)) {
      throw codedError("target_unavailable");
    }
    result.target_product = targetRef;
    result.target_path = `${base}/producto/${productSlug}`;
    return result;
  }
  if (targetType === "category") {
    const category = validateStoreRelation(app, "categories", targetRef, storeId);
    const categorySlug = bounded(recordString(category, "slug"), 120).toLowerCase();
    if (!boolValue(recordValue(category, "active")) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) {
      throw codedError("target_unavailable");
    }
    result.target_category = targetRef;
    result.target_path = `${base}/categoria/${categorySlug}`;
    return result;
  }
  if (targetType === "raffle") {
    const raffle = validateStoreRelation(app, "raffles", targetRef, storeId);
    const raffleSlug = bounded(recordString(raffle, "slug"), 90).toLowerCase();
    if (!raffleAvailable(raffle, now)
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raffleSlug)) throw codedError("target_unavailable");
    result.target_raffle = targetRef;
    result.target_path = `${base}/rifa/${raffleSlug}`;
    return result;
  }
  if (targetType === "coupon") {
    const coupon = validateStoreRelation(app, "manual_coupons", targetRef, storeId);
    const code = bounded(recordString(coupon, "code"), 40);
    if (!couponAvailable(coupon, now) || !/^[A-Za-z0-9_-]{2,40}$/.test(code)) {
      throw codedError("target_unavailable");
    }
    result.target_coupon = targetRef;
    result.target_path = `${base}?coupon=${encodeURIComponent(code)}`;
    return result;
  }
  if (targetType === "order") {
    validateStoreRelation(app, "orders", targetRef, storeId);
    const installationId = bounded(audienceConfig && audienceConfig.installation_id, 15);
    const installation = findRecord(app, INSTALLATIONS_COLLECTION, installationId);
    if (!installation || relationId(installation, "store") !== storeId) throw codedError("order_audience_required");
    let link = null;
    try {
      link = app.findFirstRecordByFilter(
        "storefront_order_links",
        'store = {:store} && installation = {:installation} && order = {:order} && status = "active"',
        { store: storeId, installation: installationId, order: targetRef },
      );
    } catch (_) {}
    if (!link) throw codedError("order_link_required");
    result.target_order = targetRef;
    result.target_path = "";
    return result;
  }
  throw codedError("invalid_target");
}

function validateMedia(app, mediaId, storeId, sendAt) {
  if (!mediaId) return null;
  const media = findRecord(app, MEDIA_COLLECTION, mediaId);
  if (!media || relationId(media, "store") !== storeId) throw codedError("media_not_found");
  if (recordString(media, "status") !== "active") throw codedError("media_unavailable");
  const deleteAfter = parsedDate(recordValue(media, "delete_after"));
  if (!deleteAfter) throw codedError("media_unavailable");
  const requiredUntil = new Date(sendAt.getTime() + MEDIA_SEND_BUFFER_SECONDS * 1000);
  if (deleteAfter.getTime() <= requiredUntil.getTime()) throw codedError("media_expires_before_send");
  return media;
}

function activeAppConfigs(app, storeId) {
  return findRecordsStrict(
    app,
    APP_CONFIGS_COLLECTION,
    'store = {:store} && status = "active"',
    "id",
    500,
    0,
    { store: storeId },
  );
}

function applyTarget(record, target) {
  for (const key of [
    "target_path", "target_section", "target_product", "target_category",
    "target_order", "target_raffle", "target_coupon",
  ]) record.set(key, target[key] || "");
}

function createOrUpdateDraft(app, context, payload, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  if (payload.timezone !== CAMPAIGN_TIMEZONE) throw codedError("timezone_mismatch");
  let campaign = null;
  if (payload.campaignId) {
    campaign = findRecord(app, CAMPAIGNS_COLLECTION, payload.campaignId);
    if (!campaign || isRedactedCampaign(campaign)
      || relationId(campaign, "store") !== context.storeId) throw codedError("campaign_not_found");
    if (recordString(campaign, "status") !== "draft") throw codedError("campaign_not_editable");
  } else {
    campaign = new Record(app.findCollectionByNameOrId(CAMPAIGNS_COLLECTION), {});
    campaign.set("store", context.storeId);
    campaign.set("created_by", context.actorId);
    campaign.set("status", "draft");
    campaign.set("selected_count", 0);
    campaign.set("accepted_count", 0);
    campaign.set("failed_count", 0);
    campaign.set("invalid_count", 0);
  }
  const target = resolveTarget(
    app,
    context.store,
    payload.targetType,
    payload.targetRef,
    payload.targetSection,
    payload.audienceConfig,
    now,
  );
  validateMedia(app, payload.mediaId, context.storeId, now);
  campaign.set("title", payload.title);
  campaign.set("body", payload.body);
  campaign.set("media", payload.mediaId || "");
  campaign.set("audience_type", payload.audienceType);
  campaign.set("audience_config", payload.audienceConfig);
  campaign.set("target_type", payload.targetType);
  campaign.set("timezone", CAMPAIGN_TIMEZONE);
  campaign.set("scheduled_at", "");
  campaign.set("failure_code", "");
  campaign.set("delete_after", addDays(now, CAMPAIGN_RETENTION_DAYS));
  applyTarget(campaign, target);
  schema.assertValidState(CAMPAIGNS_COLLECTION, "draft");
  schema.assertTenantIsolation(app, CAMPAIGNS_COLLECTION, campaign);
  schema.assertCampaignTarget(campaign);
  app.save(campaign);
  return campaign;
}

function mapCampaign(record) {
  return {
    id: recordId(record),
    status: recordString(record, "status"),
    title: recordString(record, "title"),
    body: recordString(record, "body"),
    media_id: relationId(record, "media"),
    audience_type: recordString(record, "audience_type"),
    audience_config: recordAudienceConfig(record) || {},
    target_type: recordString(record, "target_type"),
    target_section: recordString(record, "target_section"),
    target_ref: campaignTargetReference(record, recordString(record, "target_type")),
    target_path: recordString(record, "target_path"),
    timezone: recordString(record, "timezone"),
    scheduled_at: recordString(record, "scheduled_at"),
    selected_count: integerValue(recordValue(record, "selected_count")),
    accepted_count: integerValue(recordValue(record, "accepted_count")),
    failed_count: integerValue(recordValue(record, "failed_count")),
    invalid_count: integerValue(recordValue(record, "invalid_count")),
    started_at: recordString(record, "started_at"),
    completed_at: recordString(record, "completed_at"),
    canceled_at: recordString(record, "canceled_at"),
    failure_code: recordString(record, "failure_code"),
    created: recordString(record, "created"),
    updated: recordString(record, "updated"),
  };
}

function installationMatchesAudience(installation, appConfig, campaign, now) {
  if (!installation || !appConfig
    || recordString(installation, "status") !== "active"
    || recordString(installation, "notification_permission") !== "granted"
    || !FID_PATTERN.test(bounded(recordString(installation, "fid"), 255))
    || recordString(appConfig, "status") !== "active"
    || relationId(appConfig, "store") !== relationId(campaign, "store")) return false;
  const type = recordString(campaign, "audience_type");
  const config = normalizedAudienceConfig(type, recordAudienceConfig(campaign), recordString(campaign, "target_type"));
  if (recordString(campaign, "target_type") === "order") return recordId(installation) === config.installation_id;
  if (type === "active_7d" || type === "active_30d") {
    const seen = parsedDate(recordValue(installation, "last_seen_at"));
    const days = type === "active_7d" ? 7 : 30;
    return !!seen && seen.getTime() >= now.getTime() - days * 86_400_000;
  }
  if (type === "app_version") {
    return integerValue(recordValue(installation, "app_version_code")) === config.app_version_code;
  }
  if (type === "country_region") {
    return recordString(installation, "country_code").toUpperCase() === config.country_code
      && (!config.region_code || recordString(installation, "region_code") === config.region_code);
  }
  return true;
}

function eligibleInstallations(app, campaign, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const storeId = relationId(campaign, "store");
  const eligible = [];
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(
      app,
      INSTALLATIONS_COLLECTION,
      'store = {:store} && status = "active" && notification_permission = "granted"',
      "id",
      500,
      offset,
      { store: storeId },
    );
    page.forEach((installation) => {
      const appConfig = findRecord(app, APP_CONFIGS_COLLECTION, relationId(installation, "app_config"));
      if (installationMatchesAudience(installation, appConfig, campaign, now)) eligible.push(installation);
    });
    if (page.length < 500) break;
  }
  return eligible;
}

function countCampaignDeliveries(app, campaignId) {
  let total = 0;
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(
      app,
      DELIVERIES_COLLECTION,
      "campaign = {:campaign}",
      "id",
      500,
      offset,
      { campaign: campaignId },
    );
    total += page.length;
    if (page.length < 500) break;
  }
  return total;
}

function materializeAudience(app, campaign, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const campaignId = recordId(campaign);
  const existing = countCampaignDeliveries(app, campaignId);
  if (existing > 0) return existing;
  const selected = eligibleInstallations(app, campaign, now);
  const collection = app.findCollectionByNameOrId(DELIVERIES_COLLECTION);
  selected.forEach((installation) => {
    const delivery = new Record(collection, {});
    delivery.set("store", relationId(campaign, "store"));
    delivery.set("campaign", campaignId);
    delivery.set("installation", recordId(installation));
    delivery.set("status", "pending");
    delivery.set("attempt_count", 0);
    delivery.set("delete_after", addDays(now, DELIVERY_RETENTION_DAYS));
    schema.assertValidState(DELIVERIES_COLLECTION, "pending");
    schema.assertTenantIsolation(app, DELIVERIES_COLLECTION, delivery);
    app.save(delivery);
  });
  return selected.length;
}

function startedCampaignUsage(app, storeId) {
  const usage = new Map();
  const store = findRecord(app, "stores", storeId);
  const quotaState = campaignQuotaState(store);
  Object.keys(quotaState.starts).forEach((campaignId) => {
    usage.set(campaignId, {
      campaignId,
      startedAt: quotaState.starts[campaignId],
      timezone: quotaState.timezone,
    });
  });
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(
      app,
      CAMPAIGNS_COLLECTION,
      'store = {:store} && started_at != ""',
      "-started_at,id",
      500,
      offset,
      { store: storeId },
    );
    page.forEach((item) => usage.set(recordId(item), {
      campaignId: recordId(item),
      startedAt: recordString(item, "started_at"),
      timezone: CAMPAIGN_TIMEZONE,
    }));
    if (page.length < 500) break;
  }
  return { quotaTimezone: quotaState.timezone, usage: Array.from(usage.values()) };
}

function campaignQuotaUsage(app, storeId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const state = startedCampaignUsage(app, storeId);
  const current = calendarKeys(now, CAMPAIGN_TIMEZONE);
  let dailyUsed = 0;
  let monthlyUsed = 0;
  state.usage.forEach((item) => {
    const startedAt = parsedDate(item.startedAt);
    if (!startedAt || (item.timezone && item.timezone !== CAMPAIGN_TIMEZONE)) return;
    const keys = calendarKeys(startedAt, CAMPAIGN_TIMEZONE);
    if (keys.month === current.month) monthlyUsed += 1;
    if (keys.day === current.day) dailyUsed += 1;
  });
  return Object.freeze({
    timezone: CAMPAIGN_TIMEZONE,
    daily: Object.freeze({
      limit: DAILY_CAMPAIGN_LIMIT,
      used: dailyUsed,
      remaining: Math.max(0, DAILY_CAMPAIGN_LIMIT - dailyUsed),
    }),
    monthly: Object.freeze({
      limit: MONTHLY_CAMPAIGN_LIMIT,
      used: monthlyUsed,
      remaining: Math.max(0, MONTHLY_CAMPAIGN_LIMIT - monthlyUsed),
    }),
  });
}

function parseCampaignIdsPayload(body) {
  if (!exactPayload(body, ["campaign_ids"], [])) return null;
  const rawIds = bodyValue(body, "campaign_ids");
  if (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > DELETE_CAMPAIGN_LIMIT) return null;
  const campaignIds = [];
  for (const value of rawIds) {
    const campaignId = bounded(value, 15);
    if (!RECORD_ID_PATTERN.test(campaignId) || campaignIds.includes(campaignId)) return null;
    campaignIds.push(campaignId);
  }
  return { campaignIds };
}

function assertStoreTimezoneConsistency(campaign, quotaTimezone, started) {
  const timezone = recordString(campaign, "timezone");
  if (timezone !== CAMPAIGN_TIMEZONE || (quotaTimezone && quotaTimezone !== CAMPAIGN_TIMEZONE)) {
    throw codedError("timezone_mismatch");
  }
  if (started.some((item) => item.timezone && item.timezone !== CAMPAIGN_TIMEZONE)) {
    throw codedError("timezone_mismatch");
  }
}

function assertCampaignQuota(app, campaign, nowValue) {
  if (recordString(campaign, "started_at")) return true;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const timezone = recordString(campaign, "timezone");
  const current = calendarKeys(now, timezone);
  const state = startedCampaignUsage(app, relationId(campaign, "store"));
  const started = state.usage;
  assertStoreTimezoneConsistency(campaign, state.quotaTimezone, started);
  let daily = 0;
  let monthly = 0;
  started.forEach((item) => {
    const startedAt = parsedDate(item.startedAt);
    if (!startedAt || item.campaignId === recordId(campaign)) return;
    const keys = calendarKeys(startedAt, timezone);
    if (keys.month === current.month) monthly += 1;
    if (keys.day === current.day) daily += 1;
  });
  if (daily >= DAILY_CAMPAIGN_LIMIT) throw codedError("daily_quota_exceeded");
  if (monthly >= MONTHLY_CAMPAIGN_LIMIT) throw codedError("monthly_quota_exceeded");
  return true;
}

function validateCampaignForExecution(app, campaign, nowValue, scheduledFor) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const store = findRecord(app, "stores", relationId(campaign, "store"));
  if (!store || recordString(store, "status") !== "active") throw codedError("plan_not_available");
  const capability = capabilities.resolveStoreCapabilityAccess(store, CAMPAIGN_CAPABILITY, { enforceExpiration: true });
  if (!capability.allowed) throw codedError("plan_not_available");
  if (!creatorAuthorized(app, campaign, store)) throw codedError("permission_denied");
  const title = recordString(campaign, "title");
  const messageBody = recordString(campaign, "body");
  if (!title || title.length > 120) throw codedError("invalid_title");
  if (!messageBody || messageBody.length > 1000) throw codedError("invalid_body");
  if (!isValidTimezone(recordString(campaign, "timezone"))) throw codedError("invalid_timezone");
  if (recordString(campaign, "timezone") !== CAMPAIGN_TIMEZONE) throw codedError("timezone_mismatch");
  const audience = normalizedAudienceConfig(
    recordString(campaign, "audience_type"),
    recordAudienceConfig(campaign),
    recordString(campaign, "target_type"),
  );
  const targetType = recordString(campaign, "target_type");
  const targetRef = campaignTargetReference(campaign, targetType);
  const target = resolveTarget(
    app,
    store,
    targetType,
    targetRef,
    recordString(campaign, "target_section"),
    audience,
    now,
  );
  validateMedia(app, relationId(campaign, "media"), recordId(store), scheduledFor || now);
  if (!activeAppConfigs(app, recordId(store)).length) throw codedError("app_config_unavailable");
  applyTarget(campaign, target);
  schema.assertTenantIsolation(app, CAMPAIGNS_COLLECTION, campaign);
  schema.assertCampaignTarget(campaign);
  return { store, audience, target };
}

function secureToken(length, options) {
  if (options && typeof options.randomToken === "function") {
    const result = String(options.randomToken(length) || "").trim();
    if (result.length >= length) return result.slice(0, length);
  }
  try {
    const result = String($security.randomString(length) || "").trim();
    if (result.length >= length) return result.slice(0, length);
  } catch (_) {}
  throw new Error("secure_random_unavailable");
}

function markCampaignFailure(campaign, code, now, partial) {
  campaign.set("status", partial ? "partially_sent" : "failed");
  campaign.set("failure_code", bounded(code, 80));
  campaign.set("completed_at", now.toISOString());
  campaign.set("delete_after", addDays(now, CAMPAIGN_RETENTION_DAYS));
  campaign.set("lock_token", "");
  campaign.set("lock_expires_at", "");
}

function pauseCampaignForPlan(campaign) {
  campaign.set("status", "paused_plan");
  campaign.set("failure_code", "plan_not_available");
  campaign.set("lock_token", "");
  campaign.set("lock_expires_at", "");
  campaign.set("delete_after", "");
}

function terminalizeOutstandingDeliveries(app, campaignId, now) {
  const terminalized = { canceled: 0, unknown: 0 };
  const updates = [
    { from: "pending", to: "canceled", code: "campaign_terminated" },
    { from: "failed_transient", to: "canceled", code: "campaign_terminated" },
    // A claimed lease may already have reached the relay. Treating it as
    // canceled would allow a future duplicate while hiding an ambiguous send.
    { from: "claimed", to: "unknown", code: "campaign_terminated_while_claimed" },
  ];
  updates.forEach((update) => {
    for (;;) {
      const page = findRecordsStrict(
        app,
        DELIVERIES_COLLECTION,
        "campaign = {:campaign} && status = {:status}",
        "id",
        500,
        0,
        { campaign: campaignId, status: update.from },
      );
      if (!page.length) break;
      page.forEach((candidate) => {
        const delivery = findRecord(app, DELIVERIES_COLLECTION, recordId(candidate));
        if (!delivery || recordString(delivery, "status") !== update.from) return;
        delivery.set("status", update.to);
        delivery.set("claim_token", "");
        delivery.set("lease_expires_at", "");
        delivery.set("error_code", update.code);
        delivery.set("failed_at", now.toISOString());
        app.save(delivery);
        terminalized[update.to] += 1;
      });
      if (page.length < 500) break;
    }
  });
  return terminalized;
}

function acquireCampaignLock(app, campaignId, nowValue, options) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const lockToken = secureToken(48, options);
  return runTransaction(app, (txApp) => {
    const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, campaignId);
    if (!campaign) return null;
    const status = recordString(campaign, "status");
    if (!["scheduled", "processing"].includes(status)) return null;
    const lockExpires = parsedDate(recordValue(campaign, "lock_expires_at"));
    if (recordString(campaign, "lock_token") && lockExpires && lockExpires.getTime() > now.getTime()) return null;
    const scheduledAt = parsedDate(recordValue(campaign, "scheduled_at"));
    if (status === "scheduled" && (!scheduledAt || scheduledAt.getTime() > now.getTime())) return null;

    try {
      validateCampaignForExecution(txApp, campaign, now, scheduledAt || now);
      assertCampaignQuota(txApp, campaign, now);
    } catch (error) {
      const code = safeErrorCode(error, "campaign_processing_failed");
      if (code === "plan_not_available" && status === "scheduled" && !recordString(campaign, "started_at")) {
        pauseCampaignForPlan(campaign);
      } else {
        terminalizeOutstandingDeliveries(txApp, campaignId, now);
        const counts = dispatch.deliveryStatusCounts(txApp, campaignId);
        const failed = counts.failed_permanent + counts.invalid_fid;
        campaign.set("selected_count", statusTotal(counts));
        campaign.set("accepted_count", counts.accepted);
        campaign.set("failed_count", failed);
        campaign.set("invalid_count", counts.invalid_fid);
        markCampaignFailure(campaign, code, now, counts.accepted > 0);
      }
      txApp.save(campaign);
      return { campaignId, terminal: true, status: recordString(campaign, "status") };
    }

    campaign.set("status", "processing");
    campaign.set("lock_token", lockToken);
    campaign.set("lock_expires_at", addSeconds(now, CAMPAIGN_LOCK_SECONDS));
    campaign.set("delete_after", "");
    const firstStart = !recordString(campaign, "started_at");
    if (firstStart) campaign.set("started_at", now.toISOString());
    txApp.save(campaign);
    if (firstStart) recordCampaignQuotaUsage(txApp, campaign, now);
    const selectedCount = materializeAudience(txApp, campaign, now);
    campaign.set("selected_count", selectedCount);
    txApp.save(campaign);
    return { campaignId, lockToken, terminal: false, selectedCount };
  });
}

function renewCampaignLock(app, campaignId, lockToken, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  return runTransaction(app, (txApp) => {
    const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, campaignId);
    if (!campaign
      || recordString(campaign, "status") !== "processing"
      || recordString(campaign, "lock_token") !== lockToken) return false;
    campaign.set("lock_expires_at", addSeconds(now, CAMPAIGN_LOCK_SECONDS));
    txApp.save(campaign);
    return true;
  });
}

function statusTotal(counts) {
  return Object.values(counts).reduce((sum, value) => sum + integerValue(value), 0);
}

function finalizeCampaign(app, campaignId, lockToken, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  return runTransaction(app, (txApp) => {
    const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, campaignId);
    if (!campaign
      || recordString(campaign, "status") !== "processing"
      || recordString(campaign, "lock_token") !== lockToken) return null;
    const counts = dispatch.deliveryStatusCounts(txApp, campaignId);
    const selected = statusTotal(counts);
    const failed = counts.failed_permanent + counts.invalid_fid;
    campaign.set("selected_count", selected);
    campaign.set("accepted_count", counts.accepted);
    campaign.set("failed_count", failed);
    campaign.set("invalid_count", counts.invalid_fid);
    const remaining = counts.pending + counts.claimed + counts.failed_transient;
    if (remaining > 0) {
      campaign.set("lock_token", "");
      campaign.set("lock_expires_at", "");
      txApp.save(campaign);
      return { status: "processing", counts };
    }
    if (selected === 0) {
      markCampaignFailure(campaign, "no_eligible_installations", now, false);
    } else if (counts.accepted === selected) {
      campaign.set("status", "sent");
      campaign.set("failure_code", "");
      campaign.set("completed_at", now.toISOString());
      campaign.set("delete_after", addDays(now, CAMPAIGN_RETENTION_DAYS));
      campaign.set("lock_token", "");
      campaign.set("lock_expires_at", "");
    } else if (counts.accepted > 0) {
      markCampaignFailure(campaign, "partial_delivery_failure", now, true);
    } else {
      markCampaignFailure(campaign, "delivery_failed", now, false);
    }
    txApp.save(campaign);
    return { status: recordString(campaign, "status"), counts };
  });
}

function processCampaignById(app, campaignId, nowValue, options) {
  const initialNow = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const acquired = acquireCampaignLock(app, campaignId, initialNow, options);
  if (!acquired || acquired.terminal) return acquired;
  for (let index = 0; index < MAX_BATCHES_PER_RUN; index += 1) {
    const campaign = findRecord(app, CAMPAIGNS_COLLECTION, campaignId);
    if (!campaign || recordString(campaign, "lock_token") !== acquired.lockToken) break;
    const now = options && typeof options.now === "function" ? options.now() : new Date();
    const claim = dispatch.claimCampaignDeliveries(app, campaign, now, options);
    if (!claim.claimedIds.length) break;
    dispatch.dispatchClaimedDeliveries(app, campaign, claim, now, options);
    if (!renewCampaignLock(app, campaignId, acquired.lockToken, now)) break;
  }
  const finalNow = options && typeof options.now === "function" ? options.now() : new Date();
  return finalizeCampaign(app, campaignId, acquired.lockToken, finalNow);
}

function scheduleCampaign(app, context, payload, nowValue, options) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  const config = options && options.config ? options.config : dispatch.relayConfig();
  if (options && options.requireRelayConfig && !config) throw codedError("relay_not_configured");
  const scheduledAt = payload.mode === "now" ? now : payload.scheduledAt;
  if (!scheduledAt || scheduledAt.getTime() < now.getTime() - 1000) throw codedError("invalid_payload");
  const campaign = runTransaction(app, (txApp) => {
    const current = findRecord(txApp, CAMPAIGNS_COLLECTION, payload.campaignId);
    if (!current || isRedactedCampaign(current)
      || relationId(current, "store") !== context.storeId) throw codedError("campaign_not_found");
    const status = recordString(current, "status");
    if (!["draft", "paused_plan"].includes(status)) {
      if (status === "scheduled") return current;
      throw codedError("campaign_not_schedulable");
    }
    validateCampaignForExecution(txApp, current, now, scheduledAt);
    current.set("status", "scheduled");
    current.set("scheduled_at", scheduledAt.toISOString());
    current.set("failure_code", "");
    current.set("canceled_at", "");
    current.set("completed_at", "");
    current.set("lock_token", "");
    current.set("lock_expires_at", "");
    current.set("delete_after", "");
    txApp.save(current);
    return current;
  });
  if (payload.mode === "now") {
    processCampaignById(app, recordId(campaign), now, { ...(options || {}), config });
  }
  return findRecord(app, CAMPAIGNS_COLLECTION, recordId(campaign)) || campaign;
}

function cancelCampaign(app, context, campaignId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  return runTransaction(app, (txApp) => {
    const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, campaignId);
    if (!campaign || isRedactedCampaign(campaign)
      || relationId(campaign, "store") !== context.storeId) throw codedError("campaign_not_found");
    const status = recordString(campaign, "status");
    if (status === "canceled") return campaign;
    if (!["draft", "scheduled", "paused_plan"].includes(status) || recordString(campaign, "started_at")) {
      throw codedError("campaign_not_cancelable");
    }
    campaign.set("status", "canceled");
    campaign.set("canceled_at", now.toISOString());
    campaign.set("failure_code", "");
    campaign.set("lock_token", "");
    campaign.set("lock_expires_at", "");
    campaign.set("delete_after", addDays(now, CAMPAIGN_RETENTION_DAYS));
    txApp.save(campaign);
    return campaign;
  });
}

function duplicateCampaign(app, context, campaignId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  const source = findRecord(app, CAMPAIGNS_COLLECTION, campaignId);
  if (!source || isRedactedCampaign(source)
    || relationId(source, "store") !== context.storeId) throw codedError("campaign_not_found");
  const targetType = recordString(source, "target_type");
  const mediaId = relationId(source, "media");
  if (mediaId) validateMedia(app, mediaId, context.storeId, now);
  const payload = {
    campaignId: "",
    mediaId,
    targetRef: campaignTargetReference(source, targetType),
    title: recordString(source, "title"),
    body: recordString(source, "body"),
    timezone: CAMPAIGN_TIMEZONE,
    audienceType: recordString(source, "audience_type"),
    audienceConfig: normalizedAudienceConfig(
      recordString(source, "audience_type"),
      recordAudienceConfig(source),
      targetType,
    ),
    targetType,
    targetSection: recordString(source, "target_section"),
  };
  return createOrUpdateDraft(app, context, payload, now);
}

function previewAudience(app, context, campaignId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  const campaign = findRecord(app, CAMPAIGNS_COLLECTION, campaignId);
  if (!campaign || isRedactedCampaign(campaign)
    || relationId(campaign, "store") !== context.storeId) throw codedError("campaign_not_found");
  if (!["draft", "scheduled", "paused_plan"].includes(recordString(campaign, "status"))) {
    return { count: integerValue(recordValue(campaign, "selected_count")), snapshot: true };
  }
  validateCampaignForExecution(app, campaign, now, parsedDate(recordValue(campaign, "scheduled_at")) || now);
  return { count: eligibleInstallations(app, campaign, now).length, snapshot: false };
}

function previewAudienceDefinition(app, context, payload, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  const campaign = {
    store: context.storeId,
    audience_type: payload.audienceType,
    audience_config: payload.audienceConfig,
    target_type: payload.targetType,
  };
  return { count: eligibleInstallations(app, campaign, now).length, snapshot: false };
}

function deliverySummary(app, campaignId) {
  return dispatch.deliveryStatusCounts(app, campaignId);
}

function pauseDowngradedScheduledCampaigns(app) {
  const candidateIds = [];
  for (let offset = 0; ; offset += 500) {
    const page = findRecordsStrict(app, CAMPAIGNS_COLLECTION, 'status = "scheduled"', "id", 500, offset, {});
    page.forEach((candidate) => candidateIds.push(recordId(candidate)));
    if (page.length < 500) break;
  }
  let paused = 0;
  candidateIds.forEach((candidateId) => {
    const candidate = findRecord(app, CAMPAIGNS_COLLECTION, candidateId);
    if (!candidate || recordString(candidate, "status") !== "scheduled") return;
      const store = findRecord(app, "stores", relationId(candidate, "store"));
      const allowed = store
        && recordString(store, "status") === "active"
        && capabilities.hasStoreCapability(store, CAMPAIGN_CAPABILITY, { enforceExpiration: true });
      if (allowed) return;
      runTransaction(app, (txApp) => {
        const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, recordId(candidate));
        if (!campaign || recordString(campaign, "status") !== "scheduled" || recordString(campaign, "started_at")) return;
        pauseCampaignForPlan(campaign);
        txApp.save(campaign);
        paused += 1;
      });
  });
  return paused;
}

function runCampaignScheduler(app, nowValue, options) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const paused = pauseDowngradedScheduledCampaigns(app);
  const scheduled = findRecordsStrict(
    app,
    CAMPAIGNS_COLLECTION,
    'status = "scheduled" && scheduled_at != "" && scheduled_at <= {:now}',
    "scheduled_at,id",
    SCHEDULER_CAMPAIGN_LIMIT,
    0,
    { now: now.toISOString() },
  );
  const processing = findRecordsStrict(
    app,
    CAMPAIGNS_COLLECTION,
    'status = "processing" && (lock_token = "" || lock_expires_at = "" || lock_expires_at <= {:now})',
    "updated,id",
    SCHEDULER_CAMPAIGN_LIMIT,
    0,
    { now: now.toISOString() },
  );
  const ids = [];
  scheduled.concat(processing).forEach((campaign) => {
    const id = recordId(campaign);
    if (!ids.includes(id) && ids.length < SCHEDULER_CAMPAIGN_LIMIT) ids.push(id);
  });
  const results = [];
  ids.forEach((id) => {
    try { results.push({ id, result: processCampaignById(app, id, now, options) }); }
    catch (_) { results.push({ id, result: null }); }
  });
  return { paused, processed: results.length, results };
}

function deleteCampaignRecords(app, collection, campaignId) {
  let deleted = 0;
  for (;;) {
    const page = findRecordsStrict(
      app,
      collection,
      "campaign = {:campaign}",
      "id",
      500,
      0,
      { campaign: campaignId },
    );
    if (!page.length) return deleted;
    page.forEach((record) => {
      app.delete(record);
      deleted += 1;
    });
  }
}

function redactCampaignContent(app, campaign, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (isRedactedCampaign(campaign)) return false;
  if (recordString(campaign, "started_at")) recordCampaignQuotaUsage(app, campaign, now);
  campaign.set("title", "Contenido eliminado");
  campaign.set("body", "Contenido eliminado por la política de retención.");
  campaign.set("created_by", "");
  campaign.set("media", "");
  campaign.set("audience_type", "all_active");
  campaign.set("audience_config", {});
  campaign.set("target_type", "home");
  campaign.set("target_section", "");
  campaign.set("target_product", "");
  campaign.set("target_category", "");
  campaign.set("target_order", "");
  campaign.set("target_raffle", "");
  campaign.set("target_coupon", "");
  campaign.set("target_path", "");
  campaign.set("lock_token", "");
  campaign.set("lock_expires_at", "");
  campaign.set("redacted_at", now.toISOString());
  const technicalAnchor = parsedDate(recordValue(campaign, "completed_at"))
    || parsedDate(recordValue(campaign, "canceled_at"))
    || parsedDate(recordValue(campaign, "started_at"))
    || parsedDate(recordValue(campaign, "created"))
    || now;
  campaign.set("delete_after", addDays(technicalAnchor, TECHNICAL_RETENTION_DAYS));
  app.save(campaign);
  return true;
}

function deleteExpiredCampaignRecords(app, collection, campaignId, now) {
  let deleted = 0;
  for (;;) {
    const page = findRecordsStrict(
      app,
      collection,
      'campaign = {:campaign} && delete_after != "" && delete_after <= {:now}',
      "delete_after,id",
      500,
      0,
      { campaign: campaignId, now: now.toISOString() },
    );
    if (!page.length) return deleted;
    page.forEach((record) => {
      app.delete(record);
      deleted += 1;
    });
  }
}

function latestCampaignChildExpiry(app, campaignId, now) {
  let latest = null;
  for (const collection of ["push_events", DELIVERIES_COLLECTION, "push_daily_stats"]) {
    const rows = findRecordsStrict(
      app,
      collection,
      'campaign = {:campaign}',
      "-delete_after,id",
      1,
      0,
      { campaign: campaignId },
    );
    if (!rows.length) continue;
    const expiry = parsedDate(recordValue(rows[0], "delete_after")) || addDays(now, 1);
    const parsedExpiry = expiry instanceof Date ? expiry : parsedDate(expiry);
    if (parsedExpiry && (!latest || parsedExpiry.getTime() > latest.getTime())) latest = parsedExpiry;
  }
  return latest;
}

function deleteCampaignsPermanently(app, context, campaignIds, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  assertCampaignAccess(app, context);
  if (!Array.isArray(campaignIds)
    || campaignIds.length < 1
    || campaignIds.length > DELETE_CAMPAIGN_LIMIT
    || campaignIds.some((id, index) => !RECORD_ID_PATTERN.test(String(id || "")) || campaignIds.indexOf(id) !== index)) {
    throw codedError("invalid_payload");
  }
  return runTransaction(app, (txApp) => {
    const records = campaignIds.map((campaignId) => {
      const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, campaignId);
      if (!campaign || relationId(campaign, "store") !== context.storeId) throw codedError("campaign_not_found");
      if (recordString(campaign, "status") === "processing") throw codedError("campaign_not_deletable");
      return campaign;
    });
    const summary = {
      deleted_ids: [], deleted_count: 0, redacted_count: 0,
      deliveries_deleted: 0, events_deleted: 0,
    };
    records.forEach((campaign) => {
      const campaignId = recordId(campaign);
      if (redactCampaignContent(txApp, campaign, now)) summary.redacted_count += 1;
      summary.deleted_ids.push(campaignId);
      summary.deleted_count += 1;
    });
    return summary;
  });
}

function cleanupExpiredCampaigns(app, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const summary = { redacted: 0, deleted: 0, deliveries: 0, events: 0, daily_stats: 0, failed: 0 };
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
    const due = findRecordsStrict(
      app,
      CAMPAIGNS_COLLECTION,
      'delete_after != "" && delete_after <= {:now}'
        + ' && (status = "draft" || status = "sent" || status = "partially_sent"'
        + ' || status = "failed" || status = "canceled")',
      "delete_after,id",
      CLEANUP_CAMPAIGN_LIMIT,
      0,
      { now: now.toISOString() },
    );
    if (!due.length) break;
    let deletedThisBatch = 0;
    due.forEach((candidate) => {
      try {
        const result = runTransaction(app, (txApp) => {
          const campaign = findRecord(txApp, CAMPAIGNS_COLLECTION, recordId(candidate));
          if (!campaign) return null;
          const status = recordString(campaign, "status");
          const deleteAfter = parsedDate(recordValue(campaign, "delete_after"));
          if (!["draft", "sent", "partially_sent", "failed", "canceled"].includes(status)
            || !deleteAfter
            || deleteAfter.getTime() > now.getTime()) return null;
          if (!isRedactedCampaign(campaign)) {
            redactCampaignContent(txApp, campaign, now);
            return { redacted: true, deleted: false, deliveries: 0, events: 0, dailyStats: 0 };
          }
          const campaignId = recordId(campaign);
          const events = deleteExpiredCampaignRecords(txApp, "push_events", campaignId, now);
          const deliveries = deleteExpiredCampaignRecords(txApp, DELIVERIES_COLLECTION, campaignId, now);
          const dailyStats = deleteExpiredCampaignRecords(txApp, "push_daily_stats", campaignId, now);
          const latestExpiry = latestCampaignChildExpiry(txApp, campaignId, now);
          if (latestExpiry && latestExpiry.getTime() > now.getTime()) {
            campaign.set("delete_after", latestExpiry.toISOString());
            txApp.save(campaign);
            return { redacted: false, deleted: false, deliveries, events, dailyStats };
          }
          txApp.delete(campaign);
          return { redacted: false, deleted: true, deliveries, events, dailyStats };
        });
        if (!result) return;
        if (result.redacted) summary.redacted += 1;
        if (result.deleted) summary.deleted += 1;
        summary.deliveries += result.deliveries;
        summary.events += result.events;
        summary.daily_stats += result.dailyStats;
        deletedThisBatch += 1;
      } catch (_) {
        summary.failed += 1;
      }
    });
    if (due.length < CLEANUP_CAMPAIGN_LIMIT || deletedThisBatch === 0) break;
  }
  return summary;
}

function requestContext(e) {
  const info = e.requestInfo();
  const app = e.app || $app;
  const context = loadCampaignAccessContext(
    app,
    info && info.auth || e.auth,
    headerValue(info, "X-PZ-Support-Store"),
  );
  assertCampaignAccess(app, context);
  return { app, context, info };
}

function sendError(e, error, fallback) {
  const code = safeErrorCode(error, fallback);
  return e.json(errorStatus(code), { ok: false, error: code });
}

function handleSave(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const payload = parseSavePayload(request.info && request.info.body || {});
    if (!payload) throw codedError("invalid_payload");
    const campaign = createOrUpdateDraft(request.app, request.context, payload, new Date());
    return e.json(payload.campaignId ? 200 : 201, { ok: true, campaign: mapCampaign(campaign) });
  } catch (error) {
    return sendError(e, error, "campaign_save_failed");
  }
}

function handleAudiencePreview(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const payload = parseAudiencePreviewPayload(request.info && request.info.body || {});
    if (!payload) throw codedError("invalid_payload");
    const audience = payload.campaignId
      ? previewAudience(request.app, request.context, payload.campaignId, new Date())
      : previewAudienceDefinition(request.app, request.context, payload, new Date());
    return e.json(200, { ok: true, audience });
  } catch (error) {
    return sendError(e, error, "campaign_processing_failed");
  }
}

function handleSchedule(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const payload = parseSchedulePayload(request.info && request.info.body || {});
    if (!payload) throw codedError("invalid_payload");
    const campaign = scheduleCampaign(request.app, request.context, payload, new Date(), {
      requireRelayConfig: true,
    });
    return e.json(200, { ok: true, campaign: mapCampaign(campaign) });
  } catch (error) {
    return sendError(e, error, "campaign_schedule_failed");
  }
}

function handleCancel(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const payload = parseCampaignIdPayload(request.info && request.info.body || {});
    if (!payload) throw codedError("invalid_payload");
    const campaign = cancelCampaign(request.app, request.context, payload.campaignId, new Date());
    return e.json(200, { ok: true, campaign: mapCampaign(campaign) });
  } catch (error) {
    return sendError(e, error, "campaign_cancel_failed");
  }
}

function handleDuplicate(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const payload = parseCampaignIdPayload(request.info && request.info.body || {});
    if (!payload) throw codedError("invalid_payload");
    const campaign = duplicateCampaign(request.app, request.context, payload.campaignId, new Date());
    return e.json(201, { ok: true, campaign: mapCampaign(campaign) });
  } catch (error) {
    return sendError(e, error, "campaign_duplicate_failed");
  }
}

function handleDelete(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const payload = parseCampaignIdsPayload(request.info && request.info.body || {});
    if (!payload) throw codedError("invalid_payload");
    const summary = deleteCampaignsPermanently(
      request.app,
      request.context,
      payload.campaignIds,
      new Date(),
    );
    return e.json(200, { ok: true, ...summary });
  } catch (error) {
    return sendError(e, error, "campaign_delete_failed");
  }
}

function queryValue(info, key) {
  const query = info && info.query;
  if (!query) return "";
  try {
    if (typeof query.get === "function") return String(query.get(key) || "").trim();
  } catch (_) {}
  return String(query[key] || "").trim();
}

function handleList(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const page = Math.max(1, Math.min(100000, Number(queryValue(request.info, "page")) || 1));
    const status = bounded(queryValue(request.info, "status"), 30);
    if (status && !schema.COLLECTION_STATES.push_campaigns.includes(status)) throw codedError("invalid_payload");
    const filter = status
      ? 'store = {:store} && status = {:status} && redacted_at = ""'
      : 'store = {:store} && redacted_at = ""';
    const params = { store: request.context.storeId, ...(status ? { status } : {}) };
    const pageRecords = findRecordsStrict(
      request.app,
      CAMPAIGNS_COLLECTION,
      filter,
      "-created,id",
      CAMPAIGN_PAGE_SIZE + 1,
      (page - 1) * CAMPAIGN_PAGE_SIZE,
      params,
    );
    const hasMore = pageRecords.length > CAMPAIGN_PAGE_SIZE;
    const records = pageRecords.slice(0, CAMPAIGN_PAGE_SIZE);
    const quota = campaignQuotaUsage(request.app, request.context.storeId, new Date());
    return e.json(200, {
      ok: true,
      page,
      per_page: CAMPAIGN_PAGE_SIZE,
      has_more: hasMore,
      quota_timezone: quota.timezone,
      quota,
      campaigns: records.map(mapCampaign),
    });
  } catch (error) {
    return sendError(e, error, "campaign_processing_failed");
  }
}

function handleTargets(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    return e.json(200, {
      ok: true,
      targets: listTargetOptions(request.app, request.context, new Date()),
    });
  } catch (error) {
    return sendError(e, error, "campaign_processing_failed");
  }
}

function handleDetail(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e);
    const campaignId = bounded(e.request.pathValue("id"), 15);
    if (!RECORD_ID_PATTERN.test(campaignId)) throw codedError("campaign_not_found");
    const campaign = findRecord(request.app, CAMPAIGNS_COLLECTION, campaignId);
    if (!campaign || isRedactedCampaign(campaign)
      || relationId(campaign, "store") !== request.context.storeId) throw codedError("campaign_not_found");
    const analytics = typeof __hooks === "undefined"
      ? require("./pz_storefront_analytics_lib.js")
      : require(`${__hooks}/pz_storefront_analytics_lib.js`);
    return e.json(200, {
      ok: true,
      campaign: mapCampaign(campaign),
      deliveries: deliverySummary(request.app, campaignId),
      metrics: analytics.campaignMetrics(request.app, campaignId, request.context.storeId),
    });
  } catch (error) {
    return sendError(e, error, "campaign_processing_failed");
  }
}

module.exports = {
  CAMPAIGNS_COLLECTION,
  CAMPAIGN_CAPABILITY,
  CAMPAIGN_LOCK_SECONDS,
  CAMPAIGN_PAGE_SIZE,
  CAMPAIGN_PERMISSION,
  CAMPAIGN_RETENTION_DAYS,
  CAMPAIGN_TIMEZONE,
  CLEANUP_CAMPAIGN_LIMIT,
  DELETE_CAMPAIGN_LIMIT,
  DAILY_CAMPAIGN_LIMIT,
  DELIVERY_RETENTION_DAYS,
  MAX_BATCHES_PER_RUN,
  MONTHLY_CAMPAIGN_LIMIT,
  QUOTA_ENTRY_RETENTION_DAYS,
  SECTION_PATHS,
  STORE_QUOTA_STATE_FIELD,
  TERMINAL_DELIVERY_STATES,
  acquireCampaignLock,
  assertCampaignAccess,
  assertCampaignQuota,
  calendarKeys,
  campaignQuotaUsage,
  campaignQuotaState,
  cancelCampaign,
  cleanupExpiredCampaigns,
  createOrUpdateDraft,
  creatorAuthorized,
  deliverySummary,
  deleteCampaignsPermanently,
  duplicateCampaign,
  eligibleInstallations,
  finalizeCampaign,
  handleAudiencePreview,
  handleCancel,
  handleDetail,
  handleDelete,
  handleDuplicate,
  handleList,
  handleSave,
  handleSchedule,
  handleTargets,
  installationMatchesAudience,
  isValidTimezone,
  loadCampaignAccessContext,
  listTargetOptions,
  mapCampaign,
  materializeAudience,
  normalizedAudienceConfig,
  parseAudiencePreviewPayload,
  parseCampaignIdPayload,
  parseCampaignIdsPayload,
  parseSavePayload,
  parseSchedulePayload,
  pauseDowngradedScheduledCampaigns,
  previewAudience,
  previewAudienceDefinition,
  processCampaignById,
  recordCampaignQuotaUsage,
  recordAudienceConfig,
  renewCampaignLock,
  requireAuthenticatedUser,
  raffleAvailable,
  resolveTarget,
  runCampaignScheduler,
  scheduleCampaign,
  terminalizeOutstandingDeliveries,
  timezoneParts,
  validateCampaignForExecution,
  validateMedia,
};
