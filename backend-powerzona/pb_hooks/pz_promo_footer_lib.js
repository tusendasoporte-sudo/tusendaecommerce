/// <reference path="../pb_data/types.d.ts" />

"use strict";

const FOOTER_CONTRACT = "promo.footer.v1";
const RESERVED_BRAND_NAME = "Tu Senda 84";
const MAX_NAVIGATION_LINKS = 8;
const MAX_SOCIAL_PROFILES = 4;
const KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

const SOCIAL_NETWORKS = Object.freeze({
  instagram: Object.freeze({
    label: "Instagram",
    handle: /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?)$/,
    href: (handle) => `https://www.instagram.com/${handle}/`,
  }),
  facebook: Object.freeze({
    label: "Facebook",
    handle: /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9.]{0,48}[a-z0-9])?)$/,
    href: (handle) => `https://www.facebook.com/${handle}`,
  }),
  linkedin: Object.freeze({
    label: "LinkedIn",
    handle: /^(?:[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?)$/,
    href: (handle) => `https://www.linkedin.com/company/${handle}/`,
  }),
  youtube: Object.freeze({
    label: "YouTube",
    handle: /^(?:[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?)$/,
    href: (handle) => `https://www.youtube.com/@${handle}`,
  }),
});

class PromoFooterError extends Error {
  constructor(code, status) {
    super(code || "invalid_promo_footer");
    this.name = "PromoFooterError";
    this.code = code || "invalid_promo_footer";
    this.status = Number.isInteger(status) ? status : 400;
  }
}

function fail(code, status) {
  throw new PromoFooterError(code, status);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value;
}

function exactKeys(value, keys) {
  const object = plainObject(value);
  const actual = Object.keys(object).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
  return object;
}

function onlyKeys(value, keys) {
  const object = plainObject(value);
  if (Object.keys(object).some((key) => !keys.includes(key))) fail();
  return object;
}

function safeKey(value) {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) fail();
  return value;
}

function safeStringArray(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) fail();
  const result = value.map(safeKey);
  if (new Set(result).size !== result.length) fail();
  return result;
}

function normalizeSocialProfile(value) {
  const profile = exactKeys(value, ["network", "handle"]);
  const network = String(profile.network || "");
  const handle = String(profile.handle || "");
  const definition = SOCIAL_NETWORKS[network];
  if (!definition || !definition.handle.test(handle)) fail();
  return { network, handle };
}

function normalizeFooterConfig(value) {
  const config = onlyKeys(value, ["navigation_section_keys", "social_profiles"]);
  const navigationSectionKeys = Object.prototype.hasOwnProperty.call(config, "navigation_section_keys")
    ? safeStringArray(config.navigation_section_keys, MAX_NAVIGATION_LINKS)
    : [];
  if (Object.prototype.hasOwnProperty.call(config, "social_profiles")
    && (!Array.isArray(config.social_profiles) || config.social_profiles.length > MAX_SOCIAL_PROFILES)) {
    fail();
  }
  const socialProfiles = Object.prototype.hasOwnProperty.call(config, "social_profiles")
    ? config.social_profiles.map(normalizeSocialProfile)
    : [];
  if (new Set(socialProfiles.map((profile) => profile.network)).size !== socialProfiles.length) fail();
  return { navigation_section_keys: navigationSectionKeys, social_profiles: socialProfiles };
}

function socialHref(network, handle) {
  const profile = normalizeSocialProfile({ network, handle });
  return SOCIAL_NETWORKS[profile.network].href(profile.handle);
}

function safeText(value, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)) fail("promo_footer_unavailable", 503);
  return value;
}

function formatMessage(template, values) {
  const message = safeText(template, 240);
  const replacements = values || {};
  const expected = Array.from(new Set((message.match(/\{[a-z_]+\}/g) || [])
    .map((item) => item.slice(1, -1)))).sort();
  const actual = Object.keys(replacements).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    fail("promo_footer_unavailable", 503);
  }
  return message.replace(/\{([a-z_]+)\}/g, (_, key) => safeText(replacements[key], 160));
}

function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch (_) { fail("promo_footer_unavailable", 503); }
}

function attachPublicFooter(localizedValue) {
  const localized = clone(localizedValue);
  if (!localized || localized.contract !== "promo.public.localized.v1"
    || !Array.isArray(localized.sections) || !localized.content || !localized.system) {
    fail("promo_footer_unavailable", 503);
  }
  const messages = plainObject(localized.system.messages);
  const content = plainObject(localized.content);
  const identity = plainObject(content.identity);
  const navigation = plainObject(content.navigation);
  const business = safeText(identity.name, 140);
  const sectionByKey = new Map(localized.sections.map((section) => {
    const normalized = plainObject(section);
    return [safeKey(normalized.key), normalized];
  }));
  const footerSections = localized.sections.filter((section) => section.type === "footer").map((section) => {
    const config = normalizeFooterConfig(section.config);
    const navigationLinks = config.navigation_section_keys.map((sectionKey) => {
      const target = sectionByKey.get(sectionKey);
      if (!target || target.type === "footer") fail("promo_footer_unavailable", 503);
      return {
        section_key: sectionKey,
        label: safeText(navigation[sectionKey], 80),
        href: `#promo-section-${sectionKey}`,
      };
    });
    const socialLinks = config.social_profiles.map((profile) => {
      const definition = SOCIAL_NETWORKS[profile.network];
      return {
        network: profile.network,
        label: definition.label,
        aria_label: formatMessage(messages["a11y.footer_social_link"], {
          business,
          network: definition.label,
        }),
        href: socialHref(profile.network, profile.handle),
      };
    });
    return {
      key: safeKey(section.key),
      navigation_label: formatMessage(messages["a11y.footer_links"], { business }),
      social_label: formatMessage(messages["a11y.footer_social"], { business }),
      navigation_links: navigationLinks,
      social_links: socialLinks,
      branding: {
        label: safeText(messages["footer.platform_branding"], 160),
        name: RESERVED_BRAND_NAME,
      },
    };
  });
  return {
    ...localized,
    footer: {
      contract: FOOTER_CONTRACT,
      sections: footerSections,
    },
  };
}

module.exports = {
  FOOTER_CONTRACT,
  MAX_NAVIGATION_LINKS,
  MAX_SOCIAL_PROFILES,
  PromoFooterError,
  RESERVED_BRAND_NAME,
  SOCIAL_NETWORKS,
  attachPublicFooter,
  formatMessage,
  normalizeFooterConfig,
  normalizeSocialProfile,
  socialHref,
};
