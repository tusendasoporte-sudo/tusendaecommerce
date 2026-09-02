/// <reference path="../pb_data/types.d.ts" />

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const pubcfg = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);
const audit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const theme = typeof __hooks === "undefined"
  ? require("./pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);

const RELEASE_STATUSES = Object.freeze(["draft", "approved", "deprecated", "retired", "blocked"]);
const EXPECTED_RELEASE_STATUSES = Object.freeze(["absent", ...RELEASE_STATUSES]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function safeText(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Number.isInteger(max) ? max : 1000);
}

function normalizedObject(value) {
  try {
    const result = pubcfg.normalizeJson(value);
    return result && typeof result === "object" && !Array.isArray(result) ? result : null;
  } catch (_) { return null; }
}

function exactPayload(value, keys) {
  const object = normalizedObject(value);
  if (!object) return false;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requestHeader(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return safeText(headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized), 80);
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

function requestContext(e) {
  setPrivateHeaders(e);
  if (!e || !e.auth) throw codedError("unauthorized", 403);
  if (!pubcfgApi.collectionsReady(e.app)) throw codedError("promo_theme_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
  return {
    body: normalizedObject(info.body || {}),
    supportStoreId: requestHeader(info, "X-PZ-Promo-Store"),
  };
}

function findRecords(app, filter, sort, limit, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      "promo_theme_releases", filter, sort || "theme_id,version", limit || 100, 0, params || {},
    ) || []);
  } catch (_) { return []; }
}

function findRelease(app, themeId, version) {
  const rows = findRecords(
    app,
    "theme_id = {:theme} && version = {:version}",
    "id",
    2,
    { theme: themeId, version },
  );
  return rows.length === 1 ? rows[0] : null;
}

function recordId(record) {
  return safeText(record && (record.id || theme.recordString(record, "id")), 80);
}

function selectionForEntry(entry, tokens) {
  return {
    theme_id: entry.manifest.theme_id,
    version: entry.manifest.version,
    tokens: tokens || {},
  };
}

function currentCatalogSelection(app, document) {
  if (!document.theme.theme_id) {
    return { source: "safe_fallback", status: "not_selected", ...theme.safeFallbackSelection() };
  }
  const release = findRelease(app, document.theme.theme_id, document.theme.version);
  try {
    const resolved = theme.assertReleaseForSelection(release, document.theme, { mode: "edit" });
    return {
      source: "selected",
      status: resolved.status,
      ...resolved.selection,
      override_keys: Object.keys(document.theme.tokens).sort(),
    };
  } catch (_) {
    throw codedError("promo_theme_unavailable", 503);
  }
}

function handleCatalogRead(e) {
  try {
    const context = requestContext(e);
    if (!context.body || !exactPayload(context.body, ["contract"])
      || context.body.contract !== theme.THEME_CATALOG_READ_CONTRACT) {
      throw codedError("invalid_payload", 400);
    }
    const decision = pubcfgApi.draftDecision(e.app, e.auth, context.supportStoreId, ["promo.site.view"]);
    const draft = pubcfgApi.findDraft(e.app, recordId(decision.site));
    const document = pubcfgApi.validatedStoredDraft(draft);
    const releaseRows = findRecords(
      e.app,
      "status = {:status}",
      "theme_id,version",
      100,
      { status: "approved" },
    );
    const themes = theme.catalogFromReleases(releaseRows);
    const fallback = theme.safeFallbackSelection();
    return e.json(200, {
      ok: true,
      contract: theme.THEME_CATALOG_CONTRACT,
      current: currentCatalogSelection(e.app, document),
      fallback: {
        source: "safe_fallback",
        ...fallback,
        selectable: themes.some((item) => (
          item.theme_id === fallback.theme_id && item.version === fallback.version
        )),
      },
      themes,
    });
  } catch (error) {
    return sendError(e, error);
  }
}

function parseReleaseUpdate(body) {
  if (!body || !exactPayload(body, ["contract", "theme_id", "version", "expected_status", "next_status"])
    || body.contract !== theme.THEME_RELEASE_UPDATE_CONTRACT
    || !theme.THEME_ID_PATTERN.test(body.theme_id)
    || !theme.SEMVER_PATTERN.test(body.version)
    || !EXPECTED_RELEASE_STATUSES.includes(body.expected_status)
    || !RELEASE_STATUSES.includes(body.next_status)) return null;
  return {
    themeId: body.theme_id,
    version: body.version,
    expectedStatus: body.expected_status,
    nextStatus: body.next_status,
  };
}

