/// <reference path="../pb_data/types.d.ts" />

const deviceLib = typeof __hooks === "undefined"
  ? require("./pz_store_user_devices_lib.js")
  : require(`${__hooks}/pz_store_user_devices_lib.js`);

const adminPush = typeof __hooks === "undefined"
  ? require("./pz_admin_push_resilience_lib.js")
  : require(__hooks + "/pz_admin_push_resilience_lib.js");

const PROFILES = "admin_app_release_profiles";
const JOBS = "admin_app_build_jobs";
const ARTIFACTS = "admin_app_artifacts";
const ASSIGNMENTS = "admin_app_release_assignments";
const TICKETS = "admin_app_download_tickets";
const EVENTS = "admin_app_release_events";
const BRAND_ASSETS = "admin_app_brand_assets";
const RUNNER_AGENTS = "admin_app_runner_agents";
const ENGINE_NAME = "Tu Senda 84 Admin Engine";
const ENGINE_VERSION = "2.0.0";
const ENGINE_CONTRACT_VERSION = 2;
const DEFAULT_ADMIN_API_BASE_URL = "https://api.tusenda84.com";
const CANONICAL_PROFILE_CHANNEL = "production";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CERT_PATTERN = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ENGINE_REVISION_PATTERN = /^[a-f0-9]{40}$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]+$/;
const RUNNER_PATTERN = /^[A-Za-z0-9._:-]{3,100}$/;
const HTTPS_ORIGIN_PATTERN = /^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const TICKET_TTL_MS = 2 * 60 * 1000;
const MAX_APK_BYTES = 100 * 1024 * 1024;
const MAX_BRAND_BYTES = 2 * 1024 * 1024;
const COLOR_PATTERN = /^#[A-F0-9]{6}$/;
const RUNNER_ONLINE_TTL_MS = 45 * 1000;
const RUNNER_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

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
  return String(value === undefined || value === null ? "" : value).trim().slice(0, max);
}

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : 0;
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try { return record.get(key); } catch (_) {}
  }
  return record[key];
}

function jsonObjectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try {
      const normalized = JSON.parse(JSON.stringify(value));
      return normalized && typeof normalized === "object" && !Array.isArray(normalized)
        ? normalized
        : null;
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
        schema_version: 0,
        app: "",
        channel: "",
        engine: {},
        operation: "",
        identity: {},
        build: {},
        appearance: {},
        notifications: {},
        delivery: {},
      });
      job.unmarshalJSONField("preview_json", model);
      return {
        schema_version: Number(model.schema_version),
        app: text(model.app, 40),
        channel: text(model.channel, 20),
        engine: jsonObjectValue(model.engine) || {},
        operation: text(model.operation, 20),
        identity: jsonObjectValue(model.identity) || {},
        build: jsonObjectValue(model.build) || {},
        appearance: jsonObjectValue(model.appearance) || {},
        notifications: jsonObjectValue(model.notifications) || {},
        delivery: jsonObjectValue(model.delivery) || {},
      };
    } catch (_) {}
  }
  return jsonObjectValue(recordValue(job, "preview_json"));
}

function recordString(record, key, max) {
  return text(recordValue(record, key), max || 10000);
}

function recordNumber(record, key) {
  return integer(recordValue(record, key));
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return text(value[0], 15);
  return text(value, 15);
}

function iso(value) {
  const raw = text(value, 80);
  if (!raw) return "";
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
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

function isMaster(record) {
  return recordString(record, "role", 30) === "master_admin"
    && recordString(record, "status", 30) === "active";
}

function isStoreAdmin(record) {
  return recordString(record, "role", 30) === "store_admin"
    && recordString(record, "status", 30) === "active"
    && RECORD_ID_PATTERN.test(relationId(record, "store"));
}

function requestHeader(e, name) {
  try {
    const info = e.requestInfo();
    const headers = info && info.headers;
    if (headers && typeof headers.get === "function") return text(headers.get(name), 512);
    const expected = name.toLowerCase().replace(/-/g, "_");
    const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase().replace(/-/g, "_") === expected);
    return key ? text(headers[key], 512) : "";
  } catch (_) { return ""; }
}

function runnerSecret() {
  try { return text($os.getenv("PZ_ADMIN_APP_RUNNER_SECRET"), 512); } catch (_) { return ""; }
}

function environment(name, max) {
  try { return text($os.getenv(name), max || 512); } catch (_) { return ""; }
}

function adminApiBaseUrl() {
  const configured = environment("PZ_ADMIN_API_BASE_URL", 500).replace(/\/+$/, "");
  const candidate = configured || DEFAULT_ADMIN_API_BASE_URL;
  if (!HTTPS_ORIGIN_PATTERN.test(candidate)) return "";
  const portMatch = candidate.match(/:([0-9]{1,5})$/);
  if (portMatch && (Number(portMatch[1]) < 1 || Number(portMatch[1]) > 65535)) return "";
  return candidate;
}

function secretEqual(left, right, security) {
  const source = security || (typeof $security !== "undefined" ? $security : null);
  if (!source || typeof source.sha256 !== "function" || typeof source.equal !== "function"
    || !left || !right || left.length < 32 || right.length < 32) return false;
  return source.equal(source.sha256(left), source.sha256(right));
}

function requireRunner(e) {
  setPrivateHeaders(e);
  if (!secretEqual(requestHeader(e, "x-pz-admin-app-runner"), runnerSecret())) {
    return e.json(401, { ok: false, error: "unauthorized" });
  }
  return e.next();
}

