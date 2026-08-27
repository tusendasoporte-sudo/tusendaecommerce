/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const promoAudit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const pubcfg = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const reviews = typeof __hooks === "undefined"
  ? require("./pz_promo_reviews_lib.js")
  : require(`${__hooks}/pz_promo_reviews_lib.js`);
const media = typeof __hooks === "undefined"
  ? require("./pz_promo_media_lib.js")
  : require(`${__hooks}/pz_promo_media_lib.js`);

const DELETE_CONTRACT = "promo.reviews.delete.v1";
const DELETE_RESPONSE_CONTRACT = "promo.reviews.deleted.v1";
const SAFE_ERRORS = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "invalid_payload", "invalid_origin",
  "promo_reviews_conflict", "promo_reviews_unavailable",
]);

function codedError(code, status) {
  const error = new Error(SAFE_ERRORS.has(code) ? code : "promo_reviews_unavailable");
  error.code = error.message;
  error.status = Number.isInteger(status) ? status : 503;
  return error;
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

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, limit, params) {
  return Array.from(app.findRecordsByFilter(collection, filter, "id", limit || 500, 0, params || {}) || []);
}

function relationIds(record, key) {
  const value = reviews.recordValue(record, key);
  if (Array.isArray(value)) return value.map((item) => String(item || "")).filter(Boolean);
  const single = String(value || "");
  return single ? [single] : [];
}

function parseDelete(value) {
  const body = reviews.exactPayload(value, ["contract", "review_id", "expected_updated"]);
  if (!body || body.contract !== DELETE_CONTRACT
    || !/^[a-z0-9]{15}$/.test(String(body.review_id || ""))
    || typeof body.expected_updated !== "string" || !body.expected_updated
    || body.expected_updated.length > 80) {
    throw codedError("invalid_payload", 400);
  }
  return { reviewId: body.review_id, expectedUpdated: body.expected_updated };
}

function baseFilesPath(record) {
  try {
    const path = String(record.baseFilesPath() || "").trim();
    return path && !path.includes("..") ? path : "";
  } catch (_) { return ""; }
}

function deleteStoredPrefix(app, base) {
  if (!base) return;
  let filesystem = null;
  try {
    filesystem = app.newFilesystem();
    filesystem.deletePrefix(`${base}/`);
  } catch (_) {
  } finally {
    try { if (filesystem) filesystem.close(); } catch (_) {}
  }
}

function draftReferencesAsset(app, siteId, assetId) {
  const rows = findRecords(app, "promo_draft_documents", "site = {:site}", 2, { site: siteId });
  if (rows.length !== 1) return true;
  let document;
  try { document = pubcfg.normalizeJson(reviews.recordValue(rows[0], "document_json")); }
  catch (_) { return true; }
  const refs = document && document.media_refs;
  return !!refs && Object.keys(refs).some((key) => refs[key] && refs[key].asset_id === assetId);
}

function activeRevisionReferencesAsset(app, siteId, assetId) {
  const slots = findRecords(
    app, "promo_publication_slots", "site = {:site} && state = {:state}", 2,
    { site: siteId, state: "active" },
  );
  if (slots.length > 1) return true;
  if (!slots.length) return false;
  const revisionId = reviews.relationId(slots[0], "published_revision");
  if (!revisionId) return false;
  return findRecords(
    app, "promo_revision_media_refs", "revision = {:revision} && media_asset = {:asset}", 1,
    { revision: revisionId, asset: assetId },
  ).length > 0;
}

function reviewSnapshot(record) {
  return {
    status: reviews.recordString(record, "status"),
    featured: reviews.recordBool(record, "featured"),
    approved: Boolean(reviews.recordString(record, "approved_at")),
  };
}

function mediaSnapshot(record) {
  return {
    kind: media.recordString(record, "kind", 20),
    purpose: media.recordString(record, "purpose", 30),
    status: media.recordString(record, "status", 20),
    mime_detected: media.recordString(record, "mime_detected", 40),
    bytes: media.recordInteger(record, "bytes") || 0,
    width: media.recordInteger(record, "width") || 0,
    height: media.recordInteger(record, "height") || 0,
    duration_ms: media.recordInteger(record, "duration_ms") || 0,
  };
}

