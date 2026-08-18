/// <reference path="../pb_data/types.d.ts" />

const deviceLib = typeof __hooks === "undefined"
  ? require("./pz_store_user_devices_lib.js")
  : require(`${__hooks}/pz_store_user_devices_lib.js`);

const PROFILES = "admin_app_release_profiles";
const JOBS = "admin_app_build_jobs";
const ARTIFACTS = "admin_app_artifacts";
const ASSIGNMENTS = "admin_app_release_assignments";
const TICKETS = "admin_app_download_tickets";
const EVENTS = "admin_app_release_events";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CERT_PATTERN = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const FILE_PATTERN = /^[A-Za-z0-9._-]+$/;
const RUNNER_PATTERN = /^[A-Za-z0-9._:-]{3,100}$/;
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const TICKET_TTL_MS = 2 * 60 * 1000;
const MAX_APK_BYTES = 100 * 1024 * 1024;

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
    return [PROFILES, JOBS, ARTIFACTS, ASSIGNMENTS, TICKETS, EVENTS].every((name) => {
      const collection = app.findCollectionByNameOrId(name);
      return collection.listRule === null && collection.viewRule === null && collection.createRule === null
        && collection.updateRule === null && collection.deleteRule === null;
    }) && app.findCollectionByNameOrId(ARTIFACTS).fields.getByName("file").protected === true;
  } catch (_) { return false; }
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

function profileSnapshot(profile) {
  if (!profile) return null;
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
    minimum_supported_version_code: recordNumber(profile, "minimum_supported_version_code"),
    status: recordString(profile, "status", 20),
    created: iso(recordValue(profile, "created")),
    updated: iso(recordValue(profile, "updated")),
  };
}

function jobSnapshot(job) {
  if (!job) return null;
  const preview = recordValue(job, "preview_json");
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
    failure_code: recordString(job, "failure_code", 80),
    started_at: iso(recordValue(job, "started_at")),
    completed_at: iso(recordValue(job, "completed_at")),
    created: iso(recordValue(job, "created")),
    updated: iso(recordValue(job, "updated")),
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

function portalResponse(app, context, resolved, grant) {
  const assignment = assignmentSnapshot(resolved.assignment, app);
  const artifact = artifactSnapshot(resolved.artifact);
  const profile = profileSnapshot(resolved.profile);
  return {
    ok: true,
    access: {
      assignment, artifact, profile,
      grant_present: !!grant,
      update_required: assignment.installed_version_code > 0
        && assignment.installed_version_code < profile.minimum_supported_version_code,
      can_validate_pilot: assignment.stage === "pilot"
        && assignment.installed_version_code === artifact.version_code
        && !assignment.validated_at,
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
    "signing_identity_required", "assignment_revoked",
  ].includes(code) ? code : "";
}

function statusFor(code) {
  if (code === "unauthorized") return 403;
  if (["invalid_payload"].includes(code)) return 400;
  if (["assignment_not_found", "release_not_available", "ticket_not_found", "artifact_not_found"].includes(code)) return 404;
  return 409;
}

function sendError(e, error, fallback) {
  const code = safeErrorCode(error) || fallback;
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
    const profile = first($app, PROFILES, "channel = {:channel}", { channel });
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
      ok: true, profile: profileSnapshot(profile), jobs: jobs.map(jobSnapshot),
      artifacts: artifacts.map(artifactSnapshot), assignments: assignments.map((item) => assignmentSnapshot(item, $app)),
      eligible_devices: eligible, events: events.map(eventSnapshot),
    });
  } catch (_) { return e.json(500, { ok: false, error: "admin_app_detail_failed" }); }
}

