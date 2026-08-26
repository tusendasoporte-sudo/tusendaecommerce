/// <reference path="../pb_data/types.d.ts" />

const THEME_CONTRACT_VERSION = 1;
const THEME_CATALOG_CONTRACT = "promo.theme.catalog.v1";
const THEME_CATALOG_READ_CONTRACT = "promo.theme.catalog.read.v1";
const THEME_RELEASE_UPDATE_CONTRACT = "promo.theme.release.update.v1";
const THEME_RELEASE_RESPONSE_CONTRACT = "promo.theme.release.v1";

const THEME_ID_PATTERN = /^promo\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const TOKEN_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const SECTION_TYPES = Object.freeze([
  "hero", "services", "featured_work", "gallery", "owner", "store_rating", "contact", "footer",
]);

const SELECTABLE_RELEASE_STATUSES = Object.freeze(["approved"]);
const EDITABLE_RELEASE_STATUSES = Object.freeze(["approved", "deprecated"]);
const PUBLIC_RELEASE_STATUSES = Object.freeze(["approved", "deprecated", "retired"]);
const ROLLBACK_RELEASE_STATUSES = Object.freeze(["approved", "deprecated", "retired"]);

function token(values, fallback) {
  return Object.freeze({
    type: "enum",
    values: Object.freeze(values.slice()),
    default: fallback,
  });
}

const BLACK_GOLD_TOKEN_SCHEMA = Object.freeze({
  surface: token(["obsidian"], "obsidian"),
  text: token(["ivory"], "ivory"),
  accent: token(["heritage_gold", "champagne_gold"], "heritage_gold"),
  border: token(["heritage_gold", "champagne_gold"], "heritage_gold"),
  focus: token(["ivory_ring"], "ivory_ring"),
  heading_font: token(["editorial_serif"], "editorial_serif"),
  body_font: token(["humanist_sans"], "humanist_sans"),
  radius: token(["subtle", "soft"], "subtle"),
  shadow: token(["ambient", "lifted"], "ambient"),
  density: token(["comfortable", "compact"], "comfortable"),
  motion: token(["subtle", "reduced"], "subtle"),
});

const BLACK_GOLD_SECTION_VARIANTS = Object.freeze(SECTION_TYPES.reduce((result, sectionType) => {
  result[sectionType] = Object.freeze(["default"]);
  return result;
}, {}));

const BLACK_GOLD_MANIFEST = Object.freeze({
  theme_id: "promo.black-gold",
  version: "1.0.0",
  renderer_key: "promo.black-gold",
  contract_version: THEME_CONTRACT_VERSION,
  document_contract: "promo.site.v2",
  token_schema: BLACK_GOLD_TOKEN_SCHEMA,
  section_variants: BLACK_GOLD_SECTION_VARIANTS,
  compatibility: Object.freeze({
    min_document_schema: 2,
    max_document_schema: 2,
    content_preserving_switch: true,
  }),
  accessibility: Object.freeze({
    normal_text_contrast_min: 4.5,
    large_text_contrast_min: 3,
    focus_contrast_min: 3,
    reduced_motion_supported: true,
  }),
  performance: Object.freeze({
    css_budget_kib: 50,
    initial_js_budget_kib: 75,
    third_party_scripts: false,
  }),
});

function fixedSchema(values) {
  return Object.freeze(Object.fromEntries(Object.entries(values).map(([key, value]) => (
    [key, token(Array.isArray(value) ? value : [value], Array.isArray(value) ? value[0] : value)]
  ))));
}

function catalogManifest(themeId, rendererKey, tokenSchema) {
  return Object.freeze({
    theme_id: themeId,
    version: "1.0.0",
    renderer_key: rendererKey,
    contract_version: THEME_CONTRACT_VERSION,
    document_contract: "promo.site.v2",
    token_schema: tokenSchema,
    section_variants: BLACK_GOLD_SECTION_VARIANTS,
    compatibility: Object.freeze({
      min_document_schema: 2,
      max_document_schema: 2,
      content_preserving_switch: true,
    }),
    accessibility: Object.freeze({
      normal_text_contrast_min: 4.5,
      large_text_contrast_min: 3,
      focus_contrast_min: 3,
      reduced_motion_supported: true,
    }),
    performance: Object.freeze({
      css_budget_kib: 50,
      initial_js_budget_kib: 75,
      third_party_scripts: false,
    }),
  });
}

