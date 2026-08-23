"use strict";

const PROMO_COLLECTIONS = Object.freeze([
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
  "promo_analytics_events",
  "promo_analytics_daily",
]);

const HARD_LIMITS = Object.freeze({
  max_document_bytes: 1024 * 1024,
  max_services: 50,
  max_gallery_assets: 24,
  max_locales: 10,
  max_videos: 3,
  max_sections: 64,
  max_contact_actions: 32,
  max_media_refs: 512,
  max_revision_images: 30,
  max_stored_images: 200,
  max_image_bytes: 100 * 1024,
  max_video_bytes: 25 * 1024 * 1024,
  max_storage_bytes: 250 * 1024 * 1024,
});

const RESERVED_PUBLIC_SLUGS = new Set([
  "admin", "api", "assets", "auth", "login", "master", "promo", "static", "t", "www",
]);
const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/;
const IMMUTABLE_COLLECTIONS = new Set([
  "promo_revisions",
  "promo_revision_media_refs",
  "promo_publication_events",
  "promo_audit_events",
  "promo_analytics_events",
]);
const FORBIDDEN_DOCUMENT_KEYS = new Set([
  "cart", "checkout", "currency", "inventory", "order", "orders", "price", "prices",
  "product", "products", "sku", "stock",
]);
const SENSITIVE_AUDIT_KEYS = new Set([
  "access_token", "api_key", "authorization", "cookie", "credential", "credentials",
  "password", "private_key", "refresh_token", "secret", "session_token",
]);

const SITE_TRANSITIONS = Object.freeze({
  draft: ["draft", "active"],
  active: ["active", "paused", "suspended"],
  paused: ["paused", "active", "suspended", "retired"],
  suspended: ["suspended", "retired"],
  retired: ["retired"],
});
const DOMAIN_TRANSITIONS = Object.freeze({
  pending: ["pending", "verified", "revoked"],
  verified: ["verified", "active", "revoked"],
  active: ["active", "paused", "revoked"],
  paused: ["paused", "active", "revoked"],
  revoked: ["revoked", "released"],
  released: ["released"],
});
const MEDIA_TRANSITIONS = Object.freeze({
  uploaded: ["uploaded", "processing", "rejected"],
  processing: ["processing", "ready", "rejected", "quarantined"],
  ready: ["ready", "retired", "quarantined"],
  rejected: ["rejected"],
  retired: ["retired"],
  quarantined: ["quarantined"],
});
const THEME_TRANSITIONS = Object.freeze({
  draft: ["draft", "approved"],
  approved: ["approved", "deprecated", "blocked"],
  deprecated: ["deprecated", "retired", "blocked"],
  retired: ["retired", "blocked"],
  blocked: ["blocked"],
});

class PromoDataError extends Error {
  constructor(code, field) {
    super(code || "invalid_promo_data");
    this.name = "PromoDataError";
    this.code = this.message;
    this.field = field || "promo";
  }
}

function fail(code, field) {
  throw new PromoDataError(code, field);
}

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try { return record.get(key); } catch (_) {}
  }
  if (record.values && Object.prototype.hasOwnProperty.call(record.values, key)) return record.values[key];
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return value === undefined || value === null ? "" : String(value).trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object" && value.id) return String(value.id).trim();
  return value === undefined || value === null ? "" : String(value).trim();
}

function integerValue(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isSafeInteger(value) ? value : null;
}

function boolValue(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function jsonValue(record, key) {
  const value = recordValue(record, key);
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (_) { fail("invalid_promo_json", key); }
  }
  return value;
}

function recordId(record) {
  return String((record && record.id) || recordString(record, "id") || "").trim();
}

function originalRecord(record) {
  if (!record) return null;
  if (typeof record.original === "function") {
    try { return record.original(); } catch (_) {}
  }
  return record.originalRecord || record._original || null;
}

function sameValue(left, right, key) {
  return JSON.stringify(recordValue(left, key)) === JSON.stringify(recordValue(right, key));
}

function findRecord(app, collection, id, field) {
  if (!id) fail("missing_promo_relation", field);
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    fail("invalid_promo_relation", field);
  }
}

