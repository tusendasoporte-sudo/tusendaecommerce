/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);

const DOMAIN_LIST_READ_CONTRACT = "promo.domain.list.read.v1";
const DOMAIN_CATALOG_CONTRACT = "promo.domain.catalog.v1";
const DOMAIN_CREATE_CONTRACT = "promo.domain.create.v1";
const DOMAIN_VERIFY_CONTRACT = "promo.domain.verify.v1";
const DOMAIN_STATUS_UPDATE_CONTRACT = "promo.domain.status.update.v1";
const DOMAIN_BINDING_CONTRACT = "promo.domain.binding.v1";
const DOMAIN_ROUTE_CONTRACT = "promo.domain.route.v1";
const DOMAIN_ROLES = Object.freeze(["primary", "alias"]);
const DOMAIN_STATUSES = Object.freeze(["pending", "verified", "active", "paused", "revoked", "released"]);
const DOMAIN_VERIFICATION_METHODS = Object.freeze(["manual", "dns", "http"]);
const DEFAULT_PLATFORM_HOSTS = Object.freeze([
  "tusenda84.com",
  "www.tusenda84.com",
  "api.tusenda84.com",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;

const PUNYCODE_BASE = 36;
const PUNYCODE_TMIN = 1;
const PUNYCODE_TMAX = 26;
const PUNYCODE_SKEW = 38;
const PUNYCODE_DAMP = 700;
const PUNYCODE_INITIAL_BIAS = 72;
const PUNYCODE_INITIAL_N = 128;
const PUNYCODE_DELIMITER = "-";
const MAX_INT = 2147483647;

class PromoDomainError extends Error {
  constructor(code, status) {
    super(code || "promo_domain_unavailable");
    this.name = "PromoDomainError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 400;
  }
}

function fail(code, status) {
  throw new PromoDomainError(code, status);
}

function safeText(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value); } catch (_) {}
  if (Number.isInteger(max) && result.length > max) fail("invalid_promo_hostname", 400);
  return result;
}

function basicToDigit(codePoint) {
  if (codePoint >= 48 && codePoint <= 57) return codePoint - 22;
  if (codePoint >= 65 && codePoint <= 90) return codePoint - 65;
  if (codePoint >= 97 && codePoint <= 122) return codePoint - 97;
  return PUNYCODE_BASE;
}

function digitToBasic(digit) {
  return String.fromCharCode(digit + 22 + 75 * (digit < 26));
}

function adaptBias(deltaValue, points, firstTime) {
  let delta = firstTime ? Math.floor(deltaValue / PUNYCODE_DAMP) : (deltaValue >> 1);
  delta += Math.floor(delta / points);
  let k = 0;
  const limit = Math.floor(((PUNYCODE_BASE - PUNYCODE_TMIN) * PUNYCODE_TMAX) / 2);
  while (delta > limit) {
    delta = Math.floor(delta / (PUNYCODE_BASE - PUNYCODE_TMIN));
    k += PUNYCODE_BASE;
  }
  return k + Math.floor(((PUNYCODE_BASE - PUNYCODE_TMIN + 1) * delta) / (delta + PUNYCODE_SKEW));
}

function unicodeCodePoints(value) {
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first >= 0xD800 && first <= 0xDBFF) {
      const second = value.charCodeAt(index + 1);
      if (second < 0xDC00 || second > 0xDFFF) fail("invalid_promo_hostname", 400);
      result.push(((first - 0xD800) * 0x400) + (second - 0xDC00) + 0x10000);
      index += 1;
    } else if (first >= 0xDC00 && first <= 0xDFFF) {
      fail("invalid_promo_hostname", 400);
    } else {
      result.push(first);
    }
  }
  return result;
}

function codePointsToString(points) {
  return points.map((point) => (
    point > 0xFFFF
      ? String.fromCharCode(((point - 0x10000) >> 10) + 0xD800, ((point - 0x10000) & 0x3FF) + 0xDC00)
      : String.fromCharCode(point)
  )).join("");
}

