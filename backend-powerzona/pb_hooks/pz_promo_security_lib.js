/// <reference path="../pb_data/types.d.ts" />

"use strict";

const PROMO_API_PREFIX = "/api/pz/promo/";
const RATE_WINDOW_MS = 60_000;
const RATE_BUCKET_MAX = 8_192;
const PLATFORM_ORIGINS = Object.freeze([
  "https://tusenda84.com",
  "https://www.tusenda84.com",
  "https://mob76fcvxkxyb8tq0nwys18o.91.99.99.83.sslip.io",
]);
const RATE_POLICIES = Object.freeze({
  public_collect: Object.freeze({ id: "public_collect", limit: 360, windowMs: RATE_WINDOW_MS }),
  public_media: Object.freeze({ id: "public_media", limit: 2_400, windowMs: RATE_WINDOW_MS }),
  public_read: Object.freeze({ id: "public_read", limit: 1_200, windowMs: RATE_WINDOW_MS }),
  private_read: Object.freeze({ id: "private_read", limit: 600, windowMs: RATE_WINDOW_MS }),
  private_write: Object.freeze({ id: "private_write", limit: 180, windowMs: RATE_WINDOW_MS }),
  critical_write: Object.freeze({ id: "critical_write", limit: 60, windowMs: RATE_WINDOW_MS }),
});

const rateBuckets = new Map();
let maintenanceCounter = 0;

class PromoSecurityError extends Error {
  constructor(code, status, retryAfter) {
    super(code);
    this.name = "PromoSecurityError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter || 0;
  }
}

function fail(code, status, retryAfter) {
  throw new PromoSecurityError(code, status, retryAfter);
}

function text(value, max) {
  const result = String(value === undefined || value === null ? "" : value);
  return Number.isInteger(max) ? result.slice(0, max) : result;
}

function headerValues(e, info, name) {
  const direct = e && e.request && e.request.header;
  if (direct && typeof direct.values === "function") {
    try {
      const values = Array.from(direct.values(name) || []).map((value) => text(value, 1024));
      if (values.length) return values;
    } catch (_) {}
  }
  if (direct && typeof direct.get === "function") {
    try {
      const value = direct.get(name);
      if (value !== undefined && value !== null && String(value) !== "") return [text(value, 1024)];
    } catch (_) {}
  }
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      const value = headers.get(name) || headers.get(normalized);
      if (value !== undefined && value !== null && String(value) !== "") return [text(value, 1024)];
    }
  } catch (_) {}
  const keys = Object.keys(headers).filter((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return keys.map((key) => text(headers[key], 1024));
}

function singleHeader(e, info, name, required, errorCode, errorStatus) {
  const code = errorCode || "invalid_promo_host_header";
  const status = Number.isInteger(errorStatus) ? errorStatus : 421;
  const values = headerValues(e, info, name);
  if (!values.length) {
    if (required) fail(code, status);
    return "";
  }
  if (values.length !== 1) fail(code, status);
  const value = values[0];
  if (!value || value !== value.trim() || value.includes(",") || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(code, status);
  }
  return value;
}

function ipv4(value) {
  const parts = String(value || "").split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9][0-9]{0,2})$/.test(part)
    && Number(part) >= 0 && Number(part) <= 255);
}

function validIpv6(value) {
  if (!String(value || "").includes(":") || !/^[0-9a-f:]+$/i.test(value)
    || (String(value).match(/::/g) || []).length > 1 || String(value).includes(":::")) return false;
  const sides = String(value).split("::");
  const groups = sides.reduce((total, side) => total + (side ? side.split(":").length : 0), 0);
  const validGroups = sides.every((side) => !side || side.split(":").every((group) => /^[0-9a-f]{1,4}$/i.test(group)));
  return validGroups && (sides.length === 1 ? groups === 8 : groups < 8);
}

