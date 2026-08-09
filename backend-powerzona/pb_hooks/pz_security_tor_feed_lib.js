/// <reference path="../pb_data/types.d.ts" />

const TOR_NODES_COLLECTION = "security_tor_exit_nodes";
const TOR_STATE_COLLECTION = "security_tor_feed_state";
const TOR_STATE_KEY = "primary";
const TOR_SOURCE_URL = "https://onionoo.torproject.org/details?flag=Exit&running=true&fields=exit_addresses";
const TOR_PROVIDER_NAME = "tor_project_onionoo";
const MIN_EXPECTED_EXIT_ADDRESSES = 100;
const MAX_EXPECTED_EXIT_ADDRESSES = 50000;
const MAX_VALID_AGE_MS = 72 * 60 * 60 * 1000;

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
  return String(input === null || input === undefined ? "" : input).trim();
}

function recordString(record, key) {
  return text(value(record, key));
}

function findCollection(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function invalidIp() {
  return { valid: false, canonical: "", family: "unknown" };
}

function normalizeIpv4(input) {
  const parts = text(input).split(".");
  if (parts.length !== 4) return invalidIp();
  const octets = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return invalidIp();
    const current = Number(part);
    if (!Number.isInteger(current) || current < 0 || current > 255) return invalidIp();
    octets.push(String(current));
  }
  return { valid: true, canonical: octets.join("."), family: "ipv4" };
}

function normalizeIpv6(input) {
  const lower = text(input).toLowerCase();
  if (!lower || lower.includes(".") || !/^[0-9a-f:]+$/.test(lower)) return invalidIp();
  const doubleColon = lower.split("::");
  if (doubleColon.length > 2) return invalidIp();

  const parseSide = (side) => {
    if (!side) return [];
    const groups = side.split(":");
    if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
    return groups.map((group) => (`0000${group}`).slice(-4));
  };

  let groups = null;
  if (doubleColon.length === 1) {
    groups = parseSide(lower);
    if (!groups || groups.length !== 8) return invalidIp();
  } else {
    const left = parseSide(doubleColon[0]);
    const right = parseSide(doubleColon[1]);
    if (!left || !right) return invalidIp();
    const missing = 8 - left.length - right.length;
    if (missing < 1) return invalidIp();
    groups = left.concat(Array(missing).fill("0000"), right);
  }
  return { valid: true, canonical: groups.join(":"), family: "ipv6" };
}

function normalizeIpAddress(input) {
  const candidate = text(input).replace(/^\[|\]$/g, "");
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return normalizeIpv4(candidate);
  if (candidate.includes(":")) return normalizeIpv6(candidate);
  return invalidIp();
}

function parseExitAddresses(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.relays)) return [];
  const deduped = {};
  payload.relays.forEach((relay) => {
    const addresses = relay && Array.isArray(relay.exit_addresses) ? relay.exit_addresses : [];
    addresses.forEach((address) => {
      const normalized = normalizeIpAddress(address);
      if (normalized.valid) deduped[normalized.canonical] = normalized.family;
    });
  });
  return Object.keys(deduped).sort().map((ipAddress) => ({
    ip_address: ipAddress,
    ip_family: deduped[ipAddress],
  }));
}

function stateRecord(app) {
  if (!findCollection(app, TOR_STATE_COLLECTION)) return null;
  return findFirst(app, TOR_STATE_COLLECTION, "state_key = {:stateKey}", { stateKey: TOR_STATE_KEY });
}

