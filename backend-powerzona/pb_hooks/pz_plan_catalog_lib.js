/// <reference path="../pb_data/types.d.ts" />

"use strict";

const CATALOG_CONTRACT = "tusenda84.commercial-plan-catalog.v1";
const CATALOG_VERSION = 1;
const CURRENCY = Object.freeze({ code: "CUP", decimals: 0 });
const COMMERCIAL_PERIOD_MONTHS = Object.freeze([1, 6, 12]);
const STORE_TYPE_ALIASES = Object.freeze({
  commerce: "ecommerce",
  ecommerce: "ecommerce",
  promo: "promotional",
  promotional: "promotional",
});

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function commercialPeriod(months, monthlyEquivalentCup, totalCup, monthlyReferenceCup) {
  const referenceTotal = monthlyReferenceCup * months;
  const savingsCup = Math.max(0, referenceTotal - totalCup);
  return deepFreeze({
    months,
    monthly_equivalent_cup: monthlyEquivalentCup,
    total_cup: totalCup,
    savings_cup: savingsCup,
    savings_percent: referenceTotal > 0
      ? Math.round((savingsCup / referenceTotal) * 10000) / 100
      : 0,
  });
}

function paidPricing(monthlyReferenceCup, sixMonthEquivalentCup, annualEquivalentCup) {
  return deepFreeze({
    currency: CURRENCY.code,
    trial: null,
    periods: [
      commercialPeriod(1, monthlyReferenceCup, monthlyReferenceCup, monthlyReferenceCup),
      commercialPeriod(6, sixMonthEquivalentCup, sixMonthEquivalentCup * 6, monthlyReferenceCup),
      commercialPeriod(12, annualEquivalentCup, annualEquivalentCup * 12, monthlyReferenceCup),
    ],
  });
}

function trialPricing(days) {
  return deepFreeze({
    currency: CURRENCY.code,
    trial: {
      days,
      total_cup: 0,
      one_time_per_store: true,
    },
    periods: [],
  });
}

const FREE_DURATION = deepFreeze({
  kind: "fixed_days",
  days: 30,
  min_months: 0,
  max_months: 0,
  allowed_months: [],
});

const PAID_DURATION = deepFreeze({
  kind: "calendar_months",
  days: null,
  min_months: 1,
  max_months: 12,
  allowed_months: COMMERCIAL_PERIOD_MONTHS,
});

const PROMOTIONAL_BASE_CAPABILITIES = deepFreeze({
  admin_panel_enabled: true,
  promotional_catalog_enabled: true,
  reviews_management_enabled: true,
  contacts_management_enabled: true,
  promo_site_enabled: true,
  publish_enabled: true,
  custom_domain_enabled: false,
  theme_customization_enabled: true,
  multilanguage_enabled: true,
  language_selector_enabled: false,
  video_enabled: false,
  analytics_enabled: true,
  landing_qr_bridge_enabled: false,
  max_services: 12,
  max_locales: 2,
  max_videos: 0,
  max_storage_bytes: 250 * 1024 * 1024,
});

function promotionalCapabilities(maxTotalImages) {
  return deepFreeze({
    ...PROMOTIONAL_BASE_CAPABILITIES,
    max_total_images: maxTotalImages,
    image_limit_includes: ["logo", "cover", "owner", "gallery", "catalog"],
  });
}

function ecommerceCapabilities(values) {
  return deepFreeze({
    max_products: values.maxProducts,
    max_active_users: values.maxActiveUsers,
    max_devices_per_user: 5,
    max_store_devices: values.maxStoreDevices,
    max_product_images: values.maxProductImages,
    categories_enabled: true,
    subcategories_enabled: true,
    admin_android_app_enabled: values.adminAndroid,
    customer_android_app_enabled: values.customerAndroid,
    raffles_enabled: values.premiumFeatures,
    security_enabled: false,
    landing_qr_enabled: values.premiumFeatures,
    product_expiration_tools_enabled: values.premiumFeatures,
    push_campaigns_enabled: values.premiumFeatures,
  });
}

