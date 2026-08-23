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
const promoTheme = typeof __hooks === "undefined"
  ? require("./pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);
const promoI18n = typeof __hooks === "undefined"
  ? require("./pz_promo_i18n_lib.js")
  : require(`${__hooks}/pz_promo_i18n_lib.js`);
const promoMedia = typeof __hooks === "undefined"
  ? require("./pz_promo_media_lib.js")
  : require(`${__hooks}/pz_promo_media_lib.js`);
const promoDomain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);
const contract = typeof __hooks === "undefined"
  ? require("./pz_promo_publish_lib.js")
  : require(`${__hooks}/pz_promo_publish_lib.js`);

const REQUIRED_COLLECTIONS = Object.freeze([
  "promo_sites",
  "promo_site_entitlements",
  "promo_theme_releases",
  "promo_domain_bindings",
  "promo_draft_documents",
  "promo_media_assets",
  "promo_revisions",
  "promo_revision_media_refs",
  "promo_publication_slots",
  "promo_publication_events",
  "promo_audit_events",
]);

const SAFE_ERRORS = new Set([
  "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan",
  "promo_not_found", "store_not_promo", "store_inactive", "promo_site_inactive",
  "promo_store_context_required", "promo_capability_denied", "promo_permission_denied",
  "reserved_promo_action", "unknown_promo_action", "invalid_payload",
  "promo_draft_conflict", "promo_draft_unavailable", "promo_candidate_not_found",
  "promo_candidate_unavailable", "promo_preview_unavailable", "promo_publication_conflict",
  "promo_publication_state_conflict", "promo_publication_noop", "promo_idempotency_conflict",
  "promo_canonical_invalid", "promo_publication_validation_failed", "promo_publication_unavailable",
]);

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function recordId(record) { return contract.recordId(record); }
function recordString(record, key) { return contract.recordString(record, key); }
function recordInteger(record, key) { return contract.recordInteger(record, key); }
function relationId(record, key) { return contract.relationId(record, key); }
function recordValue(record, key) { return contract.recordValue(record, key); }

function findRecord(app, collection, id) {
  if (!contract.RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, limit, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter,
      sort || "id",
      Number.isInteger(limit) ? limit : 2,
      0,
      params || {},
    ) || []);
  } catch (_) { return []; }
}

function findExact(app, collection, filter, params) {
  const rows = findRecords(app, collection, filter, "id", 2, params);
  return rows.length === 1 ? rows[0] : null;
}

function collectionsReady(app) {
  try {
    return REQUIRED_COLLECTIONS.every((name) => {
      const collection = app.findCollectionByNameOrId(name);
      return collection.listRule === null && collection.viewRule === null
        && collection.createRule === null && collection.updateRule === null
        && collection.deleteRule === null;
    });
  } catch (_) { return false; }
}

function requestHeader(info, name) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return String(headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized) || "").trim().slice(0, 80);
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return key ? String(headers[key] || "").trim().slice(0, 80) : "";
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

function requestContext(e) {
  setPrivateHeaders(e);
  if (!collectionsReady(e.app)) throw codedError("promo_publication_unavailable", 503);
  const info = e.requestInfo();
  if (!info || !contract.exactKeys(info.query || {}, [])) throw codedError("invalid_payload", 400);
  if (!e.auth) throw codedError("unauthorized", 403);
  return {
    body: info.body || {},
    supportStoreId: requestHeader(info, "X-PZ-Promo-Store"),
  };
}

function decisionFor(app, auth, supportStoreId, operation) {
  if (operation === "candidate") {
    return pubcfgApi.draftDecision(app, auth, supportStoreId, ["promo.publication.publish"]);
  }
  if (operation === "preview") {
    return pubcfgApi.draftDecision(app, auth, supportStoreId, ["promo.site.view"]);
  }
  const master = recordString(auth, "role") === promo.MASTER_ROLE;
  if (operation === "publish" && !master) {
    return promo.requirePromoAction(app, auth, "promo.publication.publish", {});
  }
  if (operation === "publish" && master) {
    const support = promo.requirePromoAction(app, auth, "promo.master.support", {
      requestedStoreId: supportStoreId,
    });
    if (recordString(support.site, "status") === "paused") {
      return promo.requirePromoAction(app, auth, "promo.master.publication.rollback", {
        requestedStoreId: supportStoreId,
      });
    }
    return pubcfgApi.draftDecision(app, auth, supportStoreId, ["promo.publication.publish"]);
  }
  return promo.requirePromoAction(app, auth, "promo.master.publication.rollback", {
    requestedStoreId: supportStoreId,
  });
}

