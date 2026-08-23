/// <reference path="../pb_data/types.d.ts" />

"use strict";

const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);
const i18n = typeof __hooks === "undefined"
  ? require("./pz_promo_i18n_lib.js")
  : require(`${__hooks}/pz_promo_i18n_lib.js`);

function safeHeader(value, max) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return "";
  return text;
}

function headerValue(info, name, max) {
  const headers = info && info.headers || {};
  const normalized = String(name || "").toLowerCase().replace(/-/g, "_");
  try {
    if (typeof headers.get === "function") {
      return safeHeader(
        headers.get(name) || headers.get(String(name).toLowerCase()) || headers.get(normalized),
        max,
      );
    }
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => (
    String(candidate).toLowerCase().replace(/-/g, "_") === normalized
  ));
  return safeHeader(key ? headers[key] : "", max);
}

function localePreferenceFromCookie(value) {
  const raw = safeHeader(value, 2048);
  if (!raw) return "";
  const matches = raw.split(";").map((part) => part.trim()).filter((part) => (
    part.startsWith(`${i18n.LOCALE_PREFERENCE_COOKIE}=`)
  ));
  if (matches.length !== 1) return "";
  const encoded = matches[0].slice(i18n.LOCALE_PREFERENCE_COOKIE.length + 1);
  if (!encoded || encoded.length > 80) return "";
  try { return decodeURIComponent(encoded); } catch (_) { return ""; }
}

function setPublicHeaders(e, localized, neutral) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    if (localized && localized.locale) headers.set("Content-Language", localized.locale.effective);
    if (neutral) headers.set("Vary", "Accept-Language, Cookie");
  } catch (_) {}
}

function setLocalePreference(e, locale) {
  try {
    e.response.header().set(
      "Set-Cookie",
      `${i18n.LOCALE_PREFERENCE_COOKIE}=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`,
    );
  } catch (_) {}
}

function requestInfo(e) {
  const info = e.requestInfo();
  if (!info || !pubcfgApi.exactPayload(info.query || {}, [])) {
    const error = new Error("invalid_payload");
    error.code = "invalid_payload";
    error.status = 400;
    throw error;
  }
  return info;
}

function resolveLocalizedProjection(app, publicSlug, signals) {
  const settings = signals || {};
  const base = pubcfgApi.resolvePublicProjection(app, publicSlug);
  const negotiation = i18n.negotiateLocale({
    published: base.locales.published,
    defaultLocale: base.locales.default,
    ...(settings.explicitLocale === undefined ? {} : { explicitLocale: settings.explicitLocale }),
    preferenceLocale: settings.preferenceLocale,
    acceptLanguage: settings.acceptLanguage,
  });
  return i18n.localizePublicProjection(base, negotiation);
}

function handleLocalizedProjection(e, explicit) {
  let info;
  try {
    info = requestInfo(e);
  } catch (_) {
    setPublicHeaders(e, null, !explicit);
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  try {
    const publicSlug = safeHeader(e.request.pathValue("publicSlug"), 80);
    const explicitLocale = explicit ? safeHeader(e.request.pathValue("locale"), 80) : undefined;
    const localized = resolveLocalizedProjection(e.app, publicSlug, {
      ...(explicit ? { explicitLocale } : {}),
      preferenceLocale: explicit ? "" : localePreferenceFromCookie(headerValue(info, "Cookie", 2048)),
      acceptLanguage: explicit ? "" : headerValue(info, "Accept-Language", 512),
    });
    setPublicHeaders(e, localized, !explicit);
    if (explicit) setLocalePreference(e, localized.locale.effective);
    return e.json(200, localized);
  } catch (_) {
    setPublicHeaders(e, null, !explicit);
    return e.json(404, { ok: false, error: "promo_public_unavailable" });
  }
}

function handleNeutralProjection(e) {
  return handleLocalizedProjection(e, false);
}

function handleExplicitProjection(e) {
  return handleLocalizedProjection(e, true);
}

module.exports = {
  handleExplicitProjection,
  handleNeutralProjection,
  headerValue,
  localePreferenceFromCookie,
  resolveLocalizedProjection,
  safeHeader,
  setLocalePreference,
  setPublicHeaders,
};