function parseRequestHost(value) {
  const raw = text(value, 512);
  if (!raw || raw !== raw.trim() || /[\u0000-\u0020\u007f,\/@\\?#%]/.test(raw) || raw.includes("://")) {
    fail("invalid_promo_host_header", 421);
  }
  if (raw.startsWith("[")) {
    const match = raw.match(/^\[([0-9a-fA-F:]+)\](?::([0-9]{1,5}))?$/);
    if (!match || !validIpv6(match[1])) fail("invalid_promo_host_header", 421);
    const port = match[2] ? Number(match[2]) : null;
    if (port !== null && (port < 1 || port > 65535)) fail("invalid_promo_host_header", 421);
    return Object.freeze({ hostname: match[1].toLowerCase(), port, authority: raw.toLowerCase() });
  }
  const parts = raw.split(":");
  if (parts.length > 2) fail("invalid_promo_host_header", 421);
  const hostname = parts[0].toLowerCase();
  const port = parts.length === 2 ? Number(parts[1]) : null;
  if (!hostname || (port !== null && (!/^[0-9]{1,5}$/.test(parts[1]) || port < 1 || port > 65535))) {
    fail("invalid_promo_host_header", 421);
  }
  const local = hostname === "localhost" || ipv4(hostname);
  if (!local) {
    if (hostname.length > 253 || hostname.includes("..")) fail("invalid_promo_host_header", 421);
    const labels = hostname.split(".");
    if (!labels.every((label) => label.length >= 1 && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) fail("invalid_promo_host_header", 421);
  }
  return Object.freeze({ hostname, port, authority: `${hostname}${port === null ? "" : `:${port}`}` });
}

function parseOrigin(value) {
  const raw = text(value, 512);
  if (!raw || raw !== raw.trim() || raw === "null" || /[\u0000-\u0020\u007f,]/.test(raw)) {
    fail("promo_origin_forbidden", 403);
  }
  const match = raw.match(/^(https?):\/\/([^/]+)$/i);
  if (!match) fail("promo_origin_forbidden", 403);
  const host = parseRequestHost(match[2]);
  const protocol = match[1].toLowerCase();
  const canonical = `${protocol}://${host.authority}`;
  if (canonical !== raw.toLowerCase()) fail("promo_origin_forbidden", 403);
  return Object.freeze({ protocol, ...host, origin: canonical });
}

function localHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function customHostPath(path) {
  return path === "/api/pz/promo/public/v1/analytics/host/events"
    || path === "/api/pz/promo/public/v1/shell/host"
    || path.startsWith("/api/pz/promo/public/v1/shell/host/locales/")
    || path === "/api/pz/promo/public/v1/seo/host/sitemap"
    || path === "/api/pz/promo/public/v1/seo/host/robots";
}

function platformOrigins() {
  return Object.freeze(PLATFORM_ORIGINS.slice().sort());
}

function validateOrigin(input) {
  const method = String(input && input.method || "GET").toUpperCase();
  const path = String(input && input.path || "");
  const rawOrigin = String(input && input.origin || "");
  const fetchSite = String(input && input.fetchSite || "").toLowerCase();
  if (fetchSite === "cross-site" && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    fail("promo_origin_forbidden", 403);
  }
  if (!rawOrigin) return Object.freeze({ present: false, origin: "" });
  const origin = parseOrigin(rawOrigin);
  const requestHost = parseRequestHost(input.host);
  if (customHostPath(path)) {
    const localHttp = origin.protocol === "http" && localHostname(origin.hostname);
    const defaultPort = origin.protocol === "https" ? 443 : 80;
    if ((origin.protocol !== "https" && !localHttp) || origin.hostname !== requestHost.hostname
      || (origin.port === null ? defaultPort : origin.port)
        !== (requestHost.port === null ? defaultPort : requestHost.port)) fail("promo_origin_forbidden", 403);
  } else {
    const localSameOrigin = localHostname(origin.hostname) && origin.hostname === requestHost.hostname
      && origin.port === requestHost.port && ["http", "https"].includes(origin.protocol);
    if (!localSameOrigin && !platformOrigins().includes(origin.origin)) {
      fail("promo_origin_forbidden", 403);
    }
  }
  return Object.freeze({ present: true, origin: origin.origin });
}

function ratePolicy(path, method) {
  if (!String(path || "").startsWith(PROMO_API_PREFIX)) return null;
  const upperMethod = String(method || "GET").toUpperCase();
  if (path.startsWith("/api/pz/promo/public/v1/analytics/")) return RATE_POLICIES.public_collect;
  if (path.startsWith("/api/pz/promo/public/v1/") && path.includes("/media/")) {
    return RATE_POLICIES.public_media;
  }
  if (path.startsWith("/api/pz/promo/public/v1/")) return RATE_POLICIES.public_read;
  if (upperMethod === "GET" || /\/(?:list|read|summary|context|overview|catalog|preview)$/.test(path)) {
    return RATE_POLICIES.private_read;
  }
  if (path.includes("/cloudflare/") || path.includes("/publication/")
    || path.includes("/domains/") || path.includes("/lifecycle/")) return RATE_POLICIES.critical_write;
  return RATE_POLICIES.private_write;
}

function pruneRateBuckets(nowMs) {
  maintenanceCounter += 1;
  if (maintenanceCounter % 128 !== 0 && rateBuckets.size < RATE_BUCKET_MAX) return;
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= nowMs) rateBuckets.delete(key);
  if (rateBuckets.size <= RATE_BUCKET_MAX) return;
  let excess = rateBuckets.size - RATE_BUCKET_MAX;
  for (const key of rateBuckets.keys()) {
    rateBuckets.delete(key);
    excess -= 1;
    if (excess <= 0) break;
  }
}

function consumeRateLimit(policy, identity, nowValue, overrideLimit) {
  if (!policy) return Object.freeze({ allowed: true, retryAfter: 0 });
  const nowMs = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const limit = Number.isInteger(overrideLimit) && overrideLimit > 0 ? overrideLimit : policy.limit;
  const key = `${policy.id}:${text(identity, 1024)}`;
  pruneRateBuckets(nowMs);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= nowMs) {
    rateBuckets.set(key, { count: 1, resetAt: nowMs + policy.windowMs });
    return Object.freeze({ allowed: true, retryAfter: 0 });
  }
  if (current.count >= limit) {
    return Object.freeze({
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1000)),
    });
  }
  current.count += 1;
  return Object.freeze({ allowed: true, retryAfter: 0 });
}