function jsonRecord(record, key, errorCode) {
  try { return pubcfg.normalizeJson(recordValue(record, key)); }
  catch (_) { throw codedError(errorCode || "promo_candidate_unavailable", 503); }
}

function assertSystemCatalogs(document) {
  try {
    document.locales.published.forEach((locale) => {
      promoI18n.resolveSystemCatalog(document.system_catalog_version, locale);
    });
  } catch (_) { throw codedError("promo_publication_validation_failed", 409); }
}

function themeForRevision(app, revision, document, mode) {
  const theme = findRecord(app, "promo_theme_releases", relationId(revision, "theme_release"));
  const themeMode = mode === "rollback" || mode === "preview" ? "rollback" : "select";
  try { promoTheme.assertReleaseForSelection(theme, document.theme, { mode: themeMode }); }
  catch (_) { throw codedError("promo_publication_validation_failed", 409); }
  return theme;
}

function validateRevisionTarget(app, decision, revisionId, mode) {
  const siteId = recordId(decision.site);
  const revision = findRecord(app, "promo_revisions", revisionId);
  if (!revision || relationId(revision, "site") !== siteId) throw codedError("promo_candidate_not_found", 404);
  if (recordInteger(revision, "schema_version") !== 1 || (recordInteger(revision, "sequence") || 0) < 1) {
    throw codedError("promo_candidate_unavailable", 503);
  }
  let document;
  try { document = pubcfg.validatePromoDocument(jsonRecord(revision, "snapshot_json"), { publicRevision: true }); }
  catch (_) { throw codedError("promo_publication_validation_failed", 409); }
  const digest = pubcfg.digestDocument(document);
  const storedDigest = recordString(revision, "snapshot_sha256");
  if (!data.SHA256_PATTERN.test(storedDigest) || digest !== storedDigest
    || recordString(revision, "default_locale") !== document.locales.default
    || pubcfg.canonicalJson(jsonRecord(revision, "published_locales_json")) !== pubcfg.canonicalJson(document.locales.published)) {
    throw codedError("promo_publication_validation_failed", 409);
  }
  const theme = themeForRevision(app, revision, document, mode);
  let assets;
  try {
    assets = pubcfgApi.loadDocumentAssets(app, siteId, document, { publicRevision: true });
    pubcfgApi.validateRevisionMediaRows(app, siteId, recordId(revision), document, assets);
    pubcfgApi.assertEntitlementMetrics(decision.entitlement, document, assets);
  } catch (error) {
    if (error && error.code === "promo_capability_denied") throw error;
    throw codedError("promo_publication_validation_failed", 409);
  }
  assertSystemCatalogs(document);
  return Object.freeze({ assets, digest, document, revision, theme });
}

function validateDraftCandidate(app, decision, draft, expectedVersion) {
  if (!draft || relationId(draft, "site") !== recordId(decision.site)
    || recordInteger(draft, "version") !== expectedVersion) throw codedError("promo_draft_conflict", 409);
  let document;
  try {
    pubcfgApi.validatedStoredDraft(draft);
    document = pubcfg.validatePromoDocument(jsonRecord(draft, "document_json"), { publicRevision: true });
  } catch (_) { throw codedError("promo_publication_validation_failed", 409); }
  const theme = findExact(
    app,
    "promo_theme_releases",
    "theme_id = {:theme} && version = {:version}",
    { theme: document.theme.theme_id, version: document.theme.version },
  );
  try { promoTheme.assertReleaseForSelection(theme, document.theme, { mode: "select" }); }
  catch (_) { throw codedError("promo_publication_validation_failed", 409); }
  let assets;
  try {
    assets = pubcfgApi.loadDocumentAssets(app, recordId(decision.site), document, { publicRevision: true });
    pubcfgApi.assertEntitlementMetrics(decision.entitlement, document, assets);
  } catch (error) {
    if (error && error.code === "promo_capability_denied") throw error;
    throw codedError("promo_publication_validation_failed", 409);
  }
  assertSystemCatalogs(document);
  return Object.freeze({ assets, document, theme });
}

