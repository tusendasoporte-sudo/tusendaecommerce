/// <reference path="../pb_data/types.d.ts" />

const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);
const appAdmin = typeof __hooks === "undefined"
  ? require("./pz_storefront_app_admin_lib.js")
  : require(`${__hooks}/pz_storefront_app_admin_lib.js`);
const downloadAnalytics = typeof __hooks === "undefined"
  ? require("./pz_storefront_app_download_analytics_lib.js")
  : require(`${__hooks}/pz_storefront_app_download_analytics_lib.js`);

const PROFILES = "storefront_app_build_profiles";
const JOBS = "storefront_app_build_jobs";
const ARTIFACTS = "storefront_app_artifacts";
const APP_CONFIGS = "storefront_app_configs";
const BRAND_ASSETS = "storefront_app_brand_assets";
const UPDATE_TICKETS = "storefront_app_update_tickets";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const APP_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$/;
const BRAND_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const PROJECT_NUMBER_PATTERN = /^[0-9]{6,20}$/;
const VERSION_NAME_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ENGINE_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ENGINE_REVISION_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const WHATSAPP_NUMBER_PATTERN = /^[1-9][0-9]{7,14}$/;
const CERT_SHA256_PATTERN = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const FIREBASE_APP_ID_PATTERN = /^1:[0-9]{6,20}:android:[a-f0-9]{16,64}$/;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const BRAND_ASSET_NORMALIZER_PATTERN = /^[a-z0-9._-]{8,80}$/;
const BRAND_ASSET_FILE_PATTERN = /^(?:icon|splash)[-_][a-f0-9]{32}(?:_[A-Za-z0-9]{6,32})?\.png$/;
const BRAND_ASSET_MAX_BYTES = 8 * 1024 * 1024;
const ARTIFACT_MAX_BYTES = 100 * 1024 * 1024;
const DOWNLOAD_NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DOWNLOAD_CAPABILITY_PATTERN = /^[a-f0-9]{64}$/;
const BRAND_ASSET_PROFILES = Object.freeze({
  icon: Object.freeze({ width: 1024, height: 1024 }),
  splash: Object.freeze({ width: 1080, height: 1920 }),
});
const TENANT_BRAND_PALETTE = Object.freeze({
  deep_sapphire: "#2D185E", energy_cobalt: "#6847E8", flash_blue: "#7C5CFC",
  platinum: "#CEC7E8", luminous_ice: "#EEE9FF", pearl_white: "#FFFFFF",
  ink: "#21143D", secondary_text: "#625879", base_background: "#F5F1FF",
});
const POWERZONA_BRAND_PALETTE = Object.freeze({
  deep_sapphire: "#071F63", energy_cobalt: "#155EEB", flash_blue: "#4A8DFF",
  platinum: "#C7D0DE", luminous_ice: "#E9F1FF", pearl_white: "#FFFFFF",
  ink: "#081735", secondary_text: "#465574", base_background: "#F8FAFF",
});
const POWERZONA_ENGINE_BRAND_ASSETS = Object.freeze({
  icon: Object.freeze({
    source: "engine_brand", kind: "icon", file_name: "icon.png",
    sha256: "e284d6746df6e11f22c344eac4a117855c61cf8e737a51db3cec1d7415c8dadb",
    width: 1254, height: 1254, bytes: 1322043, normalizer_version: "engine-brand-v1",
  }),
  splash: Object.freeze({
    source: "engine_brand", kind: "splash", file_name: "splash.png",
    sha256: "6934893ef19c110e30facc2ef87eb1a91a26d4b0346cd190f90ea02f3f007bdf",
    width: 941, height: 1672, bytes: 1317923, normalizer_version: "engine-brand-v1",
  }),
});

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

function runnerSecret() {
  try { return text($os.getenv("PZ_STORE_APP_RUNNER_SECRET"), 512); } catch (_) { return ""; }
}

function requestHeader(e, name) {
  try {
    const headers = e.requestInfo().headers || {};
    if (typeof headers.get === "function") return text(headers.get(name), 512);
    const target = name.toLowerCase().replace(/-/g, "_");
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase().replace(/-/g, "_") === target);
    return key ? text(headers[key], 512) : "";
  } catch (_) { return ""; }
}

function secretEqual(left, right) {
  if (!left || !right || left.length < 32 || right.length < 32) return false;
  try { return $security.equal($security.sha256(left), $security.sha256(right)); } catch (_) { return false; }
}

