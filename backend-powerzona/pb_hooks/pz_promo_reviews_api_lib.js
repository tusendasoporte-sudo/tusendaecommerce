/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const promoAudit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const reviews = typeof __hooks === "undefined"
  ? require("./pz_promo_reviews_lib.js")
  : require(`${__hooks}/pz_promo_reviews_lib.js`);

const SAFE_ERROR_CODES = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "invalid_payload",
  "invalid_review_transition", "promo_reviews_conflict", "promo_reviews_unavailable",
]);

function codedError(code, status) {
  const safe = SAFE_ERROR_CODES.has(code) ? code : "promo_reviews_unavailable";
  const error = new Error(safe);
  error.code = safe;
  error.status = Number.isInteger(status) ? status : 503;
  return error;
}

function errorCode(error) {
  if (error instanceof reviews.PromoReviewsError) {
    return SAFE_ERROR_CODES.has(error.code) ? error.code : "promo_reviews_unavailable";
  }
  const code = String(error && (error.code || error.message) || "");
  return SAFE_ERROR_CODES.has(code) ? code : "promo_reviews_unavailable";
}

function statusForError(error) {
  if (error && Number.isInteger(error.status)) return error.status;
  const code = errorCode(error);
  if (code === "invalid_payload") return 400;
  if (["promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (["invalid_review_transition", "promo_reviews_conflict"].includes(code)) return 409;
  if (code === "promo_reviews_unavailable") return 503;
  return 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(statusForError(error), { ok: false, error: code });
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
  if (!e || !e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
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

function reviewsReady(app) {
  try {
    const collection = app.findCollectionByNameOrId("reviews");
    return ["store", "type", "rating", "customer_name", "comment", "status", "featured", "approved_at", "created", "updated"]
      .every((field) => !!collection.fields.getByName(field));
  } catch (_) { return false; }
}

function requestContext(e) {
  setPrivateHeaders(e);
  if (!reviewsReady(e.app)) throw codedError("promo_reviews_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !e.auth) throw codedError("unauthorized", 403);
  return { info, supportStoreId: requestHeader(info, "X-PZ-Promo-Store") };
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model || {}));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function summaryForStore(app, storeId) {
  const rows = queryRows(app, `
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
      COALESCE(SUM(CASE WHEN status = 'hidden' THEN 1 ELSE 0 END), 0) AS hidden,
      COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected,
      COALESCE(SUM(CASE WHEN status = 'approved' THEN rating ELSE 0 END), 0) AS approved_rating_total
    FROM reviews
    WHERE store = {:store} AND type = 'store'
  `, { store: storeId }, {
    total: 0, pending: 0, approved: 0, hidden: 0, rejected: 0, approved_rating_total: 0,
  });
  const row = rows[0] || {};
  const approved = Math.max(0, Math.trunc(Number(row.approved) || 0));
  const ratingTotal = Math.max(0, Number(row.approved_rating_total) || 0);
  return Object.freeze({
    total: Math.max(0, Math.trunc(Number(row.total) || 0)),
    pending: Math.max(0, Math.trunc(Number(row.pending) || 0)),
    approved,
    hidden: Math.max(0, Math.trunc(Number(row.hidden) || 0)),
    rejected: Math.max(0, Math.trunc(Number(row.rejected) || 0)),
    approved_average: approved ? Math.round((ratingTotal / approved) * 10) / 10 : 0,
  });
}

function publicSummaryForStore(app, storeId) {
  const rows = queryRows(app, `
    SELECT COUNT(*) AS count, COALESCE(SUM(rating), 0) AS total_rating
    FROM reviews
    WHERE store = {:store} AND type = 'store' AND status = 'approved' AND rating BETWEEN 1 AND 5
  `, { store: storeId }, { count: 0, total_rating: 0 });
  return rows[0] || { count: 0, total_rating: 0 };
}

function findPublicRows(app, storeId) {
  return Array.from(app.findRecordsByFilter(
    "reviews",
    "store = {:store} && type = 'store' && status = 'approved'",
    "-featured,-created,-id",
    reviews.PUBLIC_REVIEW_LIMIT,
    0,
    { store: storeId },
  ) || []);
}

function storeForContext(app, context) {
  if (context && context.store && reviews.recordId(context.store)) return context.store;
  const storeId = reviews.relationId(context && context.site, "store");
  if (!storeId) return null;
  try { return app.findRecordById("stores", storeId); } catch (_) { return null; }
}

function attachPublicRating(app, localized, context) {
  const enabled = reviews.ratingAdapterEnabled(localized);
  if (!enabled) return { ...localized, store_rating: reviews.emptyPublicRating(false) };
  const store = storeForContext(app, context);
  const storeId = reviews.recordId(store);
  if (!store || !storeId || reviews.recordString(store, "status") !== "active") {
    return { ...localized, store_rating: reviews.emptyPublicRating(false) };
  }
  try {
    return {
      ...localized,
      store_rating: reviews.projectPublicRating(
        storeId,
        findPublicRows(app, storeId),
        publicSummaryForStore(app, storeId),
      ),
    };
  } catch (_) {
    return { ...localized, store_rating: reviews.emptyPublicRating(false) };
  }
}

function statusFilter(status) {
  return status === "all" ? "" : " && status = {:status}";
}

function listRows(app, storeId, parsed) {
  return Array.from(app.findRecordsByFilter(
    "reviews",
    `store = {:store} && type = 'store'${statusFilter(parsed.status)}`,
    "-created,-id",
    reviews.PRIVATE_PAGE_SIZE,
    (parsed.page - 1) * reviews.PRIVATE_PAGE_SIZE,
    { store: storeId, ...(parsed.status === "all" ? {} : { status: parsed.status }) },
  ) || []);
}

function filteredTotal(app, storeId, status) {
  const rows = queryRows(app, `
    SELECT COUNT(*) AS total
    FROM reviews
    WHERE store = {:store} AND type = 'store'${statusFilter(status)}
  `, { store: storeId, ...(status === "all" ? {} : { status }) }, { total: 0 });
  return Math.max(0, Math.trunc(Number(rows[0] && rows[0].total) || 0));
}

function handleList(e) {
  try {
    const context = requestContext(e);
    const parsed = reviews.parseList(context.info.body || {});
    const decision = promo.requirePromoAction(e.app, e.auth, "promo.reviews.manage", {
      requestedStoreId: context.supportStoreId,
    });
    const storeId = reviews.recordId(decision.store);
    const totalItems = filteredTotal(e.app, storeId, parsed.status);
    const totalPages = Math.max(1, Math.ceil(totalItems / reviews.PRIVATE_PAGE_SIZE));
    if (parsed.page > totalPages && totalItems > 0) throw codedError("invalid_payload", 400);
    return e.json(200, {
      ok: true,
      contract: reviews.PRIVATE_LIST_RESPONSE_CONTRACT,
      filter: parsed.status,
      page: parsed.page,
      per_page: reviews.PRIVATE_PAGE_SIZE,
      total_items: totalItems,
      total_pages: totalPages,
      summary: summaryForStore(e.app, storeId),
      reviews: listRows(e.app, storeId, parsed).map((record) => reviews.privateReview(record, storeId)),
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function findReview(app, id) {
  try { return app.findRecordById("reviews", id); } catch (_) { return null; }
}

function lockReview(app, id) {
  app.db().newQuery("UPDATE reviews SET id = id WHERE id = {:id}").bind({ id }).execute();
}

function stateSnapshot(record) {
  return {
    status: reviews.recordString(record, "status"),
    featured: reviews.recordBool(record, "featured"),
    approved: Boolean(reviews.recordString(record, "approved_at")),
  };
}

function handleModerate(e) {
  let context;
  let parsed;
  try {
    context = requestContext(e);
    parsed = reviews.parseModeration(context.info.body || {});
  } catch (error) {
    return sendError(e, error);
  }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.reviews.manage", {
        requestedStoreId: context.supportStoreId,
      });
      const storeId = reviews.recordId(decision.store);
      let record = findReview(app, parsed.reviewId);
      if (!record || reviews.relationId(record, "store") !== storeId
        || reviews.recordString(record, "type") !== "store") {
        throw codedError("promo_not_found", 404);
      }
      lockReview(app, parsed.reviewId);
      record = findReview(app, parsed.reviewId);
      if (!record || reviews.relationId(record, "store") !== storeId
        || reviews.recordString(record, "type") !== "store") {
        throw codedError("promo_not_found", 404);
      }
      if (reviews.recordString(record, "updated") !== parsed.expectedUpdated) {
        throw codedError("promo_reviews_conflict", 409);
      }
      const before = stateSnapshot(record);
      const approvedAt = reviews.recordString(record, "approved_at")
        || (parsed.action === "approve" ? new Date().toISOString() : "");
      const next = reviews.moderationState(before, parsed.action, approvedAt);
      const changedPaths = [];
      if (before.status !== next.status) changedPaths.push("/status");
      if (before.featured !== next.featured) changedPaths.push("/featured");
      if (before.approved !== Boolean(next.approved_at)) changedPaths.push("/approved");
      if (changedPaths.length) {
        record.set("status", next.status);
        record.set("featured", next.featured);
        record.set("approved_at", next.approved_at);
        app.save(record);
        record = findReview(app, parsed.reviewId) || record;
        promoAudit.createPromoAudit(app, decision, {
          action: "promo.reviews.moderate",
          resourceType: "promo_store_review",
          resourceId: parsed.reviewId,
          changedPaths,
          previousValues: before,
          newValues: stateSnapshot(record),
          sourceEventKey: `promo.reviews.${parsed.reviewId}.${promoAudit.stableFingerprint({
            expected_updated: parsed.expectedUpdated,
            action: parsed.action,
          })}`,
        });
      }
      response = {
        ok: true,
        contract: reviews.PRIVATE_MODERATE_RESPONSE_CONTRACT,
        changed: changedPaths.length > 0,
        review: reviews.privateReview(record, storeId),
      };
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error);
  }
}

module.exports = {
  SAFE_ERROR_CODES,
  attachPublicRating,
  errorCode,
  filteredTotal,
  findPublicRows,
  handleList,
  handleModerate,
  listRows,
  publicSummaryForStore,
  queryRows,
  requestContext,
  requireAuthenticatedUser,
  reviewsReady,
  statusForError,
  summaryForStore,
};