function relationSite(app, collection, id, field) {
  return relationId(findRecord(app, collection, id, field), "site");
}

function assertSameSite(app, siteId, collection, relation, field) {
  if (!relation) return true;
  if (relationSite(app, collection, relation, field) !== siteId) fail("cross_promo_site_relation", field);
  return true;
}

function assertTransition(map, previous, next, field) {
  if (!previous || previous === next) return true;
  if (!(map[previous] || []).includes(next)) fail("invalid_promo_state_transition", field);
  return true;
}

function assertCollectionRulesClosed(collection) {
  for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
    if (!collection || collection[key] !== null) fail("promo_collection_rule_open", key);
  }
  return true;
}

function assertPublicSlug(value) {
  const slug = String(value || "").trim();
  if (slug.length < 1 || slug.length > 80 || !PUBLIC_SLUG_PATTERN.test(slug)
    || RESERVED_PUBLIC_SLUGS.has(slug)) fail("invalid_promo_public_slug", "public_slug");
  return slug;
}

function assertCanonicalHostname(value) {
  const hostname = String(value || "").trim();
  if (!hostname || hostname.length > 253 || hostname !== hostname.toLowerCase()
    || hostname.endsWith(".") || hostname.includes(":") || !hostname.includes(".")) {
    fail("invalid_promo_hostname", "hostname_ascii");
  }
  const labels = hostname.split(".");
  if (labels.some((label) => label.length < 1 || label.length > 63
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    fail("invalid_promo_hostname", "hostname_ascii");
  }
  return hostname;
}

function canonicalLocale(value) {
  const locale = String(value || "").trim();
  if (!LOCALE_PATTERN.test(locale)) fail("invalid_promo_locale", "locale");
  const parts = locale.split("-");
  return parts.map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) return part[0].toUpperCase() + part.slice(1).toLowerCase();
    if (/^(?:[A-Za-z]{2}|[0-9]{3})$/.test(part)) return part.toUpperCase();
    return part.toLowerCase();
  }).join("-");
}

function assertCanonicalLocales(locales, defaultLocale) {
  if (!Array.isArray(locales) || locales.length < 1 || locales.length > HARD_LIMITS.max_locales) {
    fail("invalid_promo_locales", "published_locales_json");
  }
  const normalized = locales.map((locale) => canonicalLocale(locale));
  if (new Set(normalized).size !== normalized.length
    || normalized.some((locale, index) => locale !== locales[index])
    || normalized.slice().sort().some((locale, index) => locale !== normalized[index])
    || !normalized.includes(canonicalLocale(defaultLocale))) {
    fail("invalid_promo_locales", "published_locales_json");
  }
  return normalized;
}

