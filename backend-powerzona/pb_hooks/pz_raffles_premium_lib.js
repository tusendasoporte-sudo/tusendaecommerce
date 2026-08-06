/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const securityEnforcement = typeof __hooks === "undefined"
  ? require("./pz_security_enforcement_lib.js")
  : require(`${__hooks}/pz_security_enforcement_lib.js`);

const FIXED_SLUGS = Object.freeze(["rifa-1", "rifa-2", "rifa-3"]);
const PUBLIC_ACTIONS = Object.freeze(["home", "first", "detail"]);
const LOCKED_STATUSES = Object.freeze([
  "selection_closed",
  "result_pending",
  "winner_published",
  "no_winner_published",
  "finalized",
  "archived",
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
  if (value && typeof value.string === "function") {
    try { return String(value.string() || "").trim(); } catch (_) { return ""; }
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBoolean(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
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

function bodyKeys(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function safeText(value, max) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function safeLongText(value, max) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, max);
}

function safeSlug(value) {
  const slug = safeText(value, 90).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function normalizePhone(value) {
  const digits = String(value === null || value === undefined ? "" : value).replace(/\D/g, "");
  if (/^\d{8}$/.test(digits)) return `53${digits}`;
  return /^53\d{8}$/.test(digits) ? digits : "";
}

function normalizeNumber(value) {
  const number = String(value === null || value === undefined ? "" : value).trim();
  return /^[0-9]{2}$/.test(number) ? number : "";
}

function normalizeAccessCode(value) {
  return safeText(value, 80).toUpperCase();
}

function jsonArray(value) {
  if (Array.isArray(value)) {
    if (value.length && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
      try {
        const encoded = value.map((item) => `%${item.toString(16).padStart(2, "0")}`).join("");
        const parsed = JSON.parse(decodeURIComponent(encoded));
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return value;
  }
  if (value && typeof value.string === "function") {
    try { return jsonArray(String(value.string() || "")); } catch (_) { return []; }
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  try {
    const parsed = JSON.parse(JSON.stringify(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) {}
  try {
    return (app.findRecordsByFilter(collection, filter, "id", 1, 0, params || {}) || [])[0] || null;
  } catch (_) {
    return null;
  }
}

function findMany(app, collection, filter, sort, limit, params) {
  try {
    return app.findRecordsByFilter(
      collection,
      filter,
      sort || "id",
      Math.max(1, Math.min(Number(limit) || 100, 500)),
      0,
      params || {},
    ) || [];
  } catch (_) {
    return [];
  }
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } catch (_) {}
}

function unavailable(e) {
  setPrivateHeaders(e);
  return e.json(404, { ok: false, message: "No se encontró la rifa." });
}

function invalid(e, message, status) {
  setPrivateHeaders(e);
  return e.json(status || 400, { ok: false, message });
}

function raffleCapabilityAllowed(store) {
  return !!store
    && recordString(store, "status") === "active"
    && capabilities.hasStoreCapability(
      store,
      "raffles_enabled",
      { enforceExpiration: true },
    );
}

function findPublicStore(app, storeSlug) {
  const slug = safeSlug(storeSlug);
  if (!slug) return null;
  const store = findFirst(
    app,
    "stores",
    'slug = {:slug} && status = "active"',
    { slug },
  );
  return raffleCapabilityAllowed(store) ? store : null;
}

function fixedRaffleAvailable(raffle, storeId, options) {
  if (!raffle || relationId(raffle, "store") !== storeId) return false;
  const slug = recordString(raffle, "slug");
  if (!FIXED_SLUGS.includes(slug)
    || !recordBoolean(raffle, "is_configured")
    || !recordBoolean(raffle, "link_enabled")
    || recordString(raffle, "status") === "archived") return false;
  return !(options && options.home === true) || recordBoolean(raffle, "show_in_store");
}

function findPublicRaffle(app, store, raffleSlug) {
  const slug = safeSlug(raffleSlug);
  if (!FIXED_SLUGS.includes(slug)) return null;
  const raffle = findFirst(
    app,
    "raffles",
    "store = {:store} && slug = {:slug}",
    { store: recordString(store, "id"), slug },
  );
  return fixedRaffleAvailable(raffle, recordString(store, "id")) ? raffle : null;
}

function publicRaffleRecord(raffle) {
  const status = recordString(raffle, "status");
  const resultVisible = ["winner_published", "no_winner_published", "finalized"].includes(status);
  return {
    id: recordString(raffle, "id"),
    title: safeText(recordValue(raffle, "title"), 140),
    slug: recordString(raffle, "slug"),
    slot_number: Math.max(1, Math.min(3, Number(recordValue(raffle, "slot_number")) || 1)),
    is_configured: recordBoolean(raffle, "is_configured"),
    description: safeLongText(recordValue(raffle, "description"), 4000),
    conditions: safeLongText(recordValue(raffle, "conditions"), 4000),
    images: jsonArray(recordValue(raffle, "images")).map((item) => safeText(item, 220)).filter(Boolean),
    prizes_json: jsonArray(recordValue(raffle, "prizes_json"))
      .filter((item) => item && typeof item === "object")
      .slice(0, 50)
      .map((item) => ({
        id: safeSlug(item.id),
        name: safeText(item.name, 80),
        description: safeText(item.description, 180),
        image: safeText(item.image, 220),
      }))
      .filter((item) => item.id || item.name || item.description || item.image),
    prizes_display_mode: recordString(raffle, "prizes_display_mode") === "carousel" ? "carousel" : "fixed",
    store_featured_prize_ids: jsonArray(recordValue(raffle, "store_featured_prize_ids"))
      .map(safeSlug)
      .filter(Boolean)
      .slice(0, 4),
    whatsapp_group_invite_enabled: recordBoolean(raffle, "whatsapp_group_invite_enabled"),
    whatsapp_group_invite_url: safeText(recordValue(raffle, "whatsapp_group_invite_url"), 500),
    starts_at: recordString(raffle, "starts_at"),
    closes_at: recordString(raffle, "closes_at"),
    draw_at: recordString(raffle, "draw_at"),
    status,
    winner_number: resultVisible ? normalizeNumber(recordValue(raffle, "winner_number")) : "",
    no_winner_number: resultVisible ? normalizeNumber(recordValue(raffle, "no_winner_number")) : "",
    result_published_at: resultVisible ? recordString(raffle, "result_published_at") : "",
    no_winner_expires_at: resultVisible ? recordString(raffle, "no_winner_expires_at") : "",
    finalized_at: resultVisible ? recordString(raffle, "finalized_at") : "",
    link_enabled: true,
    show_in_store: recordBoolean(raffle, "show_in_store"),
    visible: true,
    selection_manually_closed: recordBoolean(raffle, "selection_manually_closed"),
  };
}

function occupiedNumbers(app, raffleId) {
  return findMany(
    app,
    "raffle_entries",
    'raffle = {:raffle} && status = "active"',
    "chosen_number",
    100,
    { raffle: raffleId },
  ).map((entry) => normalizeNumber(recordValue(entry, "chosen_number"))).filter(Boolean);
}

function parsePublicPayload(body) {
  const keys = bodyKeys(body);
  if (keys.some((key) => !["action", "store_slug", "raffle_slug"].includes(key))) return null;
  const action = safeText(bodyValue(body, "action"), 20);
  const storeSlug = safeSlug(bodyValue(body, "store_slug"));
  const raffleSlug = safeSlug(bodyValue(body, "raffle_slug"));
  if (!PUBLIC_ACTIONS.includes(action) || !storeSlug) return null;
  if (action === "detail" && !FIXED_SLUGS.includes(raffleSlug)) return null;
  return { action, storeSlug, raffleSlug };
}

function handlePublic(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parsePublicPayload(info && info.body || {});
    if (!payload) return unavailable(e);
    const app = e.app || $app;
    const store = findPublicStore(app, payload.storeSlug);
    if (!store) return unavailable(e);
    if (securityEnforcement.evaluatePublicAccess(app, e, store, "full_access", {}).blocked) return unavailable(e);
    const storeId = recordString(store, "id");

    let raffles = [];
    if (payload.action === "detail") {
      const raffle = findPublicRaffle(app, store, payload.raffleSlug);
      if (!raffle) return unavailable(e);
      raffles = [raffle];
    } else {
      raffles = findMany(
        app,
        "raffles",
        "store = {:store}",
        "slot_number,created,updated",
        10,
        { store: storeId },
      ).filter((raffle) => fixedRaffleAvailable(raffle, storeId, { home: true })).slice(0, 3);
      if (payload.action === "first") raffles = raffles.slice(0, 1);
    }

    const safeRaffles = raffles.map(publicRaffleRecord);
    const selected = raffles[0] || null;
    return e.json(200, {
      ok: true,
      raffles: safeRaffles,
      raffle: safeRaffles[0] || null,
      occupied_numbers: selected ? occupiedNumbers(app, recordString(selected, "id")) : [],
    });
  } catch (_) {
    return unavailable(e);
  }
}

function raffleAcceptsEntries(raffle) {
  if (!raffle || !recordBoolean(raffle, "is_configured") || !recordBoolean(raffle, "link_enabled")) return false;
  if (recordBoolean(raffle, "selection_manually_closed")) return false;
  if (LOCKED_STATUSES.includes(recordString(raffle, "status"))) return false;
  const now = Date.now();
  const startsAt = Date.parse(recordString(raffle, "starts_at"));
  const closesAt = Date.parse(recordString(raffle, "closes_at"));
  const drawAt = Date.parse(recordString(raffle, "draw_at"));
  if (Number.isFinite(startsAt) && startsAt > now) return false;
  if (!Number.isFinite(closesAt) || closesAt <= now) return false;
  if (Number.isFinite(drawAt) && drawAt <= now) return false;
  return true;
}

function activeEntry(app, raffleId, field, value) {
  const allowedField = field === "phone" ? "phone" : "chosen_number";
  return findFirst(
    app,
    "raffle_entries",
    `raffle = {:raffle} && status = "active" && ${allowedField} = {:value}`,
    { raffle: raffleId, value },
  );
}

function cancelledEntries(app, raffleId, phone) {
  return findMany(
    app,
    "raffle_entries",
    'raffle = {:raffle} && phone = {:phone} && status = "cancelled"',
    "-updated,-created",
    100,
    { raffle: raffleId, phone },
  );
}

function activeSettingsWhatsapp(app, storeId) {
  const settings = findFirst(
    app,
    "settings",
    "store = {:store} && active = true",
    { store: storeId },
  );
  return String(recordValue(settings, "whatsapp_number") || "").replace(/\D/g, "");
}

function receiptCode(storeSlug) {
  const prefix = safeSlug(storeSlug).split("-").filter(Boolean)
    .map((part) => part.charAt(0)).join("").slice(0, 3).toUpperCase() || "TS";
  let random = "";
  try { random = String($security.randomString(6) || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase(); } catch (_) {}
  if (random.length < 4) random = String(Date.now()).slice(-6);
  return `RF-${prefix}-${random}`;
}

function whatsappHref(whatsapp, storeName, raffleTitle, number, phone, receipt, raffleUrl) {
  const destination = String(whatsapp || "").replace(/\D/g, "");
  if (!destination) return "";
  const message = [
    `Hola ${safeText(storeName, 140)}, confirmo mi participación en la rifa.`,
    "",
    `Rifa: ${safeText(raffleTitle, 140)}`,
    `Número escogido: ${number}`,
    `Teléfono: ${phone}`,
    `Comprobante: ${receipt}`,
    `Link de la rifa: ${raffleUrl}`,
    "",
    "Gracias.",
  ].join("\n");
  return `https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
}

function receiptPayload(entry, raffle, store, whatsapp) {
  const storeSlug = recordString(store, "slug");
  const raffleSlug = recordString(raffle, "slug");
  const number = normalizeNumber(recordValue(entry, "chosen_number"));
  const phone = normalizePhone(recordValue(entry, "phone"));
  const receipt = safeText(recordValue(entry, "receipt_code"), 24);
  const raffleUrl = `/t/${encodeURIComponent(storeSlug)}/rifa/${encodeURIComponent(raffleSlug)}`;
  return {
    chosen_number: number,
    phone,
    receipt_code: receipt,
    created: recordString(entry, "created"),
    raffle_title: safeText(recordValue(raffle, "title"), 140),
    raffle_url: raffleUrl,
    whatsapp_url: whatsappHref(
      whatsapp,
      recordString(store, "name"),
      recordString(raffle, "title"),
      number,
      phone,
      receipt,
      raffleUrl,
    ),
  };
}

function saveEntry(app, store, raffle, phone, chosenNumber) {
  const collection = app.findCollectionByNameOrId("raffle_entries");
  const entry = new Record(collection);
  entry.set("store", recordString(store, "id"));
  entry.set("raffle", recordString(raffle, "id"));
  entry.set("phone", phone);
  entry.set("chosen_number", chosenNumber);
  entry.set("receipt_code", receiptCode(recordString(store, "slug")));
  entry.set("status", "active");
  app.save(entry);
  return entry;
}

function createEntryNotification(app, store, raffle, entry) {
  if (!raffleCapabilityAllowed(store)) return null;
  try {
    const notification = new Record(app.findCollectionByNameOrId("store_notifications"));
    notification.set("store", recordString(store, "id"));
    notification.set("type", "raffle_entry_created");
    notification.set("title", "Nueva participación en rifa");
    notification.set("message", `Nueva participación en rifa: número ${normalizeNumber(recordValue(entry, "chosen_number"))}`);
    notification.set("status", "unread");
    notification.set("priority", "normal");
    notification.set("target_url", `/t/${encodeURIComponent(recordString(store, "slug"))}/admin/promos/raffles`);
    notification.set("entity_collection", "raffle_entries");
    notification.set("entity_id", recordString(entry, "id"));
    notification.set("metadata_json", {
      raffle_id: recordString(raffle, "id"),
      chosen_number: normalizeNumber(recordValue(entry, "chosen_number")),
      source: "public_raffle",
    });
    app.save(notification);
    return notification;
  } catch (_) {
    return null;
  }
}

function parseEntryPayload(body) {
  const keys = bodyKeys(body);
  if (keys.some((key) => ![
    "storeSlug", "raffleSlug", "access_code", "chosen_number", "phone",
  ].includes(key))) return null;
  const storeSlug = safeSlug(bodyValue(body, "storeSlug"));
  const raffleSlug = safeSlug(bodyValue(body, "raffleSlug"));
  return {
    storeSlug,
    raffleSlug,
    accessCode: normalizeAccessCode(bodyValue(body, "access_code")),
    chosenNumber: normalizeNumber(bodyValue(body, "chosen_number")),
    phone: normalizePhone(bodyValue(body, "phone")),
  };
}

function handleEnter(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parseEntryPayload(info && info.body || {});
    if (!payload || !payload.storeSlug || !FIXED_SLUGS.includes(payload.raffleSlug)) return unavailable(e);
    if (!payload.chosenNumber) return invalid(e, "Escoge un número disponible antes de confirmar.", 400);
    if (!payload.phone) return invalid(e, "Escribe un número cubano válido de 8 dígitos.", 400);
    if (!payload.accessCode) return invalid(e, "Introduce el código exclusivo del grupo de WhatsApp.", 400);

    const app = e.app || $app;
    const store = findPublicStore(app, payload.storeSlug);
    if (!store) return unavailable(e);
    if (securityEnforcement.evaluatePublicAccess(app, e, store, "raffles", { phone: payload.phone }).blocked) return unavailable(e);
    const raffle = findPublicRaffle(app, store, payload.raffleSlug);
    if (!raffle) return unavailable(e);
    if (!raffleAcceptsEntries(raffle)) {
      return invalid(e, "La selección de números no está disponible para esta rifa.", 409);
    }
    if (normalizeAccessCode(recordValue(raffle, "access_code")) !== payload.accessCode) {
      return invalid(e, "Código del grupo incorrecto.", 403);
    }

    const raffleId = recordString(raffle, "id");
    const whatsapp = activeSettingsWhatsapp(app, recordString(store, "id"))
      || String(recordValue(store, "owner_phone") || "").replace(/\D/g, "");
    const existingPhone = activeEntry(app, raffleId, "phone", payload.phone);
    if (existingPhone) {
      return e.json(409, {
        ok: false,
        message: "Ya tienes una participación registrada en esta rifa.",
        reservedNumber: normalizeNumber(recordValue(existingPhone, "chosen_number")),
        receipt: receiptPayload(existingPhone, raffle, store, whatsapp),
      });
    }

    const cancelled = cancelledEntries(app, raffleId, payload.phone);
    const canReenter = cancelled.some((entry) => recordBoolean(entry, "can_reenter"));
    if (cancelled.length && !canReenter) {
      return e.json(403, {
        ok: false,
        message: "Tu participación fue cancelada por la tienda. Contacta con la tienda si crees que fue un error.",
        participationBlocked: true,
      });
    }
    if (activeEntry(app, raffleId, "chosen_number", payload.chosenNumber)) {
      return e.json(409, {
        ok: false,
        message: "Ese número acaba de ser reservado. Escoge otro.",
        occupiedNumber: payload.chosenNumber,
      });
    }

    let entry = null;
    try {
      entry = saveEntry(app, store, raffle, payload.phone, payload.chosenNumber);
    } catch (_) {
      const phoneConflict = activeEntry(app, raffleId, "phone", payload.phone);
      if (phoneConflict) {
        return e.json(409, {
          ok: false,
          message: "Ya tienes una participación registrada en esta rifa.",
          reservedNumber: normalizeNumber(recordValue(phoneConflict, "chosen_number")),
          receipt: receiptPayload(phoneConflict, raffle, store, whatsapp),
        });
      }
      if (activeEntry(app, raffleId, "chosen_number", payload.chosenNumber)) {
        return e.json(409, {
          ok: false,
          message: "Ese número acaba de ser reservado. Escoge otro.",
          occupiedNumber: payload.chosenNumber,
        });
      }
      return invalid(e, "No se pudo reservar el número. Intenta nuevamente.", 500);
    }

    cancelled.filter((item) => recordBoolean(item, "can_reenter")).forEach((item) => {
      item.set("can_reenter", false);
      item.set("reentry_allowed_at", "");
      app.save(item);
    });
    createEntryNotification(app, store, raffle, entry);
    const receipt = receiptPayload(entry, raffle, store, whatsapp);
    return e.json(200, {
      ok: true,
      message: "Número reservado correctamente.",
      selected_number: payload.chosenNumber,
      store_slug: recordString(store, "slug"),
      raffle_slug: recordString(raffle, "slug"),
      entry: {
        selected_number: payload.chosenNumber,
        raffle_slug: recordString(raffle, "slug"),
        store_slug: recordString(store, "slug"),
      },
      receipt,
      occupiedNumber: payload.chosenNumber,
    });
  } catch (_) {
    return unavailable(e);
  }
}

function parseStatusPayload(body) {
  const keys = bodyKeys(body);
  if (keys.some((key) => !["storeSlug", "raffleSlug", "phone", "receipt_code"].includes(key))) return null;
  return {
    storeSlug: safeSlug(bodyValue(body, "storeSlug")),
    raffleSlug: safeSlug(bodyValue(body, "raffleSlug")),
    phone: normalizePhone(bodyValue(body, "phone")),
  };
}

function handleStatus(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parseStatusPayload(info && info.body || {});
    if (!payload || !payload.storeSlug || !FIXED_SLUGS.includes(payload.raffleSlug)) return unavailable(e);
    if (!payload.phone) return invalid(e, "Escribe un número cubano válido de 8 dígitos.", 400);
    const app = e.app || $app;
    const store = findPublicStore(app, payload.storeSlug);
    if (!store) return unavailable(e);
    if (securityEnforcement.evaluatePublicAccess(app, e, store, "raffles", { phone: payload.phone }).blocked) return unavailable(e);
    const raffle = findPublicRaffle(app, store, payload.raffleSlug);
    if (!raffle) return unavailable(e);
    const raffleId = recordString(raffle, "id");
    const active = activeEntry(app, raffleId, "phone", payload.phone);
    const whatsapp = activeSettingsWhatsapp(app, recordString(store, "id"))
      || String(recordValue(store, "owner_phone") || "").replace(/\D/g, "");
    if (active) {
      return e.json(200, {
        ok: true,
        status: "active",
        message: "Ya tienes una participación registrada en esta rifa.",
        receipt: receiptPayload(active, raffle, store, whatsapp),
      });
    }
    const cancelled = cancelledEntries(app, raffleId, payload.phone);
    if (cancelled.some((entry) => recordBoolean(entry, "can_reenter"))) {
      return e.json(200, {
        ok: true,
        status: "reentry_allowed",
        message: "Puedes participar nuevamente. Escoge un número disponible.",
      });
    }
    if (cancelled.length) {
      const latest = cancelled[0];
      return e.json(200, {
        ok: true,
        status: "cancelled",
        message: "Tu participación fue cancelada por la tienda. Contacta con la tienda si crees que fue un error.",
        cancelled_at: recordString(latest, "cancelled_at") || recordString(latest, "updated"),
        participationBlocked: true,
      });
    }
    return e.json(200, { ok: true, status: "none" });
  } catch (_) {
    return unavailable(e);
  }
}

module.exports = {
  FIXED_SLUGS,
  activeEntry,
  createEntryNotification,
  findPublicRaffle,
  findPublicStore,
  fixedRaffleAvailable,
  handleEnter,
  handlePublic,
  handleStatus,
  occupiedNumbers,
  parseEntryPayload,
  parsePublicPayload,
  parseStatusPayload,
  publicRaffleRecord,
  raffleAcceptsEntries,
  raffleCapabilityAllowed,
  receiptPayload,
};
