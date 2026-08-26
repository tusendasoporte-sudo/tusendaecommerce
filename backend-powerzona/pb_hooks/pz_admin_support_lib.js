"use strict";

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const STORE_ROLES = Object.freeze(["store_admin", "store_staff"]);

function text(value, max) {
  const normalized = String(value == null ? "" : value).trim();
  return normalized.slice(0, max || 1000);
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) {
    try { return record.getString(key); } catch (_) { return record[key]; }
  }
}

function recordString(record, key, max) {
  return text(recordValue(record, key), max || 1000);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return text(value[0], 15);
  return text(value, 15);
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function records(app, collection, filter, sort, limit) {
  try { return app.findRecordsByFilter(collection, filter, sort, limit, 0) || []; } catch (_) { return []; }
}

function normalizeWhatsappNumber(value) {
  const raw = text(value, 60);
  if (!raw) return "";
  if (!/^[+0-9\s().-]+$/.test(raw)) return "";
  const digits = raw.replace(/\D/g, "");
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : "";
}

function activeStoreActor(record) {
  return !!record
    && STORE_ROLES.includes(recordString(record, "role", 40))
    && recordString(record, "status", 40).toLowerCase() === "active"
    && RECORD_ID_PATTERN.test(relationId(record, "store"));
}

function activeMasterActor(record) {
  return !!record
    && recordString(record, "role", 40) === "master_admin"
    && recordString(record, "status", 40).toLowerCase() === "active";
}

function requestHeader(info, name) {
  const lower = String(name || "").toLowerCase();
  const target = lower.replace(/-/g, "_");
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") {
      return text(headers.get(name) || headers.get(lower) || headers.get(target), 80);
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === target
  ));
  return key ? text(headers[key], 80) : "";
}

function configuredMaster(app) {
  const masters = records(
    app,
    "users",
    'role = "master_admin" && status = "active"',
    "-updated,+id",
    500,
  );
  for (const master of masters) {
    const whatsapp = normalizeWhatsappNumber(recordString(master, "phone", 60));
    if (whatsapp) return { master, whatsapp };
  }
  return null;
}

function supportContactSnapshot(app, actor, supportStoreId) {
  const isStoreActor = activeStoreActor(actor);
  const isMasterActor = activeMasterActor(actor);
  if (!isStoreActor && !isMasterActor) throw new Error("unauthorized");
  const storeId = isMasterActor ? text(supportStoreId, 15) : relationId(actor, "store");
  if (!RECORD_ID_PATTERN.test(storeId)) throw new Error("unauthorized");
  const store = findRecord(app, "stores", storeId);
  if (!store || recordString(store, "status", 40).toLowerCase() !== "active") {
    throw new Error("unauthorized");
  }

  const configured = configuredMaster(app);
  if (!configured) return Object.freeze({ configured: false, href: "" });

  const storeName = recordString(store, "name", 160)
    || recordString(store, "title", 160)
    || recordString(store, "slug", 80)
    || "mi tienda";
  const storeSlug = recordString(store, "slug", 80) || "sin-slug";
  const message = `Hola soporte de Tu Senda 84, necesito ayuda con el admin de ${storeName} (${storeSlug}).`;
  return Object.freeze({
    configured: true,
    href: `https://wa.me/${configured.whatsapp}?text=${encodeURIComponent(message)}`,
  });
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function handleSupportContact(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const actorId = text(info && info.auth && info.auth.id, 15);
    const actor = RECORD_ID_PATTERN.test(actorId) ? findRecord($app, "users", actorId) : null;
    const supportStoreId = activeMasterActor(actor) ? requestHeader(info, "X-PZ-Support-Store") : "";
    const contact = supportContactSnapshot($app, actor, supportStoreId);
    return e.json(200, { ok: true, contact });
  } catch (error) {
    if (text(error && error.message, 80) === "unauthorized") {
      return e.json(403, { ok: false, error: "unauthorized" });
    }
    return e.json(500, { ok: false, error: "support_contact_failed" });
  }
}

module.exports = {
  activeMasterActor,
  activeStoreActor,
  configuredMaster,
  handleSupportContact,
  normalizeWhatsappNumber,
  requireAuthenticatedUser,
  supportContactSnapshot,
};
