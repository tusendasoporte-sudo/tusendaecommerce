/// <reference path="../pb_data/types.d.ts" />

"use strict";

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);
const seo = typeof __hooks === "undefined"
  ? require("./pz_promo_seo_lib.js")
  : require(`${__hooks}/pz_promo_seo_lib.js`);

const PUBLIC_SHELL_CONTRACT = "promo.public.shell.v1";
const PUBLIC_ROUTE_CONTRACT = "promo.public.route.v1";
const PLATFORM_PATH_PREFIX = "/promo";
const ROUTE_ACTIONS = Object.freeze(["serve", "redirect"]);
const ROUTE_SOURCES = Object.freeze(["platform", "custom", "commerce-bridge"]);

class PromoShellError extends Error {
  constructor(code, status) {
    super(code || "promo_shell_unavailable");
    this.name = "PromoShellError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 503;
  }
}

function fail(code, status) {
  throw new PromoShellError(code, status);
}

function publicSlug(value) {
  try {
    const normalized = data.assertPublicSlug(value);
    if (normalized !== value) fail("promo_shell_unavailable", 503);
    return normalized;
  } catch (error) {
    if (error instanceof PromoShellError) throw error;
    fail("promo_shell_unavailable", 503);
  }
}

function canonicalLocale(value) {
  try {
    const normalized = data.canonicalLocale(value);
    if (normalized !== value) fail("promo_shell_unavailable", 503);
    return normalized;
  } catch (error) {
    if (error instanceof PromoShellError) throw error;
    fail("promo_shell_unavailable", 503);
  }
}

function platformPath(slugValue, localeValue) {
  const slug = publicSlug(slugValue);
  if (localeValue === undefined || localeValue === null || localeValue === "") {
    return `${PLATFORM_PATH_PREFIX}/${slug}`;
  }
  return `${PLATFORM_PATH_PREFIX}/${slug}/${canonicalLocale(localeValue)}`;
}

function customPath(localeValue) {
  if (localeValue === undefined || localeValue === null || localeValue === "") return "/";
  return `/${canonicalLocale(localeValue)}`;
}

function httpsLocation(hostname, path) {
  const host = String(hostname || "").trim();
  const targetPath = String(path || "");
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(host)
    || host.length > 253 || host.includes("..") || !targetPath.startsWith("/")
    || targetPath.startsWith("//") || /[?#\\\u0000-\u001f\u007f]/.test(targetPath)) {
    fail("promo_shell_unavailable", 503);
  }
  return `https://${host}${targetPath}`;
}

function localizedProfile(localized, source) {
  if (!localized || localized.ok !== true || localized.contract !== "promo.public.localized.v1"
    || !localized.site || !localized.locale || !localized.selector
    || !Array.isArray(localized.selector.options)) {
    fail("promo_shell_unavailable", 503);
  }
  const slug = publicSlug(localized.site.public_slug);
  const effective = canonicalLocale(localized.locale.effective);
  if (!ROUTE_SOURCES.includes(source) || source === "commerce-bridge") {
    fail("promo_shell_unavailable", 503);
  }
  const options = localized.selector.options.map((option) => {
    const locale = canonicalLocale(option && option.locale);
    return {
      locale,
      label: option.label,
      aria_label: option.aria_label,
      href: source === "platform" ? platformPath(slug, locale) : customPath(locale),
      active: option.active === true,
    };
  });
  if (options.filter((option) => option.active).length !== 1
    || !options.some((option) => option.active && option.locale === effective)) {
    fail("promo_shell_unavailable", 503);
  }
  return {
    ...localized,
    locale: {
      ...localized.locale,
      canonical_path: source === "platform" ? platformPath(slug, effective) : customPath(effective),
    },
    selector: { ...localized.selector, options },
  };
}

function shellResponse(localized, route) {
  const settings = route || {};
  const source = String(settings.source || "");
  const action = String(settings.action || "");
  if (!ROUTE_SOURCES.includes(source) || source === "commerce-bridge"
    || !ROUTE_ACTIONS.includes(action)) fail("promo_shell_unavailable", 503);
  const profile = localizedProfile(localized, source);
  const projectedRoute = { source, action };
  if (action === "redirect") {
    projectedRoute.location = source === "platform"
      ? platformPath(profile.site.public_slug, profile.locale.effective)
      : httpsLocation(settings.canonicalHostname, customPath(profile.locale.effective));
    return { ok: true, contract: PUBLIC_SHELL_CONTRACT, route: projectedRoute };
  }
  return {
    ok: true,
    contract: PUBLIC_SHELL_CONTRACT,
    route: projectedRoute,
    profile,
    seo: seo.pageSeo(profile, settings),
  };
}

function routeRedirect(location) {
  const value = String(location || "");
  const safeRelative = /^\/promo\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[A-Za-z0-9-]{2,80})?$/.test(value);
  let safeHttps = false;
  if (!safeRelative) {
    const match = value.match(/^https:\/\/([a-z0-9.-]{3,253})(\/[A-Za-z0-9-]{0,80})?$/);
    safeHttps = Boolean(match && !match[1].includes("..") && !value.includes("?") && !value.includes("#"));
  }
  if (!safeRelative && !safeHttps) fail("promo_shell_unavailable", 503);
  return {
    ok: true,
    contract: PUBLIC_ROUTE_CONTRACT,
    route: { source: "commerce-bridge", action: "redirect", location: value },
  };
}

module.exports = {
  PLATFORM_PATH_PREFIX,
  PUBLIC_ROUTE_CONTRACT,
  PUBLIC_SHELL_CONTRACT,
  PromoShellError,
  ROUTE_ACTIONS,
  ROUTE_SOURCES,
  customPath,
  httpsLocation,
  localizedProfile,
  platformPath,
  routeRedirect,
  shellResponse,
};
