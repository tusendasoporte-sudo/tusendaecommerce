/// <reference path="../pb_data/types.d.ts" />

"use strict";

const PUBLIC_LIST_CONTRACT = "promo.reviews.public-list.v1";
const PUBLIC_PAGE_CONTRACT = "promo.reviews.public-page.v1";
const PUBLIC_SUBMIT_CONTRACT = "promo.review.submit.v1";
const PUBLIC_SUBMISSION_CONTRACT = "promo.review.submission.v1";
const PUBLIC_REQUEST_CONTEXT_CONTRACT = "promo.review-request.context.v1";
const PUBLIC_REQUEST_CONTEXT_RESPONSE_CONTRACT = "promo.review-request.context-response.v1";
const PUBLIC_REQUEST_PHOTO_CONTRACT = "promo.review-request.photo.v1";
const PRIVATE_CREATE_CONTRACT = "promo.review-requests.create.v1";
const PRIVATE_CREATED_CONTRACT = "promo.review-requests.created.v1";
const PRIVATE_LIST_CONTRACT = "promo.review-requests.list.v1";
const PRIVATE_PAGE_CONTRACT = "promo.review-requests.page.v1";
const PRIVATE_REVOKE_CONTRACT = "promo.review-requests.revoke.v1";
const PRIVATE_REVOKED_CONTRACT = "promo.review-requests.revoked.v1";

const PUBLIC_PAGE_SIZE = 12;
const PRIVATE_PAGE_SIZE = 20;
const MAX_PHOTOS = 3;
const MAX_REQUEST_DAYS = 30;
const REQUEST_STATUSES = Object.freeze(["pending", "received", "expired", "revoked"]);
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,96}$/;
const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const URL_PATTERN = /(?:\b(?:https?|ftp):\/\/|\bwww\.|\b[a-z0-9.-]+\.(?:com|net|org|io|co|app|dev|xyz|info|biz)(?:\b|\/))/i;

class PromoReviewRequestError extends Error {
  constructor(code, status) {
    super(code || "promo_reviews_unavailable");
    this.name = "PromoReviewRequestError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 503;
  }
}

function fail(code, status) {
  throw new PromoReviewRequestError(code, status);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) { return null; }
}

function exactPayload(value, keys) {
  const object = plainObject(value);
  if (!object) return null;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]) ? object : null;
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

function text(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Number.isInteger(max) ? max : 1000);
}

function recordString(record, key, max) {
  return text(recordValue(record, key), max);
}

function recordId(record) {
  return recordString(record, "id", 15) || text(record && record.id, 15);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return value.length === 1 ? text(value[0], 15) : "";
  if (value && typeof value === "object") return text(value.id, 15);
  return text(value, 15);
}

function relationIds(record, key) {
  const value = recordValue(record, key);
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return values.map((item) => text(item && typeof item === "object" ? item.id : item, 15))
    .filter((item, index, all) => RECORD_ID_PATTERN.test(item) && all.indexOf(item) === index);
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return String(value || "").toLowerCase() === "true";
}

function cleanText(value, maximum, required) {
  if (typeof value !== "string" || value.length > maximum) fail("invalid_payload", 400);
  const normalized = value.trim();
  if ((required && !normalized)
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
    || /<\/?[a-z][^>]*>/i.test(normalized)
    || /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(normalized)
    || URL_PATTERN.test(normalized)) fail("unsafe_review_content", 400);
  return normalized;
}

function safeLabel(value, maximum) {
  if (typeof value !== "string" || value.length > maximum) fail("invalid_payload", 400);
  const normalized = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(normalized) || /<\/?[a-z][^>]*>/i.test(normalized)) {
    fail("unsafe_review_content", 400);
  }
  return normalized;
}

function integer(value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail("invalid_payload", 400);
  return parsed;
}

function parsePublicList(query) {
  const body = exactPayload(query, ["contract", "locale", "page"]);
  if (!body || body.contract !== PUBLIC_LIST_CONTRACT || !LOCALE_PATTERN.test(String(body.locale || ""))) {
    fail("invalid_payload", 400);
  }
  return Object.freeze({ locale: body.locale, page: integer(body.page, 1, 100000) });
}

