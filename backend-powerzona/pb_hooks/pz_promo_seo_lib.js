/// <reference path="../pb_data/types.d.ts" />

"use strict";

const data = typeof __hooks === "undefined"
  ? require("./pz_promo_data_lib.js")
  : require(`${__hooks}/pz_promo_data_lib.js`);

const PAGE_SEO_CONTRACT = "promo.public.seo.v1";
const RESOURCE_CONTRACT = "promo.public.seo.resource.v1";
const PLATFORM_ORIGIN = "https://tusenda84.com";
const RESOURCE_TYPES = Object.freeze(["robots", "sitemap"]);
const SOURCE_TYPES = Object.freeze(["platform", "custom"]);

class PromoSeoError extends Error {
  constructor(code, status) {
    super(code || "promo_seo_unavailable");
    this.name = "PromoSeoError";
    this.code = this.message;
    this.status = Number.isInteger(status) ? status : 503;
  }
}

function fail(code, status) {
  throw new PromoSeoError(code, status);
}

function safeText(value, maximum, required) {
  const text = typeof value === "string" ? value : "";
  if (text.length > maximum || /[\u0000-\u001f\u007f]/.test(text)
    || (required === true && !text.trim())) fail("promo_seo_unavailable", 503);
  return text;
}

function publicSlug(value) {
  try {
    const normalized = data.assertPublicSlug(value);
    if (normalized !== value) fail();
    return normalized;
  } catch (error) {
    if (error instanceof PromoSeoError) throw error;
    fail();
  }
}

function canonicalLocale(value) {
  try {
    const normalized = data.canonicalLocale(value);
    if (normalized !== value) fail();
    return normalized;
  } catch (error) {
    if (error instanceof PromoSeoError) throw error;
    fail();
  }
}

function canonicalHostname(value) {
  const hostname = String(value || "").trim();
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(hostname)
    || hostname.length > 253 || hostname.includes("..") || !hostname.includes(".")) fail();
  return hostname;
}

function canonicalOrigin(sourceValue, hostnameValue) {
  const source = String(sourceValue || "");
  if (!SOURCE_TYPES.includes(source)) fail();
  return source === "platform" ? PLATFORM_ORIGIN : `https://${canonicalHostname(hostnameValue)}`;
}

function localizedPath(source, slug, locale) {
  return source === "platform" ? `/promo/${slug}/${locale}` : `/${locale}`;
}

function resourcePath(source, slug, resource) {
  if (!RESOURCE_TYPES.includes(resource)) fail();
  const filename = resource === "sitemap" ? "sitemap.xml" : "robots.txt";
  return source === "platform" ? `/promo/${slug}/${filename}` : `/${filename}`;
}