function findRecord(app, collection, id) {
  if (!RECORD_ID_PATTERN.test(text(id, 15))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function records(app, collection, filter, sort, limit, params) {
  try { return app.findRecordsByFilter(collection, filter || "", sort || "", limit || 100, 0, params || {}) || []; }
  catch (_) { return []; }
}

function first(app, collection, filter, params, sort) {
  return records(app, collection, filter, sort || "", 1, params)[0] || null;
}

function createRecord(app, collection, values) {
  const record = new Record(app.findCollectionByNameOrId(collection), {});
  Object.keys(values || {}).forEach((key) => record.set(key, values[key]));
  app.save(record);
  return record;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Domain(domain, value, security) {
  const source = security || (typeof $security !== "undefined" ? $security : null);
  if (!source || typeof source.sha256 !== "function") return "";
  return text(source.sha256(`${domain}|${value}`), 64).toLowerCase();
}

function randomToken(security) {
  const source = security || (typeof $security !== "undefined" ? $security : null);
  const token = source && typeof source.randomString === "function" ? text(source.randomString(43), 43) : "";
  if (!TOKEN_PATTERN.test(token)) throw new Error("token_generation_failed");
  return token;
}

function grantDigest(token, security) {
  if (!TOKEN_PATTERN.test(text(token, 43))) return "";
  return sha256Domain("pz_admin_app_grant:v1", token, security);
}

function ticketDigest(token, security) {
  if (!TOKEN_PATTERN.test(text(token, 43))) return "";
  return sha256Domain("pz_admin_app_ticket:v1", token, security);
}

function managementReady(app) {
  try {
    return [PROFILES, JOBS, ARTIFACTS, ASSIGNMENTS, TICKETS, EVENTS, BRAND_ASSETS, RUNNER_AGENTS].every((name) => {
      const collection = app.findCollectionByNameOrId(name);
      return collection.listRule === null && collection.viewRule === null && collection.createRule === null
        && collection.updateRule === null && collection.deleteRule === null;
    }) && app.findCollectionByNameOrId(ARTIFACTS).fields.getByName("file").protected === true
      && app.findCollectionByNameOrId(BRAND_ASSETS).fields.getByName("file").protected === true
      && !!app.findCollectionByNameOrId(PROFILES).fields.getByName("last_allocated_version_code")
      && !!app.findCollectionByNameOrId(PROFILES).fields.getByName("current_engine_revision")
      && !!app.findCollectionByNameOrId(JOBS).fields.getByName("engine_version")
      && !!app.findCollectionByNameOrId(JOBS).fields.getByName("execution_authorized_at")
      && !!app.findCollectionByNameOrId(JOBS).fields.getByName("execution_runner_id")
      && !!app.findCollectionByNameOrId(TICKETS).fields.getByName("profile");
  } catch (_) { return false; }
}

function engineRelease() {
  const configuredVersion = environment("PZ_ADMIN_ENGINE_VERSION", 40);
  const configuredRevision = environment("PZ_ADMIN_ENGINE_REVISION", 40).toLowerCase();
  const configuredSeverity = environment("PZ_ADMIN_ENGINE_UPDATE_SEVERITY", 20).toLowerCase();
  return {
    version: VERSION_PATTERN.test(configuredVersion) ? configuredVersion : ENGINE_VERSION,
    revision: ENGINE_REVISION_PATTERN.test(configuredRevision) ? configuredRevision : "",
    apiBaseUrl: adminApiBaseUrl(),
    severity: ["normal", "recommended", "critical"].includes(configuredSeverity)
      ? configuredSeverity
      : "recommended",
  };
}

function assertEngineReleaseConfigured() {
  const configuredVersion = environment("PZ_ADMIN_ENGINE_VERSION", 40);
  const configuredRevision = environment("PZ_ADMIN_ENGINE_REVISION", 40).toLowerCase();
  if (configuredVersion !== ENGINE_VERSION
    || !ENGINE_REVISION_PATTERN.test(configuredRevision)
    || !adminApiBaseUrl()) {
    throw new Error("engine_release_unconfigured");
  }
  return engineRelease();
}

function engineDescriptor(release) {
  const target = release || engineRelease();
  return {
    name: ENGINE_NAME,
    version: target.version,
    revision: target.revision,
    contract_version: ENGINE_CONTRACT_VERSION,
    firebase_required: true,
    api_base_url: text(target.apiBaseUrl, 500) || adminApiBaseUrl(),
  };
}

function engineReleaseSnapshot() {
  const release = engineRelease();
  const configuredVersion = environment("PZ_ADMIN_ENGINE_VERSION", 40);
  return {
    ...engineDescriptor(release),
    ready: configuredVersion === ENGINE_VERSION
      && ENGINE_REVISION_PATTERN.test(release.revision)
      && !!release.apiBaseUrl,
    severity: release.severity,
  };
}

function assertPreviewEngineRelease(preview) {
  const release = assertEngineReleaseConfigured();
  const engine = bodyValue(preview, "engine") || {};
  if (text(bodyValue(engine, "version"), 40) !== release.version
    || text(bodyValue(engine, "revision"), 40).toLowerCase() !== release.revision
    || integer(bodyValue(engine, "contract_version")) !== ENGINE_CONTRACT_VERSION
    || text(bodyValue(engine, "api_base_url"), 500) !== release.apiBaseUrl) {
    throw new Error("engine_release_changed");
  }
  return release;
}

function masterProfile(app) {
  return first(app, PROFILES, "channel = {:channel}", { channel: CANONICAL_PROFILE_CHANNEL })
    || first(app, PROFILES, "channel = 'staging'", {});
}

function profileIdentityLocked(app, profileId) {
  return records(app, JOBS, "profile = {:profile}", "", 500, { profile: profileId })
    .some((job) => !!iso(recordValue(job, "confirmed_at")));
}

function nextVersionCode(profile) {
  return Math.max(recordNumber(profile, "latest_version_code"), recordNumber(profile, "last_allocated_version_code")) + 1;
}

function brandAssetSnapshot(asset, audience) {
  if (!asset) return null;
  const id = text(asset.id || recordString(asset, "id", 15), 15);
  const fileName = recordString(asset, "file_name", 180);
  const prefix = audience === "runner" ? "/api/pz/internal/admin-app-brand-assets" : "/api/pz/master/admin-app-brand-assets";
  return {
    id, kind: recordString(asset, "kind", 20), file_name: fileName,
    sha256: recordString(asset, "sha256", 64), bytes: recordNumber(asset, "bytes"),
    width: recordNumber(asset, "width"), height: recordNumber(asset, "height"),
    revision: recordNumber(asset, "revision"), status: recordString(asset, "status", 20),
    download_path: audience ? `${prefix}/${id}/${encodeURIComponent(fileName)}` : "",
    created: iso(recordValue(asset, "created")),
  };
}

function eventValues(action, outcome, context) {
  const input = context || {};
  return {
    profile: input.profileId || "",
    artifact: input.artifactId || "",
    assignment: input.assignmentId || "",
    store: input.storeId || "",
    target_user: input.targetUserId || "",
    device: input.deviceId || "",
    actor: input.actorId || "",
    action,
    outcome,
    reason: text(input.reason, 120),
    snapshot_json: input.snapshot || {},
  };
}

function writeEvent(app, action, outcome, context) {
  try { return createRecord(app, EVENTS, eventValues(action, outcome, context)); }
  catch (_) { return null; }
}

function profileSnapshot(profile, app, audience) {
  if (!profile) return null;
  const canViewBrand = audience === "master" || audience === "runner";
  const icon = app && canViewBrand ? findRecord(app, BRAND_ASSETS, relationId(profile, "icon_asset")) : null;
  const splash = app && canViewBrand ? findRecord(app, BRAND_ASSETS, relationId(profile, "splash_asset")) : null;
  return {
    id: text(profile.id || recordString(profile, "id", 15), 15),
    channel: recordString(profile, "channel", 20),
    display_name: recordString(profile, "display_name", 120),
    package_name: recordString(profile, "package_name", 190),
    admin_url: recordString(profile, "admin_url", 500),
    firebase_configured: !!recordString(profile, "firebase_app_id", 255),
    signing_configured: CERT_PATTERN.test(recordString(profile, "signing_cert_sha256", 95)),
    signing_cert_sha256: recordString(profile, "signing_cert_sha256", 95),
    latest_version_code: recordNumber(profile, "latest_version_code"),
    latest_version_name: recordString(profile, "latest_version_name", 40),
    next_version_code: nextVersionCode(profile),
    current_engine_version: recordString(profile, "current_engine_version", 40),
    current_engine_revision: recordString(profile, "current_engine_revision", 40),
    identity_locked: app ? profileIdentityLocked(app, profile.id) : false,
    icon: brandAssetSnapshot(icon, audience),
    splash: brandAssetSnapshot(splash, audience),
    splash_background_color: recordString(profile, "splash_background_color", 7) || "#FFFFFF",
    minimum_supported_version_code: recordNumber(profile, "minimum_supported_version_code"),
    status: recordString(profile, "status", 20),
    created: iso(recordValue(profile, "created")),
    updated: iso(recordValue(profile, "updated")),
  };
}

function jobSnapshot(job) {
  if (!job) return null;
  const preview = storedPreviewValue(job);
  return {
    id: text(job.id || recordString(job, "id", 15), 15),
    profile_id: relationId(job, "profile"),
    operation: recordString(job, "operation", 20),
    status: recordString(job, "status", 30),
    version_code: recordNumber(job, "version_code"),
    version_name: recordString(job, "version_name", 40),
    preview_hash: recordString(job, "preview_hash", 64),
    preview: recordString(job, "status", 30) === "preview" && preview && typeof preview === "object" ? preview : null,
    preview_expires_at: iso(recordValue(job, "preview_expires_at")),
    confirmed_at: iso(recordValue(job, "confirmed_at")),
    runner_id: recordString(job, "runner_id", 100),
    execution_authorized_at: iso(recordValue(job, "execution_authorized_at")),
    execution_authorized_until: iso(recordValue(job, "execution_authorized_until")),
    execution_authorized_by: relationId(job, "execution_authorized_by"),
    execution_runner_id: recordString(job, "execution_runner_id", 100),
    engine: {
      name: recordString(job, "engine_name", 80),
      version: recordString(job, "engine_version", 20),
      contract_version: recordNumber(job, "engine_contract_version"),
      firebase_required: true,
      revision: recordString(job, "engine_revision", 40),
      api_base_url: adminApiBaseUrl(),
    },
    failure_code: recordString(job, "failure_code", 80),
    started_at: iso(recordValue(job, "started_at")),
    completed_at: iso(recordValue(job, "completed_at")),
    created: iso(recordValue(job, "created")),
    updated: iso(recordValue(job, "updated")),
  };
}

function requiredRunnerCapabilities() {
  return { firebase: true, signing: true };
}

function runnerAgentSnapshot(agent, now) {
  if (!agent) return null;
  const lastSeenAt = iso(recordValue(agent, "last_seen_at"));
  const lastSeen = new Date(lastSeenAt);
  const currentTime = new Date(now || Date.now()).getTime();
  return {
    runner_id: recordString(agent, "runner_id", 100),
    mode: recordString(agent, "mode", 20) === "service" ? "service" : "manual",
    engine_version: recordString(agent, "engine_version", 40),
    engine_revision: recordString(agent, "engine_revision", 40).toLowerCase(),
    allow_firebase: recordValue(agent, "allow_firebase") === true,
    allow_signing: recordValue(agent, "allow_signing") === true,
    workspace_clean: recordValue(agent, "workspace_clean") === true,
    last_seen_at: lastSeenAt,
    online: Number.isFinite(lastSeen.getTime())
      && lastSeen.getTime() > currentTime - RUNNER_ONLINE_TTL_MS,
  };
}

function runnerCompatibility(agent, preview, now) {
  const snapshot = runnerAgentSnapshot(agent, now);
  const engine = bodyValue(preview, "engine") || {};
  const required = requiredRunnerCapabilities();
  const engineMatches = !!snapshot
    && snapshot.workspace_clean
    && snapshot.engine_version === text(bodyValue(engine, "version"), 40)
    && snapshot.engine_revision === text(bodyValue(engine, "revision"), 40).toLowerCase();
  const capabilitiesMatch = !!snapshot
    && (!required.firebase || snapshot.allow_firebase)
    && (!required.signing || snapshot.allow_signing);
  return { snapshot, required, engineMatches, capabilitiesMatch };
}

function authorizationState(job, now) {
  if (!job) return "none";
  if (recordString(job, "runner_id", 100) || recordString(job, "status", 30) === "claimed") {
    return "claimed";
  }
  const authorizedAt = iso(recordValue(job, "execution_authorized_at"));
  const authorizedUntil = new Date(iso(recordValue(job, "execution_authorized_until")));
  if (!authorizedAt) return "pending";
  return Number.isFinite(authorizedUntil.getTime())
    && authorizedUntil.getTime() > new Date(now || Date.now()).getTime()
    ? "authorized"
    : "expired";
}

function clearExecutionAuthorization(job) {
  job.set("execution_authorized_at", "");
  job.set("execution_authorized_until", "");
  job.set("execution_authorized_by", "");
  job.set("execution_runner_id", "");
  job.set("execution_capabilities", null);
}

function runnerControlResponse(app, jobs, now) {
  const activeJob = (jobs || []).find((job) => ["queued", "claimed"].includes(recordString(job, "status", 30))) || null;
  const preview = activeJob ? storedPreviewValue(activeJob) : null;
  const required = preview ? requiredRunnerCapabilities(preview) : requiredRunnerCapabilities();
  const agents = records(app, RUNNER_AGENTS, "", "-last_seen_at", 10, {}).map((agent) => {
    const compatibility = preview ? runnerCompatibility(agent, preview, now) : null;
    return {
      ...runnerAgentSnapshot(agent, now),
      compatible: compatibility
        ? compatibility.engineMatches && compatibility.capabilitiesMatch
        : false,
    };
  });
  return {
    online_ttl_seconds: Math.floor(RUNNER_ONLINE_TTL_MS / 1000),
    authorization_ttl_seconds: Math.floor(RUNNER_AUTHORIZATION_TTL_MS / 1000),
    required_capabilities: required,
    active_job_id: activeJob ? activeJob.id : "",
    authorization_state: authorizationState(activeJob, now),
    authorized_runner_id: activeJob ? recordString(activeJob, "execution_runner_id", 100) : "",
    agents,
  };
}

function runnerProfileSnapshot(profile, job, app) {
  const snapshot = profileSnapshot(profile, app, "runner");
  const preview = storedPreviewValue(job) || {};
  const identity = bodyValue(preview, "identity") || {};
  const appearance = bodyValue(preview, "appearance") || {};
  const icon = findRecord(app, BRAND_ASSETS, relationId(job, "icon_asset"));
  const splash = findRecord(app, BRAND_ASSETS, relationId(job, "splash_asset"));
  return {
    ...snapshot,
    display_name: text(identity.display_name, 120), package_name: text(identity.package_name, 190),
    admin_url: text(identity.admin_url, 500), signing_cert_sha256: text(identity.signing_cert_sha256, 95),
    icon: brandAssetSnapshot(icon, "runner"), splash: brandAssetSnapshot(splash, "runner"),
    splash_background_color: text(appearance.splash_background_color, 7) || "#FFFFFF",
  };
}

function artifactSnapshot(artifact) {
  if (!artifact) return null;
  return {
    id: text(artifact.id || recordString(artifact, "id", 15), 15),
    profile_id: relationId(artifact, "profile"),
    job_id: relationId(artifact, "job"),
    kind: recordString(artifact, "kind", 30),
    file_name: recordString(artifact, "file_name", 220),
    sha256: recordString(artifact, "sha256", 64),
    bytes: recordNumber(artifact, "bytes"),
    version_code: recordNumber(artifact, "version_code"),
    version_name: recordString(artifact, "version_name", 40),
    lifecycle_status: recordString(artifact, "lifecycle_status", 30),
    stored: !!recordString(artifact, "file", 220),
    created: iso(recordValue(artifact, "created")),
  };
}

function assignmentSnapshot(assignment, app) {
  if (!assignment) return null;
  const user = app ? findRecord(app, "users", relationId(assignment, "user")) : null;
  const store = app ? findRecord(app, "stores", relationId(assignment, "store")) : null;
  const device = app ? findRecord(app, "store_user_devices", relationId(assignment, "device")) : null;
  return {
    id: text(assignment.id || recordString(assignment, "id", 15), 15),
    profile_id: relationId(assignment, "profile"),
    artifact_id: relationId(assignment, "artifact"),
    store: { id: relationId(assignment, "store"), name: recordString(store, "name", 140), slug: recordString(store, "slug", 80) },
    user: { id: relationId(assignment, "user"), name: recordString(user, "display_name", 140) || recordString(user, "name", 140), email: recordString(user, "email", 254) },
    device: { id: relationId(assignment, "device"), label: recordString(device, "label", 120), status: recordString(device, "status", 20) },
    stage: recordString(assignment, "stage", 20),
    wave: recordNumber(assignment, "wave"),
    status: recordString(assignment, "status", 20),
    download_count: recordNumber(assignment, "download_count"),
    last_downloaded_at: iso(recordValue(assignment, "last_downloaded_at")),
    installed_version_code: recordNumber(assignment, "installed_version_code"),
    installed_version_name: recordString(assignment, "installed_version_name", 40),
    installed_at: iso(recordValue(assignment, "installed_at")),
    validated_at: iso(recordValue(assignment, "validated_at")),
    created: iso(recordValue(assignment, "created")),
    updated: iso(recordValue(assignment, "updated")),
  };
}

function eventSnapshot(event) {
  return {
    id: text(event.id || recordString(event, "id", 15), 15),
    action: recordString(event, "action", 40),
    outcome: recordString(event, "outcome", 20),
    reason: recordString(event, "reason", 120),
    profile_id: relationId(event, "profile"), artifact_id: relationId(event, "artifact"),
    assignment_id: relationId(event, "assignment"), store_id: relationId(event, "store"),
    target_user_id: relationId(event, "target_user"), device_id: relationId(event, "device"),
    actor_id: relationId(event, "actor"), created: iso(recordValue(event, "created")),
  };
}

function authorizedAdminContext(app, auth, rawToken) {
  if (!isStoreAdmin(auth)) throw new Error("unauthorized");
  const device = deviceLib.resolveAuthorizedUserDevice(app, auth, rawToken);
  if (!device || recordString(device, "status", 20) !== "authorized") throw new Error("device_not_authorized");
  return { user: auth, device, storeId: relationId(auth, "store") };
}

function recipientSnapshot(app, context) {
  const store = findRecord(app, "stores", context.storeId);
  return {
    store: { id: context.storeId, name: recordString(store, "name", 140), slug: recordString(store, "slug", 80) },
    user: {
      id: text(context.user.id || recordString(context.user, "id", 15), 15),
      name: recordString(context.user, "display_name", 140) || recordString(context.user, "name", 140),
      email: recordString(context.user, "email", 254),
    },
    device: {
      id: text(context.device.id || recordString(context.device, "id", 15), 15),
      label: recordString(context.device, "label", 120), status: recordString(context.device, "status", 20),
    },
  };
}

function activeAssignment(app, context, rawGrant) {
  const params = { user: context.user.id, device: context.device.id, store: context.storeId };
  let assignment = null;
  if (rawGrant) {
    const digest = grantDigest(rawGrant);
    if (!SHA256_PATTERN.test(digest)) throw new Error("assignment_not_found");
    assignment = first(app, ASSIGNMENTS,
      "grant_digest = {:digest} && user = {:user} && device = {:device} && store = {:store}",
      { ...params, digest });
  } else {
    assignment = first(app, ASSIGNMENTS,
      "user = {:user} && device = {:device} && store = {:store} && status = 'active'",
      params, "-created");
  }
  if (!assignment || recordString(assignment, "status", 20) !== "active") throw new Error("assignment_not_found");
  const profile = findRecord(app, PROFILES, relationId(assignment, "profile"));
  const artifact = findRecord(app, ARTIFACTS, relationId(assignment, "artifact"));
  if (!profile || !artifact || recordString(profile, "status", 20) !== "active"
    || recordString(artifact, "kind", 20) !== "apk"
    || recordString(artifact, "lifecycle_status", 20) !== "available"
    || !recordString(artifact, "file", 220)) throw new Error("release_not_available");
  return { assignment, profile, artifact };
}

function testApproved(app, artifactId) {
  if (records(app, EVENTS, "artifact = {:artifact} && action = 'test_approved' && outcome = 'succeeded'", "-created", 1, { artifact: artifactId }).length > 0) return true;
  if (records(app, EVENTS, "artifact = {:artifact} && action = 'pilot_validated' && outcome = 'succeeded'", "-created", 1, { artifact: artifactId }).length > 0) return true;
  // Compatibilidad con pilotos creados antes del flujo simplificado.
  return records(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'pilot' && status = 'active' && validated_at != ''", "", 1, { artifact: artifactId }).length > 0;
}

function releaseState(app, artifactId) {
  const event = records(app, EVENTS, "artifact = {:artifact}", "-created", 100, { artifact: artifactId })
    .find((item) => ["release_published", "release_resumed", "release_paused", "release_withdrawn"].includes(recordString(item, "action", 40)));
  if (!event) return "draft";
  const action = recordString(event, "action", 40);
  if (action === "release_paused") return "paused";
  if (action === "release_withdrawn") return "withdrawn";
  return "published";
}

function publishedArtifactForProfile(app, profileId) {
  const candidates = records(app, ARTIFACTS,
    "profile = {:profile} && kind = 'apk' && lifecycle_status = 'available' && file != ''",
    "-version_code", 100, { profile: profileId });
  const controlled = candidates.find((artifact) => releaseState(app, artifact.id) !== "draft") || null;
  return controlled && releaseState(app, controlled.id) === "published" ? controlled : null;
}

function publishedRelease(app, packageName, channel) {
  let profile = null;
  if (packageName) {
    const matching = records(app, PROFILES, "package_name = {:package} && status = 'active'", "+channel", 10, { package: packageName });
    profile = matching.find((item) => recordString(item, "channel", 20) === CANONICAL_PROFILE_CHANNEL) || matching[0] || null;
  } else {
    profile = channel === CANONICAL_PROFILE_CHANNEL ? masterProfile(app) : null;
  }
  if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("profile_not_found");
  const artifact = publishedArtifactForProfile(app, profile.id);
  if (!artifact) throw new Error("release_not_available");
  return { assignment: null, profile, artifact };
}

function resolveAdminRelease(app, context, input) {
  const grant = text(input && input.grant, 43);
  const packageName = text(input && input.packageName, 190);
  const channel = text(input && input.channel, 20);
  const resolved = grant ? activeAssignment(app, context, grant) : publishedRelease(app, packageName, channel);
  if (packageName && recordString(resolved.profile, "package_name", 190) !== packageName) throw new Error("profile_not_found");
  if (!packageName && channel && channel !== CANONICAL_PROFILE_CHANNEL) throw new Error("profile_not_found");
  return resolved;
}

function portalResponse(app, context, resolved, grant) {
  const artifact = artifactSnapshot(resolved.artifact);
  const profile = profileSnapshot(resolved.profile, app, "admin");
  return {
    ok: true,
    access: {
      recipient: recipientSnapshot(app, context), artifact, profile,
      grant_present: !!grant,
    },
  };
}

function safeErrorCode(error) {
  const code = text(error && (error.code || error.message), 80);
  return [
    "unauthorized", "device_not_authorized", "assignment_not_found", "release_not_available",
    "invalid_payload", "profile_not_found", "artifact_not_found", "user_not_found", "device_not_found",
    "pilot_required", "pilot_not_installed", "pilot_already_exists", "general_release_required",
    "version_code_must_increase", "version_identity_mismatch", "job_not_claimed", "artifacts_not_stored",
    "ticket_not_found", "ticket_expired", "ticket_used", "ticket_identity_mismatch", "profile_identity_locked",
    "signing_identity_required", "assignment_revoked", "engine_incompatible", "version_sequence_changed",
    "brand_asset_required", "brand_asset_invalid", "brand_asset_too_large", "release_withdrawn",
    "active_job_exists", "engine_release_unconfigured", "engine_release_changed",
    "runner_job_not_startable", "runner_not_registered", "runner_engine_mismatch",
    "runner_capability_missing", "runner_heartbeat_failed", "runner_start_failed",
    "job_not_retryable", "job_not_cancelable", "candidate_not_discardable",
  ].includes(code) ? code : "";
}

function statusFor(code) {
  if (code === "unauthorized") return 403;
  if (code === "brand_asset_too_large") return 413;
  if (["invalid_payload"].includes(code)) return 400;
  if (["assignment_not_found", "release_not_available", "ticket_not_found", "artifact_not_found"].includes(code)) return 404;
  return 409;
}

function unexpectedErrorSignature(error) {
  const name = text(error && error.name, 80).replace(/[\r\n]+/g, " ");
  const message = text(error && error.message, 320).replace(/[\r\n]+/g, " ");
  const fields = [];
  const sources = [
    error && error.data,
    error && error.response && error.response.data && error.response.data.data,
  ];
  sources.forEach((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return;
    Object.keys(source).sort().slice(0, 20).forEach((field) => {
      const detail = source[field];
      const validationCode = text(detail && detail.code, 80).replace(/[\r\n]+/g, " ");
      fields.push(validationCode ? `${text(field, 80)}:${validationCode}` : text(field, 80));
    });
  });
  return text([name, message, Array.from(new Set(fields)).join(",")].filter(Boolean).join(" | "), 700);
}

function sendError(e, error, fallback) {
  const knownCode = safeErrorCode(error);
  if (!knownCode) {
    try {
      $app.logger().error(
        "Tu Senda 84 Admin release operation failed safely.",
        "code", fallback,
        "error", unexpectedErrorSignature(error) || "unknown_error"
      );
    } catch (_) {}
  }
  const code = knownCode || fallback;
  return e.json(statusFor(code), { ok: false, error: code });
}

function handleMasterDetail(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["channel"])) return e.json(400, { ok: false, error: "invalid_payload" });
  const channel = text(bodyValue(body, "channel"), 20);
  if (!["staging", "production"].includes(channel)) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    if (!managementReady($app)) return e.json(503, { ok: false, error: "admin_app_unavailable" });
    const generatedAt = new Date().toISOString();
    const profile = masterProfile($app);
    const profileId = profile ? profile.id : "";
    const jobs = profile ? records($app, JOBS, "profile = {:profile}", "-created", 25, { profile: profileId }) : [];
    const artifacts = profile ? records($app, ARTIFACTS, "profile = {:profile}", "-created", 50, { profile: profileId }) : [];
    const assignments = profile ? records($app, ASSIGNMENTS, "profile = {:profile}", "-created", 500, { profile: profileId }) : [];
    const users = records($app, "users", "role = 'store_admin' && status = 'active' && store != ''", "+email", 2000, {});
    const eligible = [];
    users.forEach((user) => {
      records($app, "store_user_devices", "user = {:user} && store = {:store} && status = 'authorized'", "-last_seen_at", 50, {
        user: user.id, store: relationId(user, "store"),
      }).forEach((device) => {
        const store = findRecord($app, "stores", relationId(user, "store"));
        eligible.push({
          user_id: user.id,
          user_name: recordString(user, "display_name", 140) || recordString(user, "name", 140),
          user_email: recordString(user, "email", 254),
          store_id: relationId(user, "store"),
          store_name: recordString(store, "name", 140),
          device_id: device.id,
          device_label: recordString(device, "label", 120),
          device_last_seen_at: iso(recordValue(device, "last_seen_at")),
        });
      });
    });
    const events = profile ? records($app, EVENTS, "profile = {:profile}", "-created", 100, { profile: profileId }) : [];
    return e.json(200, {
      ok: true,
      generated_at: generatedAt,
      engine: engineReleaseSnapshot(),
      profile: profileSnapshot(profile, $app, "master"),
      jobs: jobs.map(jobSnapshot),
      artifacts: artifacts.map(artifactSnapshot), assignments: assignments.map((item) => assignmentSnapshot(item, $app)),
      eligible_devices: eligible,
      events: events.map(eventSnapshot),
      runner_control: runnerControlResponse($app, jobs, generatedAt),
      notification_health: adminPush.healthSnapshot($app, generatedAt),
      policy: {
        runner_isolated: true,
        runner_requires_explicit_authorization: true,
        exact_engine_revision_required: true,
        canonical_build_channel: "production",
        single_artifact_release: true,
        publication_reuses_approved_artifact: true,
      },
    });
  } catch (_) { return e.json(500, { ok: false, error: "admin_app_detail_failed" }); }
}

function parseConfigure(body) {
  const keys = ["admin_url", "confirmation", "current_version_code", "current_version_name", "display_name", "package_name", "signing_cert_sha256", "splash_background_color"];
  if (!exactPayload(body, keys)) return null;
  const parsed = {
    displayName: text(bodyValue(body, "display_name"), 120),
    packageName: text(bodyValue(body, "package_name"), 190), adminUrl: text(bodyValue(body, "admin_url"), 500),
    signingCert: text(bodyValue(body, "signing_cert_sha256"), 95).toUpperCase(),
    splashBackgroundColor: text(bodyValue(body, "splash_background_color"), 7).toUpperCase(),
    currentVersionCode: integer(bodyValue(body, "current_version_code")),
    currentVersionName: text(bodyValue(body, "current_version_name"), 40),
    confirmation: text(bodyValue(body, "confirmation"), 80),
  };
  if (!parsed.displayName || !PACKAGE_PATTERN.test(parsed.packageName)
    || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/.*)?$/.test(parsed.adminUrl)
    || (parsed.signingCert && !CERT_PATTERN.test(parsed.signingCert))
    || !COLOR_PATTERN.test(parsed.splashBackgroundColor)
    || parsed.currentVersionCode < 0
    || (parsed.currentVersionCode === 0 ? !!parsed.currentVersionName : !VERSION_PATTERN.test(parsed.currentVersionName))
    || parsed.confirmation !== "CONFIGURAR MOBILE ADMIN") return null;
  return parsed;
}