function punycodeEncode(value) {
  const input = unicodeCodePoints(value);
  let n = PUNYCODE_INITIAL_N;
  let delta = 0;
  let bias = PUNYCODE_INITIAL_BIAS;
  let output = "";
  input.forEach((point) => {
    if (point < 0x80) output += String.fromCharCode(point);
  });
  const basicLength = output.length;
  let handled = basicLength;
  if (basicLength) output += PUNYCODE_DELIMITER;
  while (handled < input.length) {
    let next = MAX_INT;
    input.forEach((point) => { if (point >= n && point < next) next = point; });
    if (next - n > Math.floor((MAX_INT - delta) / (handled + 1))) fail("invalid_promo_hostname", 400);
    delta += (next - n) * (handled + 1);
    n = next;
    for (const point of input) {
      if (point < n && ++delta > MAX_INT) fail("invalid_promo_hostname", 400);
      if (point !== n) continue;
      let q = delta;
      for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
        const threshold = k <= bias ? PUNYCODE_TMIN : (k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias);
        if (q < threshold) break;
        output += digitToBasic(threshold + ((q - threshold) % (PUNYCODE_BASE - threshold)));
        q = Math.floor((q - threshold) / (PUNYCODE_BASE - threshold));
      }
      output += digitToBasic(q);
      bias = adaptBias(delta, handled + 1, handled === basicLength);
      delta = 0;
      handled += 1;
    }
    delta += 1;
    n += 1;
  }
  return output;
}

function punycodeDecode(value) {
  let n = PUNYCODE_INITIAL_N;
  let index = 0;
  let bias = PUNYCODE_INITIAL_BIAS;
  const output = [];
  const delimiter = value.lastIndexOf(PUNYCODE_DELIMITER);
  let cursor = delimiter < 0 ? 0 : delimiter + 1;
  if (delimiter >= 0) {
    for (let offset = 0; offset < delimiter; offset += 1) {
      const point = value.charCodeAt(offset);
      if (point >= 0x80) fail("invalid_promo_hostname", 400);
      output.push(point);
    }
  }
  while (cursor < value.length) {
    const oldIndex = index;
    let weight = 1;
    for (let k = PUNYCODE_BASE; ; k += PUNYCODE_BASE) {
      if (cursor >= value.length) fail("invalid_promo_hostname", 400);
      const digit = basicToDigit(value.charCodeAt(cursor));
      cursor += 1;
      if (digit >= PUNYCODE_BASE || digit > Math.floor((MAX_INT - index) / weight)) {
        fail("invalid_promo_hostname", 400);
      }
      index += digit * weight;
      const threshold = k <= bias ? PUNYCODE_TMIN : (k >= bias + PUNYCODE_TMAX ? PUNYCODE_TMAX : k - bias);
      if (digit < threshold) break;
      const baseMinusThreshold = PUNYCODE_BASE - threshold;
      if (weight > Math.floor(MAX_INT / baseMinusThreshold)) fail("invalid_promo_hostname", 400);
      weight *= baseMinusThreshold;
    }
    const length = output.length + 1;
    bias = adaptBias(index - oldIndex, length, oldIndex === 0);
    if (Math.floor(index / length) > MAX_INT - n) fail("invalid_promo_hostname", 400);
    n += Math.floor(index / length);
    index %= length;
    if (n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF)) fail("invalid_promo_hostname", 400);
    output.splice(index, 0, n);
    index += 1;
  }
  return codePointsToString(output);
}

function normalizedUnicode(value) {
  let result = value;
  try { result = result.normalize("NFKC").normalize("NFC"); } catch (_) {
    if (/[^\x00-\x7F]/.test(result)) fail("invalid_promo_hostname", 400);
  }
  return result.replace(/[\u3002\uFF0E\uFF61]/g, ".").toLowerCase();
}

function forbiddenUnicodePoint(point) {
  return point <= 0x20
    || (point >= 0x7F && point <= 0x9F)
    || (point >= 0x2000 && point <= 0x206F)
    || (point >= 0x2190 && point <= 0x2BFF)
    || (point >= 0xD800 && point <= 0xF8FF)
    || (point >= 0xFDD0 && point <= 0xFDEF)
    || (point & 0xFFFF) === 0xFFFE
    || (point & 0xFFFF) === 0xFFFF
    || (point >= 0x1F000 && point <= 0x1FAFF);
}