function parsePublicSubmission(value) {
  const body = exactPayload(value, [
    "comment", "contract", "honeypot", "name", "photo_consent", "rating", "rendered_at", "request_token",
  ]);
  if (!body || body.contract !== PUBLIC_SUBMIT_CONTRACT || body.honeypot !== ""
    || typeof body.photo_consent !== "boolean") fail("invalid_payload", 400);
  const token = String(body.request_token || "");
  if (token && !TOKEN_PATTERN.test(token)) fail("invalid_review_request", 404);
  const renderedAt = integer(body.rendered_at, 1, Number.MAX_SAFE_INTEGER);
  const now = Date.now();
  if (renderedAt > now || now - renderedAt < 2000 || now - renderedAt > 2 * 60 * 60 * 1000) {
    fail("review_submission_too_fast", 429);
  }
  if (!token && body.photo_consent) fail("invalid_payload", 400);
  return Object.freeze({
    name: cleanText(body.name, 80, true),
    comment: cleanText(body.comment, 1000, true),
    rating: integer(body.rating, 1, 5),
    requestToken: token,
    photoConsent: body.photo_consent,
  });
}

function parseTokenPayload(value, contract, keys) {
  const body = exactPayload(value, keys);
  const token = body && String(body.token || "");
  if (!body || body.contract !== contract || !TOKEN_PATTERN.test(token)) fail("invalid_review_request", 404);
  return { body, token };
}

function parseRequestContext(value) {
  return Object.freeze(parseTokenPayload(value, PUBLIC_REQUEST_CONTEXT_CONTRACT, ["contract", "token"]));
}

function parseRequestPhoto(value) {
  const parsed = parseTokenPayload(value, PUBLIC_REQUEST_PHOTO_CONTRACT, ["contract", "index", "token"]);
  return Object.freeze({ token: parsed.token, index: integer(parsed.body.index, 0, MAX_PHOTOS - 1) });
}

function parsePrivateCreate(value) {
  const body = exactPayload(value, [
    "contract", "customer_label", "expires_days", "locale", "photo_asset_ids", "work_label",
  ]);
  if (!body || body.contract !== PRIVATE_CREATE_CONTRACT || !LOCALE_PATTERN.test(String(body.locale || ""))
    || !Array.isArray(body.photo_asset_ids) || body.photo_asset_ids.length > MAX_PHOTOS) fail("invalid_payload", 400);
  const photoAssetIds = body.photo_asset_ids.map((item) => String(item || ""));
  if (photoAssetIds.some((item) => !RECORD_ID_PATTERN.test(item))
    || new Set(photoAssetIds).size !== photoAssetIds.length) fail("invalid_payload", 400);
  return Object.freeze({
    locale: body.locale,
    customerLabel: safeLabel(body.customer_label, 120),
    workLabel: safeLabel(body.work_label, 240),
    expiresDays: integer(body.expires_days, 1, MAX_REQUEST_DAYS),
    photoAssetIds: Object.freeze(photoAssetIds),
  });
}

function parsePrivateList(value) {
  const body = exactPayload(value, ["contract", "page"]);
  if (!body || body.contract !== PRIVATE_LIST_CONTRACT) fail("invalid_payload", 400);
  return Object.freeze({ page: integer(body.page, 1, 100000) });
}

function parsePrivateRevoke(value) {
  const body = exactPayload(value, ["contract", "request_id"]);
  const id = body && String(body.request_id || "");
  if (!body || body.contract !== PRIVATE_REVOKE_CONTRACT || !RECORD_ID_PATTERN.test(id)) {
    fail("invalid_payload", 400);
  }
  return Object.freeze({ requestId: id });
}

function sha256(value) {
  try {
    const digest = String($security.sha256(String(value || "")) || "").toLowerCase();
    if (DIGEST_PATTERN.test(digest)) return digest;
  } catch (_) {}
  fail("promo_reviews_unavailable", 503);
}