function absoluteUrl(origin, path) {
  if (!/^https:\/\/[a-z0-9.-]+$/.test(origin) || !path.startsWith("/") || path.startsWith("//")
    || /[?#\\\u0000-\u001f\u007f]/.test(path)) fail();
  return `${origin}${path}`;
}

function projectionLocales(projection) {
  const slug = publicSlug(projection && projection.site && projection.site.public_slug);
  const localeState = projection && projection.locales;
  if (!localeState || !Array.isArray(localeState.published) || !localeState.published.length
    || localeState.published.length > 10) fail();
  const locales = localeState.published.map(canonicalLocale);
  const defaultLocale = canonicalLocale(localeState.default);
  if (new Set(locales).size !== locales.length || !locales.includes(defaultLocale)) fail();
  return { slug, locales, defaultLocale };
}

function identityFromProjection(projection, settings) {
  const source = String(settings && settings.source || "");
  const origin = canonicalOrigin(source, settings && settings.canonicalHostname);
  const { slug, locales, defaultLocale } = projectionLocales(projection);
  const localized = locales.map((locale) => ({
    locale,
    url: absoluteUrl(origin, localizedPath(source, slug, locale)),
  }));
  const defaultEntry = localized.find((entry) => entry.locale === defaultLocale);
  if (!defaultEntry) fail();
  return {
    source,
    origin,
    sitemap_url: absoluteUrl(origin, resourcePath(source, slug, "sitemap")),
    x_default: defaultEntry.url,
    locales: localized,
  };
}

function approvedSocialImage(localized, slug) {
  const media = Array.isArray(localized && localized.media) ? localized.media : [];
  const ranked = [...media].sort((left, right) => {
    const rank = (item) => item && item.purpose === "logo" ? 0
      : item && item.purpose === "social" ? 1
        : item && item.purpose === "hero" ? 2 : 3;
    return rank(left) - rank(right);
  });
  for (const item of ranked) {
    if (!item || !["logo", "social", "hero"].includes(item.purpose)) continue;
    const delivery = item.kind === "video" ? item.delivery && item.delivery.poster : item.delivery;
    const path = delivery && String(delivery.src || "");
    const expectedPrefix = `/api/pz/promo/public/v1/sites/${slug}/media/`;
    if (!path.startsWith(expectedPrefix) || !path.endsWith(".webp") || /[?#\\\u0000-\u001f\u007f]/.test(path)) continue;
    const width = Number(item.width);
    const height = Number(item.height);
    const accessibility = item.accessibility || {};
    if (!Number.isSafeInteger(width) || width < 1 || width > 4096
      || !Number.isSafeInteger(height) || height < 1 || height > 4096
      || accessibility.decorative === true) continue;
    const alt = safeText(accessibility.alt, 300, true);
    return {
      url: absoluteUrl(PLATFORM_ORIGIN, path),
      width,
      height,
      alt,
      type: "image/webp",
    };
  }
  return null;
}

function pageSeo(localized, settings) {
  if (!localized || localized.ok !== true || localized.contract !== "promo.public.localized.v1") fail();
  const identity = identityFromProjection({ site: localized.site, locales: {
    default: localized.locale && localized.locale.default,
    published: Array.isArray(localized.selector && localized.selector.options)
      ? localized.selector.options.map((option) => option && option.locale)
      : [],
  } }, settings || {});
  const effective = canonicalLocale(localized.locale && localized.locale.effective);
  const canonical = identity.locales.find((entry) => entry.locale === effective);
  const content = localized.content || {};
  const seo = content.seo || {};
  const publicIdentity = content.identity || {};
  const title = safeText(seo.title, 70, true);
  const description = safeText(seo.description, 170, true);
  const socialTitle = safeText(seo.social_title || title, 70, true);
  const socialDescription = safeText(seo.social_description || description, 170, true);
  const siteName = safeText(publicIdentity.name, 140, true);
  if (!canonical) fail();
  const image = approvedSocialImage(localized, publicSlug(localized.site.public_slug));
  return {
    contract: PAGE_SEO_CONTRACT,
    canonical_url: canonical.url,
    sitemap_url: identity.sitemap_url,
    alternates: identity.locales,
    x_default: identity.x_default,
    open_graph: {
      type: "website",
      url: canonical.url,
      title: socialTitle,
      description: socialDescription,
      site_name: siteName,
      locale: effective,
      alternate_locales: identity.locales.filter((entry) => entry.locale !== effective).map((entry) => entry.locale),
      image,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: socialTitle,
      description: socialDescription,
      image: image ? image.url : "",
      image_alt: image ? image.alt : "",
    },
  };
}

function resourceEnvelope(projection, settings) {
  const resource = String(settings && settings.resource || "");
  if (!RESOURCE_TYPES.includes(resource)) fail();
  const identity = identityFromProjection(projection, settings || {});
  return {
    ok: true,
    contract: RESOURCE_CONTRACT,
    resource,
    route: { source: identity.source, action: "serve" },
    identity,
  };
}

function resourceRedirect(resourceValue, hostnameValue) {
  const resource = String(resourceValue || "");
  if (!RESOURCE_TYPES.includes(resource)) fail();
  const origin = canonicalOrigin("custom", hostnameValue);
  const filename = resource === "sitemap" ? "/sitemap.xml" : "/robots.txt";
  return {
    ok: true,
    contract: RESOURCE_CONTRACT,
    resource,
    route: { source: "custom", action: "redirect", location: absoluteUrl(origin, filename) },
  };
}

module.exports = {
  PAGE_SEO_CONTRACT,
  PLATFORM_ORIGIN,
  RESOURCE_CONTRACT,
  RESOURCE_TYPES,
  SOURCE_TYPES,
  PromoSeoError,
  approvedSocialImage,
  canonicalOrigin,
  identityFromProjection,
  pageSeo,
  resourceEnvelope,
  resourcePath,
  resourceRedirect,
};