function lockRecord(app, table, id) {
  app.db().newQuery(`UPDATE ${table} SET id = id WHERE id = {:id}`)
    .bind({ id })
    .execute();
}

function nextRevisionSequence(app, siteId) {
  const rows = findRecords(app, "promo_revisions", "site = {:site}", "-sequence", 1, { site: siteId });
  const current = rows.length ? recordInteger(rows[0], "sequence") : 0;
  if (current === null || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
    throw codedError("promo_candidate_unavailable", 503);
  }
  return current + 1;
}

function createRevision(app, decision, draft, validated) {
  const revision = new Record(app.findCollectionByNameOrId("promo_revisions"), {});
  revision.set("site", recordId(decision.site));
  revision.set("sequence", nextRevisionSequence(app, recordId(decision.site)));
  revision.set("schema_version", 1);
  revision.set("snapshot_json", validated.document);
  revision.set("snapshot_sha256", pubcfg.digestDocument(validated.document));
  revision.set("theme_release", recordId(validated.theme));
  revision.set("default_locale", validated.document.locales.default);
  revision.set("published_locales_json", validated.document.locales.published);
  revision.set("source_draft_version", recordInteger(draft, "version"));
  revision.set("created_by", recordId(decision.actor));
  app.save(revision);
  const assetByKey = new Map(validated.assets.map((asset) => [asset.key, asset]));
  Object.keys(validated.document.media_refs).sort().forEach((useKey) => {
    const asset = assetByKey.get(useKey);
    if (!asset) throw codedError("promo_publication_validation_failed", 409);
    const reference = new Record(app.findCollectionByNameOrId("promo_revision_media_refs"), {});
    reference.set("site", recordId(decision.site));
    reference.set("revision", recordId(revision));
    reference.set("media_asset", asset.id);
    reference.set("use_key", useKey);
    app.save(reference);
  });
  pubcfgApi.validateRevisionMediaRows(
    app,
    recordId(decision.site),
    recordId(revision),
    validated.document,
    validated.assets,
  );
  audit.createPromoAudit(app, decision, {
    action: "promo.revision.create",
    resourceType: "promo_revision",
    resourceId: recordId(revision),
    changedPaths: [],
    previousValues: {},
    newValues: contract.revisionAuditSnapshot(revision, validated.document),
    sourceEventKey: `promo.revision.${recordId(revision)}.created`,
  });
  return revision;
}

function candidateResponse(revision, reused) {
  return Object.freeze({
    ok: true,
    contract: contract.CANDIDATE_RESPONSE_CONTRACT,
    candidate: contract.candidateProjection(revision, reused),
  });
}

function handleCandidateCreate(e) {
  let request;
  let input;
  try {
    request = requestContext(e);
    input = contract.parseCandidateCreate(request.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = decisionFor(app, e.auth, request.supportStoreId, "candidate");
      let draft = pubcfgApi.findDraft(app, recordId(decision.site));
      if (!draft) throw codedError("promo_draft_unavailable", 503);
      lockRecord(app, "promo_draft_documents", recordId(draft));
      lockRecord(app, "promo_sites", recordId(decision.site));
      draft = pubcfgApi.findDraft(app, recordId(decision.site));
      const validated = validateDraftCandidate(app, decision, draft, input.expectedDraftVersion);
      const digest = pubcfg.digestDocument(validated.document);
      const existing = findExact(
        app,
        "promo_revisions",
        "site = {:site} && snapshot_sha256 = {:digest}",
        { site: recordId(decision.site), digest },
      );
      if (existing) {
        validateRevisionTarget(app, decision, recordId(existing), "candidate");
        response = candidateResponse(existing, true);
        return;
      }
      response = candidateResponse(createRevision(app, decision, draft, validated), false);
    });
    return e.json(response.candidate.reused ? 200 : 201, response);
  } catch (error) { return sendError(e, error); }
}