function releaseSnapshot(record) {
  if (!record) return {};
  return {
    theme_id: theme.recordString(record, "theme_id"),
    version: theme.recordString(record, "version"),
    status: theme.recordString(record, "status"),
    renderer_key: theme.recordString(record, "renderer_key"),
    contract_version: Number(record.get ? record.get("contract_version") : record.contract_version) || 0,
  };
}

function releaseResponse(record, changed) {
  return {
    ok: true,
    contract: theme.THEME_RELEASE_RESPONSE_CONTRACT,
    changed,
    release: releaseSnapshot(record),
  };
}

function assertTransition(previous, next) {
  const allowed = data.THEME_TRANSITIONS[previous] || [];
  if (!allowed.includes(next)) throw codedError("invalid_promo_theme_transition", 400);
}

function createRelease(app, entry, approvalActor, approvedAt) {
  const record = new Record(app.findCollectionByNameOrId("promo_theme_releases"), {});
  record.set("theme_id", entry.manifest.theme_id);
  record.set("version", entry.manifest.version);
  record.set("status", approvalActor ? "approved" : "draft");
  record.set("renderer_key", entry.manifest.renderer_key);
  record.set("contract_version", entry.manifest.contract_version);
  record.set("manifest_sha256", entry.manifest_sha256);
  record.set("token_schema_sha256", entry.token_schema_sha256);
  if (approvalActor) {
    record.set("approved_by", recordId(approvalActor));
    record.set("approved_at", approvedAt || new Date().toISOString());
  }
  app.save(record);
  return record;
}

function transitionRelease(app, record, nextStatus, actor, approvedAt) {
  record.set("status", nextStatus);
  if (nextStatus === "approved") {
    record.set("approved_by", recordId(actor));
    record.set("approved_at", approvedAt || new Date().toISOString());
  }
  if (nextStatus === "retired") record.set("retired_at", new Date().toISOString());
  app.save(record);
  return record;
}

function auditRelease(app, decision, previous, next, options) {
  const settings = options || {};
  const before = releaseSnapshot(previous);
  const after = releaseSnapshot(next);
  const paths = previous
    ? ["/status"]
    : ["/theme_id", "/version", "/status", "/renderer_key", "/contract_version"];
  return audit.createPromoAudit(app, decision, {
    ...(settings.origin ? { origin: settings.origin } : {}),
    action: "promo.theme.release.update",
    resourceType: "promo_theme_release",
    resourceId: `${after.theme_id}:${after.version}`,
    changedPaths: paths,
    previousValues: before,
    newValues: after,
    sourceEventKey: `promo.theme.release.${after.theme_id}.${after.version}.${after.status}`,
  });
}

function ensureFirstPartyCatalog(app, actor, options) {
  const settings = options || {};
  if (!actor || !/^[a-z0-9]{15}$/.test(recordId(actor))
    || theme.recordString(actor, "role") !== promo.MASTER_ROLE
    || theme.recordString(actor, "status") !== "active") {
    throw codedError("unauthorized", 403);
  }
  const entries = Object.values(theme.THEME_REGISTRY).sort((first, second) => (
    `${first.manifest.theme_id}@${first.manifest.version}`
      .localeCompare(`${second.manifest.theme_id}@${second.manifest.version}`)
  ));
  const releases = entries.map((entry) => findRelease(
    app, entry.manifest.theme_id, entry.manifest.version,
  ));
  releases.forEach((release, index) => {
    if (!release) return;
    try { theme.assertReleaseIntegrity(release, selectionForEntry(entries[index])); }
    catch (_) { throw codedError("promo_theme_release_mismatch", 503); }
  });
  const existing = releases.filter(Boolean);
  const promoteBootstrapDrafts = settings.promoteBootstrapDrafts === true
    && existing.length > 0
    && existing.every((release) => theme.recordString(release, "status") === "draft");
  const approvedAt = new Date().toISOString();
  const auditDecision = settings.auditOrigin === "migration"
    ? null
    : { actor, is_master: true };
  const auditOptions = settings.auditOrigin === "migration" ? { origin: "migration" } : {};
  let created = 0;
  let promoted = 0;

  entries.forEach((entry, index) => {
    let release = releases[index];
    let previous = null;
    if (!release) {
      release = createRelease(app, entry, actor, approvedAt);
      created += 1;
    } else if (promoteBootstrapDrafts && theme.recordString(release, "status") === "draft") {
      previous = releaseSnapshot(release);
      release = transitionRelease(app, release, "approved", actor, approvedAt);
      promoted += 1;
    } else {
      return;
    }
    auditRelease(app, auditDecision, previous, release, auditOptions);
  });

  return Object.freeze({ created, promoted, total: entries.length });
}