function combiningPoint(point) {
  return (point >= 0x0300 && point <= 0x036F)
    || (point >= 0x1AB0 && point <= 0x1AFF)
    || (point >= 0x1DC0 && point <= 0x1DFF)
    || (point >= 0x20D0 && point <= 0x20FF)
    || (point >= 0xFE20 && point <= 0xFE2F);
}

function validateUnicodeLabel(label) {
  const normalized = normalizedUnicode(label);
  if (!normalized || normalized !== label || normalized.startsWith("-") || normalized.endsWith("-")) {
    fail("invalid_promo_hostname", 400);
  }
  if (normalized.length >= 4 && normalized[2] === "-" && normalized[3] === "-"
    && !normalized.startsWith("xn--")) fail("invalid_promo_hostname", 400);
  const points = unicodeCodePoints(normalized);
  if (!points.length || combiningPoint(points[0])) fail("invalid_promo_hostname", 400);
  points.forEach((point) => {
    const asciiAllowed = (point >= 97 && point <= 122) || (point >= 48 && point <= 57) || point === 45;
    if (point < 0x80 && !asciiAllowed) fail("invalid_promo_hostname", 400);
    if (point >= 0x80 && forbiddenUnicodePoint(point)) fail("invalid_promo_hostname", 400);
  });
  return normalized;
}

function asciiLabel(label) {
  const normalized = validateUnicodeLabel(label);
  if (!/[^\x00-\x7F]/.test(normalized)) {
    if (normalized.length > 63 || (normalized.length >= 4 && normalized[2] === "-" && normalized[3] === "-"
      && !normalized.startsWith("xn--"))) fail("invalid_promo_hostname", 400);
    if (normalized.startsWith("xn--")) {
      const payload = normalized.slice(4);
      if (!payload) fail("invalid_promo_hostname", 400);
      const decoded = validateUnicodeLabel(normalizedUnicode(punycodeDecode(payload)));
      if (!/[^\x00-\x7F]/.test(decoded) || punycodeEncode(decoded) !== payload) {
        fail("invalid_promo_hostname", 400);
      }
    }
    return normalized;
  }
  const encoded = `xn--${punycodeEncode(normalized)}`;
  if (encoded.length > 63) fail("invalid_promo_hostname", 400);
  return encoded;
}

function unicodeLabel(label) {
  if (!label.startsWith("xn--")) return label;
  return validateUnicodeLabel(normalizedUnicode(punycodeDecode(label.slice(4))));
}

function ipv4Literal(hostname) {
  const parts = hostname.split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9][0-9]{0,2})$/.test(part)
    && Number(part) >= 0 && Number(part) <= 255);
}

