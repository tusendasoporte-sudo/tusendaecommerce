const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const test = require("node:test");

global.__hooks = path.resolve(__dirname, "../pb_hooks");
global.$os = {
  getenv: (name) => {
    if (name === "PZ_SECURITY_HMAC_SECRET") return "s".repeat(48);
    if (name === "PZ_SECURITY_AES_KEY") return "a".repeat(32);
    return "";
  },
};
global.$security = {
  sha256: (value) => crypto.createHash("sha256").update(String(value)).digest("hex"),
  hs256: (value, secret) => crypto.createHmac("sha256", secret).update(String(value)).digest("hex"),
  encrypt: (value) => `cipher:${String(value)}`,
};
global.$app = { logger: () => ({ warn() {}, error() {} }) };

class MockRecord {
  constructor(collection, values = {}) {
    this._collection = collection;
    this.values = { ...values };
    this.id = values.id || "";
  }
  get(key) { return key === "id" ? this.id : this.values[key]; }
  getString(key) { return String(this.get(key) ?? ""); }
  getBool(key) { return this.get(key) === true; }
  set(key, value) {
    if (key === "id") this.id = String(value || "");
    else this.values[key] = value;
  }
  collection() { return this._collection; }
}
global.Record = MockRecord;

const monitoring = require("../pb_hooks/pz_security_monitoring_lib.js");
const activity = require("../pb_hooks/pz_store_activity_audit_lib.js");
monitoring.expireDueSecurityBlocks = () => ({ expired: 0 });
const auditWrites = [];
activity.createActivity = (_app, input) => {
  const existing = auditWrites.find((item) => item.sourceEventKey === input.sourceEventKey);
  if (existing) return existing;
  const saved = { id: `audit${auditWrites.length + 1}`, ...input };
  auditWrites.push(saved);
  return saved;
};

const enforcement = require("../pb_hooks/pz_security_enforcement_lib.js");

function record(collection, values) {
  return new MockRecord({ name: collection }, values);
}

function hmac(domain, storeId, value) {
  return global.$security.hs256(`${domain}|${storeId}|${value}`, "s".repeat(48));
}

