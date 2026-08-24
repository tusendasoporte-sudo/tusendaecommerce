/// <reference path="../pb_data/types.d.ts" />

"use strict";

const CONTACT_ACTION_CONTRACT = "promo.contact.action.v1";
const E164_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACTION_TYPES = Object.freeze(["whatsapp", "phone", "email"]);
const WHATSAPP_ORIGIN = "https://wa.me";

function unavailableAction() {
  return Object.freeze({ contract: CONTACT_ACTION_CONTRACT, available: false, action: null });
}

function safeText(value, max, required) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())
    || /[\u0000-\u001f\u007f]/.test(value)
    || /<\/?[a-z][^>]*>/i.test(value)
    || /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value)) {
    throw new Error("promo_contact_unavailable");
  }
  return value;
}

function encodedComponent(value) {
  return encodeURIComponent(value);
}

function emailHref(address, message) {
  if (!EMAIL_PATTERN.test(address) || address.length > 254) {
    throw new Error("promo_contact_unavailable");
  }
  const encodedAddress = encodedComponent(address).replace(/%40/gi, "@");
  return `mailto:${encodedAddress}${message ? `?body=${encodedComponent(message)}` : ""}`;
}

function actionHref(action, message) {
  const config = action && action.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("promo_contact_unavailable");
  }
  if (action.type === "whatsapp") {
    if (!E164_PATTERN.test(config.phone_e164)) throw new Error("promo_contact_unavailable");
    const digits = config.phone_e164.slice(1);
    return `${WHATSAPP_ORIGIN}/${digits}${message ? `?text=${encodedComponent(message)}` : ""}`;
  }
  if (action.type === "phone") {
    if (!E164_PATTERN.test(config.phone_e164)) throw new Error("promo_contact_unavailable");
    return `tel:${config.phone_e164}`;
  }
  if (action.type === "email") return emailHref(config.email_address, message);
  throw new Error("promo_contact_unavailable");
}

function primarySurfaceVisible(document, primaryKey) {
  if (!Array.isArray(document && document.sections)) return false;
  return document.sections.some((section) => {
    if (!section || section.visible !== true || !section.config || typeof section.config !== "object") return false;
    if (section.type === "hero") {
      return section.config.action_key === "" || section.config.action_key === primaryKey;
    }
    return section.type === "contact" && Array.isArray(section.config.action_keys)
      && section.config.action_keys.includes(primaryKey);
  });
}

function compilePrimaryAction(document, locale) {
  try {
    const contact = document && document.contact;
    const byLocale = document && document.content_by_locale;
    if (!contact || contact.enabled !== true || !Array.isArray(contact.actions)
      || typeof contact.primary_action_key !== "string" || !contact.primary_action_key
      || !byLocale || typeof byLocale !== "object" || Array.isArray(byLocale)
      || typeof locale !== "string" || !locale) return unavailableAction();
    if (!primarySurfaceVisible(document, contact.primary_action_key)) return unavailableAction();
    const matching = contact.actions.filter((candidate) => (
      candidate && candidate.key === contact.primary_action_key
    ));
    if (matching.length !== 1 || matching[0].enabled !== true || !ACTION_TYPES.includes(matching[0].type)) {
      return unavailableAction();
    }
    const localized = byLocale[locale];
    const copy = localized && localized.contact && localized.contact[contact.primary_action_key];
    if (!copy || typeof copy !== "object" || Array.isArray(copy)) return unavailableAction();
    const label = safeText(copy.label, 80, true);
    const ariaLabel = safeText(copy.aria_label, 160, true);
    const message = safeText(copy.message || "", 1000, false);
    return Object.freeze({
      contract: CONTACT_ACTION_CONTRACT,
      available: true,
      action: Object.freeze({
        key: contact.primary_action_key,
        type: matching[0].type,
        label,
        aria_label: ariaLabel,
        href: actionHref(matching[0], message),
      }),
    });
  } catch (_) {
    return unavailableAction();
  }
}

function attachPublicContact(localized, context) {
  const effectiveLocale = localized && localized.locale && localized.locale.effective;
  return {
    ...localized,
    contact_action: compilePrimaryAction(context && context.document, effectiveLocale),
  };
}

module.exports = {
  ACTION_TYPES,
  CONTACT_ACTION_CONTRACT,
  E164_PATTERN,
  WHATSAPP_ORIGIN,
  actionHref,
  attachPublicContact,
  compilePrimaryAction,
  primarySurfaceVisible,
  unavailableAction,
};