function utf8Bytes(value) {
  const string = String(value || "");
  let bytes = 0;
  for (let index = 0; index < string.length; index += 1) {
    const code = string.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < string.length
      && string.charCodeAt(index + 1) >= 0xdc00 && string.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function inspectDocumentNode(node, state, depth) {
  if (depth > 20) fail("promo_document_too_deep", "document_json");
  if (typeof node === "string") {
    if (node.length > 4000 || /<\/?[a-z][^>]*>/i.test(node)
      || /(?:javascript|data\s*:\s*text\/html)\s*:/i.test(node)) {
      fail("unsafe_promo_document_value", "document_json");
    }
    return;
  }
  if (node === null || typeof node === "number" || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    if (node.length > HARD_LIMITS.max_media_refs) fail("promo_document_array_limit", "document_json");
    node.forEach((item) => inspectDocumentNode(item, state, depth + 1));
    return;
  }
  if (!node || typeof node !== "object") fail("invalid_promo_document_value", "document_json");
  const keys = Object.keys(node);
  if (keys.length > HARD_LIMITS.max_media_refs) fail("promo_document_object_limit", "document_json");
  for (const key of keys) {
    if (FORBIDDEN_DOCUMENT_KEYS.has(key.toLowerCase())) fail("commerce_field_forbidden_in_promo", key);
    inspectDocumentNode(node[key], state, depth + 1);
  }
}

function inspectSanitizedAuditNode(node, field, depth) {
  if (depth > 12) fail("promo_audit_payload_too_deep", field);
  if (node === null || typeof node === "number" || typeof node === "boolean") return;
  if (typeof node === "string") {
    if (node.length > 4000) fail("promo_audit_value_too_large", field);
    return;
  }
  if (Array.isArray(node)) {
    if (node.length > 256) fail("promo_audit_array_too_large", field);
    node.forEach((item) => inspectSanitizedAuditNode(item, field, depth + 1));
    return;
  }
  if (!node || typeof node !== "object") fail("invalid_promo_audit_payload", field);
  const keys = Object.keys(node);
  if (keys.length > 256) fail("promo_audit_object_too_large", field);
  for (const key of keys) {
    if (SENSITIVE_AUDIT_KEYS.has(key.toLowerCase())) fail("sensitive_promo_audit_field", field);
    inspectSanitizedAuditNode(node[key], field, depth + 1);
  }
}

function assertActorSnapshot(value, field) {
  const snapshot = typeof value === "string" ? (() => {
    try { return JSON.parse(value); } catch (_) { fail("invalid_promo_actor_snapshot", field); }
  })() : value;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    fail("invalid_promo_actor_snapshot", field);
  }
  const keys = Object.keys(snapshot);
  if (keys.some((key) => !["id", "name", "role"].includes(key))) {
    fail("invalid_promo_actor_snapshot", field);
  }
  inspectSanitizedAuditNode(snapshot, field, 0);
  return true;
}

function assertDocumentHardLimits(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    fail("invalid_promo_document", "document_json");
  }
  const serialized = JSON.stringify(document);
  if (utf8Bytes(serialized) > HARD_LIMITS.max_document_bytes) fail("promo_document_too_large", "document_json");
  inspectDocumentNode(document, {}, 0);

  const sections = Array.isArray(document.sections) ? document.sections : [];
  if (sections.length > HARD_LIMITS.max_sections) fail("promo_sections_limit", "sections");
  let services = 0;
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const mediaKeys = Array.isArray(section.media_use_keys) ? section.media_use_keys : [];
    if (section.type === "gallery" && mediaKeys.length > HARD_LIMITS.max_gallery_assets) {
      fail("promo_gallery_limit", "sections");
    }
    if (section.type === "services") {
      const config = section.config && typeof section.config === "object" ? section.config : {};
      const entries = Array.isArray(config.items) ? config.items
        : (Array.isArray(config.services) ? config.services : []);
      services += entries.length;
    }
  }
  if (services > HARD_LIMITS.max_services) fail("promo_services_limit", "sections");

  const actions = document.contact && Array.isArray(document.contact.actions)
    ? document.contact.actions : [];
  if (actions.length > HARD_LIMITS.max_contact_actions) fail("promo_contact_actions_limit", "contact");
  const refs = document.media_refs && typeof document.media_refs === "object"
    && !Array.isArray(document.media_refs) ? Object.keys(document.media_refs) : [];
  if (refs.length > HARD_LIMITS.max_media_refs || refs.some((key) => !USE_KEY_PATTERN.test(key))) {
    fail("promo_media_refs_limit", "media_refs");
  }
  const locales = document.locales && Array.isArray(document.locales.published)
    ? document.locales.published : [];
  if (locales.length > HARD_LIMITS.max_locales) fail("promo_locales_limit", "locales");
  return true;
}