function requireRunner(e) {
  setPrivateHeaders(e);
  if (!secretEqual(requestHeader(e, "x-pz-store-app-runner"), runnerSecret())) {
    return e.json(401, { ok: false, error: "unauthorized" });
  }
  return e.next();
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function exactPayload(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function text(value, max) {
  return String(value || "").trim().slice(0, max);
}

function environment(name, max) {
  try {
    if (typeof $os !== "undefined") return text($os.getenv(name), max);
  } catch (_) {}
  try {
    if (typeof process !== "undefined") return text(process.env[name], max);
  } catch (_) {}
  return "";
}

function downloadPublicOrigin() {
  const value = environment("PZ_STOREFRONT_APP_DOWNLOAD_PUBLIC_ORIGIN", 500).replace(/\/+$/, "");
  if (/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(value)) return value;
  if (/^http:\/\/(?:127\.0\.0\.1|localhost)(?::[0-9]{1,5})?$/.test(value)) return value;
  return "";
}

function downloadSecret() {
  const value = environment("PZ_STOREFRONT_APP_DOWNLOAD_SECRET", 512);
  return value.length >= 32 ? value : "";
}

function artifactDownloadCapability(artifact, profile, security) {
  const nonce = recordString(profile, "download_nonce", 64);
  const secret = downloadSecret();
  const artifactId = text(artifact && (artifact.id || recordString(artifact, "id", 15)), 15);
  const profileId = text(profile && (profile.id || recordString(profile, "id", 15)), 15);
  const fileName = recordString(artifact, "file_name", 220);
  const sha256 = recordString(artifact, "sha256", 64).toLowerCase();
  const bytes = recordNumber(artifact, "bytes");
  const versionCode = recordNumber(artifact, "version_code");
  const signer = security || (typeof $security !== "undefined" ? $security : null);
  if (!RECORD_ID_PATTERN.test(artifactId) || !RECORD_ID_PATTERN.test(profileId)
    || !DOWNLOAD_NONCE_PATTERN.test(nonce) || !/^[A-Za-z0-9._-]+$/.test(fileName)
    || !SHA256_PATTERN.test(sha256) || !Number.isSafeInteger(bytes) || bytes < 1
    || !Number.isSafeInteger(versionCode) || versionCode < 1
    || !secret || !signer || typeof signer.hs256 !== "function") return "";
  const digest = text(signer.hs256(
    `pz_storefront_app_download:v1|${profileId}|${artifactId}|${fileName}|${sha256}|${bytes}|${versionCode}|${nonce}`,
    secret
  ), 64).toLowerCase();
  return DOWNLOAD_CAPABILITY_PATTERN.test(digest) ? digest : "";
}

function artifactDownloadUrl(artifact, profile, options) {
  const origin = text(options && options.origin, 500).replace(/\/+$/, "") || downloadPublicOrigin();
  const capability = artifactDownloadCapability(artifact, profile, options && options.security);
  const artifactId = text(artifact && (artifact.id || recordString(artifact, "id", 15)), 15);
  const filename = recordString(artifact, "file_name", 220);
  if (!origin || !capability || !RECORD_ID_PATTERN.test(artifactId) || !/^[A-Za-z0-9._-]+$/.test(filename)) return "";
  return `${origin}/api/pz/storefront-app-downloads/${artifactId}/${capability}/${encodeURIComponent(filename)}`;
}

function artifactReleaseStatus(artifact) {
  const status = recordString(artifact, "release_status", 20);
  return ["candidate", "approved", "published"].includes(status) ? status : "";
}

function artifactIsPublished(artifact) {
  return artifactReleaseStatus(artifact) === "published";
}

function masterArtifactDownloadPath(artifact) {
  const id = text(artifact && (artifact.id || recordString(artifact, "id", 15)), 15);
  const filename = recordString(artifact, "file_name", 220);
  return RECORD_ID_PATTERN.test(id) && /^[A-Za-z0-9._-]+$/.test(filename)
    ? `/api/pz/master/storefront-app-artifacts/${id}/${encodeURIComponent(filename)}` : "";
}

function ensureProfileDownloadNonce(app, profile) {
  const current = recordString(profile, "download_nonce", 64);
  if (DOWNLOAD_NONCE_PATTERN.test(current)) return current;
  let generated = "";
  try { generated = text($security.randomString(43), 43); } catch (_) {}
  if (!DOWNLOAD_NONCE_PATTERN.test(generated)) throw new Error("download_link_generation_failed");
  profile.set("download_nonce", generated);
  app.save(profile);
  return generated;
}

function normalizeWhatsappNumber(value) {
  const raw = text(value, 60);
  if (!raw) return "";
  if (!/^[+0-9\s().-]+$/.test(raw)) return null;
  const normalized = raw.replace(/\D/g, "");
  return WHATSAPP_NUMBER_PATTERN.test(normalized) ? normalized : null;
}

function displayName(record, fallback) {
  const value = recordString(record, "display_name", 140)
    || recordString(record, "name", 140)
    || recordString(record, "email", 180)
    || fallback;
  return text(value, 140).replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function engineRelease() {
  const configuredVersion = environment("PZ_STOREFRONT_ENGINE_VERSION", 40);
  const configuredRevision = environment("PZ_STOREFRONT_ENGINE_REVISION", 40).toLowerCase();
  const configuredSeverity = environment("PZ_STOREFRONT_ENGINE_UPDATE_SEVERITY", 20).toLowerCase();
  return {
    version: ENGINE_VERSION_PATTERN.test(configuredVersion) ? configuredVersion : "1.0.0",
    revision: ENGINE_REVISION_PATTERN.test(configuredRevision) ? configuredRevision : "",
    severity: ["normal", "recommended", "critical"].includes(configuredSeverity)
      ? configuredSeverity
      : "recommended",
  };
}

function assertEngineReleaseConfigured() {
  const configuredVersion = environment("PZ_STOREFRONT_ENGINE_VERSION", 40);
  const configuredRevision = environment("PZ_STOREFRONT_ENGINE_REVISION", 40).toLowerCase();
  if (!ENGINE_VERSION_PATTERN.test(configuredVersion) || !ENGINE_REVISION_PATTERN.test(configuredRevision)) {
    throw new Error("engine_release_unconfigured");
  }
  return engineRelease();
}

function assertPreviewEngineRelease(preview) {
  const release = assertEngineReleaseConfigured();
  const engine = bodyValue(preview, "engine") || {};
  const targetVersion = text(bodyValue(engine, "target_version"), 40);
  const targetRevision = text(bodyValue(engine, "target_revision"), 40).toLowerCase();
  if (targetVersion !== release.version || targetRevision !== release.revision) {
    throw new Error("engine_release_changed");
  }
  return release;
}

function engineUpdateState(profile, release) {
  const target = release || engineRelease();
  if (!profile) return {
    status: "not_provisioned", available: false, severity: "none", reason: "no_app",
    current_version: "", current_revision: "", target_version: target.version, target_revision: target.revision,
  };
  const currentVersion = recordString(profile, "current_engine_version", 40);
  const currentRevision = recordString(profile, "current_engine_revision", 40).toLowerCase();
  const profileStatus = recordString(profile, "status", 30);
  if (!currentVersion && profileStatus !== "provisioned") return {
    status: "pending_first_build", available: false, severity: "none", reason: "first_build_pending",
    current_version: "", current_revision: "", target_version: target.version, target_revision: target.revision,
  };
  const versionChanged = currentVersion !== target.version;
  const revisionChanged = !versionChanged && !!target.revision && currentRevision !== target.revision;
  const available = !currentVersion || versionChanged || revisionChanged;
  return {
    status: available ? "update_available" : "current",
    available,
    severity: available ? target.severity : "none",
    reason: !currentVersion ? "engine_untracked" : versionChanged ? "version_changed" : revisionChanged ? "revision_changed" : "current",
    current_version: currentVersion,
    current_revision: currentRevision,
    target_version: target.version,
    target_revision: target.revision,
  };
}

function previewEngine(profile, approvedRelease) {
  const release = approvedRelease || engineRelease();
  const update = engineUpdateState(profile, release);
  return {
    target_version: release.version,
    target_revision: release.revision,
    current_version: update.current_version,
    current_revision: update.current_revision,
    update_available: update.available,
    update_reason: profile ? update.reason : "first_build",
    severity: release.severity,
    change_scope: "shared_native_engine",
  };
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

function recordNumber(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isFinite(value) ? value : 0;
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return text(value[0], 15);
  return text(value, 15);
}

function isoDate(value) {
  try { return plans.normalizedIso(value) || ""; } catch (_) { return ""; }
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function records(app, collection, filter, sort, limit, params) {
  try { return app.findRecordsByFilter(collection, filter, sort, limit, 0, params || {}); } catch (_) { return []; }
}

function isMaster(record) {
  return recordString(record, "role", 40) === "master_admin"
    && recordString(record, "status", 40).toLowerCase() !== "suspended";
}

function deliveryContact(record, fallbackName) {
  const normalized = normalizeWhatsappNumber(recordString(record, "phone", 60));
  return {
    user_id: text(record && (record.id || recordString(record, "id", 15)), 15),
    display_name: displayName(record, fallbackName || "Usuario"),
    whatsapp_number: normalized || "",
    configured: typeof normalized === "string" && !!normalized,
    phone_state: normalized === null ? "invalid" : normalized ? "configured" : "missing",
  };
}

function primaryAdminState(app, store) {
  const primaryId = relationId(store, "primary_admin_user");
  if (!primaryId) return {
    status: "missing_primary", user_id: "", display_name: "", whatsapp_number: "",
    configured: false, phone_state: "missing",
  };
  const primary = findRecord(app, "users", primaryId);
  if (!primary
    || recordString(primary, "role", 40) !== "store_admin"
    || relationId(primary, "store") !== store.id
    || recordString(primary, "status", 40).toLowerCase() === "suspended") {
    return {
      status: "invalid_primary", user_id: primaryId, display_name: displayName(primary, "Administrador principal"),
      whatsapp_number: "", configured: false, phone_state: "missing",
    };
  }
  const contact = deliveryContact(primary, "Administrador principal");
  return { status: contact.configured ? "ready" : "missing_whatsapp", ...contact };
}

function manualDeliveryState(app, store, actor) {
  return {
    mode: "manual_wa_me",
    automatic_send: false,
    cloud_api: false,
    attachment_mode: "manual",
    sender: deliveryContact(actor, "Master Admin"),
    recipient: primaryAdminState(app, store),
  };
}

function parseHttpsStoreUrl(value) {
  const raw = text(value, 500);
  return /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?\/t\/[a-z0-9][a-z0-9-]{1,62}$/.test(raw)
    && !raw.includes("..") ? raw : null;
}

function positiveVersionCode(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 2147483647 ? number : 0;
}

function parsePreviewPayload(body) {
  const operation = bodyValue(body, "operation");
  if (operation === "provision") {
    const keys = [
      "app_key", "brand_key", "display_name", "firebase_project_id", "include_aab",
      "operation", "package_name", "store_id", "store_url", "version_code", "version_name",
    ];
    if (!exactPayload(body, keys)) return null;
    const parsed = {
      operation,
      storeId: text(bodyValue(body, "store_id"), 15),
      appKey: text(bodyValue(body, "app_key"), 64),
      brandKey: text(bodyValue(body, "brand_key"), 64),
      displayName: text(bodyValue(body, "display_name"), 120),
      includeAab: bodyValue(body, "include_aab"),
      firebaseProjectId: text(bodyValue(body, "firebase_project_id"), 128),
      packageName: text(bodyValue(body, "package_name"), 190),
      storeUrl: parseHttpsStoreUrl(bodyValue(body, "store_url")),
      versionCode: positiveVersionCode(bodyValue(body, "version_code")),
      versionName: text(bodyValue(body, "version_name"), 40),
    };
    if (!RECORD_ID_PATTERN.test(parsed.storeId)
      || !APP_KEY_PATTERN.test(parsed.appKey)
      || !BRAND_KEY_PATTERN.test(parsed.brandKey)
      || !parsed.displayName
      || /[\u0000-\u001f\u007f]/.test(parsed.displayName)
      || typeof parsed.includeAab !== "boolean"
      || !PROJECT_ID_PATTERN.test(parsed.firebaseProjectId)
      || !PACKAGE_PATTERN.test(parsed.packageName)
      || !parsed.storeUrl
      || !parsed.versionCode
      || !VERSION_NAME_PATTERN.test(parsed.versionName)) return null;
    return parsed;
  }
  if (operation === "update") {
    const keys = ["display_name", "include_aab", "operation", "profile_id", "store_id", "version_code", "version_name"];
    if (!exactPayload(body, keys)) return null;
    const parsed = {
      operation,
      displayName: text(bodyValue(body, "display_name"), 120),
      includeAab: bodyValue(body, "include_aab"),
      storeId: text(bodyValue(body, "store_id"), 15),
      profileId: text(bodyValue(body, "profile_id"), 15),
      versionCode: positiveVersionCode(bodyValue(body, "version_code")),
      versionName: text(bodyValue(body, "version_name"), 40),
    };
    if (!RECORD_ID_PATTERN.test(parsed.storeId)
      || !RECORD_ID_PATTERN.test(parsed.profileId)
      || !parsed.displayName
      || /[\u0000-\u001f\u007f]/.test(parsed.displayName)
      || typeof parsed.includeAab !== "boolean"
      || !parsed.versionCode
      || !VERSION_NAME_PATTERN.test(parsed.versionName)) return null;
    return parsed;
  }
  return null;
}

function parseWhatsappSettingsPayload(body) {
  if (!exactPayload(body, ["whatsapp_number"])) return null;
  const whatsappNumber = normalizeWhatsappNumber(bodyValue(body, "whatsapp_number"));
  return whatsappNumber === null ? null : { whatsappNumber };
}

function parseWhatsappPreviewPayload(body) {
  if (!exactPayload(body, ["artifact_id", "store_id"])) return null;
  const parsed = {
    artifactId: text(bodyValue(body, "artifact_id"), 15),
    storeId: text(bodyValue(body, "store_id"), 15),
  };
  return RECORD_ID_PATTERN.test(parsed.artifactId) && RECORD_ID_PATTERN.test(parsed.storeId) ? parsed : null;
}

function parseWhatsappMarkedPayload(body) {
  if (!exactPayload(body, ["artifact_id", "confirmation", "message_sha256", "store_id"])) return null;
  const parsed = {
    artifactId: text(bodyValue(body, "artifact_id"), 15),
    confirmation: text(bodyValue(body, "confirmation"), 40),
    messageSha256: text(bodyValue(body, "message_sha256"), 64).toLowerCase(),
    storeId: text(bodyValue(body, "store_id"), 15),
  };
  return RECORD_ID_PATTERN.test(parsed.artifactId)
    && RECORD_ID_PATTERN.test(parsed.storeId)
    && SHA256_PATTERN.test(parsed.messageSha256)
    && parsed.confirmation === "MARCAR ENVIADO" ? parsed : null;
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("invalid_number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new TypeError("invalid_value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function hashPreview(preview, sha256) {
  const hash = sha256 || ((material) => $security.sha256(material));
  return String(hash(`pz_storefront_app_preview:v2|${canonicalJson(preview)}`) || "").trim().toLowerCase();
}

function profileSnapshot(profile) {
  if (!profile) return null;
  const release = engineRelease();
  return {
    id: text(profile.id || recordString(profile, "id", 15), 15),
    app_key: recordString(profile, "app_key", 64),
    display_name: recordString(profile, "display_name", 120),
    package_name: recordString(profile, "package_name", 190),
    store_url: recordString(profile, "store_url", 500),
    brand_key: recordString(profile, "brand_key", 64),
    distribution: recordString(profile, "distribution", 30),
    status: recordString(profile, "status", 30),
    firebase_project_id: recordString(profile, "firebase_project_id", 128),
    firebase_project_number: recordString(profile, "firebase_project_number", 20),
    firebase_app_id: recordString(profile, "firebase_app_id", 255),
    signing_cert_sha256: recordString(profile, "signing_cert_sha256", 95),
    upload_cert_sha256: recordString(profile, "upload_cert_sha256", 95),
    current_version_code: recordNumber(profile, "current_version_code"),
    current_version_name: recordString(profile, "current_version_name", 40),
    last_allocated_version_code: recordNumber(profile, "last_allocated_version_code"),
    current_engine_version: recordString(profile, "current_engine_version", 40),
    current_engine_revision: recordString(profile, "current_engine_revision", 40),
    icon_asset_id: relationId(profile, "icon_asset"),
    splash_asset_id: relationId(profile, "splash_asset"),
    origin: recordString(profile, "origin", 30) || "generated",
    branding_mode: recordString(profile, "branding_mode", 30) || "managed_assets",
    adopted_at: isoDate(recordValue(profile, "adopted_at")),
    ...appAdmin.profileAdminSnapshot(profile),
    engine_update: engineUpdateState(profile, release),
    created: isoDate(recordValue(profile, "created")),
    updated: isoDate(recordValue(profile, "updated")),
  };
}

function jobSnapshot(job) {
  const preview = recordValue(job, "preview_json");
  const deliveryStatus = recordString(job, "delivery_status", 30);
  return {
    id: text(job && (job.id || recordString(job, "id", 15)), 15),
    profile_id: relationId(job, "profile"),
    operation: recordString(job, "operation", 20),
    status: recordString(job, "status", 30),
    preview_hash: recordString(job, "preview_hash", 64),
    preview: preview && typeof preview === "object" ? preview : null,
    preview_expires_at: isoDate(recordValue(job, "preview_expires_at")),
    confirmed_at: isoDate(recordValue(job, "confirmed_at")),
    runner_id: recordString(job, "runner_id", 100),
    failure_code: recordString(job, "failure_code", 80),
    started_at: isoDate(recordValue(job, "started_at")),
    completed_at: isoDate(recordValue(job, "completed_at")),
    delivery_status: ["pending", "marked_sent"].includes(deliveryStatus) ? deliveryStatus : "",
    delivery_sender_id: relationId(job, "delivery_sender"),
    delivery_recipient_id: relationId(job, "delivery_recipient"),
    delivery_sender_whatsapp: recordString(job, "delivery_sender_whatsapp", 15),
    delivery_recipient_whatsapp: recordString(job, "delivery_recipient_whatsapp", 15),
    delivery_message_sha256: recordString(job, "delivery_message_sha256", 64),
    delivery_marked_at: isoDate(recordValue(job, "delivery_marked_at")),
    created: isoDate(recordValue(job, "created")),
    updated: isoDate(recordValue(job, "updated")),
  };
}

function artifactSnapshot(artifact, profile) {
  const releaseStatus = artifactReleaseStatus(artifact);
  const updateDeliveryStatus = artifactUpdateDeliveryStatus(artifact);
  const available = recordString(artifact, "file", 220)
    && recordString(artifact, "lifecycle_status", 30) === "available";
  return {
    id: text(artifact && (artifact.id || recordString(artifact, "id", 15)), 15),
    job_id: relationId(artifact, "job"),
    kind: recordString(artifact, "kind", 30),
    visibility: recordString(artifact, "visibility", 30),
    file_name: recordString(artifact, "file_name", 220),
    sha256: recordString(artifact, "sha256", 64),
    bytes: recordNumber(artifact, "bytes"),
    version_code: recordNumber(artifact, "version_code"),
    version_name: recordString(artifact, "version_name", 40),
    download_url: recordString(artifact, "kind", 30) === "apk"
      && recordString(artifact, "visibility", 30) === "store_delivery"
      && available
      && releaseStatus === "published"
      && updateDeliveryStatus === "active"
      ? artifactDownloadUrl(artifact, profile)
      : "",
    master_download_path: available && ["apk", "aab"].includes(recordString(artifact, "kind", 30))
      ? masterArtifactDownloadPath(artifact) : "",
    release_status: releaseStatus,
    update_delivery_status: updateDeliveryStatus,
    approved_at: isoDate(recordValue(artifact, "approved_at")),
    published_at: isoDate(recordValue(artifact, "published_at")),
    ...appAdmin.artifactAdminSnapshot(artifact),
    created: isoDate(recordValue(artifact, "created")),
  };
}

function artifactUpdateDeliveryStatus(artifact) {
  return recordString(artifact, "update_delivery_status", 20)
    || (artifactReleaseStatus(artifact) === "published" ? "active" : "");
}

function brandPalette(store) {
  return recordString(store, "slug", 80) === "powerzona"
    ? POWERZONA_BRAND_PALETTE
    : TENANT_BRAND_PALETTE;
}

function brandAssetSnapshot(asset) {
  if (!asset) return null;
  return {
    id: text(asset.id || recordString(asset, "id", 15), 15),
    kind: recordString(asset, "kind", 20),
    file_name: recordString(asset, "file", 220),
    sha256: recordString(asset, "sha256", 64).toLowerCase(),
    width: recordNumber(asset, "width"),
    height: recordNumber(asset, "height"),
    bytes: recordNumber(asset, "bytes"),
    source_format: recordString(asset, "source_format", 20),
    source_width: recordNumber(asset, "source_width"),
    source_height: recordNumber(asset, "source_height"),
    normalizer_version: recordString(asset, "normalizer_version", 80),
    status: recordString(asset, "status", 20),
    created: isoDate(recordValue(asset, "created")),
    updated: isoDate(recordValue(asset, "updated")),
  };
}

function validateBrandAssetRecord(asset, storeId, expectedKind, requireActive) {
  const snapshot = brandAssetSnapshot(asset);
  const profile = BRAND_ASSET_PROFILES[expectedKind];
  if (!snapshot || !profile
    || relationId(asset, "store") !== storeId
    || snapshot.kind !== expectedKind
    || (requireActive && snapshot.status !== "active")
    || !BRAND_ASSET_FILE_PATTERN.test(snapshot.file_name)
    || !SHA256_PATTERN.test(snapshot.sha256)
    || snapshot.width !== profile.width
    || snapshot.height !== profile.height
    || !Number.isInteger(snapshot.bytes) || snapshot.bytes < 1 || snapshot.bytes > BRAND_ASSET_MAX_BYTES
    || !["jpeg", "png", "webp"].includes(snapshot.source_format)
    || !BRAND_ASSET_NORMALIZER_PATTERN.test(snapshot.normalizer_version)) {
    throw new Error("brand_assets_required");
  }
  return snapshot;
}

function activeBrandAssetRecords(app, storeId) {
  const found = records(
    app,
    BRAND_ASSETS,
    "store = {:store} && status = 'active'",
    "+kind",
    3,
    { store: storeId },
  );
  const result = { icon: null, splash: null };
  found.forEach((asset) => {
    const kind = recordString(asset, "kind", 20);
    if (Object.prototype.hasOwnProperty.call(result, kind)) result[kind] = asset;
  });
  return result;
}

function inheritedBrandAsset(store, profile, kind) {
  if (!store || !profile
    || recordString(store, "slug", 80) !== "powerzona"
    || recordString(profile, "branding_mode", 30) !== "inherit_existing") return null;
  const asset = POWERZONA_ENGINE_BRAND_ASSETS[kind];
  return asset ? { ...asset } : null;
}

function activeBrandingState(app, store, profile) {
  const assets = activeBrandAssetRecords(app, store.id);
  let icon = null;
  let splash = null;
  try { icon = validateBrandAssetRecord(assets.icon, store.id, "icon", true); } catch (_) {}
  try { splash = validateBrandAssetRecord(assets.splash, store.id, "splash", true); } catch (_) {}
  const inheritedIcon = icon ? null : inheritedBrandAsset(store, profile, "icon");
  const inheritedSplash = splash ? null : inheritedBrandAsset(store, profile, "splash");
  return {
    ready: !!(icon || inheritedIcon) && !!(splash || inheritedSplash),
    managed_ready: !!icon && !!splash,
    inherited: !!inheritedIcon || !!inheritedSplash,
    normalizer_policy: {
      input: ["image/jpeg", "image/png", "image/webp"],
      icon: BRAND_ASSET_PROFILES.icon,
      splash: BRAND_ASSET_PROFILES.splash,
      fit: "contain_without_crop",
      metadata_removed: true,
    },
    palette: brandPalette(store),
    icon,
    splash,
    effective_icon: icon || inheritedIcon,
    effective_splash: splash || inheritedSplash,
  };
}

function requireUsableBranding(app, store, profile) {
  const recordsByKind = activeBrandAssetRecords(app, store.id);
  const assets = {};
  ["icon", "splash"].forEach((kind) => {
    try {
      assets[kind] = validateBrandAssetRecord(recordsByKind[kind], store.id, kind, true);
    } catch (_) {
      assets[kind] = inheritedBrandAsset(store, profile, kind);
    }
    if (!assets[kind]) throw new Error("brand_assets_required");
  });
  return {
    records: recordsByKind,
    snapshot: {
      palette: brandPalette(store),
      assets,
    },
  };
}

function assertPreviewBrandingCurrent(app, store, preview, requireActive, profile) {
  const branding = bodyValue(preview, "branding");
  const assets = bodyValue(branding, "assets");
  if (!preview || Number(bodyValue(preview, "schema_version")) !== 2 || !assets) throw new Error("brand_assets_required");
  const result = { icon: null, splash: null };
  ["icon", "splash"].forEach((kind) => {
    const expected = bodyValue(assets, kind);
    if (text(bodyValue(expected, "source"), 30) === "engine_brand") {
      const inherited = inheritedBrandAsset(store, profile, kind);
      if (!inherited
        || text(bodyValue(expected, "kind"), 20) !== kind
        || text(bodyValue(expected, "file_name"), 220) !== inherited.file_name
        || text(bodyValue(expected, "sha256"), 64).toLowerCase() !== inherited.sha256
        || Number(bodyValue(expected, "width")) !== inherited.width
        || Number(bodyValue(expected, "height")) !== inherited.height
        || Number(bodyValue(expected, "bytes")) !== inherited.bytes
        || text(bodyValue(expected, "normalizer_version"), 80) !== inherited.normalizer_version) {
        throw new Error("brand_assets_changed");
      }
      return;
    }
    const id = text(bodyValue(expected, "id"), 15);
    const asset = RECORD_ID_PATTERN.test(id) ? findRecord(app, BRAND_ASSETS, id) : null;
    const current = validateBrandAssetRecord(asset, store.id, kind, requireActive !== false);
    if (current.sha256 !== text(bodyValue(expected, "sha256"), 64).toLowerCase()
      || current.width !== Number(bodyValue(expected, "width"))
      || current.height !== Number(bodyValue(expected, "height"))
      || current.bytes !== Number(bodyValue(expected, "bytes"))
      || current.normalizer_version !== text(bodyValue(expected, "normalizer_version"), 80)) {
      throw new Error("brand_assets_changed");
    }
    result[kind] = asset;
  });
  return result;
}

function buildManualWhatsappPreview(store, profile, job, artifact, sender, recipient, sha256, downloadOptions) {
  if (!store || !profile || !job || !artifact || !sender || !recipient) throw new Error("delivery_not_ready");
  appAdmin.assertDistributionAvailable(profile, artifact);
  const senderPhone = normalizeWhatsappNumber(recordString(sender, "phone", 60));
  const recipientPhone = normalizeWhatsappNumber(recordString(recipient, "phone", 60));
  if (!senderPhone) throw new Error("master_whatsapp_required");
  if (!recipientPhone) throw new Error("primary_admin_whatsapp_required");
  if (recordString(recipient, "role", 40) !== "store_admin"
    || recordString(recipient, "status", 40).toLowerCase() === "suspended"
    || relationId(recipient, "store") !== store.id
    || relationId(store, "primary_admin_user") !== recipient.id) throw new Error("primary_admin_invalid");
  if (relationId(profile, "store") !== store.id
    || relationId(job, "store") !== store.id
    || relationId(job, "profile") !== profile.id
    || recordString(job, "status", 30) !== "succeeded"
    || relationId(artifact, "store") !== store.id
    || relationId(artifact, "profile") !== profile.id
    || relationId(artifact, "job") !== job.id
    || recordString(artifact, "kind", 30) !== "apk"
    || recordString(artifact, "visibility", 30) !== "store_delivery"
    || !artifactIsPublished(artifact)) throw new Error("apk_not_ready");
  if (artifactUpdateDeliveryStatus(artifact) !== "active") throw new Error("apk_not_ready");

  const storeName = recordString(store, "name", 140) || recordString(store, "slug", 80) || "tu tienda";
  const appName = recordString(profile, "display_name", 120) || storeName;
  const recipientName = displayName(recipient, "Administrador principal");
  const senderName = displayName(sender, "Master Admin");
  const versionName = recordString(artifact, "version_name", 40);
  const versionCode = recordNumber(artifact, "version_code");
  const fileName = recordString(artifact, "file_name", 220);
  const artifactSha256 = recordString(artifact, "sha256", 64).toLowerCase();
  const downloadUrl = artifactDownloadUrl(artifact, profile, downloadOptions);
  if (!VERSION_NAME_PATTERN.test(versionName) || !versionCode || !fileName || !SHA256_PATTERN.test(artifactSha256)
    || !recordString(artifact, "file", 220)) {
    throw new Error("apk_not_ready");
  }
  if (!downloadUrl) throw new Error("download_link_unconfigured");
  const firstPublication = recordString(job, "operation", 20) === "provision";
  const message = [
    `Hola ${recipientName}.`,
    "",
    `Tu Senda 84 tiene lista ${firstPublication ? "la primera versión" : "una actualización"} de ${appName} para ${storeName}.`,
    `Versión: ${versionName} (${versionCode})`,
    `Archivo: ${fileName}`,
    `Enlace permanente de esta versión: ${downloadUrl}`,
    `SHA-256: ${artifactSha256}`,
    "",
    "Instrucciones:",
    "1. Abre el enlace y descarga el APK físico.",
    "2. Confirma que el nombre y el SHA-256 coincidan exactamente con este mensaje.",
    firstPublication
      ? "3. Abre el APK. Si Android lo solicita, autoriza temporalmente esta fuente y desactiva el permiso al terminar."
      : "3. Abre el APK sin desinstalar la app actual; Android la actualizará conservando sus datos porque mantiene el mismo paquete y firma.",
    "4. Puedes compartir el enlace, pero cualquier persona que lo reciba podrá descargar esta versión mientras la distribución siga activa.",
    "",
    `Mensaje preparado por ${senderName} desde el panel Master de Tu Senda 84.`,
  ].join("\n");
  const material = {
    schema_version: 2,
    mode: "manual_wa_me",
    automatic_send: false,
    cloud_api: false,
    store_id: store.id,
    profile_id: profile.id,
    job_id: job.id,
    artifact_id: artifact.id,
    sender_user_id: sender.id,
    sender_whatsapp: senderPhone,
    recipient_user_id: recipient.id,
    recipient_whatsapp: recipientPhone,
    app_name: appName,
    version_code: versionCode,
    version_name: versionName,
    attachment_file_name: fileName,
    attachment_sha256: artifactSha256,
    attachment_required: false,
    download_url: downloadUrl,
    message,
  };
  const digest = String((sha256 || ((value) => $security.sha256(value)))(
    `pz_storefront_app_manual_whatsapp:v2|${canonicalJson(material)}`
  ) || "").trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) throw new Error("delivery_preview_hash_failed");
  return {
    ...material,
    message_sha256: digest,
    whatsapp_url: `https://wa.me/${recipientPhone}?text=${encodeURIComponent(message)}`,
    sender_warning: `Confirma que WhatsApp está abierto con el número ${senderPhone} antes de enviar.`,
  };
}

function runnerJobSnapshot(job, profile) {
  const preview = recordValue(job, "preview_json");
  return {
    id: job.id,
    operation: recordString(job, "operation", 20),
    preview_hash: recordString(job, "preview_hash", 64),
    preview,
    profile: profileSnapshot(profile),
  };
}

function assertPremium(store, now) {
  const state = plans.resolvePlanState(store, now || new Date());
  if (state.plan !== "premium" || state.isExpired || !state.capabilities.push_campaigns_enabled) {
    throw new Error("premium_required");
  }
}

function assertStoreUrlMatches(store, storeUrl) {
  const slug = recordString(store, "slug", 80);
  const match = /^https:\/\/[^/]+(\/t\/[a-z0-9][a-z0-9-]{1,62})$/.exec(storeUrl);
  if (!slug || !match || match[1] !== `/t/${slug}`) throw new Error("store_url_mismatch");
}

function assertDistribution(store, parsed) {
  if (!store || typeof parsed.includeAab !== "boolean") throw new Error("invalid_payload");
}

function assertUniqueIdentity(app, parsed) {
  if (findFirst(app, PROFILES, "app_key = {:appKey} || package_name = {:packageName} || firebase_project_id = {:projectId}", {
    appKey: parsed.appKey, packageName: parsed.packageName, projectId: parsed.firebaseProjectId,
  })) throw new Error("app_identity_already_used");
  const existing = findFirst(app, APP_CONFIGS, "app_key = {:appKey} || package_name = {:packageName} || firebase_project_id = {:projectId}", {
    appKey: parsed.appKey, packageName: parsed.packageName, projectId: parsed.firebaseProjectId,
  });
  if (!existing) return null;
  const sameExistingApp = relationId(existing, "store") === parsed.storeId
    && recordString(existing, "app_key", 64) === parsed.appKey
    && recordString(existing, "package_name", 190) === parsed.packageName
    && (!recordString(existing, "firebase_project_id", 128)
      || recordString(existing, "firebase_project_id", 128) === parsed.firebaseProjectId);
  if (!sameExistingApp) throw new Error("app_identity_already_used");
  return existing;
}

function buildPreview(store, parsed, profile, now, branding) {
  const generatedAt = new Date(now || Date.now());
  const approvedRelease = assertEngineReleaseConfigured();
  const brandAssets = bodyValue(branding, "assets");
  if (!branding || !brandAssets || !bodyValue(brandAssets, "icon") || !bodyValue(brandAssets, "splash")) {
    throw new Error("brand_assets_required");
  }
  const lockedBranding = {
    palette: bodyValue(branding, "palette") || brandPalette(store),
    assets: {
      icon: bodyValue(brandAssets, "icon"),
      splash: bodyValue(brandAssets, "splash"),
    },
  };
  if (parsed.operation === "provision") {
    assertStoreUrlMatches(store, parsed.storeUrl);
    assertDistribution(store, parsed);
    const createsAab = parsed.includeAab === true;
    return {
      schema_version: 2,
      operation: "provision",
      store: { id: parsed.storeId, slug: recordString(store, "slug", 80), name: recordString(store, "name", 140) },
      identity: {
        app_key: parsed.appKey, brand_key: parsed.brandKey, display_name: parsed.displayName,
        package_name: parsed.packageName, store_url: parsed.storeUrl,
      },
      engine: previewEngine(null, approvedRelease),
      branding: lockedBranding,
      firebase: {
        organization: "Tu Senda 84",
        project_id: parsed.firebaseProjectId,
        create_project: !parsed.existingAppConfigId,
        register_android_app: !parsed.existingAppConfigId,
        adopts_existing_app_config: !!parsed.existingAppConfigId,
      },
      signing: { create_app_signing_key: true, create_play_upload_key: createsAab, custodian: "Tu Senda 84" },
      build: { version_code: parsed.versionCode, version_name: parsed.versionName, apk: true, aab: createsAab },
      delivery: { admin_receives: ["apk", "checksums", "instructions"], master_only: createsAab ? ["aab", "build_manifest"] : ["build_manifest"] },
      irreversible_or_sensitive_steps: (parsed.existingAppConfigId
        ? []
        : ["create_firebase_project", "register_android_package"])
        .concat(["generate_app_signing_key"])
        .concat(createsAab ? ["generate_play_upload_key"] : []),
      generated_at: generatedAt.toISOString(),
    };
  }
  if (!profile || relationId(profile, "store") !== parsed.storeId) throw new Error("profile_not_found");
  appAdmin.assertBuildAllowed(profile);
  if (recordString(profile, "status", 30) !== "provisioned") throw new Error("profile_not_provisioned");
  const allocatedVersion = Math.max(
    recordNumber(profile, "current_version_code"),
    recordNumber(profile, "last_allocated_version_code"),
  );
  if (parsed.versionCode <= allocatedVersion) throw new Error("version_code_must_increase");
  const current = profileSnapshot(profile);
  const createsAab = current.distribution === "play_and_direct" || parsed.includeAab === true;
  const createsUploadKey = createsAab && !current.upload_cert_sha256;
  return {
    schema_version: 2,
    operation: "update",
    store: { id: parsed.storeId, slug: recordString(store, "slug", 80), name: recordString(store, "name", 140) },
    identity: {
      app_key: current.app_key, brand_key: current.brand_key, display_name: parsed.displayName,
      package_name: current.package_name, store_url: current.store_url,
    },
    engine: previewEngine(profile, approvedRelease),
    branding: lockedBranding,
    firebase: { organization: "Tu Senda 84", project_id: current.firebase_project_id, create_project: false, register_android_app: false },
    signing: { create_app_signing_key: false, create_play_upload_key: createsUploadKey, reuse_signing_cert_sha256: current.signing_cert_sha256, custodian: "Tu Senda 84" },
    build: { version_code: parsed.versionCode, version_name: parsed.versionName, apk: true, aab: createsAab },
    delivery: { admin_receives: ["apk", "checksums", "instructions"], master_only: createsAab ? ["aab", "build_manifest"] : ["build_manifest"] },
    immutable_identity: ["app_key", "package_name", "firebase_project_id", "firebase_app_id", "signing_cert_sha256"],
    irreversible_or_sensitive_steps: createsUploadKey ? ["generate_play_upload_key"] : [],
    generated_at: generatedAt.toISOString(),
  };
}

function createActivity(app, store, actor, action, job, summary) {
  return storeActivity.createActivity(app, {
    storeId: store.id,
    actor,
    module: "operation",
    action,
    severity: action === "app_build_preview_created" ? "important" : "critical",
    resourceType: "storefront_app_build",
    resourceId: job.id,
    resourceLabel: recordString(store, "name", 140) || "App de tienda",
    changedFields: ["app_build_status"],
    previousValues: {},
    newValues: { app_build_status: recordString(job, "status", 30) },
    summary,
    sourceEventKey: `storefront_app:${action}:${job.id}`,
  });
}

function managementReady(app) {
  try {
    const profiles = app.findCollectionByNameOrId(PROFILES);
    const jobs = app.findCollectionByNameOrId(JOBS);
    const artifacts = app.findCollectionByNameOrId(ARTIFACTS);
    return profiles.listRule === null
      && jobs.listRule === null
      && artifacts.listRule === null
      && app.findCollectionByNameOrId(BRAND_ASSETS).listRule === null
      && !!profiles.fields.getByName("current_engine_version")
      && !!profiles.fields.getByName("current_engine_revision")
      && !!profiles.fields.getByName("icon_asset")
      && !!profiles.fields.getByName("splash_asset")
      && !!profiles.fields.getByName("distribution_status")
      && !!profiles.fields.getByName("lifecycle_status")
      && !!profiles.fields.getByName("download_nonce")
      && !!profiles.fields.getByName("last_allocated_version_code")
      && !!profiles.fields.getByName("origin")
      && !!profiles.fields.getByName("branding_mode")
      && app.findCollectionByNameOrId(appAdmin.ACTIONS).listRule === null
      && !!artifacts.fields.getByName("lifecycle_status")
      && !!artifacts.fields.getByName("file")
      && !!artifacts.fields.getByName("release_status")
      && !!artifacts.fields.getByName("update_delivery_status")
      && app.findCollectionByNameOrId(UPDATE_TICKETS).listRule === null
      && !!jobs.fields.getByName("delivery_status")
      && !!jobs.fields.getByName("delivery_message_sha256")
      && !!app.findCollectionByNameOrId("stores").fields.getByName("primary_admin_user")
      && !!app.findCollectionByNameOrId("users").fields.getByName("phone")
      && !!app.findCollectionByNameOrId(APP_CONFIGS).fields.getByName("firebase_project_id");
  } catch (_) { return false; }
}

function updatePolicySnapshot(app, profile) {
  if (!profile) return {
    minimum_supported_version_code: 0,
    minimum_supported_version_name: "",
    release_state: "",
  };
  const appConfig = relationId(profile, "app_config")
    ? findRecord(app, APP_CONFIGS, relationId(profile, "app_config")) : null;
  const artifact = records(
    app,
    ARTIFACTS,
    "profile = {:profile} && kind = 'apk' && release_status = 'published' && lifecycle_status = 'available'",
    "-version_code",
    1,
    { profile: profile.id },
  )[0] || null;
  return {
    minimum_supported_version_code: recordNumber(appConfig, "min_supported_version_code"),
    minimum_supported_version_name: recordString(appConfig, "min_supported_version_name", 40),
    release_state: artifact ? artifactUpdateDeliveryStatus(artifact) : "",
  };
}

function detailResponse(app, store, actor, includeAnalytics) {
  const profile = findFirst(app, PROFILES, "store = {:store}", { store: store.id });
  const jobs = records(app, JOBS, "store = {:store}", "-created", 20, { store: store.id }).map(jobSnapshot);
  const artifacts = records(app, ARTIFACTS, "store = {:store}", "-created", 50, { store: store.id })
    .map((artifact) => artifactSnapshot(artifact, profile));
  const administrative = appAdmin.adminDetail(app, profile);
  const response = {
    ok: true,
    generated_at: new Date().toISOString(),
    store: {
      id: store.id,
      name: recordString(store, "name", 140),
      slug: recordString(store, "slug", 80),
      status: recordString(store, "status", 30) === "active" ? "active" : "suspended",
    },
    engine_release: engineRelease(),
    brand_assets: activeBrandingState(app, store, profile),
    manual_whatsapp_delivery: manualDeliveryState(app, store, actor),
    profile: profileSnapshot(profile),
    jobs,
    artifacts,
    update_policy: updatePolicySnapshot(app, profile),
    admin_actions: administrative.actions,
    policy: {
      firebase_project_per_store: true,
      signing_custodian: "Tu Senda 84",
      store_admin_delivery: ["apk", "checksums", "instructions"],
      aab_optional_for_storefront: true,
      aab_default_store_slug: "powerzona",
      aab_master_only: true,
      runner_isolated: true,
      web_store_independent: true,
    },
  };
  if (includeAnalytics === true) {
    response.download_analytics = downloadAnalytics.buildDownloadAnalytics(app, store.id, {
      includeMaster: true,
      now: new Date(),
    });
  }
  return response;
}

function engineUpdatesResponse(app, actor) {
  const release = engineRelease();
  const profiles = records(app, PROFILES, "status != 'retired' && lifecycle_status = 'active'", "-updated", 2000, {});
  const apps = profiles.map((profile) => {
    const publishedArtifact = records(
      app,
      ARTIFACTS,
      "profile = {:profile} && kind = 'apk' && lifecycle_status = 'available'",
      "-version_code",
      20,
      { profile: profile.id },
    ).find(artifactIsPublished);
    if (!publishedArtifact) return null;
    const update = engineUpdateState(profile, release);
    if (!update.available) return null;
    const store = findRecord(app, "stores", relationId(profile, "store"));
    if (!store) return null;
    return {
      store: {
        id: store.id,
        name: recordString(store, "name", 140),
        slug: recordString(store, "slug", 80),
      },
      profile_id: text(profile.id || recordString(profile, "id", 15), 15),
      app_key: recordString(profile, "app_key", 64),
      display_name: recordString(profile, "display_name", 120),
      app_version_code: recordNumber(profile, "current_version_code"),
      app_version_name: recordString(profile, "current_version_name", 40),
      engine_update: update,
      action_url: `/master/stores/${store.id}/app`,
    };
  }).filter(Boolean);
  const deliveries = profiles.map((profile) => {
    if (!appAdmin.profileAdminSnapshot(profile).downloads_allowed) return null;
    const artifact = records(
      app,
      ARTIFACTS,
      "profile = {:profile} && kind = 'apk' && visibility = 'store_delivery' && lifecycle_status = 'available'",
      "-version_code",
      50,
      { profile: profile.id },
    ).find(artifactIsPublished) || null;
    const job = artifact ? findRecord(app, JOBS, relationId(artifact, "job")) : null;
    if (!job || recordString(job, "delivery_status", 30) === "marked_sent") return null;
    const store = findRecord(app, "stores", relationId(profile, "store"));
    if (!artifact || !artifactIsPublished(artifact) || !store) return null;
    return {
      store: { id: store.id, name: recordString(store, "name", 140), slug: recordString(store, "slug", 80) },
      profile_id: profile.id,
      job_id: job.id,
      artifact_id: artifact.id,
      display_name: recordString(profile, "display_name", 120),
      version_code: recordNumber(artifact, "version_code"),
      version_name: recordString(artifact, "version_name", 40),
      file_name: recordString(artifact, "file_name", 220),
      recipient: primaryAdminState(app, store),
      action_url: `/master/stores/${store.id}/app?channel=publication#entrega-whatsapp`,
    };
  }).filter(Boolean);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    engine_release: release,
    total_apps: profiles.length,
    update_count: apps.length,
    critical_count: apps.filter((item) => item.engine_update.severity === "critical").length,
    apps,
    manual_whatsapp_sender: deliveryContact(actor, "Master Admin"),
    delivery_pending_count: deliveries.length,
    deliveries,
  };
}

function createPreviewJob(app, store, actor, parsed, profile, now, branding) {
  const preview = buildPreview(store, parsed, profile, now, branding);
  const previewHash = hashPreview(preview);
  if (!SHA256_PATTERN.test(previewHash)) throw new Error("preview_hash_failed");
  const collection = app.findCollectionByNameOrId(JOBS);
  const job = new Record(collection, {});
  job.set("store", store.id);
  job.set("profile", profile ? profile.id : "");
  job.set("operation", parsed.operation);
  job.set("status", "preview");
  job.set("preview_hash", previewHash);
  job.set("request_json", parsed);
  job.set("preview_json", preview);
  job.set("preview_expires_at", new Date(new Date(now || Date.now()).getTime() + PREVIEW_TTL_MS).toISOString());
  job.set("created_by", actor.id);
  app.save(job);
  return job;
}

function handleDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const body = info.body || {};
    const includesAnalyticsFlag = exactPayload(body, ["include_analytics", "store_id"]);
    if (!exactPayload(body, ["store_id"]) && !includesAnalyticsFlag) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }
    const storeId = text(bodyValue(info.body, "store_id"), 15);
    const includeAnalytics = includesAnalyticsFlag && bodyValue(body, "include_analytics") === true;
    if (!RECORD_ID_PATTERN.test(storeId) || (includesAnalyticsFlag && !includeAnalytics)) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    const store = findRecord($app, "stores", storeId);
    if (!store) return e.json(404, { ok: false, error: "store_not_found" });
    return e.json(200, detailResponse($app, store, info.auth, includeAnalytics));
  } catch (error) {
    return e.json(500, { ok: false, error: "app_build_detail_failed" });
  }
}

function integerBodyValue(body, key) {
  const raw = bodyValue(body, key);
  if (typeof raw === "number") return Number.isInteger(raw) ? raw : 0;
  const value = String(raw || "").trim();
  if (!/^[1-9][0-9]*$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function parseBrandAssetUpload(body) {
  const keys = [
    "bytes", "height", "kind", "normalizer_version", "sha256", "source_format",
    "source_height", "source_width", "store_id", "width",
  ];
  if (!exactPayload(body, keys)) return null;
  const parsed = {
    storeId: text(bodyValue(body, "store_id"), 15),
    kind: text(bodyValue(body, "kind"), 20),
    sha256: text(bodyValue(body, "sha256"), 64).toLowerCase(),
    width: integerBodyValue(body, "width"),
    height: integerBodyValue(body, "height"),
    bytes: integerBodyValue(body, "bytes"),
    sourceFormat: text(bodyValue(body, "source_format"), 20),
    sourceWidth: integerBodyValue(body, "source_width"),
    sourceHeight: integerBodyValue(body, "source_height"),
    normalizerVersion: text(bodyValue(body, "normalizer_version"), 80),
  };
  const profile = BRAND_ASSET_PROFILES[parsed.kind];
  if (!RECORD_ID_PATTERN.test(parsed.storeId) || !profile
    || !SHA256_PATTERN.test(parsed.sha256)
    || parsed.width !== profile.width || parsed.height !== profile.height
    || parsed.bytes < 1 || parsed.bytes > BRAND_ASSET_MAX_BYTES
    || !["jpeg", "png", "webp"].includes(parsed.sourceFormat)
    || parsed.sourceWidth < 1 || parsed.sourceWidth > 8000
    || parsed.sourceHeight < 1 || parsed.sourceHeight > 8000
    || !BRAND_ASSET_NORMALIZER_PATTERN.test(parsed.normalizerVersion)) return null;
  return parsed;
}

function uploadedFileName(file) {
  return text(file && (file.originalName || file.name), 220);
}

function uploadedFilePrefix(file, length) {
  let reader = null;
  try {
    reader = file && file.reader && typeof file.reader.open === "function" ? file.reader.open() : null;
    if (!reader) return [];
    if (typeof toBytes === "function") {
      const content = toBytes(reader);
      const output = [];
      for (let index = 0; index < Math.min(length, Number(content && content.length) || 0); index += 1) {
        output.push(Number(content[index]) & 255);
      }
      return output;
    }
    if (typeof readerToString === "function") {
      const content = readerToString(reader);
      return Array.from(content.slice(0, length)).map((character) => character.charCodeAt(0) & 255);
    }
    return [];
  } catch (_) { return []; }
  finally { try { if (reader && typeof reader.close === "function") reader.close(); } catch (_) {} }
}

function pngDimensions(file) {
  const bytes = uploadedFilePrefix(file, 24);
  if (bytes.length !== 24
    || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47
    || bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a
    || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const unsigned = (value) => Number(value) & 255;
  const width = (((unsigned(bytes[16]) * 256 + unsigned(bytes[17])) * 256 + unsigned(bytes[18])) * 256 + unsigned(bytes[19]));
  const height = (((unsigned(bytes[20]) * 256 + unsigned(bytes[21])) * 256 + unsigned(bytes[22])) * 256 + unsigned(bytes[23]));
  return width > 0 && height > 0 ? { width, height } : null;
}

function validateUploadedBrandAsset(file, parsed) {
  const dimensions = pngDimensions(file);
  if (!file || Number(file.size) !== parsed.bytes
    || !new RegExp(`^${parsed.kind}-[a-f0-9]{32}\\.png$`).test(uploadedFileName(file))
    || !dimensions || dimensions.width !== parsed.width || dimensions.height !== parsed.height) {
    throw new Error("brand_asset_invalid");
  }
}

function cancelUnconfirmedPreviews(app, storeId) {
  records(app, JOBS, "store = {:store} && status = 'preview'", "+created", 100, { store: storeId })
    .forEach((job) => {
      job.set("status", "canceled");
      job.set("failure_code", "brand_assets_changed");
      job.set("completed_at", new Date().toISOString());
      app.save(job);
    });
}

function handleBrandAssetUpload(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    const parsed = parseBrandAssetUpload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const files = Array.from(e.findUploadedFiles("file") || []);
    if (files.length !== 1) return e.json(400, { ok: false, error: "brand_asset_required" });
    validateUploadedBrandAsset(files[0], parsed);
    const store = findRecord($app, "stores", parsed.storeId);
    if (!store) return e.json(404, { ok: false, error: "store_not_found" });
    assertPremium(store, new Date());
    const existingProfile = findFirst($app, PROFILES, "store = {:store}", { store: store.id });
    if (existingProfile) appAdmin.assertBuildAllowed(existingProfile);
    const activeJob = findFirst($app, JOBS, "store = {:store} && (status = 'queued' || status = 'claimed')", { store: store.id });
    if (activeJob) throw new Error("active_job_exists");
    let created = null;
    $app.runInTransaction((app) => {
      const active = findFirst(app, BRAND_ASSETS, "store = {:store} && kind = {:kind} && status = 'active'", {
        store: store.id, kind: parsed.kind,
      });
      if (active) {
        active.set("status", "retired");
        app.save(active);
      }
      const asset = new Record(app.findCollectionByNameOrId(BRAND_ASSETS), {});
      asset.set("store", store.id);
      asset.set("kind", parsed.kind);
      asset.set("file", files[0]);
      asset.set("sha256", parsed.sha256);
      asset.set("width", parsed.width);
      asset.set("height", parsed.height);
      asset.set("bytes", parsed.bytes);
      asset.set("source_format", parsed.sourceFormat);
      asset.set("source_width", parsed.sourceWidth);
      asset.set("source_height", parsed.sourceHeight);
      asset.set("normalizer_version", parsed.normalizerVersion);
      asset.set("status", "active");
      asset.set("created_by", recordString(info.auth, "id", 15));
      app.save(asset);
      cancelUnconfirmedPreviews(app, store.id);
      created = asset;
    });
    const profile = findFirst($app, PROFILES, "store = {:store}", { store: store.id });
    return e.json(201, { ok: true, asset: brandAssetSnapshot(created), brand_assets: activeBrandingState($app, store, profile) });
  } catch (error) {
    const code = text(error && error.message, 80);
    if (["active_job_exists", "premium_required", "app_deletion_pending"].includes(code)) return e.json(409, { ok: false, error: code });
    if (code === "brand_asset_invalid") return e.json(400, { ok: false, error: code });
    return e.json(500, { ok: false, error: "brand_asset_upload_failed" });
  }
}

function serveBrandAsset(e, asset, disposition) {
  const filename = recordString(asset, "file", 220);
  const baseFilesPath = typeof asset.baseFilesPath === "function" ? text(asset.baseFilesPath(), 1000) : "";
  if (!baseFilesPath || baseFilesPath.includes("..") || !BRAND_ASSET_FILE_PATTERN.test(filename)) {
    throw new Error("brand_asset_not_found");
  }
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Content-Disposition", `${disposition}; filename=\"${filename}\"`);
    headers.set("X-PZ-Asset-SHA256", recordString(asset, "sha256", 64));
  } catch (_) {}
  let filesystem = null;
  try {
    filesystem = (e.app || $app).newFilesystem();
    return filesystem.serve(e.response, e.request, `${baseFilesPath}/${filename}`, filename);
  } finally { try { if (filesystem) filesystem.close(); } catch (_) {} }
}

function handleBrandAssetFile(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const assetId = text(e.request.pathValue("asset"), 15);
    const filename = text(e.request.pathValue("filename"), 220);
    const asset = RECORD_ID_PATTERN.test(assetId) ? findRecord(e.app || $app, BRAND_ASSETS, assetId) : null;
    if (!asset || relationId(asset, "store") === "" || filename !== recordString(asset, "file", 220)) {
      return e.json(404, { ok: false, error: "brand_asset_not_found" });
    }
    return serveBrandAsset(e, asset, "inline");
  } catch (_) { return e.json(404, { ok: false, error: "brand_asset_not_found" }); }
}

function handleRunnerBrandAssetFile(e) {
  setPrivateHeaders(e);
  try {
    const app = e.app || $app;
    const jobId = text(e.request.pathValue("job"), 15);
    const kind = text(e.request.pathValue("kind"), 20);
    const runnerId = requestHeader(e, "x-pz-store-app-runner-id");
    const job = RECORD_ID_PATTERN.test(jobId) ? findRecord(app, JOBS, jobId) : null;
    if (!job || !BRAND_ASSET_PROFILES[kind]
      || recordString(job, "status", 30) !== "claimed"
      || recordString(job, "runner_id", 100) !== runnerId) {
      return e.json(409, { ok: false, error: "job_not_claimed" });
    }
    const preview = storedPreviewValue(job);
    const branding = bodyValue(preview, "branding");
    const assets = bodyValue(branding, "assets");
    const expected = bodyValue(assets, kind);
    const assetId = text(bodyValue(expected, "id"), 15);
    const asset = RECORD_ID_PATTERN.test(assetId) ? findRecord(app, BRAND_ASSETS, assetId) : null;
    const snapshot = validateBrandAssetRecord(asset, relationId(job, "store"), kind, false);
    if (snapshot.sha256 !== text(bodyValue(expected, "sha256"), 64).toLowerCase()) throw new Error("brand_assets_changed");
    return serveBrandAsset(e, asset, "attachment");
  } catch (_) { return e.json(404, { ok: false, error: "brand_asset_not_found" }); }
}

function handleCancel(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    if (!exactPayload(info.body || {}, ["confirmation", "job_id"])) return e.json(400, { ok: false, error: "invalid_payload" });
    const jobId = text(bodyValue(info.body, "job_id"), 15);
    if (!RECORD_ID_PATTERN.test(jobId) || text(bodyValue(info.body, "confirmation"), 40) !== "CANCELAR TRABAJO") {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }
    let response = null;
    $app.runInTransaction((app) => {
      const actor = findRecord(app, "users", recordString(info.auth, "id", 15));
      const job = findRecord(app, JOBS, jobId);
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      const status = recordString(job, "status", 30);
      const legacyUnclaimed = status === "needs_attention"
        && recordString(job, "failure_code", 80) === "brand_assets_required";
      if (!job || (status !== "queued" && !legacyUnclaimed) || recordString(job, "runner_id", 100)) {
        throw new Error("job_not_cancelable");
      }
      const store = findRecord(app, "stores", relationId(job, "store"));
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      if (!store || !profile) throw new Error("profile_not_found");
      job.set("status", "canceled");
      job.set("failure_code", "canceled_by_master");
      job.set("completed_at", new Date().toISOString());
      if (recordString(job, "operation", 20) === "provision") {
        if (records(app, ARTIFACTS, "profile = {:profile}", "", 1, { profile: profile.id }).length) {
          throw new Error("job_not_cancelable");
        }
        job.set("profile", "");
        app.save(job);
        app.delete(profile);
        cancelUnconfirmedPreviews(app, store.id);
        response = { ok: true, job: jobSnapshot(job), profile: null };
      } else {
        app.save(job);
        response = { ok: true, job: jobSnapshot(job), profile: profileSnapshot(profile) };
      }
      createActivity(app, store, actor, "app_build_job_canceled", job, "Trabajo Android en cola cancelado por Master antes de ser reclamado por el runner");
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (["job_not_cancelable", "profile_not_found"].includes(code)) return e.json(409, { ok: false, error: code });
    return e.json(500, { ok: false, error: "app_build_cancel_failed" });
  }
}

function handleEngineUpdates(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    if (!exactPayload(info.body || {}, [])) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    return e.json(200, engineUpdatesResponse($app, info.auth));
  } catch (_) {
    return e.json(500, { ok: false, error: "engine_updates_failed" });
  }
}

function manualWhatsappPreviewFor(app, store, actor, artifactId) {
  const artifact = findRecord(app, ARTIFACTS, artifactId);
  if (!artifact || relationId(artifact, "store") !== store.id) throw new Error("apk_not_ready");
  const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
  const job = findRecord(app, JOBS, relationId(artifact, "job"));
  const primaryId = relationId(store, "primary_admin_user");
  if (!primaryId) throw new Error("primary_admin_required");
  const recipient = findRecord(app, "users", primaryId);
  if (!recipient) throw new Error("primary_admin_required");
  return {
    artifact,
    job,
    preview: buildManualWhatsappPreview(store, profile, job, artifact, actor, recipient),
    profile,
    recipient,
  };
}

function deliveryErrorCode(error) {
  const code = text(error && error.message, 80);
  return [
    "apk_not_ready", "delivery_not_ready", "delivery_preview_hash_failed", "download_link_unconfigured",
    "master_whatsapp_required", "primary_admin_required", "primary_admin_invalid",
    "primary_admin_whatsapp_required", "delivery_preview_mismatch", "delivery_already_marked",
    "app_distribution_withdrawn", "artifact_not_available",
  ].includes(code) ? code : "";
}

function handleWhatsappSettings(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseWhatsappSettingsPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const actor = findRecord($app, "users", info.auth.id);
    if (!isMaster(actor)) return e.json(403, { ok: false, error: "unauthorized" });
    actor.set("phone", parsed.whatsappNumber);
    $app.save(actor);
    return e.json(200, { ok: true, sender: deliveryContact(actor, "Master Admin") });
  } catch (_) {
    return e.json(500, { ok: false, error: "whatsapp_settings_failed" });
  }
}

function handleWhatsappPreview(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseWhatsappPreviewPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    const store = findRecord($app, "stores", parsed.storeId);
    if (!store) return e.json(404, { ok: false, error: "store_not_found" });
    assertPremium(store, new Date());
    const result = manualWhatsappPreviewFor($app, store, info.auth, parsed.artifactId);
    return e.json(200, { ok: true, preview: result.preview, job: jobSnapshot(result.job) });
  } catch (error) {
    const code = deliveryErrorCode(error);
    if (code) return e.json(409, { ok: false, error: code });
    if (text(error && error.message, 80) === "premium_required") return e.json(409, { ok: false, error: "premium_required" });
    return e.json(500, { ok: false, error: "whatsapp_preview_failed" });
  }
}

