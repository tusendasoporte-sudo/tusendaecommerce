/// <reference path="../pb_data/types.d.ts" />

"use strict";

const PUBLIC_RATING_CONTRACT = "promo.store-rating.v1";
const PRIVATE_LIST_CONTRACT = "promo.reviews.list.v1";
const PRIVATE_LIST_RESPONSE_CONTRACT = "promo.reviews.page.v1";
const PRIVATE_MODERATE_CONTRACT = "promo.reviews.moderate.v1";
const PRIVATE_MODERATE_RESPONSE_CONTRACT = "promo.reviews.moderation.v1";
const PUBLIC_REVIEW_LIMIT = 12;
const PRIVATE_PAGE_SIZE = 10;
const REVIEW_STATUSES = Object.freeze(["pending", "approved", "hidden", "rejected"]);
const REVIEW_FILTERS = Object.freeze(["all", ...REVIEW_STATUSES]);
const MODERATION_ACTIONS = Object.freeze(["approve", "reject", "hide", "feature", "unfeature"]);
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class PromoReviewsError extends Error {
  constructor(code, status) {
    super(code || "promo_reviews_unavailable");
    this.name = "PromoReviewsError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 503;
  }
}

function fail(code, status) {
  throw new PromoReviewsError(code, status);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    if (typeof normalized === "string") {
      const reparsed = JSON.parse(normalized);
      return reparsed && typeof reparsed === "object" && !Array.isArray(reparsed) ? reparsed : null;
    }
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) { return null; }
}

function exactPayload(value, keys) {
  const object = plainObject(value);
  if (!object) return null;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    ? object
    : null;
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = typeof record.get === "function" ? record.get(key) : record[key];
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  let value = "";
  try { value = String(recordValue(record, key) || "").trim(); } catch (_) { value = ""; }
  return Number.isInteger(max) ? value.slice(0, max) : value;
}

function recordId(record) {
  return recordString(record, "id", 80) || String(record && record.id || "");
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "") : "";
  return String(value || "");
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return String(value || "").toLowerCase() === "true";
}

function recordInteger(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isSafeInteger(value) ? value : null;
}

function safeReviewText(value, max, required) {
  let text = "";
  try { text = String(value === null || value === undefined ? "" : value).trim(); }
  catch (_) { return ""; }
  if (text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    || (required && !text)) return "";
  return text;
}

