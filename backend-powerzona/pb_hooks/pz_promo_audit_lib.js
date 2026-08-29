/// <reference path="../pb_data/types.d.ts" />

const AUDIT_COLLECTION = "promo_audit_events";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SOURCE_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const PATH_PATTERN = /^\/[a-z][a-z0-9_-]*(?:\/[a-z0-9_-]+)*$/;
const ORIGINS = Object.freeze(["store_admin", "master_admin", "system", "migration"]);
const MODULES = Object.freeze([
  "content", "media", "publication", "domain", "theme", "localization",
  "contact", "reviews", "entitlement", "security", "support",
]);
const SEVERITIES = Object.freeze(["normal", "important", "critical"]);
const ACTOR_ROLES = Object.freeze(["master_admin", "store_admin", "store_staff", "system", "migration"]);
const SENSITIVE_KEY_PATTERN = /(?:^|_)(?:access_token|api_key|authorization|browser|challenge|cipher|config|cookie|credential|credentials|customer|destination|email|evidence|file|filename|form_data|full_ip|hmac|html|image_data|ip|ip_address|message|metadata|password|payload|phone|private_key|provider_reference|record|refresh_token|secret|session|session_token|target_url|token|url|user_agent)(?:$|_)/i;
const SENSITIVE_SOURCE_PATTERN = /(secret|token|cookie|authorization|credential|password|phone|email|message|payload|private|challenge|evidence|provider)/i;

function definition(moduleName, severity, resources, summary, options) {
  const settings = options || {};
  return Object.freeze({
    module: moduleName,
    severity,
    resources: Object.freeze(resources.slice()),
    summary,
    global: settings.global === true,
    allow_empty_paths: settings.allowEmptyPaths === true,
    critical_paths: Object.freeze((settings.criticalPaths || []).slice()),
  });
}