const MINIMAL_TOKEN_SCHEMA = fixedSchema({
  surface: "porcelain", text: "ink", accent: "cobalt", border: "mist", focus: "cobalt_ring",
  heading_font: "geometric_sans", body_font: "clean_sans", radius: "crisp", shadow: "none",
  density: "airy", motion: ["subtle", "reduced"],
});
const ARTISAN_TOKEN_SCHEMA = fixedSchema({
  surface: "parchment", text: "espresso", accent: "terracotta", border: "clay", focus: "espresso_ring",
  heading_font: "crafted_serif", body_font: "warm_sans", radius: "organic", shadow: "paper",
  density: "comfortable", motion: ["subtle", "reduced"],
});
const VIBRANT_TOKEN_SCHEMA = fixedSchema({
  surface: "midnight", text: "white", accent: "coral", border: "electric_blue", focus: "lime_ring",
  heading_font: "display_sans", body_font: "modern_sans", radius: "bold", shadow: "neon",
  density: "energetic", motion: ["expressive", "reduced"],
});
const PROFESSIONAL_TOKEN_SCHEMA = fixedSchema({
  surface: "navy", text: "white", accent: "sky", border: "steel", focus: "white_ring",
  heading_font: "corporate_sans", body_font: "clean_sans", radius: "structured", shadow: "precise",
  density: "compact", motion: ["subtle", "reduced"],
});
const PORTFOLIO_TOKEN_SCHEMA = fixedSchema({
  surface: "charcoal", text: "white", accent: "sand", border: "graphite", focus: "white_ring",
  heading_font: "gallery_display", body_font: "modern_sans", radius: "minimal", shadow: "cinematic",
  density: "image_first", motion: ["cinematic", "reduced"],
});

const MINIMAL_MANIFEST = catalogManifest("promo.minimal", "promo.minimal", MINIMAL_TOKEN_SCHEMA);
const ARTISAN_MANIFEST = catalogManifest("promo.artisan", "promo.artisan", ARTISAN_TOKEN_SCHEMA);
const VIBRANT_MANIFEST = catalogManifest("promo.vibrant", "promo.vibrant", VIBRANT_TOKEN_SCHEMA);
const PROFESSIONAL_MANIFEST = catalogManifest("promo.professional", "promo.professional", PROFESSIONAL_TOKEN_SCHEMA);
const PORTFOLIO_MANIFEST = catalogManifest("promo.portfolio", "promo.portfolio", PORTFOLIO_TOKEN_SCHEMA);

// Hashes del JSON canónico de BLACK_GOLD_MANIFEST y BLACK_GOLD_TOKEN_SCHEMA.
// Una prueba focal los recalcula para impedir drift silencioso.
const BLACK_GOLD_MANIFEST_SHA256 = "2eb67804fe337c69acdca95d0b9437606c3dd236cf612b043e8034f31de80d4b";
const BLACK_GOLD_TOKEN_SCHEMA_SHA256 = "430970d43e20f398dd12888ae0841aa8afb199ece9bbc4c1023ba0b6384d17b4";
const MINIMAL_MANIFEST_SHA256 = "f51cee8379fb6ff20f1fec8e4d46226739bb6002aba3d20fe6eae17bb396ec20";
const MINIMAL_TOKEN_SCHEMA_SHA256 = "ffe2964baf29484b712ebe497485011329af96525938ed228d7d052f184fe69b";
const ARTISAN_MANIFEST_SHA256 = "746563c46ba32a4aee6ccab897f5600f24c94dd641854fedb519f21d77bb750b";
const ARTISAN_TOKEN_SCHEMA_SHA256 = "57045894298ad61eecb3c348e89bcf1ccc8059774aad02ab1e200e70bdb04a98";
const VIBRANT_MANIFEST_SHA256 = "00940a47e902451ed6b2dbde2a2c82f7314be93e1c08f3be09a0a3555edeb4ae";
const VIBRANT_TOKEN_SCHEMA_SHA256 = "cdcd01e20d205382f68537f2254cbae36f4ce66bc08bfa6c8a7b2ec18c724553";
const PROFESSIONAL_MANIFEST_SHA256 = "1c9d0bc2dc7fe33aa4a484bf2e4f78b469e9c6fa71634f2055240273040fd922";
const PROFESSIONAL_TOKEN_SCHEMA_SHA256 = "5f165e8ca5a14ed9924acbf778d5fc7352db3f0e0528248b80f7d8da8c610276";
const PORTFOLIO_MANIFEST_SHA256 = "1829ad163fcfca66a485ba3e226fe78cae51e5bbf437aaf23615faba683d1387";
const PORTFOLIO_TOKEN_SCHEMA_SHA256 = "34d659dc93136c6f513cc3c0b47147b8c3e3b29578bf7c5d5779e3a03051b36f";