function handleWhatsappMarkedSent(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseWhatsappMarkedPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    let response = null;
    $app.runInTransaction((app) => {
      const store = findRecord(app, "stores", parsed.storeId);
      if (!store) throw new Error("store_not_found");
      assertPremium(store, new Date());
      const actor = findRecord(app, "users", info.auth.id);
      if (!isMaster(actor)) throw new Error("unauthorized");
      const result = manualWhatsappPreviewFor(app, store, actor, parsed.artifactId);
      if (result.preview.message_sha256 !== parsed.messageSha256) throw new Error("delivery_preview_mismatch");
      const existingStatus = recordString(result.job, "delivery_status", 30);
      if (existingStatus === "marked_sent") {
        const sameDelivery = recordString(result.job, "delivery_message_sha256", 64) === parsed.messageSha256
          && relationId(result.job, "delivery_sender") === actor.id
          && relationId(result.job, "delivery_recipient") === result.recipient.id;
        if (!sameDelivery) throw new Error("delivery_already_marked");
        response = { ok: true, job: jobSnapshot(result.job), preview: result.preview, idempotent: true };
        return;
      }
      result.job.set("delivery_status", "marked_sent");
      result.job.set("delivery_sender", actor.id);
      result.job.set("delivery_recipient", result.recipient.id);
      result.job.set("delivery_sender_whatsapp", result.preview.sender_whatsapp);
      result.job.set("delivery_recipient_whatsapp", result.preview.recipient_whatsapp);
      result.job.set("delivery_message_sha256", result.preview.message_sha256);
      result.job.set("delivery_marked_at", new Date().toISOString());
      app.save(result.job);
      storeActivity.createActivity(app, {
        storeId: store.id,
        actor,
        module: "operation",
        action: "app_update_whatsapp_marked_sent",
        severity: "important",
        resourceType: "storefront_app_build",
        resourceId: result.job.id,
        resourceLabel: recordString(store, "name", 140) || "App de tienda",
        changedFields: ["app_delivery_status"],
        previousValues: { app_delivery_status: existingStatus || "pending" },
        newValues: { app_delivery_status: "marked_sent" },
        summary: "El Master marcó como enviado manualmente el aviso de actualización por WhatsApp.",
        sourceEventKey: `storefront_app:whatsapp_marked_sent:${result.job.id}`,
      });
      response = { ok: true, job: jobSnapshot(result.job), preview: result.preview, idempotent: false };
    });
    return e.json(200, response);
  } catch (error) {
    const code = deliveryErrorCode(error);
    if (code) return e.json(409, { ok: false, error: code });
    const message = text(error && error.message, 80);
    if (["premium_required", "store_not_found"].includes(message)) return e.json(409, { ok: false, error: message });
    if (message === "unauthorized") return e.json(403, { ok: false, error: "unauthorized" });
    return e.json(500, { ok: false, error: "whatsapp_delivery_failed" });
  }
}

