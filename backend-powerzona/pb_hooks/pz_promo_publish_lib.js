/// <reference path="../pb_data/types.d.ts" />

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const pubcfg = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);
const i18n = typeof __hooks === "undefined"
  ? require("./pz_promo_i18n_lib.js")
  : require(`${__hooks}/pz_promo_i18n_lib.js`);

const CANDIDATE_CREATE_CONTRACT = "promo.candidate.create.v1";
const CANDIDATE_RESPONSE_CONTRACT = "promo.candidate.v1";
const PREVIEW_READ_CONTRACT = "promo.preview.read.v1";
const PREVIEW_RESPONSE_CONTRACT = "promo.preview.v1";
const PREVIEW_CONTEXT_READ_CONTRACT = "promo.preview.context.read.v1";
const PREVIEW_CONTEXT_RESPONSE_CONTRACT = "promo.preview.context.v1";
const PUBLISH_CONTRACT = "promo.publication.publish.v1";
const ROLLBACK_CONTRACT = "promo.publication.rollback.v1";
const UNPUBLISH_CONTRACT = "promo.publication.unpublish.v1";
const BINDING_SWITCH_CONTRACT = "promo.publication.canonical.switch.v1";
const PAUSE_CONTRACT = "promo.publication.pause.v1";
const RESUME_CONTRACT = "promo.publication.resume.v1";
const PUBLICATION_RESULT_CONTRACT = "promo.publication.result.v1";
const PREVIEW_MEDIA_CONTRACT = "promo.media.preview.delivery.v1";

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;
const SENSITIVE_KEY_PATTERN = /(authorization|cookie|credential|password|private|secret|session|token)/i;

const OPERATION_CONTRACTS = Object.freeze({
  publish: PUBLISH_CONTRACT,
  rollback: ROLLBACK_CONTRACT,
  unpublish: UNPUBLISH_CONTRACT,
  binding_switch: BINDING_SWITCH_CONTRACT,
  pause: PAUSE_CONTRACT,
  resume: RESUME_CONTRACT,
});

const REASON_CODES = Object.freeze({
  publish: Object.freeze(["content_release", "content_correction", "scheduled_release"]),
  rollback: Object.freeze(["content_correction", "incident_recovery", "media_recovery", "theme_recovery"]),
  unpublish: Object.freeze(["administrative_request", "content_review", "incident_response"]),
  binding_switch: Object.freeze(["canonical_change", "domain_recovery"]),
  pause: Object.freeze(["administrative_request", "content_review", "incident_response"]),
  resume: Object.freeze(["administrative_request", "content_approved", "incident_recovery"]),
});

class PromoPublishError extends Error {
  constructor(code, status) {
    super(code || "invalid_payload");
    this.name = "PromoPublishError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 400;
  }
}

function fail(code, status) {
  throw new PromoPublishError(code, status);
}

function normalizedObject(value) {
  try {
    const normalized = pubcfg.normalizeJson(value);
    return normalized && typeof normalized === "object" && !Array.isArray(normalized) ? normalized : null;
  } catch (_) { return null; }
}

function exactKeys(value, keys) {
  const object = normalizedObject(value);
  if (!object) return null;
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
    ? object
    : null;
}

function canonicalTarget(value) {
  const object = normalizedObject(value);
  if (!object) return null;
  if (object.mode === "platform" && exactKeys(object, ["mode"])) {
    return Object.freeze({ mode: "platform", primaryBindingId: "" });
  }
  if (object.mode === "custom" && exactKeys(object, ["mode", "primary_binding_id"])
    && RECORD_ID_PATTERN.test(String(object.primary_binding_id || ""))) {
    return Object.freeze({ mode: "custom", primaryBindingId: object.primary_binding_id });
  }
  return null;
}

function expectedGeneration(value) {
  const generation = Number(value);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : null;
}

function idempotencyKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  return IDEMPOTENCY_KEY_PATTERN.test(key) && !SENSITIVE_KEY_PATTERN.test(key) ? key : "";
}

function parseCandidateCreate(value) {
  const body = exactKeys(value, ["contract", "expected_draft_version"]);
  if (!body || body.contract !== CANDIDATE_CREATE_CONTRACT) return null;
  const version = Number(body.expected_draft_version);
  return Number.isSafeInteger(version) && version >= 1
    ? Object.freeze({ expectedDraftVersion: version })
    : null;
}

