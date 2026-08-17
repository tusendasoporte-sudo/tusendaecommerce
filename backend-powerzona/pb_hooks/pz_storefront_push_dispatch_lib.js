/// <reference path="../pb_data/types.d.ts" />

"use strict";

const CAMPAIGNS_COLLECTION = "push_campaigns";
const DELIVERIES_COLLECTION = "push_campaign_deliveries";
const INSTALLATIONS_COLLECTION = "storefront_installations";
const APP_CONFIGS_COLLECTION = "storefront_app_configs";
const MEDIA_COLLECTION = "push_media";
const MAX_BATCH_SIZE = 500;
const MAX_ATTEMPTS = 3;
const CLAIM_LEASE_SECONDS = 300;
const DEFAULT_RETRY_SECONDS = Object.freeze([60, 300, 900]);
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const FID_PATTERN = /^[A-Za-z0-9_-]{16,255}$/;
const APP_ID_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const FIREBASE_APP_ID_PATTERN = /^1:[0-9]{6,20}:android:[a-f0-9]{16,64}$/;
const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;
const RELAY_RESULT_STATUSES = Object.freeze([
  "accepted", "invalid_fid", "failed_transient", "failed_permanent", "unknown",
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

function integerValue(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function recordId(record) {
  return String(record && record.id || recordString(record, "id")).trim();
}

function parsedDate(value) {
  const raw = value instanceof Date ? value.toISOString() : String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isoDate(value) {
  const date = value instanceof Date ? value : parsedDate(value);
  return date ? date.toISOString() : "";
}

function addSeconds(value, seconds) {
  const date = value instanceof Date ? new Date(value.getTime()) : parsedDate(value);
  if (!date) return "";
  date.setUTCSeconds(date.getUTCSeconds() + Math.max(0, Number(seconds) || 0));
  return date.toISOString();
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function safeErrorCode(value, fallback) {
  const code = bounded(value, 160).toLowerCase().replace(/[^a-z0-9._/-]+/g, "_").slice(0, 80);
  return code || fallback;
}

function safeGetenv(name) {
  try { return String($os.getenv(name) || "").trim(); } catch (_) { return ""; }
}

function validRelayUrl(value, allowHttp) {
  const url = String(value || "").trim();
  if (/^https:\/\/[^\s?#]+(?:\?[^\s#]*)?$/i.test(url)
    && /\/api\/internal\/push\/v2\/send(?:\?|$)/.test(url)) return url;
  if (allowHttp && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?\/api\/internal\/push\/v2\/send$/i.test(url)) {
    return url;
  }
  return "";
}

function validMediaOrigin(value, allowHttp) {
  const origin = String(value || "").trim().replace(/\/$/, "");
  if (/^https:\/\/[^\s/?#]+(?::[0-9]{1,5})?$/i.test(origin)) return origin;
  if (allowHttp && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/i.test(origin)) return origin;
  return "";
}

function relayConfig(getenv) {
  const read = typeof getenv === "function" ? getenv : safeGetenv;
  const allowHttp = String(read("PZ_STOREFRONT_PUSH_RELAY_ALLOW_HTTP") || "").trim() === "1";
  const url = validRelayUrl(read("PZ_STOREFRONT_PUSH_RELAY_URL"), allowHttp);
  const secret = String(read("PZ_STOREFRONT_PUSH_RELAY_SECRET") || "").trim();
  const adminSecret = String(read("PZ_PUSH_RELAY_SECRET") || "").trim();
  const mediaOrigin = validMediaOrigin(read("PZ_STOREFRONT_MEDIA_PUBLIC_ORIGIN"), allowHttp);
  if (!url || secret.length < 32 || (adminSecret && secret === adminSecret)) return null;
  return { url, secret, mediaOrigin };
}

function secureToken(length, options) {
  if (options && typeof options.randomToken === "function") {
    const value = String(options.randomToken(length) || "").trim();
    if (value.length >= length) return value.slice(0, length);
  }
  try {
    const value = String($security.randomString(length) || "").trim();
    if (value.length >= length) return value.slice(0, length);
  } catch (_) {}
  throw new Error("secure_random_unavailable");
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

function runTransaction(app, callback) {
  let result;
  if (app && typeof app.runInTransaction === "function") {
    app.runInTransaction((txApp) => { result = callback(txApp); });
  } else {
    result = callback(app);
  }
  return result;
}

function retryDelaySeconds(attemptCount, requested) {
  const fallback = DEFAULT_RETRY_SECONDS[Math.max(0, Math.min(DEFAULT_RETRY_SECONDS.length - 1, attemptCount - 1))];
  const received = Number(requested);
  return Math.max(fallback, Number.isFinite(received) ? Math.min(3600, Math.max(0, Math.ceil(received))) : 0);
}

function dueForRetry(delivery, now) {
  if (recordString(delivery, "status") !== "failed_transient") return false;
  if (integerValue(delivery, "attempt_count") >= MAX_ATTEMPTS) return false;
  const retryAt = parsedDate(recordValue(delivery, "lease_expires_at"));
  return !retryAt || retryAt.getTime() <= now.getTime();
}

function recoverExpiredClaims(app, campaignId, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  let recovered = 0;
  for (let batchIndex = 0; batchIndex < 20; batchIndex += 1) {
    const expired = findRecordsStrict(
      app,
      DELIVERIES_COLLECTION,
      'campaign = {:campaign} && status = "claimed" && lease_expires_at != "" && lease_expires_at <= {:now}',
      "id",
      MAX_BATCH_SIZE,
      0,
      { campaign: campaignId, now: now.toISOString() },
    );
    if (!expired.length) break;
    runTransaction(app, (txApp) => {
      expired.forEach((candidate) => {
        const delivery = findRecord(txApp, DELIVERIES_COLLECTION, recordId(candidate));
        if (!delivery || recordString(delivery, "status") !== "claimed") return;
        const lease = parsedDate(recordValue(delivery, "lease_expires_at"));
        if (!lease || lease.getTime() > now.getTime()) return;
        delivery.set("status", "unknown");
        delivery.set("error_code", "claim_lease_expired");
        delivery.set("failed_at", now.toISOString());
        delivery.set("claim_token", "");
        delivery.set("lease_expires_at", "");
        txApp.save(delivery);
        recovered += 1;
      });
    });
    if (expired.length < MAX_BATCH_SIZE) break;
  }
  return recovered;
}

function claimCampaignDeliveries(app, campaign, nowValue, options) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const campaignId = recordId(campaign);
  const campaignStoreId = relationId(campaign, "store");
  if (!RECORD_ID_PATTERN.test(campaignId) || !RECORD_ID_PATTERN.test(campaignStoreId)) {
    throw new Error("invalid_campaign_scope");
  }
  recoverExpiredClaims(app, campaignId, now);
  const claimToken = secureToken(48, options);
  const leaseExpiresAt = addSeconds(now, CLAIM_LEASE_SECONDS);
  return runTransaction(app, (txApp) => {
    const candidates = [];
    const pending = findRecordsStrict(
      txApp,
      DELIVERIES_COLLECTION,
      'campaign = {:campaign} && store = {:store} && status = "pending"',
      "id",
      MAX_BATCH_SIZE,
      0,
      { campaign: campaignId, store: campaignStoreId },
    );
    pending.forEach((item) => candidates.push(item));
    if (candidates.length < MAX_BATCH_SIZE) {
      const retryable = findRecordsStrict(
        txApp,
        DELIVERIES_COLLECTION,
        'campaign = {:campaign} && store = {:store} && status = "failed_transient" && (lease_expires_at = "" || lease_expires_at <= {:now})',
        "lease_expires_at,id",
        MAX_BATCH_SIZE - candidates.length,
        0,
        { campaign: campaignId, store: campaignStoreId, now: now.toISOString() },
      );
      retryable.forEach((item) => candidates.push(item));
    }

    const claimedIds = [];
    candidates.forEach((candidate) => {
      const delivery = findRecord(txApp, DELIVERIES_COLLECTION, recordId(candidate));
      if (!delivery
        || relationId(delivery, "campaign") !== campaignId
        || relationId(delivery, "store") !== campaignStoreId) return;
      const status = recordString(delivery, "status");
      if (status !== "pending" && !dueForRetry(delivery, now)) return;
      delivery.set("status", "claimed");
      delivery.set("claim_token", claimToken);
      delivery.set("lease_expires_at", leaseExpiresAt);
      delivery.set("attempt_count", integerValue(delivery, "attempt_count") + 1);
      delivery.set("last_attempt_at", now.toISOString());
      txApp.save(delivery);
      claimedIds.push(recordId(delivery));
    });
    return { claimToken, claimedIds, leaseExpiresAt };
  });
}

function mediaFileName(media) {
  const value = recordValue(media, "file");
  if (Array.isArray(value)) return bounded(value[0], 220);
  return bounded(value, 220);
}

function campaignImageUrl(app, campaign, config, now) {
  const mediaId = relationId(campaign, "media");
  if (!mediaId) return "";
  if (!config.mediaOrigin) throw new Error("media_origin_not_configured");
  const media = findRecord(app, MEDIA_COLLECTION, mediaId);
  if (!media
    || relationId(media, "store") !== relationId(campaign, "store")
    || recordString(media, "status") !== "active") throw new Error("media_unavailable");
  const expiresAt = parsedDate(recordValue(media, "delete_after"));
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) throw new Error("media_expired");
  const filename = mediaFileName(media);
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    throw new Error("media_unavailable");
  }
  return `${config.mediaOrigin}/api/pz/storefront/v1/media/file/${encodeURIComponent(mediaId)}/${encodeURIComponent(filename)}`;
}

function localFailure(deliveryId, status, errorCode, retryAfterSeconds) {
  return {
    delivery_id: deliveryId,
    status,
    firebase_message_id: "",
    error_code: safeErrorCode(errorCode, "delivery_failed"),
    retry_after_seconds: Math.max(0, Math.min(3600, Number(retryAfterSeconds) || 0)),
  };
}

function buildRelayGroups(app, campaign, claimedIds, config, now) {
  const groups = new Map();
  const localResults = [];
  const seenByGroup = new Map();
  let imageUrl = "";
  try { imageUrl = campaignImageUrl(app, campaign, config, now); }
  catch (error) {
    claimedIds.forEach((id) => localResults.push(localFailure(id, "failed_permanent", error && error.message, 0)));
    return { groups, localResults };
  }

  claimedIds.forEach((deliveryId) => {
    const delivery = findRecord(app, DELIVERIES_COLLECTION, deliveryId);
    if (!delivery || recordString(delivery, "status") !== "claimed") return;
    const installation = findRecord(app, INSTALLATIONS_COLLECTION, relationId(delivery, "installation"));
    if (!installation || relationId(installation, "store") !== relationId(campaign, "store")) {
      localResults.push(localFailure(deliveryId, "failed_permanent", "installation_unavailable", 0));
      return;
    }
    const installationStatus = recordString(installation, "status");
    const fid = bounded(recordString(installation, "fid"), 255);
    if (installationStatus === "invalid" || !FID_PATTERN.test(fid)) {
      localResults.push(localFailure(deliveryId, "invalid_fid", "invalid_fid", 0));
      return;
    }
    if (installationStatus !== "active" || recordString(installation, "notification_permission") !== "granted") {
      localResults.push(localFailure(deliveryId, "failed_permanent", "installation_ineligible", 0));
      return;
    }
    const appConfig = findRecord(app, APP_CONFIGS_COLLECTION, relationId(installation, "app_config"));
    const appKey = recordString(appConfig, "app_key");
    const packageName = recordString(appConfig, "package_name");
    const firebaseAppId = recordString(appConfig, "firebase_app_id");
    const firebaseProjectId = recordString(appConfig, "firebase_project_id");
    if (!appConfig
      || relationId(appConfig, "store") !== relationId(campaign, "store")
      || recordString(appConfig, "status") !== "active"
      || !APP_KEY_PATTERN.test(appKey)
      || !APP_ID_PATTERN.test(packageName)
      || !FIREBASE_APP_ID_PATTERN.test(firebaseAppId)) {
      localResults.push(localFailure(deliveryId, "failed_permanent", "app_config_unavailable", 0));
      return;
    }
    const groupKey = `${appKey}\n${packageName}\n${firebaseAppId}\n${firebaseProjectId}`;
    const seen = seenByGroup.get(groupKey) || new Set();
    if (seen.has(fid)) {
      localResults.push(localFailure(deliveryId, "failed_permanent", "duplicate_fid", 0));
      return;
    }
    seen.add(fid);
    seenByGroup.set(groupKey, seen);
    const relayApp = { app_key: appKey, package_name: packageName, firebase_app_id: firebaseAppId };
    if (firebaseProjectId) relayApp.firebase_project_id = firebaseProjectId;
    const group = groups.get(groupKey) || {
      app: relayApp,
      message: {
        schema_version: "1",
        channel: "storefront",
        store_key: appKey,
        campaign_id: recordId(campaign),
        title: bounded(recordString(campaign, "title"), 120),
        body: bounded(recordString(campaign, "body"), 1000),
        image_url: imageUrl,
        target_type: bounded(recordString(campaign, "target_type"), 20),
        target_path: bounded(recordString(campaign, "target_path"), 500),
      },
      deliveries: [],
    };
    group.deliveries.push({ delivery_id: deliveryId, fid });
    groups.set(groupKey, group);
  });
  return { groups, localResults };
}

function validRelayResult(value, allowedIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const expected = ["delivery_id", "error_code", "firebase_message_id", "retry_after_seconds", "status"];
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) return null;
  const deliveryId = bounded(value.delivery_id, 15);
  const status = bounded(value.status, 30);
  const messageId = bounded(value.firebase_message_id, 255);
  const errorCode = safeErrorCode(value.error_code, status === "accepted" ? "" : "relay_failure");
  const retryAfter = Number(value.retry_after_seconds);
  if (!allowedIds.has(deliveryId)
    || !RELAY_RESULT_STATUSES.includes(status)
    || !Number.isInteger(retryAfter)
    || retryAfter < 0
    || retryAfter > 3600) return null;
  if (status === "accepted" && (!messageId || bounded(value.error_code, 80) || retryAfter)) return null;
  if (status !== "accepted" && messageId) return null;
  return {
    delivery_id: deliveryId,
    status,
    firebase_message_id: messageId,
    error_code: errorCode,
    retry_after_seconds: retryAfter,
  };
}

function normalizeRelayResponse(response, deliveryIds) {
  const allowedIds = new Set(deliveryIds);
  const unknown = () => deliveryIds.map((id) => localFailure(id, "unknown", "relay_response_ambiguous", 0));
  if (!response || !response.json || typeof response.json !== "object") return unknown();
  const body = response.json;
  if (Number(response.statusCode) === 200 && body.ok === true && Array.isArray(body.results)) {
    const seen = new Set();
    const normalized = [];
    for (const value of body.results) {
      const item = validRelayResult(value, allowedIds);
      if (!item || seen.has(item.delivery_id)) return unknown();
      seen.add(item.delivery_id);
      normalized.push(item);
    }
    return normalized.length === deliveryIds.length ? normalized : unknown();
  }
  if (body.dispatched === false) {
    const status = body.retryable === true ? "failed_transient" : "failed_permanent";
    const retryAfter = Number(response.headers && (response.headers["Retry-After"] || response.headers["retry-after"])) || 0;
    return deliveryIds.map((id) => localFailure(id, status, body.error || "relay_rejected", retryAfter));
  }
  return unknown();
}

function sendRelayGroup(group, config, send) {
  try {
    const response = send({
      url: config.url,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pz-storefront-push-secret": config.secret,
      },
      body: JSON.stringify(group),
      timeout: 30,
    });
    return normalizeRelayResponse(response, group.deliveries.map((item) => item.delivery_id));
  } catch (_) {
    return group.deliveries.map((item) => localFailure(item.delivery_id, "unknown", "relay_transport_ambiguous", 0));
  }
}

function persistClaimResults(app, claimToken, results, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const byId = new Map(results.map((item) => [item.delivery_id, item]));
  return runTransaction(app, (txApp) => {
    const counts = { accepted: 0, invalid_fid: 0, failed_transient: 0, failed_permanent: 0, unknown: 0 };
    byId.forEach((result, id) => {
      const delivery = findRecord(txApp, DELIVERIES_COLLECTION, id);
      if (!delivery
        || recordString(delivery, "status") !== "claimed"
        || recordString(delivery, "claim_token") !== claimToken) return;
      const attemptCount = integerValue(delivery, "attempt_count");
      let status = result.status;
      let errorCode = result.error_code;
      if (status === "failed_transient" && attemptCount >= MAX_ATTEMPTS) {
        status = "failed_permanent";
        errorCode = "retry_exhausted";
      }
      delivery.set("status", status);
      delivery.set("claim_token", "");
      delivery.set("firebase_message_id", status === "accepted" ? result.firebase_message_id : "");
      delivery.set("error_code", status === "accepted" ? "" : safeErrorCode(errorCode, "delivery_failed"));
      if (status === "accepted") {
        delivery.set("accepted_at", now.toISOString());
        delivery.set("failed_at", "");
        delivery.set("lease_expires_at", "");
      } else if (status === "failed_transient") {
        delivery.set("failed_at", now.toISOString());
        delivery.set("lease_expires_at", addSeconds(
          now,
          retryDelaySeconds(attemptCount, result.retry_after_seconds),
        ));
      } else {
        delivery.set("failed_at", now.toISOString());
        delivery.set("lease_expires_at", "");
      }
      txApp.save(delivery);
      counts[status] = (counts[status] || 0) + 1;

      if (status === "invalid_fid") {
        const installation = findRecord(txApp, INSTALLATIONS_COLLECTION, relationId(delivery, "installation"));
        if (installation
          && relationId(installation, "store") === relationId(delivery, "store")
          && recordString(installation, "status") !== "invalid") {
          installation.set("status", "invalid");
          installation.set("disabled_at", now.toISOString());
          txApp.save(installation);
        }
      }
    });
    return counts;
  });
}

function dispatchClaimedDeliveries(app, campaign, claim, nowValue, options) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  if (!claim || !Array.isArray(claim.claimedIds) || !claim.claimedIds.length) {
    return { accepted: 0, invalid_fid: 0, failed_transient: 0, failed_permanent: 0, unknown: 0 };
  }
  const config = options && options.config ? options.config : relayConfig();
  const send = options && typeof options.send === "function"
    ? options.send
    : (typeof $http !== "undefined" && $http && typeof $http.send === "function" ? $http.send.bind($http) : null);
  let results = [];
  if (!config || !send) {
    results = claim.claimedIds.map((id) => localFailure(id, "failed_transient", "relay_not_configured", 60));
  } else {
    const prepared = buildRelayGroups(app, campaign, claim.claimedIds, config, now);
    results = prepared.localResults.slice();
    prepared.groups.forEach((group) => {
      results.push(...sendRelayGroup(group, config, send));
    });
    const received = new Set(results.map((item) => item.delivery_id));
    claim.claimedIds.forEach((id) => {
      if (!received.has(id)) results.push(localFailure(id, "unknown", "relay_result_missing", 0));
    });
  }
  return persistClaimResults(app, claim.claimToken, results, now);
}

function deliveryStatusCounts(app, campaignId) {
  const counts = {
    pending: 0,
    claimed: 0,
    accepted: 0,
    failed_transient: 0,
    failed_permanent: 0,
    invalid_fid: 0,
    unknown: 0,
    canceled: 0,
  };
  for (const status of Object.keys(counts)) {
    try {
      const rows = arrayOf(new DynamicModel({ total: 0 }));
      app.db().newQuery(`
        SELECT COUNT(*) AS total
        FROM push_campaign_deliveries
        WHERE campaign = {:campaign} AND status = {:status}
      `).bind({ campaign: campaignId, status }).all(rows);
      counts[status] = Math.max(0, Number(rows[0] && rows[0].total) || 0);
    } catch (_) {
      let total = 0;
      for (let offset = 0; ; offset += 500) {
        const records = findRecordsStrict(
          app,
          DELIVERIES_COLLECTION,
          "campaign = {:campaign} && status = {:status}",
          "id",
          500,
          offset,
          { campaign: campaignId, status },
        );
        total += records.length;
        if (records.length < 500) break;
      }
      counts[status] = total;
    }
  }
  return counts;
}

module.exports = {
  APP_CONFIGS_COLLECTION,
  CLAIM_LEASE_SECONDS,
  DELIVERIES_COLLECTION,
  INSTALLATIONS_COLLECTION,
  MAX_ATTEMPTS,
  MAX_BATCH_SIZE,
  MEDIA_COLLECTION,
  RELAY_RESULT_STATUSES,
  addSeconds,
  buildRelayGroups,
  campaignImageUrl,
  claimCampaignDeliveries,
  deliveryStatusCounts,
  dispatchClaimedDeliveries,
  dueForRetry,
  normalizeRelayResponse,
  persistClaimResults,
  recoverExpiredClaims,
  relayConfig,
  retryDelaySeconds,
  validMediaOrigin,
  validRelayResult,
  validRelayUrl,
};