function parseAdoptionPayload(body) {
  const keys = [
    "app_key", "brand_key", "confirmation", "current_version_code", "current_version_name",
    "display_name", "firebase_project_id", "include_aab", "package_name", "signing_cert_sha256",
    "store_id", "store_url",
  ];
  if (!exactPayload(body, keys)) return null;
  const parsed = {
    storeId: text(bodyValue(body, "store_id"), 15),
    appKey: text(bodyValue(body, "app_key"), 64),
    brandKey: text(bodyValue(body, "brand_key"), 64),
    displayName: text(bodyValue(body, "display_name"), 120),
    includeAab: bodyValue(body, "include_aab"),
    firebaseProjectId: text(bodyValue(body, "firebase_project_id"), 128),
    packageName: text(bodyValue(body, "package_name"), 190),
    storeUrl: parseHttpsStoreUrl(bodyValue(body, "store_url")),
    versionCode: positiveVersionCode(bodyValue(body, "current_version_code")),
    versionName: text(bodyValue(body, "current_version_name"), 40),
    signingCertSha256: text(bodyValue(body, "signing_cert_sha256"), 95).toUpperCase(),
    confirmation: text(bodyValue(body, "confirmation"), 80),
  };
  if (!RECORD_ID_PATTERN.test(parsed.storeId) || !APP_KEY_PATTERN.test(parsed.appKey)
    || !BRAND_KEY_PATTERN.test(parsed.brandKey) || !parsed.displayName
    || typeof parsed.includeAab !== "boolean" || !PROJECT_ID_PATTERN.test(parsed.firebaseProjectId)
    || !PACKAGE_PATTERN.test(parsed.packageName) || !parsed.storeUrl || !parsed.versionCode
    || !VERSION_NAME_PATTERN.test(parsed.versionName) || !CERT_SHA256_PATTERN.test(parsed.signingCertSha256)
    || parsed.confirmation !== "ADOPTAR APP EXISTENTE") return null;
  return parsed;
}