function resetRateLimits() {
  rateBuckets.clear();
  maintenanceCounter = 0;
}

function routeIdentity(path) {
  return String(path || "").slice(0, 512).replace(/[A-F0-9]{64}/gi, ":digest");
}

function setSecurityHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Content-Security-Policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function remoteIdentity(e) {
  let value = "unknown";
  try { value = text(e.remoteIP(), 128) || "unknown"; } catch (_) {}
  return value;
}

function requestPath(e) {
  return String(e && e.request && e.request.url && e.request.url.path || "");
}

function enforceRequest(e) {
  const path = requestPath(e);
  if (!path.startsWith(PROMO_API_PREFIX)) return e.next();
  setSecurityHeaders(e);
  let info = {};
  try { info = e.requestInfo() || {}; } catch (_) {}
  try {
    const method = String(info.method || e.request && e.request.method || "GET").toUpperCase();
    const nativeHost = text(e && e.request && e.request.host, 512);
    const suppliedHosts = headerValues(e, info, "Host");
    const suppliedHost = suppliedHosts.length ? singleHeader(e, info, "Host", true) : "";
    const hostHeader = nativeHost || suppliedHost;
    if (!hostHeader) fail("invalid_promo_host_header", 421);
    const requestHost = parseRequestHost(hostHeader);
    if (nativeHost && suppliedHost && parseRequestHost(suppliedHost).authority !== requestHost.authority) {
      fail("invalid_promo_host_header", 421);
    }
    const forwardedHosts = headerValues(e, info, "X-Forwarded-Host");
    if (forwardedHosts.length > 1 || forwardedHosts.some((value) => !value || value.includes(","))) {
      fail("invalid_promo_host_header", 421);
    }
    const origin = singleHeader(e, info, "Origin", false, "promo_origin_forbidden", 403);
    validateOrigin({
      method,
      path,
      host: requestHost.authority,
      origin,
      fetchSite: singleHeader(e, info, "Sec-Fetch-Site", false, "promo_origin_forbidden", 403),
    });
    if (path.startsWith("/api/pz/promo/public/v1/analytics/") && method === "POST") {
      const contentType = singleHeader(e, info, "Content-Type", true, "invalid_payload", 400)
        .toLowerCase().split(";", 1)[0].trim();
      if (contentType !== "application/json") fail("invalid_payload", 400);
    }
    const policy = ratePolicy(path, method);
    const decision = consumeRateLimit(
      policy,
      `${remoteIdentity(e)}|${requestHost.hostname}|${routeIdentity(path)}`,
    );
    if (!decision.allowed) fail("promo_rate_limited", 429, decision.retryAfter);
  } catch (error) {
    const securityError = error instanceof PromoSecurityError
      ? error : new PromoSecurityError("promo_security_unavailable", 503);
    if (securityError.retryAfter > 0) {
      try { e.response.header().set("Retry-After", String(securityError.retryAfter)); } catch (_) {}
    }
    const publicRoute = path.startsWith("/api/pz/promo/public/v1/");
    const errorCode = securityError.status === 421 && publicRoute
      ? "promo_host_unavailable" : securityError.code;
    return e.json(securityError.status, { ok: false, error: errorCode });
  }
  return e.next();
}

module.exports = {
  PLATFORM_ORIGINS,
  PROMO_API_PREFIX,
  PromoSecurityError,
  RATE_POLICIES,
  consumeRateLimit,
  enforceRequest,
  headerValues,
  parseOrigin,
  parseRequestHost,
  platformOrigins,
  ratePolicy,
  resetRateLimits,
  setSecurityHeaders,
  validateOrigin,
};
