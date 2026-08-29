/// <reference path="../pb_data/types.d.ts" />

"use strict";

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const domain = typeof __hooks === "undefined"
  ? require("./pz_promo_domain_lib.js")
  : require(`${__hooks}/pz_promo_domain_lib.js`);
const i18n = typeof __hooks === "undefined"
  ? require("./pz_promo_i18n_lib.js")
  : require(`${__hooks}/pz_promo_i18n_lib.js`);
const i18nApi = typeof __hooks === "undefined"
  ? require("./pz_promo_i18n_api_lib.js")
  : require(`${__hooks}/pz_promo_i18n_api_lib.js`);
const pubcfgApi = typeof __hooks === "undefined"
  ? require("./pz_promo_pubcfg_api_lib.js")
  : require(`${__hooks}/pz_promo_pubcfg_api_lib.js`);
const shell = typeof __hooks === "undefined"
  ? require("./pz_promo_shell_lib.js")
  : require(`${__hooks}/pz_promo_shell_lib.js`);
const promoContact = typeof __hooks === "undefined"
  ? require("./pz_promo_contact_lib.js")
  : require(`${__hooks}/pz_promo_contact_lib.js`);
const promoFooter = typeof __hooks === "undefined"
  ? require("./pz_promo_footer_lib.js")
  : require(`${__hooks}/pz_promo_footer_lib.js`);
const promoReviews = typeof __hooks === "undefined"
  ? require("./pz_promo_reviews_api_lib.js")
  : require(`${__hooks}/pz_promo_reviews_api_lib.js`);
const promoLandingQr = typeof __hooks === "undefined"
  ? require("./pz_promo_landing_qr_lib.js")
  : require(`${__hooks}/pz_promo_landing_qr_lib.js`);
const promoPerformance = typeof __hooks === "undefined"
  ? require("./pz_promo_performance_lib.js")
  : require(`${__hooks}/pz_promo_performance_lib.js`);

const CACHE_IDENTITY_PROPERTY = "__promoPerformanceCacheIdentity";

function codedError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function recordId(record) {
  return String(record && (record.id || (typeof record.getId === "function" ? record.getId() : "")) || "");
}

function recordString(record, key) {
  if (!record) return "";
  try {
    const value = typeof record.getString === "function" ? record.getString(key) : record[key];
    return String(value || "").trim();
  } catch (_) { return ""; }
}

function relationId(record, key) {
  if (!record) return "";
  try {
    const value = typeof record.getString === "function" ? record.getString(key) : record[key];
    if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "") : "";
    return String(value || "");
  } catch (_) { return ""; }
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findExact(app, collection, filter, params) {
  let rows = [];
  try {
    rows = Array.from(app.findRecordsByFilter(collection, filter, "id", 2, 0, params || {}) || []);
  } catch (_) { rows = []; }
  return rows.length === 1 ? rows[0] : null;
}

function findExactStrict(app, collection, filter, params) {
  const rows = Array.from(app.findRecordsByFilter(collection, filter, "id", 2, 0, params || {}) || []);
  if (rows.length > 1) throw codedError("promo_public_unavailable", 503);
  return rows.length === 1 ? rows[0] : null;
}

function exactRequestInfo(e) {
  const info = e.requestInfo();
  if (!info || !pubcfgApi.exactPayload(info.query || {}, [])) {
    throw codedError("invalid_payload", 400);
  }
  return info;
}

function localeSignals(info, explicitLocale) {
  const explicit = explicitLocale !== undefined;
  return {
    ...(explicit ? { explicitLocale } : {}),
    preferenceLocale: "",
    acceptLanguage: "",
  };
}

function authoritativeRequestHeaders(e, info) {
  const host = String(e && e.request && e.request.host || "").trim();
  if (!host) throw codedError("promo_host_unavailable", 421);
  return { ...(info && info.headers || {}), Host: host };
}

function localizeProjection(projection, signals, options) {
  const published = projection && projection.locales && Array.isArray(projection.locales.published)
    ? projection.locales.published : [];
  const publicProjection = published.includes("es") && projection.locales.default !== "es"
    ? { ...projection, locales: { ...projection.locales, default: "es" } }
    : projection;
  const negotiation = i18n.negotiateLocale({
    published: publicProjection.locales.published,
    defaultLocale: publicProjection.locales.default,
    ...(signals.explicitLocale === undefined ? {} : { explicitLocale: signals.explicitLocale }),
    preferenceLocale: signals.preferenceLocale,
    acceptLanguage: signals.acceptLanguage,
  });
  return i18n.localizePublicProjection(publicProjection, negotiation, {
    languageSelectorEnabled: options && options.languageSelectorEnabled === true,
  });
}