function requestToken() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const token = String($security.randomString(72) || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
      if (TOKEN_PATTERN.test(token)) return token;
    } catch (_) {}
  }
  fail("promo_reviews_unavailable", 503);
}

function validDate(value) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requestState(record, now) {
  const status = recordString(record, "status", 20);
  if (!REQUEST_STATUSES.includes(status)) fail("promo_reviews_unavailable", 503);
  const expires = validDate(recordString(record, "expires_at", 80));
  if (!expires) fail("promo_reviews_unavailable", 503);
  return status === "pending" && expires.getTime() <= Number(now || Date.now()) ? "expired" : status;
}

function publicPhotoPath(slug, asset) {
  const id = recordId(asset);
  const digest = recordString(asset, "sha256", 64);
  if (!PUBLIC_SLUG_PATTERN.test(slug) || !RECORD_ID_PATTERN.test(id) || !DIGEST_PATTERN.test(digest)) return "";
  return `/api/pz/promo/public/v1/reviews/sites/${slug}/photos/${id}/${digest}/review.webp`;
}

function requestDescriptor(record) {
  const status = requestState(record);
  return Object.freeze({
    id: recordId(record),
    status,
    locale: recordString(record, "locale", 12),
    customer_label: recordString(record, "customer_label", 120),
    work_label: recordString(record, "work_label", 240),
    photo_asset_ids: Object.freeze(relationIds(record, "photo_assets")),
    review_id: relationId(record, "review"),
    photo_consent: recordBool(record, "photo_consent"),
    expires_at: recordString(record, "expires_at", 80),
    created: recordString(record, "created", 80),
  });
}

function publicReview(record, metadata) {
  const rating = Number(recordValue(record, "rating"));
  const name = text(recordValue(record, "customer_name"), 80);
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5 || !name
    || recordString(record, "type", 20) !== "store" || recordString(record, "status", 20) !== "approved") {
    fail("promo_reviews_unavailable", 503);
  }
  const created = recordString(record, "created", 80).slice(0, 10);
  return Object.freeze({
    rating,
    name,
    comment: text(recordValue(record, "comment"), 1000),
    date: /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : "",
    featured: recordBool(record, "featured"),
    service_verified: Boolean(metadata && metadata.verified),
    photos: Object.freeze(metadata && Array.isArray(metadata.photos) ? metadata.photos : []),
  });
}

module.exports = {
  DIGEST_PATTERN,
  LOCALE_PATTERN,
  MAX_PHOTOS,
  MAX_REQUEST_DAYS,
  PRIVATE_CREATE_CONTRACT,
  PRIVATE_CREATED_CONTRACT,
  PRIVATE_LIST_CONTRACT,
  PRIVATE_PAGE_CONTRACT,
  PRIVATE_PAGE_SIZE,
  PRIVATE_REVOKE_CONTRACT,
  PRIVATE_REVOKED_CONTRACT,
  PUBLIC_LIST_CONTRACT,
  PUBLIC_PAGE_CONTRACT,
  PUBLIC_PAGE_SIZE,
  PUBLIC_REQUEST_CONTEXT_CONTRACT,
  PUBLIC_REQUEST_CONTEXT_RESPONSE_CONTRACT,
  PUBLIC_REQUEST_PHOTO_CONTRACT,
  PUBLIC_SLUG_PATTERN,
  PUBLIC_SUBMISSION_CONTRACT,
  PUBLIC_SUBMIT_CONTRACT,
  PromoReviewRequestError,
  RECORD_ID_PATTERN,
  REQUEST_STATUSES,
  TOKEN_PATTERN,
  exactPayload,
  fail,
  parsePrivateCreate,
  parsePrivateList,
  parsePrivateRevoke,
  parsePublicList,
  parsePublicSubmission,
  parseRequestContext,
  parseRequestPhoto,
  plainObject,
  publicPhotoPath,
  publicReview,
  recordBool,
  recordId,
  recordString,
  recordValue,
  relationId,
  relationIds,
  requestDescriptor,
  requestState,
  requestToken,
  sha256,
  text,
  validDate,
};