function parsePreview(value) {
  const body = exactKeys(value, ["contract", "candidate_revision_id", "locale"]);
  if (!body || body.contract !== PREVIEW_READ_CONTRACT
    || !RECORD_ID_PATTERN.test(String(body.candidate_revision_id || ""))) return null;
  let locale;
  try { locale = data.canonicalLocale(body.locale); } catch (_) { return null; }
  if (!locale || locale !== body.locale) return null;
  return Object.freeze({ revisionId: body.candidate_revision_id, locale });
}

function parsePreviewContext(value) {
  const body = exactKeys(value, ["contract"]);
  return !!body && body.contract === PREVIEW_CONTEXT_READ_CONTRACT;
}

function parseTransition(operation, value) {
  const contract = OPERATION_CONTRACTS[operation];
  const reasons = REASON_CODES[operation];
  if (!contract || !reasons) return null;
  const withRevision = operation === "publish" || operation === "rollback";
  const withCanonical = withRevision || operation === "binding_switch";
  const keys = ["contract", "expected_generation", "idempotency_key", "reason_code"];
  if (withRevision) keys.push("candidate_revision_id");
  if (withCanonical) keys.push("canonical");
  const body = exactKeys(value, keys);
  if (!body || body.contract !== contract || !reasons.includes(body.reason_code)) return null;
  const generation = expectedGeneration(body.expected_generation);
  const key = idempotencyKey(body.idempotency_key);
  if (generation === null || !key) return null;
  const revisionId = withRevision ? String(body.candidate_revision_id || "") : "";
  if (withRevision && !RECORD_ID_PATTERN.test(revisionId)) return null;
  const canonical = withCanonical ? canonicalTarget(body.canonical) : null;
  if (withCanonical && !canonical) return null;
  return Object.freeze({
    operation,
    expectedGeneration: generation,
    idempotencyKey: key,
    reasonCode: body.reason_code,
    revisionId,
    canonical,
  });
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  return record.values && Object.prototype.hasOwnProperty.call(record.values, key)
    ? record.values[key]
    : record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return value === undefined || value === null ? "" : String(value).trim();
}