function assertEntitlementLimits(record) {
  const limits = {
    max_services: HARD_LIMITS.max_services,
    max_gallery_assets: HARD_LIMITS.max_gallery_assets,
    max_locales: HARD_LIMITS.max_locales,
    max_videos: HARD_LIMITS.max_videos,
    max_storage_bytes: HARD_LIMITS.max_storage_bytes,
  };
  for (const [field, max] of Object.entries(limits)) {
    const value = integerValue(record, field);
    if (value === null || value < 0 || value > max) fail("invalid_promo_entitlement_limit", field);
  }
  if (recordString(record, "source") === "unassigned") {
    for (const field of [
      "promo_site_enabled", "publish_enabled", "custom_domain_enabled",
      "theme_customization_enabled", "multilanguage_enabled", "video_enabled",
      "analytics_enabled", "landing_qr_bridge_enabled",
    ]) {
      if (boolValue(record, field)) fail("unassigned_promo_entitlement_enabled", field);
    }
    for (const field of Object.keys(limits)) {
      if (integerValue(record, field) !== 0) fail("unassigned_promo_quota_nonzero", field);
    }
  }
  if (!boolValue(record, "video_enabled") && integerValue(record, "max_videos") !== 0) {
    fail("promo_video_quota_without_entitlement", "max_videos");
  }
  if (!boolValue(record, "multilanguage_enabled") && integerValue(record, "max_locales") > 1) {
    fail("promo_locale_quota_without_entitlement", "max_locales");
  }
  return true;
}

function assertSite(record, previous) {
  assertPublicSlug(recordString(record, "public_slug"));
  if (integerValue(record, "contract_version") !== 1) fail("invalid_promo_contract_version", "contract_version");
  if (previous) {
    if (!sameValue(previous, record, "store")) fail("immutable_promo_site_store", "store");
    if (!sameValue(previous, record, "public_slug")) fail("immutable_promo_public_slug", "public_slug");
    assertTransition(SITE_TRANSITIONS, recordString(previous, "status"), recordString(record, "status"), "status");
  }
  return true;
}

function assertTheme(record, previous) {
  if (!SHA256_PATTERN.test(recordString(record, "manifest_sha256"))
    || !SHA256_PATTERN.test(recordString(record, "token_schema_sha256"))) {
    fail("invalid_promo_theme_digest", "manifest_sha256");
  }
  if (recordString(record, "status") === "approved"
    && (!relationId(record, "approved_by") || !recordString(record, "approved_at"))) {
    fail("incomplete_promo_theme_approval", "status");
  }
  if (previous) {
    if (!sameValue(previous, record, "theme_id") || !sameValue(previous, record, "version")) {
      fail("immutable_promo_theme_identity", "theme_id");
    }
    assertTransition(THEME_TRANSITIONS, recordString(previous, "status"), recordString(record, "status"), "status");
  }
  return true;
}

function assertDomain(record, previous) {
  assertCanonicalHostname(recordString(record, "hostname_ascii"));
  const status = recordString(record, "status");
  if ((status === "released") === boolValue(record, "is_current")) {
    fail("invalid_promo_domain_current_state", "is_current");
  }
  if (integerValue(record, "state_version") === null || integerValue(record, "state_version") < 1) {
    fail("invalid_promo_domain_version", "state_version");
  }
  if (previous) {
    if (!sameValue(previous, record, "site") || !sameValue(previous, record, "hostname_ascii")) {
      fail("immutable_promo_domain_identity", "hostname_ascii");
    }
    assertTransition(DOMAIN_TRANSITIONS, recordString(previous, "status"), status, "status");
    if (integerValue(record, "state_version") !== integerValue(previous, "state_version") + 1) {
      fail("promo_domain_cas_required", "state_version");
    }
  }
  return true;
}

function mediaUsage(app, siteId, currentId) {
  const records = app.findRecordsByFilter(
    "promo_media_assets", "site = {:siteId}", "created",
    HARD_LIMITS.max_stored_images + HARD_LIMITS.max_videos + 2, 0, { siteId },
  ) || [];
  return records.reduce((usage, item) => {
    if (recordId(item) === currentId) return usage;
    const kind = recordString(item, "kind");
    if (kind === "image") usage.images += 1;
    if (kind === "video") usage.videos += 1;
    usage.bytes += Math.max(0, integerValue(item, "bytes") || 0);
    return usage;
  }, { images: 0, videos: 0, bytes: 0 });
}

