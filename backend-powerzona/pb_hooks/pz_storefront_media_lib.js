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
const storageBudget = typeof __hooks === "undefined"
  ? require("./pz_store_storage_budget_lib.js")
  : require(`${__hooks}/pz_store_storage_budget_lib.js`);

const MEDIA_COLLECTION = "push_media";
const CAMPAIGNS_COLLECTION = "push_campaigns";
const MEDIA_PERMISSION = "marketing.push.manage";
const MEDIA_CAPABILITY = "push_campaigns_enabled";
const MAX_OUTPUT_BYTES = 100 * 1024;
const MAX_OUTPUT_WIDTH = 1200;
const MAX_OUTPUT_HEIGHT = 630;
const MAX_STORED_BYTES_PER_STORE = 250 * 1024 * 1024;
const MAX_STORED_MEDIA_PER_STORE = 100;
const MEDIA_RETENTION_HOURS = 24;
const CLEANUP_BATCH_SIZE = 200;
const CLEANUP_MAX_BATCHES = 10;
const CAMPAIGN_REFERENCE_BATCH_SIZE = 200;
const CAMPAIGN_REFERENCE_MAX_BATCHES = 50;
const PUBLIC_CACHE_CONTROL = "public, max-age=300, must-revalidate";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RANDOM_WEBP_NAME_PATTERN = /^[a-f0-9]{32}\.webp$/;
const STORED_WEBP_NAME_PATTERN = /^[a-f0-9]{32}_[A-Za-z0-9]{6,32}\.webp$/;

