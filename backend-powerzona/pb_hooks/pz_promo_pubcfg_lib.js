/// <reference path="../pb_data/types.d.ts" />

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const promoTheme = typeof __hooks === "undefined"
  ? require("./pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);

const DOCUMENT_CONTRACT = "promo.site.v1";
const PUBLIC_CONTRACT = "promo.public.projection.v1";
const DRAFT_READ_CONTRACT = "promo.draft.read.v1";
const DRAFT_UPDATE_CONTRACT = "promo.draft.update.v1";
const DRAFT_RESPONSE_CONTRACT = "promo.draft.v1";
const SYSTEM_CATALOG_VERSION = "promo.system.v1";

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const BUSINESS_KEY_PATTERN = /^(?:[a-z][a-z0-9._-]{0,99})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;

const SECTION_TYPES = Object.freeze([
  "hero", "services", "featured_work", "gallery", "owner", "store_rating", "contact", "footer",
]);
const MEDIA_PURPOSES = Object.freeze([
  "hero", "service", "gallery", "owner", "footer", "social", "video_poster",
]);
const CONTACT_TYPES = Object.freeze([
  "whatsapp", "phone", "email", "internal_form", "approved_live_chat",
]);
const PUBLIC_THEME_STATUSES = promoTheme.PUBLIC_RELEASE_STATUSES;

const SECTION_CONFIG_KEYS = Object.freeze({
  hero: ["media_use_key", "action_key"],
  services: ["item_keys"],
  featured_work: ["item_keys"],
  gallery: ["item_keys"],
  owner: ["media_use_key"],
  store_rating: [],
  contact: ["action_keys"],
  footer: [],
});

const LOCALIZED_SECTION_KEYS = Object.freeze({
  hero: ["heading", "summary"],
  services: ["heading", "summary", "items"],
  featured_work: ["heading", "summary", "items"],
  gallery: ["heading", "summary", "items"],
  owner: ["heading", "name", "bio"],
  store_rating: ["heading"],
  contact: ["heading", "summary"],
  footer: ["text"],
});

class PromoPubcfgError extends Error {
  constructor(code, status) {
    super(code || "invalid_promo_document");
    this.name = "PromoPubcfgError";
    this.code = code || "invalid_promo_document";
    this.status = Number.isInteger(status) ? status : 400;
  }
}

function fail(code, status) {
  throw new PromoPubcfgError(code, status);
}

function normalizeJson(value) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch (_) { fail("invalid_promo_document", 400); }
  }
  if (Array.isArray(value) && value.length
    && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    try {
      const encoded = value.map((item) => `%${item.toString(16).padStart(2, "0")}`).join("");
      return JSON.parse(decodeURIComponent(encoded));
    } catch (_) { fail("invalid_promo_document", 400); }
  }
  try {
    const normalized = JSON.parse(JSON.stringify(value));
    return typeof normalized === "string" ? JSON.parse(normalized) : normalized;
  } catch (_) {
    fail("invalid_promo_document", 400);
  }
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid_promo_document", 400);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (!value || typeof value !== "object") fail("invalid_promo_document", 400);
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function digestDocument(document, sha256) {
  const hash = sha256 || ((material) => {
    if (typeof $security === "undefined" || !$security || typeof $security.sha256 !== "function") {
      fail("promo_pubcfg_unavailable", 503);
    }
    return $security.sha256(material);
  });
  const digest = String(hash(canonicalJson(document)) || "").trim().toLowerCase();
  if (!data.SHA256_PATTERN.test(digest)) fail("promo_pubcfg_unavailable", 503);
  return digest;
}

function plainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code || "invalid_promo_document", 400);
  return value;
}

function exactKeys(value, keys, code) {
  const object = plainObject(value, code);
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code || "invalid_promo_document", 400);
  }
  return object;
}