function fixture(options = {}) {
  const store = record("stores", {
    id: "storepremium001",
    slug: "tienda-premium",
    status: "active",
    plan: options.plan || "premium",
    plan_is_permanent: true,
    plan_started_at: "2026-08-01T00:00:00.000Z",
    plan_expires_at: "",
  });
  const deviceToken = "A".repeat(43);
  const deviceDigest = global.$security.sha256(deviceToken);
  const settings = record("store_security_settings", {
    id: "settings0000001",
    store: store.id,
    enabled: options.enabled !== false,
    mode: options.mode || "protection",
    manual_blocking_enabled: options.manual !== false,
    full_access_blocking_enabled: options.full !== false,
    notify_blocked_attempts: options.notify !== false,
    ip_visibility: options.ipVisibility || "hidden",
  });
  const block = record("store_security_blocks", {
    id: "securityblock01",
    store: store.id,
    customer: "customer0000001",
    scope: options.scope || "orders",
    status: options.status || "active",
    match_phone: options.match === "phone",
    match_device: options.match !== "phone",
    match_ip: false,
    match_mode: options.matchMode || "any",
    phone_hmac_values: [hmac("phone", store.id, "535551212")],
    device_hmac_values: [hmac("browser", store.id, deviceDigest)],
    ip_hmac_values: [],
    duration: "days_7",
    starts_at: options.startsAt || "2026-08-01T00:00:00.000Z",
    expires_at: options.expiresAt || "2026-08-20T00:00:00.000Z",
    revoked_at: options.revokedAt || "",
  });
  const data = {
    stores: [store],
    store_security_settings: [settings],
    store_security_blocks: [block],
    store_security_events: [],
    store_notifications: [],
    orders: [],
  };
  let sequence = 0;
  const app = {
    findCollectionByNameOrId(name) { return { name, fields: { getByName: () => ({}) } }; },
    findRecordById(collection, id) {
      const found = (data[collection] || []).find((item) => item.id === id);
      if (!found) throw new Error("not_found");
      return found;
    },
    findFirstRecordByFilter(collection, filter, params = {}) {
      const items = data[collection] || [];
      let found = null;
      if (collection === "store_security_settings") found = items.find((item) => item.get("store") === params.store);
      else if (collection === "store_security_events") found = items.find((item) => item.get("event_key") === params.eventKey);
      else if (collection === "store_notifications") found = items.find((item) => item.get("store") === params.store && item.get("entity_id") === params.event);
      else if (collection === "stores" && params.slug) found = items.find((item) => item.get("slug") === params.slug);
      else if (collection === "orders" && params.number) found = items.find((item) => item.get("receipt_token") === params.token && item.get("order_number") === params.number);
      else if (collection === "orders" && params.token) found = items.find((item) => item.get("review_token") === params.token);
      if (!found) throw new Error(`not_found:${collection}:${filter}`);
      return found;
    },
    findRecordsByFilter(collection) { return (data[collection] || []).slice(); },
    save(saved) {
      const collection = saved.collection().name;
      if (!saved.id) saved.id = `saved${String(++sequence).padStart(10, "0")}`.slice(0, 15);
      if (!(data[collection] || []).includes(saved)) data[collection].push(saved);
      return saved;
    },
  };
  const event = {
    app,
    auth: null,
    request: { header: { get: (name) => name.toLowerCase() === "cookie" ? `pz_client_device=${deviceToken}` : "" } },
    requestInfo: () => ({ headers: { "x-request-id": "same-request" }, body: {} }),
    realIP: () => options.realIp || "127.0.0.1",
  };
  return { app, block, data, event, settings, store };
}

test("BLOCKS03B: scopes de acciones, all_interactions y full_access son exactos", () => {
  assert.equal(enforcement._test.scopeApplies("orders", "orders"), true);
  assert.equal(enforcement._test.scopeApplies("orders", "reviews"), false);
  assert.equal(enforcement._test.scopeApplies("all_interactions", "orders"), true);
  assert.equal(enforcement._test.scopeApplies("all_interactions", "reviews"), true);
  assert.equal(enforcement._test.scopeApplies("all_interactions", "raffles"), true);
  assert.equal(enforcement._test.scopeApplies("all_interactions", "interactions"), true);
  assert.equal(enforcement._test.scopeApplies("all_interactions", "full_access"), false);
  assert.equal(enforcement._test.scopeApplies("full_access", "full_access"), true);
});

test("BLOCKS03B: visitantes y clientes autenticados son públicos; admin y master quedan fuera", () => {
  assert.equal(enforcement._test.isPublicConsumer({ requestInfo: () => ({}) }), true);
  assert.equal(enforcement._test.isPublicConsumer({ auth: record("users", { role: "customer" }) }), true);
  assert.equal(enforcement._test.isPublicConsumer({ auth: record("users", { role: "store_admin" }) }), false);
  assert.equal(enforcement._test.isPublicConsumer({ auth: record("users", { role: "master_admin" }) }), false);
});

test("BLOCKS03B: match any/all exige las señales seleccionadas y nunca bloquea sin señal", () => {
  const block = record("store_security_blocks", {
    match_phone: true,
    match_device: true,
    match_ip: false,
    match_mode: "all",
    phone_hmac_values: ["phone"],
    device_hmac_values: ["device"],
  });
  assert.equal(enforcement._test.signalMatches(block, { phone: "phone", device: "device", ip: "" }), true);
  assert.equal(enforcement._test.signalMatches(block, { phone: "phone", device: "", ip: "" }), false);
  block.set("match_mode", "any");
  assert.equal(enforcement._test.signalMatches(block, { phone: "phone", device: "", ip: "" }), true);
  block.set("match_phone", false);
  block.set("match_device", false);
  assert.equal(enforcement._test.signalMatches(block, { phone: "phone", device: "device", ip: "" }), false);
});