function previewMedia(app, validated, projection) {
  return projection.media.map((item) => {
    const summary = validated.assets.find((asset) => asset.key === item.key);
    const asset = summary && findRecord(app, "promo_media_assets", summary.id);
    if (!asset) throw codedError("promo_preview_unavailable", 503);
    const assetDescriptor = promoMedia.privateAssetDescriptor(asset);
    const poster = summary.poster && findRecord(app, "promo_media_assets", summary.poster.id);
    const posterDescriptor = poster ? promoMedia.privateAssetDescriptor(poster) : null;
    return contract.previewMediaDescriptor(item, assetDescriptor, posterDescriptor);
  });
}

function handlePreview(e) {
  let request;
  let input;
  try {
    request = requestContext(e);
    input = contract.parsePreview(request.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = decisionFor(app, e.auth, request.supportStoreId, "preview");
      const validated = validateRevisionTarget(app, decision, input.revisionId, "preview");
      if (!validated.document.locales.published.includes(input.locale)) {
        throw codedError("promo_candidate_not_found", 404);
      }
      const publicProjection = pubcfg.projectPublicDocument(
        validated.document,
        recordString(decision.site, "public_slug"),
        validated.assets,
      );
      response = Object.freeze({
        ok: true,
        contract: contract.PREVIEW_RESPONSE_CONTRACT,
        visibility: "private",
        robots: "noindex,nofollow,noarchive",
        candidate: contract.candidateProjection(validated.revision, false),
        preview: contract.previewProjection(
          publicProjection,
          input.locale,
          previewMedia(app, validated, publicProjection),
        ),
      });
    });
    return e.json(200, response);
  } catch (error) { return sendError(e, error); }
}

function slotForSite(app, siteId) {
  return findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
}

function rawCanonical(slot) {
  const mode = recordString(slot, "canonical_mode");
  return Object.freeze({
    mode: mode === "custom" ? "custom" : "platform",
    primaryBindingId: mode === "custom" ? relationId(slot, "primary_binding") : "",
  });
}

function validateCanonical(app, decision, target) {
  if (!target || target.mode === "platform") {
    return Object.freeze({ mode: "platform", primaryBindingId: "", binding: null });
  }
  if (!promo.resolvePromoCapabilityAccess(decision.entitlement, "custom_domain_enabled").allowed) {
    throw codedError("promo_capability_denied", 403);
  }
  const binding = findRecord(app, "promo_domain_bindings", target.primaryBindingId);
  try { promoDomain.assertActiveBinding(binding, recordId(decision.site), "", "primary"); }
  catch (_) { throw codedError("promo_canonical_invalid", 409); }
  return Object.freeze({ mode: "custom", primaryBindingId: recordId(binding), binding });
}

function assertOperationalStore(decision) {
  if (recordString(decision.store, "status") !== "active") throw codedError("store_inactive", 403);
}

function assertStateForOperation(decision, slot, operation) {
  const siteState = recordString(decision.site, "status");
  const slotState = recordString(slot, "state");
  const pairs = {
    publish: [["draft", "unpublished"], ["active", "active"], ["paused", "unpublished"]],
    rollback: [["active", "active"], ["paused", "paused"], ["paused", "unpublished"]],
    unpublish: [["active", "active"], ["paused", "paused"]],
    binding_switch: [["active", "active"]],
    pause: [["active", "active"]],
    resume: [["paused", "paused"]],
  };
  if (!(pairs[operation] || []).some(([site, state]) => site === siteState && state === slotState)) {
    throw codedError("promo_publication_state_conflict", 409);
  }
  const revisionId = relationId(slot, "published_revision");
  const bindingId = relationId(slot, "primary_binding");
  const mode = recordString(slot, "canonical_mode");
  if (["active", "paused"].includes(slotState) && !revisionId) {
    throw codedError("promo_publication_state_conflict", 409);
  }
  if (slotState === "unpublished" && (revisionId || bindingId || mode !== "platform")) {
    throw codedError("promo_publication_state_conflict", 409);
  }
  if (mode === "platform" && bindingId) throw codedError("promo_publication_state_conflict", 409);
  if (mode === "custom" && !bindingId) throw codedError("promo_publication_state_conflict", 409);
}

function findIdempotentEvent(app, siteId, key) {
  return findExact(
    app,
    "promo_publication_events",
    "site = {:site} && idempotency_key = {:key}",
    { site: siteId, key },
  );
}