function assertMedia(app, record, previous) {
  const kind = recordString(record, "kind");
  const mime = recordString(record, "mime_detected");
  const bytes = integerValue(record, "bytes") || 0;
  const duration = integerValue(record, "duration_ms") || 0;
  if (kind === "image") {
    if ((mime && mime !== "image/webp") || bytes > HARD_LIMITS.max_image_bytes || duration !== 0
      || relationId(record, "poster_asset")) fail("invalid_promo_image", "file");
  } else if (kind === "video") {
    if ((mime && !["video/mp4", "video/webm"].includes(mime)) || bytes > HARD_LIMITS.max_video_bytes) {
      fail("invalid_promo_video", "file");
    }
  } else fail("invalid_promo_media_kind", "kind");

  if (recordString(record, "status") === "ready") {
    if (!mime || !SHA256_PATTERN.test(recordString(record, "sha256")) || bytes < 1
      || (integerValue(record, "width") || 0) < 1 || (integerValue(record, "height") || 0) < 1) {
      fail("incomplete_ready_promo_media", "status");
    }
  }
  if (previous) {
    assertTransition(MEDIA_TRANSITIONS, recordString(previous, "status"), recordString(record, "status"), "status");
    if (recordString(previous, "status") === "ready") {
      for (const field of ["site", "kind", "purpose", "file", "mime_detected", "sha256", "bytes", "width", "height", "duration_ms", "poster_asset"]) {
        if (!sameValue(previous, record, field)) fail("immutable_ready_promo_media", field);
      }
    }
  }

  const siteId = relationId(record, "site");
  const usage = mediaUsage(app, siteId, recordId(record));
  if (kind === "image") usage.images += 1;
  if (kind === "video") usage.videos += 1;
  usage.bytes += bytes;
  if (usage.images > HARD_LIMITS.max_stored_images) fail("promo_image_count_exceeded", "file");
  if (usage.videos > HARD_LIMITS.max_videos) fail("promo_video_count_exceeded", "file");
  if (usage.bytes > HARD_LIMITS.max_storage_bytes) fail("promo_storage_exceeded", "file");
  return true;
}

function assertDraft(record, previous) {
  if (integerValue(record, "schema_version") !== 1
    || !SHA256_PATTERN.test(recordString(record, "document_sha256"))) {
    fail("invalid_promo_draft_contract", "document_json");
  }
  assertDocumentHardLimits(jsonValue(record, "document_json"));
  if (previous && integerValue(record, "version") !== integerValue(previous, "version") + 1) {
    fail("promo_draft_cas_required", "version");
  }
  return true;
}

function assertRevision(app, record) {
  if (integerValue(record, "schema_version") !== 1
    || !SHA256_PATTERN.test(recordString(record, "snapshot_sha256"))) {
    fail("invalid_promo_revision_contract", "snapshot_json");
  }
  assertDocumentHardLimits(jsonValue(record, "snapshot_json"));
  const locales = jsonValue(record, "published_locales_json");
  assertCanonicalLocales(locales, recordString(record, "default_locale"));
  const theme = findRecord(app, "promo_theme_releases", relationId(record, "theme_release"), "theme_release");
  if (recordString(theme, "status") !== "approved") fail("promo_theme_not_approved", "theme_release");
  return true;
}

function assertRevisionMediaRef(app, record) {
  const siteId = relationId(record, "site");
  assertSameSite(app, siteId, "promo_revisions", relationId(record, "revision"), "revision");
  assertSameSite(app, siteId, "promo_media_assets", relationId(record, "media_asset"), "media_asset");
  const asset = findRecord(app, "promo_media_assets", relationId(record, "media_asset"), "media_asset");
  if (recordString(asset, "status") !== "ready") fail("promo_media_not_ready", "media_asset");
  if (!USE_KEY_PATTERN.test(recordString(record, "use_key"))) fail("invalid_promo_media_use_key", "use_key");

  const revisionId = relationId(record, "revision");
  const refs = app.findRecordsByFilter(
    "promo_revision_media_refs", "revision = {:revisionId}", "", HARD_LIMITS.max_media_refs + 1, 0, { revisionId },
  ) || [];
  const currentId = recordId(record);
  const existing = refs.filter((item) => recordId(item) !== currentId);
  if (existing.length + 1 > HARD_LIMITS.max_media_refs) fail("promo_media_refs_limit", "revision");
  const imageCount = existing.reduce((count, item) => {
    const related = findRecord(app, "promo_media_assets", relationId(item, "media_asset"), "media_asset");
    return count + (recordString(related, "kind") === "image" ? 1 : 0);
  }, recordString(asset, "kind") === "image" ? 1 : 0);
  if (imageCount > HARD_LIMITS.max_revision_images) fail("promo_revision_image_limit", "revision");
  return true;
}