test("BLOCKS03B: respeta inicio, expiración y revocación", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  const { block } = fixture();
  assert.equal(enforcement._test.blockIsActive(block, now), true);
  block.set("starts_at", "2026-08-07T00:00:00.000Z");
  assert.equal(enforcement._test.blockIsActive(block, now), false);
  block.set("starts_at", "2026-08-01T00:00:00.000Z");
  block.set("expires_at", "2026-08-06T11:59:59.000Z");
  assert.equal(enforcement._test.blockIsActive(block, now), false);
  block.set("expires_at", "2026-08-20T00:00:00.000Z");
  block.set("revoked_at", "2026-08-06T10:00:00.000Z");
  assert.equal(enforcement._test.blockIsActive(block, now), false);
});

test("BLOCKS03B: protección efectiva bloquea, registra evento/auditoría/notificación una sola vez", () => {
  auditWrites.length = 0;
  const fx = fixture({ scope: "orders" });
  const now = new Date("2026-08-06T12:00:00.000Z");
  const first = enforcement.evaluatePublicAccess(fx.app, fx.event, fx.store, "orders", { now });
  const second = enforcement.evaluatePublicAccess(fx.app, fx.event, fx.store, "orders", { now });
  assert.equal(first.blocked, true);
  assert.equal(second.blocked, true);
  assert.equal(Object.hasOwn(first.signals, "normalizedIp"), false);
  assert.equal(Object.hasOwn(first.signals, "ipCapture"), false);
  assert.equal(fx.data.store_security_events.length, 1);
  assert.equal(fx.data.store_security_events[0].get("event_type"), "blocked_attempt");
  assert.equal(fx.data.store_security_events[0].get("decision"), "blocked");
  assert.equal(fx.data.store_notifications.length, 1);
  assert.equal(auditWrites.length, 1);
  assert.equal(auditWrites[0].sourceEventKey.startsWith("security:blocked_attempt:"), true);
  const publicText = JSON.stringify({
    notification: fx.data.store_notifications[0].values,
    audit: auditWrites[0],
  });
  assert.doesNotMatch(publicText, /535551212|A{43}|reason_internal|ciphertext/i);
});

test("BLOCKS03B: intento bloqueado conserva la captura segura de la IP real", () => {
  auditWrites.length = 0;
  const fx = fixture({ ipVisibility: "full", realIp: "8.8.8.8" });
  const result = enforcement.evaluatePublicAccess(
    fx.app,
    fx.event,
    fx.store,
    "orders",
    { now: new Date("2026-08-06T12:00:00.000Z") }
  );

  assert.equal(result.blocked, true);
  assert.equal(fx.data.store_security_events.length, 1);
  const event = fx.data.store_security_events[0];
  assert.equal(event.get("ip_masked"), "8.8.***.8");
  assert.equal(event.get("ip_encrypted"), "cipher:8.8.8.8");
  assert.equal(event.get("ip_family"), "ipv4");
  assert.equal(event.get("capture_status"), "complete");
});

test("BLOCKS03B: modo/configuración/capacidad y scope no aplicable no bloquean", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  for (const options of [
    { mode: "monitoring" },
    { enabled: false },
    { manual: false },
    { scope: "reviews" },
  ]) {
    const fx = fixture(options);
    assert.equal(enforcement.evaluatePublicAccess(fx.app, fx.event, fx.store, "orders", { now }).blocked, false);
  }

  const basic = fixture({ plan: "basic" });
  assert.equal(enforcement.evaluatePublicAccess(basic.app, basic.event, basic.store, "orders", { now }).blocked, true);
});