function handleMasterConfigure(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const parsed = parseConfigure(e.requestInfo().body || {});
  if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    let response = null;
    $app.runInTransaction((app) => {
      let profile = masterProfile(app);
      if (profile) {
        const identityLocked = profileIdentityLocked(app, profile.id);
        if (identityLocked && (recordString(profile, "package_name", 190) !== parsed.packageName
          || (recordString(profile, "signing_cert_sha256", 95) && recordString(profile, "signing_cert_sha256", 95) !== parsed.signingCert))) {
          throw new Error("profile_identity_locked");
        }
        profile.set("display_name", parsed.displayName);
        profile.set("admin_url", parsed.adminUrl);
        profile.set("splash_background_color", parsed.splashBackgroundColor);
        if (!identityLocked) profile.set("package_name", parsed.packageName);
        if (!identityLocked || !recordString(profile, "signing_cert_sha256", 95)) profile.set("signing_cert_sha256", parsed.signingCert);
        if (!identityLocked) {
          profile.set("latest_version_code", parsed.currentVersionCode);
          profile.set("latest_version_name", parsed.currentVersionName);
          profile.set("last_allocated_version_code", parsed.currentVersionCode);
        }
        if (!recordString(profile, "splash_background_color", 7)) profile.set("splash_background_color", "#FFFFFF");
        profile.set("updated_by", e.auth.id);
        app.save(profile);
        writeEvent(app, "configuration_updated", "succeeded", {
          profileId: profile.id, actorId: e.auth.id,
          snapshot: { display_name: parsed.displayName, admin_url: parsed.adminUrl, splash_background_color: parsed.splashBackgroundColor },
        });
      } else {
        profile = createRecord(app, PROFILES, {
          channel: CANONICAL_PROFILE_CHANNEL, display_name: parsed.displayName, package_name: parsed.packageName,
          admin_url: parsed.adminUrl,
          signing_cert_sha256: parsed.signingCert, latest_version_code: parsed.currentVersionCode, latest_version_name: parsed.currentVersionName,
          last_allocated_version_code: parsed.currentVersionCode, splash_background_color: parsed.splashBackgroundColor,
          minimum_supported_version_code: 0, status: "active", created_by: e.auth.id, updated_by: e.auth.id,
        });
        writeEvent(app, "profile_created", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { channel: CANONICAL_PROFILE_CHANNEL, package_name: parsed.packageName } });
      }
      response = { ok: true, profile: profileSnapshot(profile, app, "master") };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "admin_app_configure_failed"); }
}

