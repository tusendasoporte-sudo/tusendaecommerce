/// <reference path="../pb_data/types.d.ts" />

const CACHE_COLLECTION = "store_security_ip_reputation_cache";
const EVENTS_COLLECTION = "store_security_events";
const PROVIDER_ENDPOINT = "https://api.ipapi.is";
const PROVIDER_NAME = "ipapi_is_anonymous";
const VALID_POLICIES = ["off", "monitor", "block"];
const VALID_HMAC = /^[A-Za-z0-9._:-]{32,200}$/;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE_TTL_MS = 5 * 60 * 1000;

function value(record, key) {
  if (!record) return undefined;
  try {
    const direct = record.get(key);
    if (direct !== undefined) return direct;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function text(input) {
  if (Array.isArray(input)) return input.length ? text(input[0]) : "";
  if (input && typeof input === "object" && input.id) return String(input.id || "").trim();
  return String(input === null || input === undefined ? "" : input).trim();
}

function recordString(record, key) {
  return text(value(record, key));
}

function recordBoolean(record, key) {
  const current = value(record, key);
  return current === true || current === 1 || current === "1" || current === "true";
}

function findCollection(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function dateValue(input) {
  const parsed = Date.parse(String(input || ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizePolicy(input) {
  const policy = String(input || "").trim();
  return VALID_POLICIES.includes(policy) ? policy : "off";
}

function unavailableResult(source, checkedAt) {
  return {
    available: false,
    detected: false,
    verdict: "unavailable",
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    provider: PROVIDER_NAME,
    source: source || "provider",
    checked_at: checkedAt || "",
  };
}

function normalizeProviderResponse(payload, checkedAt) {
  if (!payload || typeof payload !== "object" || payload.error) {
    return unavailableResult("provider", checkedAt);
  }
  if (typeof payload.is_vpn !== "boolean"
    || typeof payload.is_proxy !== "boolean"
    || typeof payload.is_tor !== "boolean") {
    return unavailableResult("provider", checkedAt);
  }
  const result = {
    available: true,
    detected: payload.is_vpn || payload.is_proxy || payload.is_tor,
    verdict: payload.is_vpn || payload.is_proxy || payload.is_tor ? "vpn_or_proxy" : "clean",
    is_vpn: payload.is_vpn,
    is_proxy: payload.is_proxy,
    is_tor: payload.is_tor,
    provider: PROVIDER_NAME,
    source: "provider",
    checked_at: checkedAt || "",
  };
  return result;
}

function sendProviderRequest(ipAddress, send) {
  if (typeof send !== "function") return unavailableResult("provider", "");
  const checkedAt = new Date().toISOString();
  try {
    const response = send({
      url: PROVIDER_ENDPOINT,
      method: "POST",
      body: JSON.stringify({ q: ipAddress }),
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      timeout: 2,
    });
    if (!response || Number(response.statusCode) !== 200) {
      return unavailableResult("provider", checkedAt);
    }
    return normalizeProviderResponse(response.json, checkedAt);
  } catch (_) {
    return unavailableResult("provider", checkedAt);
  }
}

function resultFromCache(record) {
  if (!record) return null;
  const verdict = recordString(record, "verdict");
  if (!["clean", "vpn_or_proxy", "unavailable"].includes(verdict)) return null;
  return {
    available: verdict !== "unavailable",
    detected: verdict === "vpn_or_proxy",
    verdict,
    is_vpn: recordBoolean(record, "is_vpn"),
    is_proxy: recordBoolean(record, "is_proxy"),
    is_tor: recordBoolean(record, "is_tor"),
    provider: PROVIDER_NAME,
    source: "cache",
    checked_at: recordString(record, "checked_at"),
  };
}

function activeCachedResult(app, storeId, ipHmac, now) {
  if (!findCollection(app, CACHE_COLLECTION)) return null;
  const record = findFirst(
    app,
    CACHE_COLLECTION,
    "store = {:store} && ip_hmac = {:ipHmac}",
    { store: storeId, ipHmac },
  );
  if (!record || dateValue(recordString(record, "expires_at")) <= now.getTime()) return null;
  return resultFromCache(record);
}

function saveCachedResult(app, storeId, ipHmac, result, now) {
  const collection = findCollection(app, CACHE_COLLECTION);
  if (!collection) return result;
  const checkedAt = result.checked_at || now.toISOString();
  const ttl = result.available ? SUCCESS_TTL_MS : UNAVAILABLE_TTL_MS;
  let record = findFirst(
    app,
    CACHE_COLLECTION,
    "store = {:store} && ip_hmac = {:ipHmac}",
    { store: storeId, ipHmac },
  );
  if (!record) record = new Record(collection, {});
  record.set("store", storeId);
  record.set("ip_hmac", ipHmac);
  record.set("verdict", result.verdict);
  record.set("is_vpn", result.is_vpn === true);
  record.set("is_proxy", result.is_proxy === true);
  record.set("is_tor", result.is_tor === true);
  record.set("checked_at", checkedAt);
  record.set("expires_at", new Date(now.getTime() + ttl).toISOString());
  try {
    app.save(record);
  } catch (_) {
    const concurrent = findFirst(
      app,
      CACHE_COLLECTION,
      "store = {:store} && ip_hmac = {:ipHmac}",
      { store: storeId, ipHmac },
    );
    if (concurrent) return resultFromCache(concurrent) || result;
  }
  return result;
}

function lookup(app, storeId, ipAddress, ipHmac, options) {
  const now = options && options.now instanceof Date ? options.now : new Date();
  if (!storeId || !ipAddress || !VALID_HMAC.test(String(ipHmac || ""))) {
    return unavailableResult("identity", now.toISOString());
  }
  const cached = activeCachedResult(app, storeId, ipHmac, now);
  if (cached) return cached;
  const send = options && typeof options.send === "function"
    ? options.send
    : (typeof $http !== "undefined" && $http && typeof $http.send === "function" ? $http.send.bind($http) : null);
  const result = sendProviderRequest(ipAddress, send);
  return saveCachedResult(app, storeId, ipHmac, result, now);
}

function eventKey(storeId, policy, eventType, ipHmac, checkedAt) {
  const material = [storeId, policy, eventType, ipHmac, checkedAt].join("|");
  try { return `ip_reputation:${String($security.sha256(material) || "").slice(0, 128)}`; } catch (_) { return ""; }
}

function recordEvent(app, store, settings, signals, result, policy, blocked, now) {
  const collection = findCollection(app, EVENTS_COLLECTION);
  const storeId = recordString(store, "id");
  if (!collection || !storeId || !VALID_HMAC.test(String(signals && signals.ip || ""))) return null;
  const eventType = result.available
    ? (blocked ? "vpn_blocked" : "vpn_detected")
    : "vpn_check_unavailable";
  const key = eventKey(storeId, policy, eventType, signals.ip, result.checked_at || now.toISOString());
  if (!key) return null;
  let event = findFirst(app, EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey: key });
  if (event) return event;

  event = new Record(collection, {});
  event.set("store", storeId);
  event.set("event_key", key);
  event.set("event_type", eventType);
  event.set("source_type", "system");
  event.set("risk_level", blocked ? "blocked" : "suspicious");
  event.set("decision", blocked ? "blocked" : "monitored");
  event.set("mode_at_event", recordString(settings, "mode") === "protection" ? "protection" : "monitoring");
  event.set("phone_hmac", "");
  event.set("ip_hmac", signals.ip);
  event.set("ip_masked", "");
  event.set("ip_encrypted", "");
  event.set("ip_family", signals.ipFamily || "unknown");
  event.set("browser_token_hmac", signals.device || "");
  event.set("capture_status", "partial");
  event.set("crypto_version", "v1");
  event.set("metadata_json", {
    policy,
    provider: PROVIDER_NAME,
    is_vpn: result.is_vpn === true,
    is_proxy: result.is_proxy === true,
    is_tor: result.is_tor === true,
  });
  event.set("occurred_at", now.toISOString());
  try {
    app.save(event);
  } catch (_) {
    return findFirst(app, EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey: key });
  }
  return event;
}

function evaluate(app, store, settings, signals, normalizedIp, options) {
  const policy = normalizePolicy(recordString(settings, "vpn_policy"));
  if (policy === "off") return { enabled: false, blocked: false, reason: "policy_off", policy };
  const now = options && options.now instanceof Date ? options.now : new Date();
  const result = lookup(
    app,
    recordString(store, "id"),
    normalizedIp && normalizedIp.valid ? normalizedIp.canonical : "",
    signals && signals.ip,
    { now, send: options && options.send },
  );
  const blocked = result.available
    && result.detected
    && policy === "block"
    && recordString(settings, "mode") === "protection";
  if (result.detected || !result.available) {
    try { recordEvent(app, store, settings, signals || {}, result, policy, blocked, now); } catch (_) {}
  }
  return {
    enabled: true,
    blocked,
    reason: blocked ? "vpn_or_proxy_detected" : (result.available ? (result.detected ? "detected" : "clean") : "unavailable"),
    policy,
    result,
  };
}

module.exports = {
  evaluate,
  _test: {
    normalizePolicy,
    normalizeProviderResponse,
    sendProviderRequest,
    resultFromCache,
    lookup,
    eventKey,
    constants: {
      providerEndpoint: PROVIDER_ENDPOINT,
      successTtlMs: SUCCESS_TTL_MS,
      unavailableTtlMs: UNAVAILABLE_TTL_MS,
    },
  },
};