test("BLOCKS03B: full_access respeta su flag y el aislamiento por tienda", () => {
  const now = new Date("2026-08-06T12:00:00.000Z");
  const disabled = fixture({ scope: "full_access", full: false });
  assert.equal(enforcement.evaluatePublicAccess(disabled.app, disabled.event, disabled.store, "full_access", { now }).blocked, false);
  const enabled = fixture({ scope: "full_access", full: true });
  assert.equal(enforcement.evaluatePublicAccess(enabled.app, enabled.event, enabled.store, "full_access", { now }).blocked, true);
  const otherStore = record("stores", {
    id: "otherstore00001", slug: "otra", status: "active", plan: "premium", plan_is_permanent: true,
  });
  enabled.data.stores.push(otherStore);
  assert.equal(enforcement.evaluatePublicAccess(enabled.app, enabled.event, otherStore, "full_access", { now }).blocked, false);
});

test("BLOCKS03B: recibo y review token resuelven tienda y teléfono desde la orden almacenada", () => {
  const fx = fixture({ scope: "full_access", full: true, match: "phone" });
  const order = record("orders", {
    id: "order0000000001",
    store: fx.store.id,
    order_number: "PZ-84",
    receipt_token: "AbCdEfGhIjKlMnOp",
    review_token: "QrStUvWxYz012345",
    customer_phone: "+53 555 12 12",
  });
  fx.data.orders.push(order);
  const receipt = enforcement._test.resolvePublicAccessContext(fx.app, {
    order_number: "PZ-84", receipt_token: "AbCdEfGhIjKlMnOp",
  });
  const review = enforcement._test.resolvePublicAccessContext(fx.app, {
    review_token: "QrStUvWxYz012345",
  });
  assert.equal(receipt.store.id, fx.store.id);
  assert.equal(receipt.phone, "+53 555 12 12");
  assert.equal(review.store.id, fx.store.id);
  assert.equal(review.phone, "+53 555 12 12");
  assert.equal(enforcement.evaluatePublicAccess(
    fx.app, fx.event, receipt.store, "full_access", { phone: receipt.phone, now: new Date("2026-08-06T12:00:00.000Z") },
  ).blocked, true);
});

test("BLOCKS03B: contratos fuente cubren rutas directas, mutaciones y expiración por tienda", () => {
  const fs = require("node:fs");
  const read = (name) => fs.readFileSync(path.resolve(__dirname, name), "utf8");
  const hook = read("../pb_hooks/pz_security_enforcement.pb.js");
  const checkout = read("../pb_hooks/pz_order_pricing_lib.js");
  const raffles = read("../pb_hooks/pz_raffles_premium_lib.js");
  const monitoringSource = read("../pb_hooks/pz_security_monitoring_lib.js");
  const identitySource = read("../pb_hooks/pz_security_identity_lib.js");
  assert.match(hook, /\/api\/pz\/security\/public-access/);
  assert.match(hook, /onRecordCreateRequest[\s\S]*?"reviews"/);
  assert.match(hook, /onRecordCreateRequest[\s\S]*?"store_analytics_events"/);
  assert.match(hook, /onRecordsListRequest[\s\S]*?"orders"/);
  assert.match(hook, /onRecordViewRequest[\s\S]*?"products"/);
  assert.match(hook, /onFileDownloadRequest[\s\S]*?"settings"/);
  assert.match(checkout, /enforceAction\(e, parsed\.storeId, "orders"/);
  assert.ok(checkout.indexOf("enforceAction(e, parsed.storeId") < checkout.indexOf("existingCheckout(txApp, parsed)"));
  assert.equal((raffles.match(/evaluatePublicAccess\(app, e, store, "raffles"/g) || []).length, 2);
  assert.match(raffles, /evaluatePublicAccess\(app, e, store, "full_access"/);
  assert.match(monitoringSource, /function expireDueSecurityBlocks\(app, onlyStoreId\)/);
  assert.match(monitoringSource, /enforceAction\(e, payload\.storeId, "interactions"/);
  assert.match(identitySource, /enforceAction\(e, getRelationId\(order, "store"\), "orders"/);
});