function statusForError(error) {
  const code = String(error && (error.code || error.message) || "promo_reviews_unavailable");
  if (code === "invalid_payload") return 400;
  if (["promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (code === "promo_reviews_conflict") return 409;
  if (code === "promo_reviews_unavailable") return 503;
  return Number.isInteger(error && error.status) ? error.status : 403;
}

function handleDelete(e) {
  setPrivateHeaders(e);
  try {
    if (!e || !e.auth) throw codedError("unauthorized", 403);
    const info = e.requestInfo();
    if (!info || Object.keys(info.query || {}).length) throw codedError("invalid_payload", 400);
    const parsed = parseDelete(info.body || {});
    const filePrefixes = [];
    let deletedRequest = false;
    let deletedPhotos = 0;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.reviews.manage", {
        requestedStoreId: requestHeader(info, "X-PZ-Promo-Store"),
      });
      const storeId = reviews.recordId(decision.store);
      const siteId = reviews.recordId(decision.site);
      app.db().newQuery("UPDATE reviews SET id = id WHERE id = {:id}").bind({ id: parsed.reviewId }).execute();
      const review = findRecord(app, "reviews", parsed.reviewId);
      if (!review || reviews.relationId(review, "store") !== storeId
        || reviews.recordString(review, "type") !== "store") throw codedError("promo_not_found", 404);
      if (reviews.recordString(review, "updated") !== parsed.expectedUpdated) {
        throw codedError("promo_reviews_conflict", 409);
      }
      const requests = findRecords(
        app, "promo_review_requests", "store = {:store} && review = {:review}", 2,
        { store: storeId, review: parsed.reviewId },
      );
      if (requests.length > 1) throw codedError("promo_reviews_conflict", 409);
      const request = requests[0] || null;
      const photoIds = request ? relationIds(request, "photo_assets") : [];
      photoIds.forEach((assetId) => {
        const asset = findRecord(app, "promo_media_assets", assetId);
        if (!asset || media.relationId(asset, "site") !== siteId
          || media.recordString(asset, "purpose", 30) !== "review") {
          throw codedError("promo_reviews_conflict", 409);
        }
        if (draftReferencesAsset(app, siteId, assetId) || activeRevisionReferencesAsset(app, siteId, assetId)) {
          throw codedError("promo_reviews_conflict", 409);
        }
      });
      promoAudit.createPromoAudit(app, decision, {
        action: "promo.reviews.delete",
        resourceType: "promo_store_review",
        resourceId: parsed.reviewId,
        changedPaths: [],
        previousValues: reviewSnapshot(review),
        newValues: {},
        sourceEventKey: `promo.reviews.delete.${parsed.reviewId}.${promoAudit.stableFingerprint({
          expected_updated: parsed.expectedUpdated,
        })}`,
      });
      if (request) {
        app.delete(request);
        deletedRequest = true;
      }
      photoIds.forEach((assetId) => {
        const stillUsed = findRecords(
          app, "promo_review_requests", "site = {:site} && photo_assets ?= {:asset}", 1,
          { site: siteId, asset: assetId },
        ).length > 0;
        if (stillUsed) return;
        const asset = findRecord(app, "promo_media_assets", assetId);
        if (!asset) return;
        findRecords(
          app, "promo_revision_media_refs", "site = {:site} && media_asset = {:asset}", 500,
          { site: siteId, asset: assetId },
        ).forEach((reference) => app.delete(reference));
        promoAudit.createPromoAudit(app, decision, {
          action: "promo.media.delete",
          resourceType: "promo_media_asset",
          resourceId: assetId,
          changedPaths: [],
          previousValues: mediaSnapshot(asset),
          newValues: {},
          sourceEventKey: `promo.media.delete.${assetId}.${media.recordString(asset, "sha256", 64).slice(0, 12)}`,
        });
        const base = baseFilesPath(asset);
        if (base) filePrefixes.push(base);
        app.delete(asset);
        deletedPhotos += 1;
      });
      app.delete(review);
    });
    filePrefixes.forEach((base) => deleteStoredPrefix(e.app, base));
    return e.json(200, {
      ok: true,
      contract: DELETE_RESPONSE_CONTRACT,
      changed: true,
      review_id: parsed.reviewId,
      deleted_request: deletedRequest,
      deleted_photos: deletedPhotos,
    });
  } catch (error) {
    const code = String(error && (error.code || error.message) || "promo_reviews_unavailable");
    return e.json(statusForError(error), {
      ok: false,
      error: SAFE_ERRORS.has(code) ? code : "promo_reviews_unavailable",
    });
  }
}

module.exports = {
  DELETE_CONTRACT,
  DELETE_RESPONSE_CONTRACT,
  SAFE_ERRORS,
  handleDelete,
  parseDelete,
};
