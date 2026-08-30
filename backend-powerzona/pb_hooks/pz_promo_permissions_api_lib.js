/// <reference path="../pb_data/types.d.ts" />

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const promoData = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const promoAudit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const storePermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const promoPlans = typeof __hooks === "undefined"
  ? require("./pz_promo_plan_lib.js")
  : require(`${__hooks}/pz_promo_plan_lib.js`);

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const ENTITLEMENT_SOURCES = Object.freeze(["unassigned", "contract", "addon", "master_override"]);
const SAFE_ERROR_CODES = new Set([
  "unauthorized",
  "session_revoked",
  "user_inactive",
  "blocked_by_plan",
  "promo_plan_expired",
  "promo_plan_unconfigured",
  "promo_not_found",
  "store_not_promo",
  "store_inactive",
  "promo_site_inactive",
  "promo_store_context_required",
  "promo_capability_denied",
  "promo_permission_denied",
  "reserved_promo_action",
  "unknown_promo_action",
  "commerce_permission_denied",
  "commerce_capability_denied",
  "invalid_payload",
  "invalid_promo_permissions",
  "reserved_promo_permission",
  "unknown_promo_capability",
  "invalid_promo_capability",
  "invalid_entitlement_source",
  "promo_permissions_conflict",
  "promo_entitlements_conflict",
  "promo_primary_admin_implicit",
  "promo_access_not_found",
  "promo_permissions_unavailable",
]);

function safeText(value, max) {
  const text = promo.safeText(value);
  return Number.isInteger(max) ? text.slice(0, max) : text;
}

function recordValue(record, key) {
  return promo.recordValue(record, key);
}

function recordString(record, key) {
  return promo.recordString(record, key);
}

function relationId(record, key) {
  return promo.relationId(record, key);
}

function recordId(record) {
  return promo.recordId(record);
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  return Object.prototype.hasOwnProperty.call(body, key) ? body[key] : undefined;
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    if (typeof normalized === "string") {
      const reparsed = JSON.parse(normalized);
      return reparsed && typeof reparsed === "object" && !Array.isArray(reparsed) ? reparsed : null;
    }
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) {
    return null;
  }
}

