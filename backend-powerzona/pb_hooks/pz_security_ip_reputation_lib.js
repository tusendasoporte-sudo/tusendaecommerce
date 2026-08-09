/// <reference path="../pb_data/types.d.ts" />

const CACHE_COLLECTION = "store_security_ip_reputation_cache";
const EVENTS_COLLECTION = "store_security_events";
const USAGE_COLLECTION = "security_ip_reputation_usage";
const PROVIDER_ENDPOINT = "https://api.ipapi.is";
const PROVIDER_NAME = "ipapi_is";
const PROVIDER_KEY_ENV = "PZ_IPAPI_KEY";
const AUTHENTICATED_DAILY_BUDGET = 900;
const ANONYMOUS_DAILY_BUDGET = 90;
const PROXYCHECK_ENDPOINT = "https://proxycheck.io/v3/";
const PROXYCHECK_PROVIDER_NAME = "proxycheck_io";
const PROXYCHECK_KEY_ENV = "PZ_PROXYCHECK_KEY";
const PROXYCHECK_DAILY_BUDGET = 300;
const PROXYCHECK_MIN_CONFIDENCE = 90;
const PROXYCHECK_API_VERSION = "24-June-2026";
const ABUSEIPDB_ENDPOINT = "https://api.abuseipdb.com/api/v2/check";
const ABUSEIPDB_PROVIDER_NAME = "abuseipdb";
const ABUSEIPDB_KEY_ENV = "PZ_ABUSEIPDB_KEY";
const ABUSEIPDB_DAILY_BUDGET = 800;
const ABUSEIPDB_MAX_AGE_DAYS = 30;
const ABUSEIPDB_BLOCK_THRESHOLD = 25;
const CLASSIFIER_VERSION = "strict_abuse_v1";
const VALID_POLICIES = ["off", "monitor", "block"];
const VALID_HMAC = /^[A-Za-z0-9._:-]{32,200}$/;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE_TTL_MS = 5 * 60 * 1000;
const torFeed = typeof __hooks === "undefined"
  ? require("./pz_security_tor_feed_lib.js")
  : require(`${__hooks}/pz_security_tor_feed_lib.js`);

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