function parseBuildPreview(body) {
  if (!exactPayload(body, ["version_name"])) return null;
  const parsed = { versionName: text(bodyValue(body, "version_name"), 40) };
  return VERSION_PATTERN.test(parsed.versionName) ? parsed : null;
}

function buildPreview(profile, parsed, app, approvedRelease) {
  const icon = app ? findRecord(app, BRAND_ASSETS, relationId(profile, "icon_asset")) : null;
  const splash = app ? findRecord(app, BRAND_ASSETS, relationId(profile, "splash_asset")) : null;
  return {
    schema_version: 2, app: "mobile-admin", channel: "production",
    engine: engineDescriptor(approvedRelease),
    operation: recordNumber(profile, "latest_version_code") > 0 ? "update" : "provision",
    identity: {
      display_name: recordString(profile, "display_name", 120), package_name: recordString(profile, "package_name", 190),
      admin_url: recordString(profile, "admin_url", 500), signing_cert_sha256: recordString(profile, "signing_cert_sha256", 95),
    },
    build: { version_code: parsed.versionCode, version_name: parsed.versionName, apk: true, build_type: "release" },
    appearance: {
      icon_sha256: recordString(icon, "sha256", 64), splash_sha256: recordString(splash, "sha256", 64),
      splash_background_color: recordString(profile, "splash_background_color", 7) || "#FFFFFF",
    },
    notifications: { firebase_required: true, managed_by_engine: true },
    delivery: {
      authenticated_only: true,
      master_test_approval_required: true,
      automatic_authorized_admin_delivery: true,
      mandatory_after_publication: true,
    },
  };
}

function handleMasterPreview(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const parsed = parseBuildPreview(e.requestInfo().body || {});
  if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const release = assertEngineReleaseConfigured();
    const profile = masterProfile($app);
    if (!profile) throw new Error("profile_not_found");
    if (recordString(profile, "status", 20) !== "active") throw new Error("release_not_available");
    if (!CERT_PATTERN.test(recordString(profile, "signing_cert_sha256", 95))) throw new Error("signing_identity_required");
    const versionCode = nextVersionCode(profile);
    const preview = buildPreview(profile, { versionCode, versionName: parsed.versionName }, $app, release);
    const hash = sha256Domain("pz_admin_app_preview:v2", canonical(preview));
    if (!SHA256_PATTERN.test(hash)) throw new Error("invalid_payload");
    const existing = first($app, JOBS, "preview_hash = {:hash}", { hash });
    const otherActive = records($app, JOBS, "", "-created", 100, {})
      .find((job) => ["preview", "queued", "claimed"].includes(recordString(job, "status", 30))
        && (!existing || job.id !== existing.id));
    if (otherActive) throw new Error("active_job_exists");
    if (existing && ["preview", "canceled"].includes(recordString(existing, "status", 30))) {
      existing.set("status", "preview");
      existing.set("failure_code", "");
      existing.set("completed_at", "");
      existing.set("preview_expires_at", new Date(Date.now() + PREVIEW_TTL_MS).toISOString());
      existing.set("preview_json", preview);
      existing.set("created_by", e.auth.id);
      $app.save(existing);
      return e.json(200, { ok: true, idempotent: true, job: jobSnapshot(existing) });
    }
    const expires = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const job = createRecord($app, JOBS, {
      profile: profile.id, operation: preview.operation, status: "preview", version_code: versionCode,
      version_name: parsed.versionName, preview_hash: hash, preview_json: preview, preview_expires_at: expires,
      engine_name: ENGINE_NAME, engine_version: release.version, engine_contract_version: ENGINE_CONTRACT_VERSION,
      engine_revision: release.revision,
      icon_asset: relationId(profile, "icon_asset"), splash_asset: relationId(profile, "splash_asset"),
      created_by: e.auth.id,
    });
    return e.json(201, { ok: true, idempotent: false, job: jobSnapshot(job) });
  } catch (error) { return sendError(e, error, "admin_app_preview_failed"); }
}

function handleMasterConfirm(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["confirmation", "job_id", "preview_hash"])) return e.json(400, { ok: false, error: "invalid_payload" });
  const jobId = text(bodyValue(body, "job_id"), 15);
  const hash = text(bodyValue(body, "preview_hash"), 64).toLowerCase();
  if (!RECORD_ID_PATTERN.test(jobId) || !SHA256_PATTERN.test(hash) || text(bodyValue(body, "confirmation"), 80) !== "CONFIRMAR BUILD MOBILE ADMIN") {
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  try {
    let response = null;
    $app.runInTransaction((app) => {
      const job = findRecord(app, JOBS, jobId);
      if (!job || recordString(job, "preview_hash", 64) !== hash) throw new Error("invalid_payload");
      if (recordString(job, "status", 30) === "queued") { response = { ok: true, idempotent: true, job: jobSnapshot(job) }; return; }
      if (recordString(job, "status", 30) !== "preview" || new Date(iso(recordValue(job, "preview_expires_at"))).getTime() <= Date.now()) throw new Error("invalid_payload");
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("release_not_available");
      if (!CERT_PATTERN.test(recordString(profile, "signing_cert_sha256", 95))) throw new Error("signing_identity_required");
      const release = assertPreviewEngineRelease(storedPreviewValue(job));
      if (recordString(job, "engine_name", 80) !== ENGINE_NAME || recordString(job, "engine_version", 20) !== release.version
        || recordString(job, "engine_revision", 40) !== release.revision
        || recordNumber(job, "engine_contract_version") !== ENGINE_CONTRACT_VERSION) throw new Error("engine_incompatible");
      const otherActive = records(app, JOBS, "", "-created", 100, {})
        .find((candidate) => candidate.id !== job.id
          && ["queued", "claimed"].includes(recordString(candidate, "status", 30)));
      if (otherActive) throw new Error("active_job_exists");
      if (recordNumber(job, "version_code") !== nextVersionCode(profile)) throw new Error("version_sequence_changed");
      const currentPreview = buildPreview(profile, {
        versionCode: recordNumber(job, "version_code"), versionName: recordString(job, "version_name", 40),
      }, app, release);
      if (sha256Domain("pz_admin_app_preview:v2", canonical(currentPreview)) !== hash) throw new Error("version_identity_mismatch");
      profile.set("last_allocated_version_code", recordNumber(job, "version_code"));
      profile.set("updated_by", e.auth.id); app.save(profile);
      job.set("status", "queued");
      job.set("confirmed_by", e.auth.id);
      job.set("confirmed_at", new Date().toISOString());
      clearExecutionAuthorization(job);
      app.save(job);
      writeEvent(app, "build_queued", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { job_id: job.id, version_code: recordNumber(job, "version_code") } });
      response = { ok: true, idempotent: false, job: jobSnapshot(job) };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "admin_app_confirm_failed"); }
}

function parseAssignment(body) {
  if (!exactPayload(body, ["action", "artifact_id", "device_id", "user_id"])) return null;
  const parsed = {
    artifactId: text(bodyValue(body, "artifact_id"), 15), userId: text(bodyValue(body, "user_id"), 15),
    deviceId: text(bodyValue(body, "device_id"), 15),
  };
  return text(bodyValue(body, "action"), 40) === "assign_next" && [parsed.artifactId, parsed.userId, parsed.deviceId].every((id) => RECORD_ID_PATTERN.test(id)) ? parsed : null;
}

function validatedPilotExists(app, artifactId) {
  return testApproved(app, artifactId);
}

function generalPublished(app, artifactId) {
  return releaseState(app, artifactId) === "published";
}

function eligibleAdminTargets(app) {
  const targets = [];
  records(app, "users", "role = 'store_admin' && status = 'active' && store != ''", "+email", 2000, {}).forEach((user) => {
    records(app, "store_user_devices", "user = {:user} && store = {:store} && status = 'authorized'", "-last_seen_at", 50, {
      user: user.id, store: relationId(user, "store"),
    }).forEach((device) => targets.push({ user, device }));
  });
  return targets;
}