const THEME_REGISTRY = Object.freeze({
  "promo.black-gold@1.0.0": Object.freeze({
    manifest: BLACK_GOLD_MANIFEST,
    manifest_sha256: BLACK_GOLD_MANIFEST_SHA256,
    token_schema_sha256: BLACK_GOLD_TOKEN_SCHEMA_SHA256,
    safe_fallback: true,
  }),
  "promo.minimal@1.0.0": Object.freeze({ manifest: MINIMAL_MANIFEST, manifest_sha256: MINIMAL_MANIFEST_SHA256, token_schema_sha256: MINIMAL_TOKEN_SCHEMA_SHA256, safe_fallback: false }),
  "promo.artisan@1.0.0": Object.freeze({ manifest: ARTISAN_MANIFEST, manifest_sha256: ARTISAN_MANIFEST_SHA256, token_schema_sha256: ARTISAN_TOKEN_SCHEMA_SHA256, safe_fallback: false }),
  "promo.vibrant@1.0.0": Object.freeze({ manifest: VIBRANT_MANIFEST, manifest_sha256: VIBRANT_MANIFEST_SHA256, token_schema_sha256: VIBRANT_TOKEN_SCHEMA_SHA256, safe_fallback: false }),
  "promo.professional@1.0.0": Object.freeze({ manifest: PROFESSIONAL_MANIFEST, manifest_sha256: PROFESSIONAL_MANIFEST_SHA256, token_schema_sha256: PROFESSIONAL_TOKEN_SCHEMA_SHA256, safe_fallback: false }),
  "promo.portfolio@1.0.0": Object.freeze({ manifest: PORTFOLIO_MANIFEST, manifest_sha256: PORTFOLIO_MANIFEST_SHA256, token_schema_sha256: PORTFOLIO_TOKEN_SCHEMA_SHA256, safe_fallback: false }),
});

const SAFE_FALLBACK_KEY = "promo.black-gold@1.0.0";

const PLATFORM_COLOR_VALUES = Object.freeze({
  obsidian: "#0b0b0b",
  ivory: "#f6f1e7",
  heritage_gold: "#c8a45a",
  champagne_gold: "#d9bf84",
  ivory_ring: "#f6f1e7",
  porcelain: "#ffffff",
  ink: "#17212b",
  cobalt: "#175cd3",
  mist: "#d7dee7",
  cobalt_ring: "#175cd3",
  parchment: "#f5ead9",
  espresso: "#3b2418",
  terracotta: "#9b3f24",
  clay: "#c98f70",
  espresso_ring: "#3b2418",
  midnight: "#10142e",
  white: "#ffffff",
  coral: "#ff8a6b",
  electric_blue: "#58a6ff",
  lime_ring: "#c8f560",
  navy: "#0c2d48",
  sky: "#78b7ff",
  steel: "#7693aa",
  white_ring: "#ffffff",
  charcoal: "#171717",
  sand: "#e7c99b",
  graphite: "#626262",
});

class PromoThemeError extends Error {
  constructor(code, status) {
    super(code || "invalid_promo_theme");
    this.name = "PromoThemeError";
    this.code = code || "invalid_promo_theme";
    this.status = Number.isInteger(status) ? status : 400;
  }
}

function fail(code, status) {
  throw new PromoThemeError(code, status);
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("invalid_promo_theme_manifest", 503);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (!value || typeof value !== "object") fail("invalid_promo_theme_manifest", 503);
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (_) { fail("invalid_promo_theme", 400); }
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code || "invalid_promo_theme", 400);
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code || "invalid_promo_theme", 400);
  }
  return value;
}

function keyFor(themeId, version) {
  return `${String(themeId || "")}@${String(version || "")}`;
}

function registryEntry(themeId, version) {
  return THEME_REGISTRY[keyFor(themeId, version)] || null;
}

function defaultTokens(entry) {
  const result = {};
  Object.keys(entry.manifest.token_schema).sort().forEach((key) => {
    result[key] = entry.manifest.token_schema[key].default;
  });
  return result;
}

function assertApprovedCombination(tokens, entry) {
  const selected = entry || THEME_REGISTRY[SAFE_FALLBACK_KEY];
  if (!selected) fail("invalid_promo_theme_manifest", 503);
  if (selected.manifest.theme_id === "promo.black-gold" && tokens.accent !== tokens.border) {
    fail("incompatible_promo_theme_tokens", 400);
  }
  return true;
}