function recordNumber(record, key) {
  const current = value(record, key);
  if (current === null || current === undefined || current === "") return null;
  const parsed = Number(current);
  return Number.isFinite(parsed) ? parsed : null;
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

function unavailableResult(source, checkedAt, provider) {
  return {
    available: false,
    detected: false,
    verdict: "unavailable",
    is_vpn: false,
    is_proxy: false,
    is_tor: false,
    is_datacenter: false,
    is_abuser: false,
    is_crawler: false,
    is_mobile: false,
    suspected: false,
    abusive: false,
    hosting_consensus: false,
    confidence: null,
    abuse_available: false,
    abuse_score: null,
    abuse_total_reports: 0,
    abuse_distinct_users: 0,
    abuse_last_reported_at: "",
    abuse_block_candidate: false,
    provider: provider || PROVIDER_NAME,
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
  const detected = payload.is_vpn || payload.is_proxy || payload.is_tor;
  const isDatacenter = payload.is_datacenter === true;
  const isAbuser = payload.is_abuser === true;
  const isCrawler = payload.is_crawler === true;
  const suspected = !detected && !isCrawler && (isDatacenter || isAbuser);
  const result = {
    available: true,
    detected,
    suspected,
    verdict: detected ? "vpn_or_proxy" : (suspected ? "network_suspected" : "clean"),
    is_vpn: payload.is_vpn,
    is_proxy: payload.is_proxy,
    is_tor: payload.is_tor,
    is_datacenter: isDatacenter,
    is_abuser: isAbuser,
    is_crawler: isCrawler,
    is_mobile: payload.is_mobile === true,
    abusive: false,
    hosting_consensus: false,
    confidence: null,
    abuse_available: false,
    abuse_score: null,
    abuse_total_reports: 0,
    abuse_distinct_users: 0,
    abuse_last_reported_at: "",
    abuse_block_candidate: false,
    provider: PROVIDER_NAME,
    source: "provider",
    checked_at: checkedAt || "",
  };
  return result;
}

function validProviderApiKey(input) {
  const candidate = text(input);
  return candidate.length >= 8 && candidate.length <= 512 && !/\s/.test(candidate) ? candidate : "";
}

function providerApiKey() {
  try { return validProviderApiKey($os.getenv(PROVIDER_KEY_ENV)); } catch (_) { return ""; }
}

function proxycheckApiKey() {
  try { return validProviderApiKey($os.getenv(PROXYCHECK_KEY_ENV)); } catch (_) { return ""; }
}

function abuseIpDbApiKey() {
  try { return validProviderApiKey($os.getenv(ABUSEIPDB_KEY_ENV)); } catch (_) { return ""; }
}

function sendProviderRequest(ipAddress, send, options) {
  if (typeof send !== "function") return unavailableResult("provider", "");
  const checkedAt = new Date().toISOString();
  const apiKey = validProviderApiKey(options && options.apiKey);
  const body = { q: ipAddress };
  if (apiKey) body.key = apiKey;
  try {
    const response = send({
      url: PROVIDER_ENDPOINT,
      method: "POST",
      body: JSON.stringify(body),
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

function proxycheckPayloadEntry(payload, ipAddress) {
  if (!payload || typeof payload !== "object") return null;
  const exact = payload[ipAddress];
  if (exact && typeof exact === "object") return exact;
  const responseIp = text(payload.ip);
  if (responseIp && payload[responseIp] && typeof payload[responseIp] === "object") return payload[responseIp];
  const ignored = ["status", "message", "ip", "version", "node", "query_time"];
  const keys = Object.keys(payload);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (ignored.includes(key)) continue;
    const candidate = payload[key];
    if (candidate && typeof candidate === "object" && candidate.detections && typeof candidate.detections === "object") {
      return candidate;
    }
  }
  return null;
}

function normalizeProxycheckResponse(payload, ipAddress, checkedAt) {
  const status = text(payload && payload.status).toLowerCase();
  if (!payload || typeof payload !== "object" || (status !== "ok" && status !== "warning")) {
    return unavailableResult("provider", checkedAt, PROXYCHECK_PROVIDER_NAME);
  }
  const entry = proxycheckPayloadEntry(payload, ipAddress);
  const detections = entry && entry.detections;
  if (!detections || typeof detections !== "object"
    || typeof detections.vpn !== "boolean"
    || typeof detections.proxy !== "boolean"
    || typeof detections.tor !== "boolean") {
    return unavailableResult("provider", checkedAt, PROXYCHECK_PROVIDER_NAME);
  }

  const rawDetected = detections.vpn || detections.proxy || detections.tor;
  const confidenceValue = Number(detections.confidence);
  const confidence = Number.isFinite(confidenceValue)
    ? Math.max(0, Math.min(100, Math.trunc(confidenceValue)))
    : null;
  const detected = rawDetected && confidence !== null && confidence >= PROXYCHECK_MIN_CONFIDENCE;
  const networkType = text(entry && entry.network && entry.network.type).toLowerCase();
  const isDatacenter = detections.hosting === true || networkType === "hosting";
  const isAbuser = detections.compromised === true;
  const isCrawler = detections.scraper === true;
  const suspected = !detected && !isCrawler && (rawDetected || isDatacenter || isAbuser);
  return {
    available: true,
    detected,
    suspected,
    verdict: detected ? "vpn_or_proxy" : (suspected ? "network_suspected" : "clean"),
    is_vpn: detected && detections.vpn === true,
    is_proxy: detected && detections.proxy === true,
    is_tor: detected && detections.tor === true,
    is_datacenter: isDatacenter,
    is_abuser: isAbuser,
    is_crawler: isCrawler,
    is_mobile: networkType === "wireless",
    abusive: false,
    hosting_consensus: false,
    confidence,
    abuse_available: false,
    abuse_score: null,
    abuse_total_reports: 0,
    abuse_distinct_users: 0,
    abuse_last_reported_at: "",
    abuse_block_candidate: false,
    provider: PROXYCHECK_PROVIDER_NAME,
    source: "provider",
    checked_at: checkedAt || "",
  };
}

function sendProxycheckRequest(ipAddress, send, options) {
  const checkedAt = new Date().toISOString();
  const apiKey = validProviderApiKey(options && options.apiKey);
  if (typeof send !== "function" || !apiKey) {
    return unavailableResult("provider", checkedAt, PROXYCHECK_PROVIDER_NAME);
  }
  const query = [
    `key=${encodeURIComponent(apiKey)}`,
    "tag=0",
    "p=0",
    `ver=${encodeURIComponent(PROXYCHECK_API_VERSION)}`,
  ].join("&");
  try {
    const response = send({
      url: `${PROXYCHECK_ENDPOINT}${encodeURIComponent(ipAddress)}?${query}`,
      method: "GET",
      headers: { "accept": "application/json" },
      timeout: 2,
    });
    if (!response || Number(response.statusCode) !== 200) {
      return unavailableResult("provider", checkedAt, PROXYCHECK_PROVIDER_NAME);
    }
    return normalizeProxycheckResponse(response.json, ipAddress, checkedAt);
  } catch (_) {
    return unavailableResult("provider", checkedAt, PROXYCHECK_PROVIDER_NAME);
  }
}

function boundedInteger(input, minimum, maximum) {
  if (input === null || input === undefined || input === "") return null;
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function normalizeAbuseIpDbResponse(payload, ipAddress, checkedAt) {
  const data = payload && typeof payload === "object" ? payload.data : null;
  if (!data || typeof data !== "object" || text(data.ipAddress) !== text(ipAddress)) {
    return unavailableResult("provider", checkedAt, ABUSEIPDB_PROVIDER_NAME);
  }
  const score = boundedInteger(data.abuseConfidenceScore, 0, 100);
  const totalReports = boundedInteger(data.totalReports, 0, 1000000000);
  const distinctUsers = boundedInteger(data.numDistinctUsers, 0, 1000000000);
  if (score === null || totalReports === null || distinctUsers === null) {
    return unavailableResult("provider", checkedAt, ABUSEIPDB_PROVIDER_NAME);
  }
  const lastReportedAt = text(data.lastReportedAt);
  const checkedAtValue = dateValue(checkedAt);
  const lastReportedAtValue = dateValue(lastReportedAt);
  const maxReportAgeMs = ABUSEIPDB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const clockSkewAllowanceMs = 5 * 60 * 1000;
  const hasRecentReport = totalReports > 0
    && Number.isFinite(checkedAtValue)
    && Number.isFinite(lastReportedAtValue)
    && lastReportedAtValue >= checkedAtValue - maxReportAgeMs
    && lastReportedAtValue <= checkedAtValue + clockSkewAllowanceMs;
  const blockCandidate = score >= ABUSEIPDB_BLOCK_THRESHOLD && hasRecentReport;
  return {
    available: true,
    detected: data.isTor === true,
    suspected: blockCandidate,
    abusive: blockCandidate,
    verdict: data.isTor === true ? "vpn_or_proxy" : (blockCandidate ? "abusive_ip" : "clean"),
    is_vpn: false,
    is_proxy: false,
    is_tor: data.isTor === true,
    is_datacenter: false,
    is_abuser: blockCandidate,
    is_crawler: false,
    is_mobile: false,
    hosting_consensus: false,
    confidence: null,
    abuse_available: true,
    abuse_score: score,
    abuse_total_reports: totalReports,
    abuse_distinct_users: distinctUsers,
    abuse_last_reported_at: lastReportedAt,
    abuse_block_candidate: blockCandidate,
    provider: ABUSEIPDB_PROVIDER_NAME,
    source: "provider",
    checked_at: checkedAt || "",
  };
}

function sendAbuseIpDbRequest(ipAddress, send, options) {
  const checkedAt = text(options && options.checkedAt) || new Date().toISOString();
  const apiKey = validProviderApiKey(options && options.apiKey);
  if (typeof send !== "function" || !apiKey) {
    return unavailableResult("provider", checkedAt, ABUSEIPDB_PROVIDER_NAME);
  }
  const query = [
    `ipAddress=${encodeURIComponent(ipAddress)}`,
    `maxAgeInDays=${ABUSEIPDB_MAX_AGE_DAYS}`,
  ].join("&");
  try {
    const response = send({
      url: `${ABUSEIPDB_ENDPOINT}?${query}`,
      method: "GET",
      headers: {
        "accept": "application/json",
        "key": apiKey,
      },
      timeout: 2,
    });
    if (!response || Number(response.statusCode) !== 200) {
      return unavailableResult("provider", checkedAt, ABUSEIPDB_PROVIDER_NAME);
    }
    return normalizeAbuseIpDbResponse(response.json, ipAddress, checkedAt);
  } catch (_) {
    return unavailableResult("provider", checkedAt, ABUSEIPDB_PROVIDER_NAME);
  }
}

function combinedProviderName() {
  const names = [];
  Array.prototype.slice.call(arguments).forEach((result) => {
    const name = text(result && result.provider);
    if (name && !names.includes(name)) names.push(name);
  });
  return names.join(":") || PROVIDER_NAME;
}

function combineProviderResults(primary, secondary, checkedAt) {
  const provider = combinedProviderName(primary, secondary);
  const primaryAvailable = primary && primary.available === true;
  const secondaryAvailable = secondary && secondary.available === true;
  if (!primaryAvailable && !secondaryAvailable) {
    return unavailableResult("provider", checkedAt, provider);
  }
  const detected = Boolean((primaryAvailable && primary.detected) || (secondaryAvailable && secondary.detected));
  const isDatacenter = Boolean((primaryAvailable && primary.is_datacenter) || (secondaryAvailable && secondary.is_datacenter));
  const isAbuser = Boolean((primaryAvailable && primary.is_abuser) || (secondaryAvailable && secondary.is_abuser));
  const isCrawler = Boolean((primaryAvailable && primary.is_crawler) || (secondaryAvailable && secondary.is_crawler));
  const isMobile = Boolean((primaryAvailable && primary.is_mobile) || (secondaryAvailable && secondary.is_mobile));
  const abusive = Boolean((primaryAvailable && primary.abusive) || (secondaryAvailable && secondary.abusive));
  const hostingConsensus = Boolean(
    (primaryAvailable && primary.hosting_consensus)
      || (secondaryAvailable && secondary.hosting_consensus)
      || (primaryAvailable && secondaryAvailable && primary.is_datacenter && secondary.is_datacenter),
  ) && !isCrawler && !isMobile;
  const suspected = !detected && !isCrawler && Boolean(
    (primaryAvailable && primary.suspected)
      || (secondaryAvailable && secondary.suspected)
      || isDatacenter
      || isAbuser
      || abusive,
  );
  const secondaryConfidenceValue = secondary && secondary.confidence;
  const secondaryConfidence = secondaryConfidenceValue === null
    || secondaryConfidenceValue === undefined
    || secondaryConfidenceValue === ""
    ? NaN
    : Number(secondaryConfidenceValue);
  return {
    available: true,
    detected,
    suspected,
    verdict: detected ? "vpn_or_proxy" : (abusive ? "abusive_ip" : (suspected ? "network_suspected" : "clean")),
    is_vpn: Boolean((primaryAvailable && primary.is_vpn) || (secondaryAvailable && secondary.is_vpn)),
    is_proxy: Boolean((primaryAvailable && primary.is_proxy) || (secondaryAvailable && secondary.is_proxy)),
    is_tor: Boolean((primaryAvailable && primary.is_tor) || (secondaryAvailable && secondary.is_tor)),
    is_datacenter: isDatacenter,
    is_abuser: isAbuser,
    is_crawler: isCrawler,
    is_mobile: isMobile,
    abusive,
    hosting_consensus: hostingConsensus,
    confidence: Number.isFinite(secondaryConfidence) ? secondaryConfidence : null,
    abuse_available: Boolean((primaryAvailable && primary.abuse_available) || (secondaryAvailable && secondary.abuse_available)),
    abuse_score: primary && primary.abuse_score !== null && primary.abuse_score !== undefined
      ? Number(primary.abuse_score)
      : (secondary && secondary.abuse_score !== null && secondary.abuse_score !== undefined ? Number(secondary.abuse_score) : null),
    abuse_total_reports: Math.max(Number(primary && primary.abuse_total_reports) || 0, Number(secondary && secondary.abuse_total_reports) || 0),
    abuse_distinct_users: Math.max(Number(primary && primary.abuse_distinct_users) || 0, Number(secondary && secondary.abuse_distinct_users) || 0),
    abuse_last_reported_at: text(primary && primary.abuse_last_reported_at) || text(secondary && secondary.abuse_last_reported_at),
    abuse_block_candidate: Boolean((primaryAvailable && primary.abuse_block_candidate) || (secondaryAvailable && secondary.abuse_block_candidate)),
    provider,
    source: "provider",
    checked_at: text(secondary && secondary.checked_at) || text(primary && primary.checked_at) || checkedAt || "",
  };
}

function combineAbuseResult(network, abuse, checkedAt) {
  const networkResult = network || unavailableResult("provider", checkedAt);
  const abuseResult = abuse || unavailableResult("provider", checkedAt, ABUSEIPDB_PROVIDER_NAME);
  const provider = combinedProviderName(networkResult, abuseResult);
  const abuseAvailable = abuseResult.available === true;
  const abusive = abuseAvailable
    && abuseResult.abuse_block_candidate === true
    && networkResult.is_crawler !== true
    && networkResult.is_mobile !== true;
  const detected = networkResult.detected === true || (abuseAvailable && abuseResult.is_tor === true);
  const available = networkResult.available === true || abusive || detected;
  if (!available) {
    const unavailable = unavailableResult(networkResult.source || abuseResult.source, checkedAt, provider);
    unavailable.abuse_available = abuseAvailable;
    unavailable.abuse_score = abuseAvailable ? abuseResult.abuse_score : null;
    unavailable.abuse_total_reports = abuseAvailable ? abuseResult.abuse_total_reports : 0;
    unavailable.abuse_distinct_users = abuseAvailable ? abuseResult.abuse_distinct_users : 0;
    unavailable.abuse_last_reported_at = abuseAvailable ? abuseResult.abuse_last_reported_at : "";
    return unavailable;
  }
  const suspected = !detected && (networkResult.suspected === true || abusive);
  return {
    available: true,
    detected,
    suspected,
    abusive,
    verdict: detected ? "vpn_or_proxy" : (abusive ? "abusive_ip" : (suspected ? "network_suspected" : "clean")),
    is_vpn: networkResult.is_vpn === true,
    is_proxy: networkResult.is_proxy === true,
    is_tor: networkResult.is_tor === true || (abuseAvailable && abuseResult.is_tor === true),
    is_datacenter: networkResult.is_datacenter === true,
    is_abuser: networkResult.is_abuser === true || abusive,
    is_crawler: networkResult.is_crawler === true,
    is_mobile: networkResult.is_mobile === true,
    hosting_consensus: networkResult.hosting_consensus === true,
    confidence: networkResult.confidence === null || networkResult.confidence === undefined
      ? null
      : Number(networkResult.confidence),
    abuse_available: abuseAvailable,
    abuse_score: abuseAvailable ? abuseResult.abuse_score : null,
    abuse_total_reports: abuseAvailable ? abuseResult.abuse_total_reports : 0,
    abuse_distinct_users: abuseAvailable ? abuseResult.abuse_distinct_users : 0,
    abuse_last_reported_at: abuseAvailable ? abuseResult.abuse_last_reported_at : "",
    abuse_block_candidate: abusive,
    provider,
    source: "provider",
    checked_at: text(abuseResult.checked_at) || text(networkResult.checked_at) || checkedAt || "",
  };
}

function resultFromCache(record) {
  if (!record) return null;
  if (recordString(record, "classifier_version") !== CLASSIFIER_VERSION) return null;
  const verdict = recordString(record, "verdict");
  if (!["clean", "vpn_or_proxy", "network_suspected", "abusive_ip", "unavailable"].includes(verdict)) return null;
  return {
    available: verdict !== "unavailable",
    detected: verdict === "vpn_or_proxy",
    verdict,
    is_vpn: recordBoolean(record, "is_vpn"),
    is_proxy: recordBoolean(record, "is_proxy"),
    is_tor: recordBoolean(record, "is_tor"),
    is_datacenter: recordBoolean(record, "is_datacenter"),
    is_abuser: recordBoolean(record, "is_abuser"),
    is_crawler: recordBoolean(record, "is_crawler"),
    is_mobile: recordBoolean(record, "is_mobile"),
    suspected: verdict === "network_suspected" || verdict === "abusive_ip",
    abusive: verdict === "abusive_ip" || recordBoolean(record, "abuse_block_candidate"),
    hosting_consensus: recordBoolean(record, "hosting_consensus"),
    confidence: recordNumber(record, "provider_confidence"),
    abuse_available: recordBoolean(record, "abuse_available"),
    abuse_score: recordNumber(record, "abuse_score"),
    abuse_total_reports: Math.max(0, recordNumber(record, "abuse_total_reports") || 0),
    abuse_distinct_users: Math.max(0, recordNumber(record, "abuse_distinct_users") || 0),
    abuse_last_reported_at: recordString(record, "abuse_last_reported_at"),
    abuse_block_candidate: recordBoolean(record, "abuse_block_candidate"),
    provider: recordString(record, "provider") || PROVIDER_NAME,
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
  record.set("is_datacenter", result.is_datacenter === true);
  record.set("is_abuser", result.is_abuser === true);
  record.set("is_crawler", result.is_crawler === true);
  record.set("is_mobile", result.is_mobile === true);
  record.set("hosting_consensus", result.hosting_consensus === true);
  record.set("provider_confidence", result.confidence !== null
    && result.confidence !== undefined
    && result.confidence !== ""
    && Number.isFinite(Number(result.confidence))
    ? Number(result.confidence)
    : null);
  record.set("abuse_available", result.abuse_available === true);
  record.set("abuse_score", result.abuse_score !== null
    && result.abuse_score !== undefined
    && Number.isFinite(Number(result.abuse_score))
    ? Number(result.abuse_score)
    : null);
  record.set("abuse_total_reports", Math.max(0, Number(result.abuse_total_reports) || 0));
  record.set("abuse_distinct_users", Math.max(0, Number(result.abuse_distinct_users) || 0));
  record.set("abuse_last_reported_at", text(result.abuse_last_reported_at));
  record.set("abuse_block_candidate", result.abuse_block_candidate === true);
  record.set("classifier_version", CLASSIFIER_VERSION);
  record.set("provider", result.provider || PROVIDER_NAME);
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

function utcDay(now) {
  return now.toISOString().slice(0, 10);
}

function reserveNamedProviderRequest(app, now, provider, limit) {
  const collection = findCollection(app, USAGE_COLLECTION);
  if (!collection) return { allowed: false, tracked: false, limit, used: 0 };
  const day = utcDay(now);
  let record = findFirst(
    app,
    USAGE_COLLECTION,
    "provider = {:provider} && utc_day = {:utcDay}",
    { provider, utcDay: day },
  );
  let used = record ? Number(value(record, "requests") || 0) : 0;
  if (!Number.isFinite(used) || used < 0) used = 0;
  if (used >= limit) return { allowed: false, tracked: true, limit, used };
  if (!record) record = new Record(collection, {});
  record.set("provider", provider);
  record.set("utc_day", day);
  record.set("requests", used + 1);
  try {
    app.save(record);
    return { allowed: true, tracked: true, limit, used: used + 1 };
  } catch (_) {
    const concurrent = findFirst(
      app,
      USAGE_COLLECTION,
      "provider = {:provider} && utc_day = {:utcDay}",
      { provider, utcDay: day },
    );
    if (!concurrent) return { allowed: false, tracked: true, limit, used };
    const concurrentUsed = Number(value(concurrent, "requests") || 0);
    if (!Number.isFinite(concurrentUsed) || concurrentUsed >= limit) {
      return { allowed: false, tracked: true, limit, used: concurrentUsed };
    }
    concurrent.set("requests", concurrentUsed + 1);
    try {
      app.save(concurrent);
      return { allowed: true, tracked: true, limit, used: concurrentUsed + 1 };
    } catch (_) {
      return { allowed: false, tracked: true, limit, used: concurrentUsed };
    }
  }
}

function reserveProviderRequest(app, now, authenticated) {
  const limit = authenticated ? AUTHENTICATED_DAILY_BUDGET : ANONYMOUS_DAILY_BUDGET;
  return reserveNamedProviderRequest(app, now, PROVIDER_NAME, limit);
}

function reserveProxycheckRequest(app, now) {
  return reserveNamedProviderRequest(app, now, PROXYCHECK_PROVIDER_NAME, PROXYCHECK_DAILY_BUDGET);
}

function reserveAbuseIpDbRequest(app, now) {
  return reserveNamedProviderRequest(app, now, ABUSEIPDB_PROVIDER_NAME, ABUSEIPDB_DAILY_BUDGET);
}

function torResult(app, ipAddress, now, lookupTor) {
  let local = null;
  try {
    local = typeof lookupTor === "function" ? lookupTor(app, ipAddress, now) : torFeed.lookup(app, ipAddress, now);
  } catch (_) {
    local = null;
  }
  if (!local || local.detected !== true) return null;
  return {
    available: true,
    detected: true,
    suspected: false,
    verdict: "vpn_or_proxy",
    is_vpn: false,
    is_proxy: false,
    is_tor: true,
    is_datacenter: false,
    is_abuser: false,
    is_crawler: false,
    is_mobile: false,
    abusive: false,
    hosting_consensus: false,
    confidence: null,
    abuse_available: false,
    abuse_score: null,
    abuse_total_reports: 0,
    abuse_distinct_users: 0,
    abuse_last_reported_at: "",
    abuse_block_candidate: false,
    provider: text(local.provider) || torFeed._test.constants.providerName,
    source: "local_tor_feed",
    checked_at: text(local.checked_at) || now.toISOString(),
  };
}

function lookup(app, storeId, ipAddress, ipHmac, options) {
  const now = options && options.now instanceof Date ? options.now : new Date();
  if (!storeId || !ipAddress || !VALID_HMAC.test(String(ipHmac || ""))) {
    return unavailableResult("identity", now.toISOString());
  }
  const secondaryApiKey = validProviderApiKey(options && options.proxycheckApiKey) || proxycheckApiKey();
  const abuseApiKey = validProviderApiKey(options && options.abuseIpDbApiKey) || abuseIpDbApiKey();
  const cached = activeCachedResult(app, storeId, ipHmac, now);
  const cachedProviders = text(cached && cached.provider).split(":");
  const enrichProxycheck = Boolean(
    cached
      && secondaryApiKey
      && !cached.detected
      && !cachedProviders.includes(PROXYCHECK_PROVIDER_NAME),
  );
  const enrichAbuseIpDb = Boolean(
    cached
      && abuseApiKey
      && !cached.detected
      && !cachedProviders.includes(ABUSEIPDB_PROVIDER_NAME),
  );
  if (cached && !enrichProxycheck && !enrichAbuseIpDb) return cached;

  let networkResult = cached || null;
  if (!networkResult) {
    const localTor = torResult(app, ipAddress, now, options && options.lookupTor);
    if (localTor) return saveCachedResult(app, storeId, ipHmac, localTor, now);
  }
  const apiKey = validProviderApiKey(options && options.apiKey) || providerApiKey();
  const send = options && typeof options.send === "function"
    ? options.send
    : (typeof $http !== "undefined" && $http && typeof $http.send === "function" ? $http.send.bind($http) : null);
  if (!networkResult) {
    const reservation = options && options.skipBudget === true
      ? { allowed: true }
      : reserveProviderRequest(app, now, Boolean(apiKey));
    networkResult = reservation.allowed
      ? sendProviderRequest(ipAddress, send, { apiKey })
      : unavailableResult("budget", now.toISOString());
  }
  if (networkResult.detected) {
    return saveCachedResult(app, storeId, ipHmac, networkResult, now);
  }

  const networkProviders = text(networkResult.provider).split(":");
  if (secondaryApiKey && !networkProviders.includes(PROXYCHECK_PROVIDER_NAME)) {
    const secondaryReservation = options && options.skipBudget === true
      ? { allowed: true }
      : reserveProxycheckRequest(app, now);
    const secondaryResult = secondaryReservation.allowed
      ? sendProxycheckRequest(ipAddress, send, { apiKey: secondaryApiKey })
      : unavailableResult("budget", now.toISOString(), PROXYCHECK_PROVIDER_NAME);
    networkResult = combineProviderResults(networkResult, secondaryResult, now.toISOString());
  }
  if (networkResult.detected || networkResult.is_crawler === true || networkResult.is_mobile === true || !abuseApiKey) {
    return saveCachedResult(app, storeId, ipHmac, networkResult, now);
  }

  const combinedProviders = text(networkResult.provider).split(":");
  if (combinedProviders.includes(ABUSEIPDB_PROVIDER_NAME)) {
    return saveCachedResult(app, storeId, ipHmac, networkResult, now);
  }
  const abuseReservation = options && options.skipBudget === true
    ? { allowed: true }
    : reserveAbuseIpDbRequest(app, now);
  const abuseResult = abuseReservation.allowed
    ? sendAbuseIpDbRequest(ipAddress, send, { apiKey: abuseApiKey, checkedAt: now.toISOString() })
    : unavailableResult("budget", now.toISOString(), ABUSEIPDB_PROVIDER_NAME);
  const combined = combineAbuseResult(networkResult, abuseResult, now.toISOString());
  return saveCachedResult(app, storeId, ipHmac, combined, now);
}

function cleanupExpired(app, nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date();
  let cacheDeleted = 0;
  let usageDeleted = 0;
  if (findCollection(app, CACHE_COLLECTION)) {
    try {
      const rows = app.findRecordsByFilter(
        CACHE_COLLECTION,
        "expires_at < {:now}",
        "expires_at",
        500,
        0,
        { now: now.toISOString() },
      ) || [];
      rows.forEach((record) => {
        try { app.delete(record); cacheDeleted += 1; } catch (_) {}
      });
    } catch (_) {}
  }
  if (findCollection(app, USAGE_COLLECTION)) {
    const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const rows = app.findRecordsByFilter(
        USAGE_COLLECTION,
        "utc_day < {:cutoff}",
        "utc_day",
        100,
        0,
        { cutoff },
      ) || [];
      rows.forEach((record) => {
        try { app.delete(record); usageDeleted += 1; } catch (_) {}
      });
    } catch (_) {}
  }
  return { cache_deleted: cacheDeleted, usage_deleted: usageDeleted };
}

function handleCacheCleanup() {
  return cleanupExpired($app, new Date());
}

function eventKey(storeId, policy, eventType, ipHmac, deviceHmac, checkedAt) {
  const material = [storeId, policy, eventType, ipHmac, text(deviceHmac), checkedAt].join("|");
  try { return `ip_reputation:${String($security.sha256(material) || "").slice(0, 128)}`; } catch (_) { return ""; }
}

function protectedIpCapture(signals, ipCapture) {
  const capture = ipCapture && typeof ipCapture === "object" ? ipCapture : {};
  const masked = text(capture.ip_masked);
  const encrypted = text(capture.ip_encrypted);
  return {
    ip_hmac: text(signals && signals.ip),
    ip_masked: masked,
    ip_encrypted: encrypted,
    ip_family: text(capture.ip_family) || text(signals && signals.ipFamily) || "unknown",
    capture_status: encrypted ? "complete" : (masked || text(signals && signals.ip) ? "partial" : "unavailable"),
  };
}

function strictBlockReason(result) {
  if (!result || result.available !== true || result.is_crawler === true) return "";
  if (result.detected === true) return "vpn_or_proxy_detected";
  if (result.abusive === true && result.abuse_block_candidate === true) return "abusive_ip_detected";
  if (result.hosting_consensus === true && result.is_mobile !== true) return "hosting_datacenter_detected";
  return "";
}

function reputationEventType(result, blocked) {
  if (!result || result.available !== true) return "vpn_check_unavailable";
  if (result.detected === true) return blocked ? "vpn_blocked" : "vpn_detected";
  if (result.abusive === true) return blocked ? "abusive_ip_blocked" : "abusive_ip_detected";
  if (blocked && result.hosting_consensus === true) return "hosting_blocked";
  return "network_suspected";
}

function recordEvent(app, store, settings, signals, result, policy, blocked, now, ipCapture) {
  const collection = findCollection(app, EVENTS_COLLECTION);
  const storeId = recordString(store, "id");
  if (!collection || !storeId || !VALID_HMAC.test(String(signals && signals.ip || ""))) return null;
  const capture = protectedIpCapture(signals, ipCapture);
  const eventType = reputationEventType(result, blocked);
  const key = eventKey(
    storeId,
    policy,
    eventType,
    signals.ip,
    signals.device,
    result.checked_at || now.toISOString(),
  );
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
  event.set("ip_hmac", capture.ip_hmac);
  event.set("ip_masked", capture.ip_masked);
  event.set("ip_encrypted", capture.ip_encrypted);
  event.set("ip_family", capture.ip_family);
  event.set("browser_token_hmac", signals.device || "");
  event.set("capture_status", capture.capture_status);
  event.set("crypto_version", "v1");
  event.set("metadata_json", {
    policy,
    provider: result.provider || PROVIDER_NAME,
    is_vpn: result.is_vpn === true,
    is_proxy: result.is_proxy === true,
    is_tor: result.is_tor === true,
    is_datacenter: result.is_datacenter === true,
    is_abuser: result.is_abuser === true,
    is_crawler: result.is_crawler === true,
    is_mobile: result.is_mobile === true,
    hosting_consensus: result.hosting_consensus === true,
    abuse_available: result.abuse_available === true,
    abuse_score: result.abuse_score !== null
      && result.abuse_score !== undefined
      && Number.isFinite(Number(result.abuse_score))
      ? Number(result.abuse_score)
      : null,
    abuse_total_reports: Math.max(0, Number(result.abuse_total_reports) || 0),
    abuse_distinct_users: Math.max(0, Number(result.abuse_distinct_users) || 0),
    abuse_last_reported_at: text(result.abuse_last_reported_at),
    block_reason: blocked ? strictBlockReason(result) : "",
    provider_confidence: result.confidence !== null
      && result.confidence !== undefined
      && result.confidence !== ""
      && Number.isFinite(Number(result.confidence))
      ? Number(result.confidence)
      : null,
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
    {
      now,
      send: options && options.send,
      apiKey: options && options.apiKey,
      proxycheckApiKey: options && options.proxycheckApiKey,
      abuseIpDbApiKey: options && options.abuseIpDbApiKey,
      lookupTor: options && options.lookupTor,
      skipBudget: options && options.skipBudget,
    },
  );
  const blockReason = strictBlockReason(result);
  const blocked = Boolean(blockReason)
    && policy === "block"
    && recordString(settings, "mode") === "protection";
  if (result.detected || result.suspected || !result.available) {
    try {
      recordEvent(app, store, settings, signals || {}, result, policy, blocked, now, options && options.ipCapture);
    } catch (_) {}
  }
  return {
    enabled: true,
    blocked,
    reason: blocked
      ? blockReason
      : (result.available
        ? (result.detected ? "detected" : (result.abusive ? "abusive_ip_detected" : (result.suspected ? "network_suspected" : "clean")))
        : "unavailable"),
    policy,
    result,
  };
}

module.exports = {
  evaluate,
  handleCacheCleanup,
  _test: {
    normalizePolicy,
    normalizeProviderResponse,
    sendProviderRequest,
    normalizeProxycheckResponse,
    sendProxycheckRequest,
    normalizeAbuseIpDbResponse,
    sendAbuseIpDbRequest,
    combineProviderResults,
    combineAbuseResult,
    validProviderApiKey,
    resultFromCache,
    reserveProviderRequest,
    reserveProxycheckRequest,
    reserveAbuseIpDbRequest,
    cleanupExpired,
    torResult,
    lookup,
    eventKey,
    protectedIpCapture,
    strictBlockReason,
    reputationEventType,
    constants: {
      providerEndpoint: PROVIDER_ENDPOINT,
      providerKeyEnv: PROVIDER_KEY_ENV,
      authenticatedDailyBudget: AUTHENTICATED_DAILY_BUDGET,
      anonymousDailyBudget: ANONYMOUS_DAILY_BUDGET,
      successTtlMs: SUCCESS_TTL_MS,
      unavailableTtlMs: UNAVAILABLE_TTL_MS,
      proxycheckEndpoint: PROXYCHECK_ENDPOINT,
      proxycheckProviderName: PROXYCHECK_PROVIDER_NAME,
      proxycheckKeyEnv: PROXYCHECK_KEY_ENV,
      proxycheckDailyBudget: PROXYCHECK_DAILY_BUDGET,
      proxycheckMinConfidence: PROXYCHECK_MIN_CONFIDENCE,
      proxycheckApiVersion: PROXYCHECK_API_VERSION,
      abuseIpDbEndpoint: ABUSEIPDB_ENDPOINT,
      abuseIpDbProviderName: ABUSEIPDB_PROVIDER_NAME,
      abuseIpDbKeyEnv: ABUSEIPDB_KEY_ENV,
      abuseIpDbDailyBudget: ABUSEIPDB_DAILY_BUDGET,
      abuseIpDbMaxAgeDays: ABUSEIPDB_MAX_AGE_DAYS,
      abuseIpDbBlockThreshold: ABUSEIPDB_BLOCK_THRESHOLD,
      classifierVersion: CLASSIFIER_VERSION,
    },
  },
};