function normalizeAuthority(value, options) {
  const settings = options || {};
  let raw = safeText(value, 512);
  if (!raw || raw !== raw.trim() || /[\u0000-\u0020\u007F]/.test(raw)) fail("invalid_promo_hostname", 400);
  raw = normalizedUnicode(raw);
  if (!raw || /[,/@\\?#%\[\]]/.test(raw) || raw.includes("://")) fail("invalid_promo_hostname", 400);
  const colon = raw.lastIndexOf(":");
  let port = null;
  if (colon >= 0) {
    if (!settings.allowPort || raw.indexOf(":") !== colon) fail("invalid_promo_port", 400);
    const portText = raw.slice(colon + 1);
    raw = raw.slice(0, colon);
    if (!/^[0-9]{1,5}$/.test(portText)) fail("invalid_promo_port", 400);
    port = Number(portText);
    if (port < 1 || port > 65535) fail("invalid_promo_port", 400);
  }
  if (raw.endsWith(".")) raw = raw.slice(0, -1);
  if (!raw || raw.endsWith(".") || raw.startsWith(".")) fail("invalid_promo_hostname", 400);
  const unicodeLabels = raw.split(".");
  if (unicodeLabels.length < 2) fail("invalid_promo_hostname", 400);
  const asciiLabels = unicodeLabels.map((label) => asciiLabel(label));
  const hostname = asciiLabels.join(".");
  if (hostname.length > 253 || ipv4Literal(hostname) || /^[0-9.]+$/.test(hostname)) {
    fail("invalid_promo_hostname", 400);
  }
  try { data.assertCanonicalHostname(hostname); } catch (_) { fail("invalid_promo_hostname", 400); }
  const display = asciiLabels.map((label) => unicodeLabel(label)).join(".");
  return Object.freeze({ hostname_ascii: hostname, hostname_display: display, port });
}

function headerEntries(headers, name) {
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  let present = false;
  let value;
  if (headers && typeof headers.get === "function") {
    try {
      value = headers.get(name);
      present = value !== undefined && value !== null;
    } catch (_) {}
  }
  if (!present && headers && typeof headers === "object") {
    const keys = Object.keys(headers).filter((candidate) => (
      String(candidate).toLowerCase().replace(/-/g, "_") === normalized
    ));
    if (keys.length > 1) return { present: true, values: keys.map((key) => headers[key]) };
    if (keys.length === 1) {
      present = true;
      value = headers[keys[0]];
    }
  }
  if (!present) return { present: false, values: [] };
  return { present: true, values: Array.isArray(value) ? value.slice() : [value] };
}

function singleHeader(headers, name, required) {
  const result = headerEntries(headers, name);
  if (!result.present) {
    if (required) fail("invalid_promo_host_header", 421);
    return null;
  }
  if (result.values.length !== 1) fail("invalid_promo_host_header", 421);
  const value = safeText(result.values[0], 512);
  if (!value || value.includes(",")) fail("invalid_promo_host_header", 421);
  return value;
}

function selectAuthoritativeHost(headers, options) {
  const trustedProxy = options && options.trustedProxy === true;
  let source = "host";
  let authority;
  if (trustedProxy) {
    const forwarded = singleHeader(headers, "X-Forwarded-Host", false);
    if (forwarded !== null) {
      authority = forwarded;
      source = "x-forwarded-host";
    }
  }
  if (!authority) authority = singleHeader(headers, "Host", true);
  let parsed;
  try { parsed = normalizeAuthority(authority, { allowPort: true }); }
  catch (_) { fail("invalid_promo_host_header", 421); }
  return Object.freeze({ ...parsed, source, trusted_proxy: trustedProxy });
}

function normalizedPlatformHosts(values) {
  const hosts = Array.isArray(values) && values.length ? values : DEFAULT_PLATFORM_HOSTS;
  const result = [];
  hosts.forEach((value) => {
    const host = normalizeAuthority(value, { allowPort: true }).hostname_ascii;
    if (!result.includes(host)) result.push(host);
  });
  return Object.freeze(result.sort());
}

function isPlatformHostname(hostname, platformHosts) {
  return normalizedPlatformHosts(platformHosts).includes(hostname);
}

function isPlatformNamespace(hostname, platformHosts) {
  return normalizedPlatformHosts(platformHosts).some((platform) => (
    hostname === platform || hostname.endsWith(`.${platform}`)
  ));
}

function recordId(record) {
  return promo.recordId(record);
}

function recordString(record, key) {
  return promo.recordString(record, key);
}

function relationId(record, key) {
  return promo.relationId(record, key);
}

function recordInteger(record, key) {
  return promo.recordInteger(record, key);
}

function recordBool(record, key) {
  return promo.recordBool(record, key);
}

function findRecord(app, collection, id) {
  if (!RECORD_ID_PATTERN.test(String(id || ""))) fail("promo_host_unavailable", 421);
  try { return app.findRecordById(collection, id); } catch (_) { fail("promo_host_unavailable", 421); }
}

function findRows(app, collection, filter, params, limit) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter,
      "id",
      Number.isInteger(limit) ? limit : 2,
      0,
      params || {},
    ) || []);
  } catch (_) {
    fail("promo_host_unavailable", 421);
  }
}