function requestFingerprint(input) {
  const payload = {
    operation: input.operation,
    expected_generation: input.expectedGeneration,
    reason_code: input.reasonCode,
    revision_id: input.revisionId || "",
    canonical_mode: input.canonical ? input.canonical.mode : "",
    primary_binding_id: input.canonical ? input.canonical.primaryBindingId : "",
  };
  return [payload, { publish_request_v1: payload }, { publish_request_v1_copy: payload }]
    .map((value) => audit.stableFingerprint(value).padStart(7, "0"))
    .join("");
}

function storedFailure(event, input) {
  const result = recordString(event, "result");
  const match = recordString(event, "error_class").match(/^(rejected|failed)\.([a-z0-9_]{1,48})\.([a-z0-9]{21})$/);
  if (!match || match[1] !== result || match[3] !== requestFingerprint(input)) return null;
  return Object.freeze({ result, code: SAFE_ERRORS.has(match[2]) ? match[2] : "promo_publication_unavailable" });
}

function eventMatchesRequest(event, decision, input) {
  if (!event || recordString(event, "operation") !== input.operation
    || relationId(event, "actor") !== recordId(decision.actor)
    || recordString(event, "reason") !== input.reasonCode) return false;
  if (recordString(event, "result") !== "succeeded") return !!storedFailure(event, input);
  if (recordInteger(event, "generation_before") !== input.expectedGeneration) return false;
  if (input.revisionId && relationId(event, "to_revision") !== input.revisionId) return false;
  if (input.canonical && (recordString(event, "to_canonical_mode") !== input.canonical.mode
    || relationId(event, "to_binding") !== input.canonical.primaryBindingId)) return false;
  return true;
}

function failureStatus(code) {
  if (["promo_not_found", "store_not_promo", "promo_candidate_not_found"].includes(code)) return 404;
  if (["promo_publication_conflict", "promo_publication_state_conflict", "promo_publication_noop",
    "promo_canonical_invalid", "promo_publication_validation_failed"].includes(code)) return 409;
  if (["promo_publication_unavailable", "promo_candidate_unavailable"].includes(code)) return 503;
  return 403;
}

function eventResponse(event, replayed) {
  const operation = recordString(event, "operation");
  const revisionId = relationId(event, "to_revision");
  const bindingId = relationId(event, "to_binding");
  const mode = recordString(event, "to_canonical_mode") || "platform";
  return Object.freeze({
    ok: true,
    contract: contract.PUBLICATION_RESULT_CONTRACT,
    operation,
    result: "succeeded",
    replayed: replayed === true,
    generation_before: recordInteger(event, "generation_before"),
    generation_after: recordInteger(event, "generation_after"),
    state: operation === "unpublish" ? "unpublished" : (operation === "pause" ? "paused" : "active"),
    canonical: Object.freeze({ mode, ...(bindingId ? { primary_binding_id: bindingId } : {}) }),
    revision: revisionId ? Object.freeze({
      revision_id: revisionId,
      digest: recordString(event, "revision_sha256"),
    }) : null,
  });
}

function revisionDigest(app, siteId, revisionId) {
  if (!revisionId) return "";
  const revision = findRecord(app, "promo_revisions", revisionId);
  return revision && relationId(revision, "site") === siteId ? recordString(revision, "snapshot_sha256") : "";
}

function bindingState(app, siteId, canonical) {
  if (!canonical || canonical.mode === "platform") return "platform";
  const binding = findRecord(app, "promo_domain_bindings", canonical.primaryBindingId);
  if (!binding || relationId(binding, "site") !== siteId) return "invalid";
  return `${recordString(binding, "role")}_${recordString(binding, "status")}`.slice(0, 80);
}

function slotSnapshot(app, siteId, slot, reasonCode) {
  const canonical = rawCanonical(slot);
  return contract.publicationAuditSnapshot({
    state: recordString(slot, "state"),
    generation: recordInteger(slot, "generation"),
    canonicalMode: canonical.mode,
    revisionDigest: revisionDigest(app, siteId, relationId(slot, "published_revision")),
    bindingState: bindingState(app, siteId, canonical),
    reasonCode: reasonCode || "",
  });
}

function actorSnapshot(actor) {
  const role = recordString(actor, "role");
  const fallback = role === "master_admin" ? "Master Admin" : "Miembro del equipo";
  return Object.freeze({
    id: recordId(actor),
    name: String(recordString(actor, "display_name") || recordString(actor, "name") || fallback).slice(0, 140),
    role,
  });
}