const SAFE_ERRORS = new Set([
  "unauthorized",
  "permission_denied",
  "plan_not_available",
  "invalid_payload",
  "media_required",
  "media_invalid",
  "media_too_large",
  "media_quota_exceeded",
  "media_count_exceeded",
  "media_not_found",
  "media_in_use",
  "media_upload_failed",
  "media_delete_failed",
  "store_storage_full",
  "store_storage_unavailable",
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

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function integerValue(value) {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function exactPayload(body, allowedKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = allowedKeys.slice().sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
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

function parseUploadMetadata(body) {
  if (!exactPayload(body, ["bytes", "height", "sha256", "width"])) return null;
  const bytes = integerValue(bodyValue(body, "bytes"));
  const width = integerValue(bodyValue(body, "width"));
  const height = integerValue(bodyValue(body, "height"));
  const sha256 = String(bodyValue(body, "sha256") || "").trim().toLowerCase();
  if (!bytes || bytes > MAX_OUTPUT_BYTES
    || !width || width > MAX_OUTPUT_WIDTH
    || !height || height > MAX_OUTPUT_HEIGHT
    || !SHA256_PATTERN.test(sha256)) return null;
  return { bytes, width, height, sha256 };
}

function parseDeletePayload(body) {
  if (!exactPayload(body, ["media_id"])) return null;
  const mediaId = String(bodyValue(body, "media_id") || "").trim();
  return RECORD_ID_PATTERN.test(mediaId) ? { mediaId } : null;
}

function parseEmptyPayload(body) {
  return exactPayload(body || {}, []) ? {} : null;
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

function loadMediaAccessContext(app, auth, supportStoreId) {
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

function assertMediaAccess(app, context) {
  if (!context) throw codedError("unauthorized");
  const access = capabilities.resolveStoreCapabilityAccess(context.store, MEDIA_CAPABILITY, {
    enforceExpiration: true,
  });
  if (!access.allowed) throw codedError("plan_not_available");
  if (!context.master
    && !permissions.hasStorePermission(app, context.actor, context.store, MEDIA_PERMISSION)) {
    throw codedError("permission_denied");
  }
  return true;
}

function uploadedFileName(file) {
  const original = String(file && file.originalName || "").trim();
  const current = String(file && file.name || "").trim();
  return original || current;
}

function uploadedFilePrefix(file, length) {
  const bytes = [];
  let reader = null;
  try {
    reader = file && file.reader && typeof file.reader.open === "function" ? file.reader.open() : null;
    if (!reader || typeof reader.read !== "function") return bytes;
    if (typeof toBytes === "function") {
      const content = toBytes(reader);
      const contentLength = Number(content && content.length) || 0;
      for (let index = 0; index < Math.min(length, contentLength); index += 1) {
        bytes.push(Number(content[index]) & 255);
      }
      return bytes;
    }
    if (typeof readerToString === "function") {
      const content = readerToString(reader);
      for (let index = 0; index < Math.min(length, content.length); index += 1) {
        bytes.push(content.charCodeAt(index) & 255);
      }
      return bytes;
    }
    while (bytes.length < length) {
      const chunk = new Array(length - bytes.length).fill(0);
      const read = Number(reader.read(chunk));
      if (!Number.isInteger(read) || read <= 0) break;
      for (let index = 0; index < Math.min(read, chunk.length); index += 1) {
        bytes.push(Number(chunk[index]) & 255);
      }
    }
  } catch (_) {
    return [];
  } finally {
    try { if (reader && typeof reader.close === "function") reader.close(); } catch (_) {}
  }
  return bytes;
}

function hasWebpMagic(file) {
  const bytes = uploadedFilePrefix(file, 12);
  return bytes.length === 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function parseUploadedWebpDimensions(file) {
  const bytes = uploadedFilePrefix(file, 30);
  if (bytes.length < 25
    || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46
    || bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) {
    return null;
  }
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === "VP8 " && bytes.length >= 30
    && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return { width, height };
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  return null;
}

function validateUploadedWebp(file, metadata) {
  if (!file || !metadata) throw codedError("media_required");
  const size = Number(file.size);
  if (!Number.isInteger(size) || size <= 0 || size > MAX_OUTPUT_BYTES) {
    throw codedError("media_too_large");
  }
  const dimensions = parseUploadedWebpDimensions(file);
  if (size !== metadata.bytes
    || !RANDOM_WEBP_NAME_PATTERN.test(uploadedFileName(file))
    || !dimensions
    || dimensions.width !== metadata.width
    || dimensions.height !== metadata.height) {
    throw codedError("media_invalid");
  }
  return true;
}

function findMediaRecords(app, storeId, limit) {
  return app.findRecordsByFilter(
    MEDIA_COLLECTION,
    "store = {:storeId}",
    "created",
    limit,
    0,
    { storeId },
  ) || [];
}

function mediaUsage(app, storeId) {
  const records = findMediaRecords(app, storeId, MAX_STORED_MEDIA_PER_STORE + 1);
  return records.reduce((usage, record) => {
    const bytes = integerValue(recordValue(record, "bytes"));
    usage.count += 1;
    usage.bytes += bytes && bytes > 0 ? bytes : 0;
    return usage;
  }, { count: 0, bytes: 0 });
}

function assertMediaQuota(app, storeId, incomingBytes) {
  const usage = mediaUsage(app, storeId);
  if (usage.count >= MAX_STORED_MEDIA_PER_STORE) throw codedError("media_count_exceeded");
  if (usage.bytes + incomingBytes > MAX_STORED_BYTES_PER_STORE) {
    throw codedError("media_quota_exceeded");
  }
  return usage;
}

function addHours(value, hours) {
  return new Date(value.getTime() + (hours * 60 * 60 * 1000));
}

function mapMedia(record) {
  return {
    id: recordString(record, "id") || String(record && record.id || "").trim(),
    file: recordString(record, "file"),
    sha256: recordString(record, "sha256"),
    width: Number(recordValue(record, "width")) || 0,
    height: Number(recordValue(record, "height")) || 0,
    bytes: Number(recordValue(record, "bytes")) || 0,
    status: recordString(record, "status"),
    referenced_at: recordString(record, "referenced_at"),
    delete_after: recordString(record, "delete_after"),
    created: recordString(record, "created"),
  };
}

function createMediaRecord(app, context, file, metadata, now) {
  assertMediaQuota(app, context.storeId, metadata.bytes);
  const record = new Record(app.findCollectionByNameOrId(MEDIA_COLLECTION), {});
  record.set("store", context.storeId);
  record.set("file", file);
  record.set("sha256", metadata.sha256);
  record.set("width", metadata.width);
  record.set("height", metadata.height);
  record.set("bytes", metadata.bytes);
  record.set("status", "active");
  record.set("created_by", context.actorId);
  record.set("referenced_at", "");
  record.set("delete_after", addHours(now, MEDIA_RETENTION_HOURS).toISOString());
  schema.assertValidState(MEDIA_COLLECTION, "active");
  schema.assertTenantIsolation(app, MEDIA_COLLECTION, record);
  app.save(record);
  return record;
}

function hasCampaignReference(app, mediaId) {
  const records = app.findRecordsByFilter(
    CAMPAIGNS_COLLECTION,
    "media = {:mediaId}",
    "",
    1,
    0,
    { mediaId },
  ) || [];
  return records.length > 0;
}

function detachCampaignReferences(app, mediaId) {
  let detached = 0;
  for (let batch = 0; batch < CAMPAIGN_REFERENCE_MAX_BATCHES; batch += 1) {
    const campaigns = app.findRecordsByFilter(
      CAMPAIGNS_COLLECTION,
      "media = {:mediaId}",
      "id",
      CAMPAIGN_REFERENCE_BATCH_SIZE,
      0,
      { mediaId },
    ) || [];
    if (campaigns.length === 0) return detached;
    campaigns.forEach((campaign) => {
      campaign.set("media", "");
      app.save(campaign);
      detached += 1;
    });
  }
  if (hasCampaignReference(app, mediaId)) throw codedError("media_delete_failed");
  return detached;
}

function deleteOrphanMedia(app, media, now) {
  const mediaId = recordString(media, "id") || String(media && media.id || "").trim();
  if (!RECORD_ID_PATTERN.test(mediaId)) throw codedError("media_not_found");
  if (hasCampaignReference(app, mediaId)) {
    media.set("referenced_at", recordString(media, "referenced_at") || now.toISOString());
    if (recordString(media, "status") === "pending_delete") media.set("status", "active");
    app.save(media);
    return false;
  }
  media.set("status", "pending_delete");
  app.save(media);
  app.delete(media);
  return true;
}

function expireMedia(app, media) {
  const mediaId = recordString(media, "id") || String(media && media.id || "").trim();
  if (!RECORD_ID_PATTERN.test(mediaId)) throw codedError("media_not_found");
  const detachedCampaigns = detachCampaignReferences(app, mediaId);
  media.set("status", "pending_delete");
  app.save(media);
  app.delete(media);
  return detachedCampaigns;
}

function findDueMedia(app, now, limit, offset) {
  return app.findRecordsByFilter(
    MEDIA_COLLECTION,
    'delete_after != "" && delete_after <= {:now}',
    "delete_after",
    limit,
    offset || 0,
    { now: now.toISOString() },
  ) || [];
}

function cleanupExpiredMedia(app, nowValue, options) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (Number.isNaN(now.getTime())) throw new Error("invalid_cleanup_time");
  const limit = options && Number.isInteger(options.limit)
    ? Math.min(Math.max(options.limit, 1), CLEANUP_BATCH_SIZE)
    : CLEANUP_BATCH_SIZE;
  const maxBatches = options && Number.isInteger(options.maxBatches)
    ? Math.min(Math.max(options.maxBatches, 1), CLEANUP_MAX_BATCHES)
    : CLEANUP_MAX_BATCHES;
  const result = { scanned: 0, deleted: 0, detached_campaigns: 0, failed: 0 };
  let failedOffset = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const due = findDueMedia(app, now, limit, failedOffset);
    if (due.length === 0) break;
    let batchFailures = 0;
    due.forEach((candidate) => {
      result.scanned += 1;
      try {
        let deleted = false;
        let detachedCampaigns = 0;
        const execute = (txApp) => {
          const mediaId = recordString(candidate, "id") || String(candidate && candidate.id || "").trim();
          const current = findRecord(txApp, MEDIA_COLLECTION, mediaId);
          if (!current) return;
          detachedCampaigns = expireMedia(txApp, current);
          deleted = true;
        };
        if (app && typeof app.runInTransaction === "function") app.runInTransaction(execute);
        else execute(app);
        if (deleted) {
          result.deleted += 1;
          result.detached_campaigns += detachedCampaigns;
        }
      } catch (_) {
        result.failed += 1;
        batchFailures += 1;
      }
    });
    failedOffset += batchFailures;
    if (due.length < limit) break;
  }
  if (result.deleted > 0) storageBudget.invalidateStoreStorageUsage(app);
  return result;
}

function cleanupDueOrphans(app, nowValue, options) {
  return cleanupExpiredMedia(app, nowValue, options);
}

function codedError(code) {
  const safe = SAFE_ERRORS.has(String(code || "")) ? String(code) : "media_upload_failed";
  const error = new Error(safe);
  error.code = safe;
  return error;
}

function errorStatus(code) {
  if (["unauthorized", "permission_denied", "plan_not_available"].includes(code)) return 403;
  if (code === "media_not_found") return 404;
  if (["media_in_use", "media_quota_exceeded", "media_count_exceeded"].includes(code)) return 409;
  if (code === "media_too_large") return 413;
  if (code === "store_storage_full") return 507;
  if (code === "store_storage_unavailable") return 503;
  if (["invalid_payload", "media_required", "media_invalid"].includes(code)) return 400;
  return 500;
}

function safeErrorCode(error, fallback) {
  const code = String(error && (error.code || error.message) || "");
  return SAFE_ERRORS.has(code) ? code : fallback;
}

function sendError(e, error, fallback) {
  const code = safeErrorCode(error, fallback);
  return e.json(errorStatus(code), { ok: false, error: code });
}

function requestContext(e, parser) {
  const info = e.requestInfo();
  const context = loadMediaAccessContext(
    e.app || $app,
    info && info.auth || e.auth,
    headerValue(info, "X-PZ-Support-Store"),
  );
  assertMediaAccess(e.app || $app, context);
  const payload = parser(info && info.body || {});
  if (!payload) throw codedError("invalid_payload");
  return { context, info, payload };
}

function handleUpload(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e, parseUploadMetadata);
    const files = Array.from(e.findUploadedFiles("file") || []);
    if (files.length !== 1) throw codedError("media_required");
    validateUploadedWebp(files[0], request.payload);
    let media = null;
    const app = e.app || $app;
    const now = new Date();
    const globalStorage = storageBudget.assertStoreStorageBudget(app, request.payload.bytes, { now });
    const execute = (txApp) => {
      media = createMediaRecord(txApp, request.context, files[0], request.payload, now);
    };
    if (typeof app.runInTransaction === "function") app.runInTransaction(execute);
    else execute(app);
    storageBudget.recordStoreStorageIncrease(app, request.payload.bytes, now);
    const usage = mediaUsage(app, request.context.storeId);
    return e.json(201, { ok: true, media: mapMedia(media), quota: usage, storage: globalStorage });
  } catch (error) {
    return sendError(e, error, "media_upload_failed");
  }
}

function handleList(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e, parseEmptyPayload);
    const app = e.app || $app;
    const records = findMediaRecords(app, request.context.storeId, MAX_STORED_MEDIA_PER_STORE + 1);
    return e.json(200, {
      ok: true,
      media: records.map(mapMedia),
      quota: mediaUsage(app, request.context.storeId),
      limits: {
        max_bytes: MAX_STORED_BYTES_PER_STORE,
        max_media: MAX_STORED_MEDIA_PER_STORE,
        global_critical_bytes: storageBudget.STORE_STORAGE_CRITICAL_BYTES,
        global_hard_limit_bytes: storageBudget.STORE_STORAGE_HARD_LIMIT_BYTES,
      },
    });
  } catch (error) {
    return sendError(e, error, "media_upload_failed");
  }
}

function handleDelete(e) {
  setPrivateHeaders(e);
  try {
    const request = requestContext(e, parseDeletePayload);
    const app = e.app || $app;
    let deleted = false;
    const execute = (txApp) => {
      const media = findRecord(txApp, MEDIA_COLLECTION, request.payload.mediaId);
      if (!media || relationId(media, "store") !== request.context.storeId) {
        throw codedError("media_not_found");
      }
      if (hasCampaignReference(txApp, media.id || recordString(media, "id"))) {
        throw codedError("media_in_use");
      }
      deleted = deleteOrphanMedia(txApp, media, new Date());
    };
    if (typeof app.runInTransaction === "function") app.runInTransaction(execute);
    else execute(app);
    if (deleted) storageBudget.invalidateStoreStorageUsage(app);
    return e.json(200, { ok: true, deleted });
  } catch (error) {
    return sendError(e, error, "media_delete_failed");
  }
}

function handleFileDownload(e) {
  const status = recordString(e && e.record, "status");
  if (!["active", "archived"].includes(status)) {
    if (typeof NotFoundError === "function") throw new NotFoundError("No disponible.");
    throw codedError("media_not_found");
  }
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", PUBLIC_CACHE_CONTROL);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", "inline");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  } catch (_) {}
  return e.next();
}