function onlyKeys(value, keys, code) {
  const object = plainObject(value, code);
  if (Object.keys(object).some((key) => !keys.includes(key))) fail(code || "invalid_promo_document", 400);
  return object;
}

function assertSafeText(value, max, options) {
  const settings = options || {};
  if (typeof value !== "string" || value.length > max || (!settings.empty && !value.trim())) {
    fail("invalid_promo_document", 400);
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
    || /<\/?[a-z][^>]*>/i.test(value)
    || /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value)
    || /\b[a-z][a-z0-9+.-]*:\/\//i.test(value)
    || /(?:@import\s+|expression\s*\(|url\s*\(|=>|\bfunction\s*\()/i.test(value)) {
    fail("unsafe_promo_document_value", 400);
  }
  return value;
}

function assertKey(value, pattern, allowEmpty) {
  if (typeof value !== "string" || (!allowEmpty && !value)
    || (value !== "" && !pattern.test(value))) {
    fail("invalid_promo_document", 400);
  }
  return value;
}

function assertBoolean(value) {
  if (typeof value !== "boolean") fail("invalid_promo_document", 400);
  return value;
}

function assertStringArray(value, options) {
  const settings = options || {};
  if (!Array.isArray(value) || value.length > settings.max) fail("invalid_promo_document", 400);
  const normalized = value.map((item) => assertKey(item, settings.pattern || KEY_PATTERN, false));
  if (new Set(normalized).size !== normalized.length) fail("invalid_promo_document", 400);
  return normalized;
}

function assertCanonicalLocale(value) {
  const canonical = data.canonicalLocale(value);
  if (canonical !== value) fail("invalid_promo_document", 400);
  return canonical;
}

function validateLocales(value, publicRevision) {
  const locales = exactKeys(value, ["default", "published"]);
  if (typeof locales.default !== "string" || !Array.isArray(locales.published)) fail("invalid_promo_document", 400);
  if (!locales.default && !locales.published.length && !publicRevision) return;
  const defaultLocale = assertCanonicalLocale(locales.default);
  const published = locales.published.map(assertCanonicalLocale);
  if ((!published.length && publicRevision) || published.length > data.HARD_LIMITS.max_locales
    || new Set(published).size !== published.length
    || published.slice().sort().some((item, index) => item !== published[index])
    || !published.includes(defaultLocale)) {
    fail("invalid_promo_document", 400);
  }
}

function validateTheme(value, publicRevision) {
  const theme = exactKeys(value, ["theme_id", "version", "tokens"]);
  try {
    promoTheme.validateThemeSelection(theme, { allowEmpty: !publicRevision });
  } catch (error) {
    if (error instanceof promoTheme.PromoThemeError) fail(error.code, error.status);
    throw error;
  }
}

function validateIdentity(value) {
  const identity = exactKeys(value, ["public_business_key"]);
  assertKey(identity.public_business_key, BUSINESS_KEY_PATTERN, true);
}

function validateSectionConfig(section, knownActions, knownMedia) {
  const expected = SECTION_CONFIG_KEYS[section.type];
  exactKeys(section.config, expected);
  const config = section.config;
  if (["services", "featured_work", "gallery"].includes(section.type)) {
    assertStringArray(config.item_keys, { max: data.HARD_LIMITS.max_services, pattern: KEY_PATTERN });
  }
  if (section.type === "contact") {
    assertStringArray(config.action_keys, { max: data.HARD_LIMITS.max_contact_actions, pattern: KEY_PATTERN });
    config.action_keys.forEach((key) => knownActions.add(key));
  }
  if (section.type === "hero") {
    assertKey(config.media_use_key, USE_KEY_PATTERN, true);
    assertKey(config.action_key, KEY_PATTERN, true);
    if (config.media_use_key) knownMedia.add(config.media_use_key);
    if (config.action_key) knownActions.add(config.action_key);
  }
  if (section.type === "owner") {
    assertKey(config.media_use_key, USE_KEY_PATTERN, true);
    if (config.media_use_key) knownMedia.add(config.media_use_key);
  }
}

function validateSections(document) {
  assertStringArray(document.section_order, { max: data.HARD_LIMITS.max_sections, pattern: KEY_PATTERN });
  if (!Array.isArray(document.sections) || document.sections.length > data.HARD_LIMITS.max_sections) {
    fail("invalid_promo_document", 400);
  }
  const keys = [];
  const actions = new Set();
  const media = new Set();
  for (const section of document.sections) {
    exactKeys(section, ["key", "type", "variant", "visible", "config", "media_use_keys"]);
    keys.push(assertKey(section.key, KEY_PATTERN, false));
    if (!SECTION_TYPES.includes(section.type)) fail("invalid_promo_document", 400);
    try {
      promoTheme.assertSectionVariant(document.theme, section.type, section.variant, {
        allowEmpty: !document.theme.theme_id,
      });
    } catch (error) {
      if (error instanceof promoTheme.PromoThemeError) fail(error.code, error.status);
      throw error;
    }
    assertBoolean(section.visible);
    assertStringArray(section.media_use_keys, { max: 30, pattern: USE_KEY_PATTERN })
      .forEach((key) => media.add(key));
    validateSectionConfig(section, actions, media);
  }
  if (new Set(keys).size !== keys.length || keys.length !== document.section_order.length
    || keys.some((key, index) => key !== document.section_order[index])) {
    fail("invalid_promo_document", 400);
  }
  return { actions, media };
}

function validateMediaRefs(value) {
  const refs = plainObject(value);
  const keys = Object.keys(refs);
  if (keys.length > data.HARD_LIMITS.max_media_refs || new Set(keys).size !== keys.length) {
    fail("invalid_promo_document", 400);
  }
  for (const key of keys) {
    assertKey(key, USE_KEY_PATTERN, false);
    const ref = exactKeys(refs[key], ["asset_id", "purpose"]);
    assertKey(ref.asset_id, RECORD_ID_PATTERN, false);
    if (!MEDIA_PURPOSES.includes(ref.purpose)) fail("invalid_promo_document", 400);
  }
}

function validateContactConfig(action) {
  const config = plainObject(action.config);
  if (action.type === "whatsapp" || action.type === "phone") {
    exactKeys(config, ["phone_e164"]);
    if (!E164_PATTERN.test(config.phone_e164)) fail("invalid_promo_document", 400);
  } else if (action.type === "email") {
    exactKeys(config, ["email_address"]);
    if (typeof config.email_address !== "string" || config.email_address.length > 254
      || !EMAIL_PATTERN.test(config.email_address)) fail("invalid_promo_document", 400);
  } else if (action.type === "internal_form") {
    exactKeys(config, ["form_key"]);
    assertKey(config.form_key, BUSINESS_KEY_PATTERN, false);
    if (action.enabled) fail("unsupported_promo_action", 400);
  } else if (action.type === "approved_live_chat") {
    exactKeys(config, ["adapter_key"]);
    assertKey(config.adapter_key, BUSINESS_KEY_PATTERN, false);
    if (action.enabled) fail("unsupported_promo_action", 400);
  }
}

function validateContact(value) {
  const contact = exactKeys(value, ["enabled", "primary_action_key", "secondary_action_keys", "actions"]);
  assertBoolean(contact.enabled);
  assertKey(contact.primary_action_key, KEY_PATTERN, true);
  assertStringArray(contact.secondary_action_keys, {
    max: data.HARD_LIMITS.max_contact_actions, pattern: KEY_PATTERN,
  });
  if (!Array.isArray(contact.actions) || contact.actions.length > data.HARD_LIMITS.max_contact_actions) {
    fail("invalid_promo_document", 400);
  }
  const actions = new Map();
  for (const action of contact.actions) {
    exactKeys(action, ["key", "type", "enabled", "config"]);
    const key = assertKey(action.key, KEY_PATTERN, false);
    if (actions.has(key) || !CONTACT_TYPES.includes(action.type)) fail("invalid_promo_document", 400);
    assertBoolean(action.enabled);
    validateContactConfig(action);
    actions.set(key, action);
  }
  if (contact.enabled) {
    const primary = actions.get(contact.primary_action_key);
    if (!primary || !primary.enabled) fail("invalid_promo_document", 400);
  } else if (contact.primary_action_key || contact.secondary_action_keys.length) {
    fail("invalid_promo_document", 400);
  }
  for (const key of contact.secondary_action_keys) {
    if (key === contact.primary_action_key || !actions.get(key) || !actions.get(key).enabled) {
      fail("invalid_promo_document", 400);
    }
  }
  return actions;
}

function validateLocalizedItems(items, type, publicRevision, configuredKeys) {
  if (!Array.isArray(items) || items.length > data.HARD_LIMITS.max_services) fail("invalid_promo_document", 400);
  const keys = [];
  for (const item of items) {
    const allowed = type === "gallery" ? ["key", "caption"] : ["key", "name", "summary", "caption"];
    const normalized = onlyKeys(item, allowed);
    keys.push(assertKey(normalized.key, KEY_PATTERN, false));
    if (Object.prototype.hasOwnProperty.call(normalized, "name")) assertSafeText(normalized.name, 160, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(normalized, "summary")) assertSafeText(normalized.summary, 600, { empty: true });
    if (Object.prototype.hasOwnProperty.call(normalized, "caption")) assertSafeText(normalized.caption, 500, { empty: true });
    if (publicRevision && type !== "gallery" && !normalized.name) fail("incomplete_promo_locale", 400);
  }
  if (new Set(keys).size !== keys.length) fail("invalid_promo_document", 400);
  if (publicRevision && (keys.length !== configuredKeys.length
    || keys.some((key, index) => key !== configuredKeys[index]))) fail("incomplete_promo_locale", 400);
}

function validateLocalizedSection(value, section, publicRevision) {
  const localized = onlyKeys(value, LOCALIZED_SECTION_KEYS[section.type]);
  const textLimits = { heading: 160, summary: 600, name: 140, bio: 4000, text: 4000 };
  Object.keys(textLimits).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(localized, key)) {
      assertSafeText(localized[key], textLimits[key], { empty: !publicRevision || key !== "heading" });
    }
  });
  if (Object.prototype.hasOwnProperty.call(localized, "items")) {
    validateLocalizedItems(localized.items, section.type, publicRevision, section.config.item_keys || []);
  } else if (publicRevision && ["services", "featured_work", "gallery"].includes(section.type)
    && section.config.item_keys.length) {
    fail("incomplete_promo_locale", 400);
  }
}