function exactPayload(body, keys) {
  const object = plainObject(body);
  if (!object) return false;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function requestHeader(info, name) {
  const headers = info && info.headers || {};
  const lower = String(name || "").toLowerCase();
  const normalized = lower.replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return safeText(headers.get(name) || headers.get(lower) || headers.get(normalized), 80);
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return key ? safeText(headers[key], 80) : "";
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e || !e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function codedError(code, status) {
  const safe = SAFE_ERROR_CODES.has(code) ? code : "promo_permissions_unavailable";
  const error = new Error(safe);
  error.code = safe;
  error.status = Number.isInteger(status) ? status : undefined;
  return error;
}

function errorCode(error) {
  if (error instanceof promo.PromoPermissionValidationError) {
    return error.issue === "reserved_permission"
      ? "reserved_promo_permission"
      : "invalid_promo_permissions";
  }
  const code = safeText(error && (error.code || error.message));
  return SAFE_ERROR_CODES.has(code) ? code : "promo_permissions_unavailable";
}

function statusForError(error) {
  const code = errorCode(error);
  if (error && Number.isInteger(error.status)) return error.status;
  if (["invalid_payload", "invalid_promo_permissions", "reserved_promo_permission", "unknown_promo_capability", "invalid_promo_capability", "invalid_entitlement_source"].includes(code)) return 400;
  if (["promo_not_found", "store_not_promo", "promo_access_not_found"].includes(code)) return 404;
  if (["promo_permissions_conflict", "promo_entitlements_conflict", "promo_primary_admin_implicit"].includes(code)) return 409;
  if (code === "promo_permissions_unavailable") return 503;
  return 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(statusForError(error), { ok: false, error: code });
}

function permissionsReady(app) {
  try {
    const access = app.findCollectionByNameOrId("store_user_access");
    const sites = app.findCollectionByNameOrId("promo_sites");
    const entitlements = app.findCollectionByNameOrId("promo_site_entitlements");
    const audit = app.findCollectionByNameOrId("promo_audit_events");
    return !!access.fields.getByName(promo.PROMO_ACCESS_FIELD)
      && !!access.fields.getByName(promo.PROMO_ACCESS_VERSION_FIELD)
      && access.listRule === null
      && access.viewRule === null
      && access.createRule === null
      && access.updateRule === null
      && access.deleteRule === null
      && sites.listRule === null
      && sites.viewRule === null
      && entitlements.listRule === null
      && entitlements.viewRule === null
      && audit.listRule === null
      && audit.viewRule === null;
  } catch (_) {
    return false;
  }
}

function requestContext(e) {
  setPrivateHeaders(e);
  if (!permissionsReady(e.app)) throw codedError("promo_permissions_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !e.auth) throw codedError("unauthorized", 403);
  const supportStoreId = requestHeader(info, "X-PZ-Promo-Store");
  return { info, supportStoreId };
}

function findRecord(app, collection, id) {
  if (!RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function assignedPromoPermissions(access) {
  return promo.storedPromoPermissions(access);
}

function promoPermissionVersion(access) {
  const value = promo.recordInteger(access, promo.PROMO_ACCESS_VERSION_FIELD);
  return value === null || value < 0 ? 0 : value;
}

function targetPayload(app, decision, target) {
  const primary = storePermissions.isPrimaryAdmin(app, target, decision.store);
  const access = primary
    ? null
    : promo.findPromoAccessRecord(app, recordId(decision.store), recordId(target));
  if (!primary && !access) throw codedError("promo_access_not_found", 404);
  const assigned = primary
    ? promo.PROMO_ASSIGNABLE_PERMISSION_KEYS.slice()
    : assignedPromoPermissions(access);
  const effective = promo.resolveEffectivePromoPermissions(
    app,
    target,
    decision.store,
    decision.site,
    decision.entitlement,
  );
  return {
    display_name: safeText(recordString(target, "display_name"), 140),
    role: recordString(target, "role"),
    status: recordString(target, "status"),
    is_primary_admin: primary,
    editable: !primary,
    assigned_permissions: assigned,
    effective_permissions: effective,
    version: primary ? 0 : promoPermissionVersion(access),
  };
}

function targetForDecision(app, decision, targetId) {
  const target = findRecord(app, "users", targetId);
  if (!target
    || relationId(target, "store") !== recordId(decision.store)
    || !["store_admin", "store_staff"].includes(recordString(target, "role"))) {
    throw codedError("promo_not_found", 404);
  }
  return target;
}

function managementDecision(app, auth, supportStoreId) {
  const master = recordString(auth, "role") === promo.MASTER_ROLE;
  const action = master ? "promo.master.support" : "promo.site.view";
  const decision = promo.requirePromoAction(app, auth, action, { requestedStoreId: supportStoreId });
  if (!master && !decision.is_primary_admin) throw codedError("promo_permission_denied", 403);
  return decision;
}

function allowedActions(app, auth, storeId) {
  return promo.PROMO_ACTION_KEYS.filter((action) => promo.canPromoAction(app, auth, action, {
    requestedStoreId: storeId,
  }));
}

function handleAccessContext(e) {
  try {
    const context = requestContext(e);
    if (!exactPayload(context.info.body || {}, [])) throw codedError("invalid_payload", 400);
    const master = recordString(e.auth, "role") === promo.MASTER_ROLE;
    const decision = promo.requirePromoAction(
      e.app,
      e.auth,
      master ? "promo.master.support" : "promo.site.view",
      { requestedStoreId: context.supportStoreId },
    );
    const effectivePermissions = master
      ? promo.PROMO_ASSIGNABLE_PERMISSION_KEYS.slice()
      : promo.resolveEffectivePromoPermissions(
        e.app,
        decision.actor,
        decision.store,
        decision.site,
        decision.entitlement,
      );
    const planState = promoPlans.resolvePromoPlanState(decision.store);
    return e.json(200, {
      ok: true,
      user: {
        display_name: safeText(recordString(decision.actor, "display_name"), 140),
        role: recordString(decision.actor, "role"),
      },
      store: {
        name: safeText(recordString(decision.store, "name"), 140),
        slug: safeText(recordString(decision.store, "slug"), 80),
        status: recordString(decision.store, "status"),
      },
      site: {
        public_slug: safeText(recordString(decision.site, "public_slug"), 80),
        status: recordString(decision.site, "status"),
      },
      access: {
        is_master: master,
        is_primary_admin: decision.is_primary_admin,
        blocked_by_plan: !planState.can_mutate,
        permissions: effectivePermissions,
        reserved_permissions: master ? promo.PROMO_RESERVED_PERMISSION_KEYS.slice() : [],
        allowed_actions: allowedActions(e.app, e.auth, recordId(decision.store)),
      },
      capabilities: promo.promoCapabilitySnapshot(decision.entitlement),
      plan: {
        code: planState.plan,
        name: planState.plan_name,
        state: planState.state,
        days_remaining: planState.days_remaining,
        expires_at: planState.plan_expires_at,
        grace_expires_at: planState.grace_expires_at,
        grace_days: planState.grace_days,
        in_grace: planState.in_grace,
        can_mutate: planState.can_mutate,
        public_allowed: planState.public_allowed,
        max_gallery_assets: planState.max_gallery_assets,
      },
      ...(master ? { entitlement: entitlementResponse(decision.entitlement) } : {}),
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function parseDetail(body) {
  if (!exactPayload(body, ["user_id"])) return null;
  const userId = safeText(bodyValue(body, "user_id"));
  return RECORD_ID_PATTERN.test(userId) ? { userId } : null;
}

function handleTeamDetail(e) {
  try {
    const context = requestContext(e);
    const parsed = parseDetail(context.info.body || {});
    if (!parsed) throw codedError("invalid_payload", 400);
    const decision = managementDecision(e.app, e.auth, context.supportStoreId);
    const target = targetForDecision(e.app, decision, parsed.userId);
    return e.json(200, { ok: true, user: targetPayload(e.app, decision, target) });
  } catch (error) {
    return sendError(e, error);
  }
}

function parsePermissionsUpdate(body) {
  if (!exactPayload(body, ["user_id", "expected_version", "permissions", "reason"])) return null;
  const userId = safeText(bodyValue(body, "user_id"));
  const expectedVersion = Number(bodyValue(body, "expected_version"));
  const reason = safeText(bodyValue(body, "reason"), 500);
  if (!RECORD_ID_PATTERN.test(userId)
    || !Number.isSafeInteger(expectedVersion)
    || expectedVersion < 0
    || reason.length < 5) return null;
  return {
    userId,
    expectedVersion,
    permissions: promo.normalizePromoPermissions(bodyValue(body, "permissions")),
    reason,
  };
}

function lockAccess(app, accessId) {
  app.db().newQuery("UPDATE store_user_access SET id = id WHERE id = {:id}").bind({ id: accessId }).execute();
}

function handlePermissionsUpdate(e) {
  let parsed;
  let context;
  try {
    context = requestContext(e);
    parsed = parsePermissionsUpdate(context.info.body || {});
    if (!parsed) throw codedError("invalid_payload", 400);
  } catch (error) {
    return sendError(e, error);
  }

  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = managementDecision(app, e.auth, context.supportStoreId);
      const target = targetForDecision(app, decision, parsed.userId);
      if (storePermissions.isPrimaryAdmin(app, target, decision.store)) {
        throw codedError("promo_primary_admin_implicit", 409);
      }
      let access = promo.findPromoAccessRecord(app, recordId(decision.store), recordId(target));
      if (!access) throw codedError("promo_access_not_found", 404);
      lockAccess(app, recordId(access));
      access = findRecord(app, "store_user_access", recordId(access));
      if (!access || relationId(access, "store") !== recordId(decision.store)
        || relationId(access, "user") !== recordId(target)) {
        throw codedError("promo_not_found", 404);
      }
      const previousVersion = promoPermissionVersion(access);
      if (previousVersion !== parsed.expectedVersion) throw codedError("promo_permissions_conflict", 409);
      const previousPermissions = assignedPromoPermissions(access);
      const changed = previousPermissions.join("|") !== parsed.permissions.join("|");
      if (changed) {
        access.set(promo.PROMO_ACCESS_FIELD, parsed.permissions.slice());
        access.set(promo.PROMO_ACCESS_VERSION_FIELD, previousVersion + 1);
        access.set("updated_by", recordId(decision.actor));
        app.save(access);
        if (typeof target.refreshTokenKey !== "function") throw codedError("promo_permissions_unavailable", 503);
        target.refreshTokenKey();
        app.save(target);
        promoAudit.createPromoAudit(app, decision, {
          action: "promo.team.permissions.update",
          resourceType: "promo_user_permissions",
          resourceId: recordId(target),
          changedPaths: ["/permissions", "/sessions_revoked", "/version"],
          previousValues: { permissions: previousPermissions, sessions_revoked: false, version: previousVersion },
          newValues: { permissions: parsed.permissions, sessions_revoked: true, version: previousVersion + 1 },
          sourceEventKey: `promo.permissions.${recordId(target)}.v${previousVersion + 1}`,
        });
        access = findRecord(app, "store_user_access", recordId(access));
      }
      response = {
        ok: true,
        changed,
        sessions_revoked: changed,
        user: targetPayload(app, decision, target),
      };
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error);
  }
}

function rawEntitlementSnapshot(record) {
  const result = {};
  promo.PROMO_CAPABILITY_KEYS.forEach((key) => {
    result[key] = key === "custom_domain_enabled"
      ? false
      : promo.PROMO_NUMERIC_CAPABILITY_KEYS.includes(key)
      ? (promo.recordInteger(record, key) || 0)
      : promo.recordBool(record, key);
  });
  return result;
}

function normalizeCapabilityChanges(value) {
  const input = plainObject(value);
  if (!input) throw codedError("invalid_promo_capability", 400);
  const keys = Object.keys(input);
  if (!keys.length) throw codedError("invalid_promo_capability", 400);
  const changes = {};
  keys.forEach((key) => {
    if (!promo.isPromoCapabilityKey(key)) throw codedError("unknown_promo_capability", 400);
    if (key === "custom_domain_enabled") throw codedError("invalid_promo_capability", 400);
    if (promo.PROMO_BOOLEAN_CAPABILITY_KEYS.includes(key)) {
      if (typeof input[key] !== "boolean") throw codedError("invalid_promo_capability", 400);
      changes[key] = input[key];
      return;
    }
    const valueNumber = Number(input[key]);
    if (!Number.isSafeInteger(valueNumber)
      || valueNumber < 0
      || valueNumber > promo.PROMO_CAPABILITY_LIMITS[key]) {
      throw codedError("invalid_promo_capability", 400);
    }
    changes[key] = valueNumber;
  });
  return changes;
}

function parseEntitlementUpdate(body) {
  if (!exactPayload(body, ["expected_updated", "source", "capabilities", "reason"])) return null;
  const expectedUpdated = safeText(bodyValue(body, "expected_updated"), 80);
  const source = safeText(bodyValue(body, "source"));
  const reason = safeText(bodyValue(body, "reason"), 500);
  if (!expectedUpdated || !ENTITLEMENT_SOURCES.includes(source) || reason.length < 5) return null;
  return {
    expectedUpdated,
    source,
    capabilities: normalizeCapabilityChanges(bodyValue(body, "capabilities")),
    reason,
  };
}

function lockEntitlement(app, entitlementId) {
  app.db().newQuery("UPDATE promo_site_entitlements SET id = id WHERE id = {:id}")
    .bind({ id: entitlementId })
    .execute();
}

function entitlementResponse(record) {
  return {
    source: recordString(record, "source"),
    updated: recordString(record, "updated"),
    capabilities: rawEntitlementSnapshot(record),
  };
}

function handleEntitlementsUpdate(e) {
  let parsed;
  let context;
  try {
    context = requestContext(e);
    parsed = parseEntitlementUpdate(context.info.body || {});
    if (!parsed) throw codedError("invalid_payload", 400);
  } catch (error) {
    return sendError(e, error);
  }

  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.master.entitlements.manage", {
        requestedStoreId: context.supportStoreId,
      });
      let entitlement = promo.findPromoEntitlement(app, recordId(decision.site));
      if (!entitlement) throw codedError("promo_not_found", 404);
      lockEntitlement(app, recordId(entitlement));
      entitlement = findRecord(app, "promo_site_entitlements", recordId(entitlement));
      if (!entitlement || relationId(entitlement, "site") !== recordId(decision.site)) {
        throw codedError("promo_not_found", 404);
      }
      if (recordString(entitlement, "updated") !== parsed.expectedUpdated) {
        throw codedError("promo_entitlements_conflict", 409);
      }
      const previous = entitlementResponse(entitlement);
      entitlement.set("source", parsed.source);
      Object.keys(parsed.capabilities).forEach((key) => entitlement.set(key, parsed.capabilities[key]));
      entitlement.set("custom_domain_enabled", false);
      try { promoData.assertEntitlementLimits(entitlement); } catch (_) {
        throw codedError("invalid_promo_capability", 400);
      }
      app.save(entitlement);
      const next = entitlementResponse(entitlement);
      promoAudit.createPromoAudit(app, decision, {
        action: "promo.entitlements.update",
        resourceType: "promo_site_entitlements",
        resourceId: recordId(entitlement),
        changedPaths: ["/source", "/updated", ...Object.keys(parsed.capabilities).map((key) => `/capabilities/${key}`)],
        previousValues: previous,
        newValues: next,
        sourceEventKey: `promo.entitlements.${recordId(entitlement)}.${promoAudit.stableFingerprint({
          expected_updated: parsed.expectedUpdated,
          source: parsed.source,
          capabilities: parsed.capabilities,
        })}`,
      });
      response = { ok: true, entitlement: next };
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error);
  }
}

module.exports = {
  ENTITLEMENT_SOURCES,
  SAFE_ERROR_CODES,
  allowedActions,
  assignedPromoPermissions,
  entitlementResponse,
  exactPayload,
  handleAccessContext,
  handleEntitlementsUpdate,
  handlePermissionsUpdate,
  handleTeamDetail,
  managementDecision,
  normalizeCapabilityChanges,
  parseDetail,
  parseEntitlementUpdate,
  parsePermissionsUpdate,
  permissionsReady,
  promoPermissionVersion,
  rawEntitlementSnapshot,
  requireAuthenticatedUser,
  statusForError,
  targetPayload,
};