function findExact(app, collection, filter, params) {
  const rows = findRows(app, collection, filter, params, 2);
  if (rows.length !== 1) fail("promo_host_unavailable", 421);
  return rows[0];
}

function assertActiveBinding(binding, siteId, expectedHostname, expectedRole) {
  if (!binding || relationId(binding, "site") !== siteId
    || recordString(binding, "status") !== "active"
    || !recordBool(binding, "is_current")
    || (expectedHostname && recordString(binding, "hostname_ascii") !== expectedHostname)
    || (expectedRole && recordString(binding, "role") !== expectedRole)) {
    fail("promo_host_unavailable", 421);
  }
}

function assertPublicRoot(entitlement) {
  if (!promo.resolvePromoCapabilityAccess(entitlement, "promo_site_enabled").allowed
    || !promo.resolvePromoCapabilityAccess(entitlement, "custom_domain_enabled").allowed) {
    fail("promo_host_unavailable", 421);
  }
}

function resolveHostBindingContext(app, headers, options) {
  const authority = selectAuthoritativeHost(headers, options || {});
  if (isPlatformHostname(authority.hostname_ascii, options && options.platformHosts)) {
    fail("promo_platform_host", 421);
  }
  const matches = findRows(
    app,
    "promo_domain_bindings",
    "hostname_ascii = {:hostname} && is_current = true && status = {:status}",
    { hostname: authority.hostname_ascii, status: "active" },
    3,
  ).filter((record) => recordString(record, "hostname_ascii") === authority.hostname_ascii
    && recordBool(record, "is_current") && recordString(record, "status") === "active");
  if (matches.length !== 1) fail("promo_host_unavailable", 421);
  const binding = matches[0];
  const siteId = relationId(binding, "site");
  assertActiveBinding(binding, siteId, authority.hostname_ascii);
  if (!DOMAIN_ROLES.includes(recordString(binding, "role"))) fail("promo_host_unavailable", 421);

  const site = findRecord(app, "promo_sites", siteId);
  if (recordString(site, "status") !== "active" || recordInteger(site, "contract_version") !== 1
    || !recordString(site, "public_slug")) fail("promo_host_unavailable", 421);
  const store = findRecord(app, "stores", relationId(site, "store"));
  if (recordString(store, "status") !== "active") fail("promo_host_unavailable", 421);
  const entitlement = findExact(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
  if (relationId(entitlement, "site") !== siteId) fail("promo_host_unavailable", 421);
  assertPublicRoot(entitlement);
  const slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
  const generation = recordInteger(slot, "generation");
  const revisionId = relationId(slot, "published_revision");
  const primaryId = relationId(slot, "primary_binding");
  if (relationId(slot, "site") !== siteId || recordString(slot, "state") !== "active"
    || recordString(slot, "canonical_mode") !== "custom" || generation === null || generation < 1
    || !revisionId || !primaryId) fail("promo_host_unavailable", 421);
  const primary = findRecord(app, "promo_domain_bindings", primaryId);
  assertActiveBinding(primary, siteId, "", "primary");
  const revision = findRecord(app, "promo_revisions", revisionId);
  if (relationId(revision, "site") !== siteId || recordInteger(revision, "schema_version") !== 1) {
    fail("promo_host_unavailable", 421);
  }
  const bindingRole = recordString(binding, "role");
  if (bindingRole === "primary" && recordId(binding) !== recordId(primary)) fail("promo_host_unavailable", 421);

  const finalBinding = findRecord(app, "promo_domain_bindings", recordId(binding));
  const finalPrimary = findRecord(app, "promo_domain_bindings", recordId(primary));
  const finalSite = findRecord(app, "promo_sites", siteId);
  const finalStore = findRecord(app, "stores", recordId(store));
  const finalEntitlement = findExact(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
  const finalSlot = findRecord(app, "promo_publication_slots", recordId(slot));
  assertActiveBinding(finalBinding, siteId, authority.hostname_ascii, bindingRole);
  assertActiveBinding(finalPrimary, siteId, recordString(primary, "hostname_ascii"), "primary");
  assertPublicRoot(finalEntitlement);
  if (recordString(finalSite, "status") !== "active" || recordString(finalStore, "status") !== "active"
    || recordInteger(finalSlot, "generation") !== generation
    || relationId(finalSlot, "site") !== siteId
    || relationId(finalSlot, "published_revision") !== revisionId
    || relationId(finalSlot, "primary_binding") !== recordId(primary)
    || recordString(finalSlot, "state") !== "active"
    || recordString(finalSlot, "canonical_mode") !== "custom") {
    fail("promo_host_unavailable", 421);
  }
  return Object.freeze({
    authority,
    binding: finalBinding,
    binding_role: bindingRole,
    canonical_hostname: recordString(finalPrimary, "hostname_ascii"),
    entitlement: finalEntitlement,
    generation,
    revision,
    revision_id: revisionId,
    site: finalSite,
    site_id: siteId,
    slot: finalSlot,
    store: finalStore,
  });
}

function resolveHostContext(app, headers, options) {
  const context = resolveHostBindingContext(app, headers, options);
  let published;
  try {
    published = pubcfgApi.resolvePublicProjectionForSite(app, context.site, {
      canonicalMode: "custom",
      primaryBindingId: relationId(context.slot, "primary_binding"),
      expectedGeneration: context.generation,
      expectedRevisionId: context.revision_id,
    });
  } catch (_) {
    fail("promo_host_unavailable", 421);
  }
  return Object.freeze({
    ...context,
    document: published.document,
    generation: published.generation,
    projection: published.projection,
    revision: published.revision,
    revision_id: published.revisionId,
    slot: published.slot,
  });
}

function projectHostRoute(context) {
  if (!context || !context.authority || !context.site || !context.projection) {
    fail("promo_host_unavailable", 421);
  }
  return Object.freeze({
    ok: true,
    contract: DOMAIN_ROUTE_CONTRACT,
    action: context.binding_role === "alias" ? "redirect" : "serve",
    host: context.authority.hostname_ascii,
    canonical_host: context.canonical_hostname,
    site: Object.freeze({ public_slug: recordString(context.site, "public_slug") }),
  });
}

function domainAuditSnapshot(record) {
  return Object.freeze({
    role: recordString(record, "role"),
    status: recordString(record, "status"),
    is_current: recordBool(record, "is_current"),
    state_version: recordInteger(record, "state_version") || 0,
    verification_method: recordString(record, "verification_method"),
  });
}

function domainPrivateProjection(record) {
  return Object.freeze({
    binding_id: recordId(record),
    hostname_ascii: recordString(record, "hostname_ascii"),
    hostname_display: recordString(record, "hostname_display"),
    role: recordString(record, "role"),
    status: recordString(record, "status"),
    is_current: recordBool(record, "is_current"),
    verification_method: recordString(record, "verification_method"),
    state_version: recordInteger(record, "state_version") || 0,
    verified_at: recordString(record, "verified_at"),
    activated_at: recordString(record, "activated_at"),
    retired_at: recordString(record, "retired_at"),
  });
}

module.exports = {
  DEFAULT_PLATFORM_HOSTS,
  DOMAIN_BINDING_CONTRACT,
  DOMAIN_CATALOG_CONTRACT,
  DOMAIN_CREATE_CONTRACT,
  DOMAIN_LIST_READ_CONTRACT,
  DOMAIN_ROLES,
  DOMAIN_ROUTE_CONTRACT,
  DOMAIN_STATUSES,
  DOMAIN_STATUS_UPDATE_CONTRACT,
  DOMAIN_VERIFICATION_METHODS,
  DOMAIN_VERIFY_CONTRACT,
  PromoDomainError,
  RECORD_ID_PATTERN,
  SHA256_PATTERN,
  assertActiveBinding,
  domainAuditSnapshot,
  domainPrivateProjection,
  isPlatformHostname,
  isPlatformNamespace,
  normalizeAuthority,
  normalizedPlatformHosts,
  projectHostRoute,
  punycodeDecode,
  punycodeEncode,
  resolveHostBindingContext,
  resolveHostContext,
  selectAuthoritativeHost,
};
