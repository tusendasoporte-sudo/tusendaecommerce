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
    name: "Tienda Ecommerce",
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
          adminAndroid: false,
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
  getMonthlyPriceCup,
  getOptionalCapabilityPolicy,
  getPlanCapabilities,
  getPlanCodes,
  getPlanDefinition,
  getPlanDefinitions,
  getPlanPricing,
  isValidPlanCode,
  normalizeStoreType,
};
