/// <reference path="../pb_data/types.d.ts" />

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const promoTheme = typeof __hooks === "undefined"
  ? require("./pz_promo_theme_lib.js")
  : require(`${__hooks}/pz_promo_theme_lib.js`);
const promoMedia = typeof __hooks === "undefined"
  ? require("./pz_promo_media_lib.js")
  : require(`${__hooks}/pz_promo_media_lib.js`);
const promoFooter = typeof __hooks === "undefined"
  ? require("./pz_promo_footer_lib.js")
  : require(`${__hooks}/pz_promo_footer_lib.js`);

const DOCUMENT_CONTRACT = "promo.site.v1";
const LIVE_DOCUMENT_CONTRACT = "promo.site.v2";
const PUBLIC_CONTRACT = "promo.public.projection.v1";
const DRAFT_READ_CONTRACT = "promo.draft.read.v1";
const DRAFT_UPDATE_CONTRACT = "promo.draft.update.v1";
const DRAFT_RESPONSE_CONTRACT = "promo.draft.v1";
// Additive live-content contracts. Legacy names remain available while
// existing documents and clients are migrated in a verified deployment.
const LIVE_READ_CONTRACT = "promo.live.read.v1";
const LIVE_UPDATE_CONTRACT = "promo.live.update.v1";
const LIVE_RESPONSE_CONTRACT = "promo.live.v1";
const SYSTEM_CATALOG_VERSION = "promo.system.v1";

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const USE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,119}$/;
const BUSINESS_KEY_PATTERN = /^(?:[a-z][a-z0-9._-]{0,99})?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

const SECTION_TYPES = Object.freeze([
  "hero", "services", "featured_work", "gallery", "owner", "store_rating", "contact", "footer",
]);
const MEDIA_PURPOSES = Object.freeze([
  "hero", "service", "gallery", "owner", "footer", "social", "video_poster", "qr", "logo",
]);
const CONTACT_TYPES = Object.freeze([
  "whatsapp", "phone", "email", "internal_form", "approved_live_chat",
]);
const PUBLIC_THEME_STATUSES = promoTheme.PUBLIC_RELEASE_STATUSES;
const HERO_LAYOUTS = Object.freeze(["immersive", "split", "centered", "editorial"]);
const HERO_CONTRAST_MODES = Object.freeze(["auto", "light", "dark", "custom"]);
const HERO_OVERLAY_STRENGTHS = Object.freeze(["soft", "medium", "strong"]);
const HERO_DEFAULT_COLORS = Object.freeze({
  title: "#ffffff",
  body: "#e2e8f0",
  accent: "#93c5fd",
});
const HERO_BUTTON_TARGETS = Object.freeze([
  "primary-contact", "contact-section", "services-section", "work-section",
]);
const SERVICE_ICON_KEYS = Object.freeze([
  "carpet", "flooring", "stairs", "finishing",
  "upholstery", "cleaning", "installation", "commercial",
]);
const HERO_MAX_HIGHLIGHTS = 4;
const HERO_MAX_BUTTONS = 2;

const SECTION_CONFIG_KEYS = Object.freeze({
  hero: ["media_use_key", "action_key"],
  services: ["item_keys"],
  featured_work: ["item_keys"],
  gallery: ["item_keys"],
  owner: ["media_use_key"],
  store_rating: [],
  contact: ["action_keys"],
  footer: ["navigation_section_keys", "social_profiles"],
});
const LIVE_SECTION_CONFIG_KEYS = Object.freeze({
  hero: [
    "media_use_key", "action_key", "layout", "button_targets",
    "contrast_mode", "title_color", "body_color", "accent_color", "overlay_strength",
  ],
  services: ["item_keys", "gallery_keys", "icon_keys"],
  featured_work: ["item_keys"],
  gallery: ["item_keys", "cover_media_use_key", "items"],
  owner: ["media_use_key"],
  store_rating: [],
  contact: ["action_keys"],
  footer: ["navigation_section_keys", "social_profiles"],
});
const SECTION_MEDIA_PURPOSES = Object.freeze({
  hero: Object.freeze(["hero"]),
  services: Object.freeze(["service"]),
  featured_work: Object.freeze(["gallery"]),
  gallery: Object.freeze(["gallery"]),
  owner: Object.freeze(["owner"]),
  footer: Object.freeze(["footer"]),
});

const LOCALIZED_SECTION_KEYS = Object.freeze({
  hero: ["heading", "summary"],
  services: ["heading", "summary", "items"],
  featured_work: ["heading", "summary", "items"],
  gallery: ["heading", "summary", "items"],
  owner: ["heading", "name", "bio"],
  store_rating: ["heading"],
  contact: ["heading", "summary"],
  footer: ["heading", "summary", "text"],
});
const LIVE_LOCALIZED_SECTION_KEYS = Object.freeze({
  hero: ["heading", "intro", "summary", "highlights", "button_labels"],
  services: ["heading", "summary", "items"],
  featured_work: ["heading", "summary"],
  gallery: ["heading", "summary", "items"],
  owner: ["heading", "name", "bio"],
  store_rating: ["heading"],
  contact: ["heading", "consultation_heading", "summary", "qr_heading"],
  footer: ["heading", "summary", "text"],
});