function publicDate(value) {
  const date = String(value || "").slice(0, 10);
  if (!DATE_PATTERN.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function ratingAdapterEnabled(projection) {
  const value = plainObject(projection);
  const adapters = value && plainObject(value.adapters);
  const storeRating = adapters && plainObject(adapters.store_rating);
  if (!storeRating || storeRating.enabled !== true || !Array.isArray(value.sections)) return false;
  return value.sections.some((section) => {
    const normalized = plainObject(section);
    return normalized && normalized.type === "store_rating";
  });
}

function emptyPublicRating(enabled) {
  return Object.freeze({
    contract: PUBLIC_RATING_CONTRACT,
    enabled: enabled === true,
    summary: Object.freeze({ average: 0, count: 0 }),
    reviews: Object.freeze([]),
  });
}

function projectPublicReview(record, storeId) {
  const rating = recordInteger(record, "rating");
  const name = safeReviewText(recordString(record, "customer_name"), 120, true);
  if (relationId(record, "store") !== storeId || recordString(record, "type") !== "store"
    || recordString(record, "status") !== "approved" || rating === null || rating < 1 || rating > 5 || !name) {
    return null;
  }
  return Object.freeze({
    rating,
    name,
    comment: safeReviewText(recordString(record, "comment"), 1200, false),
    date: publicDate(recordString(record, "created")),
  });
}

function normalizedSummary(row) {
  const count = Math.max(0, Number(row && (row.count || row.total)) || 0);
  const totalRating = Math.max(0, Number(row && (row.total_rating || row.rating_total)) || 0);
  return Object.freeze({
    average: count ? Math.round((totalRating / count) * 10) / 10 : 0,
    count: Math.trunc(count),
  });
}

function projectPublicRating(storeId, rows, summaryRow) {
  if (!RECORD_ID_PATTERN.test(String(storeId || "")) || !Array.isArray(rows)) {
    fail("promo_reviews_unavailable", 503);
  }
  const reviews = rows.slice(0, PUBLIC_REVIEW_LIMIT)
    .map((record) => projectPublicReview(record, storeId))
    .filter(Boolean);
  return Object.freeze({
    contract: PUBLIC_RATING_CONTRACT,
    enabled: true,
    summary: normalizedSummary(summaryRow),
    reviews: Object.freeze(reviews),
  });
}

function parseList(value) {
  const body = exactPayload(value, ["contract", "status", "page"]);
  const page = body && Number(body.page);
  if (!body || body.contract !== PRIVATE_LIST_CONTRACT || !REVIEW_FILTERS.includes(body.status)
    || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
    fail("invalid_payload", 400);
  }
  return Object.freeze({ status: body.status, page });
}

function parseModeration(value) {
  const body = exactPayload(value, ["contract", "review_id", "action", "expected_updated"]);
  if (!body || body.contract !== PRIVATE_MODERATE_CONTRACT
    || !RECORD_ID_PATTERN.test(String(body.review_id || ""))
    || !MODERATION_ACTIONS.includes(body.action)
    || typeof body.expected_updated !== "string" || !body.expected_updated
    || body.expected_updated.length > 80) {
    fail("invalid_payload", 400);
  }
  return Object.freeze({
    reviewId: body.review_id,
    action: body.action,
    expectedUpdated: body.expected_updated,
  });
}

function moderationState(current, action, approvedAt) {
  const state = {
    status: String(current && current.status || ""),
    featured: current && current.featured === true,
    approved_at: String(approvedAt || ""),
  };
  if (!REVIEW_STATUSES.includes(state.status) || !MODERATION_ACTIONS.includes(action)) {
    fail("invalid_payload", 400);
  }
  if (action === "approve") return { status: "approved", featured: state.featured, approved_at: state.approved_at };
  if (action === "reject") return { status: "rejected", featured: false, approved_at: state.approved_at };
  if (action === "hide") return { status: "hidden", featured: false, approved_at: state.approved_at };
  if (state.status !== "approved") fail("invalid_review_transition", 409);
  return { ...state, featured: action === "feature" };
}

function privateReview(record, storeId) {
  const id = recordId(record);
  const rating = recordInteger(record, "rating");
  const status = recordString(record, "status");
  const updated = recordString(record, "updated", 80);
  if (!RECORD_ID_PATTERN.test(id) || relationId(record, "store") !== storeId
    || recordString(record, "type") !== "store" || !REVIEW_STATUSES.includes(status)
    || rating === null || rating < 1 || rating > 5 || !updated) {
    fail("promo_reviews_unavailable", 503);
  }
  return Object.freeze({
    id,
    rating,
    name: safeReviewText(recordString(record, "customer_name"), 120, true) || "Cliente",
    comment: safeReviewText(recordString(record, "comment"), 1200, false),
    status,
    featured: recordBool(record, "featured"),
    created: recordString(record, "created", 80),
    updated,
  });
}

module.exports = {
  DATE_PATTERN,
  MODERATION_ACTIONS,
  PRIVATE_LIST_CONTRACT,
  PRIVATE_LIST_RESPONSE_CONTRACT,
  PRIVATE_MODERATE_CONTRACT,
  PRIVATE_MODERATE_RESPONSE_CONTRACT,
  PRIVATE_PAGE_SIZE,
  PUBLIC_RATING_CONTRACT,
  PUBLIC_REVIEW_LIMIT,
  PromoReviewsError,
  REVIEW_FILTERS,
  REVIEW_STATUSES,
  emptyPublicRating,
  exactPayload,
  moderationState,
  normalizedSummary,
  parseList,
  parseModeration,
  plainObject,
  privateReview,
  projectPublicRating,
  projectPublicReview,
  publicDate,
  ratingAdapterEnabled,
  recordBool,
  recordId,
  recordInteger,
  recordString,
  recordValue,
  relationId,
  safeReviewText,
};