function assertPublicationSlot(app, record, previous) {
  const siteId = relationId(record, "site");
  const state = recordString(record, "state");
  const revisionId = relationId(record, "published_revision");
  const mode = recordString(record, "canonical_mode");
  const bindingId = relationId(record, "primary_binding");
  if (state === "active" && !revisionId) fail("missing_promo_published_revision", "published_revision");
  if (revisionId) assertSameSite(app, siteId, "promo_revisions", revisionId, "published_revision");
  if (mode === "platform" && bindingId) fail("promo_platform_binding_forbidden", "primary_binding");
  if (mode === "custom") {
    assertSameSite(app, siteId, "promo_domain_bindings", bindingId, "primary_binding");
    const binding = findRecord(app, "promo_domain_bindings", bindingId, "primary_binding");
    if (recordString(binding, "status") !== "active" || recordString(binding, "role") !== "primary"
      || !boolValue(binding, "is_current")) fail("invalid_promo_primary_binding", "primary_binding");
  }
  if (!["platform", "custom"].includes(mode)) fail("invalid_promo_canonical_mode", "canonical_mode");
  if (previous && integerValue(record, "generation") !== integerValue(previous, "generation") + 1) {
    fail("promo_publication_cas_required", "generation");
  }
  return true;
}

function assertPublicationEvent(app, record) {
  const siteId = relationId(record, "site");
  for (const [field, collection] of [
    ["from_revision", "promo_revisions"], ["to_revision", "promo_revisions"],
    ["from_binding", "promo_domain_bindings"], ["to_binding", "promo_domain_bindings"],
  ]) assertSameSite(app, siteId, collection, relationId(record, field), field);
  const before = integerValue(record, "generation_before");
  const after = integerValue(record, "generation_after");
  const succeeded = recordString(record, "result") === "succeeded";
  if (before === null || after === null || after !== before + (succeeded ? 1 : 0)) {
    fail("invalid_promo_publication_generation", "generation_after");
  }
  if (recordString(record, "operation") === "binding_switch" && succeeded
    && (!recordString(record, "from_canonical_mode") || !recordString(record, "to_canonical_mode"))) {
    fail("incomplete_promo_binding_switch", "to_canonical_mode");
  }
  assertActorSnapshot(jsonValue(record, "actor_snapshot_json"), "actor_snapshot_json");
  return true;
}

function assertAudit(record) {
  const siteId = relationId(record, "site");
  const expected = siteId ? `site:${siteId}` : "global";
  if (recordString(record, "scope_key") !== expected) fail("invalid_promo_audit_scope", "scope_key");
  assertActorSnapshot(jsonValue(record, "actor_snapshot_json"), "actor_snapshot_json");
  for (const field of ["changed_paths_json", "previous_values_json", "new_values_json"]) {
    const value = jsonValue(record, field);
    if (value !== undefined && value !== null && value !== "") inspectSanitizedAuditNode(value, field, 0);
  }
  return true;
}

function assertAnalytics(app, record) {
  const siteId = relationId(record, "site");
  assertSameSite(app, siteId, "promo_revisions", relationId(record, "revision"), "revision");
  const type = recordString(record, "event_type");
  const section = recordString(record, "section_key");
  const action = recordString(record, "action_type");
  if ((type === "section_view") !== !!section) fail("invalid_promo_analytics_section", "section_key");
  if ((type === "contact_activate") !== !!action) fail("invalid_promo_analytics_action", "action_type");
  if (canonicalLocale(recordString(record, "locale")) !== recordString(record, "locale")) {
    fail("invalid_promo_locale", "locale");
  }
  return true;
}

