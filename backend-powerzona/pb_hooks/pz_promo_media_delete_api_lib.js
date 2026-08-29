/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const pubcfg = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);
const audit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const media = typeof __hooks === "undefined"
  ? require("./pz_promo_media_lib.js")
  : require(`${__hooks}/pz_promo_media_lib.js`);

const SAFE_ERRORS = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "invalid_payload", "promo_media_unavailable",
  "promo_media_in_use", "promo_media_conflict", "promo_media_not_found",
]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
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

function headerValue(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return String(headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized) || "")
        .trim().slice(0, 80);
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
  return Array.from(app.findRecordsByFilter(
    collection, filter, "id", limit || 500, 0, params || {},
  ) || []);
}

function siteId(decision) {
  return media.recordId(decision && decision.site);
}

function baseFilesPath(record) {
  try {
    const path = String(record.baseFilesPath() || "").trim();
    return path && !path.includes("..") ? path : "";
  } catch (_) { return ""; }
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

function draftReferencesAsset(app, ownerSiteId, assetId) {
  const rows = findRecords(app, "promo_draft_documents", "site = {:site}", 2, { site: ownerSiteId });
  if (rows.length !== 1) return true;
  let document;
  try { document = pubcfg.normalizeJson(media.recordValue(rows[0], "document_json")); } catch (_) { return true; }
  const refs = document && document.media_refs;
  return !!refs && Object.keys(refs).some((key) => refs[key] && refs[key].asset_id === assetId);
}

function activeRevisionReferencesAsset(app, ownerSiteId, assetId) {
  const slots = findRecords(
    app,
    "promo_publication_slots",
    "site = {:site} && state = {:state}",
    2,
    { site: ownerSiteId, state: "active" },
  );
  if (slots.length > 1) return true;
  if (!slots.length) return false;
  const revisionId = media.relationId(slots[0], "published_revision");
  if (!revisionId) return false;
  return findRecords(
    app,
    "promo_revision_media_refs",
    "revision = {:revision} && media_asset = {:asset}",
    1,
    { revision: revisionId, asset: assetId },
  ).length > 0;
}

function mediaIsInUse(app, ownerSiteId, assetId) {
  if (draftReferencesAsset(app, ownerSiteId, assetId)
    || activeRevisionReferencesAsset(app, ownerSiteId, assetId)) return true;
  const dependentVideos = findRecords(
    app,
    "promo_media_assets",
    "site = {:site} && poster_asset = {:asset} && (status = {:processing} || status = {:ready})",
    media.MAX_STORED_VIDEOS + 1,
    { site: ownerSiteId, asset: assetId, processing: "processing", ready: "ready" },
  );
  return dependentVideos.length > 0;
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

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "").trim();
  return SAFE_ERRORS.has(code) ? code : "promo_media_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (["promo_media_not_found", "promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (["promo_media_in_use", "promo_media_conflict"].includes(code)) return 409;
  if (code === "promo_media_unavailable") return 503;
  if (code === "invalid_payload") return 400;
  return Number.isInteger(error && error.status) ? error.status : 403;
}

function handleDelete(e) {
  setPrivateHeaders(e);
  try {
    if (!e || !e.auth || !pubcfgApi.collectionsReady(e.app)) throw codedError("unauthorized", 403);
    const info = e.requestInfo();
    if (!info || !pubcfgApi.exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
    const input = media.parseDeletePayload(info.body || {});
    if (!input) throw codedError("invalid_payload", 400);
    let deletedAssetId = "";
    let deletedBase = "";
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.media.manage", {
        requestedStoreId: headerValue(info, "X-PZ-Promo-Store"),
      });
      const ownerSiteId = siteId(decision);
      const record = findRecord(app, "promo_media_assets", input.assetId);
      if (!record || media.relationId(record, "site") !== ownerSiteId) {
        throw codedError("promo_media_not_found", 404);
      }
      if (media.recordString(record, "status", 20) !== input.expectedStatus) {
        throw codedError("promo_media_conflict", 409);
      }
      if (mediaIsInUse(app, ownerSiteId, input.assetId)) throw codedError("promo_media_in_use", 409);
      findRecords(
        app,
        "promo_revision_media_refs",
        "site = {:site} && media_asset = {:asset}",
        500,
        { site: ownerSiteId, asset: input.assetId },
      ).forEach((reference) => app.delete(reference));
      deletedAssetId = media.recordId(record);
      deletedBase = baseFilesPath(record);
      audit.createPromoAudit(app, decision, {
        action: "promo.media.delete",
        resourceType: "promo_media_asset",
        resourceId: deletedAssetId,
        changedPaths: [],
        previousValues: mediaSnapshot(record),
        newValues: {},
        sourceEventKey: `promo.media.delete.${deletedAssetId}.${media.recordString(record, "sha256", 64).slice(0, 12)}`,
      });
      app.delete(record);
    });
    deleteStoredPrefix(e.app, deletedBase);
    return e.json(200, {
      ok: true,
      contract: media.MEDIA_DELETE_RESPONSE_CONTRACT,
      changed: true,
      asset_id: deletedAssetId,
    });
  } catch (error) {
    return e.json(errorStatus(error), { ok: false, error: errorCode(error) });
  }
}

module.exports = {
  SAFE_ERRORS,
  activeRevisionReferencesAsset,
  draftReferencesAsset,
  handleDelete,
  mediaIsInUse,
};
