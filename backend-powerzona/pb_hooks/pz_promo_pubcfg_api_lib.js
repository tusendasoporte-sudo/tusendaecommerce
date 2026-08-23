/// <reference path="../pb_data/types.d.ts" />

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const contract = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const promoAudit = typeof __hooks === "undefined"
  ? require("./pz_promo_audit_lib.js")
  : require(`${__hooks}/pz_promo_audit_lib.js`);
const promoTheme = typeof __hooks === "undefined"
  ? require("./pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);

const PRIVATE_COLLECTIONS = Object.freeze([
  "promo_sites",
  "promo_site_entitlements",
  "promo_theme_releases",
  "promo_draft_documents",
  "promo_media_assets",
  "promo_revisions",
  "promo_revision_media_refs",
  "promo_publication_slots",
  "promo_audit_events",
]);

const SAFE_PRIVATE_ERRORS = new Set([
  "unauthorized",
  "session_revoked",
  "user_inactive",
  "blocked_by_plan",
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
  "invalid_promo_document",
  "unknown_promo_contract",
  "unknown_promo_theme_token",
  "unsupported_promo_action",
  "invalid_promo_media_reference",
  "invalid_promo_contact_reference",
  "incomplete_promo_locale",
  "promo_draft_conflict",
  "promo_draft_unavailable",
  "promo_pubcfg_unavailable",
]);

function safeText(value, max) {
  const text = promo.safeText(value);
  return Number.isInteger(max) ? text.slice(0, max) : text;
}

function recordId(record) {
  return promo.recordId(record);
}

function recordString(record, key) {
  return promo.recordString(record, key);
}

function recordInteger(record, key) {
  return promo.recordInteger(record, key);
}

function recordBool(record, key) {
  return promo.recordBool(record, key);
}

function relationId(record, key) {
  return promo.relationId(record, key);
}

function recordValue(record, key) {
  return promo.recordValue(record, key);
}

function normalizedObject(value) {
  if (value === undefined || value === null) return {};
  try {
    const normalized = contract.normalizeJson(value);
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) {
    return null;
  }
}

function exactPayload(value, keys) {
  const object = normalizedObject(value);
  if (!object) return false;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
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

function setNoStoreHeaders(e) {
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
  setNoStoreHeaders(e);
  if (!e || !e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function errorCode(error) {
  if (error instanceof contract.PromoPubcfgError) {
    return error.code === "promo_pubcfg_unavailable" ? "promo_pubcfg_unavailable" : "invalid_promo_document";
  }
  const code = safeText(error && (error.code || error.message), 80);
  if (/^(?:invalid_promo_|unsafe_promo_|unknown_promo_contract|unknown_promo_theme_token|unsupported_promo_action|incomplete_promo_locale|promo_document_|promo_sections_|promo_gallery_|promo_services_|promo_contact_|promo_media_refs_|promo_locales_|commerce_field_forbidden_in_promo)/.test(code)) {
    return "invalid_promo_document";
  }
  return SAFE_PRIVATE_ERRORS.has(code) ? code : "promo_pubcfg_unavailable";
}

function privateStatus(error) {
  const code = errorCode(error);
  if (Number.isInteger(error && error.status)) return error.status;
  if ([
    "invalid_payload", "invalid_promo_document", "unknown_promo_contract", "unknown_promo_theme_token",
    "unsupported_promo_action", "invalid_promo_media_reference", "invalid_promo_contact_reference",
    "incomplete_promo_locale",
  ].includes(code)) return 400;
  if (["promo_not_found", "store_not_promo"].includes(code)) return 404;
  if (code === "promo_draft_conflict") return 409;
  if (["promo_draft_unavailable", "promo_pubcfg_unavailable"].includes(code)) return 503;
  return 403;
}

function sendPrivateError(e, error) {
  return e.json(privateStatus(error), { ok: false, error: errorCode(error) });
}

function findRecord(app, collection, id) {
  if (!contract.RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, sort, limit, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection, filter, sort || "id", Number.isInteger(limit) ? limit : 2, 0, params || {},
    ) || []);
  } catch (_) {
    return [];
  }
}

function findExact(app, collection, filter, params) {
  const rows = findRecords(app, collection, filter, "id", 2, params);
  return rows.length === 1 ? rows[0] : null;
}

function collectionsReady(app) {
  try {
    return PRIVATE_COLLECTIONS.every((name) => {
      const collection = app.findCollectionByNameOrId(name);
      return collection.listRule === null
        && collection.viewRule === null
        && collection.createRule === null
        && collection.updateRule === null
        && collection.deleteRule === null;
    });
  } catch (_) {
    return false;
  }
}

function requestInfo(e) {
  const info = e.requestInfo();
  if (!info || !exactPayload(info.query || {}, [])) throw codedError("invalid_payload", 400);
  return info;
}

function jsonRecordValue(record, key) {
  try { return contract.normalizeJson(recordValue(record, key)); } catch (_) {
    throw codedError("promo_pubcfg_unavailable", 503);
  }
}

function assertDigest(document, expected) {
  const digest = contract.digestDocument(document);
  if (digest !== recordSafeDigest(expected)) throw codedError("promo_pubcfg_unavailable", 503);
  return digest;
}

function recordSafeDigest(value) {
  const digest = safeText(value, 64).toLowerCase();
  return data.SHA256_PATTERN.test(digest) ? digest : "";
}

function assertEntitlementMetrics(entitlement, document, assets) {
  const metrics = contract.documentMetrics(document, assets);
  const checks = [
    ["max_services", metrics.services],
    ["max_gallery_assets", metrics.gallery],
    ["max_locales", metrics.locales],
    ["max_videos", metrics.videos],
    ["max_storage_bytes", metrics.bytes],
  ];
  for (const [key, amount] of checks) {
    if (amount > 0 && !promo.resolvePromoCapabilityAccess(entitlement, key, { requiredAmount: amount }).allowed) {
      throw codedError("promo_capability_denied", 403);
    }
  }
  if (metrics.locales > 1
    && !promo.resolvePromoCapabilityAccess(entitlement, "multilanguage_enabled").allowed) {
    throw codedError("promo_capability_denied", 403);
  }
  if (metrics.videos > 0
    && !promo.resolvePromoCapabilityAccess(entitlement, "video_enabled").allowed) {
    throw codedError("promo_capability_denied", 403);
  }
  if (document.adapters.landing_qr_link.enabled
    && !promo.resolvePromoCapabilityAccess(entitlement, "landing_qr_bridge_enabled").allowed) {
    throw codedError("promo_capability_denied", 403);
  }
  return metrics;
}

function assertDraftTheme(app, document, options) {
  if (!document.theme.theme_id) return null;
  const theme = findExact(
    app,
    "promo_theme_releases",
    "theme_id = {:theme} && version = {:version}",
    { theme: document.theme.theme_id, version: document.theme.version },
  );
  try {
    promoTheme.assertReleaseForSelection(theme, document.theme, {
      mode: options && options.selectionChanged ? "select" : "edit",
    });
  } catch (_) {
    throw codedError("invalid_promo_document", 400);
  }
  return theme;
}

function loadDocumentAssets(app, siteId, document, options) {
  const settings = options || {};
  const assets = [];
  for (const [key, ref] of Object.entries(document.media_refs)) {
    const asset = findRecord(app, "promo_media_assets", ref.asset_id);
    if (!asset || relationId(asset, "site") !== siteId || recordString(asset, "purpose") !== ref.purpose) {
      throw codedError("invalid_promo_media_reference", 400);
    }
    const status = recordString(asset, "status");
    if (settings.publicRevision ? status !== "ready" : !["uploaded", "processing", "ready"].includes(status)) {
      throw codedError("invalid_promo_media_reference", 400);
    }
    const kind = recordString(asset, "kind");
    if (!['image', 'video'].includes(kind)) throw codedError("invalid_promo_media_reference", 400);
    assets.push({
      id: recordId(asset),
      key,
      purpose: ref.purpose,
      kind,
      bytes: recordInteger(asset, "bytes") || 0,
      width: recordInteger(asset, "width") || 0,
      height: recordInteger(asset, "height") || 0,
      duration_ms: recordInteger(asset, "duration_ms") || 0,
    });
  }
  return assets;
}

function validateRevisionMediaRows(app, siteId, revisionId, document, assets) {
  const rows = findRecords(
    app,
    "promo_revision_media_refs",
    "revision = {:revision}",
    "use_key",
    data.HARD_LIMITS.max_media_refs + 1,
    { revision: revisionId },
  );
  const expected = Object.keys(document.media_refs).sort();
  if (rows.length !== expected.length) throw codedError("promo_pubcfg_unavailable", 503);
  const assetMap = new Map(assets.map((asset) => [asset.key, asset]));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const useKey = recordString(row, "use_key");
    const expectedAsset = assetMap.get(useKey);
    if (useKey !== expected[index]
      || relationId(row, "site") !== siteId
      || relationId(row, "revision") !== revisionId
      || !expectedAsset
      || relationId(row, "media_asset") !== expectedAsset.id) {
      throw codedError("promo_pubcfg_unavailable", 503);
    }
  }
}

function resolvePublicProjection(app, publicSlug) {
  if (!collectionsReady(app)) throw codedError("promo_pubcfg_unavailable", 503);
  try { data.assertPublicSlug(publicSlug); } catch (_) { throw codedError("promo_not_found", 404); }
  const site = findExact(app, "promo_sites", "public_slug = {:slug}", { slug: publicSlug });
  if (!site || recordString(site, "public_slug") !== publicSlug || recordString(site, "status") !== "active"
    || recordInteger(site, "contract_version") !== 1) throw codedError("promo_not_found", 404);
  const siteId = recordId(site);
  const store = findRecord(app, "stores", relationId(site, "store"));
  if (!store || recordString(store, "status") !== "active") throw codedError("promo_not_found", 404);
  const entitlement = findExact(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
  if (!entitlement || !promo.resolvePromoCapabilityAccess(entitlement, "promo_site_enabled").allowed) {
    throw codedError("promo_not_found", 404);
  }
  const slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
  const generation = slot && recordInteger(slot, "generation");
  if (!slot || recordString(slot, "state") !== "active" || recordString(slot, "canonical_mode") !== "platform"
    || relationId(slot, "primary_binding") || generation === null || generation < 1) {
    throw codedError("promo_not_found", 404);
  }
  const revisionId = relationId(slot, "published_revision");
  const revision = findRecord(app, "promo_revisions", revisionId);
  if (!revision || relationId(revision, "site") !== siteId || recordInteger(revision, "schema_version") !== 1) {
    throw codedError("promo_not_found", 404);
  }
  const document = contract.validatePromoDocument(jsonRecordValue(revision, "snapshot_json"), { publicRevision: true });
  assertDigest(document, recordString(revision, "snapshot_sha256"));
  const locales = jsonRecordValue(revision, "published_locales_json");
  if (recordString(revision, "default_locale") !== document.locales.default
    || contract.canonicalJson(locales) !== contract.canonicalJson(document.locales.published)) {
    throw codedError("promo_pubcfg_unavailable", 503);
  }
  const theme = findRecord(app, "promo_theme_releases", relationId(revision, "theme_release"));
  try {
    promoTheme.assertReleaseForSelection(theme, document.theme, { mode: "public" });
  } catch (_) {
    throw codedError("promo_pubcfg_unavailable", 503);
  }
  const assets = loadDocumentAssets(app, siteId, document, { publicRevision: true });
  validateRevisionMediaRows(app, siteId, revisionId, document, assets);
  assertEntitlementMetrics(entitlement, document, assets);
  const finalSlot = findRecord(app, "promo_publication_slots", recordId(slot));
  if (!finalSlot || recordInteger(finalSlot, "generation") !== generation
    || relationId(finalSlot, "published_revision") !== revisionId
    || recordString(finalSlot, "state") !== "active"
    || recordString(finalSlot, "canonical_mode") !== "platform"
    || relationId(finalSlot, "primary_binding")) {
    throw codedError("promo_not_found", 404);
  }
  return contract.projectPublicDocument(document, publicSlug, assets);
}

function handlePublicProjection(e) {
  setNoStoreHeaders(e);
  try {
    requestInfo(e);
    const publicSlug = safeText(e.request.pathValue("publicSlug"), 80);
    return e.json(200, resolvePublicProjection(e.app, publicSlug));
  } catch (error) {
    if (errorCode(error) === "invalid_payload") return e.json(400, { ok: false, error: "invalid_payload" });
    return e.json(404, { ok: false, error: "promo_public_unavailable" });
  }
}

function privateRequestContext(e) {
  setNoStoreHeaders(e);
  if (!collectionsReady(e.app)) throw codedError("promo_pubcfg_unavailable", 503);
  const info = requestInfo(e);
  if (!e.auth) throw codedError("unauthorized", 403);
  return { info, supportStoreId: requestHeader(info, "X-PZ-Promo-Store") };
}

function requireMasterOperationalAction(decision, actionKey) {
  const definition = promo.PROMO_ACTION_CATALOG[actionKey];
  if (!definition || definition.scope === "master") throw codedError("unknown_promo_action", 403);
  if (!definition.store_statuses.includes(recordString(decision.store, "status"))
    || !definition.site_statuses.includes(recordString(decision.site, "status"))) {
    throw codedError("promo_site_inactive", 403);
  }
  for (const capability of definition.capabilities) {
    const requiredAmount = definition.capability_amounts[capability];
    const access = promo.resolvePromoCapabilityAccess(decision.entitlement, capability, {
      ...(requiredAmount === undefined ? {} : { requiredAmount }),
    });
    if (!access.allowed) throw codedError("promo_capability_denied", 403);
  }
}

function draftDecision(app, auth, supportStoreId, actionKeys) {
  const master = recordString(auth, "role") === promo.MASTER_ROLE;
  if (master) {
    const decision = promo.requirePromoAction(app, auth, "promo.master.support", {
      requestedStoreId: supportStoreId,
    });
    actionKeys.forEach((actionKey) => requireMasterOperationalAction(decision, actionKey));
    return decision;
  }
  if (supportStoreId && supportStoreId !== relationId(auth, "store")) throw codedError("promo_not_found", 404);
  let decision = null;
  actionKeys.forEach((actionKey) => {
    decision = promo.requirePromoAction(app, auth, actionKey, {});
  });
  return decision;
}

function findDraft(app, siteId) {
  return findExact(app, "promo_draft_documents", "site = {:site}", { site: siteId });
}

function validatedStoredDraft(draft) {
  if (!draft || recordInteger(draft, "schema_version") !== 1 || (recordInteger(draft, "version") || 0) < 1) {
    throw codedError("promo_draft_unavailable", 503);
  }
  const document = contract.validatePromoDocument(jsonRecordValue(draft, "document_json"), { publicRevision: false });
  assertDigest(document, recordString(draft, "document_sha256"));
  return document;
}

function draftResponse(draft, document, changed) {
  return {
    ok: true,
    contract: contract.DRAFT_RESPONSE_CONTRACT,
    ...(typeof changed === "boolean" ? { changed } : {}),
    draft: {
      schema_version: 1,
      version: recordInteger(draft, "version"),
      document: contract.normalizeJson(document),
    },
  };
}

function parseDraftRead(body) {
  return exactPayload(body, ["contract"])
    && bodyValue(body, "contract") === contract.DRAFT_READ_CONTRACT;
}

function parseDraftUpdate(body) {
  if (!exactPayload(body, ["contract", "expected_version", "document"])
    || bodyValue(body, "contract") !== contract.DRAFT_UPDATE_CONTRACT) return null;
  const expectedVersion = Number(bodyValue(body, "expected_version"));
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) return null;
  return {
    expectedVersion,
    document: contract.validatePromoDocument(bodyValue(body, "document"), { publicRevision: false }),
  };
}

function handleDraftRead(e) {
  try {
    const context = privateRequestContext(e);
    if (!parseDraftRead(context.info.body || {})) throw codedError("invalid_payload", 400);
    const decision = draftDecision(e.app, e.auth, context.supportStoreId, ["promo.site.view"]);
    const draft = findDraft(e.app, recordId(decision.site));
    const document = validatedStoredDraft(draft);
    return e.json(200, draftResponse(draft, document));
  } catch (error) {
    return sendPrivateError(e, error);
  }
}

function lockDraft(app, draftId) {
  app.db().newQuery("UPDATE promo_draft_documents SET id = id WHERE id = {:id}")
    .bind({ id: draftId })
    .execute();
}

function createDraftAudit(app, decision, draft, paths, previousDocument, nextDocument, previousDigest, nextDigest, nextVersion) {
  const previousSnapshot = promoAudit.draftAuditSnapshot(previousDocument, previousDigest, nextVersion - 1);
  const nextSnapshot = promoAudit.draftAuditSnapshot(nextDocument, nextDigest, nextVersion);
  promoAudit.createPromoAudit(app, decision, {
    action: "promo.draft.update",
    resourceType: "promo_draft_document",
    resourceId: recordId(draft),
    changedPaths: paths,
    previousValues: previousSnapshot,
    newValues: nextSnapshot,
    sourceEventKey: `promo.draft.${recordId(draft)}.v${nextVersion}`,
  });
  const localizationPaths = paths.filter((path) => (
    path === "/system_catalog_version" || path === "/locales" || path === "/content_by_locale"
  ));
  if (localizationPaths.length) {
    promoAudit.createPromoAudit(app, decision, {
      action: "promo.localization.update",
      resourceType: "promo_draft_document",
      resourceId: recordId(draft),
      changedPaths: localizationPaths,
      previousValues: previousSnapshot,
      newValues: nextSnapshot,
      sourceEventKey: `promo.localization.${recordId(draft)}.v${nextVersion}`,
    });
  }
  const themePaths = paths.filter((path) => path === "/theme");
  if (themePaths.length) {
    promoAudit.createPromoAudit(app, decision, {
      action: "promo.theme.selection.update",
      resourceType: "promo_draft_document",
      resourceId: recordId(draft),
      changedPaths: themePaths,
      previousValues: previousSnapshot,
      newValues: nextSnapshot,
      sourceEventKey: `promo.theme.selection.${recordId(draft)}.v${nextVersion}`,
    });
  }
}

function handleDraftUpdate(e) {
  let parsed;
  let context;
  try {
    context = privateRequestContext(e);
    parsed = parseDraftUpdate(context.info.body || {});
    if (!parsed) throw codedError("invalid_payload", 400);
  } catch (error) {
    return sendPrivateError(e, error);
  }
  try {
    let response;
    e.app.runInTransaction((app) => {
      let decision = draftDecision(app, e.auth, context.supportStoreId, ["promo.content.manage"]);
      let draft = findDraft(app, recordId(decision.site));
      if (!draft) throw codedError("promo_draft_unavailable", 503);
      lockDraft(app, recordId(draft));
      draft = findRecord(app, "promo_draft_documents", recordId(draft));
      if (!draft || relationId(draft, "site") !== recordId(decision.site)) throw codedError("promo_not_found", 404);
      const previousDocument = validatedStoredDraft(draft);
      const currentVersion = recordInteger(draft, "version");
      if (currentVersion !== parsed.expectedVersion) throw codedError("promo_draft_conflict", 409);
      const syntacticActions = contract.changedActionKeys(previousDocument, parsed.document, []);
      decision = draftDecision(app, e.auth, context.supportStoreId, syntacticActions.length
        ? syntacticActions
        : ["promo.content.manage"]);
      const selectionChanged = previousDocument.theme.theme_id !== parsed.document.theme.theme_id
        || previousDocument.theme.version !== parsed.document.theme.version;
      assertDraftTheme(app, parsed.document, { selectionChanged });
      const assets = loadDocumentAssets(app, recordId(decision.site), parsed.document, { publicRevision: false });
      assertEntitlementMetrics(decision.entitlement, parsed.document, assets);
      const requiredActions = contract.changedActionKeys(previousDocument, parsed.document, assets);
      if (requiredActions.length !== syntacticActions.length) {
        decision = draftDecision(app, e.auth, context.supportStoreId, requiredActions);
      }
      const previousDigest = contract.digestDocument(previousDocument);
      const nextDigest = contract.digestDocument(parsed.document);
      if (previousDigest === nextDigest) {
        response = draftResponse(draft, previousDocument, false);
        return;
      }
      const nextVersion = currentVersion + 1;
      const paths = contract.changedTopLevelPaths(previousDocument, parsed.document);
      draft.set("document_json", parsed.document);
      draft.set("document_sha256", nextDigest);
      draft.set("version", nextVersion);
      draft.set("updated_by", recordId(decision.actor));
      app.save(draft);
      createDraftAudit(
        app,
        decision,
        draft,
        paths,
        previousDocument,
        parsed.document,
        previousDigest,
        nextDigest,
        nextVersion,
      );
      draft = findRecord(app, "promo_draft_documents", recordId(draft));
      response = draftResponse(draft, parsed.document, true);
    });
    return e.json(200, response);
  } catch (error) {
    return sendPrivateError(e, error);
  }
}

module.exports = {
  PRIVATE_COLLECTIONS,
  SAFE_PRIVATE_ERRORS,
  assertEntitlementMetrics,
  assertDraftTheme,
  collectionsReady,
  draftDecision,
  errorCode,
  exactPayload,
  handleDraftRead,
  handleDraftUpdate,
  handlePublicProjection,
  loadDocumentAssets,
  parseDraftRead,
  parseDraftUpdate,
  privateStatus,
  requireAuthenticatedUser,
  resolvePublicProjection,
  findDraft,
  validateRevisionMediaRows,
  validatedStoredDraft,
};