function handleAssign(app, e, parsed) {
  const artifact = findRecord(app, ARTIFACTS, parsed.artifactId);
  const user = findRecord(app, "users", parsed.userId);
  const device = findRecord(app, "store_user_devices", parsed.deviceId);
  if (!artifact || recordString(artifact, "kind", 20) !== "apk" || recordString(artifact, "lifecycle_status", 20) !== "available") throw new Error("artifact_not_found");
  if (!user || !isStoreAdmin(user)) throw new Error("user_not_found");
  if (!device || relationId(device, "user") !== user.id || relationId(device, "store") !== relationId(user, "store")
    || recordString(device, "status", 20) !== "authorized") throw new Error("device_not_found");
  const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
  if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("release_not_available");
  const pilot = first(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'pilot' && status = 'active'", { artifact: artifact.id });
  if (pilot && !iso(recordValue(pilot, "validated_at"))) throw new Error("pilot_required");
  const gradual = records(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'gradual' && status = 'active'", "-wave", 500, { artifact: artifact.id });
  const stage = pilot ? "gradual" : "pilot";
  const wave = pilot ? Math.max(0, ...gradual.map((item) => recordNumber(item, "wave"))) + 1 : 0;
  const existing = first(app, ASSIGNMENTS, "artifact = {:artifact} && user = {:user} && device = {:device}", {
    artifact: artifact.id, user: user.id, device: device.id,
  });
  if (existing) {
    if (recordString(existing, "status", 20) !== "active") throw new Error("assignment_revoked");
    return { idempotent: true, assignment: existing, grant: "" };
  }
  const grant = randomToken();
  const assignment = createRecord(app, ASSIGNMENTS, {
    profile: profile.id, artifact: artifact.id, store: relationId(user, "store"), user: user.id, device: device.id,
    stage, wave, status: "active", grant_digest: grantDigest(grant), download_count: 0,
    installed_version_code: 0, created_by: e.auth.id,
  });
  writeEvent(app, stage === "pilot" ? "assignment_created" : "release_promoted", "succeeded", {
    profileId: profile.id, artifactId: artifact.id, assignmentId: assignment.id, storeId: relationId(user, "store"),
    targetUserId: user.id, deviceId: device.id, actorId: e.auth.id, snapshot: { stage, wave },
  });
  return { idempotent: false, assignment, grant };
}

function publishGeneral(app, e, artifactId) {
  const artifact = findRecord(app, ARTIFACTS, artifactId);
  if (!artifact || recordString(artifact, "kind", 20) !== "apk" || recordString(artifact, "lifecycle_status", 20) !== "available"
    || !recordString(artifact, "file", 220)) throw new Error("artifact_not_found");
  if (!testApproved(app, artifact.id)) throw new Error("pilot_required");
  if (generalPublished(app, artifact.id)) return { idempotent: true, created: 0, total: 0 };
  if (releaseState(app, artifact.id) === "withdrawn") throw new Error("release_withdrawn");
  const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
  if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("release_not_available");
  const artifactVersionCode = recordNumber(artifact, "version_code");
  if (artifactVersionCode < recordNumber(profile, "latest_version_code")) throw new Error("version_identity_mismatch");
  const previousMinimum = recordNumber(profile, "minimum_supported_version_code");
  if (previousMinimum) {
    profile.set("minimum_supported_version_code", 0);
    writeEvent(app, "minimum_version_changed", "succeeded", {
      profileId: profile.id, actorId: e.auth.id, snapshot: { previous: previousMinimum, current: 0, reason: "new_release_optional" },
    });
  }
  profile.set("latest_version_code", artifactVersionCode);
  profile.set("latest_version_name", recordString(artifact, "version_name", 40));
  const artifactJob = findRecord(app, JOBS, relationId(artifact, "job"));
  if (artifactJob) {
    profile.set("current_engine_version", recordString(artifactJob, "engine_version", 40));
    profile.set("current_engine_revision", recordString(artifactJob, "engine_revision", 40));
  }
  profile.set("updated_by", e.auth.id);
  app.save(profile);
  writeEvent(app, "release_published", "succeeded", {
    profileId: relationId(artifact, "profile"), artifactId: artifact.id, actorId: e.auth.id,
    snapshot: { access: "all_active_store_admins_on_authorized_devices" },
  });
  return { idempotent: false, created: 0, total: 0 };
}

function handleMasterAction(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const body = e.requestInfo().body || {};
  const action = text(bodyValue(body, "action"), 40);
  try {
    let response = null;
    $app.runInTransaction((app) => {
      if (action === "assign_next") {
        const parsed = parseAssignment(body);
        if (!parsed) throw new Error("invalid_payload");
        const result = handleAssign(app, e, parsed);
        response = { ok: true, idempotent: result.idempotent, assignment: assignmentSnapshot(result.assignment, app), grant: result.grant };
        return;
      }
      if (action === "validate_pilot") {
        if (!exactPayload(body, ["action", "assignment_id", "confirmation"])) throw new Error("invalid_payload");
        const assignment = findRecord(app, ASSIGNMENTS, text(bodyValue(body, "assignment_id"), 15));
        if (!assignment || recordString(assignment, "stage", 20) !== "pilot" || recordString(assignment, "status", 20) !== "active") throw new Error("assignment_not_found");
        const artifact = findRecord(app, ARTIFACTS, relationId(assignment, "artifact"));
        if (!artifact || recordNumber(assignment, "installed_version_code") !== recordNumber(artifact, "version_code")) throw new Error("pilot_not_installed");
        if (text(bodyValue(body, "confirmation"), 80) !== "VALIDAR PILOTO MOBILE ADMIN") throw new Error("invalid_payload");
        if (!iso(recordValue(assignment, "validated_at"))) {
          assignment.set("validated_at", new Date().toISOString()); assignment.set("validated_by", e.auth.id); app.save(assignment);
          writeEvent(app, "pilot_validated", "succeeded", { profileId: relationId(assignment, "profile"), artifactId: artifact.id, assignmentId: assignment.id, storeId: relationId(assignment, "store"), targetUserId: relationId(assignment, "user"), deviceId: relationId(assignment, "device"), actorId: e.auth.id });
        }
        response = { ok: true, assignment: assignmentSnapshot(assignment, app) };
        return;
      }
      if (action === "approve_test") {
        if (!exactPayload(body, ["action", "artifact_id", "confirmation"])
          || text(bodyValue(body, "confirmation"), 80) !== "APROBAR APK MOBILE ADMIN") throw new Error("invalid_payload");
        const artifactId = text(bodyValue(body, "artifact_id"), 15);
        const artifact = findRecord(app, ARTIFACTS, artifactId);
        if (!artifact || recordString(artifact, "kind", 20) !== "apk"
          || recordString(artifact, "lifecycle_status", 20) !== "available" || !recordString(artifact, "file", 220)) throw new Error("artifact_not_found");
        const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
        if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("release_not_available");
        const idempotent = testApproved(app, artifact.id);
        if (!idempotent) {
          writeEvent(app, "test_approved", "succeeded", {
            profileId: profile.id, artifactId: artifact.id, actorId: e.auth.id,
            snapshot: { mode: "master_manual_test" },
          });
        }
        response = { ok: true, idempotent, artifact: artifactSnapshot(artifact) };
        return;
      }
      if (action === "publish_general") {
        if (!exactPayload(body, ["action", "artifact_id", "confirmation"]) || text(bodyValue(body, "confirmation"), 80) !== "PUBLICAR MOBILE ADMIN PARA TODOS") throw new Error("invalid_payload");
        const artifactId = text(bodyValue(body, "artifact_id"), 15);
        if (!RECORD_ID_PATTERN.test(artifactId)) throw new Error("invalid_payload");
        const result = publishGeneral(app, e, artifactId);
        response = { ok: true, idempotent: result.idempotent, created: result.created, total: result.total };
        return;
      }
      if (["pause_release", "resume_release", "withdraw_release"].includes(action)) {
        if (!exactPayload(body, ["action", "artifact_id", "confirmation"])) throw new Error("invalid_payload");
        const artifact = findRecord(app, ARTIFACTS, text(bodyValue(body, "artifact_id"), 15));
        if (!artifact || recordString(artifact, "kind", 20) !== "apk" || recordString(artifact, "lifecycle_status", 20) !== "available") throw new Error("artifact_not_found");
        const profile = findRecord(app, PROFILES, relationId(artifact, "profile"));
        if (!profile) throw new Error("profile_not_found");
        const current = releaseState(app, artifact.id);
        const expected = action === "pause_release" ? "PAUSAR PUBLICACION MOBILE ADMIN"
          : action === "resume_release" ? "REANUDAR PUBLICACION MOBILE ADMIN" : "RETIRAR PUBLICACION MOBILE ADMIN";
        if (text(bodyValue(body, "confirmation"), 80) !== expected) throw new Error("invalid_payload");
        if ((action === "pause_release" && current !== "published")
          || (action === "resume_release" && current !== "paused")
          || (action === "withdraw_release" && !["published", "paused"].includes(current))) throw new Error("release_not_available");
        const eventAction = action === "pause_release" ? "release_paused" : action === "resume_release" ? "release_resumed" : "release_withdrawn";
        writeEvent(app, eventAction, "succeeded", { profileId: profile.id, artifactId: artifact.id, actorId: e.auth.id, snapshot: { previous: current } });
        if (action === "withdraw_release" && recordNumber(profile, "minimum_supported_version_code")) {
          const previous = recordNumber(profile, "minimum_supported_version_code");
          profile.set("minimum_supported_version_code", 0); profile.set("updated_by", e.auth.id); app.save(profile);
          writeEvent(app, "minimum_version_changed", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { previous, current: 0, reason: "release_withdrawn" } });
        }
        response = { ok: true, artifact: artifactSnapshot(artifact), release_state: releaseState(app, artifact.id) };
        return;
      }
      if (action === "use_engine_brand") {
        if (!exactPayload(body, ["action", "confirmation", "profile_id"])
          || text(bodyValue(body, "confirmation"), 80) !== "USAR IMAGENES DEL MOTOR") throw new Error("invalid_payload");
        const profile = findRecord(app, PROFILES, text(bodyValue(body, "profile_id"), 15));
        if (!profile || profile.id !== (masterProfile(app) || {}).id) throw new Error("profile_not_found");
        ["icon_asset", "splash_asset"].forEach((field) => {
          const asset = findRecord(app, BRAND_ASSETS, relationId(profile, field));
          if (asset && recordString(asset, "status", 20) === "active") { asset.set("status", "superseded"); app.save(asset); }
          profile.set(field, "");
        });
        profile.set("updated_by", e.auth.id); app.save(profile);
        writeEvent(app, "brand_asset_updated", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { mode: "engine_default" } });
        response = { ok: true, profile: profileSnapshot(profile, app, "master") };
        return;
      }
      if (action === "set_minimum") {
        if (!exactPayload(body, ["action", "confirmation", "profile_id", "version_code"])) throw new Error("invalid_payload");
        const profile = findRecord(app, PROFILES, text(bodyValue(body, "profile_id"), 15));
        const versionCode = integer(bodyValue(body, "version_code"));
        if (!profile || versionCode < 0 || versionCode > recordNumber(profile, "latest_version_code")
          || text(bodyValue(body, "confirmation"), 80) !== `EXIGIR VERSION ${versionCode}`) throw new Error("invalid_payload");
        if (versionCode > 0) {
          const artifact = first(app, ARTIFACTS, "profile = {:profile} && kind = 'apk' && version_code = {:version} && lifecycle_status = 'available'", { profile: profile.id, version: versionCode });
          if (!artifact || !validatedPilotExists(app, artifact.id) || !generalPublished(app, artifact.id)) {
            throw new Error("general_release_required");
          }
        }
        const previous = recordNumber(profile, "minimum_supported_version_code");
        profile.set("minimum_supported_version_code", versionCode); profile.set("updated_by", e.auth.id); app.save(profile);
        writeEvent(app, "minimum_version_changed", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { previous, current: versionCode } });
        response = { ok: true, profile: profileSnapshot(profile, app, "master") };
        return;
      }
      if (action === "set_profile_status") {
        if (!exactPayload(body, ["action", "confirmation", "profile_id", "status"])) throw new Error("invalid_payload");
        const profile = findRecord(app, PROFILES, text(bodyValue(body, "profile_id"), 15));
        const status = text(bodyValue(body, "status"), 20);
        if (!profile || !["active", "paused", "withdrawn"].includes(status)
          || text(bodyValue(body, "confirmation"), 80) !== `CAMBIAR ESTADO ${status.toUpperCase()}`) throw new Error("invalid_payload");
        profile.set("status", status); profile.set("updated_by", e.auth.id); app.save(profile);
        writeEvent(app, status === "paused" ? "release_paused" : status === "withdrawn" ? "release_withdrawn" : "release_promoted", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { status } });
        response = { ok: true, profile: profileSnapshot(profile, app, "master") };
        return;
      }
      if (action === "revoke_assignment") {
        if (!exactPayload(body, ["action", "assignment_id", "confirmation", "reason"])) throw new Error("invalid_payload");
        const assignment = findRecord(app, ASSIGNMENTS, text(bodyValue(body, "assignment_id"), 15));
        const reason = text(bodyValue(body, "reason"), 500);
        if (!assignment || !reason || text(bodyValue(body, "confirmation"), 80) !== "REVOCAR ENTREGA MOBILE ADMIN") throw new Error("invalid_payload");
        if (recordString(assignment, "status", 20) !== "revoked") {
          assignment.set("status", "revoked"); assignment.set("revoked_at", new Date().toISOString());
          assignment.set("revoked_by", e.auth.id); assignment.set("revoke_reason", reason); app.save(assignment);
          writeEvent(app, "assignment_revoked", "succeeded", { profileId: relationId(assignment, "profile"), artifactId: relationId(assignment, "artifact"), assignmentId: assignment.id, storeId: relationId(assignment, "store"), targetUserId: relationId(assignment, "user"), deviceId: relationId(assignment, "device"), actorId: e.auth.id, reason: "manual" });
        }
        response = { ok: true, assignment: assignmentSnapshot(assignment, app) };
        return;
      }
      if (action === "retry_build") {
        if (!exactPayload(body, ["action", "confirmation", "job_id", "preview_hash"])
          || text(bodyValue(body, "confirmation"), 80) !== "REINTENTAR BUILD MOBILE ADMIN") {
          throw new Error("invalid_payload");
        }
        const job = findRecord(app, JOBS, text(bodyValue(body, "job_id"), 15));
        const previewHash = text(bodyValue(body, "preview_hash"), 64).toLowerCase();
        if (!job || !["failed", "needs_attention"].includes(recordString(job, "status", 30))
          || recordString(job, "preview_hash", 64) !== previewHash) throw new Error("job_not_retryable");
        const otherActive = records(app, JOBS, "", "-created", 100, {})
          .find((candidate) => candidate.id !== job.id
            && ["preview", "queued", "claimed"].includes(recordString(candidate, "status", 30)));
        if (otherActive) throw new Error("active_job_exists");
        const profile = findRecord(app, PROFILES, relationId(job, "profile"));
        if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("profile_not_found");
        const release = assertPreviewEngineRelease(storedPreviewValue(job));
        const currentPreview = buildPreview(profile, {
          versionCode: recordNumber(job, "version_code"),
          versionName: recordString(job, "version_name", 40),
        }, app, release);
        if (sha256Domain("pz_admin_app_preview:v2", canonical(currentPreview)) !== previewHash) {
          throw new Error("version_identity_mismatch");
        }
        records(app, ARTIFACTS, "job = {:job}", "", 20, { job: job.id })
          .forEach((artifact) => {
            if (recordString(artifact, "lifecycle_status", 30) !== "deleted") {
              artifact.set("lifecycle_status", "deleted");
              app.save(artifact);
            }
          });
        job.set("status", "queued");
        job.set("runner_id", "");
        job.set("failure_code", "");
        job.set("started_at", "");
        job.set("completed_at", "");
        clearExecutionAuthorization(job);
        app.save(job);
        writeEvent(app, "build_retried", "succeeded", {
          profileId: profile.id,
          actorId: e.auth.id,
          snapshot: { job_id: job.id, preview_hash: previewHash },
        });
        response = { ok: true, job: jobSnapshot(job) };
        return;
      }
      if (action === "cancel_build") {
        if (!exactPayload(body, ["action", "confirmation", "job_id"])
          || text(bodyValue(body, "confirmation"), 80) !== "CANCELAR BUILD MOBILE ADMIN") {
          throw new Error("invalid_payload");
        }
        const job = findRecord(app, JOBS, text(bodyValue(body, "job_id"), 15));
        if (!job || !["preview", "queued"].includes(recordString(job, "status", 30))
          || recordString(job, "runner_id", 100)) throw new Error("job_not_cancelable");
        job.set("status", "canceled");
        job.set("failure_code", "canceled_by_master");
        job.set("completed_at", new Date().toISOString());
        clearExecutionAuthorization(job);
        app.save(job);
        writeEvent(app, "build_canceled", "succeeded", {
          profileId: relationId(job, "profile"),
          actorId: e.auth.id,
          snapshot: { job_id: job.id },
        });
        response = { ok: true, job: jobSnapshot(job) };
        return;
      }
      if (action === "discard_candidate") {
        if (!exactPayload(body, ["action", "artifact_id", "confirmation"])
          || text(bodyValue(body, "confirmation"), 80) !== "DESCARTAR APK MOBILE ADMIN") {
          throw new Error("invalid_payload");
        }
        const artifact = findRecord(app, ARTIFACTS, text(bodyValue(body, "artifact_id"), 15));
        if (!artifact || recordString(artifact, "kind", 30) !== "apk"
          || recordString(artifact, "lifecycle_status", 30) !== "available"
          || releaseState(app, artifact.id) !== "draft") throw new Error("candidate_not_discardable");
        const jobId = relationId(artifact, "job");
        records(app, ARTIFACTS, "job = {:job}", "", 20, { job: jobId }).forEach((item) => {
          item.set("lifecycle_status", "deleted");
          app.save(item);
        });
        writeEvent(app, "candidate_discarded", "succeeded", {
          profileId: relationId(artifact, "profile"),
          artifactId: artifact.id,
          actorId: e.auth.id,
          snapshot: { job_id: jobId, version_code: recordNumber(artifact, "version_code") },
        });
        response = { ok: true, artifact: artifactSnapshot(artifact) };
        return;
      }
      throw new Error("invalid_payload");
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "admin_app_action_failed"); }
}