class PromoPubcfgError extends Error {
  constructor(code, status, reason) {
    super(code || "invalid_promo_document");
    this.name = "PromoPubcfgError";
    this.code = code || "invalid_promo_document";
    this.status = Number.isInteger(status) ? status : 400;
    if (reason) Object.defineProperty(this, "reason", { value: String(reason), enumerable: false });
  }
}

function fail(code, status, reason) {
  throw new PromoPubcfgError(code, status, reason);
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

function validateSectionConfig(section, knownActions, knownMedia, liveDocument, publicRevision) {
  const expected = (liveDocument ? LIVE_SECTION_CONFIG_KEYS : SECTION_CONFIG_KEYS)[section.type];
  if (section.type === "footer") {
    try { promoFooter.normalizeFooterConfig(section.config); }
    catch (error) {
      if (error instanceof promoFooter.PromoFooterError) fail("invalid_promo_document", 400);
      throw error;
    }
  } else {
    exactKeys(section.config, expected);
  }
  const config = section.config;
  if (["services", "featured_work", "gallery"].includes(section.type)) {
    assertStringArray(config.item_keys, { max: data.HARD_LIMITS.max_services, pattern: KEY_PATTERN });
  }
  if (liveDocument && section.type === "services") {
    if (!Array.isArray(config.gallery_keys) || config.gallery_keys.length !== config.item_keys.length) {
      fail("invalid_promo_document", 400);
    }
    config.gallery_keys.forEach((key) => assertKey(key, KEY_PATTERN, true));
    if (!Array.isArray(config.icon_keys) || config.icon_keys.length !== config.item_keys.length) {
      fail("invalid_promo_document", 400);
    }
    config.icon_keys.forEach((key) => {
      if (typeof key !== "string" || (key && !SERVICE_ICON_KEYS.includes(key))) {
        fail("invalid_promo_document", 400);
      }
    });
    if (section.media_use_keys.length) fail("invalid_promo_document", 400);
  }
  if (liveDocument && section.type === "featured_work") {
    if (config.item_keys.length || section.media_use_keys.length) fail("invalid_promo_document", 400);
  }
  if (liveDocument && section.type === "gallery") {
    assertKey(config.cover_media_use_key, USE_KEY_PATTERN, true);
    if (!Array.isArray(config.items) || config.items.length > data.HARD_LIMITS.max_services) {
      fail("invalid_promo_document", 400);
    }
    const itemKeys = [];
    const configuredMedia = [];
    const appendMedia = (key) => {
      if (!configuredMedia.includes(key)) configuredMedia.push(key);
    };
    if (config.cover_media_use_key) appendMedia(config.cover_media_use_key);
    config.items.forEach((item) => {
      const normalized = exactKeys(item, ["key", "media_use_keys", "featured", "visible"]);
      const itemKey = assertKey(normalized.key, KEY_PATTERN, false);
      const itemMedia = assertStringArray(normalized.media_use_keys, { max: 3, pattern: USE_KEY_PATTERN });
      assertBoolean(normalized.featured);
      assertBoolean(normalized.visible);
      itemKeys.push(itemKey);
      itemMedia.forEach(appendMedia);
    });
    if (itemKeys.length !== config.item_keys.length
      || itemKeys.some((key, index) => key !== config.item_keys[index])
      || configuredMedia.length !== section.media_use_keys.length
      || configuredMedia.some((key, index) => key !== section.media_use_keys[index])) {
      fail("invalid_promo_document", 400);
    }
    if (publicRevision && section.visible && (!config.cover_media_use_key
      || config.items.some((item) => item.visible && !item.media_use_keys.length))) {
      fail("incomplete_promo_locale", 400, "gallery_media");
    }
    configuredMedia.forEach((key) => knownMedia.add(key));
  }
  if (section.type === "contact") {
    assertStringArray(config.action_keys, { max: data.HARD_LIMITS.max_contact_actions, pattern: KEY_PATTERN });
    config.action_keys.forEach((key) => knownActions.add(key));
  }
  if (section.type === "hero") {
    assertKey(config.media_use_key, USE_KEY_PATTERN, true);
    assertKey(config.action_key, KEY_PATTERN, true);
    if (liveDocument) {
      if (!HERO_LAYOUTS.includes(config.layout)) fail("invalid_promo_document", 400);
      if (!HERO_CONTRAST_MODES.includes(config.contrast_mode)
        || !HERO_OVERLAY_STRENGTHS.includes(config.overlay_strength)
        || !HEX_COLOR_PATTERN.test(config.title_color)
        || !HEX_COLOR_PATTERN.test(config.body_color)
        || !HEX_COLOR_PATTERN.test(config.accent_color)) {
        fail("invalid_promo_document", 400);
      }
      if (!Array.isArray(config.button_targets) || config.button_targets.length > HERO_MAX_BUTTONS
        || new Set(config.button_targets).size !== config.button_targets.length
        || config.button_targets.some((target) => !HERO_BUTTON_TARGETS.includes(target))) {
        fail("invalid_promo_document", 400);
      }
    }
    if (config.media_use_key) knownMedia.add(config.media_use_key);
    if (config.action_key) knownActions.add(config.action_key);
  }
  if (section.type === "owner") {
    assertKey(config.media_use_key, USE_KEY_PATTERN, true);
    if (config.media_use_key) knownMedia.add(config.media_use_key);
  }
}

function validateSections(document, publicRevision, liveDocument) {
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
    validateSectionConfig(section, actions, media, liveDocument, publicRevision);
  }
  if (new Set(keys).size !== keys.length || keys.length !== document.section_order.length
    || keys.some((key, index) => key !== document.section_order[index])) {
    fail("invalid_promo_document", 400);
  }
  const heroIndexes = document.sections
    .map((section, index) => (section.type === "hero" ? index : -1))
    .filter((index) => index >= 0);
  const footerIndexes = document.sections
    .map((section, index) => (section.type === "footer" ? index : -1))
    .filter((index) => index >= 0);
  if (heroIndexes.length > 1 || footerIndexes.length > 1
    || (heroIndexes.length === 1 && heroIndexes[0] !== 0)
    || (footerIndexes.length === 1 && footerIndexes[0] !== document.sections.length - 1)) {
    fail("invalid_promo_document", 400);
  }
  const sectionByKey = new Map(document.sections.map((section) => [section.key, section]));
  if (liveDocument) {
    document.sections.filter((section) => section.type === "services").forEach((section) => {
      section.config.gallery_keys.forEach((galleryKey) => {
        const gallery = galleryKey ? sectionByKey.get(galleryKey) : null;
        if (galleryKey && (!gallery || gallery.type !== "gallery")) fail("invalid_promo_document", 400);
        if (publicRevision && section.visible && galleryKey && (!gallery || !gallery.visible)) {
          fail("incomplete_promo_locale", 400, "service_gallery");
        }
      });
    });
  }
  document.sections.filter((section) => section.type === "footer").forEach((section) => {
    const config = promoFooter.normalizeFooterConfig(section.config);
    config.navigation_section_keys.forEach((sectionKey) => {
      const target = sectionByKey.get(sectionKey);
      if (!target || target.type === "footer"
        || (publicRevision && section.visible && !target.visible)) {
        fail("invalid_promo_document", 400);
      }
    });
  });
  return { actions, media };
}