const ACTION_CATALOG = Object.freeze({
  "promo.site.create": definition("support", "critical", ["promo_site"], "Creó una Tienda Promo", { allowEmptyPaths: true }),
  "promo.site.status.update": definition("support", "critical", ["promo_site"], "Cambió el estado de la Tienda Promo"),
  "promo.lifecycle.public_state.update": definition("publication", "critical", ["promo_publication_slot"], "Cambió la disponibilidad pública de la Tienda Promo"),
  "promo.team.permissions.update": definition("support", "critical", ["promo_user_permissions"], "Actualizó permisos Promo de un miembro del equipo"),
  "promo.entitlements.update": definition("entitlement", "critical", ["promo_site_entitlements"], "Actualizó capacidades de la Tienda Promo"),
  "promo.draft.update": definition("content", "important", ["promo_draft_document"], "Actualizó el borrador de la Tienda Promo", {
    criticalPaths: ["/theme", "/locales", "/contact", "/adapters"],
  }),
  "promo.content.live.update": definition("content", "important", ["promo_live_document"], "Actualizó el contenido público de la Tienda Promo", {
    criticalPaths: ["/theme", "/locales", "/contact", "/adapters"],
  }),
  "promo.revision.create": definition("content", "important", ["promo_revision"], "Creó una revisión Promo inmutable", { allowEmptyPaths: true }),
  "promo.media.create": definition("media", "important", ["promo_media_asset"], "Creó un medio Promo", { allowEmptyPaths: true }),
  "promo.media.status.update": definition("media", "critical", ["promo_media_asset"], "Cambió el estado de un medio Promo"),
  "promo.media.delete": definition("media", "critical", ["promo_media_asset"], "Eliminó definitivamente un medio Promo", { allowEmptyPaths: true }),
  "promo.theme.release.update": definition("theme", "critical", ["promo_theme_release"], "Cambió un release de tema Promo", { global: true }),
  "promo.theme.selection.update": definition("theme", "critical", ["promo_draft_document", "promo_live_document"], "Cambió la selección de tema Promo"),
  "promo.localization.update": definition("localization", "important", ["promo_draft_document", "promo_live_document"], "Cambió locales o traducciones Promo"),
  "promo.contact.update": definition("contact", "critical", ["promo_draft_document"], "Cambió la configuración de contacto Promo"),
  "promo.reviews.moderate": definition("reviews", "important", ["promo_store_review"], "Moderó una reseña de tienda en Promo"),
  "promo.reviews.delete": definition("reviews", "critical", ["promo_store_review"], "Eliminó definitivamente una reseña de tienda", { allowEmptyPaths: true }),
  "promo.reviews.request.create": definition("reviews", "important", ["promo_review_request"], "Creó una solicitud privada de reseña"),
  "promo.reviews.request.revoke": definition("reviews", "important", ["promo_review_request"], "Revocó una solicitud privada de reseña"),
  "promo.publication.publish": definition("publication", "critical", ["promo_publication_slot"], "Publicó una revisión Promo"),
  "promo.publication.rollback": definition("publication", "critical", ["promo_publication_slot"], "Revirtió la publicación Promo"),
  "promo.publication.unpublish": definition("publication", "critical", ["promo_publication_slot"], "Despublicó la Tienda Promo"),
  "promo.publication.pause": definition("publication", "critical", ["promo_publication_slot"], "Pausó la publicación Promo"),
  "promo.publication.resume": definition("publication", "critical", ["promo_publication_slot"], "Reanudó la publicación Promo"),
  "promo.publication.binding_switch": definition("publication", "critical", ["promo_publication_slot"], "Cambió el origen canónico Promo"),
  "promo.domain.create": definition("domain", "critical", ["promo_domain_binding"], "Creó un binding de dominio Promo", { allowEmptyPaths: true }),
  "promo.domain.verify": definition("domain", "critical", ["promo_domain_binding"], "Verificó un binding de dominio Promo"),
  "promo.domain.activate": definition("domain", "critical", ["promo_domain_binding"], "Activó un binding de dominio Promo"),
  "promo.domain.pause": definition("domain", "critical", ["promo_domain_binding"], "Pausó un binding de dominio Promo"),
  "promo.domain.revoke": definition("domain", "critical", ["promo_domain_binding"], "Revocó un binding de dominio Promo"),
  "promo.domain.release": definition("domain", "critical", ["promo_domain_binding"], "Liberó un binding de dominio Promo"),
  "promo.domain.cloudflare.prepare.simulate": definition("domain", "critical", ["promo_domain_binding"], "Simuló la preparación Cloudflare de un dominio Promo", { allowEmptyPaths: true }),
  "promo.domain.cloudflare.inspect.simulate": definition("domain", "critical", ["promo_domain_binding"], "Simuló la consulta Cloudflare de un dominio Promo", { allowEmptyPaths: true }),
  "promo.domain.cloudflare.remove.simulate": definition("domain", "critical", ["promo_domain_binding"], "Simuló el retiro Cloudflare de un dominio Promo", { allowEmptyPaths: true }),
  "promo.security.reject": definition("security", "important", ["promo_security_event"], "Rechazó una operación Promo insegura", { allowEmptyPaths: true }),
});

const RESOURCE_SAFE_FIELDS = Object.freeze({
  promo_site: Object.freeze(["status", "public_slug", "contract_version"]),
  promo_user_permissions: Object.freeze(["permissions", "version", "sessions_revoked"]),
  promo_site_entitlements: Object.freeze(["source", "updated", "capabilities"]),
  promo_draft_document: Object.freeze(["digest", "version", "theme", "locales", "contact", "media", "adapters", "sections"]),
  promo_live_document: Object.freeze(["digest", "version", "theme", "locales", "contact", "media", "adapters", "sections"]),
  promo_revision: Object.freeze(["sequence", "digest", "theme", "default_locale", "published_locales", "source_draft_version"]),
  promo_media_asset: Object.freeze(["kind", "purpose", "status", "mime_detected", "bytes", "width", "height", "duration_ms"]),
  promo_theme_release: Object.freeze(["theme_id", "version", "status", "renderer_key", "contract_version"]),
  promo_publication_slot: Object.freeze(["state", "generation", "canonical_mode", "revision_digest", "binding_state", "reason_code"]),
  promo_domain_binding: Object.freeze(["role", "status", "is_current", "state_version", "verification_method"]),
  promo_store_review: Object.freeze(["status", "featured", "approved"]),
  promo_review_request: Object.freeze(["status", "locale", "expires"]),
  promo_security_event: Object.freeze(["class", "result", "reason_code"]),
});