function handleAdminPortal(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["channel", "grant", "package_name"])) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const context = authorizedAdminContext($app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const grant = text(bodyValue(body, "grant"), 43);
    const packageName = text(bodyValue(body, "package_name"), 190);
    const channel = text(bodyValue(body, "channel"), 20);
    if ((grant && !TOKEN_PATTERN.test(grant)) || (packageName && !PACKAGE_PATTERN.test(packageName))
      || !["staging", "production"].includes(channel)
      || (!grant && !packageName && channel !== "production")) throw new Error("invalid_payload");
    const resolved = resolveAdminRelease($app, context, { grant, packageName, channel });
    return e.json(200, portalResponse($app, context, resolved, grant));
  } catch (error) { return sendError(e, error, "assignment_not_found"); }
}

function handleAdminTicket(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["channel", "grant", "package_name"])) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const context = authorizedAdminContext($app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const grant = text(bodyValue(body, "grant"), 43);
    const packageName = text(bodyValue(body, "package_name"), 190);
    const channel = text(bodyValue(body, "channel"), 20);
    if ((grant && !TOKEN_PATTERN.test(grant)) || (packageName && !PACKAGE_PATTERN.test(packageName))
      || !["staging", "production"].includes(channel)
      || (!grant && !packageName && channel !== "production")) throw new Error("invalid_payload");
    const resolved = resolveAdminRelease($app, context, { grant, packageName, channel });
    const rawTicket = randomToken();
    const expires = new Date(Date.now() + TICKET_TTL_MS).toISOString();
    createRecord($app, TICKETS, {
      assignment: resolved.assignment ? resolved.assignment.id : "", profile: resolved.profile.id,
      artifact: resolved.artifact.id, user: context.user.id, device: context.device.id,
      token_digest: ticketDigest(rawTicket), expires_at: expires,
    });
    writeEvent($app, "download_ticket_created", "allowed", {
      profileId: resolved.profile.id, artifactId: resolved.artifact.id,
      assignmentId: resolved.assignment ? resolved.assignment.id : "",
      storeId: context.storeId, targetUserId: context.user.id, deviceId: context.device.id, actorId: context.user.id,
    });
    return e.json(201, {
      ok: true, ticket: rawTicket, expires_at: expires, artifact: artifactSnapshot(resolved.artifact),
      download_path: `/api/pz/admin-app-downloads/${resolved.artifact.id}/${rawTicket}/${encodeURIComponent(recordString(resolved.artifact, "file_name", 220))}`,
    });
  } catch (error) { return sendError(e, error, "assignment_not_found"); }
}

function handleAdminPolicy(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["package_name", "version_code", "version_name"])) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const context = authorizedAdminContext($app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const packageName = text(bodyValue(body, "package_name"), 190);
    const versionCode = integer(bodyValue(body, "version_code"));
    const versionName = text(bodyValue(body, "version_name"), 40);
    if (!PACKAGE_PATTERN.test(packageName) || versionCode < 1 || !VERSION_PATTERN.test(versionName)) throw new Error("invalid_payload");
    const access = resolveAdminRelease($app, context, { grant: "", packageName, channel: "" });
    const profile = access.profile;
    const availableVersion = recordNumber(access.artifact, "version_code");
    const minimumVersion = recordNumber(profile, "minimum_supported_version_code");
    return e.json(200, {
      ok: true, policy: {
        package_name: packageName, current_version_code: versionCode, current_version_name: versionName,
        latest_version_code: availableVersion, latest_version_name: recordString(access.artifact, "version_name", 40),
        minimum_supported_version_code: minimumVersion,
        update_available: availableVersion > versionCode,
        update_required: minimumVersion > versionCode && availableVersion >= minimumVersion,
        portal_path: "/admin/mobile-app",
      },
    });
  } catch (error) { return sendError(e, error, "profile_not_found"); }
}

function handleAdminCheckIn(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["package_name", "version_code", "version_name"])) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const context = authorizedAdminContext($app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const packageName = text(bodyValue(body, "package_name"), 190);
    const versionCode = integer(bodyValue(body, "version_code"));
    const versionName = text(bodyValue(body, "version_name"), 40);
    if (!PACKAGE_PATTERN.test(packageName) || versionCode < 1 || !VERSION_PATTERN.test(versionName)) throw new Error("invalid_payload");
    const resolved = resolveAdminRelease($app, context, { grant: "", packageName, channel: "" });
    const profile = resolved.profile;
    const assignment = resolved.assignment;
    if (assignment) {
      assignment.set("installed_version_code", versionCode); assignment.set("installed_version_name", versionName);
      assignment.set("installed_at", new Date().toISOString()); $app.save(assignment);
    }
    writeEvent($app, "check_in", "succeeded", {
      profileId: profile.id, artifactId: resolved.artifact.id, assignmentId: assignment ? assignment.id : "",
      storeId: context.storeId, targetUserId: context.user.id, deviceId: context.device.id, actorId: context.user.id,
      snapshot: { package_name: packageName, version_code: versionCode, version_name: versionName },
    });
    const availableVersion = recordNumber(resolved.artifact, "version_code");
    const minimumVersion = recordNumber(profile, "minimum_supported_version_code");
    return e.json(200, {
      ok: true, recipient: recipientSnapshot($app, context),
      policy: {
        latest_version_code: availableVersion, minimum_supported_version_code: minimumVersion,
        update_available: availableVersion > versionCode,
        update_required: minimumVersion > versionCode && availableVersion >= minimumVersion,
      },
    });
  } catch (error) { return sendError(e, error, "admin_app_check_in_failed"); }
}

function uploadedFileName(file) { return text(file && (file.originalName || file.name), 220); }
function uploadedPrefix(file, length) {
  let reader = null;
  try {
    reader = file && file.reader && typeof file.reader.open === "function" ? file.reader.open() : null;
    if (!reader) return [];
    if (typeof toBytes === "function") {
      const content = toBytes(reader); const out = [];
      for (let index = 0; index < Math.min(length, Number(content && content.length) || 0); index += 1) out.push(Number(content[index]) & 255);
      return out;
    }
    if (typeof readerToString === "function") return Array.from(readerToString(reader).slice(0, length)).map((char) => char.charCodeAt(0) & 255);
  } catch (_) {} finally { try { if (reader && typeof reader.close === "function") reader.close(); } catch (_) {} }
  return [];
}

function parseBrandUpload(body) {
  if (!exactPayload(body, ["bytes", "confirmation", "height", "kind", "sha256", "width"])) return null;
  const parsed = {
    kind: text(bodyValue(body, "kind"), 20),
    sha256: text(bodyValue(body, "sha256"), 64).toLowerCase(), bytes: integer(bodyValue(body, "bytes")),
    width: integer(bodyValue(body, "width")), height: integer(bodyValue(body, "height")),
    confirmation: text(bodyValue(body, "confirmation"), 80),
  };
  return ["icon", "splash"].includes(parsed.kind)
    && SHA256_PATTERN.test(parsed.sha256) && parsed.bytes > 0 && parsed.bytes <= MAX_BRAND_BYTES
    && parsed.width >= 512 && parsed.width <= 2048 && parsed.height === parsed.width
    && parsed.confirmation === "CAMBIAR IMAGEN MOBILE ADMIN" ? parsed : null;
}

function validateBrandPng(file, parsed) {
  if (!file || Number(file.size) !== parsed.bytes) throw new Error(parsed.bytes > MAX_BRAND_BYTES ? "brand_asset_too_large" : "brand_asset_invalid");
  const bytes = uploadedPrefix(file, 24);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) throw new Error("brand_asset_invalid");
  const width = (((bytes[16] << 24) >>> 0) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19]) >>> 0;
  const height = (((bytes[20] << 24) >>> 0) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23]) >>> 0;
  if (width !== parsed.width || height !== parsed.height || width !== height || width < 512 || width > 2048) throw new Error("brand_asset_invalid");
}

function handleMasterBrandUpload(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  try {
    const parsed = parseBrandUpload(e.requestInfo().body || {});
    if (!parsed) throw new Error("invalid_payload");
    const files = Array.from(e.findUploadedFiles("file") || []);
    if (files.length !== 1) throw new Error("brand_asset_required");
    validateBrandPng(files[0], parsed);
    let response = null;
    $app.runInTransaction((app) => {
      const profile = masterProfile(app);
      if (!profile) throw new Error("profile_not_found");
      const previous = first(app, BRAND_ASSETS, "profile = {:profile} && kind = {:kind} && status = 'active'", { profile: profile.id, kind: parsed.kind }, "-revision");
      if (previous && recordString(previous, "sha256", 64) === parsed.sha256 && recordNumber(previous, "bytes") === parsed.bytes) {
        response = { ok: true, idempotent: true, asset: brandAssetSnapshot(previous, "master"), profile: profileSnapshot(profile, app, "master") };
        return;
      }
      const latest = first(app, BRAND_ASSETS, "profile = {:profile} && kind = {:kind}", { profile: profile.id, kind: parsed.kind }, "-revision");
      const revision = Math.max(0, recordNumber(latest, "revision")) + 1;
      const fileName = `admin-${parsed.kind}-${revision}-${parsed.sha256.slice(0, 12)}.png`;
      const asset = createRecord(app, BRAND_ASSETS, {
        profile: profile.id, kind: parsed.kind, file: files[0], file_name: fileName,
        sha256: parsed.sha256, bytes: parsed.bytes, width: parsed.width, height: parsed.height,
        revision, status: "active", created_by: e.auth.id,
      });
      if (previous) { previous.set("status", "superseded"); app.save(previous); }
      profile.set(parsed.kind === "icon" ? "icon_asset" : "splash_asset", asset.id);
      profile.set("updated_by", e.auth.id); app.save(profile);
      writeEvent(app, "brand_asset_updated", "succeeded", {
        profileId: profile.id, actorId: e.auth.id,
        snapshot: { kind: parsed.kind, revision, sha256: parsed.sha256, bytes: parsed.bytes, width: parsed.width, height: parsed.height },
      });
      response = { ok: true, idempotent: false, asset: brandAssetSnapshot(asset, "master"), profile: profileSnapshot(profile, app, "master") };
    });
    return e.json(response && response.idempotent ? 200 : 201, response);
  } catch (error) { return sendError(e, error, "brand_asset_upload_failed"); }
}