function createPublicationEvent(app, decision, input, slot, next) {
  const event = new Record(app.findCollectionByNameOrId("promo_publication_events"), {});
  event.set("site", recordId(decision.site));
  event.set("operation", input.operation);
  event.set("result", "succeeded");
  event.set("generation_before", input.expectedGeneration);
  event.set("generation_after", input.expectedGeneration + 1);
  event.set("from_revision", relationId(slot, "published_revision"));
  event.set("to_revision", next.revisionId);
  event.set("from_binding", relationId(slot, "primary_binding"));
  event.set("to_binding", next.canonical.primaryBindingId);
  event.set("from_canonical_mode", recordString(slot, "canonical_mode") || "platform");
  event.set("to_canonical_mode", next.canonical.mode);
  event.set("actor", recordId(decision.actor));
  event.set("actor_snapshot_json", actorSnapshot(decision.actor));
  event.set("reason", input.reasonCode);
  event.set("idempotency_key", input.idempotencyKey);
  event.set("revision_sha256", next.revisionDigest);
  event.set("error_class", "");
  app.save(event);
  return event;
}

function createFailedPublicationEvent(app, decision, input, slot, result, code) {
  const event = new Record(app.findCollectionByNameOrId("promo_publication_events"), {});
  const generation = Math.max(0, recordInteger(slot, "generation") || 0);
  const canonical = rawCanonical(slot);
  event.set("site", recordId(decision.site));
  event.set("operation", input.operation);
  event.set("result", result);
  event.set("generation_before", generation);
  event.set("generation_after", generation);
  event.set("from_revision", relationId(slot, "published_revision"));
  event.set("to_revision", "");
  event.set("from_binding", relationId(slot, "primary_binding"));
  event.set("to_binding", "");
  event.set("from_canonical_mode", canonical.mode);
  event.set("to_canonical_mode", canonical.mode);
  event.set("actor", recordId(decision.actor));
  event.set("actor_snapshot_json", actorSnapshot(decision.actor));
  event.set("reason", input.reasonCode);
  event.set("idempotency_key", input.idempotencyKey);
  event.set("revision_sha256", "");
  event.set("error_class", `${result}.${code}.${requestFingerprint(input)}`);
  app.save(event);
  audit.createPromoAudit(app, decision, {
    action: "promo.security.reject",
    resourceType: "promo_security_event",
    resourceId: recordId(event),
    changedPaths: [],
    previousValues: {},
    newValues: { class: code, result, reason_code: input.reasonCode },
    sourceEventKey: `promo.publication.${recordId(event)}.${result}`,
  });
  return event;
}

function shouldRecordFailure(code) {
  return ![
    "invalid_payload", "unauthorized", "session_revoked", "user_inactive", "blocked_by_plan",
    "promo_not_found", "store_not_promo", "promo_store_context_required", "promo_permission_denied",
    "reserved_promo_action", "unknown_promo_action", "promo_idempotency_conflict",
  ].includes(code);
}

function recordTransitionFailure(app, auth, request, input, error) {
  const code = errorCode(error);
  if (!request || !input || !shouldRecordFailure(code)) return null;
  let event = null;
  app.runInTransaction((transaction) => {
    const decision = decisionFor(transaction, auth, request.supportStoreId, input.operation);
    const existing = findIdempotentEvent(transaction, recordId(decision.site), input.idempotencyKey);
    if (existing) {
      if (!eventMatchesRequest(existing, decision, input)) throw codedError("promo_idempotency_conflict", 409);
      event = existing;
      return;
    }
    const slot = slotForSite(transaction, recordId(decision.site));
    if (!slot) return;
    const result = code === "promo_publication_unavailable" ? "failed" : "rejected";
    event = createFailedPublicationEvent(transaction, decision, input, slot, result, code);
  });
  return event;
}

function replayAfterRace(app, auth, request, input) {
  let decision;
  try {
    decision = decisionFor(app, auth, request.supportStoreId, input.operation);
    assertOperationalStore(decision);
  } catch (_) { return null; }
  const existing = findIdempotentEvent(app, recordId(decision.site), input.idempotencyKey);
  if (!existing) return null;
  if (!eventMatchesRequest(existing, decision, input)) throw codedError("promo_idempotency_conflict", 409);
  const failure = storedFailure(existing, input);
  if (failure) throw codedError(failure.code, failureStatus(failure.code));
  return eventResponse(existing, true);
}