function validateLocalizedContent(document, publicRevision) {
  const byLocale = plainObject(document.content_by_locale);
  const localeKeys = Object.keys(byLocale);
  if (localeKeys.length > data.HARD_LIMITS.max_locales) fail("invalid_promo_document", 400);
  localeKeys.forEach(assertCanonicalLocale);
  if (publicRevision && (localeKeys.length !== document.locales.published.length
    || localeKeys.some((locale, index) => locale !== document.locales.published[index]))) {
    fail("incomplete_promo_locale", 400);
  }
  const sectionMap = new Map(document.sections.map((section) => [section.key, section]));
  const mediaKeys = Object.keys(document.media_refs);
  const actionKeys = document.contact.actions.map((action) => action.key);
  for (const locale of localeKeys) {
    const localized = exactKeys(byLocale[locale], ["identity", "navigation", "sections", "contact", "media_alt", "seo"]);
    const identity = onlyKeys(localized.identity, ["name", "summary", "owner_name", "owner_bio"]);
    if (Object.prototype.hasOwnProperty.call(identity, "name")) assertSafeText(identity.name, 140, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(identity, "summary")) assertSafeText(identity.summary, 600, { empty: true });
    if (Object.prototype.hasOwnProperty.call(identity, "owner_name")) assertSafeText(identity.owner_name, 140, { empty: true });
    if (Object.prototype.hasOwnProperty.call(identity, "owner_bio")) assertSafeText(identity.owner_bio, 4000, { empty: true });
    if (publicRevision && !identity.name) fail("incomplete_promo_locale", 400);

    const navigation = plainObject(localized.navigation);
    for (const key of Object.keys(navigation)) {
      if (!sectionMap.has(key)) fail("invalid_promo_document", 400);
      assertSafeText(navigation[key], 80, { empty: false });
    }
    const localizedSections = plainObject(localized.sections);
    for (const key of Object.keys(localizedSections)) {
      const section = sectionMap.get(key);
      if (!section) fail("invalid_promo_document", 400);
      validateLocalizedSection(localizedSections[key], section, publicRevision);
    }
    if (publicRevision) {
      document.sections.filter((section) => section.visible).forEach((section) => {
        if (!navigation[section.key] || !localizedSections[section.key]) fail("incomplete_promo_locale", 400);
      });
    }

    const contact = plainObject(localized.contact);
    for (const key of Object.keys(contact)) {
      if (!actionKeys.includes(key)) fail("invalid_promo_document", 400);
      const actionText = onlyKeys(contact[key], ["label", "aria_label", "message"]);
      if (Object.prototype.hasOwnProperty.call(actionText, "label")) assertSafeText(actionText.label, 80, { empty: !publicRevision });
      if (Object.prototype.hasOwnProperty.call(actionText, "aria_label")) assertSafeText(actionText.aria_label, 160, { empty: !publicRevision });
      if (Object.prototype.hasOwnProperty.call(actionText, "message")) assertSafeText(actionText.message, 1000, { empty: true });
    }
    if (publicRevision && document.contact.enabled) {
      [document.contact.primary_action_key, ...document.contact.secondary_action_keys].forEach((key) => {
        if (!contact[key] || !contact[key].label || !contact[key].aria_label) fail("incomplete_promo_locale", 400);
      });
    }

    const mediaAlt = plainObject(localized.media_alt);
    for (const key of Object.keys(mediaAlt)) {
      if (!mediaKeys.includes(key)) fail("invalid_promo_document", 400);
      const alt = exactKeys(mediaAlt[key], ["alt", "decorative"]);
      assertBoolean(alt.decorative);
      assertSafeText(alt.alt, 300, { empty: alt.decorative });
      if (alt.decorative && alt.alt) fail("invalid_promo_document", 400);
    }
    if (publicRevision) {
      mediaKeys.forEach((key) => {
        if (!mediaAlt[key] || (!mediaAlt[key].decorative && !mediaAlt[key].alt)) fail("incomplete_promo_locale", 400);
      });
    }

    const seo = onlyKeys(localized.seo, ["title", "description", "social_title", "social_description"]);
    if (Object.prototype.hasOwnProperty.call(seo, "title")) assertSafeText(seo.title, 70, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(seo, "description")) assertSafeText(seo.description, 170, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(seo, "social_title")) assertSafeText(seo.social_title, 70, { empty: true });
    if (Object.prototype.hasOwnProperty.call(seo, "social_description")) assertSafeText(seo.social_description, 170, { empty: true });
    if (publicRevision && (!seo.title || !seo.description)) fail("incomplete_promo_locale", 400);
  }
}