const RESOURCE_PATH_PREFIXES = Object.freeze({
  promo_site: Object.freeze(["/status", "/public_slug", "/contract_version"]),
  promo_user_permissions: Object.freeze(["/permissions", "/promo_permissions", "/version", "/sessions_revoked"]),
  promo_site_entitlements: Object.freeze(["/source", "/updated", "/capabilities"]),
  promo_draft_document: Object.freeze([
    "/contract", "/system_catalog_version", "/locales", "/theme", "/identity",
    "/section_order", "/sections", "/media_refs", "/contact", "/content_by_locale", "/adapters",
  ]),
  promo_live_document: Object.freeze([
    "/contract", "/system_catalog_version", "/locales", "/theme", "/identity",
    "/section_order", "/sections", "/media_refs", "/contact", "/content_by_locale", "/adapters",
  ]),
  promo_revision: Object.freeze(["/sequence", "/digest", "/theme", "/default_locale", "/published_locales", "/source_draft_version"]),
  promo_media_asset: Object.freeze(["/kind", "/purpose", "/status", "/mime_detected", "/bytes", "/width", "/height", "/duration_ms"]),
  promo_theme_release: Object.freeze(["/theme_id", "/version", "/status", "/renderer_key", "/contract_version"]),
  promo_publication_slot: Object.freeze(["/state", "/generation", "/canonical_mode", "/revision_digest", "/binding_state", "/reason_code"]),
  promo_domain_binding: Object.freeze(["/role", "/status", "/is_current", "/state_version", "/verification_method"]),
  promo_store_review: Object.freeze(["/status", "/featured", "/approved"]),
  promo_review_request: Object.freeze(["/status", "/locale", "/expires_at"]),
  promo_security_event: Object.freeze(["/class", "/result", "/reason_code"]),
});

class PromoAuditError extends Error {
  constructor(code) {
    super(code || "invalid_promo_audit");
    this.name = "PromoAuditError";
    this.code = code || "invalid_promo_audit";
  }
}

function fail(code) {
  throw new PromoAuditError(code);
}

function safeText(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Math.max(0, Number(max) || 0));
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try { return safeText(value.string(), max || 1000); } catch (_) {}
  }
  return safeText(value, max || 1000);
}

function recordId(record) {
  return safeText(record && (record.id || recordString(record, "id", 80)), 80);
}