function parseConfigure(body) {
  const keys = ["admin_url", "channel", "confirmation", "current_version_code", "current_version_name", "display_name", "firebase_app_id", "firebase_project_id", "package_name", "signing_cert_sha256"];
  if (!exactPayload(body, keys)) return null;
  const parsed = {
    channel: text(bodyValue(body, "channel"), 20), displayName: text(bodyValue(body, "display_name"), 120),
    packageName: text(bodyValue(body, "package_name"), 190), adminUrl: text(bodyValue(body, "admin_url"), 500),
    firebaseProjectId: text(bodyValue(body, "firebase_project_id"), 128), firebaseAppId: text(bodyValue(body, "firebase_app_id"), 255),
    signingCert: text(bodyValue(body, "signing_cert_sha256"), 95).toUpperCase(),
    currentVersionCode: integer(bodyValue(body, "current_version_code")),
    currentVersionName: text(bodyValue(body, "current_version_name"), 40),
    confirmation: text(bodyValue(body, "confirmation"), 80),
  };
  if (!["staging", "production"].includes(parsed.channel) || !parsed.displayName || !PACKAGE_PATTERN.test(parsed.packageName)
    || !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/.*)?$/.test(parsed.adminUrl)
    || (parsed.firebaseProjectId && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(parsed.firebaseProjectId))
    || (!!parsed.firebaseProjectId !== !!parsed.firebaseAppId)
    || (parsed.signingCert && !CERT_PATTERN.test(parsed.signingCert))
    || parsed.currentVersionCode < 1 || !VERSION_PATTERN.test(parsed.currentVersionName)
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
      let profile = first(app, PROFILES, "channel = {:channel}", { channel: parsed.channel });
      if (profile) {
        const identityLocked = records(app, JOBS, "profile = {:profile} && status = 'succeeded'", "", 1, { profile: profile.id }).length > 0;
        if (identityLocked && (recordString(profile, "package_name", 190) !== parsed.packageName
          || (recordString(profile, "signing_cert_sha256", 95) && recordString(profile, "signing_cert_sha256", 95) !== parsed.signingCert))) {
          throw new Error("profile_identity_locked");
        }
        profile.set("display_name", parsed.displayName);
        profile.set("admin_url", parsed.adminUrl);
        if (!identityLocked) profile.set("package_name", parsed.packageName);
        if (!identityLocked || !recordString(profile, "signing_cert_sha256", 95)) profile.set("signing_cert_sha256", parsed.signingCert);
        // Los valores vacíos preservan una configuración Firebase existente que el panel no expone.
        if (parsed.firebaseProjectId && parsed.firebaseAppId) {
          profile.set("firebase_project_id", parsed.firebaseProjectId);
          profile.set("firebase_app_id", parsed.firebaseAppId);
        }
        if (!identityLocked) {
          profile.set("latest_version_code", parsed.currentVersionCode);
          profile.set("latest_version_name", parsed.currentVersionName);
        }
        profile.set("updated_by", e.auth.id);
        app.save(profile);
      } else {
        profile = createRecord(app, PROFILES, {
          channel: parsed.channel, display_name: parsed.displayName, package_name: parsed.packageName,
          admin_url: parsed.adminUrl, firebase_project_id: parsed.firebaseProjectId, firebase_app_id: parsed.firebaseAppId,
          signing_cert_sha256: parsed.signingCert, latest_version_code: parsed.currentVersionCode, latest_version_name: parsed.currentVersionName,
          minimum_supported_version_code: 0, status: "active", created_by: e.auth.id, updated_by: e.auth.id,
        });
        writeEvent(app, "profile_created", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { channel: parsed.channel, package_name: parsed.packageName } });
      }
      response = { ok: true, profile: profileSnapshot(profile) };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "admin_app_configure_failed"); }
}

function parseBuildPreview(body) {
  if (!exactPayload(body, ["channel", "version_code", "version_name"])) return null;
  const parsed = { channel: text(bodyValue(body, "channel"), 20), versionCode: integer(bodyValue(body, "version_code")), versionName: text(bodyValue(body, "version_name"), 40) };
  return ["staging", "production"].includes(parsed.channel) && parsed.versionCode > 0 && VERSION_PATTERN.test(parsed.versionName) ? parsed : null;
}

function buildPreview(profile, parsed) {
  return {
    schema_version: 1, app: "mobile-admin", channel: recordString(profile, "channel", 20),
    operation: recordNumber(profile, "latest_version_code") > 0 ? "update" : "provision",
    identity: {
      display_name: recordString(profile, "display_name", 120), package_name: recordString(profile, "package_name", 190),
      admin_url: recordString(profile, "admin_url", 500), signing_cert_sha256: recordString(profile, "signing_cert_sha256", 95),
    },
    build: { version_code: parsed.versionCode, version_name: parsed.versionName, apk: true, build_type: "release" },
    delivery: { authenticated_only: true, pilot_required: true, gradual_rollout: true, mandatory_after_general: true },
  };
}