function validateAdapters(value) {
  const adapters = exactKeys(value, ["store_rating", "landing_qr_link"]);
  assertBoolean(exactKeys(adapters.store_rating, ["enabled"]).enabled);
  assertBoolean(exactKeys(adapters.landing_qr_link, ["enabled"]).enabled);
}

function validatePromoDocument(input, options) {
  const settings = options || {};
  const document = normalizeJson(input);
  exactKeys(document, [
    "contract", "system_catalog_version", "locales", "theme", "identity", "section_order",
    "sections", "media_refs", "contact", "content_by_locale", "adapters",
  ]);
  if (document.contract !== DOCUMENT_CONTRACT || document.system_catalog_version !== SYSTEM_CATALOG_VERSION) {
    fail("unknown_promo_contract", 400);
  }
  data.assertDocumentHardLimits(document);
  validateLocales(document.locales, settings.publicRevision === true);
  validateTheme(document.theme, settings.publicRevision === true);
  validateIdentity(document.identity);
  const used = validateSections(document);
  validateMediaRefs(document.media_refs);
  const contactActions = validateContact(document.contact);
  used.media.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(document.media_refs, key)) fail("invalid_promo_media_reference", 400);
  });
  used.actions.forEach((key) => {
    if (!contactActions.has(key)) fail("invalid_promo_contact_reference", 400);
  });
  validateLocalizedContent(document, settings.publicRevision === true);
  validateAdapters(document.adapters);
  return document;
}