function relativeLuminance(hex) {
  const normalized = String(hex || "").replace(/^#/, "");
  if (!/^[a-f0-9]{6}$/i.test(normalized)) fail("invalid_promo_theme_manifest", 503);
  const channels = [0, 2, 4].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first, second) {
  const one = relativeLuminance(first);
  const two = relativeLuminance(second);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

function assertAccessibleCombination(tokens, entry) {
  const selected = entry || THEME_REGISTRY[SAFE_FALLBACK_KEY];
  if (!selected) fail("invalid_promo_theme_manifest", 503);
  const accessibility = selected.manifest.accessibility;
  const surface = PLATFORM_COLOR_VALUES[tokens.surface];
  const text = PLATFORM_COLOR_VALUES[tokens.text];
  const accent = PLATFORM_COLOR_VALUES[tokens.accent];
  const focus = PLATFORM_COLOR_VALUES[tokens.focus];
  if (!surface || !text || !accent || !focus
    || contrastRatio(surface, text) < accessibility.normal_text_contrast_min
    || contrastRatio(surface, accent) < accessibility.large_text_contrast_min
    || contrastRatio(surface, focus) < accessibility.focus_contrast_min) {
    fail("unsafe_promo_theme_contrast", 400);
  }
  return true;
}

function validateOverrides(entry, input) {
  const overrides = input === undefined ? {} : input;
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    fail("invalid_promo_theme_tokens", 400);
  }
  const schema = entry.manifest.token_schema;
  const keys = Object.keys(overrides);
  if (keys.length > Object.keys(schema).length) fail("unknown_promo_theme_token", 400);
  keys.forEach((key) => {
    if (!TOKEN_KEY_PATTERN.test(key) || !Object.prototype.hasOwnProperty.call(schema, key)) {
      fail("unknown_promo_theme_token", 400);
    }
    const definition = schema[key];
    if (typeof overrides[key] !== "string" || !definition.values.includes(overrides[key])) {
      fail("invalid_promo_theme_token_value", 400);
    }
  });
  const effective = { ...defaultTokens(entry), ...overrides };
  assertApprovedCombination(effective, entry);
  assertAccessibleCombination(effective, entry);
  return { overrides: clone(overrides), effective };
}

function validateThemeSelection(selection, options) {
  const settings = options || {};
  const normalized = exactObject(selection, ["theme_id", "version", "tokens"]);
  const themeId = normalized.theme_id;
  const version = normalized.version;
  if (themeId === "" && version === "") {
    if (!settings.allowEmpty || Object.keys(exactObject(normalized.tokens, [])).length) {
      fail("invalid_promo_theme", 400);
    }
    return null;
  }
  if (!THEME_ID_PATTERN.test(themeId) || !SEMVER_PATTERN.test(version)) fail("invalid_promo_theme", 400);
  const entry = registryEntry(themeId, version);
  if (!entry) fail("unknown_promo_theme", 400);
  validateOverrides(entry, normalized.tokens);
  return entry;
}

function resolveEffectiveSelection(selection, options) {
  const entry = validateThemeSelection(selection, options);
  if (!entry) return safeFallbackSelection();
  const tokens = validateOverrides(entry, selection.tokens);
  return {
    theme_id: entry.manifest.theme_id,
    version: entry.manifest.version,
    tokens: tokens.effective,
  };
}

function assertSectionVariant(selection, sectionType, variant, options) {
  if (!SECTION_TYPES.includes(sectionType)) fail("incompatible_promo_theme_section", 400);
  const entry = validateThemeSelection(selection, options);
  if (!entry) {
    if (variant !== "default") fail("incompatible_promo_theme_variant", 400);
    return true;
  }
  const variants = entry.manifest.section_variants[sectionType] || [];
  if (!variants.includes(variant)) fail("incompatible_promo_theme_variant", 400);
  return true;
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

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try { return String(value.string() || "").trim(); } catch (_) {}
  }
  try { return String(value === null || value === undefined ? "" : value).trim(); } catch (_) { return ""; }
}

function releaseStatusesForMode(mode) {
  if (mode === "select") return SELECTABLE_RELEASE_STATUSES;
  if (mode === "edit") return EDITABLE_RELEASE_STATUSES;
  if (mode === "rollback") return ROLLBACK_RELEASE_STATUSES;
  return PUBLIC_RELEASE_STATUSES;
}

function assertReleaseIntegrity(record, selection) {
  const entry = validateThemeSelection(selection, { allowEmpty: false });
  if (!record
    || recordString(record, "theme_id") !== entry.manifest.theme_id
    || recordString(record, "version") !== entry.manifest.version
    || recordString(record, "renderer_key") !== entry.manifest.renderer_key
    || Number(recordValue(record, "contract_version")) !== entry.manifest.contract_version
    || recordString(record, "manifest_sha256") !== entry.manifest_sha256
    || recordString(record, "token_schema_sha256") !== entry.token_schema_sha256) {
    fail("promo_theme_release_mismatch", 400);
  }
  return entry;
}