function recordInteger(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isSafeInteger(value) ? value : null;
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordId(record) {
  return recordString(record, "id");
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object" && value.id) return String(value.id).trim();
  return value === undefined || value === null ? "" : String(value).trim();
}

function candidateProjection(record, reused) {
  const digest = recordString(record, "snapshot_sha256");
  const sequence = recordInteger(record, "sequence");
  const sourceVersion = recordInteger(record, "source_draft_version");
  if (!RECORD_ID_PATTERN.test(recordId(record)) || !data.SHA256_PATTERN.test(digest)
    || !sequence || !sourceVersion) fail("promo_candidate_unavailable", 503);
  return Object.freeze({
    revision_id: recordId(record),
    sequence,
    digest,
    source_draft_version: sourceVersion,
    created: recordString(record, "created"),
    reused: reused === true,
  });
}

function previewRevisionProjection(record, document) {
  const candidate = candidateProjection(record, false);
  const locales = document && document.locales;
  if (!locales || typeof locales.default !== "string" || !Array.isArray(locales.published)
    || !locales.published.length || !locales.published.includes(locales.default)) {
    fail("promo_preview_unavailable", 503);
  }
  return Object.freeze({
    revision_id: candidate.revision_id,
    sequence: candidate.sequence,
    digest: candidate.digest,
    source_draft_version: candidate.source_draft_version,
    created: candidate.created,
    locales: Object.freeze({
      default: locales.default,
      published: Object.freeze(locales.published.slice()),
    }),
  });
}

function revisionAuditSnapshot(record, document) {
  return Object.freeze({
    sequence: recordInteger(record, "sequence") || 0,
    digest: recordString(record, "snapshot_sha256"),
    theme: {
      theme_id: document.theme.theme_id,
      version: document.theme.version,
    },
    default_locale: document.locales.default,
    published_locales: document.locales.published.slice(),
    source_draft_version: recordInteger(record, "source_draft_version") || 0,
  });
}

function publicationAuditSnapshot(input) {
  const value = input || {};
  return Object.freeze({
    state: String(value.state || ""),
    generation: Number.isSafeInteger(Number(value.generation)) ? Number(value.generation) : 0,
    canonical_mode: String(value.canonicalMode || "platform"),
    revision_digest: String(value.revisionDigest || ""),
    binding_state: String(value.bindingState || ""),
    reason_code: String(value.reasonCode || ""),
  });
}

function privateImageDelivery(descriptor, priority) {
  if (!descriptor || !descriptor.preview) fail("promo_preview_unavailable", 503);
  const variants = descriptor.preview.variants.map((variant) => ({
    key: variant.key,
    width: variant.width,
    height: variant.height,
    url: variant.url,
  }));
  const original = variants[variants.length - 1];
  if (!original) fail("promo_preview_unavailable", 503);
  return Object.freeze({
    contract: PREVIEW_MEDIA_CONTRACT,
    mime: descriptor.mime,
    src: original.url,
    srcset: variants,
    loading: priority ? "eager" : "lazy",
    fetch_priority: priority ? "high" : "auto",
    decoding: "async",
  });
}

function previewMediaDescriptor(item, assetDescriptor, posterDescriptor) {
  const base = {
    key: item.key,
    purpose: item.purpose,
    kind: item.kind,
    width: item.width,
    height: item.height,
    duration_ms: item.duration_ms,
  };
  const priority = !!(item.delivery && item.delivery.fetch_priority === "high");
  if (item.kind === "image") return Object.freeze({ ...base, delivery: privateImageDelivery(assetDescriptor, priority) });
  if (!assetDescriptor || !assetDescriptor.preview || !posterDescriptor) fail("promo_preview_unavailable", 503);
  return Object.freeze({
    ...base,
    delivery: Object.freeze({
      contract: PREVIEW_MEDIA_CONTRACT,
      mime: assetDescriptor.mime,
      src: assetDescriptor.preview.url,
      preload: "none",
      controls_required: true,
      autoplay: false,
      plays_inline: true,
      reduced_motion: "poster",
      save_data: "poster",
      poster: privateImageDelivery(posterDescriptor, priority),
    }),
  });
}

function previewProjection(publicProjection, locale, media) {
  const projection = pubcfg.normalizeJson(publicProjection);
  if (!projection || projection.contract !== pubcfg.PUBLIC_CONTRACT
    || !projection.locales.published.includes(locale)
    || !Object.prototype.hasOwnProperty.call(projection.content_by_locale, locale)) {
    fail("promo_preview_unavailable", 503);
  }
  const catalog = i18n.resolveSystemCatalog(projection.system_catalog_version, locale);
  const localeOptions = projection.locales.published.map((candidate) => {
    const optionCatalog = i18n.resolveSystemCatalog(projection.system_catalog_version, candidate);
    return Object.freeze({
      locale: candidate,
      label: optionCatalog.native_name,
      active: candidate === locale,
    });
  });
  return Object.freeze({
    site: pubcfg.normalizeJson(projection.site),
    system: Object.freeze({ catalog_version: projection.system_catalog_version, messages: pubcfg.normalizeJson(catalog.messages) }),
    locale: Object.freeze({ effective: locale, default: projection.locales.default, lang: locale, direction: catalog.direction }),
    locale_options: Object.freeze(localeOptions),
    theme: pubcfg.normalizeJson(projection.theme),
    section_order: projection.section_order.slice(),
    sections: pubcfg.normalizeJson(projection.sections),
    media: Object.freeze((media || []).slice()),
    contact: pubcfg.normalizeJson(projection.contact),
    content: pubcfg.normalizeJson(projection.content_by_locale[locale]),
    adapters: pubcfg.normalizeJson(projection.adapters),
  });
}

module.exports = {
  BINDING_SWITCH_CONTRACT,
  CANDIDATE_CREATE_CONTRACT,
  CANDIDATE_RESPONSE_CONTRACT,
  IDEMPOTENCY_KEY_PATTERN,
  OPERATION_CONTRACTS,
  PAUSE_CONTRACT,
  PREVIEW_CONTEXT_READ_CONTRACT,
  PREVIEW_CONTEXT_RESPONSE_CONTRACT,
  PREVIEW_MEDIA_CONTRACT,
  PREVIEW_READ_CONTRACT,
  PREVIEW_RESPONSE_CONTRACT,
  PUBLICATION_RESULT_CONTRACT,
  PUBLISH_CONTRACT,
  PromoPublishError,
  REASON_CODES,
  RECORD_ID_PATTERN,
  RESUME_CONTRACT,
  ROLLBACK_CONTRACT,
  UNPUBLISH_CONTRACT,
  candidateProjection,
  canonicalTarget,
  exactKeys,
  idempotencyKey,
  parseCandidateCreate,
  parsePreview,
  parsePreviewContext,
  parseTransition,
  previewMediaDescriptor,
  previewProjection,
  previewRevisionProjection,
  publicationAuditSnapshot,
  recordBool,
  recordId,
  recordInteger,
  recordString,
  recordValue,
  relationId,
  revisionAuditSnapshot,
};