function plainJson(value) {
  if (typeof value === "string" && value) {
    try { return JSON.parse(value); } catch (_) { return value; }
  }
  if (value && typeof value === "object" && typeof value.raw === "string") {
    try { return JSON.parse(value.raw); } catch (_) {}
  }
  return value;
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableFingerprint(value) {
  const source = stableValue(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeNode(value, depth) {
  const parsed = plainJson(value);
  if (depth > 5) fail("promo_audit_payload_too_deep");
  if (parsed === null) return null;
  if (typeof parsed === "boolean") return parsed;
  if (typeof parsed === "number") {
    if (!Number.isFinite(parsed)) fail("invalid_promo_audit_value");
    return parsed;
  }
  if (typeof parsed === "string") return safeText(parsed, 500);
  if (Array.isArray(parsed)) {
    if (parsed.length > 64) fail("promo_audit_array_too_large");
    return parsed.map((item) => sanitizeNode(item, depth + 1));
  }
  if (!parsed || typeof parsed !== "object") fail("invalid_promo_audit_value");
  const keys = Object.keys(parsed);
  if (keys.length > 64) fail("promo_audit_object_too_large");
  const result = {};
  keys.sort().forEach((key) => {
    if (!/^[a-z][a-z0-9_-]{0,79}$/i.test(key) || SENSITIVE_KEY_PATTERN.test(key)) {
      fail("sensitive_promo_audit_field");
    }
    result[key] = sanitizeNode(parsed[key], depth + 1);
  });
  return result;
}

function sanitizeSnapshot(resourceType, input) {
  const allowed = RESOURCE_SAFE_FIELDS[resourceType];
  if (!allowed) fail("unknown_promo_audit_resource");
  const parsed = plainJson(input || {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail("invalid_promo_audit_snapshot");
  const keys = Object.keys(parsed);
  if (keys.some((key) => !allowed.includes(key) || SENSITIVE_KEY_PATTERN.test(key))) {
    fail("unsafe_promo_audit_snapshot");
  }
  const result = {};
  keys.sort().forEach((key) => { result[key] = sanitizeNode(parsed[key], 0); });
  return result;
}

function sanitizeChangedPaths(resourceType, paths) {
  const prefixes = RESOURCE_PATH_PREFIXES[resourceType];
  if (!prefixes || !Array.isArray(paths)) fail("invalid_promo_audit_paths");
  const result = [];
  paths.forEach((value) => {
    const path = safeText(value, 240);
    const sensitiveSegment = path.split("/").filter(Boolean).some((segment) => SENSITIVE_KEY_PATTERN.test(segment));
    if (!PATH_PATTERN.test(path) || sensitiveSegment
      || !prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      fail("unsafe_promo_audit_path");
    }
    if (!result.includes(path)) result.push(path);
  });
  return result.sort();
}

function severityFor(definitionValue, paths) {
  if (definitionValue.severity === "critical") return "critical";
  if (definitionValue.critical_paths.some((prefix) => paths.some((path) => path === prefix || path.startsWith(`${prefix}/`)))) {
    return "critical";
  }
  return definitionValue.severity;
}

function actorSnapshot(actor, origin) {
  const role = recordString(actor, "role", 40);
  const actorId = recordId(actor);
  const systemRole = origin === "migration" ? "migration" : "system";
  if (!actor) {
    if (!["system", "migration"].includes(origin)) fail("promo_audit_actor_required");
    return { actor: "", snapshot: { id: systemRole, name: systemRole === "migration" ? "Migración" : "Sistema", role: systemRole } };
  }
  if (!RECORD_ID_PATTERN.test(actorId) || !["master_admin", "store_admin", "store_staff"].includes(role)) {
    fail("invalid_promo_audit_actor");
  }
  if ((role === "master_admin" && origin !== "master_admin")
    || (role !== "master_admin" && origin !== "store_admin")) {
    fail("invalid_promo_audit_origin");
  }
  const fallback = role === "master_admin" ? "Master Admin" : "Miembro del equipo";
  return {
    actor: actorId,
    snapshot: {
      id: actorId,
      name: safeText(recordString(actor, "display_name", 140) || recordString(actor, "name", 140) || fallback, 140),
      role,
    },
  };
}

function normalizedSourceKey(value) {
  const source = safeText(value, 255).replace(/\s+/g, "T");
  if (!SOURCE_KEY_PATTERN.test(source) || SENSITIVE_SOURCE_PATTERN.test(source)) fail("invalid_promo_audit_source");
  return source;
}

function buildPromoAuditValues(decision, input) {
  const values = input && typeof input === "object" ? input : {};
  const action = safeText(values.action, 100);
  const actionDefinition = ACTION_CATALOG[action];
  if (!actionDefinition) fail("unknown_promo_audit_action");
  const resourceType = safeText(values.resourceType || values.resource_type, 80);
  if (!actionDefinition.resources.includes(resourceType)) fail("invalid_promo_audit_resource");
  const decisionSiteId = recordId(decision && decision.site);
  const requestedSiteId = safeText(values.siteId || values.site_id, 15);
  if (decisionSiteId && requestedSiteId && decisionSiteId !== requestedSiteId) fail("promo_audit_tenant_mismatch");
  const siteId = actionDefinition.global ? "" : (decisionSiteId || requestedSiteId);
  const scopeKey = actionDefinition.global ? "global" : `site:${siteId}`;
  if (!actionDefinition.global && !RECORD_ID_PATTERN.test(siteId)) fail("promo_audit_site_required");
  if (values.origin !== undefined && !ORIGINS.includes(values.origin)) fail("invalid_promo_audit_origin");
  const requestedOrigin = ORIGINS.includes(values.origin) ? values.origin : "";
  const decisionOrigin = decision ? (decision.is_master ? "master_admin" : "store_admin") : "";
  if (decisionOrigin && requestedOrigin && decisionOrigin !== requestedOrigin) fail("invalid_promo_audit_origin");
  const origin = decisionOrigin || requestedOrigin || "system";
  const decisionActor = decision && decision.actor;
  if (decisionActor && values.actor && recordId(decisionActor) !== recordId(values.actor)) fail("promo_audit_actor_mismatch");
  const actorValues = actorSnapshot(decisionActor || values.actor, origin);
  const paths = sanitizeChangedPaths(resourceType, values.changedPaths || values.changed_paths || []);
  if (!paths.length && !actionDefinition.allow_empty_paths) fail("promo_audit_changed_paths_required");
  const previous = sanitizeSnapshot(resourceType, values.previousValues || values.previous_values || {});
  const next = sanitizeSnapshot(resourceType, values.newValues || values.new_values || {});
  const resourceId = safeText(values.resourceId || values.resource_id_snapshot, 80);
  if (resourceId && !/^[A-Za-z0-9._:-]{1,80}$/.test(resourceId)) fail("invalid_promo_audit_resource_id");
  const correlation = safeText(values.correlationId || values.correlation_id, 80);
  if (correlation && (!CORRELATION_ID_PATTERN.test(correlation) || SENSITIVE_SOURCE_PATTERN.test(correlation))) {
    fail("invalid_promo_audit_correlation");
  }
  return {
    scope_key: scopeKey,
    site: actionDefinition.global ? "" : siteId,
    actor: actorValues.actor,
    actor_snapshot_json: actorValues.snapshot,
    origin,
    module: actionDefinition.module,
    action,
    severity: severityFor(actionDefinition, paths),
    resource_type: resourceType,
    resource_id_snapshot: resourceId,
    changed_paths_json: paths,
    previous_values_json: previous,
    new_values_json: next,
    summary: actionDefinition.summary,
    source_event_key: normalizedSourceKey(values.sourceEventKey || values.source_event_key),
    correlation_id: correlation,
  };
}

function findBySource(app, scopeKey, sourceKey) {
  try {
    return app.findFirstRecordByFilter(
      AUDIT_COLLECTION,
      "scope_key = {:scope} && source_event_key = {:source}",
      { scope: scopeKey, source: sourceKey },
    );
  } catch (_) { return null; }
}

function createPromoAudit(app, decision, input) {
  const values = buildPromoAuditValues(decision, input);
  const existing = findBySource(app, values.scope_key, values.source_event_key);
  if (existing) return existing;
  const record = new Record(app.findCollectionByNameOrId(AUDIT_COLLECTION), {});
  Object.keys(values).forEach((key) => record.set(key, values[key]));
  try { app.save(record); }
  catch (error) {
    const duplicate = findBySource(app, values.scope_key, values.source_event_key);
    if (duplicate) return duplicate;
    throw error;
  }
  return record;
}

function countBy(items, key) {
  const result = {};
  items.forEach((item) => {
    const value = safeText(item && item[key], 80);
    if (value) result[value] = (result[value] || 0) + 1;
  });
  return result;
}

function draftAuditSnapshot(documentValue, digest, version) {
  const document = plainJson(documentValue) || {};
  const theme = document.theme && typeof document.theme === "object" ? document.theme : {};
  const locales = document.locales && typeof document.locales === "object" ? document.locales : {};
  const contact = document.contact && typeof document.contact === "object" ? document.contact : {};
  const adapters = document.adapters && typeof document.adapters === "object" ? document.adapters : {};
  const mediaRefs = document.media_refs && typeof document.media_refs === "object" ? document.media_refs : {};
  const sections = Array.isArray(document.sections) ? document.sections : [];
  const actions = Array.isArray(contact.actions) ? contact.actions : [];
  const purposes = Object.keys(mediaRefs).map((key) => mediaRefs[key]).filter((item) => item && typeof item === "object");
  return sanitizeSnapshot("promo_draft_document", {
    digest: safeText(digest, 64),
    version: Number.isSafeInteger(Number(version)) ? Number(version) : 0,
    theme: {
      theme_id: safeText(theme.theme_id, 100),
      version: safeText(theme.version, 32),
      override_keys: Object.keys(theme.tokens && typeof theme.tokens === "object" ? theme.tokens : {})
        .filter((key) => /^[a-z][a-z0-9_-]{0,63}$/i.test(key) && !SENSITIVE_KEY_PATTERN.test(key))
        .sort()
        .slice(0, 64),
    },
    locales: {
      default: safeText(locales.default, 35),
      published: (Array.isArray(locales.published) ? locales.published : []).map((item) => safeText(item, 35)).filter(Boolean).slice(0, 10),
      system_catalog_version: safeText(document.system_catalog_version, 80),
    },
    contact: {
      enabled: contact.enabled === true,
      primary_action_key: safeText(contact.primary_action_key, 64),
      secondary_action_keys: (Array.isArray(contact.secondary_action_keys) ? contact.secondary_action_keys : []).map((item) => safeText(item, 64)).filter(Boolean).slice(0, 32),
      actions: actions.slice(0, 32).map((item) => ({
        key: safeText(item && item.key, 64),
        type: safeText(item && item.type, 40),
        enabled: !!(item && item.enabled),
      })),
    },
    media: { reference_count: Object.keys(mediaRefs).length, purpose_counts: countBy(purposes, "purpose") },
    adapters: {
      store_rating_enabled: !!(adapters.store_rating && adapters.store_rating.enabled),
      landing_qr_link_enabled: !!(adapters.landing_qr_link && adapters.landing_qr_link.enabled),
    },
    sections: {
      count: sections.length,
      visible_count: sections.filter((item) => item && item.visible === true).length,
      type_counts: countBy(sections, "type"),
    },
  });
}

function mapAuditRecord(record) {
  const action = recordString(record, "action", 100);
  const actionDefinition = ACTION_CATALOG[action];
  const resourceType = recordString(record, "resource_type", 80);
  if (!actionDefinition || !actionDefinition.resources.includes(resourceType)) fail("invalid_stored_promo_audit");
  const actor = plainJson(recordValue(record, "actor_snapshot_json")) || {};
  const role = safeText(actor.role, 40);
  const origin = recordString(record, "origin", 40);
  const moduleName = recordString(record, "module", 40);
  if (!ACTOR_ROLES.includes(role) || !ORIGINS.includes(origin) || moduleName !== actionDefinition.module) {
    fail("invalid_stored_promo_audit");
  }
  const changedPaths = sanitizeChangedPaths(resourceType, plainJson(recordValue(record, "changed_paths_json")) || []);
  if (!changedPaths.length && !actionDefinition.allow_empty_paths) fail("invalid_stored_promo_audit");
  const storedSeverity = recordString(record, "severity", 40);
  if (!SEVERITIES.includes(storedSeverity)) fail("invalid_stored_promo_audit");
  const minimumSeverity = severityFor(actionDefinition, changedPaths);
  const severityRank = { normal: 0, important: 1, critical: 2 };
  const severity = severityRank[storedSeverity] >= severityRank[minimumSeverity] ? storedSeverity : minimumSeverity;
  return {
    id: recordId(record),
    contract: "promo.audit.event.v1",
    actor: { name: safeText(actor.name, 140) || "Sistema", role },
    origin,
    module: moduleName,
    action,
    severity,
    resource: {
      type: resourceType,
      id: safeText(recordString(record, "resource_id_snapshot", 80), 80),
    },
    changed_paths: changedPaths,
    before: sanitizeSnapshot(resourceType, plainJson(recordValue(record, "previous_values_json")) || {}),
    after: sanitizeSnapshot(resourceType, plainJson(recordValue(record, "new_values_json")) || {}),
    summary: actionDefinition.summary,
    created: recordString(record, "created", 50),
  };
}

module.exports = {
  ACTION_CATALOG,
  ACTOR_ROLES,
  AUDIT_COLLECTION,
  MODULES,
  ORIGINS,
  PromoAuditError,
  RESOURCE_PATH_PREFIXES,
  RESOURCE_SAFE_FIELDS,
  SEVERITIES,
  buildPromoAuditValues,
  createPromoAudit,
  draftAuditSnapshot,
  findBySource,
  mapAuditRecord,
  normalizedSourceKey,
  plainJson,
  recordId,
  recordString,
  recordValue,
  safeText,
  sanitizeChangedPaths,
  sanitizeSnapshot,
  stableFingerprint,
};
