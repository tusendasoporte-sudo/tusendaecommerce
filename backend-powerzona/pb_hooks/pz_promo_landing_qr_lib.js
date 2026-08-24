/// <reference path="../pb_data/types.d.ts" />

"use strict";

const promo = typeof __hooks === "undefined"
  ? require("./pz_promo_permissions_lib.js")
  : require(`${__hooks}/pz_promo_permissions_lib.js`);
const storeCapabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);

const LANDING_QR_LINK_CONTRACT = "promo.landing-qr-link.v1";
const PLATFORM_ORIGIN = "https://tusenda84.com";
const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function emptyLandingQrLink() {
  return Object.freeze({
    contract: LANDING_QR_LINK_CONTRACT,
    enabled: false,
    link: null,
  });
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    if (typeof record.get === "function") return record.get(key);
    if (typeof record.getString === "function") return record.getString(key);
  } catch (_) {}
  return record[key];
}

function recordId(record) {
  return String(recordValue(record, "id") || record && record.id || "").trim();
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return value.length === 1 ? String(value[0] || "").trim() : "";
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findExact(app, collection, filter, params) {
  let rows = [];
  try {
    rows = Array.from(app.findRecordsByFilter(collection, filter, "id", 2, 0, params || {}) || []);
  } catch (_) { rows = []; }
  return rows.length === 1 ? rows[0] : null;
}

function activeSettings(app, storeId) {
  try {
    return Array.from(app.findRecordsByFilter(
      "settings",
      "store = {:store} && active = true",
      "-updated,-created",
      1,
      0,
      { store: storeId },
    ) || [])[0] || null;
  } catch (_) { return null; }
}

function safeText(value, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum
    || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("promo_landing_qr_unavailable");
  return value;
}

function formatMessage(template, values) {
  const message = safeText(template, 240);
  const replacements = values || {};
  const expected = Array.from(new Set((message.match(/\{[a-z_]+\}/g) || [])
    .map((item) => item.slice(1, -1)))).sort();
  const actual = Object.keys(replacements).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error("promo_landing_qr_unavailable");
  }
  return message.replace(/\{([a-z_]+)\}/g, (_, key) => safeText(replacements[key], 160));
}

function landingQrPath(storeSlug) {
  const slug = String(storeSlug || "").trim();
  if (!STORE_SLUG_PATTERN.test(slug)) throw new Error("promo_landing_qr_unavailable");
  return `/t/${slug}/links`;
}

function landingQrHref(storeSlug) {
  return `${PLATFORM_ORIGIN}${landingQrPath(storeSlug)}`;
}

function sourceContext(app, context) {
  const site = context && context.site;
  const siteId = recordId(site);
  const storeId = relationId(site, "store");
  const store = context && context.store && recordId(context.store) === storeId
    ? context.store
    : findRecord(app, "stores", storeId);
  const entitlement = context && context.entitlement && relationId(context.entitlement, "site") === siteId
    ? context.entitlement
    : findExact(app, "promo_site_entitlements", "site = {:site}", { site: siteId });
  return { entitlement, site, siteId, store, storeId };
}

function adapterRequested(localized, context) {
  return Boolean(
    localized && localized.adapters && localized.adapters.landing_qr_link
      && localized.adapters.landing_qr_link.enabled === true
      && context && context.document && context.document.adapters
      && context.document.adapters.landing_qr_link
      && context.document.adapters.landing_qr_link.enabled === true,
  );
}

function attachPublicLandingQr(app, localized, context) {
  if (!adapterRequested(localized, context)) {
    return { ...localized, landing_qr_link: emptyLandingQrLink() };
  }
  try {
    const source = sourceContext(app, context);
    if (!source.siteId || !source.storeId || relationId(source.site, "store") !== source.storeId
      || !source.store || recordString(source.store, "status") !== "active"
      || !source.entitlement
      || !promo.resolvePromoCapabilityAccess(source.entitlement, "landing_qr_bridge_enabled").allowed
      || !storeCapabilities.hasStoreCapability(
        source.store,
        "landing_qr_enabled",
        { enforceExpiration: true },
      )) {
      return { ...localized, landing_qr_link: emptyLandingQrLink() };
    }
    const settings = activeSettings(app, source.storeId);
    if (!settings || relationId(settings, "store") !== source.storeId
      || !recordBool(settings, "active") || !recordBool(settings, "landing_qr_enabled")) {
      return { ...localized, landing_qr_link: emptyLandingQrLink() };
    }
    const messages = localized && localized.system && localized.system.messages;
    const business = localized && localized.content && localized.content.identity
      && localized.content.identity.name;
    return {
      ...localized,
      landing_qr_link: Object.freeze({
        contract: LANDING_QR_LINK_CONTRACT,
        enabled: true,
        link: Object.freeze({
          label: safeText(messages && messages["landing_qr.open"], 80),
          aria_label: formatMessage(messages && messages["a11y.landing_qr_link"], {
            business: safeText(business, 140),
          }),
          href: landingQrHref(recordString(source.store, "slug")),
        }),
      }),
    };
  } catch (_) {
    return { ...localized, landing_qr_link: emptyLandingQrLink() };
  }
}

module.exports = {
  LANDING_QR_LINK_CONTRACT,
  PLATFORM_ORIGIN,
  STORE_SLUG_PATTERN,
  activeSettings,
  adapterRequested,
  attachPublicLandingQr,
  emptyLandingQrLink,
  formatMessage,
  landingQrHref,
  landingQrPath,
  sourceContext,
};
