/// <reference path="../pb_data/types.d.ts" />

"use strict";

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const pubcfg = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_lib.js`);

const LOCALIZED_PUBLIC_CONTRACT = "promo.public.localized.v1";
const LOCALE_PREFERENCE_COOKIE = "pz_promo_locale";

const SYSTEM_MESSAGE_KEYS = Object.freeze([
  "a11y.contact_action",
  "a11y.language_selector",
  "a11y.main_content",
  "a11y.main_navigation",
  "a11y.skip_to_content",
  "contact.call",
  "contact.email",
  "contact.open_chat",
  "contact.request_estimate",
  "contact.send_message",
  "contact.unavailable",
  "contact.whatsapp",
  "error.locale_unavailable",
  "error.site_unavailable",
  "locale.current",
  "locale.option_aria",
  "navigation.contact",
  "navigation.gallery",
  "navigation.home",
  "navigation.owner",
  "navigation.services",
  "state.available",
  "state.loading",
  "state.unavailable",
]);

const SYSTEM_CATALOGS = Object.freeze({
  "promo.system.v1": Object.freeze({
    en: catalog("English", "ltr", {
      "a11y.contact_action": "Contact the business",
      "a11y.language_selector": "Language",
      "a11y.main_content": "Main content",
      "a11y.main_navigation": "Main navigation",
      "a11y.skip_to_content": "Skip to content",
      "contact.call": "Call",
      "contact.email": "Email",
      "contact.open_chat": "Open chat",
      "contact.request_estimate": "Request an estimate",
      "contact.send_message": "Send a message",
      "contact.unavailable": "Contact is currently unavailable",
      "contact.whatsapp": "Contact on WhatsApp",
      "error.locale_unavailable": "This language is unavailable",
      "error.site_unavailable": "This site is unavailable",
      "locale.current": "Current language",
      "locale.option_aria": "View this site in {language}",
      "navigation.contact": "Contact",
      "navigation.gallery": "Gallery",
      "navigation.home": "Home",
      "navigation.owner": "About",
      "navigation.services": "Services",
      "state.available": "Available",
      "state.loading": "Loading",
      "state.unavailable": "Unavailable",
    }),
    es: catalog("Español", "ltr", {
      "a11y.contact_action": "Contactar al negocio",
      "a11y.language_selector": "Idioma",
      "a11y.main_content": "Contenido principal",
      "a11y.main_navigation": "Navegación principal",
      "a11y.skip_to_content": "Saltar al contenido",
      "contact.call": "Llamar",
      "contact.email": "Enviar correo",
      "contact.open_chat": "Abrir chat",
      "contact.request_estimate": "Solicitar estimado",
      "contact.send_message": "Enviar mensaje",
      "contact.unavailable": "El contacto no está disponible en este momento",
      "contact.whatsapp": "Contactar por WhatsApp",
      "error.locale_unavailable": "Este idioma no está disponible",
      "error.site_unavailable": "Este sitio no está disponible",
      "locale.current": "Idioma actual",
      "locale.option_aria": "Ver este sitio en {language}",
      "navigation.contact": "Contacto",
      "navigation.gallery": "Galería",
      "navigation.home": "Inicio",
      "navigation.owner": "Nosotros",
      "navigation.services": "Servicios",
      "state.available": "Disponible",
      "state.loading": "Cargando",
      "state.unavailable": "No disponible",
    }),
  }),
});

class PromoI18nError extends Error {
  constructor(code, status) {
    super(code || "promo_i18n_unavailable");
    this.name = "PromoI18nError";
    this.code = code || "promo_i18n_unavailable";
    this.status = Number.isInteger(status) ? status : 503;
  }
}

function fail(code, status) {
  throw new PromoI18nError(code, status);
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code, 503);
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code, 503);
  }
  return value;
}

function catalog(nativeName, direction, messages) {
  if (typeof nativeName !== "string" || !nativeName.trim() || nativeName.length > 80
    || !["ltr", "rtl"].includes(direction)) {
    throw new Error("invalid_promo_system_catalog");
  }
  const normalized = exactKeys(messages, SYSTEM_MESSAGE_KEYS, "invalid_promo_system_catalog");
  for (const [key, message] of Object.entries(normalized)) {
    if (typeof message !== "string" || !message.trim() || message.length > 240
      || /[\u0000-\u001f]/.test(message)) {
      throw new Error(`invalid_promo_system_message:${key}`);
    }
  }
  return Object.freeze({
    native_name: nativeName,
    direction,
    messages: Object.freeze({ ...normalized }),
  });
}

function canonicalLocale(value) {
  try { return data.canonicalLocale(value); }
  catch (_) { fail("invalid_promo_locale", 404); }
}

function validatePublishedLocales(locales, defaultLocale) {
  if (!Array.isArray(locales) || !locales.length || locales.length > data.HARD_LIMITS.max_locales) {
    fail("promo_i18n_unavailable", 503);
  }
  const normalized = locales.map((locale) => canonicalLocale(locale));
  if (new Set(normalized).size !== normalized.length
    || normalized.some((locale, index) => locale !== locales[index])
    || normalized.slice().sort().some((locale, index) => locale !== normalized[index])
    || canonicalLocale(defaultLocale) !== defaultLocale
    || !normalized.includes(defaultLocale)) {
    fail("promo_i18n_unavailable", 503);
  }
  return normalized;
}

function parseAcceptLanguage(value) {
  const input = typeof value === "string" ? value.trim().slice(0, 512) : "";
  if (!input) return [];
  const preferences = [];
  input.split(",").slice(0, 20).forEach((part, order) => {
    const match = part.match(/^\s*([A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*|\*)\s*(?:;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/);
    if (!match || match[1] === "*") return;
    const quality = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isFinite(quality) || quality <= 0 || quality > 1) return;
    try {
      preferences.push({ locale: data.canonicalLocale(match[1]), quality, order });
    } catch (_) {}
  });
  preferences.sort((left, right) => right.quality - left.quality || left.order - right.order);
  const seen = new Set();
  return preferences.filter((preference) => {
    if (seen.has(preference.locale)) return false;
    seen.add(preference.locale);
    return true;
  });
}

function languageOf(locale) {
  return String(locale || "").split("-")[0];
}

function matchAcceptLanguage(preferences, published, defaultLocale) {
  for (const preference of preferences) {
    if (published.includes(preference.locale)) return preference.locale;
    const language = languageOf(preference.locale);
    const languageMatches = published.filter((locale) => languageOf(locale) === language);
    if (!languageMatches.length) continue;
    if (languageMatches.includes(language)) return language;
    if (languageMatches.includes(defaultLocale)) return defaultLocale;
    return languageMatches[0];
  }
  return "";
}

function negotiateLocale(input) {
  const settings = input || {};
  const published = validatePublishedLocales(settings.published, settings.defaultLocale);
  if (settings.explicitLocale !== undefined && settings.explicitLocale !== null) {
    const effective = canonicalLocale(settings.explicitLocale);
    if (!published.includes(effective)) fail("promo_locale_not_published", 404);
    return Object.freeze({ effective, source: "url" });
  }
  if (settings.preferenceLocale) {
    try {
      const preference = data.canonicalLocale(settings.preferenceLocale);
      if (published.includes(preference)) return Object.freeze({ effective: preference, source: "preference" });
    } catch (_) {}
  }
  const accepted = matchAcceptLanguage(
    parseAcceptLanguage(settings.acceptLanguage),
    published,
    settings.defaultLocale,
  );
  if (accepted) return Object.freeze({ effective: accepted, source: "accept-language" });
  return Object.freeze({ effective: settings.defaultLocale, source: "default" });
}

function resolveSystemCatalog(version, locale) {
  const catalogs = SYSTEM_CATALOGS[version];
  const resolved = catalogs && catalogs[locale];
  if (!resolved) fail("promo_system_locale_unavailable", 503);
  return resolved;
}

function formatMessage(message, values) {
  const replacements = values || {};
  const placeholders = String(message || "").match(/\{[a-z_]+\}/g) || [];
  const expected = Array.from(new Set(placeholders.map((item) => item.slice(1, -1)))).sort();
  const actual = Object.keys(replacements).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    fail("promo_i18n_unavailable", 503);
  }
  return String(message).replace(/\{([a-z_]+)\}/g, (_, key) => String(replacements[key]));
}

function localizedPath(publicSlug, locale) {
  try {
    if (data.assertPublicSlug(publicSlug) !== publicSlug) fail("promo_i18n_unavailable", 503);
  } catch (_) { fail("promo_i18n_unavailable", 503); }
  const canonical = canonicalLocale(locale);
  return `/api/pz/promo/public/v1/sites/${publicSlug}/locales/${canonical}`;
}

function localizePublicProjection(projectionValue, negotiation) {
  const projection = pubcfg.normalizeJson(projectionValue);
  if (!projection || projection.contract !== pubcfg.PUBLIC_CONTRACT || projection.ok !== true) {
    fail("promo_i18n_unavailable", 503);
  }
  exactKeys(projection.locales, ["default", "published"], "promo_i18n_unavailable");
  const published = validatePublishedLocales(projection.locales.published, projection.locales.default);
  if (!negotiation || !published.includes(negotiation.effective)
    || !["url", "preference", "accept-language", "default"].includes(negotiation.source)) {
    fail("promo_i18n_unavailable", 503);
  }
  const contentByLocale = exactKeys(
    projection.content_by_locale,
    published,
    "promo_i18n_unavailable",
  );
  const effectiveCatalog = resolveSystemCatalog(projection.system_catalog_version, negotiation.effective);
  const catalogsByLocale = new Map(published.map((locale) => [
    locale,
    resolveSystemCatalog(projection.system_catalog_version, locale),
  ]));
  const siteSlug = projection.site && projection.site.public_slug;
  const options = published.map((locale) => {
    const localeCatalog = catalogsByLocale.get(locale);
    return {
      locale,
      label: localeCatalog.native_name,
      aria_label: formatMessage(effectiveCatalog.messages["locale.option_aria"], {
        language: localeCatalog.native_name,
      }),
      href: localizedPath(siteSlug, locale),
      active: locale === negotiation.effective,
    };
  });
  return {
    ok: true,
    contract: LOCALIZED_PUBLIC_CONTRACT,
    site: pubcfg.normalizeJson(projection.site),
    system: {
      catalog_version: projection.system_catalog_version,
      messages: pubcfg.normalizeJson(effectiveCatalog.messages),
    },
    locale: {
      effective: negotiation.effective,
      default: projection.locales.default,
      source: negotiation.source,
      lang: negotiation.effective,
      direction: effectiveCatalog.direction,
      canonical_path: localizedPath(siteSlug, negotiation.effective),
    },
    selector: {
      label: effectiveCatalog.messages["a11y.language_selector"],
      options,
    },
    theme: pubcfg.normalizeJson(projection.theme),
    section_order: projection.section_order.slice(),
    sections: pubcfg.normalizeJson(projection.sections),
    media: pubcfg.normalizeJson(projection.media),
    contact: pubcfg.normalizeJson(projection.contact),
    content: pubcfg.normalizeJson(contentByLocale[negotiation.effective]),
    adapters: pubcfg.normalizeJson(projection.adapters),
  };
}

module.exports = {
  LOCALIZED_PUBLIC_CONTRACT,
  LOCALE_PREFERENCE_COOKIE,
  PromoI18nError,
  SYSTEM_CATALOGS,
  SYSTEM_MESSAGE_KEYS,
  formatMessage,
  localizePublicProjection,
  localizedPath,
  matchAcceptLanguage,
  negotiateLocale,
  parseAcceptLanguage,
  resolveSystemCatalog,
  validatePublishedLocales,
};