const PLAN_CATALOG = deepFreeze({
  promotional: {
    code: "promotional",
    storage_code: "promo",
    name: "Tienda Promocional",
    plans: {
      free: {
        code: "free",
        name: "Prueba gratis",
        duration: FREE_DURATION,
        pricing: trialPricing(30),
        supports_permanent: false,
        capabilities: promotionalCapabilities(150),
      },
      basic: {
        code: "basic",
        name: "Básico",
        duration: PAID_DURATION,
        pricing: paidPricing(1400, 1200, 1000),
        // Compatibilidad operativa para contratos Promo permanentes ya soportados.
        supports_permanent: true,
        capabilities: promotionalCapabilities(300),
      },
    },
  },
  ecommerce: {
    code: "ecommerce",
    storage_code: "commerce",
    name: "Tienda",
    plans: {
      free: {
        code: "free",
        name: "Prueba gratis",
        duration: FREE_DURATION,
        pricing: trialPricing(30),
        supports_permanent: false,
        capabilities: ecommerceCapabilities({
          maxProducts: 100,
          maxProductImages: 2,
          maxActiveUsers: 1,
          maxStoreDevices: 5,
          adminAndroid: true,
          customerAndroid: false,
          premiumFeatures: false,
        }),
      },
      basic: {
        code: "basic",
        name: "Básico",
        duration: PAID_DURATION,
        pricing: paidPricing(1500, 1250, 1000),
        // Se conserva para tiendas y operaciones administrativas legadas.
        supports_permanent: true,
        capabilities: ecommerceCapabilities({
          maxProducts: 700,
          maxProductImages: 2,
          maxActiveUsers: 2,
          maxStoreDevices: 10,
          adminAndroid: true,
          customerAndroid: false,
          premiumFeatures: false,
        }),
      },
      premium: {
        code: "premium",
        name: "Premium",
        duration: PAID_DURATION,
        pricing: paidPricing(2500, 1800, 1600),
        // PowerZona y otros registros permanentes continúan siendo válidos.
        supports_permanent: true,
        capabilities: ecommerceCapabilities({
          maxProducts: 1600,
          maxProductImages: 4,
          maxActiveUsers: 4,
          maxStoreDevices: 20,
          adminAndroid: true,
          customerAndroid: true,
          premiumFeatures: true,
        }),
      },
    },
  },
});

const OPTIONAL_CAPABILITIES = deepFreeze({
  security_enabled: {
    key: "security_enabled",
    name: "Seguridad avanzada",
    allocation: "optional_per_store",
    controlled_by: "master_admin",
    enabled_by_default: false,
    setting_collection: "store_security_settings",
    eligible_store_types: ["ecommerce"],
    eligible_plans: ["free", "basic", "premium"],
  },
});

function normalizeStoreType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const result = STORE_TYPE_ALIASES[normalized];
  if (!result) throw new RangeError("invalid_store_type");
  return result;
}

function storeTypeDefinition(storeType) {
  return PLAN_CATALOG[normalizeStoreType(storeType)];
}

function getPlanCodes(storeType) {
  return Object.keys(storeTypeDefinition(storeType).plans);
}

function isValidPlanCode(storeType, planCode) {
  if (typeof planCode !== "string") return false;
  try {
    return Object.prototype.hasOwnProperty.call(storeTypeDefinition(storeType).plans, planCode);
  } catch (_) {
    return false;
  }
}

function getPlanDefinition(storeType, planCode) {
  const type = storeTypeDefinition(storeType);
  const code = String(planCode || "").trim();
  if (!Object.prototype.hasOwnProperty.call(type.plans, code)) {
    throw new RangeError("invalid_plan_code");
  }
  return type.plans[code];
}

function getPlanCapabilities(storeType, planCode) {
  return getPlanDefinition(storeType, planCode).capabilities;
}

function getPlanPricing(storeType, planCode) {
  return getPlanDefinition(storeType, planCode).pricing;
}

function getMonthlyPriceCup(storeType, planCode) {
  const pricing = getPlanPricing(storeType, planCode);
  return pricing.periods.length ? pricing.periods[0].monthly_equivalent_cup : 0;
}

function cloneSnapshotCapabilities(capabilities) {
  return Object.keys(capabilities || {}).reduce((result, key) => {
    const value = capabilities[key];
    result[key] = Array.isArray(value) ? value.slice() : value;
    return result;
  }, {});
}

function getCommercialAuditSnapshot(storeType, planCode, options) {
  const normalizedType = normalizeStoreType(storeType);
  const definition = getPlanDefinition(normalizedType, planCode);
  const input = options && typeof options === "object" ? options : {};
  const isPermanent = input.is_permanent === true;
  let pricingKind = "trial";
  let trialDays = definition.pricing.trial ? definition.pricing.trial.days : null;
  let periodMonths = null;
  let monthlyEquivalentCup = null;
  let totalCup = definition.pricing.trial ? definition.pricing.trial.total_cup : null;
  let savingsCup = 0;
  let savingsPercent = 0;

  if (isPermanent) {
    if (!definition.supports_permanent) throw new RangeError("permanent_plan_not_supported");
    pricingKind = "permanent_compatibility";
    trialDays = null;
    totalCup = null;
    savingsCup = null;
    savingsPercent = null;
  } else if (!definition.pricing.trial) {
    const months = Number(input.months);
    const period = definition.pricing.periods.find((item) => item.months === months);
    if (!period) throw new RangeError("invalid_plan_duration_months");
    pricingKind = "period";
    periodMonths = period.months;
    monthlyEquivalentCup = period.monthly_equivalent_cup;
    totalCup = period.total_cup;
    savingsCup = period.savings_cup;
    savingsPercent = period.savings_percent;
  }

  return {
    contract: CATALOG_CONTRACT,
    version: CATALOG_VERSION,
    store_type: normalizedType,
    plan_code: definition.code,
    plan_name: definition.name,
    currency: CURRENCY.code,
    pricing_kind: pricingKind,
    trial_days: trialDays,
    period_months: periodMonths,
    monthly_equivalent_cup: monthlyEquivalentCup,
    total_cup: totalCup,
    savings_cup: savingsCup,
    savings_percent: savingsPercent,
    capabilities: cloneSnapshotCapabilities(definition.capabilities),
  };
}

function finiteNonNegativeOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeSnapshotCapabilities(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  const keys = Object.keys(value);
  if (keys.length > 64) return null;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!/^[a-z0-9_]{1,80}$/.test(key)) return null;
    const entry = value[key];
    if (typeof entry === "boolean") result[key] = entry;
    else if (typeof entry === "number" && Number.isFinite(entry) && entry >= 0) result[key] = entry;
    else if (Array.isArray(entry) && entry.length <= 32
      && entry.every((item) => typeof item === "string" && item.length <= 80)) {
      result[key] = entry.slice();
    } else return null;
  }
  return result;
}

function normalizeCommercialAuditSnapshot(value) {
  let source = value;
  if (typeof source === "string") {
    try { source = JSON.parse(source); } catch (_) { return null; }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  if (source.contract !== CATALOG_CONTRACT || Number(source.version) !== CATALOG_VERSION) return null;
  let storeType;
  try { storeType = normalizeStoreType(source.store_type); } catch (_) { return null; }
  if (!isValidPlanCode(storeType, source.plan_code) || source.currency !== CURRENCY.code) return null;
  const pricingKind = String(source.pricing_kind || "");
  if (!["trial", "period", "permanent_compatibility"].includes(pricingKind)) return null;
  const capabilities = normalizeSnapshotCapabilities(source.capabilities);
  if (!capabilities) return null;

  const snapshot = {
    contract: CATALOG_CONTRACT,
    version: CATALOG_VERSION,
    store_type: storeType,
    plan_code: String(source.plan_code),
    plan_name: String(source.plan_name || "").trim().slice(0, 80),
    currency: CURRENCY.code,
    pricing_kind: pricingKind,
    trial_days: finiteNonNegativeOrNull(source.trial_days),
    period_months: finiteNonNegativeOrNull(source.period_months),
    monthly_equivalent_cup: finiteNonNegativeOrNull(source.monthly_equivalent_cup),
    total_cup: finiteNonNegativeOrNull(source.total_cup),
    savings_cup: finiteNonNegativeOrNull(source.savings_cup),
    savings_percent: finiteNonNegativeOrNull(source.savings_percent),
    capabilities,
  };
  if (!snapshot.plan_name) return null;
  if (pricingKind === "period" && !COMMERCIAL_PERIOD_MONTHS.includes(snapshot.period_months)) return null;
  return snapshot;
}

function getOptionalCapabilityPolicy(capabilityKey) {
  const key = String(capabilityKey || "").trim();
  return Object.prototype.hasOwnProperty.call(OPTIONAL_CAPABILITIES, key)
    ? OPTIONAL_CAPABILITIES[key]
    : null;
}

function planDto(storeType, planCode) {
  const normalizedType = normalizeStoreType(storeType);
  const definition = getPlanDefinition(normalizedType, planCode);
  return {
    code: definition.code,
    name: definition.name,
    store_type: normalizedType,
    duration: definition.duration,
    pricing: definition.pricing,
    supports_permanent: definition.supports_permanent,
    capabilities: definition.capabilities,
  };
}

function getPlanDefinitions(storeType) {
  return getPlanCodes(storeType).map((code) => planDto(storeType, code));
}

function getCatalogDto() {
  return {
    contract: CATALOG_CONTRACT,
    version: CATALOG_VERSION,
    currency: CURRENCY,
    commercial_period_months: COMMERCIAL_PERIOD_MONTHS,
    store_types: ["promotional", "ecommerce"].map((storeType) => {
      const definition = storeTypeDefinition(storeType);
      return {
        code: definition.code,
        storage_code: definition.storage_code,
        name: definition.name,
        plans: getPlanDefinitions(storeType),
      };
    }),
    optional_capabilities: Object.keys(OPTIONAL_CAPABILITIES).map((key) => OPTIONAL_CAPABILITIES[key]),
  };
}

module.exports = {
  CATALOG_CONTRACT,
  CATALOG_VERSION,
  COMMERCIAL_PERIOD_MONTHS,
  CURRENCY,
  OPTIONAL_CAPABILITIES,
  PLAN_CATALOG,
  PROMOTIONAL_BASE_CAPABILITIES,
  getCatalogDto,
  getCommercialAuditSnapshot,
  getMonthlyPriceCup,
  getOptionalCapabilityPolicy,
  getPlanCapabilities,
  getPlanCodes,
  getPlanDefinition,
  getPlanDefinitions,
  getPlanPricing,
  isValidPlanCode,
  normalizeCommercialAuditSnapshot,
  normalizeStoreType,
};