function handleAdoptExisting(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseAdoptionPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    let response = null;
    $app.runInTransaction((app) => {
      const actor = findRecord(app, "users", recordString(info.auth, "id", 15));
      const store = findRecord(app, "stores", parsed.storeId);
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      if (!store) throw new Error("store_not_found");
      assertPremium(store, new Date());
      if (recordString(store, "slug", 80) !== "powerzona" || parsed.brandKey !== "powerzona") {
        throw new Error("adoption_not_supported");
      }
      assertStoreUrlMatches(store, parsed.storeUrl);
      assertDistribution(store, parsed);
      const existingProfile = findFirst(
        app,
        PROFILES,
        "app_key = {:appKey} || package_name = {:packageName} || firebase_project_id = {:projectId}",
        { appKey: parsed.appKey, packageName: parsed.packageName, projectId: parsed.firebaseProjectId },
      );
      if (existingProfile) {
        const sameProfile = relationId(existingProfile, "store") === parsed.storeId
          && recordString(existingProfile, "app_key", 64) === parsed.appKey
          && recordString(existingProfile, "package_name", 190) === parsed.packageName
          && (!recordString(existingProfile, "firebase_project_id", 128)
            || recordString(existingProfile, "firebase_project_id", 128) === parsed.firebaseProjectId);
        const configuredVersion = recordNumber(existingProfile, "current_version_code");
        const configuredCert = recordString(existingProfile, "signing_cert_sha256", 95);
        const lifecycle = recordString(existingProfile, "lifecycle_status", 30) || "active";
        if (!sameProfile || (configuredVersion && configuredVersion !== parsed.versionCode)
          || (configuredCert && configuredCert !== parsed.signingCertSha256)
          || lifecycle !== "active") throw new Error("existing_profile_incompatible");
        const activeJob = findFirst(
          app,
          JOBS,
          "profile = {:profile} && (status = 'preview' || status = 'queued' || status = 'claimed')",
          { profile: existingProfile.id },
        );
        if (activeJob) throw new Error("existing_profile_busy");
      }
      const appConfig = findFirst(
        app,
        APP_CONFIGS,
        "app_key = {:appKey} || package_name = {:packageName} || firebase_project_id = {:projectId}",
        { appKey: parsed.appKey, packageName: parsed.packageName, projectId: parsed.firebaseProjectId },
      );
      if (!appConfig || recordString(appConfig, "status", 30) !== "active") {
        throw new Error("existing_app_config_required");
      }
      const sameAppConfig = relationId(appConfig, "store") === parsed.storeId
        && recordString(appConfig, "app_key", 64) === parsed.appKey
        && recordString(appConfig, "package_name", 190) === parsed.packageName
        && (!recordString(appConfig, "firebase_project_id", 128)
          || recordString(appConfig, "firebase_project_id", 128) === parsed.firebaseProjectId);
      if (!sameAppConfig || (existingProfile && relationId(existingProfile, "app_config")
        && relationId(existingProfile, "app_config") !== appConfig.id)) {
        throw new Error("app_identity_already_used");
      }
      const wasAlreadyAdopted = !!existingProfile
        && recordString(existingProfile, "origin", 30) === "adopted_existing"
        && recordString(existingProfile, "branding_mode", 30) === "inherit_existing";
      const profile = existingProfile || new Record(app.findCollectionByNameOrId(PROFILES), {});
      profile.set("store", store.id);
      profile.set("app_config", appConfig.id);
      profile.set("app_key", parsed.appKey);
      profile.set("display_name", parsed.displayName);
      profile.set("package_name", parsed.packageName);
      profile.set("store_url", parsed.storeUrl);
      profile.set("brand_key", parsed.brandKey);
      profile.set("distribution", parsed.includeAab ? "play_and_direct" : "direct");
      profile.set("status", "provisioned");
      profile.set("origin", "adopted_existing");
      profile.set("branding_mode", "inherit_existing");
      if (!recordString(profile, "adopted_at", 40)) profile.set("adopted_at", new Date().toISOString());
      profile.set("distribution_status", "active");
      profile.set("lifecycle_status", "active");
      profile.set("firebase_project_id", parsed.firebaseProjectId);
      profile.set("firebase_project_number", recordString(appConfig, "firebase_project_number", 20));
      profile.set("firebase_app_id", recordString(appConfig, "firebase_app_id", 255));
      profile.set("signing_cert_sha256", parsed.signingCertSha256);
      profile.set("current_version_code", parsed.versionCode);
      profile.set("current_version_name", parsed.versionName);
      profile.set("last_allocated_version_code", parsed.versionCode);
      profile.set("current_engine_version", "1.0.0");
      profile.set("current_engine_revision", "");
      if (!relationId(profile, "created_by")) profile.set("created_by", actor.id);
      profile.set("updated_by", actor.id);
      app.save(profile);
      ensureProfileDownloadNonce(app, profile);
      appConfig.set("min_supported_version_code", 0);
      appConfig.set("min_supported_version_name", "");
      app.save(appConfig);
      storeActivity.createActivity(app, {
        storeId: store.id, actor, module: "operation", action: "storefront_app_existing_adopted",
        severity: "critical", resourceType: "storefront_app_build_profile", resourceId: profile.id,
        resourceLabel: parsed.displayName, changedFields: ["android_app_identity"], previousValues: {},
        newValues: { package_name: parsed.packageName, version_code: parsed.versionCode },
        summary: "El Master adoptó la identidad Android existente sin reconstruir ni publicar una APK.",
        sourceEventKey: `storefront_app:existing_adopted:${profile.id}`,
      });
      response = {
        ok: true,
        idempotent: wasAlreadyAdopted,
        profile: profileSnapshot(profile),
        update_policy: updatePolicySnapshot(app, profile),
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (code === "store_not_found") return e.json(404, { ok: false, error: code });
    if (["premium_required", "app_identity_already_used", "existing_app_config_required", "adoption_not_supported",
      "existing_profile_incompatible", "existing_profile_busy", "store_url_mismatch"].includes(code)) {
      return e.json(409, { ok: false, error: code });
    }
    return e.json(500, { ok: false, error: "app_adoption_failed" });
  }
}

function parseReleasePayload(body) {
  if (!exactPayload(body, ["action", "artifact_id", "confirmation", "store_id"])) return null;
  const parsed = {
    action: text(bodyValue(body, "action"), 40),
    artifactId: text(bodyValue(body, "artifact_id"), 15),
    confirmation: text(bodyValue(body, "confirmation"), 80),
    storeId: text(bodyValue(body, "store_id"), 15),
  };
  const confirmations = {
    approve_candidate: "APROBAR APK CLIENTES",
    publish_candidate: "PUBLICAR APK CLIENTES",
    require_update: "EXIGIR ACTUALIZACION CLIENTES",
    optional_update: "HACER OPCIONAL ACTUALIZACION CLIENTES",
    pause_update: "PAUSAR ACTUALIZACION CLIENTES",
    resume_update: "REANUDAR ACTUALIZACION CLIENTES",
    withdraw_update: "RETIRAR ACTUALIZACION CLIENTES",
  };
  const expected = confirmations[parsed.action] || "";
  if (!expected || parsed.confirmation !== expected
    || !RECORD_ID_PATTERN.test(parsed.artifactId) || !RECORD_ID_PATTERN.test(parsed.storeId)) return null;
  return parsed;
}

function handleReleaseAction(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseReleasePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    let response = null;
    $app.runInTransaction((app) => {
      const actor = findRecord(app, "users", recordString(info.auth, "id", 15));
      const store = findRecord(app, "stores", parsed.storeId);
      const artifact = findRecord(app, ARTIFACTS, parsed.artifactId);
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      if (!store) throw new Error("store_not_found");
      if (!artifact || relationId(artifact, "store") !== store.id
        || recordString(artifact, "kind", 30) !== "apk"
        || recordString(artifact, "visibility", 30) !== "store_delivery"
        || recordString(artifact, "lifecycle_status", 30) !== "available"
        || !recordString(artifact, "file", 220)) throw new Error("candidate_not_ready");
      const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
      const job = findRecord(app, JOBS, relationId(artifact, "job"));
      if (!profile || !job || relationId(profile, "store") !== store.id
        || relationId(job, "profile") !== profile.id
        || recordString(job, "status", 30) !== "succeeded") throw new Error("candidate_not_ready");
      appAdmin.assertBuildAllowed(profile);
      if (["publish_candidate", "require_update", "resume_update"].includes(parsed.action)) {
        assertPremium(store, new Date());
      }
      const previousStatus = artifactReleaseStatus(artifact);
      let idempotent = false;
      if (parsed.action === "approve_candidate") {
        if (previousStatus === "approved" || previousStatus === "published") {
          idempotent = true;
        } else if (previousStatus === "candidate") {
          artifact.set("release_status", "approved");
          artifact.set("approved_at", new Date().toISOString());
          artifact.set("approved_by", actor.id);
          app.save(artifact);
          createActivity(app, store, actor, "app_candidate_approved", job,
            "El Master aprobó el mismo APK probado; todavía no se habilitó el enlace público ni WhatsApp");
        } else {
          throw new Error("candidate_not_ready");
        }
      } else if (parsed.action === "publish_candidate") {
        if (previousStatus === "published") {
          idempotent = true;
        } else if (previousStatus !== "approved") {
          throw new Error("candidate_approval_required");
        } else {
          const preview = storedPreviewValue(job) || {};
          const build = bodyValue(preview, "build") || {};
          const engine = bodyValue(preview, "engine") || {};
          const identity = bodyValue(preview, "identity") || {};
          const versionCode = Number(bodyValue(build, "version_code"));
          const versionName = text(bodyValue(build, "version_name"), 40);
          const displayName = text(bodyValue(identity, "display_name"), 120);
          const engineVersion = text(bodyValue(engine, "target_version"), 40);
          const engineRevision = text(bodyValue(engine, "target_revision"), 40).toLowerCase();
          if (!Number.isSafeInteger(versionCode) || versionCode < 1
            || !VERSION_NAME_PATTERN.test(versionName)
            || !displayName
            || /[\u0000-\u001f\u007f]/.test(displayName)
            || !ENGINE_VERSION_PATTERN.test(engineVersion)
            || !ENGINE_REVISION_PATTERN.test(engineRevision)
            || versionCode !== recordNumber(artifact, "version_code")
            || versionName !== recordString(artifact, "version_name", 40)) throw new Error("candidate_not_ready");
          const brandAssets = assertPreviewBrandingCurrent(app, store, preview, false, profile);
          records(
            app,
            ARTIFACTS,
            "profile = {:profile} && kind = 'apk' && release_status = 'published' && id != {:artifact}",
            "-version_code",
            100,
            { profile: profile.id, artifact: artifact.id },
          ).forEach((previous) => {
            previous.set("update_delivery_status", "withdrawn");
            app.save(previous);
          });
          artifact.set("release_status", "published");
          artifact.set("update_delivery_status", "active");
          artifact.set("published_at", new Date().toISOString());
          artifact.set("published_by", actor.id);
          app.save(artifact);
          profile.set("current_version_code", versionCode);
          profile.set("current_version_name", versionName);
          profile.set("display_name", displayName);
          profile.set("current_engine_version", engineVersion);
          profile.set("current_engine_revision", engineRevision);
          if (brandAssets.icon) profile.set("icon_asset", brandAssets.icon.id);
          if (brandAssets.splash) profile.set("splash_asset", brandAssets.splash.id);
          profile.set("updated_by", actor.id);
          app.save(profile);
          const appConfig = relationId(profile, "app_config")
            ? findRecord(app, APP_CONFIGS, relationId(profile, "app_config")) : null;
          if (!appConfig) throw new Error("candidate_not_ready");
          appConfig.set("display_name", displayName);
          appConfig.set("min_supported_version_code", 0);
          appConfig.set("min_supported_version_name", "");
          app.save(appConfig);
          createActivity(app, store, actor, "app_candidate_published", job,
            "El Master publicó exactamente el APK aprobado como actualización opcional; se habilitaron su enlace permanente y la entrega por WhatsApp");
        }
      } else {
        if (previousStatus !== "published") throw new Error("release_not_available");
        const appConfig = relationId(profile, "app_config")
          ? findRecord(app, APP_CONFIGS, relationId(profile, "app_config")) : null;
        if (!appConfig) throw new Error("release_not_available");
        const state = artifactUpdateDeliveryStatus(artifact);
        const versionCode = recordNumber(artifact, "version_code");
        const versionName = recordString(artifact, "version_name", 40);
        if (parsed.action === "require_update") {
          if (state !== "active") throw new Error("release_not_available");
          idempotent = recordNumber(appConfig, "min_supported_version_code") === versionCode;
          appConfig.set("min_supported_version_code", versionCode);
          appConfig.set("min_supported_version_name", versionName);
          app.save(appConfig);
        } else if (parsed.action === "optional_update") {
          idempotent = recordNumber(appConfig, "min_supported_version_code") === 0;
          appConfig.set("min_supported_version_code", 0);
          appConfig.set("min_supported_version_name", "");
          app.save(appConfig);
        } else if (parsed.action === "pause_update") {
          if (state !== "active") throw new Error("release_not_available");
          artifact.set("update_delivery_status", "paused");
          appConfig.set("min_supported_version_code", 0);
          appConfig.set("min_supported_version_name", "");
          app.save(artifact);
          app.save(appConfig);
        } else if (parsed.action === "resume_update") {
          if (state !== "paused") throw new Error("release_not_available");
          artifact.set("update_delivery_status", "active");
          app.save(artifact);
        } else if (parsed.action === "withdraw_update") {
          if (!["active", "paused"].includes(state)) throw new Error("release_not_available");
          artifact.set("update_delivery_status", "withdrawn");
          appConfig.set("min_supported_version_code", 0);
          appConfig.set("min_supported_version_name", "");
          app.save(artifact);
          app.save(appConfig);
        }
        createActivity(app, store, actor, `app_${parsed.action}`, job,
          `El Master aplicó el control ${parsed.action} a la actualización de clientes sin reconstruir la APK`);
      }
      response = {
        ok: true,
        idempotent,
        artifact: artifactSnapshot(artifact, profile),
        job: jobSnapshot(job),
        profile: profileSnapshot(profile),
        update_policy: updatePolicySnapshot(app, profile),
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (code === "store_not_found") return e.json(404, { ok: false, error: code });
    if (["candidate_not_ready", "candidate_approval_required", "premium_required", "app_distribution_withdrawn",
      "artifact_not_available", "app_deletion_pending", "release_not_available"].includes(code)) {
      return e.json(409, { ok: false, error: code });
    }
    return e.json(500, { ok: false, error: "candidate_release_failed" });
  }
}

function knownError(error) {
  const code = text(error && error.message, 80);
  return [
    "premium_required", "store_url_mismatch", "app_identity_already_used", "profile_not_found",
    "profile_not_provisioned", "version_code_must_increase", "preview_expired",
    "preview_mismatch", "preview_not_confirmable", "active_job_exists",
    "brand_assets_required", "brand_assets_changed", "job_not_cancelable",
    "engine_release_unconfigured", "engine_release_changed", "app_deletion_pending", "candidate_pending",
  ].includes(code) ? code : "";
}

function handlePreview(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parsePreviewPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    const store = findRecord($app, "stores", parsed.storeId);
    if (!store) return e.json(404, { ok: false, error: "store_not_found" });
    assertPremium(store, new Date());
    const profile = parsed.operation === "update" ? findRecord($app, PROFILES, parsed.profileId) : null;
    if (profile) {
      const candidate = findFirst(
        $app,
        ARTIFACTS,
        "profile = {:profile} && kind = 'apk' && lifecycle_status = 'available' && (release_status = 'candidate' || release_status = 'approved')",
        { profile: profile.id },
      );
      if (candidate) throw new Error("candidate_pending");
    }
    if (parsed.operation === "provision") {
      const existingAppConfig = assertUniqueIdentity($app, parsed);
      parsed.existingAppConfigId = existingAppConfig ? existingAppConfig.id : "";
    }
    const existingJob = findFirst($app, JOBS, "store = {:store} && (status = 'queued' || status = 'claimed')", { store: store.id });
    if (existingJob) throw new Error("active_job_exists");
    const branding = requireUsableBranding($app, store, profile);
    const job = createPreviewJob($app, store, info.auth, parsed, profile, new Date(), branding.snapshot);
    createActivity($app, store, info.auth, "app_build_preview_created", job, "Vista previa de app creada por Master Admin; no se ejecutaron efectos externos");
    return e.json(200, { ok: true, job: jobSnapshot(job) });
  } catch (error) {
    const code = knownError(error);
    if (code) return e.json(409, { ok: false, error: code });
    return e.json(500, { ok: false, error: "app_build_preview_failed" });
  }
}

function parseStoredRequest(job) {
  const defaults = {
    operation: "", storeId: "", profileId: "", appKey: "", brandKey: "", displayName: "",
    includeAab: false, firebaseProjectId: "", packageName: "", storeUrl: "", versionCode: 0, versionName: "",
  };
  let value = null;
  if (job && typeof job.unmarshalJSONField === "function" && typeof DynamicModel !== "undefined") {
    try {
      const model = new DynamicModel(defaults);
      job.unmarshalJSONField("request_json", model);
      value = model;
    } catch (_) {}
  }
  if (!value) {
    const raw = recordValue(job, "request_json");
    try {
      value = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    } catch (_) { return null; }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.operation === "provision") {
    return parsePreviewPayload({
      operation: "provision",
      store_id: value.storeId,
      app_key: value.appKey,
      brand_key: value.brandKey,
      display_name: value.displayName,
      include_aab: value.includeAab === true,
      firebase_project_id: value.firebaseProjectId,
      package_name: value.packageName,
      store_url: value.storeUrl,
      version_code: value.versionCode,
      version_name: value.versionName,
    });
  }
  if (value.operation === "update") {
    const storedPreview = storedPreviewValue(job) || {};
    const storedIdentity = bodyValue(storedPreview, "identity") || {};
    return parsePreviewPayload({
      operation: "update",
      display_name: value.displayName || bodyValue(storedIdentity, "display_name"),
      include_aab: value.includeAab === true,
      store_id: value.storeId,
      profile_id: value.profileId,
      version_code: value.versionCode,
      version_name: value.versionName,
    });
  }
  return null;
}

function jsonObjectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      const normalized = JSON.parse(JSON.stringify(value));
      return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
    } catch (_) { return null; }
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) { return null; }
}