function siteByPublicSlug(app, publicSlug) {
  try {
    if (data.assertPublicSlug(publicSlug) !== publicSlug) throw new Error("invalid");
  } catch (_) { throw codedError("promo_public_unavailable", 404); }
  const site = findExact(app, "promo_sites", "public_slug = {:slug}", { slug: publicSlug });
  if (!site || recordString(site, "public_slug") !== publicSlug) {
    throw codedError("promo_public_unavailable", 404);
  }
  return site;
}

function publishedPlatformContext(app, publicSlug) {
  const site = siteByPublicSlug(app, publicSlug);
  const siteId = recordId(site);
  const slot = findExact(app, "promo_publication_slots", "site = {:site}", { site: siteId });
  const mode = recordString(slot, "canonical_mode");
  if (mode === "platform") {
    const published = pubcfgApi.resolvePublicProjectionForSite(app, site, { canonicalMode: "platform" });
    return { source: "platform", action: "serve", canonicalHostname: "", ...published };
  }
  if (mode !== "custom") throw codedError("promo_public_unavailable", 404);
  const primary = findRecord(app, "promo_domain_bindings", relationId(slot, "primary_binding"));
  const primaryHost = recordString(primary, "hostname_ascii");
  if (!primaryHost) throw codedError("promo_public_unavailable", 404);
  let hostContext;
  try {
    hostContext = domain.resolveHostContext(app, { Host: primaryHost }, { trustedProxy: false });
  } catch (_) { throw codedError("promo_public_unavailable", 404); }
  if (recordId(hostContext.site) !== siteId || hostContext.binding_role !== "primary"
    || hostContext.canonical_hostname !== primaryHost) {
    throw codedError("promo_public_unavailable", 404);
  }
  return {
    source: "custom",
    action: "redirect",
    canonicalHostname: primaryHost,
    projection: hostContext.projection,
  };
}

function resolvePlatformShell(app, publicSlug, signals) {
  const context = publishedPlatformContext(app, publicSlug);
  const localized = promoLandingQr.attachPublicLandingQr(
    app,
    promoReviews.attachPublicRating(
      app,
      promoContact.attachPublicContact(
        promoFooter.attachPublicFooter(
          localizeProjection(context.projection, signals || {}, {
            languageSelectorEnabled: context.languageSelectorEnabled,
          }),
        ),
        context,
      ),
      context,
    ),
    context,
  );
  const exactLocale = signals && Object.prototype.hasOwnProperty.call(signals, "explicitLocale")
    && signals.explicitLocale === localized.locale.effective;
  const result = shell.shellResponse(localized, {
    ...context,
    action: context.action === "redirect" || !exactLocale ? "redirect" : "serve",
  });
  attachCacheIdentity(result, context, promoPerformance.PLATFORM_CANONICAL_HOST);
  return result;
}

function resolveHostShell(app, headers, signals) {
  let context;
  try {
    context = domain.resolveHostContext(app, headers, { trustedProxy: false });
  } catch (_) { throw codedError("promo_host_unavailable", 421); }
  let localized;
  try {
    localized = promoLandingQr.attachPublicLandingQr(
      app,
      promoReviews.attachPublicRating(
        app,
        promoContact.attachPublicContact(
          promoFooter.attachPublicFooter(
            localizeProjection(context.projection, signals || {}, {
              languageSelectorEnabled: context.language_selector_enabled,
            }),
          ),
          context,
        ),
        context,
      ),
      context,
    );
  }
  catch (_) { throw codedError("promo_public_unavailable", 404); }
  const exactLocale = signals && Object.prototype.hasOwnProperty.call(signals, "explicitLocale")
    && signals.explicitLocale === localized.locale.effective;
  const result = shell.shellResponse(localized, {
    source: "custom",
    action: context.binding_role === "alias" || !exactLocale ? "redirect" : "serve",
    canonicalHostname: context.canonical_hostname,
  });
  attachCacheIdentity(result, context, context.canonical_hostname);
  return result;
}

function attachCacheIdentity(result, context, canonicalHost) {
  if (!result || !result.route || result.route.action !== "serve" || !result.profile || !context) return result;
  try {
    const identity = promoPerformance.generationCacheIdentity({
      canonicalHost,
      tenantId: recordId(context.site),
      generation: Number(context.generation),
      locale: result.profile.locale && result.profile.locale.effective,
      themeId: result.profile.theme && result.profile.theme.theme_id,
      themeVersion: result.profile.theme && result.profile.theme.version,
      publicPath: result.profile.locale && result.profile.locale.canonical_path,
      representation: promoPerformance.HTML_REPRESENTATION,
    });
    Object.defineProperty(result, CACHE_IDENTITY_PROPERTY, {
      configurable: false,
      enumerable: false,
      value: identity,
      writable: false,
    });
  } catch (_) {
    // Fail closed for caching: the public response remains no-store and uncached.
  }
  return result;
}