function assertReleaseForSelection(record, selection, options) {
  const settings = options || {};
  let entry;
  try {
    entry = assertReleaseIntegrity(record, selection);
  } catch (_) {
    fail(settings.mode === "select" ? "promo_theme_not_selectable" : "promo_theme_unavailable", 400);
  }
  const status = recordString(record, "status");
  if (!releaseStatusesForMode(settings.mode).includes(status)) {
    fail(settings.mode === "select" ? "promo_theme_not_selectable" : "promo_theme_unavailable", 400);
  }
  return {
    entry,
    status,
    selection: resolveEffectiveSelection(selection),
  };
}

function resolveRollbackSelection(record, selection) {
  return assertReleaseForSelection(record, selection, { mode: "rollback" }).selection;
}

function safeFallbackSelection() {
  const entry = THEME_REGISTRY[SAFE_FALLBACK_KEY];
  if (!entry || !entry.safe_fallback) fail("promo_theme_fallback_unavailable", 503);
  return {
    theme_id: entry.manifest.theme_id,
    version: entry.manifest.version,
    tokens: defaultTokens(entry),
  };
}

function publicManifest(entry) {
  const schema = {};
  Object.keys(entry.manifest.token_schema).sort().forEach((key) => {
    const definition = entry.manifest.token_schema[key];
    schema[key] = {
      type: definition.type,
      values: definition.values.slice(),
      default: definition.default,
    };
  });
  const variants = {};
  Object.keys(entry.manifest.section_variants).sort().forEach((key) => {
    variants[key] = entry.manifest.section_variants[key].slice();
  });
  return {
    theme_id: entry.manifest.theme_id,
    version: entry.manifest.version,
    renderer_key: entry.manifest.renderer_key,
    contract_version: entry.manifest.contract_version,
    tokens: schema,
    default_tokens: defaultTokens(entry),
    section_variants: variants,
    accessibility: clone(entry.manifest.accessibility),
    performance: clone(entry.manifest.performance),
  };
}

function catalogFromReleases(records) {
  const releases = Array.isArray(records) ? records : [];
  const themes = [];
  releases.forEach((record) => {
    const entry = registryEntry(recordString(record, "theme_id"), recordString(record, "version"));
    if (!entry) return;
    try {
      assertReleaseForSelection(record, {
        theme_id: entry.manifest.theme_id,
        version: entry.manifest.version,
        tokens: {},
      }, { mode: "select" });
      themes.push(publicManifest(entry));
    } catch (_) {}
  });
  themes.sort((first, second) => keyFor(first.theme_id, first.version).localeCompare(keyFor(second.theme_id, second.version)));
  return themes;
}

function manifestHashMaterial(entry) {
  return canonicalJson(entry.manifest);
}

function tokenSchemaHashMaterial(entry) {
  return canonicalJson(entry.manifest.token_schema);
}

module.exports = {
  BLACK_GOLD_MANIFEST,
  BLACK_GOLD_MANIFEST_SHA256,
  BLACK_GOLD_TOKEN_SCHEMA,
  BLACK_GOLD_TOKEN_SCHEMA_SHA256,
  EDITABLE_RELEASE_STATUSES,
  PLATFORM_COLOR_VALUES,
  PUBLIC_RELEASE_STATUSES,
  PromoThemeError,
  ROLLBACK_RELEASE_STATUSES,
  SAFE_FALLBACK_KEY,
  SELECTABLE_RELEASE_STATUSES,
  SEMVER_PATTERN,
  SHA256_PATTERN,
  THEME_CATALOG_CONTRACT,
  THEME_CATALOG_READ_CONTRACT,
  THEME_CONTRACT_VERSION,
  THEME_ID_PATTERN,
  THEME_REGISTRY,
  THEME_RELEASE_RESPONSE_CONTRACT,
  THEME_RELEASE_UPDATE_CONTRACT,
  assertAccessibleCombination,
  assertApprovedCombination,
  assertReleaseIntegrity,
  assertReleaseForSelection,
  assertSectionVariant,
  canonicalJson,
  catalogFromReleases,
  contrastRatio,
  defaultTokens,
  keyFor,
  manifestHashMaterial,
  publicManifest,
  recordString,
  registryEntry,
  resolveEffectiveSelection,
  resolveRollbackSelection,
  safeFallbackSelection,
  tokenSchemaHashMaterial,
  validateOverrides,
  validateThemeSelection,
};