function storedPreviewValue(job) {
  if (job && typeof job.unmarshalJSONField === "function" && typeof DynamicModel !== "undefined") {
    try {
      const model = new DynamicModel({
        schema_version: 0, operation: "", store: {}, identity: {}, engine: {},
        branding: {}, firebase: {}, signing: {}, build: {}, delivery: {}, generated_at: "",
      });
      job.unmarshalJSONField("preview_json", model);
      return {
        schema_version: Number(model.schema_version), operation: text(model.operation, 20),
        store: jsonObjectValue(model.store) || {}, identity: jsonObjectValue(model.identity) || {},
        engine: jsonObjectValue(model.engine) || {}, branding: jsonObjectValue(model.branding) || {},
        firebase: jsonObjectValue(model.firebase) || {}, signing: jsonObjectValue(model.signing) || {},
        build: jsonObjectValue(model.build) || {}, delivery: jsonObjectValue(model.delivery) || {},
        generated_at: text(model.generated_at, 80),
      };
    } catch (_) {}
  }
  return recordValue(job, "preview_json");
}

function createProfile(app, store, actor, parsed, brandAssetRecords) {
  const collection = app.findCollectionByNameOrId(PROFILES);
  const profile = new Record(collection, {});
  profile.set("store", store.id);
  profile.set("app_config", parsed.existingAppConfigId || "");
  profile.set("app_key", parsed.appKey);
  profile.set("display_name", parsed.displayName);
  profile.set("package_name", parsed.packageName);
  profile.set("store_url", parsed.storeUrl);
  profile.set("brand_key", parsed.brandKey);
  profile.set("distribution", parsed.includeAab ? "play_and_direct" : "direct");
  profile.set("status", "queued");
  profile.set("origin", "generated");
  profile.set("branding_mode", "managed_assets");
  profile.set("distribution_status", "active");
  profile.set("lifecycle_status", "active");
  profile.set("firebase_project_id", parsed.firebaseProjectId);
  profile.set("icon_asset", brandAssetRecords && brandAssetRecords.icon ? brandAssetRecords.icon.id : "");
  profile.set("splash_asset", brandAssetRecords && brandAssetRecords.splash ? brandAssetRecords.splash.id : "");
  if (parsed.existingAppConfigId) {
    const existingAppConfig = findRecord(app, APP_CONFIGS, parsed.existingAppConfigId);
    const firebaseAppId = recordString(existingAppConfig, "firebase_app_id", 255);
    const projectNumberMatch = /^1:([0-9]{6,20}):android:/.exec(firebaseAppId);
    profile.set("firebase_app_id", firebaseAppId);
    profile.set("firebase_project_number", recordString(existingAppConfig, "firebase_project_number", 20)
      || (projectNumberMatch ? projectNumberMatch[1] : ""));
  }
  profile.set("current_version_code", 0);
  profile.set("current_version_name", "");
  profile.set("last_allocated_version_code", parsed.versionCode);
  profile.set("created_by", actor.id);
  profile.set("updated_by", actor.id);
  app.save(profile);
  return profile;
}