function handleMasterPreview(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const parsed = parseBuildPreview(e.requestInfo().body || {});
  if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const profile = first($app, PROFILES, "channel = {:channel}", { channel: parsed.channel });
    if (!profile) throw new Error("profile_not_found");
    if (recordString(profile, "status", 20) !== "active") throw new Error("release_not_available");
    if (!CERT_PATTERN.test(recordString(profile, "signing_cert_sha256", 95))) throw new Error("signing_identity_required");
    if (parsed.versionCode <= recordNumber(profile, "latest_version_code")) throw new Error("version_code_must_increase");
    const preview = buildPreview(profile, parsed);
    const hash = sha256Domain("pz_admin_app_preview:v1", canonical(preview));
    if (!SHA256_PATTERN.test(hash)) throw new Error("invalid_payload");
    const existing = first($app, JOBS, "preview_hash = {:hash}", { hash });
    if (existing) {
      if (recordString(existing, "status", 30) === "preview"
        && new Date(iso(recordValue(existing, "preview_expires_at"))).getTime() <= Date.now()) {
        existing.set("preview_expires_at", new Date(Date.now() + PREVIEW_TTL_MS).toISOString());
        existing.set("preview_json", preview); existing.set("created_by", e.auth.id); $app.save(existing);
      }
      return e.json(200, { ok: true, idempotent: true, job: jobSnapshot(existing) });
    }
    const expires = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const job = createRecord($app, JOBS, {
      profile: profile.id, operation: preview.operation, status: "preview", version_code: parsed.versionCode,
      version_name: parsed.versionName, preview_hash: hash, preview_json: preview, preview_expires_at: expires,
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
      if (recordNumber(job, "version_code") <= recordNumber(profile, "latest_version_code")) throw new Error("version_code_must_increase");
      const currentPreview = buildPreview(profile, {
        versionCode: recordNumber(job, "version_code"), versionName: recordString(job, "version_name", 40),
      });
      if (sha256Domain("pz_admin_app_preview:v1", canonical(currentPreview)) !== hash) throw new Error("version_identity_mismatch");
      job.set("status", "queued"); job.set("confirmed_by", e.auth.id); job.set("confirmed_at", new Date().toISOString()); app.save(job);
      writeEvent(app, "build_queued", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { job_id: job.id, version_code: recordNumber(job, "version_code") } });
      response = { ok: true, idempotent: false, job: jobSnapshot(job) };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "admin_app_confirm_failed"); }
}

function parseAssignment(body) {
  if (!exactPayload(body, ["action", "artifact_id", "device_id", "stage", "user_id", "wave"])) return null;
  const parsed = {
    artifactId: text(bodyValue(body, "artifact_id"), 15), userId: text(bodyValue(body, "user_id"), 15),
    deviceId: text(bodyValue(body, "device_id"), 15), stage: text(bodyValue(body, "stage"), 20), wave: integer(bodyValue(body, "wave")),
  };
  return text(bodyValue(body, "action"), 40) === "assign" && [parsed.artifactId, parsed.userId, parsed.deviceId].every((id) => RECORD_ID_PATTERN.test(id))
    && ["pilot", "gradual", "general"].includes(parsed.stage) && parsed.wave >= 0 ? parsed : null;
}