function enforceFixedSectionOrder(document) {
  const heroSections = document.sections.filter((section) => section.type === "hero");
  const footerSections = document.sections.filter((section) => section.type === "footer");
  if (heroSections.length > 1 || footerSections.length > 1) {
    fail("invalid_promo_document", 400);
  }
  const movableSections = document.sections.filter((section) => (
    section.type !== "hero" && section.type !== "footer"
  ));
  document.sections = [...heroSections, ...movableSections, ...footerSections];
  document.section_order = document.sections.map((section) => section.key);
  return document;
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

function validateSectionMediaPurposes(document, liveDocument) {
  for (const section of document.sections) {
    const allowed = liveDocument && ["services", "featured_work"].includes(section.type)
      ? []
      : (SECTION_MEDIA_PURPOSES[section.type] || []);
    const keys = new Set(section.media_use_keys);
    if (["hero", "owner"].includes(section.type) && section.config.media_use_key) {
      keys.add(section.config.media_use_key);
    }
    for (const key of keys) {
      const ref = document.media_refs[key];
      if (!ref || !allowed.includes(ref.purpose)) fail("invalid_promo_media_reference", 400);
    }
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

function validateContact(value, liveDocument) {
  const contact = exactKeys(value, liveDocument
    ? ["enabled", "primary_action_key", "secondary_action_keys", "actions", "logo_media_use_key", "qr_media_use_key"]
    : ["enabled", "primary_action_key", "secondary_action_keys", "actions"]);
  assertBoolean(contact.enabled);
  assertKey(contact.primary_action_key, KEY_PATTERN, true);
  if (liveDocument) {
    assertKey(contact.logo_media_use_key, USE_KEY_PATTERN, true);
    assertKey(contact.qr_media_use_key, USE_KEY_PATTERN, true);
  }
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

function validateLocalizedItems(items, type, publicRevision, configuredKeys, liveDocument) {
  if (!Array.isArray(items) || items.length > data.HARD_LIMITS.max_services) fail("invalid_promo_document", 400);
  const keys = [];
  for (const item of items) {
    const allowed = type === "gallery" && !liveDocument
      ? ["key", "caption"]
      : ["key", "name", "summary", "caption"];
    const normalized = onlyKeys(item, allowed);
    keys.push(assertKey(normalized.key, KEY_PATTERN, false));
    if (Object.prototype.hasOwnProperty.call(normalized, "name")) assertSafeText(normalized.name, 160, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(normalized, "summary")) assertSafeText(normalized.summary, 600, { empty: true });
    if (Object.prototype.hasOwnProperty.call(normalized, "caption")) assertSafeText(normalized.caption, 500, { empty: true });
    if (publicRevision && (type !== "gallery" || liveDocument) && !normalized.name) {
      fail("incomplete_promo_locale", 400, "localized_item_name");
    }
  }
  if (new Set(keys).size !== keys.length) fail("invalid_promo_document", 400);
  if (publicRevision && (keys.length !== configuredKeys.length
    || keys.some((key, index) => key !== configuredKeys[index]))) {
    fail("incomplete_promo_locale", 400, "localized_item_keys");
  }
}

function validateLocalizedSection(value, section, publicRevision, liveDocument) {
  const localized = onlyKeys(value, (liveDocument ? LIVE_LOCALIZED_SECTION_KEYS : LOCALIZED_SECTION_KEYS)[section.type]);
  const textLimits = {
    heading: 160,
    consultation_heading: 160,
    summary: 600,
    qr_heading: 160,
    name: 140,
    bio: 4000,
    text: 4000,
  };
  Object.keys(textLimits).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(localized, key)) {
      assertSafeText(localized[key], textLimits[key], { empty: !publicRevision || key !== "heading" });
    }
  });
  if (liveDocument && section.type === "hero") {
    if (Object.prototype.hasOwnProperty.call(localized, "intro")) {
      assertSafeText(localized.intro, 120, { empty: true });
    }
    if (!Array.isArray(localized.highlights) || localized.highlights.length > HERO_MAX_HIGHLIGHTS) {
      fail("invalid_promo_document", 400);
    }
    localized.highlights.forEach((highlight) => assertSafeText(highlight, 80, { empty: !publicRevision }));
    if (!Array.isArray(localized.button_labels)
      || localized.button_labels.length !== section.config.button_targets.length
      || localized.button_labels.length > HERO_MAX_BUTTONS) {
      fail("invalid_promo_document", 400);
    }
    localized.button_labels.forEach((label) => assertSafeText(label, 80, { empty: true }));
  }
  if (Object.prototype.hasOwnProperty.call(localized, "items")) {
    validateLocalizedItems(localized.items, section.type, publicRevision, section.config.item_keys || [], liveDocument);
  } else if (publicRevision && ["services", "featured_work", "gallery"].includes(section.type)
    && section.config.item_keys.length) {
    fail("incomplete_promo_locale", 400, "localized_section_items");
  }
}

function hasLocalizedText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireLocalizedParity(document, locale, localized, liveDocument) {
  if (locale === document.locales.default) return;
  const base = plainObject(document.content_by_locale[document.locales.default]);
  const baseIdentity = plainObject(base.identity);
  const identity = plainObject(localized.identity);
  ["slogan", "summary", "contact_cta_label", "owner_name", "owner_bio"].forEach((field) => {
    if (hasLocalizedText(baseIdentity[field]) && !hasLocalizedText(identity[field])) {
      fail("incomplete_promo_locale", 400, `identity_${field}`);
    }
  });

  const baseSections = plainObject(base.sections);
  const targetSections = plainObject(localized.sections);
  document.sections.filter((section) => section.visible).forEach((section) => {
    const source = plainObject(baseSections[section.key]);
    const target = plainObject(targetSections[section.key]);
    const textFields = liveDocument
      ? (LIVE_LOCALIZED_SECTION_KEYS[section.type] || [])
      : (LOCALIZED_SECTION_KEYS[section.type] || []);
    textFields.filter((field) => !["items", "highlights", "button_labels"].includes(field)).forEach((field) => {
      if (hasLocalizedText(source[field]) && !hasLocalizedText(target[field])) {
        fail("incomplete_promo_locale", 400, `localized_${section.type}_${field}`);
      }
    });
    if (liveDocument && section.type === "hero") {
      const sourceHighlights = Array.isArray(source.highlights) ? source.highlights : [];
      const targetHighlights = Array.isArray(target.highlights) ? target.highlights : [];
      sourceHighlights.forEach((value, index) => {
        if (hasLocalizedText(value) && !hasLocalizedText(targetHighlights[index])) {
          fail("incomplete_promo_locale", 400, "localized_hero_highlights");
        }
      });
      const sourceButtons = Array.isArray(source.button_labels) ? source.button_labels : [];
      const targetButtons = Array.isArray(target.button_labels) ? target.button_labels : [];
      sourceButtons.forEach((value, index) => {
        if (section.config.button_targets[index] === "primary-contact") return;
        if (hasLocalizedText(value) && !hasLocalizedText(targetButtons[index])) {
          fail("incomplete_promo_locale", 400, "localized_hero_buttons");
        }
      });
    }
    if (["services", "gallery"].includes(section.type)) {
      const sourceItems = new Map((Array.isArray(source.items) ? source.items : [])
        .map((item) => [String(item && item.key || ""), item]));
      const targetItems = new Map((Array.isArray(target.items) ? target.items : [])
        .map((item) => [String(item && item.key || ""), item]));
      (section.config.item_keys || []).forEach((itemKey) => {
        const sourceItem = plainObject(sourceItems.get(itemKey));
        const targetItem = plainObject(targetItems.get(itemKey));
        ["summary", "caption"].forEach((field) => {
          if (hasLocalizedText(sourceItem[field]) && !hasLocalizedText(targetItem[field])) {
            fail("incomplete_promo_locale", 400, `localized_item_${field}`);
          }
        });
      });
    }
  });

  const baseContact = plainObject(base.contact);
  const contact = plainObject(localized.contact);
  Object.keys(baseContact).forEach((key) => {
    const source = plainObject(baseContact[key]);
    const target = plainObject(contact[key]);
    if (hasLocalizedText(source.message) && !hasLocalizedText(target.message)) {
      fail("incomplete_promo_locale", 400, "localized_contact_message");
    }
  });
  const baseSeo = plainObject(base.seo);
  const seo = plainObject(localized.seo);
  ["social_title", "social_description"].forEach((field) => {
    if (hasLocalizedText(baseSeo[field]) && !hasLocalizedText(seo[field])) {
      fail("incomplete_promo_locale", 400, `localized_seo_${field}`);
    }
  });
}

function validateLocalizedContent(document, publicRevision, liveDocument) {
  const byLocale = plainObject(document.content_by_locale);
  const localeKeys = Object.keys(byLocale);
  if (localeKeys.length > data.HARD_LIMITS.max_locales) fail("invalid_promo_document", 400);
  localeKeys.forEach(assertCanonicalLocale);
  const canonicalLocaleKeys = localeKeys.slice().sort();
  if (publicRevision && (canonicalLocaleKeys.length !== document.locales.published.length
    || canonicalLocaleKeys.some((locale, index) => locale !== document.locales.published[index]))) {
    fail("incomplete_promo_locale", 400, "locale_set");
  }
  const sectionMap = new Map(document.sections.map((section) => [section.key, section]));
  const mediaKeys = Object.keys(document.media_refs);
  const actionKeys = document.contact.actions.map((action) => action.key);
  for (const locale of localeKeys) {
    const localized = exactKeys(byLocale[locale], ["identity", "navigation", "sections", "contact", "media_alt", "seo"]);
    const identity = onlyKeys(localized.identity, liveDocument
      ? ["name", "slogan", "summary", "contact_cta_label", "owner_name", "owner_bio"]
      : ["name", "summary", "owner_name", "owner_bio"]);
    if (Object.prototype.hasOwnProperty.call(identity, "name")) assertSafeText(identity.name, 140, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(identity, "summary")) assertSafeText(identity.summary, 600, { empty: true });
    if (liveDocument && Object.prototype.hasOwnProperty.call(identity, "slogan")) {
      assertSafeText(identity.slogan, 120, { empty: true });
    }
    if (liveDocument && Object.prototype.hasOwnProperty.call(identity, "contact_cta_label")) {
      assertSafeText(identity.contact_cta_label, 80, { empty: true });
    }
    if (Object.prototype.hasOwnProperty.call(identity, "owner_name")) assertSafeText(identity.owner_name, 140, { empty: true });
    if (Object.prototype.hasOwnProperty.call(identity, "owner_bio")) assertSafeText(identity.owner_bio, 4000, { empty: true });
    if (publicRevision && !identity.name) fail("incomplete_promo_locale", 400, "identity_name");

    const navigation = plainObject(localized.navigation);
    for (const key of Object.keys(navigation)) {
      if (!sectionMap.has(key)) fail("invalid_promo_document", 400);
      assertSafeText(navigation[key], 80, { empty: false });
    }
    const localizedSections = plainObject(localized.sections);
    for (const key of Object.keys(localizedSections)) {
      const section = sectionMap.get(key);
      if (!section) fail("invalid_promo_document", 400);
      validateLocalizedSection(localizedSections[key], section, publicRevision, liveDocument);
    }
    if (publicRevision) {
      document.sections.filter((section) => section.visible).forEach((section) => {
        if (!navigation[section.key] || !localizedSections[section.key]) {
          fail("incomplete_promo_locale", 400, "visible_section");
        }
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
        if (!contact[key] || !contact[key].label || !contact[key].aria_label) {
          fail("incomplete_promo_locale", 400, "contact_copy");
        }
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
        if (!mediaAlt[key] || (!mediaAlt[key].decorative && !mediaAlt[key].alt)) {
          fail("incomplete_promo_locale", 400, "media_alt");
        }
      });
    }

    const seo = onlyKeys(localized.seo, ["title", "description", "social_title", "social_description"]);
    if (Object.prototype.hasOwnProperty.call(seo, "title")) assertSafeText(seo.title, 70, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(seo, "description")) assertSafeText(seo.description, 170, { empty: !publicRevision });
    if (Object.prototype.hasOwnProperty.call(seo, "social_title")) assertSafeText(seo.social_title, 70, { empty: true });
    if (Object.prototype.hasOwnProperty.call(seo, "social_description")) assertSafeText(seo.social_description, 170, { empty: true });
    if (publicRevision && (!seo.title || !seo.description)) {
      fail("incomplete_promo_locale", 400, "seo");
    }
    if (publicRevision) requireLocalizedParity(document, locale, localized, liveDocument);
  }
}

function validateAdapters(value) {
  const adapters = exactKeys(value, ["store_rating", "landing_qr_link"]);
  assertBoolean(exactKeys(adapters.store_rating, ["enabled"]).enabled);
  assertBoolean(exactKeys(adapters.landing_qr_link, ["enabled"]).enabled);
}

function uniqueDocumentKey(used, preferred, maximum) {
  const limit = Number.isInteger(maximum) ? maximum : 64;
  const normalized = String(preferred || "item").toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, limit) || "item";
  const base = /^[a-z]/.test(normalized) ? normalized : `item-${normalized}`.slice(0, limit);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const ending = `-${suffix}`;
    const candidate = `${base.slice(0, Math.max(1, limit - ending.length))}${ending}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  fail("invalid_promo_document", 400);
}

function upgradeHeroPresentation(document) {
  const heroes = Array.isArray(document.sections)
    ? document.sections.filter((section) => section && section.type === "hero")
    : [];
  heroes.forEach((section) => {
    const config = section.config && typeof section.config === "object" && !Array.isArray(section.config)
      ? section.config : {};
    const rawTargets = Array.isArray(config.button_targets)
      ? config.button_targets.filter((target) => HERO_BUTTON_TARGETS.includes(target))
      : ["primary-contact"];
    section.config = {
      media_use_key: String(config.media_use_key || ""),
      action_key: String(config.action_key || ""),
      layout: HERO_LAYOUTS.includes(config.layout) ? config.layout : "immersive",
      button_targets: Array.from(new Set(rawTargets)).slice(0, HERO_MAX_BUTTONS),
      contrast_mode: HERO_CONTRAST_MODES.includes(config.contrast_mode) ? config.contrast_mode : "auto",
      title_color: HEX_COLOR_PATTERN.test(String(config.title_color || "").toLowerCase())
        ? String(config.title_color).toLowerCase() : HERO_DEFAULT_COLORS.title,
      body_color: HEX_COLOR_PATTERN.test(String(config.body_color || "").toLowerCase())
        ? String(config.body_color).toLowerCase() : HERO_DEFAULT_COLORS.body,
      accent_color: HEX_COLOR_PATTERN.test(String(config.accent_color || "").toLowerCase())
        ? String(config.accent_color).toLowerCase() : HERO_DEFAULT_COLORS.accent,
      overlay_strength: HERO_OVERLAY_STRENGTHS.includes(config.overlay_strength)
        ? config.overlay_strength : "medium",
    };
  });
  Object.values(document.content_by_locale || {}).forEach((localized) => {
    if (!localized || typeof localized !== "object" || Array.isArray(localized)
      || !localized.sections || typeof localized.sections !== "object" || Array.isArray(localized.sections)) return;
    heroes.forEach((section) => {
      const current = localized.sections[section.key]
        && typeof localized.sections[section.key] === "object"
        && !Array.isArray(localized.sections[section.key])
        ? localized.sections[section.key] : {};
      const highlights = Array.isArray(current.highlights)
        ? current.highlights.map(String).slice(0, HERO_MAX_HIGHLIGHTS)
        : [];
      const labels = Array.isArray(current.button_labels)
        ? current.button_labels.map(String).slice(0, HERO_MAX_BUTTONS)
        : [];
      while (labels.length < section.config.button_targets.length) labels.push("");
      localized.sections[section.key] = {
        ...current,
        intro: String(current.intro || ""),
        highlights,
        button_labels: labels.slice(0, section.config.button_targets.length),
      };
    });
  });
  return document;
}

function upgradeServiceIcons(document) {
  const sections = Array.isArray(document.sections)
    ? document.sections.filter((section) => section && section.type === "services")
    : [];
  sections.forEach((section) => {
    const config = section.config && typeof section.config === "object" && !Array.isArray(section.config)
      ? section.config : {};
    if (!Array.isArray(config.item_keys)) fail("invalid_promo_document", 400);
    if (!Object.prototype.hasOwnProperty.call(config, "icon_keys")) {
      section.config = { ...config, icon_keys: config.item_keys.map(() => "") };
      return;
    }
    if (!Array.isArray(config.icon_keys) || config.icon_keys.length !== config.item_keys.length
      || config.icon_keys.some((key) => typeof key !== "string" || (key && !SERVICE_ICON_KEYS.includes(key)))) {
      fail("invalid_promo_document", 400);
    }
  });
  return document;
}

function upgradePromoDocument(input) {
  const document = normalizeJson(input);
  if (document.contract === LIVE_DOCUMENT_CONTRACT) {
    const current = normalizeJson(document);
    if (current.contact && typeof current.contact === "object" && !Array.isArray(current.contact)) {
      if (!Object.prototype.hasOwnProperty.call(current.contact, "logo_media_use_key")) {
        current.contact.logo_media_use_key = "";
      }
      if (!Object.prototype.hasOwnProperty.call(current.contact, "qr_media_use_key")) {
        current.contact.qr_media_use_key = "";
      }
    }
    return enforceFixedSectionOrder(upgradeHeroPresentation(upgradeServiceIcons(current)));
  }
  if (document.contract !== DOCUMENT_CONTRACT) fail("unknown_promo_contract", 400);
  const next = normalizeJson(document);
  next.contract = LIVE_DOCUMENT_CONTRACT;
  next.contact = { ...next.contact, logo_media_use_key: "", qr_media_use_key: "" };

  const sectionKeys = new Set(next.sections.map((section) => section.key));
  const gallerySections = next.sections.filter((section) => section.type === "gallery");
  const legacyFeatured = next.sections.filter((section) => section.type === "featured_work");
  if (!gallerySections.length && legacyFeatured.some((section) => section.config.item_keys.length)) {
    const key = uniqueDocumentKey(sectionKeys, "gallery-portfolio", 64);
    const gallery = {
      key,
      type: "gallery",
      variant: "default",
      visible: true,
      config: { item_keys: [], cover_media_use_key: "", items: [] },
      media_use_keys: [],
    };
    next.sections.push(gallery);
    next.section_order.push(key);
    gallerySections.push(gallery);
    Object.values(next.content_by_locale).forEach((localized) => {
      localized.navigation[key] = "Galería";
      localized.sections[key] = { heading: "Galería", summary: "", items: [] };
    });
  }

  gallerySections.forEach((section) => {
    const itemKeys = Array.isArray(section.config.item_keys) ? section.config.item_keys.slice() : [];
    const mediaKeys = Array.isArray(section.media_use_keys) ? section.media_use_keys.slice() : [];
    section.config = {
      item_keys: itemKeys,
      cover_media_use_key: mediaKeys[0] || "",
      items: itemKeys.map((key, index) => ({
        key,
        media_use_keys: mediaKeys[index] ? [mediaKeys[index]] : [],
        featured: false,
        visible: !!mediaKeys[index],
      })),
    };
    section.media_use_keys = Array.from(new Set([
      section.config.cover_media_use_key,
      ...section.config.items.flatMap((item) => item.media_use_keys),
    ].filter(Boolean)));
    Object.values(next.content_by_locale).forEach((localized) => {
      const content = localized.sections[section.key] || { heading: "", summary: "", items: [] };
      const existing = new Map((Array.isArray(content.items) ? content.items : []).map((item) => [item.key, item]));
      content.items = itemKeys.map((key, index) => {
        const item = existing.get(key) || {};
        const caption = String(item.caption || "");
        return {
          key,
          name: String(item.name || caption || `Trabajo ${index + 1}`),
          summary: String(item.summary || ""),
          caption,
        };
      });
      localized.sections[section.key] = content;
    });
  });
  const targetGallery = gallerySections[0] || null;
  legacyFeatured.forEach((section) => {
    const itemKeys = Array.isArray(section.config.item_keys) ? section.config.item_keys.slice() : [];
    const mediaKeys = Array.isArray(section.media_use_keys) ? section.media_use_keys.slice() : [];
    if (targetGallery) {
      const usedItemKeys = new Set(targetGallery.config.item_keys);
      itemKeys.forEach((legacyKey, index) => {
        const itemKey = uniqueDocumentKey(usedItemKeys, legacyKey, 64);
        const mediaKey = mediaKeys[index] || "";
        targetGallery.config.item_keys.push(itemKey);
        targetGallery.config.items.push({
          key: itemKey,
          media_use_keys: mediaKey ? [mediaKey] : [],
          featured: true,
          visible: !!mediaKey,
        });
        if (mediaKey && !targetGallery.media_use_keys.includes(mediaKey)) {
          targetGallery.media_use_keys.push(mediaKey);
        }
        Object.values(next.content_by_locale).forEach((localized) => {
          const featured = localized.sections[section.key] || {};
          const legacyItem = (featured.items || []).find((item) => item.key === legacyKey) || {};
          const target = localized.sections[targetGallery.key];
          target.items.push({
            key: itemKey,
            name: String(legacyItem.name || legacyItem.caption || `Trabajo ${target.items.length + 1}`),
            summary: String(legacyItem.summary || ""),
            caption: String(legacyItem.caption || ""),
          });
        });
      });
    }
    section.config = { item_keys: [] };
    section.media_use_keys = [];
    Object.values(next.content_by_locale).forEach((localized) => {
      const content = localized.sections[section.key];
      if (content) delete content.items;
    });
  });

  // A legacy featured-work section can be the source of the first live gallery.
  // In that case the gallery was created before its media were copied, so its
  // cover must be derived afterwards to keep an already-public site publishable.
  if (targetGallery && !targetGallery.config.cover_media_use_key
    && targetGallery.media_use_keys.length) {
    targetGallery.config.cover_media_use_key = targetGallery.media_use_keys[0];
  }
  gallerySections.forEach((section) => {
    if (!section.config.cover_media_use_key) section.visible = false;
  });

  next.sections.filter((section) => section.type === "services").forEach((section) => {
    section.config = {
      item_keys: section.config.item_keys.slice(),
      gallery_keys: section.config.item_keys.map(() => (
        targetGallery && targetGallery.visible ? targetGallery.key : ""
      )),
      icon_keys: section.config.item_keys.map(() => ""),
    };
    section.media_use_keys = [];
  });
  Object.values(next.content_by_locale).forEach((localized) => {
    localized.identity = {
      ...localized.identity,
      slogan: String(localized.identity.slogan || ""),
      contact_cta_label: String(localized.identity.contact_cta_label || ""),
    };
  });
  return enforceFixedSectionOrder(upgradeHeroPresentation(upgradeServiceIcons(next)));
}

function validatePromoDocument(input, options) {
  const settings = options || {};
  const document = normalizeJson(input);
  const liveDocument = document && document.contract === LIVE_DOCUMENT_CONTRACT;
  exactKeys(document, [
    "contract", "system_catalog_version", "locales", "theme", "identity", "section_order",
    "sections", "media_refs", "contact", "content_by_locale", "adapters",
  ]);
  if (![DOCUMENT_CONTRACT, LIVE_DOCUMENT_CONTRACT].includes(document.contract)
    || document.system_catalog_version !== SYSTEM_CATALOG_VERSION) {
    fail("unknown_promo_contract", 400);
  }
  data.assertDocumentHardLimits(document);
  validateLocales(document.locales, settings.publicRevision === true);
  validateTheme(document.theme, settings.publicRevision === true);
  validateIdentity(document.identity);
  const used = validateSections(document, settings.publicRevision === true, liveDocument);
  validateMediaRefs(document.media_refs);
  validateSectionMediaPurposes(document, liveDocument);
  const contactActions = validateContact(document.contact, liveDocument);
  if (liveDocument && document.contact.qr_media_use_key) {
    const qrRef = document.media_refs[document.contact.qr_media_use_key];
    if (!qrRef || qrRef.purpose !== "qr") fail("invalid_promo_media_reference", 400);
    used.media.add(document.contact.qr_media_use_key);
  }
  if (liveDocument && document.contact.logo_media_use_key) {
    const logoRef = document.media_refs[document.contact.logo_media_use_key];
    if (!logoRef || logoRef.purpose !== "logo") fail("invalid_promo_media_reference", 400);
    used.media.add(document.contact.logo_media_use_key);
  }
  used.media.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(document.media_refs, key)) fail("invalid_promo_media_reference", 400);
  });
  used.actions.forEach((key) => {
    if (!contactActions.has(key)) fail("invalid_promo_contact_reference", 400);
  });
  validateLocalizedContent(document, settings.publicRevision === true, liveDocument);
  validateAdapters(document.adapters);
  return document;
}

function documentMetrics(document, assets) {
  let services = 0;
  let gallery = 0;
  document.sections.forEach((section) => {
    if (section.type === "services") services += section.config.item_keys.length;
    if (section.type === "gallery") {
      gallery += document.contract === LIVE_DOCUMENT_CONTRACT
        ? section.media_use_keys.length
        : section.config.item_keys.length;
    }
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
  const firstHero = visibleSections.find((section) => section.type === "hero");
  const priorityMediaKey = firstHero
    ? (firstHero.config.media_use_key || firstHero.media_use_keys[0] || "")
    : "";
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
    media: (media || []).map((asset) => promoMedia.publicAssetDescriptor(asset, siteSlug, {
      priority: !!priorityMediaKey && asset.key === priorityMediaKey,
    })),
    contact: {
      enabled: document.contact.enabled,
      primary_action_key: document.contact.enabled ? document.contact.primary_action_key : "",
      secondary_action_keys: document.contact.enabled ? document.contact.secondary_action_keys.slice() : [],
      actions: enabledActions.map((action) => ({ key: action.key, type: action.type, enabled: true })),
      ...(document.contract === LIVE_DOCUMENT_CONTRACT
        ? {
          logo_media_use_key: document.contact.logo_media_use_key,
          qr_media_use_key: document.contact.qr_media_use_key,
        }
        : {}),
    },
    content_by_locale: resultContent,
    adapters: normalizeJson(document.adapters),
  };
}

module.exports = {
  CONTACT_TYPES,
  DOCUMENT_CONTRACT,
  LIVE_DOCUMENT_CONTRACT,
  DRAFT_READ_CONTRACT,
  DRAFT_RESPONSE_CONTRACT,
  DRAFT_UPDATE_CONTRACT,
  LIVE_READ_CONTRACT,
  LIVE_RESPONSE_CONTRACT,
  LIVE_UPDATE_CONTRACT,
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
  upgradePromoDocument,
  validatePromoDocument,
};