function handleConfirm(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    if (!exactPayload(info.body || {}, ["job_id", "preview_hash"])) return e.json(400, { ok: false, error: "invalid_payload" });
    const jobId = text(bodyValue(info.body, "job_id"), 15);
    const suppliedHash = text(bodyValue(info.body, "preview_hash"), 64).toLowerCase();
    if (!RECORD_ID_PATTERN.test(jobId) || !SHA256_PATTERN.test(suppliedHash)) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    $app.runInTransaction((app) => {
      const actor = findRecord(app, "users", recordString(info.auth, "id", 15));
      const job = findRecord(app, JOBS, jobId);
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      if (!job || recordString(job, "status", 30) !== "preview") throw new Error("preview_not_confirmable");
      if (relationId(job, "created_by") !== actor.id) throw new Error("preview_not_confirmable");
      if (recordString(job, "preview_hash", 64) !== suppliedHash) throw new Error("preview_mismatch");
      const expires = new Date(isoDate(recordValue(job, "preview_expires_at")));
      if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) throw new Error("preview_expired");
      const parsed = parseStoredRequest(job);
      if (!parsed) throw new Error("preview_not_confirmable");
      const store = findRecord(app, "stores", relationId(job, "store"));
      if (!store) throw new Error("store_not_found");
      assertPremium(store, new Date());
      const storedPreview = storedPreviewValue(job);
      assertPreviewEngineRelease(storedPreview);
      let profile = parsed.operation === "update" ? findRecord(app, PROFILES, parsed.profileId) : null;
      const brandAssetRecords = assertPreviewBrandingCurrent(app, store, storedPreview, true, profile);
      if (parsed.operation === "provision") {
        const existingAppConfig = assertUniqueIdentity(app, parsed);
        parsed.existingAppConfigId = existingAppConfig ? existingAppConfig.id : "";
        assertStoreUrlMatches(store, parsed.storeUrl);
        assertDistribution(store, parsed);
        profile = createProfile(app, store, actor, parsed, brandAssetRecords);
        job.set("profile", profile.id);
      } else {
        profile = findRecord(app, PROFILES, parsed.profileId);
        buildPreview(store, parsed, profile, new Date(), bodyValue(storedPreview, "branding"));
        if (parsed.includeAab && recordString(profile, "distribution", 30) === "direct") {
          profile.set("distribution", "play_and_direct");
        }
        profile.set("last_allocated_version_code", parsed.versionCode);
        profile.set("updated_by", actor.id);
        app.save(profile);
      }
      job.set("status", "queued");
      job.set("confirmed_by", actor.id);
      job.set("confirmed_at", new Date().toISOString());
      app.save(job);
      createActivity(app, store, actor, "app_build_preview_confirmed", job, "Vista previa confirmada por Master Admin y enviada al runner aislado");
      response = { ok: true, profile: profileSnapshot(profile), job: jobSnapshot(job) };
    });
    return e.json(200, response);
  } catch (error) {
    const code = knownError(error) || text(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: "unauthorized" });
    if (code === "store_not_found") return e.json(404, { ok: false, error: "store_not_found" });
    if (knownError(error)) return e.json(409, { ok: false, error: knownError(error) });
    return e.json(500, { ok: false, error: "app_build_confirmation_failed" });
  }
}

function handleRetry(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    if (!exactPayload(info.body || {}, ["job_id", "preview_hash"])) return e.json(400, { ok: false, error: "invalid_payload" });
    const jobId = text(bodyValue(info.body, "job_id"), 15);
    const suppliedHash = text(bodyValue(info.body, "preview_hash"), 64).toLowerCase();
    if (!RECORD_ID_PATTERN.test(jobId) || !SHA256_PATTERN.test(suppliedHash)) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    $app.runInTransaction((app) => {
      const actor = findRecord(app, "users", recordString(info.auth, "id", 15));
      const job = findRecord(app, JOBS, jobId);
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      if (!job || !["failed", "needs_attention"].includes(recordString(job, "status", 30))) {
        throw new Error("job_not_retryable");
      }
      if (recordString(job, "preview_hash", 64) !== suppliedHash) throw new Error("preview_mismatch");
      const active = findFirst(app, JOBS, "store = {:store} && id != {:job} && (status = 'queued' || status = 'claimed')", {
        store: relationId(job, "store"), job: job.id,
      });
      if (active) throw new Error("active_job_exists");
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      const store = findRecord(app, "stores", relationId(job, "store"));
      if (!profile || !store) throw new Error("profile_not_found");
      appAdmin.assertBuildAllowed(profile);
      assertPremium(store, new Date());
      const storedPreview = storedPreviewValue(job);
      assertPreviewEngineRelease(storedPreview);
      assertPreviewBrandingCurrent(app, store, storedPreview, true, profile);
      job.set("status", "queued");
      job.set("failure_code", "");
      job.set("runner_id", "");
      job.set("started_at", "");
      job.set("completed_at", "");
      job.set("confirmed_by", actor.id);
      job.set("confirmed_at", new Date().toISOString());
      profile.set("status", recordString(job, "operation", 20) === "provision" ? "queued" : "provisioned");
      profile.set("updated_by", actor.id);
      app.save(profile);
      app.save(job);
      createActivity(app, store, actor, "app_build_retry_confirmed", job, "Reanudación confirmada por Master Admin con la misma vista previa inmutable");
      response = { ok: true, profile: profileSnapshot(profile), job: jobSnapshot(job) };
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (["job_not_retryable", "preview_mismatch", "active_job_exists", "premium_required",
      "engine_release_unconfigured", "engine_release_changed", "app_deletion_pending"].includes(code)) {
      return e.json(409, { ok: false, error: code });
    }
    return e.json(500, { ok: false, error: "app_build_retry_failed" });
  }
}

function handleRunnerClaim(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!exactPayload(info.body || {}, ["runner_id"])) return e.json(400, { ok: false, error: "invalid_payload" });
    const runnerId = text(bodyValue(info.body, "runner_id"), 100);
    if (!/^[A-Za-z0-9._:-]{3,100}$/.test(runnerId)) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = { ok: true, job: null };
    $app.runInTransaction((app) => {
      const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      records(app, JOBS, "status = 'claimed' && started_at < {:staleBefore}", "+started_at", 50, { staleBefore })
        .forEach((staleJob) => {
          staleJob.set("status", "needs_attention");
          staleJob.set("failure_code", "runner_lease_expired");
          staleJob.set("completed_at", new Date().toISOString());
          app.save(staleJob);
          const staleProfile = findRecord(app, PROFILES, relationId(staleJob, "profile"));
          if (staleProfile) {
            staleProfile.set("status", "needs_attention");
            app.save(staleProfile);
          }
        });
      const job = records(app, JOBS, "status = 'queued'", "+created", 1, {})[0] || null;
      if (!job) return;
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      const store = findRecord(app, "stores", relationId(job, "store"));
      if (!profile || !store) throw new Error("profile_not_found");
      appAdmin.assertBuildAllowed(profile);
      try {
        assertPreviewBrandingCurrent(app, store, storedPreviewValue(job), true, profile);
      } catch (_) {
        job.set("status", "needs_attention");
        job.set("failure_code", "brand_assets_required");
        job.set("completed_at", new Date().toISOString());
        app.save(job);
        profile.set("status", "needs_attention");
        app.save(profile);
        return;
      }
      job.set("status", "claimed");
      job.set("runner_id", runnerId);
      job.set("started_at", new Date().toISOString());
      app.save(job);
      response = { ok: true, job: runnerJobSnapshot(job, profile) };
    });
    return e.json(200, response);
  } catch (_) {
    return e.json(500, { ok: false, error: "runner_claim_failed" });
  }
}

function artifactKindPolicy(kind) {
  const policies = {
    apk: { visibility: "store_delivery", maxBytes: ARTIFACT_MAX_BYTES, file: /\.apk$/i, zip: true },
    aab: { visibility: "master_only", maxBytes: ARTIFACT_MAX_BYTES, file: /\.aab$/i, zip: true },
    checksums: { visibility: "store_delivery", maxBytes: 1024 * 1024, file: /^SHA256SUMS\.txt$/, text: true },
    instructions: { visibility: "store_delivery", maxBytes: 1024 * 1024, file: /^INSTRUCCIONES\.txt$/, text: true },
    build_manifest: { visibility: "master_only", maxBytes: 1024 * 1024, file: /^build-manifest\.json$/, json: true },
  };
  return policies[kind] || null;
}

function parseRunnerArtifactUpload(body) {
  if (!exactPayload(body, ["bytes", "file_name", "job_id", "kind", "runner_id", "sha256", "visibility"])) return null;
  const parsed = {
    jobId: text(bodyValue(body, "job_id"), 15),
    runnerId: text(bodyValue(body, "runner_id"), 100),
    kind: text(bodyValue(body, "kind"), 30),
    visibility: text(bodyValue(body, "visibility"), 30),
    fileName: text(bodyValue(body, "file_name"), 220),
    sha256: text(bodyValue(body, "sha256"), 64).toLowerCase(),
    bytes: Number(bodyValue(body, "bytes")),
  };
  const policy = artifactKindPolicy(parsed.kind);
  if (!RECORD_ID_PATTERN.test(parsed.jobId)
    || !/^[A-Za-z0-9._:-]{3,100}$/.test(parsed.runnerId)
    || !policy || parsed.visibility !== policy.visibility
    || !/^[A-Za-z0-9._-]+$/.test(parsed.fileName) || !policy.file.test(parsed.fileName)
    || !SHA256_PATTERN.test(parsed.sha256)
    || !Number.isInteger(parsed.bytes) || parsed.bytes < 1 || parsed.bytes > policy.maxBytes) return null;
  return parsed;
}

function validateUploadedArtifact(file, parsed) {
  if (!file || uploadedFileName(file) !== parsed.fileName || Number(file.size) !== parsed.bytes) {
    throw new Error("artifact_upload_invalid");
  }
  const policy = artifactKindPolicy(parsed.kind);
  const prefix = uploadedFilePrefix(file, 64);
  if (!policy || prefix.length < 1) throw new Error("artifact_upload_invalid");
  if (policy.zip && (prefix.length < 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b
    || ![[0x03, 0x04], [0x05, 0x06], [0x07, 0x08]].some((pair) => prefix[2] === pair[0] && prefix[3] === pair[1]))) {
    throw new Error("artifact_upload_invalid");
  }
  if (policy.text && prefix.some((value) => value === 0)) throw new Error("artifact_upload_invalid");
  if (policy.json) {
    const first = prefix.find((value) => ![0x09, 0x0a, 0x0d, 0x20].includes(value));
    if (first !== 0x7b) throw new Error("artifact_upload_invalid");
  }
  return true;
}

function expectedArtifactKinds(job) {
  const preview = storedPreviewValue(job) || {};
  const build = bodyValue(preview, "build") || {};
  const expected = ["apk", "checksums", "instructions", "build_manifest"];
  if (bodyValue(build, "aab") === true) expected.push("aab");
  return expected;
}

function stagedArtifactMatches(artifact, parsed) {
  return relationId(artifact, "job") === parsed.jobId
    && recordString(artifact, "kind", 30) === parsed.kind
    && recordString(artifact, "visibility", 30) === parsed.visibility
    && recordString(artifact, "file_name", 220) === parsed.fileName
    && recordString(artifact, "sha256", 64).toLowerCase() === parsed.sha256
    && recordNumber(artifact, "bytes") === parsed.bytes
    && recordString(artifact, "lifecycle_status", 30) === "staged"
    && !!recordString(artifact, "file", 220);
}

function handleRunnerArtifactUpload(e) {
  setPrivateHeaders(e);
  try {
    if (!managementReady($app)) return e.json(503, { ok: false, error: "app_builds_unavailable" });
    const info = e.requestInfo();
    const parsed = parseRunnerArtifactUpload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    if (requestHeader(e, "x-pz-store-app-runner-id") !== parsed.runnerId) {
      return e.json(401, { ok: false, error: "unauthorized" });
    }
    const files = Array.from(e.findUploadedFiles("file") || []);
    if (files.length !== 1) return e.json(400, { ok: false, error: "artifact_file_required" });
    validateUploadedArtifact(files[0], parsed);
    const job = findRecord($app, JOBS, parsed.jobId);
    if (!job || recordString(job, "status", 30) !== "claimed"
      || recordString(job, "runner_id", 100) !== parsed.runnerId) {
      return e.json(409, { ok: false, error: "job_not_claimed" });
    }
    if (!expectedArtifactKinds(job).includes(parsed.kind)) {
      return e.json(409, { ok: false, error: "artifact_not_expected" });
    }
    const profile = findRecord($app, PROFILES, relationId(job, "profile"));
    const store = findRecord($app, "stores", relationId(job, "store"));
    if (!profile || !store || relationId(profile, "store") !== store.id) {
      return e.json(409, { ok: false, error: "profile_not_found" });
    }
    const existing = findFirst($app, ARTIFACTS, "job = {:job} && kind = {:kind}", {
      job: job.id, kind: parsed.kind,
    });
    if (existing) {
      if (!stagedArtifactMatches(existing, parsed)) {
        return e.json(409, { ok: false, error: "artifact_upload_conflict" });
      }
      return e.json(200, { ok: true, idempotent: true, artifact: artifactSnapshot(existing, profile) });
    }
    let created = null;
    $app.runInTransaction((app) => {
      const transactionJob = findRecord(app, JOBS, job.id);
      const transactionProfile = findRecord(app, PROFILES, profile.id);
      if (!transactionJob || !transactionProfile
        || recordString(transactionJob, "status", 30) !== "claimed"
        || recordString(transactionJob, "runner_id", 100) !== parsed.runnerId) throw new Error("job_not_claimed");
      ensureProfileDownloadNonce(app, transactionProfile);
      const build = bodyValue(storedPreviewValue(transactionJob) || {}, "build") || {};
      const artifact = new Record(app.findCollectionByNameOrId(ARTIFACTS), {});
      artifact.set("store", store.id);
      artifact.set("profile", transactionProfile.id);
      artifact.set("job", transactionJob.id);
      artifact.set("kind", parsed.kind);
      artifact.set("visibility", parsed.visibility);
      artifact.set("file_name", parsed.fileName);
      artifact.set("file", files[0]);
      artifact.set("storage_locator", "pocketbase_managed");
      artifact.set("sha256", parsed.sha256);
      artifact.set("bytes", parsed.bytes);
      artifact.set("version_code", Number(bodyValue(build, "version_code")));
      artifact.set("version_name", text(bodyValue(build, "version_name"), 40));
      artifact.set("lifecycle_status", "staged");
      app.save(artifact);
      created = artifact;
    });
    return e.json(201, { ok: true, idempotent: false, artifact: artifactSnapshot(created, profile) });
  } catch (error) {
    const code = text(error && error.message, 80);
    if (["artifact_upload_invalid", "artifact_file_required"].includes(code)) {
      return e.json(400, { ok: false, error: code });
    }
    if (["artifact_not_expected", "artifact_upload_conflict", "job_not_claimed", "profile_not_found"].includes(code)) {
      return e.json(409, { ok: false, error: code });
    }
    return e.json(500, { ok: false, error: "artifact_upload_failed" });
  }
}