function changedAuditPaths(previous, next) {
  const paths = ["/reason_code"];
  for (const [field, path] of [
    ["state", "/state"],
    ["generation", "/generation"],
    ["canonical_mode", "/canonical_mode"],
    ["revision_digest", "/revision_digest"],
    ["binding_state", "/binding_state"],
  ]) if (previous[field] !== next[field]) paths.push(path);
  return paths;
}

function auditAction(operation) {
  return `promo.publication.${operation}`;
}

function saveSiteState(app, decision, nextState) {
  if (recordString(decision.site, "status") === nextState) return decision.site;
  decision.site.set("status", nextState);
  decision.site.set("updated_by", recordId(decision.actor));
  app.save(decision.site);
  return decision.site;
}

function applySlot(app, decision, slot, input, next) {
  const siteId = recordId(decision.site);
  const previousSnapshot = slotSnapshot(app, siteId, slot, "");
  const event = createPublicationEvent(app, decision, input, slot, next);
  slot.set("state", next.state);
  slot.set("published_revision", next.revisionId);
  slot.set("canonical_mode", next.canonical.mode);
  slot.set("primary_binding", next.canonical.primaryBindingId);
  slot.set("generation", input.expectedGeneration + 1);
  slot.set("published_by", recordId(decision.actor));
  if (next.state === "active") slot.set("published_at", new Date().toISOString());
  app.save(slot);
  if (next.state === "active") saveSiteState(app, decision, "active");
  if (["paused", "unpublished"].includes(next.state)) saveSiteState(app, decision, "paused");
  const nextSnapshot = slotSnapshot(app, siteId, slot, input.reasonCode);
  audit.createPromoAudit(app, decision, {
    action: auditAction(input.operation),
    resourceType: "promo_publication_slot",
    resourceId: recordId(slot),
    changedPaths: changedAuditPaths(previousSnapshot, nextSnapshot),
    previousValues: previousSnapshot,
    newValues: nextSnapshot,
    sourceEventKey: `promo.publication.${recordId(event)}.${input.operation}`,
  });
  return event;
}

function transitionTarget(app, decision, slot, input) {
  const currentRevisionId = relationId(slot, "published_revision");
  const currentCanonical = rawCanonical(slot);
  if (input.operation === "unpublish") {
    return Object.freeze({ state: "unpublished", revisionId: "", revisionDigest: "", canonical: validateCanonical(app, decision, { mode: "platform" }) });
  }
  if (input.operation === "pause") {
    return Object.freeze({
      state: "paused",
      revisionId: currentRevisionId,
      revisionDigest: revisionDigest(app, recordId(decision.site), currentRevisionId),
      canonical: Object.freeze({ ...currentCanonical, binding: null }),
    });
  }
  if (input.operation === "resume") {
    const validated = validateRevisionTarget(app, decision, currentRevisionId, "rollback");
    return Object.freeze({
      state: "active",
      revisionId: currentRevisionId,
      revisionDigest: validated.digest,
      canonical: validateCanonical(app, decision, currentCanonical),
    });
  }
  if (input.operation === "binding_switch") {
    const validated = validateRevisionTarget(app, decision, currentRevisionId, "rollback");
    const canonical = validateCanonical(app, decision, input.canonical);
    if (canonical.mode === currentCanonical.mode && canonical.primaryBindingId === currentCanonical.primaryBindingId) {
      throw codedError("promo_publication_noop", 409);
    }
    return Object.freeze({ state: "active", revisionId: currentRevisionId, revisionDigest: validated.digest, canonical });
  }
  const validated = validateRevisionTarget(
    app,
    decision,
    input.revisionId,
    input.operation === "rollback" ? "rollback" : "publish",
  );
  const canonical = validateCanonical(app, decision, input.canonical);
  if (input.operation === "rollback" && input.revisionId === currentRevisionId) {
    throw codedError("promo_publication_noop", 409);
  }
  if (input.operation === "publish" && input.revisionId === currentRevisionId
    && canonical.mode === currentCanonical.mode && canonical.primaryBindingId === currentCanonical.primaryBindingId) {
    throw codedError("promo_publication_noop", 409);
  }
  return Object.freeze({
    state: "active",
    revisionId: recordId(validated.revision),
    revisionDigest: validated.digest,
    canonical,
  });
}