function assertAnalyticsDaily(record) {
  if (canonicalLocale(recordString(record, "locale")) !== recordString(record, "locale")) {
    fail("invalid_promo_locale", "locale");
  }
  for (const field of ["event_count", "unique_count"]) {
    const value = integerValue(record, field);
    if (value === null || value < 0) fail("invalid_promo_analytics_count", field);
  }
  return true;
}

function assertTenantIsolation(app, collection, record) {
  const siteId = relationId(record, "site");
  if (collection !== "promo_theme_releases" && collection !== "promo_sites" && !siteId) {
    fail("missing_promo_site", "site");
  }
  if (siteId) findRecord(app, "promo_sites", siteId, "site");
  switch (collection) {
    case "promo_media_assets": {
      const poster = relationId(record, "poster_asset");
      if (poster) assertSameSite(app, siteId, "promo_media_assets", poster, "poster_asset");
      break;
    }
    case "promo_revision_media_refs":
      assertRevisionMediaRef(app, record);
      break;
    case "promo_publication_slots":
      assertPublicationSlot(app, record, null);
      break;
    case "promo_publication_events":
      assertPublicationEvent(app, record);
      break;
    case "promo_analytics_events":
      assertAnalytics(app, record);
      break;
    default:
      break;
  }
  return true;
}

function assertImmutableUpdate(collection, record, previous) {
  if (!previous) return true;
  if (IMMUTABLE_COLLECTIONS.has(collection)) fail("immutable_promo_record", collection);
  return true;
}

function assertPromoRecord(app, collection, record, operation) {
  if (!PROMO_COLLECTIONS.includes(collection)) fail("unknown_promo_collection", "collection");
  const previous = operation === "update" ? originalRecord(record) : null;
  if (operation === "update" && !previous) fail("missing_promo_original", collection);
  assertImmutableUpdate(collection, record, previous);

  if (collection === "promo_sites") assertSite(record, previous);
  else if (collection === "promo_site_entitlements") assertEntitlementLimits(record);
  else if (collection === "promo_theme_releases") assertTheme(record, previous);
  else if (collection === "promo_domain_bindings") assertDomain(record, previous);
  else if (collection === "promo_draft_documents") assertDraft(record, previous);
  else if (collection === "promo_media_assets") assertMedia(app, record, previous);
  else if (collection === "promo_revisions") assertRevision(app, record);
  else if (collection === "promo_revision_media_refs") assertRevisionMediaRef(app, record);
  else if (collection === "promo_publication_slots") assertPublicationSlot(app, record, previous);
  else if (collection === "promo_publication_events") assertPublicationEvent(app, record);
  else if (collection === "promo_audit_events") assertAudit(record);
  else if (collection === "promo_analytics_events") assertAnalytics(app, record);
  else if (collection === "promo_analytics_daily") assertAnalyticsDaily(record);

  if (!["promo_sites", "promo_theme_releases"].includes(collection)) {
    assertTenantIsolation(app, collection, record);
  }
  return true;
}

function assertPromoDelete(collection) {
  if (!PROMO_COLLECTIONS.includes(collection)) fail("unknown_promo_collection", "collection");
  fail("promo_delete_requires_orchestrator", collection);
}

module.exports = {
  DOMAIN_TRANSITIONS,
  HARD_LIMITS,
  IMMUTABLE_COLLECTIONS,
  LOCALE_PATTERN,
  MEDIA_TRANSITIONS,
  PROMO_COLLECTIONS,
  PromoDataError,
  RESERVED_PUBLIC_SLUGS,
  SHA256_PATTERN,
  SITE_TRANSITIONS,
  THEME_TRANSITIONS,
  assertCanonicalHostname,
  assertCanonicalLocales,
  assertCollectionRulesClosed,
  assertActorSnapshot,
  assertDocumentHardLimits,
  assertEntitlementLimits,
  assertMedia,
  assertPromoDelete,
  assertPromoRecord,
  assertPublicSlug,
  assertTenantIsolation,
  canonicalLocale,
  mediaUsage,
  recordValue,
  relationId,
  utf8Bytes,
};