function publicFileNotFound() {
  if (typeof NotFoundError === "function") throw new NotFoundError("No disponible.");
  throw codedError("media_not_found");
}

function handlePublicFile(e) {
  const mediaId = String(e.request.pathValue("record") || "").trim();
  const filename = String(e.request.pathValue("filename") || "").trim();
  if (!RECORD_ID_PATTERN.test(mediaId) || !STORED_WEBP_NAME_PATTERN.test(filename)) {
    return publicFileNotFound();
  }
  const app = e.app || $app;
  const record = findRecord(app, MEDIA_COLLECTION, mediaId);
  if (!record
    || !["active", "archived"].includes(recordString(record, "status"))
    || recordString(record, "file") !== filename) {
    return publicFileNotFound();
  }
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", PUBLIC_CACHE_CONTROL);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", "inline");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  } catch (_) {}
  const baseFilesPath = typeof record.baseFilesPath === "function"
    ? String(record.baseFilesPath() || "").trim()
    : "";
  if (!baseFilesPath || baseFilesPath.includes("..")) return publicFileNotFound();
  let filesystem = null;
  try {
    filesystem = app.newFilesystem();
    return filesystem.serve(e.response, e.request, `${baseFilesPath}/${filename}`, filename);
  } finally {
    try { if (filesystem) filesystem.close(); } catch (_) {}
  }
}

