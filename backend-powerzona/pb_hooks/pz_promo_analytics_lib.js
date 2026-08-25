/// <reference path="../pb_data/types.d.ts" />

"use strict";

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);

const COLLECT_CONTRACT = "promo.analytics.collect.v1";
const ACCEPTED_CONTRACT = "promo.analytics.accepted.v1";
const SUMMARY_REQUEST_CONTRACT = "promo.analytics.summary.read.v1";
const SUMMARY_CONTRACT = "promo.analytics.summary.v1";
const EVENT_TYPES = Object.freeze(["page_view", "section_view", "contact_activate", "landing_qr_open"]);
const CONTACT_TYPES = Object.freeze(["whatsapp", "phone", "email", "internal_form", "approved_live_chat"]);
const RANGE_DAYS = Object.freeze([7, 30, 90]);
const EVENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECTION_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

class PromoAnalyticsError extends Error {
  constructor(code, status) {
    super(code || "promo_analytics_unavailable");
    this.name = "PromoAnalyticsError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 503;
  }
}

function fail(code, status) {
  throw new PromoAnalyticsError(code, status);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_payload", 400);
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) fail("invalid_payload", 400);
    return normalized;
  } catch (error) {
    if (error instanceof PromoAnalyticsError) throw error;
    fail("invalid_payload", 400);
  }
}

function exactKeys(object, keys) {
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail("invalid_payload", 400);
  }
}

function canonicalLocale(value) {
  try {
    const locale = data.canonicalLocale(value);
    if (locale !== value) fail("invalid_payload", 400);
    return locale;
  } catch (error) {
    if (error instanceof PromoAnalyticsError) throw error;
    fail("invalid_payload", 400);
  }
}

function parseCollect(value) {
  const body = plainObject(value);
  const type = String(body.event_type || "");
  const keys = ["contract", "event_id", "event_type", "locale"]
    .concat(type === "section_view" ? ["section_key"] : []);
  exactKeys(body, keys);
  if (body.contract !== COLLECT_CONTRACT || !EVENT_TYPES.includes(type)
    || typeof body.event_id !== "string" || !EVENT_ID_PATTERN.test(body.event_id)) {
    fail("invalid_payload", 400);
  }
  const locale = canonicalLocale(body.locale);
  const sectionKey = type === "section_view" ? String(body.section_key || "") : "";
  if (type === "section_view" && !SECTION_KEY_PATTERN.test(sectionKey)) fail("invalid_payload", 400);
  return Object.freeze({ eventId: body.event_id, eventType: type, locale, sectionKey });
}

function parseSummary(value) {
  const body = plainObject(value);
  exactKeys(body, ["contract", "range_days"]);
  if (body.contract !== SUMMARY_REQUEST_CONTRACT || !RANGE_DAYS.includes(body.range_days)) {
    fail("invalid_payload", 400);
  }
  return Object.freeze({ rangeDays: body.range_days });
}

function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("promo_analytics_unavailable", 503);
  return date.toISOString().slice(0, 10);
}

function rangeBounds(now, days) {
  if (!RANGE_DAYS.includes(days)) fail("invalid_payload", 400);
  const date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(date.getTime())) fail("promo_analytics_unavailable", 503);
  const to = utcDay(date);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return Object.freeze({ from: utcDay(date), to });
}

function themeKey(profile) {
  const theme = profile && profile.theme || {};
  const id = String(theme.theme_id || "");
  const version = String(theme.version || "");
  const key = `${id}@${version}`;
  if (!/^[a-z0-9._-]+@[0-9A-Za-z.-]+$/.test(key) || key.length > 140) {
    fail("promo_analytics_unavailable", 503);
  }
  return key;
}

function validateAgainstProfile(parsed, profile) {
  if (!profile || !profile.locale || parsed.locale !== profile.locale.effective) {
    fail("promo_analytics_unavailable", 404);
  }
  let dimensionKey = "";
  let actionType = "";
  if (parsed.eventType === "section_view") {
    const sections = Array.isArray(profile.sections) ? profile.sections : [];
    if (!sections.some((section) => section && section.key === parsed.sectionKey)) {
      fail("promo_analytics_unavailable", 404);
    }
    dimensionKey = parsed.sectionKey;
  } else if (parsed.eventType === "contact_activate") {
    const action = profile.contact_action && profile.contact_action.available
      ? profile.contact_action.action : null;
    actionType = String(action && action.type || "");
    if (!CONTACT_TYPES.includes(actionType)) fail("promo_analytics_unavailable", 404);
    dimensionKey = actionType;
  } else if (parsed.eventType === "landing_qr_open") {
    if (!profile.landing_qr_link || profile.landing_qr_link.enabled !== true
      || !profile.landing_qr_link.link) fail("promo_analytics_unavailable", 404);
  }
  return Object.freeze({ actionType, dimensionKey, themeKey: themeKey(profile) });
}

function emptyCounts() {
  return { page_views: 0, section_views: 0, contact_activations: 0, landing_qr_opens: 0 };
}

function countKey(type) {
  return ({
    page_view: "page_views",
    section_view: "section_views",
    contact_activate: "contact_activations",
    landing_qr_open: "landing_qr_opens",
  })[type] || "";
}

function addCount(target, type, value) {
  const key = countKey(type);
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  if (key) target[key] += count;
}

module.exports = {
  ACCEPTED_CONTRACT,
  COLLECT_CONTRACT,
  CONTACT_TYPES,
  EVENT_ID_PATTERN,
  EVENT_TYPES,
  PromoAnalyticsError,
  RANGE_DAYS,
  SECTION_KEY_PATTERN,
  SUMMARY_CONTRACT,
  SUMMARY_REQUEST_CONTRACT,
  addCount,
  countKey,
  emptyCounts,
  exactKeys,
  parseCollect,
  parseSummary,
  rangeBounds,
  themeKey,
  utcDay,
  validateAgainstProfile,
};