function handleTransition(e, operation) {
  let request;
  let input;
  try {
    request = requestContext(e);
    input = contract.parseTransition(operation, request.body);
    if (!input) throw codedError("invalid_payload", 400);
  } catch (error) { return sendError(e, error); }
  try {
    let response;
    e.app.runInTransaction((app) => {
      const decision = decisionFor(app, e.auth, request.supportStoreId, operation);
      assertOperationalStore(decision);
      const existing = findIdempotentEvent(app, recordId(decision.site), input.idempotencyKey);
      if (existing) {
        if (!eventMatchesRequest(existing, decision, input)) throw codedError("promo_idempotency_conflict", 409);
        const failure = storedFailure(existing, input);
        if (failure) throw codedError(failure.code, failureStatus(failure.code));
        response = eventResponse(existing, true);
        return;
      }
      let slot = slotForSite(app, recordId(decision.site));
      if (!slot) throw codedError("promo_publication_unavailable", 503);
      lockRecord(app, "promo_publication_slots", recordId(slot));
      slot = slotForSite(app, recordId(decision.site));
      if (!slot || recordInteger(slot, "generation") !== input.expectedGeneration) {
        throw codedError("promo_publication_conflict", 409);
      }
      assertStateForOperation(decision, slot, operation);
      const next = transitionTarget(app, decision, slot, input);
      response = eventResponse(applySlot(app, decision, slot, input, next), false);
    });
    return e.json(200, response);
  } catch (error) {
    try {
      const replay = replayAfterRace(e.app, e.auth, request, input);
      if (replay) return e.json(200, replay);
    } catch (replayError) { return sendError(e, replayError); }
    try { recordTransitionFailure(e.app, e.auth, request, input, error); } catch (_) {}
    return sendError(e, error);
  }
}

function errorCode(error) {
  const code = String(error && (error.code || error.message) || "").trim().slice(0, 80);
  if (SAFE_ERRORS.has(code)) return code;
  if (error instanceof contract.PromoPublishError) return "invalid_payload";
  if (error instanceof promo.PromoAccessError) return SAFE_ERRORS.has(code) ? code : "promo_permission_denied";
  return "promo_publication_unavailable";
}

function errorStatus(error) {
  const code = errorCode(error);
  if (Number.isInteger(error && error.status)) return error.status;
  if (code === "invalid_payload") return 400;
  if (["promo_not_found", "store_not_promo", "promo_candidate_not_found"].includes(code)) return 404;
  if (["promo_draft_conflict", "promo_publication_conflict", "promo_publication_state_conflict",
    "promo_publication_noop", "promo_idempotency_conflict", "promo_canonical_invalid",
    "promo_publication_validation_failed"].includes(code)) return 409;
  if (["promo_draft_unavailable", "promo_candidate_unavailable", "promo_preview_unavailable",
    "promo_publication_unavailable"].includes(code)) return 503;
  return 403;
}

function sendError(e, error) {
  return e.json(errorStatus(error), { ok: false, error: errorCode(error) });
}

module.exports = {
  REQUIRED_COLLECTIONS,
  SAFE_ERRORS,
  assertOperationalStore,
  assertStateForOperation,
  candidateResponse,
  collectionsReady,
  decisionFor,
  errorCode,
  errorStatus,
  eventMatchesRequest,
  eventResponse,
  handleBindingSwitch: (e) => handleTransition(e, "binding_switch"),
  handleCandidateCreate,
  handlePause: (e) => handleTransition(e, "pause"),
  handlePreview,
  handlePublish: (e) => handleTransition(e, "publish"),
  handleResume: (e) => handleTransition(e, "resume"),
  handleRollback: (e) => handleTransition(e, "rollback"),
  handleTransition,
  handleUnpublish: (e) => handleTransition(e, "unpublish"),
  requireAuthenticatedUser,
  requestFingerprint,
  recordTransitionFailure,
  replayAfterRace,
  sendError,
  validateDraftCandidate,
  validateRevisionTarget,
};