module.exports = {
  CAMPAIGNS_COLLECTION,
  CLEANUP_BATCH_SIZE,
  CLEANUP_MAX_BATCHES,
  MAX_OUTPUT_BYTES,
  MAX_OUTPUT_HEIGHT,
  MAX_OUTPUT_WIDTH,
  MAX_STORED_BYTES_PER_STORE,
  MAX_STORED_MEDIA_PER_STORE,
  MEDIA_COLLECTION,
  MEDIA_RETENTION_HOURS,
  PUBLIC_CACHE_CONTROL,
  RANDOM_WEBP_NAME_PATTERN,
  STORED_WEBP_NAME_PATTERN,
  assertMediaAccess,
  assertMediaQuota,
  cleanupDueOrphans,
  cleanupExpiredMedia,
  createMediaRecord,
  deleteOrphanMedia,
  detachCampaignReferences,
  expireMedia,
  handleDelete,
  handleFileDownload,
  handleList,
  handlePublicFile,
  handleUpload,
  hasCampaignReference,
  hasWebpMagic,
  loadMediaAccessContext,
  mapMedia,
  mediaUsage,
  parseDeletePayload,
  parseUploadMetadata,
  parseUploadedWebpDimensions,
  requireAuthenticatedUser,
  validateUploadedWebp,
};