function handleReleaseUpdate(e) {
  let context;
  let input;
  try {
    context = requestContext(e);
    input = parseReleaseUpdate(context.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) {
    return sendError(e, error);
  }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = promo.requirePromoAction(app, e.auth, "promo.master.theme_releases.manage", {
        requestedStoreId: context.supportStoreId,
      });
      const entry = theme.registryEntry(input.themeId, input.version);
      if (!entry) throw codedError("unknown_promo_theme", 400);
      let release = findRelease(app, input.themeId, input.version);
      const currentStatus = release ? theme.recordString(release, "status") : "absent";
      if (currentStatus !== input.expectedStatus) throw codedError("promo_theme_release_conflict", 409);
      if (release) {
        try { theme.assertReleaseIntegrity(release, selectionForEntry(entry)); }
        catch (_) { throw codedError("promo_theme_release_mismatch", 503); }
      }
      if (currentStatus === input.nextStatus) {
        response = releaseResponse(release, false);
        return;
      }
      let previous = null;
      if (!release) {
        if (input.nextStatus !== "draft") throw codedError("invalid_promo_theme_transition", 400);
        release = createRelease(app, entry);
      } else {
        assertTransition(currentStatus, input.nextStatus);
        previous = {
          theme_id: theme.recordString(release, "theme_id"),
          version: theme.recordString(release, "version"),
          status: theme.recordString(release, "status"),
          renderer_key: theme.recordString(release, "renderer_key"),
          contract_version: Number(release.get("contract_version")) || 0,
        };
        release = transitionRelease(app, release, input.nextStatus, decision.actor);
      }
      auditRelease(app, decision, previous, release);
      response = releaseResponse(release, true);
    });
    return e.json(200, response);
  } catch (error) {
    return sendError(e, error);
  }
}

function errorCode(error) {
  const code = safeText(error && (error.code || error.message), 80);
  const allowed = new Set([
    "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan", "promo_not_found",
    "store_not_promo", "store_inactive", "promo_site_inactive", "promo_store_context_required",
    "promo_capability_denied", "promo_permission_denied", "reserved_promo_action", "unknown_promo_action",
    "invalid_payload", "unknown_promo_theme", "invalid_promo_theme_transition",
    "promo_theme_release_conflict", "promo_theme_release_mismatch", "promo_theme_unavailable",
  ]);
  return allowed.has(code) ? code : "promo_theme_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (code === "promo_theme_release_conflict") return 409;
  if (["promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (["invalid_payload", "unknown_promo_theme", "invalid_promo_theme_transition"].includes(code)) return 400;
  if (["promo_theme_release_mismatch", "promo_theme_unavailable"].includes(code)) return 503;
  if (Number.isInteger(error && error.status)) return error.status;
  return 403;
}

function sendError(e, error) {
  const code = errorCode(error);
  return e.json(errorStatus(error), { ok: false, error: code });
}

module.exports = {
  EXPECTED_RELEASE_STATUSES,
  RELEASE_STATUSES,
  auditRelease,
  ensureFirstPartyCatalog,
  currentCatalogSelection,
  errorCode,
  errorStatus,
  exactPayload,
  findRelease,
  handleCatalogRead,
  handleReleaseUpdate,
  parseReleaseUpdate,
  releaseResponse,
  releaseSnapshot,
  requestContext,
  sendError,
};