function serveManagedArtifact(e, app, artifact, requestedName, isPublicApk) {
  const storedName = recordString(artifact, "file", 220);
  const baseFilesPath = typeof artifact.baseFilesPath === "function" ? text(artifact.baseFilesPath(), 1000) : "";
  if (!storedName || !/^[A-Za-z0-9._-]+$/.test(storedName) || !baseFilesPath || baseFilesPath.includes("..")) {
    throw new Error("artifact_file_unavailable");
  }
  const kind = recordString(artifact, "kind", 30);
  try {
    const headers = e.response.header();
    headers.set("Content-Type", kind === "apk"
      ? "application/vnd.android.package-archive" : "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename=\"${requestedName}\"`);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-PZ-Artifact-Kind", kind);
    headers.set("X-PZ-Artifact-SHA256", recordString(artifact, "sha256", 64));
    headers.set("X-PZ-APK-SHA256", recordString(artifact, "sha256", 64));
    headers.set("X-PZ-APK-Version-Code", String(recordNumber(artifact, "version_code")));
    headers.set("X-PZ-APK-Version-Name", recordString(artifact, "version_name", 40));
    if (!isPublicApk) headers.set("Cache-Control", "private, no-store, max-age=0");
  } catch (_) {}
  let filesystem = null;
  try {
    filesystem = app.newFilesystem();
    return filesystem.serve(e.response, e.request, `${baseFilesPath}/${storedName}`, requestedName);
  } finally { try { if (filesystem) filesystem.close(); } catch (_) {} }
}

function handleMasterArtifactDownload(e) {
  setPrivateHeaders(e);
  const notFound = () => e.json(404, { ok: false, error: "artifact_not_found" });
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth) || !managementReady(e.app || $app)) return notFound();
    const artifactId = text(e.request.pathValue("artifact"), 15);
    const requestedName = text(e.request.pathValue("filename"), 220);
    if (!RECORD_ID_PATTERN.test(artifactId) || !/^[A-Za-z0-9._-]+$/.test(requestedName)) return notFound();
    const app = e.app || $app;
    const artifact = findRecord(app, ARTIFACTS, artifactId);
    if (!artifact || !["apk", "aab"].includes(recordString(artifact, "kind", 30))
      || recordString(artifact, "lifecycle_status", 30) !== "available"
      || recordString(artifact, "file_name", 220) !== requestedName) return notFound();
    const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
    const job = findRecord(app, JOBS, relationId(artifact, "job"));
    if (!profile || !job || recordString(job, "status", 30) !== "succeeded"
      || relationId(job, "profile") !== profile.id) return notFound();
    downloadAnalytics.bestEffort(() => downloadAnalytics.recordDownloadStarted(
      app,
      artifact,
      "master",
      null,
      new Date(),
    ));
    return serveManagedArtifact(e, app, artifact, requestedName, false);
  } catch (_) {
    return notFound();
  }
}

function handleArtifactDownload(e) {
  setPrivateHeaders(e);
  const notFound = () => e.json(404, { ok: false, error: "apk_not_found" });
  try {
    if (!managementReady(e.app || $app)) return notFound();
    const artifactId = text(e.request.pathValue("artifact"), 15);
    const capability = text(e.request.pathValue("capability"), 64).toLowerCase();
    const requestedName = text(e.request.pathValue("filename"), 220);
    if (!RECORD_ID_PATTERN.test(artifactId) || !DOWNLOAD_CAPABILITY_PATTERN.test(capability)
      || !/^[A-Za-z0-9._-]+$/.test(requestedName)) return notFound();
    const app = e.app || $app;
    const artifact = findRecord(app, ARTIFACTS, artifactId);
    if (!artifact || recordString(artifact, "kind", 30) !== "apk"
      || recordString(artifact, "visibility", 30) !== "store_delivery"
      || recordString(artifact, "lifecycle_status", 30) !== "available"
      || !artifactIsPublished(artifact)
      || artifactUpdateDeliveryStatus(artifact) !== "active"
      || recordString(artifact, "file_name", 220) !== requestedName) return notFound();
    const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
    const job = findRecord(app, JOBS, relationId(artifact, "job"));
    if (!profile || !job || recordString(job, "status", 30) !== "succeeded"
      || relationId(job, "profile") !== profile.id) return notFound();
    appAdmin.assertDistributionAvailable(profile, artifact);
    const expected = artifactDownloadCapability(artifact, profile);
    if (!expected || !$security.equal(expected, capability)) return notFound();
    downloadAnalytics.bestEffort(() => downloadAnalytics.recordDownloadStarted(
      app,
      artifact,
      "shared_link",
      null,
      new Date(),
    ));
    return serveManagedArtifact(e, app, artifact, requestedName, true);
  } catch (_) {
    return notFound();
  }
}

function parseRunnerArtifact(value) {
  if (!exactPayload(value, ["bytes", "file_name", "kind", "sha256", "storage_locator", "visibility"])) return null;
  const parsed = {
    kind: text(bodyValue(value, "kind"), 30),
    visibility: text(bodyValue(value, "visibility"), 30),
    fileName: text(bodyValue(value, "file_name"), 220),
    storageLocator: text(bodyValue(value, "storage_locator"), 1000),
    sha256: text(bodyValue(value, "sha256"), 64).toLowerCase(),
    bytes: Number(bodyValue(value, "bytes")),
  };
  if (!["apk", "aab", "checksums", "instructions", "build_manifest"].includes(parsed.kind)
    || !["store_delivery", "master_only"].includes(parsed.visibility)
    || !/^[A-Za-z0-9._-]+$/.test(parsed.fileName)
    || parsed.storageLocator !== "pocketbase_managed"
    || !SHA256_PATTERN.test(parsed.sha256)
    || !Number.isInteger(parsed.bytes) || parsed.bytes < 1) return null;
  if (["apk", "checksums", "instructions"].includes(parsed.kind) && parsed.visibility !== "store_delivery") return null;
  if (["aab", "build_manifest"].includes(parsed.kind) && parsed.visibility !== "master_only") return null;
  return parsed;
}

function parseRunnerCompletion(body) {
  const keys = [
    "artifacts", "engine_revision", "engine_version", "failure_code", "firebase_app_id", "firebase_project_number", "job_id",
    "runner_id", "signing_cert_sha256", "status", "upload_cert_sha256",
  ];
  if (!exactPayload(body, keys)) return null;
  const parsed = {
    jobId: text(bodyValue(body, "job_id"), 15),
    runnerId: text(bodyValue(body, "runner_id"), 100),
    status: text(bodyValue(body, "status"), 30),
    failureCode: text(bodyValue(body, "failure_code"), 80),
    engineVersion: text(bodyValue(body, "engine_version"), 40),
    engineRevision: text(bodyValue(body, "engine_revision"), 40).toLowerCase(),
    firebaseProjectNumber: text(bodyValue(body, "firebase_project_number"), 20),
    firebaseAppId: text(bodyValue(body, "firebase_app_id"), 255),
    signingCertSha256: text(bodyValue(body, "signing_cert_sha256"), 95).toUpperCase(),
    uploadCertSha256: text(bodyValue(body, "upload_cert_sha256"), 95).toUpperCase(),
    artifacts: Array.isArray(bodyValue(body, "artifacts"))
      ? bodyValue(body, "artifacts").map(parseRunnerArtifact)
      : [],
  };
  if (!RECORD_ID_PATTERN.test(parsed.jobId)
    || !/^[A-Za-z0-9._:-]{3,100}$/.test(parsed.runnerId)
    || !["succeeded", "failed", "needs_attention"].includes(parsed.status)
    || parsed.artifacts.some((item) => !item)) return null;
  if (parsed.status !== "succeeded") {
    if (!/^[a-z0-9_:-]{3,80}$/.test(parsed.failureCode)
      || parsed.engineVersion || parsed.engineRevision || parsed.artifacts.length) return null;
    return parsed;
  }
  if (parsed.failureCode
    || !ENGINE_VERSION_PATTERN.test(parsed.engineVersion)
    || !ENGINE_REVISION_PATTERN.test(parsed.engineRevision)
    || !PROJECT_NUMBER_PATTERN.test(parsed.firebaseProjectNumber)
    || !FIREBASE_APP_ID_PATTERN.test(parsed.firebaseAppId)
    || !CERT_SHA256_PATTERN.test(parsed.signingCertSha256)) return null;
  const kinds = parsed.artifacts.map((item) => item.kind);
  if (new Set(kinds).size !== kinds.length
    || !["apk", "checksums", "instructions", "build_manifest"].every((kind) => kinds.includes(kind))) return null;
  return parsed;
}

function upsertAppConfig(app, profile, completion) {
  let appConfig = relationId(profile, "app_config")
    ? findRecord(app, APP_CONFIGS, relationId(profile, "app_config"))
    : null;
  if (!appConfig) appConfig = new Record(app.findCollectionByNameOrId(APP_CONFIGS), {});
  const storeUrl = recordString(profile, "store_url", 500);
  const prefixMatch = /^https:\/\/([^/]+)(\/t\/[a-z0-9][a-z0-9-]{1,62})$/.exec(storeUrl);
  if (!prefixMatch) throw new Error("store_url_mismatch");
  appConfig.set("store", relationId(profile, "store"));
  appConfig.set("app_key", recordString(profile, "app_key", 64));
  appConfig.set("display_name", recordString(profile, "display_name", 120));
  appConfig.set("package_name", recordString(profile, "package_name", 190));
  appConfig.set("firebase_project_id", recordString(profile, "firebase_project_id", 128));
  appConfig.set("firebase_project_number", completion.firebaseProjectNumber);
  appConfig.set("firebase_app_id", completion.firebaseAppId);
  appConfig.set("public_origin", `https://${prefixMatch[1]}`);
  appConfig.set("store_path_prefix", prefixMatch[2]);
  appConfig.set("status", "active");
  app.save(appConfig);
  return appConfig;
}

function handleRunnerComplete(e) {
  setPrivateHeaders(e);
  try {
    const parsed = parseRunnerCompletion(e.requestInfo().body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    $app.runInTransaction((app) => {
      const job = findRecord(app, JOBS, parsed.jobId);
      if (!job || recordString(job, "status", 30) !== "claimed"
        || recordString(job, "runner_id", 100) !== parsed.runnerId) throw new Error("job_not_claimed");
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      const store = findRecord(app, "stores", relationId(job, "store"));
      if (!profile || !store || relationId(profile, "store") !== store.id) throw new Error("profile_not_found");
      job.set("status", parsed.status);
      job.set("failure_code", parsed.failureCode);
      job.set("completed_at", new Date().toISOString());
      if (parsed.status === "succeeded") {
        const preview = storedPreviewValue(job) || {};
        assertPreviewBrandingCurrent(app, store, preview, true, profile);
        const build = bodyValue(preview, "build") || {};
        const targetEngine = bodyValue(preview, "engine") || {};
        const artifactKinds = parsed.artifacts.map((item) => item.kind);
        const expectsAab = bodyValue(build, "aab") === true;
        if (expectsAab && (!artifactKinds.includes("aab") || !CERT_SHA256_PATTERN.test(parsed.uploadCertSha256))) {
          throw new Error("play_artifacts_incomplete");
        }
        if (!expectsAab && artifactKinds.includes("aab")) throw new Error("unexpected_aab");
        if (text(bodyValue(targetEngine, "target_version"), 40) !== parsed.engineVersion
          || (text(bodyValue(targetEngine, "target_revision"), 40)
            && text(bodyValue(targetEngine, "target_revision"), 40) !== parsed.engineRevision)) {
          throw new Error("engine_release_mismatch");
        }
        const stagedArtifacts = records(app, ARTIFACTS, "job = {:job}", "+kind", 20, { job: job.id });
        if (stagedArtifacts.length !== parsed.artifacts.length) throw new Error("artifacts_not_stored");
        parsed.artifacts.forEach((item) => {
          const artifact = stagedArtifacts.find((candidate) => recordString(candidate, "kind", 30) === item.kind);
          if (!artifact || !stagedArtifactMatches(artifact, { ...item, jobId: job.id })
            || recordNumber(artifact, "version_code") !== Number(bodyValue(build, "version_code"))
            || recordString(artifact, "version_name", 40) !== text(bodyValue(build, "version_name"), 40)) {
            throw new Error("artifacts_not_stored");
          }
        });
        ensureProfileDownloadNonce(app, profile);
        profile.set("firebase_project_number", parsed.firebaseProjectNumber);
        profile.set("firebase_app_id", parsed.firebaseAppId);
        profile.set("signing_cert_sha256", parsed.signingCertSha256);
        profile.set("upload_cert_sha256", parsed.uploadCertSha256);
        profile.set("status", "provisioned");
        const appConfig = upsertAppConfig(app, profile, parsed);
        profile.set("app_config", appConfig.id);
        app.save(profile);
        stagedArtifacts.forEach((artifact) => {
          artifact.set("lifecycle_status", "available");
          if (recordString(artifact, "kind", 30) === "apk") {
            artifact.set("release_status", "candidate");
            artifact.set("approved_at", "");
            artifact.set("approved_by", "");
            artifact.set("published_at", "");
            artifact.set("published_by", "");
          }
          app.save(artifact);
        });
        job.set("delivery_status", "pending");
      } else {
        profile.set("status", "needs_attention");
        app.save(profile);
      }
      app.save(job);
      response = { ok: true, job: jobSnapshot(job), profile: profileSnapshot(profile) };
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (["job_not_claimed", "artifacts_not_stored"].includes(code)) return e.json(409, { ok: false, error: code });
    return e.json(500, { ok: false, error: "runner_completion_failed" });
  }
}

module.exports = {
  APP_CONFIGS,
  ARTIFACTS,
  BRAND_ASSETS,
  BRAND_ASSET_PROFILES,
  JOBS,
  PREVIEW_TTL_MS,
  PROFILES,
  assertEngineReleaseConfigured,
  assertPreviewEngineRelease,
  artifactDownloadCapability,
  artifactDownloadUrl,
  buildManualWhatsappPreview,
  buildPreview,
  canonicalJson,
  detailResponse,
  engineRelease,
  engineUpdateState,
  engineUpdatesResponse,
  handleConfirm,
  handleCancel,
  handleDetail,
  handleEngineUpdates,
  handleWhatsappMarkedSent,
  handleWhatsappPreview,
  handleWhatsappSettings,
  handleAdoptExisting,
  handleReleaseAction,
  handlePreview,
  handleRetry,
  handleBrandAssetFile,
  handleBrandAssetUpload,
  handleArtifactDownload,
  handleMasterArtifactDownload,
  handleRunnerClaim,
  handleRunnerArtifactUpload,
  handleRunnerBrandAssetFile,
  handleRunnerComplete,
  hashPreview,
  normalizeWhatsappNumber,
  parseAdoptionPayload,
  parsePreviewPayload,
  parseReleasePayload,
  parseWhatsappMarkedPayload,
  parseWhatsappPreviewPayload,
  parseWhatsappSettingsPayload,
  parseRunnerCompletion,
  parseRunnerArtifactUpload,
  profileSnapshot,
  requireAuthenticatedUser,
  requireRunner,
};