function documentMetrics(document, assets) {
  let services = 0;
  let gallery = 0;
  document.sections.forEach((section) => {
    if (section.type === "services") services += section.config.item_keys.length;
    if (section.type === "gallery") gallery += section.config.item_keys.length;
  });
  const media = assets || [];
  return Object.freeze({
    services,
    gallery,
    locales: Math.max(document.locales.published.length, Object.keys(document.content_by_locale).length),
    media_refs: Object.keys(document.media_refs).length,
    images: media.filter((asset) => asset.kind === "image").length,
    videos: media.filter((asset) => asset.kind === "video").length,
    bytes: media.reduce((total, asset) => total + (Number(asset.bytes) || 0), 0),
  });
}

function changedTopLevelPaths(previous, next) {
  return Object.keys(next).filter((key) => canonicalJson(previous[key]) !== canonicalJson(next[key]))
    .map((key) => `/${key}`);
}

function changedActionKeys(previous, next, assets) {
  if (canonicalJson(previous) === canonicalJson(next)) return [];
  const actions = new Set(["promo.content.manage"]);
  if (canonicalJson(previous.theme.theme_id) !== canonicalJson(next.theme.theme_id)
    || canonicalJson(previous.theme.version) !== canonicalJson(next.theme.version)) actions.add("promo.theme.select");
  if (canonicalJson(previous.theme.tokens) !== canonicalJson(next.theme.tokens)) actions.add("promo.appearance.manage");
  if (canonicalJson(previous.locales) !== canonicalJson(next.locales)
    && (previous.locales.published.length > 1 || next.locales.published.length > 1)) {
    actions.add("promo.translations.manage");
  }
  const defaultLocale = next.locales.default;
  const previousOtherLocales = { ...previous.content_by_locale };
  const nextOtherLocales = { ...next.content_by_locale };
  delete previousOtherLocales[defaultLocale];
  delete nextOtherLocales[defaultLocale];
  if (canonicalJson(previousOtherLocales) !== canonicalJson(nextOtherLocales)) actions.add("promo.translations.manage");
  const mediaAltFacet = (document) => Object.fromEntries(Object.entries(document.content_by_locale)
    .filter(([, content]) => Object.keys(content.media_alt).length)
    .map(([locale, content]) => [locale, content.media_alt]));
  const mediaChanged = canonicalJson(previous.media_refs) !== canonicalJson(next.media_refs)
    || canonicalJson(mediaAltFacet(previous)) !== canonicalJson(mediaAltFacet(next));
  if (mediaChanged) {
    actions.add("promo.media.manage");
  }
  if (mediaChanged && (assets || []).some((asset) => asset.kind === "video")) {
    actions.add("promo.media.video.manage");
  }
  const nonEmptyContactFacet = (document) => Object.fromEntries(Object.entries(document.content_by_locale)
    .filter(([, content]) => Object.keys(content.contact).length)
    .map(([locale, content]) => [locale, content.contact]));
  const previousContact = {
    root: previous.contact,
    localized: nonEmptyContactFacet(previous),
  };
  const nextContact = {
    root: next.contact,
    localized: nonEmptyContactFacet(next),
  };
  if (canonicalJson(previousContact) !== canonicalJson(nextContact)) actions.add("promo.contact.manage");
  if (canonicalJson(previous.adapters.store_rating) !== canonicalJson(next.adapters.store_rating)) actions.add("promo.reviews.manage");
  if (canonicalJson(previous.adapters.landing_qr_link) !== canonicalJson(next.adapters.landing_qr_link)) {
    actions.add("promo.landing_qr.bridge.manage");
  }
  return Array.from(actions);
}