function validatedPilotExists(app, artifactId) {
  return records(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'pilot' && status = 'active' && validated_at != ''", "", 1, { artifact: artifactId }).length > 0;
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
  if (parsed.stage === "pilot" && records(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'pilot' && status = 'active'", "", 1, { artifact: artifact.id }).length) {
    throw new Error("pilot_already_exists");
  }
  if (parsed.stage !== "pilot" && !validatedPilotExists(app, artifact.id)) throw new Error("pilot_required");
  if (parsed.stage === "general" && !records(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'gradual' && status = 'active'", "", 1, { artifact: artifact.id }).length) {
    throw new Error("pilot_required");
  }
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
    stage: parsed.stage, wave: parsed.wave, status: "active", grant_digest: grantDigest(grant), download_count: 0,
    installed_version_code: 0, created_by: e.auth.id,
  });
  writeEvent(app, parsed.stage === "pilot" ? "assignment_created" : "release_promoted", "succeeded", {
    profileId: profile.id, artifactId: artifact.id, assignmentId: assignment.id, storeId: relationId(user, "store"),
    targetUserId: user.id, deviceId: device.id, actorId: e.auth.id, snapshot: { stage: parsed.stage, wave: parsed.wave },
  });
  return { idempotent: false, assignment, grant };
}

function handleMasterAction(e) {
  setPrivateHeaders(e);
  if (!isMaster(e.auth)) return e.json(403, { ok: false, error: "unauthorized" });
  const body = e.requestInfo().body || {};
  const action = text(bodyValue(body, "action"), 40);
  try {
    let response = null;
    $app.runInTransaction((app) => {
      if (action === "assign") {
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
      if (action === "set_minimum") {
        if (!exactPayload(body, ["action", "confirmation", "profile_id", "version_code"])) throw new Error("invalid_payload");
        const profile = findRecord(app, PROFILES, text(bodyValue(body, "profile_id"), 15));
        const versionCode = integer(bodyValue(body, "version_code"));
        if (!profile || versionCode < 0 || versionCode > recordNumber(profile, "latest_version_code")
          || text(bodyValue(body, "confirmation"), 80) !== `EXIGIR VERSION ${versionCode}`) throw new Error("invalid_payload");
        if (versionCode > 0) {
          const artifact = first(app, ARTIFACTS, "profile = {:profile} && kind = 'apk' && version_code = {:version} && lifecycle_status = 'available'", { profile: profile.id, version: versionCode });
          if (!artifact || !validatedPilotExists(app, artifact.id)
            || !records(app, ASSIGNMENTS, "artifact = {:artifact} && stage = 'general' && status = 'active'", "", 1, { artifact: artifact.id }).length) {
            throw new Error("general_release_required");
          }
        }
        const previous = recordNumber(profile, "minimum_supported_version_code");
        profile.set("minimum_supported_version_code", versionCode); profile.set("updated_by", e.auth.id); app.save(profile);
        writeEvent(app, "minimum_version_changed", "succeeded", { profileId: profile.id, actorId: e.auth.id, snapshot: { previous, current: versionCode } });
        response = { ok: true, profile: profileSnapshot(profile) };
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
        response = { ok: true, profile: profileSnapshot(profile) };
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
      throw new Error("invalid_payload");
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "admin_app_action_failed"); }
}

function handleAdminPortal(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["grant"])) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const context = authorizedAdminContext($app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const grant = text(bodyValue(body, "grant"), 43);
    if (grant && !TOKEN_PATTERN.test(grant)) throw new Error("assignment_not_found");
    const resolved = activeAssignment($app, context, grant);
    return e.json(200, portalResponse($app, context, resolved, grant));
  } catch (error) { return sendError(e, error, "assignment_not_found"); }
}

function handleAdminTicket(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["grant"])) return e.json(400, { ok: false, error: "invalid_payload" });
  try {
    const context = authorizedAdminContext($app, e.auth, requestHeader(e, deviceLib.DEVICE_HEADER));
    const grant = text(bodyValue(body, "grant"), 43);
    if (grant && !TOKEN_PATTERN.test(grant)) throw new Error("assignment_not_found");
    const resolved = activeAssignment($app, context, grant);
    const rawTicket = randomToken();
    const expires = new Date(Date.now() + TICKET_TTL_MS).toISOString();
    createRecord($app, TICKETS, {
      assignment: resolved.assignment.id, artifact: resolved.artifact.id, user: context.user.id, device: context.device.id,
      token_digest: ticketDigest(rawTicket), expires_at: expires,
    });
    writeEvent($app, "download_ticket_created", "allowed", {
      profileId: resolved.profile.id, artifactId: resolved.artifact.id, assignmentId: resolved.assignment.id,
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
    const access = activeAssignment($app, context, "");
    const profile = access.profile;
    if (recordString(profile, "package_name", 190) !== packageName) throw new Error("profile_not_found");
    const availableVersion = recordNumber(access.artifact, "version_code");
    const minimumVersion = recordNumber(profile, "minimum_supported_version_code");
    return e.json(200, {
      ok: true, policy: {
        package_name: packageName, current_version_code: versionCode, current_version_name: versionName,
        latest_version_code: recordNumber(profile, "latest_version_code"), latest_version_name: recordString(profile, "latest_version_name", 40),
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
    const resolved = activeAssignment($app, context, "");
    const profile = resolved.profile;
    const assignment = resolved.assignment;
    if (recordString(profile, "package_name", 190) !== packageName) throw new Error("profile_not_found");
    assignment.set("installed_version_code", versionCode); assignment.set("installed_version_name", versionName);
    assignment.set("installed_at", new Date().toISOString()); $app.save(assignment);
    writeEvent($app, "check_in", "succeeded", { profileId: profile.id, artifactId: relationId(assignment, "artifact"), assignmentId: assignment.id, storeId: context.storeId, targetUserId: context.user.id, deviceId: context.device.id, actorId: context.user.id, snapshot: { package_name: packageName, version_code: versionCode, version_name: versionName } });
    return e.json(200, { ok: true, assignment: assignmentSnapshot(assignment, $app), policy: { minimum_supported_version_code: recordNumber(profile, "minimum_supported_version_code"), update_required: versionCode < recordNumber(profile, "minimum_supported_version_code") } });
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

function handleRunnerClaim(e) {
  setPrivateHeaders(e);
  const body = e.requestInfo().body || {};
  if (!exactPayload(body, ["runner_id"])) return e.json(400, { ok: false, error: "invalid_payload" });
  const runnerId = text(bodyValue(body, "runner_id"), 100);
  if (!RUNNER_PATTERN.test(runnerId) || requestHeader(e, "x-pz-admin-app-runner-id") !== runnerId) return e.json(401, { ok: false, error: "unauthorized" });
  try {
    let response = { ok: true, job: null };
    $app.runInTransaction((app) => {
      const job = records(app, JOBS, "status = 'queued'", "+created", 1, {})[0] || null;
      if (!job) return;
      const profile = findRecord(app, PROFILES, relationId(job, "profile"));
      if (!profile || recordString(profile, "status", 20) !== "active") throw new Error("profile_not_found");
      job.set("status", "claimed"); job.set("runner_id", runnerId); job.set("started_at", new Date().toISOString()); app.save(job);
      response = { ok: true, job: { ...jobSnapshot(job), preview: recordValue(job, "preview_json"), profile: profileSnapshot(profile) } };
    });
    return e.json(200, response);
  } catch (_) { return e.json(500, { ok: false, error: "runner_claim_failed" }); }
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
      const same = recordString(existing, "file_name", 220) === parsed.fileName && recordString(existing, "sha256", 64) === parsed.sha256
        && recordNumber(existing, "bytes") === parsed.bytes && !!recordString(existing, "file", 220);
      if (!same) throw new Error("version_identity_mismatch");
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
  if (!exactPayload(body, ["artifacts", "failure_code", "job_id", "runner_id", "signing_cert_sha256", "status"])) return null;
  const parsed = {
    jobId: text(bodyValue(body, "job_id"), 15), runnerId: text(bodyValue(body, "runner_id"), 100),
    status: text(bodyValue(body, "status"), 30), failureCode: text(bodyValue(body, "failure_code"), 80),
    signingCert: text(bodyValue(body, "signing_cert_sha256"), 95).toUpperCase(),
    artifacts: Array.isArray(bodyValue(body, "artifacts")) ? bodyValue(body, "artifacts").map((item) => ({
      kind: text(bodyValue(item, "kind"), 30), fileName: text(bodyValue(item, "file_name"), 220),
      sha256: text(bodyValue(item, "sha256"), 64).toLowerCase(), bytes: integer(bodyValue(item, "bytes")),
    })) : [],
  };
  if (!RECORD_ID_PATTERN.test(parsed.jobId) || !RUNNER_PATTERN.test(parsed.runnerId) || !["succeeded", "failed", "needs_attention"].includes(parsed.status)) return null;
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
        profile.set("signing_cert_sha256", parsed.signingCert); profile.set("latest_version_code", recordNumber(job, "version_code"));
        profile.set("latest_version_name", recordString(job, "version_name", 40)); profile.set("updated_by", relationId(job, "confirmed_by") || relationId(job, "created_by")); app.save(profile);
        writeEvent(app, "build_completed", "succeeded", { profileId: profile.id, artifactId: (staged.find((item) => recordString(item, "kind", 20) === "apk") || {}).id || "", actorId: relationId(job, "confirmed_by"), snapshot: { job_id: job.id, version_code: recordNumber(job, "version_code") } });
      }
      app.save(job); response = { ok: true, job: jobSnapshot(job), profile: profileSnapshot(profile) };
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error, "runner_completion_failed"); }
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
    const assignment = findRecord(app, ASSIGNMENTS, relationId(ticket, "assignment"));
    if (!assignment || relationId(assignment, "artifact") !== artifactId || recordString(assignment, "status", 20) !== "active"
      || relationId(assignment, "user") !== context.user.id || relationId(assignment, "device") !== context.device.id || relationId(assignment, "store") !== context.storeId) return notFound();
    const artifact = findRecord(app, ARTIFACTS, artifactId);
    const profile = artifact ? findRecord(app, PROFILES, relationId(artifact, "profile")) : null;
    if (!artifact || !profile || recordString(profile, "status", 20) !== "active" || recordString(artifact, "kind", 20) !== "apk"
      || recordString(artifact, "lifecycle_status", 20) !== "available" || recordString(artifact, "file_name", 220) !== filename) return notFound();
    app.runInTransaction((tx) => {
      const lockedTicket = findRecord(tx, TICKETS, ticket.id);
      const lockedAssignment = findRecord(tx, ASSIGNMENTS, assignment.id);
      if (!lockedTicket || iso(recordValue(lockedTicket, "used_at"))) throw new Error("ticket_used");
      if (new Date(iso(recordValue(lockedTicket, "expires_at"))).getTime() <= Date.now()) throw new Error("ticket_expired");
      if (!lockedAssignment || recordString(lockedAssignment, "status", 20) !== "active") throw new Error("assignment_not_found");
      lockedTicket.set("used_at", new Date().toISOString()); tx.save(lockedTicket);
      lockedAssignment.set("download_count", recordNumber(lockedAssignment, "download_count") + 1);
      lockedAssignment.set("last_downloaded_at", new Date().toISOString()); tx.save(lockedAssignment);
      writeEvent(tx, "download_succeeded", "succeeded", { profileId: profile.id, artifactId: artifact.id, assignmentId: assignment.id, storeId: context.storeId, targetUserId: context.user.id, deviceId: context.device.id, actorId: context.user.id });
    });
    const storedName = recordString(artifact, "file", 220);
    const base = typeof artifact.baseFilesPath === "function" ? text(artifact.baseFilesPath(), 1000) : "";
    if (!storedName || !FILE_PATTERN.test(storedName) || !base || base.includes("..")) return notFound();
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
  } catch (_) { return notFound(); }
}

module.exports = {
  ARTIFACTS, ASSIGNMENTS, EVENTS, JOBS, PREVIEW_TTL_MS, PROFILES, TICKETS, TICKET_TTL_MS,
  activeAssignment, artifactSnapshot, assignmentSnapshot, authorizedAdminContext, buildPreview,
  canonical, exactPayload, grantDigest, handleAdminCheckIn, handleAdminDownload, handleAdminPolicy,
  handleAdminPortal, handleAdminTicket, handleMasterAction, handleMasterConfigure, handleMasterConfirm,
  handleMasterDetail, handleMasterPreview, handleRunnerClaim, handleRunnerComplete, handleRunnerUpload,
  isMaster, isStoreAdmin, jobSnapshot, managementReady, parseAssignment, parseBuildPreview,
  parseCompletion, parseConfigure, parseUpload, portalResponse, profileSnapshot, randomToken,
  requireAuthenticatedUser, requireRunner, secretEqual, ticketDigest, validatedPilotExists,
};
