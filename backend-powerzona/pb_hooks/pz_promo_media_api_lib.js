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

const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";
const SAFE_ERRORS = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
  "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
  "promo_capability_denied", "promo_permission_denied", "reserved_promo_action", "unknown_promo_action",
  "invalid_payload", "promo_media_unavailable", "promo_media_video_disabled",
  "promo_media_file_required", "promo_media_size_invalid",
  "promo_media_filename_invalid", "promo_media_digest_mismatch", "promo_media_metadata_mismatch",
  "promo_media_image_dimensions_invalid", "promo_media_video_dimensions_invalid",
  "promo_media_video_bitrate_invalid", "promo_media_poster_required", "promo_media_duplicate",
  "promo_media_count_exceeded", "promo_media_storage_exceeded", "promo_media_in_use",
  "promo_media_conflict", "promo_media_not_found", "promo_media_variant_invalid",
]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function headerValue(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return String(headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized) || "").trim().slice(0, 80);
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return key ? String(headers[key] || "").trim().slice(0, 80) : "";
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

function emptyQuery(info) {
  const query = info && info.query || {};
  return pubcfgApi.exactPayload(query, []);
}

function privateContext(e, actionKey) {
  setPrivateHeaders(e);
  if (!e || !e.auth) throw codedError("unauthorized", 403);
  if (!pubcfgApi.collectionsReady(e.app)) throw codedError("promo_media_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !emptyQuery(info)) throw codedError("invalid_payload", 400);
  const decision = promo.requirePromoAction(e.app, e.auth, actionKey, {
    requestedStoreId: headerValue(info, "X-PZ-Promo-Store"),
  });
  return { decision, info };
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, limit, params) {
  return Array.from(app.findRecordsByFilter(
    collection, filter, sort || "id", limit || 500, 0, params || {},
  ) || []);
}

function siteId(decision) {
  return media.recordId(decision && decision.site);
}

function usage(app, ownerSiteId) {
  const rows = findRecords(
    app,
    "promo_media_assets",
    "site = {:site}",
    "created",
    media.MAX_STORED_IMAGES + media.MAX_STORED_VIDEOS + 2,
    { site: ownerSiteId },
  );
  return rows.reduce((result, record) => {
    const kind = media.recordString(record, "kind", 20);
    if (kind === "image") result.images += 1;
    if (kind === "video") result.videos += 1;
    result.bytes += Math.max(0, media.recordInteger(record, "bytes") || 0);
    return result;
  }, { images: 0, videos: 0, bytes: 0 });
}

function assertQuota(decision, current, payload) {
  const next = {
    images: current.images + (payload.kind === "image" ? 1 : 0),
    videos: current.videos + (payload.kind === "video" ? 1 : 0),
    bytes: current.bytes + payload.bytes,
  };
  if (next.images > media.MAX_STORED_IMAGES || next.videos > media.MAX_STORED_VIDEOS) {
    throw codedError("promo_media_count_exceeded", 409);
  }
  if (next.bytes > media.MAX_STORAGE_BYTES) throw codedError("promo_media_storage_exceeded", 409);
  const storageAccess = promo.resolvePromoCapabilityAccess(decision.entitlement, "max_storage_bytes", {
    requiredAmount: next.bytes,
  });
  if (!storageAccess.allowed) throw codedError("promo_media_storage_exceeded", 409);
  if (payload.kind === "video") {
    const videoAccess = promo.resolvePromoCapabilityAccess(decision.entitlement, "max_videos", {
      requiredAmount: next.videos,
    });
    if (!videoAccess.allowed) throw codedError("promo_media_count_exceeded", 409);
  }
  return next;
}

function assertPoster(app, ownerSiteId, payload) {
  if (payload.kind !== "video") return null;
  const poster = findRecord(app, "promo_media_assets", payload.posterAssetId);
  try {
    media.assertReadyAsset(poster, { siteId: ownerSiteId, purpose: "video_poster" });
  } catch (_) {
    throw codedError("promo_media_poster_required", 400);
  }
  if (media.recordString(poster, "kind", 20) !== "image") throw codedError("promo_media_poster_required", 400);
  return poster;
}

function duplicateAsset(app, ownerSiteId, sha256) {
  const rows = findRecords(
    app,
    "promo_media_assets",
    "site = {:site} && sha256 = {:sha}",
    "id",
    2,
    { site: ownerSiteId, sha: sha256 },
  );
  return rows.length ? rows[0] : null;
}

function reusableAsset(record, payload) {
  if (!record || !payload) return null;
  const snapshot = mediaSnapshot(record);
  if (snapshot.status !== "ready"
    || snapshot.kind !== payload.kind
    || snapshot.purpose !== payload.purpose
    || snapshot.mime_detected !== payload.mime
    || snapshot.bytes !== payload.bytes
    || snapshot.width !== payload.width
    || snapshot.height !== payload.height
    || snapshot.duration_ms !== payload.durationMs
    || media.relationId(record, "poster_asset") !== payload.posterAssetId) {
    return null;
  }
  return record;
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

function writeCreateAudit(app, decision, record) {
  return audit.createPromoAudit(app, decision, {
    action: "promo.media.create",
    resourceType: "promo_media_asset",
    resourceId: media.recordId(record),
    changedPaths: [],
    previousValues: {},
    newValues: mediaSnapshot(record),
    sourceEventKey: `promo.media.create.${media.recordId(record)}.${media.recordString(record, "sha256", 64).slice(0, 12)}`,
  });
}

function writeStatusAudit(app, decision, record, previousStatus) {
  return audit.createPromoAudit(app, decision, {
    action: "promo.media.status.update",
    resourceType: "promo_media_asset",
    resourceId: media.recordId(record),
    changedPaths: ["/status"],
    previousValues: { ...mediaSnapshot(record), status: previousStatus },
    newValues: mediaSnapshot(record),
    sourceEventKey: `promo.media.status.${media.recordId(record)}.${media.recordString(record, "status", 20)}`,
  });
}

function createRecord(app, decision, file, payload, poster) {
  const record = new Record(app.findCollectionByNameOrId("promo_media_assets"), {});
  record.set("site", siteId(decision));
  record.set("kind", payload.kind);
  record.set("purpose", payload.purpose);
  record.set("status", "processing");
  record.set("file", file);
  record.set("mime_detected", payload.mime);
  record.set("sha256", payload.sha256);
  record.set("bytes", payload.bytes);
  record.set("width", payload.width);
  record.set("height", payload.height);
  record.set("duration_ms", payload.durationMs);
  record.set("poster_asset", poster ? media.recordId(poster) : "");
  record.set("created_by", media.recordId(decision.actor));
  app.save(record);
  return record;
}

function baseFilesPath(record) {
  try {
    const path = String(record.baseFilesPath() || "").trim();
    return path && !path.includes("..") ? path : "";
  } catch (_) { return ""; }
}

function generateImageVariants(app, record) {
  if (media.recordString(record, "kind", 20) !== "image") return [];
  const base = baseFilesPath(record);
  const filename = media.recordString(record, "file", 220);
  if (!base || !filename || filename.includes("/") || filename.includes("\\")) {
    throw codedError("promo_media_unavailable", 503);
  }
  const variants = media.variantManifest(
    media.recordString(record, "purpose", 30),
    media.recordInteger(record, "width") || 0,
    media.recordInteger(record, "height") || 0,
  ).filter((variant) => variant.key !== "original");
  let filesystem = null;
  try {
    filesystem = app.newFilesystem();
    const validationKey = `${base}/${media.recordString(record, "sha256", 64)}_validate.webp`;
    filesystem.createThumb(`${base}/${filename}`, validationKey, "1x1");
    const validation = Array.from(filesystem.list(`${base}/`) || [])
      .find((item) => item && String(item.key || "") === validationKey);
    const validationSize = Number(validation && validation.size);
    if (!validation || !Number.isSafeInteger(validationSize) || validationSize < 1
      || validationSize > media.MAX_IMAGE_BYTES) throw codedError("promo_media_unavailable", 503);
    const deletionErrors = Array.from(filesystem.deletePrefix(validationKey) || []);
    if (deletionErrors.length) throw codedError("promo_media_unavailable", 503);
    variants.forEach((variant) => {
      const output = media.derivedFilename(media.recordString(record, "sha256", 64), variant.key);
      filesystem.createThumb(`${base}/${filename}`, `${base}/${output}`, variant.thumb);
    });
    const objects = Array.from(filesystem.list(`${base}/`) || []);
    variants.forEach((variant) => {
      const output = media.derivedFilename(media.recordString(record, "sha256", 64), variant.key);
      const expectedKey = `${base}/${output}`;
      const stored = objects.find((item) => item && String(item.key || "") === expectedKey);
      const size = Number(stored && stored.size);
      if (!stored || !Number.isSafeInteger(size) || size < 1 || size > media.MAX_IMAGE_BYTES) {
        throw codedError("promo_media_size_invalid", 413);
      }
    });
  } finally {
    try { if (filesystem) filesystem.close(); } catch (_) {}
  }
  return variants;
}

function finalizeRecord(app, record) {
  record.set("status", "ready");
  record.set("ready_at", new Date().toISOString());
  app.save(record);
  return record;
}

function cleanupFailedRecord(app, record) {
  if (!record) return;
  const base = baseFilesPath(record);
  let filesystem = null;
  try {
    if (base) {
      filesystem = app.newFilesystem();
      filesystem.deletePrefix(`${base}/`);
    }
  } catch (_) {
  } finally {
    try { if (filesystem) filesystem.close(); } catch (_) {}
  }
  try {
    const current = findRecord(app, "promo_media_assets", media.recordId(record));
    if (current) app.delete(current);
  } catch (_) {}
}

function handleUpload(e) {
  setPrivateHeaders(e);
  try {
    const files = Array.from(e.findUploadedFiles("file") || []);
    if (files.length !== 1) throw codedError("promo_media_file_required", 400);
    const preliminaryInfo = e.requestInfo();
    const preliminary = media.parseUploadPayload(preliminaryInfo && preliminaryInfo.body || {});
    if (!preliminary) throw codedError("invalid_payload", 400);
    const action = "promo.media.manage";
    const context = privateContext(e, action);
    if (preliminary.kind === "video" || preliminary.purpose === "video_poster") {
      throw codedError("promo_media_video_disabled", 400);
    }
    const payload = media.parseUploadPayload(context.info.body || {});
    if (!payload) throw codedError("invalid_payload", 400);
    try { media.validateUploadedFile(files[0], payload); }
    catch (error) { throw codedError(String(error && error.message || "promo_media_unavailable"), 400); }

    let created = null;
    let reused = false;
    let projectedUsage = null;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, action, {
        requestedStoreId: headerValue(context.info, "X-PZ-Promo-Store"),
      });
      const ownerSiteId = siteId(decision);
      const duplicate = duplicateAsset(app, ownerSiteId, payload.sha256);
      if (duplicate) {
        created = reusableAsset(duplicate, payload);
        if (!created) throw codedError("promo_media_duplicate", 409);
        projectedUsage = usage(app, ownerSiteId);
        reused = true;
        return;
      }
      projectedUsage = assertQuota(decision, usage(app, ownerSiteId), payload);
      const poster = assertPoster(app, ownerSiteId, payload);
      created = createRecord(app, decision, files[0], payload, poster);
    });
    try {
      if (reused) {
        return e.json(201, {
          ok: true,
          contract: media.MEDIA_RESPONSE_CONTRACT,
          asset: media.privateAssetDescriptor(created),
          usage: projectedUsage,
        });
      }
      generateImageVariants(e.app, created);
      e.app.runInTransaction((app) => {
        const decision = promo.requirePromoAction(app, e.auth, action, {
          requestedStoreId: headerValue(context.info, "X-PZ-Promo-Store"),
        });
        const current = findRecord(app, "promo_media_assets", media.recordId(created));
        if (!current || media.relationId(current, "site") !== siteId(decision)
          || media.recordString(current, "status", 20) !== "processing") {
          throw codedError("promo_media_conflict", 409);
        }
        created = finalizeRecord(app, current);
        writeCreateAudit(app, decision, created);
      });
    } catch (error) {
      cleanupFailedRecord(e.app, created);
      throw error;
    }
    return e.json(201, {
      ok: true,
      contract: media.MEDIA_RESPONSE_CONTRACT,
      asset: media.privateAssetDescriptor(created),
      usage: projectedUsage,
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function handleList(e) {
  setPrivateHeaders(e);
  try {
    const context = privateContext(e, "promo.site.view");
    if (!media.parseListPayload(context.info.body || {})) throw codedError("invalid_payload", 400);
    const ownerSiteId = siteId(context.decision);
    const records = findRecords(
      e.app,
      "promo_media_assets",
      "site = {:site}",
      "-created",
      media.MAX_STORED_IMAGES + media.MAX_STORED_VIDEOS + 1,
      { site: ownerSiteId },
    );
    return e.json(200, {
      ok: true,
      contract: media.MEDIA_CATALOG_CONTRACT,
      assets: records.map(media.privateAssetDescriptor),
      usage: usage(e.app, ownerSiteId),
      limits: {
        max_image_bytes: media.MAX_IMAGE_BYTES,
        max_video_bytes: media.MAX_VIDEO_BYTES,
        max_video_duration_ms: media.MAX_VIDEO_DURATION_MS,
        max_stored_images: media.MAX_STORED_IMAGES,
        max_stored_videos: media.MAX_STORED_VIDEOS,
        max_storage_bytes: Math.min(
          media.MAX_STORAGE_BYTES,
          Number(context.decision.capabilities.max_storage_bytes) || 0,
        ),
        purposes: media.PURPOSES.slice(),
      },
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function draftReferencesAsset(app, ownerSiteId, assetId) {
  const rows = findRecords(app, "promo_draft_documents", "site = {:site}", "id", 2, { site: ownerSiteId });
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
    "id",
    2,
    { site: ownerSiteId, state: "active" },
  );
  if (slots.length > 1) return true;
  if (!slots.length) return false;
  const revisionId = media.relationId(slots[0], "published_revision");
  if (!revisionId) return false;
  const refs = findRecords(
    app,
    "promo_revision_media_refs",
    "revision = {:revision} && media_asset = {:asset}",
    "id",
    1,
    { revision: revisionId, asset: assetId },
  );
  return refs.length > 0;
}

function posterHasDependentVideo(app, ownerSiteId, assetId) {
  return findRecords(
    app,
    "promo_media_assets",
    "site = {:site} && poster_asset = {:poster} && (status = {:processing} || status = {:ready})",
    "id",
    media.MAX_STORED_VIDEOS + 1,
    { site: ownerSiteId, poster: assetId, processing: "processing", ready: "ready" },
  ).length > 0;
}

function handleRetire(e) {
  setPrivateHeaders(e);
  try {
    const context = privateContext(e, "promo.media.manage");
    const input = media.parseRetirePayload(context.info.body || {});
    if (!input) throw codedError("invalid_payload", 400);
    let changed = false;
    let result = null;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.media.manage", {
        requestedStoreId: headerValue(context.info, "X-PZ-Promo-Store"),
      });
      const ownerSiteId = siteId(decision);
      const record = findRecord(app, "promo_media_assets", input.assetId);
      if (!record || media.relationId(record, "site") !== ownerSiteId) throw codedError("promo_media_not_found", 404);
      const status = media.recordString(record, "status", 20);
      if (status !== input.expectedStatus) throw codedError("promo_media_conflict", 409);
      if (draftReferencesAsset(app, ownerSiteId, input.assetId)
        || activeRevisionReferencesAsset(app, ownerSiteId, input.assetId)
        || posterHasDependentVideo(app, ownerSiteId, input.assetId)) {
        throw codedError("promo_media_in_use", 409);
      }
      record.set("status", "retired");
      record.set("retired_at", new Date().toISOString());
      app.save(record);
      writeStatusAudit(app, decision, record, status);
      result = record;
      changed = true;
    });
    return e.json(200, {
      ok: true,
      contract: media.MEDIA_RESPONSE_CONTRACT,
      changed,
      asset: media.privateAssetDescriptor(result),
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function parsedDeliveryFile(value, allowPoster) {
  const match = String(value || "").match(
    allowPoster
      ? /^(poster-(?:original|w[0-9]{2,4})|original|w[0-9]{2,4})\.(webp|mp4|webm)$/
      : /^(original|w[0-9]{2,4})\.(webp|mp4|webm)$/,
  );
  return match ? { variant: match[1], extension: match[2] } : null;
}

function resolveStoredPath(record, variant, extension) {
  media.assertReadyAsset(record);
  const mime = media.recordString(record, "mime_detected", 40);
  const expectedExtension = mime === "image/webp" ? "webp" : (mime === "video/webm" ? "webm" : "mp4");
  if (extension !== expectedExtension) throw codedError("promo_media_not_found", 404);
  const base = baseFilesPath(record);
  const original = media.recordString(record, "file", 220);
  if (!base || !original || original.includes("/") || original.includes("\\")) throw codedError("promo_media_not_found", 404);
  if (variant === "original") return { key: `${base}/${original}`, name: original };
  if (media.recordString(record, "kind", 20) !== "image") throw codedError("promo_media_not_found", 404);
  const allowed = media.variantManifest(
    media.recordString(record, "purpose", 30),
    media.recordInteger(record, "width") || 0,
    media.recordInteger(record, "height") || 0,
  ).some((item) => item.key === variant);
  if (!allowed) throw codedError("promo_media_not_found", 404);
  const derived = media.derivedFilename(media.recordString(record, "sha256", 64), variant);
  return { key: `${base}/${derived}`, name: derived };
}

function serveFile(e, record, variant, extension, cacheControl) {
  const path = resolveStoredPath(record, variant, extension);
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", cacheControl);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", "inline");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  } catch (_) {}
  let filesystem = null;
  try {
    filesystem = (e.app || $app).newFilesystem();
    return filesystem.serve(e.response, e.request, path.key, path.name);
  } finally {
    try { if (filesystem) filesystem.close(); } catch (_) {}
  }
}

function handlePrivateFile(e) {
  setPrivateHeaders(e);
  try {
    const context = privateContext(e, "promo.site.view");
    const assetId = String(e.request.pathValue("assetId") || "");
    const digest = String(e.request.pathValue("digest") || "");
    const parsed = parsedDeliveryFile(e.request.pathValue("filename"), false);
    if (!media.RECORD_ID_PATTERN.test(assetId) || !media.SHA256_PATTERN.test(digest) || !parsed) {
      throw codedError("promo_media_not_found", 404);
    }
    const record = findRecord(e.app, "promo_media_assets", assetId);
    if (!record || media.relationId(record, "site") !== siteId(context.decision)
      || media.recordString(record, "sha256", 64) !== digest) throw codedError("promo_media_not_found", 404);
    return serveFile(e, record, parsed.variant, parsed.extension, "private, no-store, max-age=0");
  } catch (error) {
    return sendFileNotFound();
  }
}

function handlePublicFile(e) {
  try {
    if (!emptyQuery(e.requestInfo())) return sendFileNotFound();
    const slug = String(e.request.pathValue("publicSlug") || "");
    const useKey = String(e.request.pathValue("useKey") || "");
    const digest = String(e.request.pathValue("digest") || "");
    const parsed = parsedDeliveryFile(e.request.pathValue("filename"), true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !media.USE_KEY_PATTERN.test(useKey)
      || !media.SHA256_PATTERN.test(digest) || !parsed) return sendFileNotFound();
    const context = pubcfgApi.resolvePublicMediaContext(e.app, slug, useKey);
    let record = context.asset;
    let variant = parsed.variant;
    if (variant.startsWith("poster-")) {
      record = context.poster;
      variant = variant.slice("poster-".length);
    }
    if (!record || media.recordString(record, "sha256", 64) !== digest) return sendFileNotFound();
    return serveFile(e, record, variant, parsed.extension, PUBLIC_CACHE_CONTROL);
  } catch (_) {
    return sendFileNotFound();
  }
}

function blockDirectFileDownload() {
  return sendFileNotFound();
}

function sendFileNotFound() {
  if (typeof NotFoundError === "function") throw new NotFoundError("No disponible.");
  throw codedError("promo_media_not_found", 404);
}

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "").trim();
  return SAFE_ERRORS.has(code) ? code : "promo_media_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (["promo_media_not_found", "promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (["promo_media_duplicate", "promo_media_count_exceeded", "promo_media_storage_exceeded", "promo_media_in_use", "promo_media_conflict"].includes(code)) return 409;
  if (code === "promo_media_size_invalid") return 413;
  if (["promo_media_unavailable"].includes(code)) return 503;
  if (["invalid_payload", "promo_media_file_required", "promo_media_filename_invalid", "promo_media_digest_mismatch",
    "promo_media_metadata_mismatch", "promo_media_image_dimensions_invalid", "promo_media_video_dimensions_invalid",
    "promo_media_video_bitrate_invalid", "promo_media_poster_required", "promo_media_variant_invalid",
    "promo_media_video_disabled"].includes(code)) return 400;
  return Number.isInteger(error && error.status) ? error.status : 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(errorStatus(error), { ok: false, error: code });
}

module.exports = {
  PUBLIC_CACHE_CONTROL,
  SAFE_ERRORS,
  activeRevisionReferencesAsset,
  assertPoster,
  assertQuota,
  blockDirectFileDownload,
  draftReferencesAsset,
  errorCode,
  errorStatus,
  finalizeRecord,
  generateImageVariants,
  handleList,
  handlePrivateFile,
  handlePublicFile,
  handleRetire,
  handleUpload,
  mediaSnapshot,
  parsedDeliveryFile,
  posterHasDependentVideo,
  reusableAsset,
  serveFile,
  sendError,
  usage,
};