function dateValue(input) {
  const parsed = Date.parse(text(input));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function activeFeedState(app, now) {
  const state = stateRecord(app);
  if (!state) return null;
  const batchId = recordString(state, "active_batch_id");
  const refreshedAt = recordString(state, "refreshed_at");
  const refreshedMs = dateValue(refreshedAt);
  if (!batchId || !Number.isFinite(refreshedMs) || now.getTime() - refreshedMs > MAX_VALID_AGE_MS) return null;
  return { batch_id: batchId, refreshed_at: refreshedAt };
}

function lookup(app, ipAddress, nowInput) {
  const now = nowInput instanceof Date ? nowInput : new Date();
  const normalized = normalizeIpAddress(ipAddress);
  if (!normalized.valid || !findCollection(app, TOR_NODES_COLLECTION)) return { detected: false };
  const state = activeFeedState(app, now);
  if (!state) return { detected: false };
  const found = findFirst(
    app,
    TOR_NODES_COLLECTION,
    "batch_id = {:batchId} && ip_address = {:ipAddress}",
    { batchId: state.batch_id, ipAddress: normalized.canonical },
  );
  if (!found) return { detected: false };
  return {
    detected: true,
    provider: TOR_PROVIDER_NAME,
    checked_at: state.refreshed_at,
  };
}

function safeBatchId(now, count) {
  const material = `${now.toISOString()}|${count}`;
  try { return text($security.sha256(material)).slice(0, 40); } catch (_) {}
  return `tor-${now.getTime()}-${count}`;
}

function updateStateFailure(app, errorCode) {
  const collection = findCollection(app, TOR_STATE_COLLECTION);
  if (!collection) return;
  let state = stateRecord(app);
  if (!state) state = new Record(collection, {});
  state.set("state_key", TOR_STATE_KEY);
  state.set("status", recordString(state, "active_batch_id") ? "stale" : "unavailable");
  state.set("error_code", text(errorCode).slice(0, 80));
  try { app.save(state); } catch (_) {}
}

function cleanupInactiveBatches(app, activeBatchId) {
  try {
    const records = app.findRecordsByFilter(
      TOR_NODES_COLLECTION,
      "batch_id != {:batchId}",
      "",
      0,
      0,
      { batchId: activeBatchId },
    ) || [];
    records.forEach((record) => {
      try { app.delete(record); } catch (_) {}
    });
  } catch (_) {}
}

function refresh(app, options) {
  const nodesCollection = findCollection(app, TOR_NODES_COLLECTION);
  const stateCollection = findCollection(app, TOR_STATE_COLLECTION);
  if (!nodesCollection || !stateCollection) return { ok: false, error: "collections_unavailable" };
  const now = options && options.now instanceof Date ? options.now : new Date();
  const send = options && typeof options.send === "function"
    ? options.send
    : (typeof $http !== "undefined" && $http && typeof $http.send === "function" ? $http.send.bind($http) : null);
  if (!send) {
    updateStateFailure(app, "http_unavailable");
    return { ok: false, error: "http_unavailable" };
  }

  let response = null;
  try {
    response = send({
      url: TOR_SOURCE_URL,
      method: "GET",
      headers: { "accept": "application/json" },
      timeout: 20,
    });
  } catch (_) {
    updateStateFailure(app, "request_failed");
    return { ok: false, error: "request_failed" };
  }
  if (!response || Number(response.statusCode) !== 200) {
    updateStateFailure(app, "invalid_status");
    return { ok: false, error: "invalid_status" };
  }

  const entries = parseExitAddresses(response.json);
  if (entries.length < MIN_EXPECTED_EXIT_ADDRESSES || entries.length > MAX_EXPECTED_EXIT_ADDRESSES) {
    updateStateFailure(app, "invalid_entry_count");
    return { ok: false, error: "invalid_entry_count", count: entries.length };
  }

  const batchId = safeBatchId(now, entries.length);
  try {
    entries.forEach((entry) => {
      const record = new Record(nodesCollection, {});
      record.set("batch_id", batchId);
      record.set("ip_address", entry.ip_address);
      record.set("ip_family", entry.ip_family);
      record.set("fetched_at", now.toISOString());
      app.save(record);
    });
  } catch (_) {
    updateStateFailure(app, "persist_failed");
    return { ok: false, error: "persist_failed" };
  }

  let state = stateRecord(app);
  if (!state) state = new Record(stateCollection, {});
  state.set("state_key", TOR_STATE_KEY);
  state.set("active_batch_id", batchId);
  state.set("refreshed_at", now.toISOString());
  const published = text(response.json && response.json.relays_published);
  if (Number.isFinite(dateValue(published))) state.set("source_updated_at", new Date(dateValue(published)).toISOString());
  state.set("entry_count", entries.length);
  state.set("status", "valid");
  state.set("error_code", "");
  try {
    app.save(state);
  } catch (_) {
    updateStateFailure(app, "state_persist_failed");
    return { ok: false, error: "state_persist_failed" };
  }

  cleanupInactiveBatches(app, batchId);
  return { ok: true, count: entries.length, batch_id: batchId };
}

function handleTorExitRefresh() {
  return refresh($app, {});
}

module.exports = {
  handleTorExitRefresh,
  lookup,
  refresh,
  _test: {
    normalizeIpAddress,
    parseExitAddresses,
    activeFeedState,
    constants: {
      sourceUrl: TOR_SOURCE_URL,
      providerName: TOR_PROVIDER_NAME,
      maxValidAgeMs: MAX_VALID_AGE_MS,
      minExpectedExitAddresses: MIN_EXPECTED_EXIT_ADDRESSES,
    },
  },
};