function projectPublicDocument(document, siteSlug, media) {
  const visibleSections = document.sections.filter((section) => section.visible);
  const visibleKeys = new Set(visibleSections.map((section) => section.key));
  const enabledActions = document.contact.enabled
    ? document.contact.actions.filter((action) => action.enabled)
    : [];
  const enabledActionKeys = new Set(enabledActions.map((action) => action.key));
  const resultContent = {};
  for (const locale of document.locales.published) {
    const source = document.content_by_locale[locale];
    resultContent[locale] = {
      identity: normalizeJson(source.identity),
      navigation: Object.fromEntries(Object.entries(source.navigation).filter(([key]) => visibleKeys.has(key))),
      sections: Object.fromEntries(Object.entries(source.sections).filter(([key]) => visibleKeys.has(key))),
      contact: Object.fromEntries(Object.entries(source.contact).filter(([key]) => enabledActionKeys.has(key))),
      media_alt: normalizeJson(source.media_alt),
      seo: normalizeJson(source.seo),
    };
  }
  return {
    ok: true,
    contract: PUBLIC_CONTRACT,
    site: { public_slug: siteSlug },
    system_catalog_version: document.system_catalog_version,
    locales: normalizeJson(document.locales),
    theme: promoTheme.resolveEffectiveSelection(document.theme),
    section_order: document.section_order.filter((key) => visibleKeys.has(key)),
    sections: visibleSections.map((section) => ({
      key: section.key,
      type: section.type,
      variant: section.variant,
      config: normalizeJson(section.config),
      media_use_keys: section.media_use_keys.slice(),
    })),
    media: (media || []).map((asset) => ({
      key: asset.key,
      purpose: asset.purpose,
      kind: asset.kind,
      width: asset.width,
      height: asset.height,
      duration_ms: asset.duration_ms,
    })),
    contact: {
      enabled: document.contact.enabled,
      primary_action_key: document.contact.enabled ? document.contact.primary_action_key : "",
      secondary_action_keys: document.contact.enabled ? document.contact.secondary_action_keys.slice() : [],
      actions: enabledActions.map((action) => ({ key: action.key, type: action.type, enabled: true })),
    },
    content_by_locale: resultContent,
    adapters: normalizeJson(document.adapters),
  };
}

module.exports = {
  CONTACT_TYPES,
  DOCUMENT_CONTRACT,
  DRAFT_READ_CONTRACT,
  DRAFT_RESPONSE_CONTRACT,
  DRAFT_UPDATE_CONTRACT,
  KEY_PATTERN,
  MEDIA_PURPOSES,
  PromoPubcfgError,
  PUBLIC_CONTRACT,
  PUBLIC_THEME_STATUSES,
  RECORD_ID_PATTERN,
  SECTION_TYPES,
  SYSTEM_CATALOG_VERSION,
  USE_KEY_PATTERN,
  canonicalJson,
  changedActionKeys,
  changedTopLevelPaths,
  digestDocument,
  documentMetrics,
  normalizeJson,
  projectPublicDocument,
  validatePromoDocument,
};