function cacheIdentity(result) {
  const identity = result && result[CACHE_IDENTITY_PROPERTY];
  return promoPerformance.isCacheIdentity(identity) ? identity : null;
}

function resolveCommerceBridge(app, storeSlug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug)) {
    throw codedError("promo_public_unavailable", 404);
  }
  const store = findExactStrict(app, "stores", "slug = {:slug}", { slug: storeSlug });
  const storeId = recordId(store);
  if (!store || recordString(store, "slug") !== storeSlug) {
    throw codedError("promo_public_unavailable", 404);
  }
  const site = findExactStrict(app, "promo_sites", "store = {:store}", { store: storeId });
  if (!site) throw codedError("promo_public_unavailable", 404);
  if (recordString(store, "status") !== "active" || recordString(site, "status") !== "active") {
    throw codedError("promo_public_unavailable", 503);
  }
  const publicSlug = recordString(site, "public_slug");
  let context;
  try { context = publishedPlatformContext(app, publicSlug); }
  catch (_) { throw codedError("promo_public_unavailable", 503); }
  if (recordId(context.site || site) !== recordId(site)) throw codedError("promo_public_unavailable", 503);
  if (context.action === "redirect") {
    return shell.routeRedirect(shell.httpsLocation(context.canonicalHostname, shell.customPath("")));
  }
  return shell.routeRedirect(shell.platformPath(publicSlug));
}

function setHeaders(e, localized, neutral, hostScoped, identity) {
  i18nApi.setPublicHeaders(e, localized || null, neutral === true);
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (hostScoped) headers.set("Vary", neutral ? "Host, Accept-Language, Cookie" : "Host");
    if (promoPerformance.isCacheIdentity(identity)) {
      headers.set(promoPerformance.CACHE_CONTRACT_HEADER, identity.contract);
      headers.set(promoPerformance.CACHE_KEY_HEADER, identity.key);
    }
  } catch (_) {}
}

function handlePlatform(e, explicit) {
  let info;
  try { info = exactRequestInfo(e); }
  catch (_) {
    setHeaders(e, null, !explicit, false);
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  try {
    const slug = i18nApi.safeHeader(e.request.pathValue("publicSlug"), 80);
    const explicitLocale = explicit ? i18nApi.safeHeader(e.request.pathValue("locale"), 80) : undefined;
    const result = resolvePlatformShell(e.app, slug, localeSignals(info, explicitLocale));
    setHeaders(e, result.profile, !explicit, false, cacheIdentity(result));
    if (explicit && result.profile) i18nApi.setLocalePreference(e, result.profile.locale.effective);
    return e.json(200, result);
  } catch (_) {
    setHeaders(e, null, !explicit, false);
    return e.json(404, { ok: false, error: "promo_public_unavailable" });
  }
}

function handleHost(e, explicit) {
  let info;
  try { info = exactRequestInfo(e); }
  catch (_) {
    setHeaders(e, null, !explicit, true);
    return e.json(400, { ok: false, error: "invalid_payload" });
  }
  try {
    const explicitLocale = explicit ? i18nApi.safeHeader(e.request.pathValue("locale"), 80) : undefined;
    const result = resolveHostShell(
      e.app,
      authoritativeRequestHeaders(e, info),
      localeSignals(info, explicitLocale),
    );
    setHeaders(e, result.profile, !explicit, true, cacheIdentity(result));
    if (explicit && result.profile) i18nApi.setLocalePreference(e, result.profile.locale.effective);
    return e.json(200, result);
  } catch (error) {
    setHeaders(e, null, !explicit, true);
    const status = Number(error && error.status) === 404 ? 404 : 421;
    return e.json(status, { ok: false, error: status === 404 ? "promo_public_unavailable" : "promo_host_unavailable" });
  }
}

function handleCommerceBridge(e) {
  try {
    exactRequestInfo(e);
    const storeSlug = i18nApi.safeHeader(e.request.pathValue("storeSlug"), 80);
    const result = resolveCommerceBridge(e.app, storeSlug);
    setHeaders(e, null, true, false);
    return e.json(200, result);
  } catch (error) {
    setHeaders(e, null, true, false);
    const status = Number(error && error.status) === 404 ? 404 : 503;
    return e.json(status, { ok: false, error: "promo_public_unavailable" });
  }
}

module.exports = {
  attachCacheIdentity,
  cacheIdentity,
  exactRequestInfo,
  findExactStrict,
  handleCommerceBridge,
  handleHost,
  handlePlatform,
  localeSignals,
  localizeProjection,
  authoritativeRequestHeaders,
  publishedPlatformContext,
  resolveCommerceBridge,
  resolveHostShell,
  resolvePlatformShell,
  setHeaders,
};
