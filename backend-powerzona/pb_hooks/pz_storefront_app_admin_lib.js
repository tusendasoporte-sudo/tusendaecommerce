/// <reference path="../pb_data/types.d.ts" />

const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);

const PROFILES = "storefront_app_build_profiles";
const JOBS = "storefront_app_build_jobs";
const ARTIFACTS = "storefront_app_artifacts";
const ACTIONS = "storefront_app_admin_actions";
const APP_CONFIGS = "storefront_app_configs";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RECOVERY_DAYS = 30;
const RECOVERY_MS = RECOVERY_DAYS * 24 * 60 * 60 * 1000;

function text(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
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
  if (!value) return "";
  try {
    if (typeof value.string === "function") value = value.string();
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  } catch (_) { return ""; }
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function records(app, collection, filter, sort, limit, params) {
  try { return app.findRecordsByFilter(collection, filter || "", sort || "", limit || 200, 0, params || {}) || []; }
  catch (_) { return []; }
}

function isMaster(record) {
  return recordString(record, "role", 40) === "master_admin"
    && recordString(record, "status", 40).toLowerCase() !== "suspended";
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

function profileDistributionStatus(profile) {
  const value = recordString(profile, "distribution_status", 30);
  return value === "withdrawn" ? "withdrawn" : "active";
}

function profileLifecycleStatus(profile) {
  const value = recordString(profile, "lifecycle_status", 30);
  if (["deletion_scheduled", "deleted"].includes(value)) return value;
  return recordString(profile, "status", 30) === "retired" ? "deleted" : "active";
}

function artifactLifecycleStatus(artifact) {
  const value = recordString(artifact, "lifecycle_status", 30);
  return ["deletion_queued", "deleted"].includes(value) ? value : "available";
}

function profileAdminSnapshot(profile, now) {
  if (!profile) return null;
  const lifecycleStatus = profileLifecycleStatus(profile);
  const distributionStatus = profileDistributionStatus(profile);
  const recoverUntil = isoDate(recordValue(profile, "deletion_recover_until"));
  const recoverDeadline = recoverUntil ? new Date(recoverUntil) : null;
  const canRecover = lifecycleStatus === "deletion_scheduled"
    && !!recoverDeadline
    && recoverDeadline.getTime() > new Date(now || Date.now()).getTime();
  return {
    distribution_status: distributionStatus,
    distribution_reason: recordString(profile, "distribution_reason", 40),
    distribution_changed_at: isoDate(recordValue(profile, "distribution_changed_at")),
    lifecycle_status: lifecycleStatus,
    deletion_requested_at: isoDate(recordValue(profile, "deletion_requested_at")),
    deletion_recover_until: recoverUntil,
    deleted_at: isoDate(recordValue(profile, "deleted_at")),
    downloads_allowed: distributionStatus === "active" && lifecycleStatus === "active",
    can_recover: canRecover,
  };
}

function artifactAdminSnapshot(artifact) {
  return {
    lifecycle_status: artifactLifecycleStatus(artifact),
    deleted_at: isoDate(recordValue(artifact, "deleted_at")),
  };
}

function actionSnapshot(action) {
  if (!action) return null;
  return {
    id: text(action.id || recordString(action, "id", 15), 15),
    type: recordString(action, "type", 30),
    status: recordString(action, "status", 30),
    not_before: isoDate(recordValue(action, "not_before")),
    reason: recordString(action, "reason", 500),
    failure_code: recordString(action, "failure_code", 80),
    started_at: isoDate(recordValue(action, "started_at")),
    completed_at: isoDate(recordValue(action, "completed_at")),
    created: isoDate(recordValue(action, "created")),
    updated: isoDate(recordValue(action, "updated")),
  };
}

function assertBuildAllowed(profile) {
  if (profileLifecycleStatus(profile) !== "active") throw new Error("app_deletion_pending");
}

function assertDistributionAvailable(profile, artifact) {
  const state = profileAdminSnapshot(profile);
  if (!state || !state.downloads_allowed) throw new Error("app_distribution_withdrawn");
  if (artifact && artifactLifecycleStatus(artifact) !== "available") throw new Error("artifact_not_available");
}

function parseAdminActionPayload(body) {
  if (!exactPayload(body, ["action", "confirmation", "reason", "store_id"])) return null;
  const parsed = {
    storeId: text(bodyValue(body, "store_id"), 15),
    action: text(bodyValue(body, "action"), 30),
    confirmation: text(bodyValue(body, "confirmation"), 240),
    reason: text(bodyValue(body, "reason"), 500),
  };
  if (!RECORD_ID_PATTERN.test(parsed.storeId)
    || !["withdraw", "reactivate", "delete_artifacts", "delete_app", "recover_app"].includes(parsed.action)
    || String(bodyValue(body, "reason") || "").length > 500
    || String(bodyValue(body, "confirmation") || "").length > 240) return null;
  return parsed;
}

function hashConfirmation(value, sha256) {
  const hash = sha256 || ((material) => $security.sha256(material));
  return text(hash(`pz_storefront_app_admin_confirmation:v1|${String(value || "")}`), 64).toLowerCase();
}

function expectedDeleteConfirmation(profile) {
  return `ELIMINAR APP ${recordString(profile, "package_name", 190)}`;
}

function isPremium(store, now) {
  const state = plans.resolvePlanState(store, now || new Date());
  return state.plan === "premium" && !state.isExpired && state.capabilities.push_campaigns_enabled;
}

function activeBuildJob(app, storeId) {
  return findFirst(app, JOBS, "store = {:store} && (status = 'queued' || status = 'claimed')", { store: storeId });
}

function activeAdminAction(app, profileId) {
  return findFirst(app, ACTIONS, "profile = {:profile} && (status = 'queued' || status = 'scheduled' || status = 'claimed')", {
    profile: profileId,
  });
}

function artifactTarget(artifact) {
  return {
    id: text(artifact.id || recordString(artifact, "id", 15), 15),
    kind: recordString(artifact, "kind", 30),
    file_name: recordString(artifact, "file_name", 220),
    storage_locator: recordString(artifact, "storage_locator", 1000),
    sha256: recordString(artifact, "sha256", 64).toLowerCase(),
    bytes: recordNumber(artifact, "bytes"),
  };
}

function targetArtifacts(app, profileId, includeAll) {
  return records(app, ARTIFACTS, "profile = {:profile}", "+created", 500, { profile: profileId })
    .filter((artifact) => artifactLifecycleStatus(artifact) !== "deleted")
    .filter((artifact) => includeAll || ["apk", "aab"].includes(recordString(artifact, "kind", 30)))
    .map(artifactTarget)
    .filter((item) => RECORD_ID_PATTERN.test(item.id)
      && ["apk", "aab", "checksums", "instructions", "build_manifest"].includes(item.kind)
      && item.file_name && item.storage_locator && SHA256_PATTERN.test(item.sha256) && item.bytes > 0);
}

function createAdminAction(app, store, profile, actor, type, status, notBefore, reason, confirmation) {
  const action = new Record(app.findCollectionByNameOrId(ACTIONS), {});
  const targets = targetArtifacts(app, profile.id, type === "delete_app");
  if (!targets.length && type === "delete_artifacts") throw new Error("artifacts_missing");
  action.set("store", store.id);
  action.set("profile", profile.id);
  action.set("type", type);
  action.set("status", status);
  action.set("not_before", notBefore || "");
  action.set("target_json", { schema_version: 1, artifacts: targets });
  action.set("requested_by", actor.id);
  action.set("confirmation_sha256", hashConfirmation(confirmation));
  action.set("reason", reason);
  app.save(action);
  return action;
}

function setDistribution(app, store, profile, actor, status, reason, activityAction, summary) {
  const previous = profileDistributionStatus(profile);
  profile.set("distribution_status", status);
  profile.set("distribution_reason", reason);
  profile.set("distribution_changed_at", new Date().toISOString());
  profile.set("distribution_changed_by", actor ? actor.id : "");
  if (actor) profile.set("updated_by", actor.id);
  app.save(profile);
  if (actor && previous !== status) {
    storeActivity.createActivity(app, {
      storeId: store.id,
      actor,
      module: "operation",
      action: activityAction,
      severity: "critical",
      resourceType: "storefront_app_distribution",
      resourceId: profile.id,
      resourceLabel: recordString(profile, "display_name", 120) || "App Android",
      changedFields: ["android_distribution_status"],
      previousValues: { android_distribution_status: previous },
      newValues: { android_distribution_status: status },
      summary,
      sourceEventKey: `storefront_app:${activityAction}:${profile.id}:${Date.now()}`,
    });
  }
  return profile;
}

function withdrawForPlanDowngrade(app, store, actor, previousPlan, nextPlan) {
  if (previousPlan !== "premium" || nextPlan === "premium") return null;
  const profile = findFirst(app, PROFILES, "store = {:store}", { store: store.id });
  if (!profile || profileLifecycleStatus(profile) === "deleted") return null;
  if (profileDistributionStatus(profile) === "withdrawn") return profileAdminSnapshot(profile);
  setDistribution(
    app, store, profile, actor, "withdrawn", "plan_downgrade",
    "app_distribution_withdrawn_by_plan",
    "Distribución Android retirada automáticamente por bajada de Premium; la tienda web no fue suspendida",
  );
  return profileAdminSnapshot(profile);
}

function createAdminActivity(app, store, profile, actor, action, summary, changedFields) {
  return storeActivity.createActivity(app, {
    storeId: store.id,
    actor,
    module: "operation",
    action,
    severity: "critical",
    resourceType: "storefront_app_admin",
    resourceId: profile.id,
    resourceLabel: recordString(profile, "display_name", 120) || "App Android",
    changedFields: changedFields || ["android_app_lifecycle"],
    previousValues: {},
    newValues: profileAdminSnapshot(profile),
    summary,
    sourceEventKey: `storefront_app:${action}:${profile.id}:${Date.now()}`,
  });
}

function applyAdminAction(app, store, profile, actor, parsed, now) {
  const current = new Date(now || Date.now());
  const lifecycle = profileLifecycleStatus(profile);
  const activeAction = activeAdminAction(app, profile.id);
  if (parsed.action === "withdraw") {
    if (lifecycle === "deleted") throw new Error("app_deleted");
    if (profileDistributionStatus(profile) === "withdrawn") throw new Error("distribution_already_withdrawn");
    setDistribution(app, store, profile, actor, "withdrawn", "manual", "app_distribution_withdrawn",
      "Distribución Android retirada; identidad, Firebase, firma y archivos se conservaron");
    return { profile, action: null };
  }
  if (parsed.action === "reactivate") {
    if (lifecycle !== "active") throw new Error("app_deletion_pending");
    if (!isPremium(store, current)) throw new Error("premium_required");
    if (activeAction) throw new Error("admin_action_active");
    if (!targetArtifacts(app, profile.id, false).some((item) => item.kind === "apk")) throw new Error("artifacts_missing");
    if (profileDistributionStatus(profile) === "active") throw new Error("distribution_already_active");
    setDistribution(app, store, profile, actor, "active", "manual", "app_distribution_reactivated",
      "Distribución Android reactivada sin cambiar el estado de la tienda web");
    return { profile, action: null };
  }
  if (parsed.action === "delete_artifacts") {
    if (lifecycle !== "active") throw new Error("app_deletion_pending");
    if (parsed.confirmation !== "ELIMINAR ARTEFACTOS") throw new Error("delete_confirmation_mismatch");
    if (activeAction) throw new Error("admin_action_active");
    if (activeBuildJob(app, store.id)) throw new Error("active_job_exists");
    if (profileDistributionStatus(profile) !== "withdrawn") {
      setDistribution(app, store, profile, actor, "withdrawn", "artifacts_deleted", "app_distribution_withdrawn",
        "Distribución Android retirada antes de eliminar APK/AAB");
    }
    const action = createAdminAction(app, store, profile, actor, "delete_artifacts", "queued", "", parsed.reason, parsed.confirmation);
    createAdminActivity(app, store, profile, actor, "app_artifacts_deletion_queued",
      "Eliminación verificada de APK/AAB enviada al runner; Firebase, firma e identidad se conservarán",
      ["android_artifacts"]);
    return { profile, action };
  }
  if (parsed.action === "delete_app") {
    if (lifecycle !== "active") throw new Error("app_deletion_pending");
    if (parsed.confirmation !== expectedDeleteConfirmation(profile)) throw new Error("delete_confirmation_mismatch");
    if (activeAction) throw new Error("admin_action_active");
    if (activeBuildJob(app, store.id)) throw new Error("active_job_exists");
    const recoverUntil = new Date(current.getTime() + RECOVERY_MS).toISOString();
    if (profileDistributionStatus(profile) !== "withdrawn") {
      setDistribution(app, store, profile, actor, "withdrawn", "app_deletion", "app_distribution_withdrawn",
        "Distribución Android retirada al solicitar eliminar la app");
    }
    profile.set("lifecycle_status", "deletion_scheduled");
    profile.set("deletion_requested_at", current.toISOString());
    profile.set("deletion_recover_until", recoverUntil);
    profile.set("deletion_requested_by", actor.id);
    profile.set("deletion_confirmation_sha256", hashConfirmation(parsed.confirmation));
    profile.set("updated_by", actor.id);
    app.save(profile);
    const action = createAdminAction(app, store, profile, actor, "delete_app", "scheduled", recoverUntil, parsed.reason, parsed.confirmation);
    createAdminActivity(app, store, profile, actor, "app_deletion_scheduled",
      `Eliminación de app programada con ${RECOVERY_DAYS} días de recuperación; la tienda web permanece independiente`);
    return { profile, action };
  }
  if (parsed.action === "recover_app") {
    if (lifecycle !== "deletion_scheduled") throw new Error("app_not_recoverable");
    if (parsed.confirmation !== "RECUPERAR APP") throw new Error("delete_confirmation_mismatch");
    const recoverUntil = new Date(isoDate(recordValue(profile, "deletion_recover_until")));
    if (!Number.isFinite(recoverUntil.getTime()) || recoverUntil.getTime() <= current.getTime()) throw new Error("recovery_window_expired");
    if (!activeAction || recordString(activeAction, "type", 30) !== "delete_app"
      || recordString(activeAction, "status", 30) !== "scheduled") throw new Error("app_not_recoverable");
    activeAction.set("status", "canceled");
    activeAction.set("completed_at", current.toISOString());
    app.save(activeAction);
    profile.set("lifecycle_status", "active");
    profile.set("deletion_requested_at", "");
    profile.set("deletion_recover_until", "");
    profile.set("deletion_requested_by", "");
    profile.set("deletion_confirmation_sha256", "");
    profile.set("updated_by", actor.id);
    app.save(profile);
    createAdminActivity(app, store, profile, actor, "app_deletion_recovered",
      "Eliminación cancelada dentro de los 30 días; la distribución Android permanece retirada hasta reactivarla");
    return { profile, action: activeAction };
  }
  throw new Error("invalid_payload");
}

function adminDetail(app, profile) {
  if (!profile) return { profile: null, actions: [] };
  return {
    profile: profileAdminSnapshot(profile),
    actions: records(app, ACTIONS, "profile = {:profile}", "-created", 30, { profile: profile.id }).map(actionSnapshot),
  };
}

function handleAdminAction(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMaster(info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseAdminActionPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    $app.runInTransaction((app) => {
      const actor = findRecord(app, "users", recordString(info.auth, "id", 15));
      const store = findRecord(app, "stores", parsed.storeId);
      const profile = store ? findFirst(app, PROFILES, "store = {:store}", { store: store.id }) : null;
      if (!actor || !isMaster(actor)) throw new Error("unauthorized");
      if (!store) throw new Error("store_not_found");
      if (!profile) throw new Error("profile_not_found");
      const result = applyAdminAction(app, store, profile, actor, parsed, new Date());
      response = {
        ok: true,
        profile: profileAdminSnapshot(result.profile),
        action: actionSnapshot(result.action),
        store_status: recordString(store, "status", 30) === "active" ? "active" : "suspended",
      };
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (code === "unauthorized") return e.json(403, { ok: false, error: code });
    if (["store_not_found", "profile_not_found"].includes(code)) return e.json(404, { ok: false, error: code });
    if ([
      "active_job_exists", "admin_action_active", "app_deleted", "app_deletion_pending", "app_not_recoverable",
      "artifacts_missing", "delete_confirmation_mismatch", "distribution_already_active",
      "distribution_already_withdrawn", "premium_required", "recovery_window_expired",
    ].includes(code)) return e.json(409, { ok: false, error: code });
    return e.json(500, { ok: false, error: "app_admin_action_failed" });
  }
}

function parseTarget(action) {
  let value = null;
  if (action && typeof action.unmarshalJSONField === "function" && typeof DynamicModel !== "undefined") {
    try {
      const model = new DynamicModel({ schema_version: 0, artifacts: [] });
      action.unmarshalJSONField("target_json", model);
      value = {
        schema_version: Number(model.schema_version),
        artifacts: JSON.parse(JSON.stringify(model.artifacts)),
      };
    } catch (_) {}
  }
  if (!value) {
    const raw = recordValue(action, "target_json");
    try { value = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw)); }
    catch (_) { return null; }
  }
  if (!value || Number(value.schema_version) !== 1 || !Array.isArray(value.artifacts)) return null;
  const artifacts = value.artifacts.map((item) => ({
    id: text(bodyValue(item, "id"), 15),
    kind: text(bodyValue(item, "kind"), 30),
    file_name: text(bodyValue(item, "file_name"), 220),
    storage_locator: text(bodyValue(item, "storage_locator"), 1000),
    sha256: text(bodyValue(item, "sha256"), 64).toLowerCase(),
    bytes: Number(bodyValue(item, "bytes")),
  }));
  if ((!artifacts.length && recordString(action, "type", 30) !== "delete_app")
    || artifacts.some((item) => !RECORD_ID_PATTERN.test(item.id)
    || !["apk", "aab", "checksums", "instructions", "build_manifest"].includes(item.kind)
    || !item.file_name || !item.storage_locator || !SHA256_PATTERN.test(item.sha256)
    || !Number.isInteger(item.bytes) || item.bytes < 1)) return null;
  return { schema_version: 1, artifacts };
}

function runnerActionSnapshot(action) {
  const target = parseTarget(action);
  if (!target) throw new Error("admin_action_target_invalid");
  return {
    id: action.id,
    type: recordString(action, "type", 30),
    target,
  };
}

function parseRunnerId(body) {
  if (!exactPayload(body, ["runner_id"])) return "";
  const value = text(bodyValue(body, "runner_id"), 100);
  return /^[A-Za-z0-9._:-]{3,100}$/.test(value) ? value : "";
}

function handleRunnerAdminClaim(e) {
  setPrivateHeaders(e);
  try {
    const runnerId = parseRunnerId(e.requestInfo().body || {});
    if (!runnerId) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = { ok: true, action: null };
    $app.runInTransaction((app) => {
      const now = new Date().toISOString();
      const action = records(
        app,
        ACTIONS,
        "status = 'queued' || (status = 'scheduled' && not_before <= {:now})",
        "+created",
        1,
        { now },
      )[0] || null;
      if (!action) return;
      const profile = findRecord(app, PROFILES, relationId(action, "profile"));
      if (!profile) throw new Error("profile_not_found");
      const target = parseTarget(action);
      if (!target) throw new Error("admin_action_target_invalid");
      target.artifacts.forEach((item) => {
        const artifact = findRecord(app, ARTIFACTS, item.id);
        if (!artifact || relationId(artifact, "profile") !== profile.id || artifactLifecycleStatus(artifact) === "deleted") {
          throw new Error("admin_action_target_changed");
        }
        artifact.set("lifecycle_status", "deletion_queued");
        artifact.set("deletion_action", action.id);
        app.save(artifact);
      });
      action.set("status", "claimed");
      action.set("runner_id", runnerId);
      action.set("started_at", now);
      app.save(action);
      response = { ok: true, action: runnerActionSnapshot(action) };
    });
    return e.json(200, response);
  } catch (error) {
    try {
      const code = text(error && error.message, 80);
      $app.logger().error("Storefront app admin claim failed safely.", "code",
        ["admin_action_target_changed", "admin_action_target_invalid", "profile_not_found"].includes(code)
          ? code
          : "internal_error");
    } catch (_) {}
    return e.json(500, { ok: false, error: "admin_action_claim_failed" });
  }
}

function parseRunnerCompletion(body) {
  if (!exactPayload(body, ["action_id", "deleted_artifact_ids", "failure_code", "runner_id", "status"])) return null;
  const parsed = {
    actionId: text(bodyValue(body, "action_id"), 15),
    runnerId: text(bodyValue(body, "runner_id"), 100),
    status: text(bodyValue(body, "status"), 30),
    failureCode: text(bodyValue(body, "failure_code"), 80),
    deletedArtifactIds: Array.isArray(bodyValue(body, "deleted_artifact_ids"))
      ? bodyValue(body, "deleted_artifact_ids").map((id) => text(id, 15))
      : [],
  };
  if (!RECORD_ID_PATTERN.test(parsed.actionId)
    || !/^[A-Za-z0-9._:-]{3,100}$/.test(parsed.runnerId)
    || !["succeeded", "needs_attention"].includes(parsed.status)
    || parsed.deletedArtifactIds.some((id) => !RECORD_ID_PATTERN.test(id))
    || new Set(parsed.deletedArtifactIds).size !== parsed.deletedArtifactIds.length) return null;
  if (parsed.status === "succeeded" && parsed.failureCode) return null;
  if (parsed.status === "needs_attention" && !/^[a-z0-9_:-]{3,80}$/.test(parsed.failureCode)) return null;
  return parsed;
}

function handleRunnerAdminComplete(e) {
  setPrivateHeaders(e);
  try {
    const parsed = parseRunnerCompletion(e.requestInfo().body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    let response = null;
    $app.runInTransaction((app) => {
      const action = findRecord(app, ACTIONS, parsed.actionId);
      if (!action || recordString(action, "status", 30) !== "claimed"
        || recordString(action, "runner_id", 100) !== parsed.runnerId) throw new Error("admin_action_not_claimed");
      const target = parseTarget(action);
      const targetIds = target ? target.artifacts.map((item) => item.id) : [];
      if (!target || parsed.deletedArtifactIds.some((id) => !targetIds.includes(id))) throw new Error("admin_action_target_changed");
      if (parsed.status === "succeeded" && (parsed.deletedArtifactIds.length !== targetIds.length
        || targetIds.some((id) => !parsed.deletedArtifactIds.includes(id)))) throw new Error("admin_action_incomplete");
      const completedAt = new Date().toISOString();
      const actorId = relationId(action, "requested_by");
      parsed.deletedArtifactIds.forEach((id) => {
        const artifact = findRecord(app, ARTIFACTS, id);
        if (!artifact || relationId(artifact, "profile") !== relationId(action, "profile")) {
          throw new Error("admin_action_target_changed");
        }
        artifact.set("lifecycle_status", "deleted");
        artifact.set("storage_locator", "");
        artifact.set("deleted_at", completedAt);
        artifact.set("deleted_by", actorId);
        app.save(artifact);
      });
      action.set("status", parsed.status);
      action.set("failure_code", parsed.failureCode);
      action.set("completed_at", completedAt);
      const profile = findRecord(app, PROFILES, relationId(action, "profile"));
      const store = findRecord(app, "stores", relationId(action, "store"));
      if (!profile || !store) throw new Error("profile_not_found");
      if (parsed.status === "succeeded" && recordString(action, "type", 30) === "delete_app") {
        profile.set("lifecycle_status", "deleted");
        profile.set("status", "retired");
        profile.set("deleted_at", completedAt);
        profile.set("updated_by", actorId);
        const appConfig = findRecord(app, APP_CONFIGS, relationId(profile, "app_config"));
        if (appConfig) {
          appConfig.set("status", "retired");
          app.save(appConfig);
        }
        app.save(profile);
      }
      app.save(action);
      response = { ok: true, action: actionSnapshot(action), profile: profileAdminSnapshot(profile) };
    });
    return e.json(200, response);
  } catch (error) {
    const code = text(error && error.message, 80);
    if (["admin_action_not_claimed", "admin_action_target_changed", "admin_action_incomplete"].includes(code)) {
      return e.json(409, { ok: false, error: code });
    }
    return e.json(500, { ok: false, error: "admin_action_completion_failed" });
  }
}

module.exports = {
  ACTIONS,
  ARTIFACTS,
  PROFILES,
  RECOVERY_DAYS,
  actionSnapshot,
  adminDetail,
  applyAdminAction,
  artifactAdminSnapshot,
  artifactLifecycleStatus,
  assertBuildAllowed,
  assertDistributionAvailable,
  expectedDeleteConfirmation,
  handleAdminAction,
  handleRunnerAdminClaim,
  handleRunnerAdminComplete,
  hashConfirmation,
  parseAdminActionPayload,
  parseRunnerCompletion,
  profileAdminSnapshot,
  profileDistributionStatus,
  profileLifecycleStatus,
  runnerActionSnapshot,
  withdrawForPlanDowngrade,
};