function serveBrandAsset(e, requireMaster) {
  setPrivateHeaders(e);
  const notFound = () => e.json(404, { ok: false, error: "brand_asset_not_found" });
  try {
    if (requireMaster && !isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const id = text(e.request.pathValue("asset"), 15);
    const filename = text(e.request.pathValue("filename"), 180);
    if (!RECORD_ID_PATTERN.test(id) || !FILE_PATTERN.test(filename)) return notFound();
    const app = e.app || $app;
    const asset = findRecord(app, BRAND_ASSETS, id);
    if (!asset || recordString(asset, "file_name", 180) !== filename || !["active", "superseded"].includes(recordString(asset, "status", 20))) return notFound();
    const storedName = recordString(asset, "file", 220);
    const base = typeof asset.baseFilesPath === "function" ? text(asset.baseFilesPath(), 1000) : "";
    if (!storedName || !base || base.includes("..")) return notFound();
    const headers = e.response.header();
    headers.set("Content-Type", "image/png");
    headers.set("Content-Disposition", `inline; filename=\"${filename}\"`);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-PZ-Asset-SHA256", recordString(asset, "sha256", 64));
    let filesystem = null;
    try { filesystem = app.newFilesystem(); return filesystem.serve(e.response, e.request, `${base}/${storedName}`, filename); }
    finally { try { if (filesystem) filesystem.close(); } catch (_) {} }
  } catch (_) { return notFound(); }
}

function handleMasterBrandDownload(e) { return serveBrandAsset(e, true); }
function handleRunnerBrandDownload(e) { return serveBrandAsset(e, false); }

function artifactPolicy(kind) {
  return {
    apk: { file: /\.apk$/i, max: MAX_APK_BYTES, zip: true },
    checksums: { file: /^SHA256SUMS\.txt$/, max: 1024 * 1024, text: true },
    instructions: { file: /^INSTRUCCIONES\.txt$/, max: 1024 * 1024, text: true },
    build_manifest: { file: /^build-manifest\.json$/, max: 1024 * 1024, json: true },
  }[kind] || null;
}

function parseUpload(body) {
  if (!exactPayload(body, ["bytes", "file_name", "job_id", "kind", "runner_id", "sha256"])) return null;
  const parsed = { jobId: text(bodyValue(body, "job_id"), 15), runnerId: text(bodyValue(body, "runner_id"), 100), kind: text(bodyValue(body, "kind"), 30), fileName: text(bodyValue(body, "file_name"), 220), sha256: text(bodyValue(body, "sha256"), 64).toLowerCase(), bytes: integer(bodyValue(body, "bytes")) };
  const policy = artifactPolicy(parsed.kind);
  return RECORD_ID_PATTERN.test(parsed.jobId) && RUNNER_PATTERN.test(parsed.runnerId) && policy && FILE_PATTERN.test(parsed.fileName)
    && policy.file.test(parsed.fileName) && SHA256_PATTERN.test(parsed.sha256) && parsed.bytes > 0 && parsed.bytes <= policy.max ? parsed : null;
}

function validateUpload(file, parsed) {
  if (!file || uploadedFileName(file) !== parsed.fileName || Number(file.size) !== parsed.bytes) throw new Error("invalid_payload");
  const policy = artifactPolicy(parsed.kind); const prefix = uploadedPrefix(file, 64);
  if (!policy || !prefix.length) throw new Error("invalid_payload");
  if (policy.zip && (prefix.length < 4 || prefix[0] !== 0x50 || prefix[1] !== 0x4b)) throw new Error("invalid_payload");
  if (policy.text && prefix.some((value) => value === 0)) throw new Error("invalid_payload");
  if (policy.json && prefix.find((value) => ![9, 10, 13, 32].includes(value)) !== 0x7b) throw new Error("invalid_payload");
}

function handleRunnerHeartbeat(e) {
  setPrivateHeaders(e);
  try {
    const body = e.requestInfo().body || {};
    const keys = ["allow_firebase", "allow_signing", "engine_revision", "engine_version", "mode", "runner_id", "workspace_clean"];
    if (!exactPayload(body, keys)) return e.json(400, { ok: false, error: "invalid_payload" });
    const parsed = {
      runnerId: text(bodyValue(body, "runner_id"), 100),
      engineVersion: text(bodyValue(body, "engine_version"), 40),
      engineRevision: text(bodyValue(body, "engine_revision"), 40).toLowerCase(),
      mode: text(bodyValue(body, "mode"), 20),
      allowFirebase: bodyValue(body, "allow_firebase"),
      allowSigning: bodyValue(body, "allow_signing"),
      workspaceClean: bodyValue(body, "workspace_clean"),
    };
    if (!RUNNER_PATTERN.test(parsed.runnerId)
      || !VERSION_PATTERN.test(parsed.engineVersion)
      || !ENGINE_REVISION_PATTERN.test(parsed.engineRevision)
      || !["manual", "service"].includes(parsed.mode)
      || typeof parsed.allowFirebase !== "boolean"
      || typeof parsed.allowSigning !== "boolean"
      || typeof parsed.workspaceClean !== "boolean"
      || requestHeader(e, "x-pz-admin-app-runner-id") !== parsed.runnerId) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }
    let snapshot = null;
    $app.runInTransaction((app) => {
      let agent = first(app, RUNNER_AGENTS, "runner_id = {:runnerId}", { runnerId: parsed.runnerId });
      if (!agent) agent = new Record(app.findCollectionByNameOrId(RUNNER_AGENTS), {});
      agent.set("runner_id", parsed.runnerId);
      agent.set("engine_version", parsed.engineVersion);
      agent.set("engine_revision", parsed.engineRevision);
      agent.set("mode", parsed.mode);
      agent.set("allow_firebase", parsed.allowFirebase);
      agent.set("allow_signing", parsed.allowSigning);
      agent.set("workspace_clean", parsed.workspaceClean);
      agent.set("last_seen_at", new Date().toISOString());
      app.save(agent);
      snapshot = runnerAgentSnapshot(agent, new Date());
    });
    return e.json(200, { ok: true, runner: snapshot });
  } catch (_) {
    return e.json(500, { ok: false, error: "runner_heartbeat_failed" });
  }
}

