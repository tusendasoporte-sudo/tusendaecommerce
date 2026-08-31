/// <reference path="../pb_data/types.d.ts" />

"use strict";

const installations = typeof __hooks === "undefined"
  ? require("./pz_storefront_installations_lib.js")
  : require(`${__hooks}/pz_storefront_installations_lib.js`);
const manualCoupons = typeof __hooks === "undefined"
  ? require("./pz_manual_coupons_lib.js")
  : require(`${__hooks}/pz_manual_coupons_lib.js`);

const SESSION_COOKIE = "pz_storefront_session";
const DELIVERIES = "push_campaign_deliveries";
const CAMPAIGNS = "push_campaigns";
const WALLET = "storefront_installation_coupons";
const INBOX_RETENTION_DAYS = 30;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SAFE_TARGET_TYPES = new Set(["home", "product", "category", "section", "order", "raffle", "coupon"]);
const SAFE_SOURCES = new Set(["link", "push", "code", "checkout", "migration"]);

class CustomerHubError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function safeText(value, max) {
  let text = "";
  try { text = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return Number.isInteger(max) ? text.slice(0, max) : text;
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { if (typeof record.get === "function") return record.get(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  return safeText(recordValue(record, key), max);
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordNumber(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isFinite(value) ? value : 0;
}

function recordId(record) {
  return safeText(record && (record.id || recordValue(record, "id")), 15);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return safeText(value[0], 15);
  return safeText(value && typeof value === "object" ? value.id : value, 15);
}

function parsedDate(value) {
  const date = new Date(value || "");
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(value, days) {
  const base = parsedDate(value) || new Date();
  return new Date(base.getTime() + days * 86_400_000);
}

function findRecord(app, collection, id) {
  if (!RECORD_ID_PATTERN.test(safeText(id))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, limit, params) {
  try {
    return app.findRecordsByFilter(collection, filter, sort || "", Math.max(1, Math.min(500, limit || 100)), 0, params || {}) || [];
  } catch (_) { return []; }
}

function requestHeader(e, name) {
  try {
    if (e && e.request && e.request.header && typeof e.request.header.get === "function") {
      const direct = safeText(e.request.header.get(name), 8192);
      if (direct) return direct;
    }
  } catch (_) {}
  let info = null;
  try { info = e.requestInfo(); } catch (_) {}
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") return safeText(headers.get(name) || headers.get(name.toLowerCase()), 8192);
  } catch (_) {}
  const wanted = String(name || "").toLowerCase().replace(/-/g, "_");
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase().replace(/-/g, "_") === wanted);
  return key ? safeText(headers[key], 8192) : "";
}

function requestCookie(e, name) {
  const prefix = `${name}=`;
  const part = requestHeader(e, "Cookie").split(";").map((item) => item.trim())
    .find((item) => item.startsWith(prefix));
  if (!part) return "";
  try { return decodeURIComponent(part.slice(prefix.length)); } catch (_) { return ""; }
}

function requestBody(e) {
  try {
    const body = e.requestInfo().body;
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch (_) { return null; }
}

function bodyValue(body, key) {
  if (!body) return undefined;
  try { if (typeof body.get === "function") return body.get(key); } catch (_) {}
  return body[key];
}

function bodyKeys(body) {
  if (!body || typeof body !== "object") return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
}

function exactBody(body, expected) {
  const actual = bodyKeys(body);
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function sessionContext(e, app, now) {
  const token = requestCookie(e, SESSION_COOKIE);
  const session = installations.resolveActiveWebSession(app, token, now);
  if (!session) throw new CustomerHubError("session_required");
  return session;
}

function safeTargetPath(value, storePath) {
  const path = safeText(value, 500);
  if (!path || !storePath || (!path.startsWith(`${storePath}/`) && path !== storePath && !path.startsWith(`${storePath}?`))) return storePath;
  if (path.includes("\\") || /%2f|%5c/i.test(path) || path.includes("/../") || path.includes("/./")) return storePath;
  return path;
}

function couponCodeFromPath(path) {
  const match = safeText(path, 500).match(/[?&]coupon=([^&]+)/i);
  if (!match) return "";
  try { return manualCoupons.normalizeCouponCode(decodeURIComponent(match[1])); } catch (_) { return ""; }
}

function campaignForDelivery(app, delivery) {
  return findRecord(app, CAMPAIGNS, relationId(delivery, "campaign"));
}

function mapInboxItem(app, delivery, session, now) {
  const campaign = campaignForDelivery(app, delivery);
  const created = recordString(delivery, "created", 80);
  const expiry = parsedDate(recordString(delivery, "inbox_expires_at")) || addDays(created, INBOX_RETENTION_DAYS);
  if (expiry.getTime() <= now.getTime() || recordString(delivery, "inbox_deleted_at")) return null;
  const storePath = recordString(session.appConfig, "store_path_prefix", 160);
  const targetTypeRaw = recordString(delivery, "inbox_target_type", 30)
    || recordString(campaign, "target_type", 30)
    || "home";
  const targetType = SAFE_TARGET_TYPES.has(targetTypeRaw) ? targetTypeRaw : "home";
  const targetPath = safeTargetPath(
    recordString(delivery, "inbox_target_path", 500) || recordString(campaign, "target_path", 500),
    storePath,
  );
  const imageUrl = recordString(delivery, "inbox_image_url", 1000);
  return {
    id: recordId(delivery),
    title: recordString(delivery, "inbox_title", 120) || recordString(campaign, "title", 120) || "Power Zona",
    body: recordString(delivery, "inbox_body", 1000) || recordString(campaign, "body", 1000),
    image_url: /^https:\/\//.test(imageUrl) ? imageUrl : "",
    target_type: targetType,
    target_path: targetPath,
    coupon_code: targetType === "coupon" ? couponCodeFromPath(targetPath) : "",
    read: Boolean(recordString(delivery, "inbox_read_at")),
    created,
    expires_at: expiry.toISOString(),
  };
}

function couponAvailability(coupon, now) {
  if (!coupon || recordValue(coupon, "active") === false) return { ok: false, error: "coupon_unavailable" };
  const startsAt = parsedDate(recordString(coupon, "starts_at"));
  const endsAt = parsedDate(recordString(coupon, "ends_at"));
  if (startsAt && startsAt.getTime() > now.getTime()) return { ok: false, error: "coupon_not_started" };
  if (endsAt && endsAt.getTime() < now.getTime()) return { ok: false, error: "coupon_expired" };
  const unlimited = recordValue(coupon, "unlimited_uses") !== false;
  const maxUses = recordNumber(coupon, "max_uses");
  if (!unlimited && maxUses > 0 && recordNumber(coupon, "used_count") >= maxUses) {
    return { ok: false, error: "coupon_exhausted" };
  }
  return { ok: true, error: "" };
}

function couponByCode(app, storeId, rawCode) {
  const code = manualCoupons.normalizeCouponCode(rawCode);
  if (!manualCoupons.validCouponCode(code)) throw new CustomerHubError("invalid_coupon_code");
  const coupon = findFirst(app, "manual_coupons", "store = {:store} && code = {:code}", { store: storeId, code });
  if (!coupon) throw new CustomerHubError("coupon_not_found");
  return { code, coupon };
}

function mapWalletItem(wallet, coupon) {
  return {
    id: recordId(wallet),
    code: recordString(wallet, "coupon_code", 8),
    selected: recordBool(wallet, "selected"),
    acquired_at: recordString(wallet, "acquired_at", 80),
    source: recordString(wallet, "source", 20),
    message: recordString(coupon, "customer_message", 500),
    scope: recordString(coupon, "scope", 40),
    discount_type: recordString(coupon, "discount_type", 40),
    discount_value: recordNumber(coupon, "discount_value"),
    min_subtotal_usd: recordNumber(coupon, "min_subtotal_usd"),
    starts_at: recordString(coupon, "starts_at", 80),
    ends_at: recordString(coupon, "ends_at", 80),
  };
}

function listWallet(app, session, now) {
  const installationId = recordId(session.installation);
  const records = findRecords(
    app,
    WALLET,
    'installation = {:installation} && status = "active"',
    "-selected,-acquired_at,id",
    100,
    { installation: installationId },
  );
  const items = [];
  records.forEach((wallet) => {
    const coupon = findRecord(app, "manual_coupons", relationId(wallet, "coupon"));
    const availability = couponAvailability(coupon, now);
    if (!availability.ok || relationId(coupon, "store") !== session.storeId
      || manualCoupons.normalizeCouponCode(recordString(coupon, "code")) !== recordString(wallet, "coupon_code")) {
      wallet.set("status", "expired");
      wallet.set("selected", false);
      app.save(wallet);
      return;
    }
    items.push(mapWalletItem(wallet, coupon));
  });
  return items;
}

function hubState(app, session, nowValue) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const deliveryRecords = findRecords(
    app,
    DELIVERIES,
    'installation = {:installation} && status = "accepted"',
    "-created,id",
    500,
    { installation: recordId(session.installation) },
  );
  const inbox = deliveryRecords.map((delivery) => mapInboxItem(app, delivery, session, now)).filter(Boolean).slice(0, 300);
  const coupons = listWallet(app, session, now);
  return {
    ok: true,
    inbox: { items: inbox, unread_count: inbox.filter((item) => !item.read).length },
    coupons: { items: coupons, selected_code: (coupons.find((item) => item.selected) || {}).code || "" },
  };
}

function ownedDelivery(app, session, id) {
  const delivery = findRecord(app, DELIVERIES, id);
  if (!delivery || relationId(delivery, "installation") !== recordId(session.installation)
    || relationId(delivery, "store") !== session.storeId
    || recordString(delivery, "status") !== "accepted") throw new CustomerHubError("notification_not_found");
  return delivery;
}

function markNotification(app, session, body, now, mode) {
  if (!exactBody(body, ["action", "notification_id"])) throw new CustomerHubError("invalid_payload");
  const id = safeText(bodyValue(body, "notification_id"), 15);
  if (!RECORD_ID_PATTERN.test(id)) throw new CustomerHubError("notification_not_found");
  const delivery = ownedDelivery(app, session, id);
  delivery.set(mode === "read" ? "inbox_read_at" : "inbox_deleted_at", now.toISOString());
  if (mode === "delete" && !recordString(delivery, "inbox_read_at")) delivery.set("inbox_read_at", now.toISOString());
  app.save(delivery);
}

function bulkNotifications(app, session, body, now, mode) {
  const expected = mode === "read" ? ["action"] : ["action", "scope"];
  if (!exactBody(body, expected)) throw new CustomerHubError("invalid_payload");
  const scope = mode === "delete" ? safeText(bodyValue(body, "scope"), 12) : "all";
  if (mode === "delete" && !["read", "all"].includes(scope)) throw new CustomerHubError("invalid_payload");
  const records = findRecords(
    app,
    DELIVERIES,
    'installation = {:installation} && status = "accepted"',
    "id",
    500,
    { installation: recordId(session.installation) },
  );
  records.forEach((delivery) => {
    if (recordString(delivery, "inbox_deleted_at")) return;
    if (mode === "delete" && scope === "read" && !recordString(delivery, "inbox_read_at")) return;
    if (mode === "read") delivery.set("inbox_read_at", now.toISOString());
    else {
      delivery.set("inbox_deleted_at", now.toISOString());
      if (!recordString(delivery, "inbox_read_at")) delivery.set("inbox_read_at", now.toISOString());
    }
    app.save(delivery);
  });
}

function unselectWallet(app, installationId, exceptId) {
  const rows = findRecords(
    app,
    WALLET,
    'installation = {:installation} && status = "active" && selected = true',
    "id",
    100,
    { installation: installationId },
  );
  rows.forEach((row) => {
    if (recordId(row) === exceptId) return;
    row.set("selected", false);
    app.save(row);
  });
}

function claimCoupon(app, session, body, now) {
  if (!exactBody(body, ["action", "code", "source"])) throw new CustomerHubError("invalid_payload");
  const source = safeText(bodyValue(body, "source"), 20);
  if (!SAFE_SOURCES.has(source)) throw new CustomerHubError("invalid_payload");
  const resolved = couponByCode(app, session.storeId, bodyValue(body, "code"));
  const availability = couponAvailability(resolved.coupon, now);
  if (!availability.ok) throw new CustomerHubError(availability.error);
  const installationId = recordId(session.installation);
  let wallet = findFirst(app, WALLET, "installation = {:installation} && coupon_code = {:code}", {
    installation: installationId,
    code: resolved.code,
  });
  if (wallet && recordString(wallet, "status") === "used") throw new CustomerHubError("coupon_already_used");
  if (!wallet) wallet = new Record(app.findCollectionByNameOrId(WALLET), {});
  wallet.set("store", session.storeId);
  wallet.set("installation", installationId);
  wallet.set("coupon", recordId(resolved.coupon));
  wallet.set("coupon_code", resolved.code);
  wallet.set("status", "active");
  wallet.set("source", source);
  wallet.set("selected", false);
  if (!recordString(wallet, "acquired_at")) wallet.set("acquired_at", now.toISOString());
  wallet.set("used_at", "");
  wallet.set("expires_at", recordString(resolved.coupon, "ends_at"));
  app.save(wallet);
  unselectWallet(app, installationId, recordId(wallet));
  wallet.set("selected", true);
  app.save(wallet);
}

function selectCoupon(app, session, body, now) {
  if (!exactBody(body, ["action", "code"])) throw new CustomerHubError("invalid_payload");
  const resolved = couponByCode(app, session.storeId, bodyValue(body, "code"));
  const availability = couponAvailability(resolved.coupon, now);
  if (!availability.ok) throw new CustomerHubError(availability.error);
  const installationId = recordId(session.installation);
  const wallet = findFirst(app, WALLET, 'installation = {:installation} && coupon_code = {:code} && status = "active"', {
    installation: installationId,
    code: resolved.code,
  });
  if (!wallet) throw new CustomerHubError("coupon_not_saved");
  unselectWallet(app, installationId, recordId(wallet));
  wallet.set("selected", true);
  app.save(wallet);
}

function removeCoupon(app, session, body) {
  if (!exactBody(body, ["action", "code"])) throw new CustomerHubError("invalid_payload");
  const code = manualCoupons.normalizeCouponCode(bodyValue(body, "code"));
  if (!manualCoupons.validCouponCode(code)) throw new CustomerHubError("invalid_coupon_code");
  const wallet = findFirst(app, WALLET, "installation = {:installation} && coupon_code = {:code}", {
    installation: recordId(session.installation),
    code,
  });
  if (!wallet || relationId(wallet, "store") !== session.storeId) throw new CustomerHubError("coupon_not_saved");
  wallet.set("status", "removed");
  wallet.set("selected", false);
  app.save(wallet);
}

function clearCouponSelection(app, session, body) {
  if (!exactBody(body, ["action"])) throw new CustomerHubError("invalid_payload");
  unselectWallet(app, recordId(session.installation), "");
}

function mutateHub(app, session, body, now) {
  const action = safeText(bodyValue(body, "action"), 50);
  if (action === "notification_mark_read") markNotification(app, session, body, now, "read");
  else if (action === "notification_delete") markNotification(app, session, body, now, "delete");
  else if (action === "notifications_mark_all_read") bulkNotifications(app, session, body, now, "read");
  else if (action === "notifications_delete") bulkNotifications(app, session, body, now, "delete");
  else if (action === "coupon_claim") claimCoupon(app, session, body, now);
  else if (action === "coupon_select") selectCoupon(app, session, body, now);
  else if (action === "coupon_unselect") clearCouponSelection(app, session, body);
  else if (action === "coupon_remove") removeCoupon(app, session, body);
  else throw new CustomerHubError("invalid_payload");
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

function errorStatus(code) {
  if (code === "session_required") return 401;
  if (["coupon_not_found", "coupon_not_saved", "notification_not_found"].includes(code)) return 404;
  if (["coupon_expired", "coupon_exhausted", "coupon_not_started", "coupon_unavailable", "coupon_already_used"].includes(code)) return 409;
  if (code === "invalid_coupon_code" || code === "invalid_payload") return 400;
  return 503;
}

function safeError(error) {
  const code = safeText(error && (error.code || error.message), 80);
  return [
    "session_required", "coupon_not_found", "coupon_not_saved", "notification_not_found",
    "coupon_expired", "coupon_exhausted", "coupon_not_started", "coupon_unavailable",
    "coupon_already_used", "invalid_coupon_code", "invalid_payload",
  ].includes(code) ? code : "customer_hub_unavailable";
}

function handleGet(e) {
  setPrivateHeaders(e);
  try {
    const app = e.app || $app;
    const now = new Date();
    const session = sessionContext(e, app, now);
    let result = null;
    app.runInTransaction((txApp) => {
      const txSession = sessionContext(e, txApp, now);
      result = hubState(txApp, txSession, now);
    });
    return e.json(200, result);
  } catch (error) {
    const code = safeError(error);
    return e.json(errorStatus(code), { ok: false, error: code });
  }
}

function handlePost(e) {
  setPrivateHeaders(e);
  const body = requestBody(e);
  if (!body) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const app = e.app || $app;
    const now = new Date();
    let result = null;
    app.runInTransaction((txApp) => {
      const session = sessionContext(e, txApp, now);
      mutateHub(txApp, session, body, now);
      result = hubState(txApp, session, now);
    });
    return e.json(200, result);
  } catch (error) {
    const code = safeError(error);
    return e.json(errorStatus(code), { ok: false, error: code });
  }
}

function markCouponUsed(app, session, couponCodeValue, nowValue) {
  const code = manualCoupons.normalizeCouponCode(couponCodeValue);
  if (!session || !manualCoupons.validCouponCode(code)) return null;
  const wallet = findFirst(app, WALLET, 'installation = {:installation} && coupon_code = {:code} && status = "active"', {
    installation: recordId(session.installation),
    code,
  });
  if (!wallet || relationId(wallet, "store") !== session.storeId) return null;
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  wallet.set("status", "used");
  wallet.set("selected", false);
  wallet.set("used_at", now.toISOString());
  app.save(wallet);
  return wallet;
}

module.exports = {
  CustomerHubError,
  INBOX_RETENTION_DAYS,
  SESSION_COOKIE,
  WALLET,
  couponAvailability,
  couponCodeFromPath,
  handleGet,
  handlePost,
  hubState,
  markCouponUsed,
  mutateHub,
  requestCookie,
  safeTargetPath,
};