function handleRunnerStart(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  if (!exactPayload(body, ["confirmation", "job_id", "preview_hash"])) {
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  const jobId = text(bodyValue(body, "job_id"), 15);
  const previewHash = text(bodyValue(body, "preview_hash"), 64).toLowerCase();
  if (!RECORD_ID_PATTERN.test(jobId) || !SHA256_PATTERN.test(previewHash)
    || text(bodyValue(body, "confirmation"), 40) !== "INICIAR RUNNER ADMIN") {
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  try {
    let response = null;
    $app.runInTransaction((app) => {
      const now = new Date();
      const actor = findRecord(app, "users", text(e.auth.id || recordString(e.auth, "id", 15), 15));
      const job = findRecord(app, JOBS, jobId);
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      if (!job || recordString(job, "status", 30) !== "queued" || recordString(job, "runner_id", 100)) {
        throw new Error("runner_job_not_startable");
      }
      if (recordString(job, "preview_hash", 64) !== previewHash) throw new Error("version_identity_mismatch");
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("profile_not_found");
      const preview = storedPreviewValue(job);
      assertPreviewEngineRelease(preview);

      const currentState = authorizationState(job, now);
      const currentRunnerId = recordString(job, "execution_runner_id", 100);
      if (currentState === "authorized" && currentRunnerId) {
        const existingAgent = first(app, RUNNER_AGENTS, "runner_id = {:runnerId}", { runnerId: currentRunnerId });
        const existingCompatibility = runnerCompatibility(existingAgent, preview, now);
        if (existingCompatibility.snapshot
          && existingCompatibility.engineMatches
          && existingCompatibility.capabilitiesMatch) {
          response = { ok: true, idempotent: true, job: jobSnapshot(job), runner: existingCompatibility.snapshot };
          return;
        }
      }

      const registered = records(app, RUNNER_AGENTS, "", "-last_seen_at", 50, {})
        .map((agent) => runnerCompatibility(agent, preview, now))
        .filter((compatibility) => compatibility.snapshot);
      if (!registered.length) throw new Error("runner_not_registered");
      const matchingEngine = registered.filter((item) => item.engineMatches);
      if (!matchingEngine.length) throw new Error("runner_engine_mismatch");
      const compatible = matchingEngine
        .filter((item) => item.capabilitiesMatch)
        .sort((left, right) => Number(right.snapshot.online) - Number(left.snapshot.online));
      if (!compatible.length) throw new Error("runner_capability_missing");
      const selected = compatible[0].snapshot;
      const reauthorized = !!iso(recordValue(job, "execution_authorized_at"));
      job.set("execution_authorized_at", now.toISOString());
      job.set("execution_authorized_until", new Date(now.getTime() + RUNNER_AUTHORIZATION_TTL_MS).toISOString());
      job.set("execution_authorized_by", actor.id);
      job.set("execution_runner_id", selected.runner_id);
      job.set("execution_capabilities", requiredRunnerCapabilities());
      app.save(job);
      writeEvent(app, reauthorized ? "runner_reauthorized" : "runner_authorized", "succeeded", {
        profileId: profile.id,
        actorId: actor.id,
        snapshot: { job_id: job.id, runner_id: selected.runner_id, preview_hash: previewHash },
      });
      response = { ok: true, idempotent: false, job: jobSnapshot(job), runner: selected };
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error, "runner_start_failed");
  }
}

function handleRunnerClaim(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["runner_id"])) return e.json(400, { ok: false, error: "invalid_payload" });
  const runnerId = text(bodyValue(body, "runner_id"), 100);
  if (!RUNNER_PATTERN.test(runnerId) || requestHeader(e, "x-pz-admin-app-runner-id") !== runnerId) return e.json(401, { ok: false, error: "unauthorized" });
  try {
    let response = { ok: true, job: null };
    $app.runInTransaction((app) => {
      const staleBefore = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      records(app, JOBS, "status = 'claimed' && started_at < {:staleBefore}", "+started_at", 50, { staleBefore })
        .forEach((staleJob) => {
          staleJob.set("status", "needs_attention");
          staleJob.set("failure_code", "runner_lease_expired");
          staleJob.set("completed_at", new Date().toISOString());
          app.save(staleJob);
        });
      const agent = first(app, RUNNER_AGENTS, "runner_id = {:runnerId}", { runnerId });
      const agentSnapshot = runnerAgentSnapshot(agent, new Date());
      if (!agentSnapshot || !agentSnapshot.online) return;
      const currentTime = Date.now();
      const job = records(app, JOBS, "status = 'queued'", "+created", 100, {}).find((candidate) => {
        const authorizedUntil = new Date(iso(recordValue(candidate, "execution_authorized_until")));
        return recordString(candidate, "execution_runner_id", 100) === runnerId
          && !!iso(recordValue(candidate, "execution_authorized_at"))
          && Number.isFinite(authorizedUntil.getTime())
          && authorizedUntil.getTime() > currentTime;
      }) || null;
      if (!job) return;
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("profile_not_found");
      const preview = storedPreviewValue(job);
      assertPreviewEngineRelease(preview);
      const compatibility = runnerCompatibility(agent, preview, new Date());
      if (!compatibility.engineMatches || !compatibility.capabilitiesMatch) {
        clearExecutionAuthorization(job);
        app.save(job);
        return;
      }
      job.set("status", "claimed");
      job.set("runner_id", runnerId);
      job.set("started_at", new Date().toISOString());
      app.save(job);
      response = { ok: true, job: { ...jobSnapshot(job), preview, profile: runnerProfileSnapshot(profile, job, app) } };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "runner_claim_failed"); }
}

function handleRunnerUpload(e) {
  setPrivateHeaders(e);
  try {
    const parsed = parseUpload(e.requestInfo().body || {});
    if (!parsed || requestHeader(e, "x-pz-admin-app-runner-id") !== parsed.runnerId) return e.json(400, { ok: false, error: "invalid_payload" });
    const files = Array.from(e.findUploadedFiles("file") || []);
    if (files.length !== 1) return e.json(400, { ok: false, error: "invalid_payload" });
    validateUpload(files[0], parsed);
    const job = findRecord($app, JOBS, parsed.jobId);
    if (!job || recordString(job, "status", 30) !== "claimed" || recordString(job, "runner_id", 100) !== parsed.runnerId) throw new Error("job_not_claimed");
    const existing = first($app, ARTIFACTS, "job = {:job} && kind = {:kind}", { job: job.id, kind: parsed.kind });
    if (existing) {
      if (recordString(existing, "lifecycle_status", 30) === "deleted") {
        existing.set("file_name", parsed.fileName);
        existing.set("file", files[0]);
        existing.set("sha256", parsed.sha256);
        existing.set("bytes", parsed.bytes);
        existing.set("version_code", recordNumber(job, "version_code"));
        existing.set("version_name", recordString(job, "version_name", 40));
        existing.set("lifecycle_status", "staged");
        $app.save(existing);
        return e.json(201, { ok: true, idempotent: false, artifact: artifactSnapshot(existing) });
      }
      const same = recordString(existing, "file_name", 220) === parsed.fileName && recordString(existing, "sha256", 64) === parsed.sha256
        && recordNumber(existing, "bytes") === parsed.bytes && !!recordString(existing, "file", 220);
      if (!same) throw new Error("version_identity_mismatch");
      if (recordString(existing, "lifecycle_status", 30) !== "staged") {
        existing.set("lifecycle_status", "staged");
        $app.save(existing);
      }
      return e.json(200, { ok: true, idempotent: true, artifact: artifactSnapshot(existing) });
    }
    const artifact = createRecord($app, ARTIFACTS, {
      profile: relationId(job, "profile"), job: job.id, kind: parsed.kind, file_name: parsed.fileName, file: files[0],
      sha256: parsed.sha256, bytes: parsed.bytes, version_code: recordNumber(job, "version_code"),
      version_name: recordString(job, "version_name", 40), lifecycle_status: "staged",
    });
    return e.json(201, { ok: true, idempotent: false, artifact: artifactSnapshot(artifact) });
  } catch (error) { return sendError(e, error, "artifact_upload_failed"); }
}

function parseCompletion(body) {
  if (!exactPayload(body, ["artifacts", "engine_contract_version", "engine_name", "engine_revision", "engine_version", "failure_code", "job_id", "runner_id", "signing_cert_sha256", "status"])) return null;
  const parsed = {
    jobId: text(bodyValue(body, "job_id"), 15), runnerId: text(bodyValue(body, "runner_id"), 100),
    status: text(bodyValue(body, "status"), 30), failureCode: text(bodyValue(body, "failure_code"), 80),
    signingCert: text(bodyValue(body, "signing_cert_sha256"), 95).toUpperCase(),
    engineName: text(bodyValue(body, "engine_name"), 80), engineVersion: text(bodyValue(body, "engine_version"), 20),
    engineContractVersion: integer(bodyValue(body, "engine_contract_version")), engineRevision: text(bodyValue(body, "engine_revision"), 40).toLowerCase(),
    artifacts: Array.isArray(bodyValue(body, "artifacts")) ? bodyValue(body, "artifacts").map((item) => ({
      kind: text(bodyValue(item, "kind"), 30), fileName: text(bodyValue(item, "file_name"), 220),
      sha256: text(bodyValue(item, "sha256"), 64).toLowerCase(), bytes: integer(bodyValue(item, "bytes")),
    })) : [],
  };
  if (!RECORD_ID_PATTERN.test(parsed.jobId) || !RUNNER_PATTERN.test(parsed.runnerId) || !["succeeded", "failed", "needs_attention"].includes(parsed.status)
    || parsed.engineName !== ENGINE_NAME || !VERSION_PATTERN.test(parsed.engineVersion)
    || parsed.engineContractVersion !== ENGINE_CONTRACT_VERSION
    || !ENGINE_REVISION_PATTERN.test(parsed.engineRevision)) return null;
  if (parsed.status !== "succeeded") return /^[a-z0-9_:-]{3,80}$/.test(parsed.failureCode) && !parsed.artifacts.length ? parsed : null;
  const kinds = parsed.artifacts.map((item) => item.kind);
  return !parsed.failureCode && CERT_PATTERN.test(parsed.signingCert) && new Set(kinds).size === kinds.length
    && ["apk", "checksums", "instructions", "build_manifest"].every((kind) => kinds.includes(kind))
    && parsed.artifacts.every((item) => artifactPolicy(item.kind) && FILE_PATTERN.test(item.fileName) && SHA256_PATTERN.test(item.sha256) && item.bytes > 0)
    ? parsed : null;
}

function handleRunnerComplete(e) {
  setPrivateHeaders(e);
  const parsed = parseCompletion(e.requestInfo().body || {});
  if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    let response = null;
    $app.runInTransaction((app) => {
      const job = findRecord(app, JOBS, parsed.jobId);
      if (!job || recordString(job, "status", 30) !== "claimed" || recordString(job, "runner_id", 100) !== parsed.runnerId) throw new Error("job_not_claimed");
      if (recordString(job, "engine_name", 80) !== parsed.engineName || recordString(job, "engine_version", 20) !== parsed.engineVersion
        || recordNumber(job, "engine_contract_version") !== parsed.engineContractVersion || recordString(job, "engine_revision", 40) !== parsed.engineRevision) throw new Error("engine_incompatible");
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      if (!profile) throw new Error("profile_not_found");
      job.set("status", parsed.status); job.set("failure_code", parsed.failureCode); job.set("completed_at", new Date().toISOString());
      if (parsed.status === "succeeded") {
        const configuredCert = recordString(profile, "signing_cert_sha256", 95);
        if (configuredCert && configuredCert !== parsed.signingCert) throw new Error("version_identity_mismatch");
        const staged = records(app, ARTIFACTS, "job = {:job}", "+kind", 20, { job: job.id });
        if (staged.length !== parsed.artifacts.length) throw new Error("artifacts_not_stored");
        parsed.artifacts.forEach((expected) => {
          const artifact = staged.find((candidate) => recordString(candidate, "kind", 30) === expected.kind);
          if (!artifact || recordString(artifact, "file_name", 220) !== expected.fileName || recordString(artifact, "sha256", 64) !== expected.sha256
            || recordNumber(artifact, "bytes") !== expected.bytes || !recordString(artifact, "file", 220)
            || recordNumber(artifact, "version_code") !== recordNumber(job, "version_code")) throw new Error("artifacts_not_stored");
          artifact.set("lifecycle_status", "available"); app.save(artifact);
        });
        profile.set("signing_cert_sha256", parsed.signingCert);
        profile.set("updated_by", relationId(job, "confirmed_by") || relationId(job, "created_by")); app.save(profile);
        writeEvent(app, "build_completed", "succeeded", { profileId: profile.id, artifactId: (staged.find((item) => recordString(item, "kind", 20) === "apk") || {}).id || "", actorId: relationId(job, "confirmed_by"), snapshot: { job_id: job.id, version_code: recordNumber(job, "version_code") } });
      }
      app.save(job); response = { ok: true, job: jobSnapshot(job), profile: profileSnapshot(profile, app, "runner") };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "runner_completion_failed"); }
}

function serveApkFile(e, app, artifact, filename) {
  const storedName = recordString(artifact, "file", 220);
  const base = typeof artifact.baseFilesPath === "function" ? text(artifact.baseFilesPath(), 1000) : "";
  if (!storedName || !FILE_PATTERN.test(storedName) || !base || base.includes("..")) throw new Error("artifact_not_found");
  const headers = e.response.header();
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", `attachment; filename=\"${filename}\"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-PZ-APK-SHA256", recordString(artifact, "sha256", 64));
  headers.set("X-PZ-APK-Version-Code", String(recordNumber(artifact, "version_code")));
  headers.set("X-PZ-APK-Version-Name", recordString(artifact, "version_name", 40));
  let filesystem = null;
  try { filesystem = app.newFilesystem(); return filesystem.serve(e.response, e.request, `${base}/${storedName}`, filename); }
  finally { try { if (filesystem) filesystem.close(); } catch (_) {} }
}

function handleMasterArtifactDownload(e) {
  setPrivateHeaders(e);
  const notFound = () => e.json(404, { ok: false, error: "apk_not_found" });
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  try {
    const app = e.app || $app;
    const artifactId = text(e.request.pathValue("artifact"), 15);
    const filename = text(e.request.pathValue("filename"), 220);
    if (!RECORD_ID_PATTERN.test(artifactId) || !FILE_PATTERN.test(filename)) return notFound();
    const artifact = findRecord(app, ARTIFACTS, artifactId);
    const profile = artifact ? findRecord(app, PROFILES, relationId(artifact, "profile")) : null;
    if (!artifact || !profile
      || recordString(artifact, "kind", 20) !== "apk" || recordString(artifact, "lifecycle_status", 20) !== "available"
      || recordString(artifact, "file_name", 220) !== filename) return notFound();
    return serveApkFile(e, app, artifact, filename);
  } catch (_) { return notFound(); }
}

function handleAdminDownload(e) {
  setPrivateHeaders(e);
  const notFound = () => e.json(404, { ok: false, error: "apk_not_found" });
  try {
    const context = authorizedAdminContext(e.app || $app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const artifactId = text(e.request.pathValue("artifact"), 15);
    const rawTicket = text(e.request.pathValue("ticket"), 43);
    const filename = text(e.request.pathValue("filename"), 220);
    const digest = ticketDigest(rawTicket);
    if (!RECORD_ID_PATTERN.test(artifactId) || !TOKEN_PATTERN.test(rawTicket) || !FILE_PATTERN.test(filename) || !SHA256_PATTERN.test(digest)) return notFound();
    const app = e.app || $app;
    const ticket = first(app, TICKETS, "token_digest = {:digest}", { digest });
    if (!ticket) return notFound();
    if (iso(recordValue(ticket, "used_at"))) return notFound();
    if (new Date(iso(recordValue(ticket, "expires_at"))).getTime() <= Date.now()) return notFound();
    if (relationId(ticket, "artifact") !== artifactId || relationId(ticket, "user") !== context.user.id || relationId(ticket, "device") !== context.device.id) return notFound();
    const artifact = findRecord(app, ARTIFACTS, artifactId);
    const profile = artifact ? findRecord(app, PROFILES, relationId(artifact, "profile")) : null;
    if (!artifact || !profile || recordString(profile, "status", 20) !== "active" || recordString(artifact, "kind", 20) !== "apk"
      || recordString(artifact, "lifecycle_status", 20) !== "available" || recordString(artifact, "file_name", 220) !== filename) return notFound();
    const assignmentId = relationId(ticket, "assignment");
    const assignment = assignmentId ? findRecord(app, ASSIGNMENTS, assignmentId) : null;
    if (assignmentId) {
      if (!assignment || relationId(assignment, "artifact") !== artifactId || recordString(assignment, "status", 20) !== "active"
        || relationId(assignment, "user") !== context.user.id || relationId(assignment, "device") !== context.device.id
        || relationId(assignment, "store") !== context.storeId) return notFound();
    } else if (relationId(ticket, "profile") !== profile.id || !generalPublished(app, artifact.id)) return notFound();
    app.runInTransaction((tx) => {
      const lockedTicket = findRecord(tx, TICKETS, ticket.id);
      if (!lockedTicket || iso(recordValue(lockedTicket, "used_at"))) throw new Error("ticket_used");
      if (new Date(iso(recordValue(lockedTicket, "expires_at"))).getTime() <= Date.now()) throw new Error("ticket_expired");
      const lockedArtifact = findRecord(tx, ARTIFACTS, artifact.id);
      const lockedProfile = lockedArtifact ? findRecord(tx, PROFILES, relationId(lockedArtifact, "profile")) : null;
      if (!lockedArtifact || !lockedProfile || recordString(lockedProfile, "status", 20) !== "active"
        || recordString(lockedArtifact, "lifecycle_status", 20) !== "available") throw new Error("release_not_available");
      const lockedAssignment = assignmentId ? findRecord(tx, ASSIGNMENTS, assignmentId) : null;
      if (assignmentId && (!lockedAssignment || recordString(lockedAssignment, "status", 20) !== "active")) throw new Error("assignment_not_found");
      if (!assignmentId && (relationId(lockedTicket, "profile") !== lockedProfile.id || !generalPublished(tx, lockedArtifact.id))) throw new Error("release_not_available");
      lockedTicket.set("used_at", new Date().toISOString()); tx.save(lockedTicket);
      if (lockedAssignment) {
        lockedAssignment.set("download_count", recordNumber(lockedAssignment, "download_count") + 1);
        lockedAssignment.set("last_downloaded_at", new Date().toISOString()); tx.save(lockedAssignment);
      }
      writeEvent(tx, "download_succeeded", "succeeded", {
        profileId: lockedProfile.id, artifactId: lockedArtifact.id, assignmentId: lockedAssignment ? lockedAssignment.id : "",
        storeId: context.storeId, targetUserId: context.user.id, deviceId: context.device.id, actorId: context.user.id,
      });
    });
    return serveApkFile(e, app, artifact, filename);
  } catch (_) { return notFound(); }
}

module.exports = {
  ARTIFACTS, ASSIGNMENTS, BRAND_ASSETS, ENGINE_CONTRACT_VERSION, ENGINE_NAME, ENGINE_VERSION, EVENTS, JOBS, PREVIEW_TTL_MS, PROFILES, RUNNER_AGENTS, TICKETS, TICKET_TTL_MS,
  activeAssignment, adminApiBaseUrl, artifactSnapshot, assignmentSnapshot, authorizationState, authorizedAdminContext, buildPreview,
  brandAssetSnapshot, canonical, engineDescriptor, engineRelease, engineReleaseSnapshot, exactPayload, generalPublished, grantDigest, handleAdminCheckIn, handleAdminDownload, handleAdminPolicy,
  handleAdminPortal, handleAdminTicket, handleMasterAction, handleMasterArtifactDownload, handleMasterConfigure, handleMasterConfirm,
  handleMasterBrandDownload, handleMasterBrandUpload, handleMasterDetail, handleMasterPreview, handleRunnerBrandDownload, handleRunnerClaim, handleRunnerComplete, handleRunnerHeartbeat, handleRunnerStart, handleRunnerUpload,
  isMaster, isStoreAdmin, jobSnapshot, managementReady, masterProfile, nextVersionCode, parseAssignment, parseBrandUpload, parseBuildPreview,
  parseCompletion, parseConfigure, parseUpload, portalResponse, profileIdentityLocked, profileSnapshot, randomToken,
  publishedArtifactForProfile, recipientSnapshot, releaseState, requireAuthenticatedUser, requireRunner, resolveAdminRelease,
  runnerAgentSnapshot, runnerCompatibility, runnerControlResponse, secretEqual, storedPreviewValue, testApproved, ticketDigest, validatedPilotExists,
};
