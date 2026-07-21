/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const priceWatch = typeof __hooks === "undefined"
  ? require("./pz_master_price_watch_lib.js")
  : require(`${__hooks}/pz_master_price_watch_lib.js`);
const plans = typeof __hooks === "undefined"
  ? require("./pz_store_plans_lib.js")
  : require(`${__hooks}/pz_store_plans_lib.js`);

const EXPIRATION_CAPABILITY = "product_expiration_tools_enabled";
const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    if (typeof record.get === "function") return record.get(key);
  } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try { return String(value.string() || "").trim(); } catch (_) { return ""; }
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
}

function recordActive(record) {
  const value = recordValue(record, "active");
  return value === undefined || value === null || value === "" ? true : recordBool(record, "active");
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] && value[0].id || value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function numberValue(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isFinite(value) ? value : 0;
}

function normalizeCivilDate(value) {
  const match = String(value || "").trim().match(CIVIL_DATE_PATTERN);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function havanaCivilDate(now) {
  try { return plans.getHavanaCivilDateKey(now === undefined ? new Date() : now); }
  catch (_) { return plans.getHavanaCivilDateKey(new Date()); }
}

function usesVariations(product) {
  return recordBool(product, "has_variations");
}

function isExpiredCivilDate(value, now) {
  const date = normalizeCivilDate(value);
  return Boolean(date && date <= havanaCivilDate(now));
}

function relatedActiveVariations(product, variations) {
  const productId = recordString(product, "id");
  return Array.from(variations || []).filter((variation) => (
    variation
    && relationId(variation, "product") === productId
    && recordActive(variation)
  ));
}

function effectiveUnitExpirationDate(product, unit, variations) {
  if (!product || !unit) return "";
  if (!usesVariations(product)) return normalizeCivilDate(recordValue(product, "expiration_date"));
  const variation = unit.variation || (unit.kind === "variation" ? unit.record : null) || null;
  if (!variation || relationId(variation, "product") !== recordString(product, "id")) return "";
  const activeVariations = relatedActiveVariations(product, variations);
  const individualMode = activeVariations.some((entry) => normalizeCivilDate(recordValue(entry, "expiration_date")));
  if (individualMode) return normalizeCivilDate(recordValue(variation, "expiration_date"));
  return normalizeCivilDate(recordValue(product, "expiration_date"));
}

function variationEffectiveStatus(product, variation, variations, now) {
  const manualActive = recordActive(variation);
  const unit = {
    kind: "variation",
    entity_id: recordString(variation, "id"),
    product_id: recordString(product, "id"),
    variation_id: recordString(variation, "id"),
    product,
    variation,
    record: variation,
  };
  const ownDate = normalizeCivilDate(recordValue(variation, "expiration_date"));
  const effectiveDate = manualActive
    ? effectiveUnitExpirationDate(product, unit, variations || [])
    : (ownDate || effectiveUnitExpirationDate(product, unit, variations || []));
  const expired = isExpiredCivilDate(effectiveDate, now);
  if (!usesVariations(product)) {
    return {
      effective_status: "disabled_by_parent_mode",
      effective_status_label: "Conservada — variaciones desactivadas",
      effective_status_reason: "parent_variations_disabled",
      can_activate: false,
      expired,
      effective_expiration_date: effectiveDate,
    };
  }
  if (!manualActive) {
    return {
      effective_status: "hidden_manual",
      effective_status_label: "Oculta manualmente",
      effective_status_reason: expired ? "manual_and_expired" : "manual_hidden",
      can_activate: !expired,
      expired,
      effective_expiration_date: effectiveDate,
    };
  }
  if (expired) {
    return {
      effective_status: "hidden_expired",
      effective_status_label: "Oculta por vencimiento",
      effective_status_reason: "expiration_date_passed",
      can_activate: false,
      expired: true,
      effective_expiration_date: effectiveDate,
    };
  }
  return {
    effective_status: "active",
    effective_status_label: "Activa",
    effective_status_reason: "available_by_status",
    can_activate: true,
    expired: false,
    effective_expiration_date: effectiveDate,
  };
}

// Identity and current availability intentionally remain separate. V7E9 can
// enumerate active units even when a unit is out of stock, while public reads
// and checkout can apply evaluateUnitAvailability to the same identity.
function buildProductUnits(product, variations) {
  if (!product) return [];
  const productId = recordString(product, "id");
  if (!usesVariations(product)) {
    const unit = {
      kind: "product",
      entity_id: productId,
      product_id: productId,
      variation_id: "",
      product,
      variation: null,
      record: product,
      active: recordActive(product),
    };
    unit.effective_expiration_date = effectiveUnitExpirationDate(product, unit, variations);
    return [unit];
  }
  const activeVariations = relatedActiveVariations(product, variations);
  return activeVariations.map((variation) => {
    const unit = {
      kind: "variation",
      entity_id: recordString(variation, "id"),
      product_id: productId,
      variation_id: recordString(variation, "id"),
      product,
      variation,
      record: variation,
      active: recordActive(product),
    };
    unit.effective_expiration_date = effectiveUnitExpirationDate(product, unit, activeVariations);
    return unit;
  });
}

function unavailable(reason, unit, extras) {
  return Object.assign({
    available: false,
    reason,
    unit: unit || null,
    price: null,
    stock: 0,
    track_stock: true,
    preorder: false,
    effective_expiration_date: unit && unit.effective_expiration_date || "",
  }, extras || {});
}

function taxonomyAvailable(product, store, category, subcategory) {
  const storeId = recordString(store, "id");
  for (const entry of [
    { id: relationId(product, "category"), record: category },
    { id: relationId(product, "subcategory"), record: subcategory },
  ]) {
    if (!entry.id) continue;
    if (!entry.record || recordString(entry.record, "id") !== entry.id) return false;
    if (relationId(entry.record, "store") !== storeId || !recordActive(entry.record)) return false;
  }
  return true;
}

function expirationEnabled(store) {
  return capabilities.resolveStoreCapabilityAccess(store, EXPIRATION_CAPABILITY).allowed === true;
}

function selectedUnit(product, variations, variation, requestedVariationId) {
  const units = buildProductUnits(product, variations);
  if (!usesVariations(product)) return variation || requestedVariationId ? null : units[0] || null;
  const variationId = String(requestedVariationId || recordString(variation, "id")).trim();
  if (!variationId) return null;
  return units.find((unit) => unit.variation_id === variationId) || null;
}

function evaluateUnitAvailability(input) {
  const context = input || {};
  const product = context.product || context.unit && context.unit.product || null;
  const store = context.store || null;
  const variations = Array.from(context.variations || []);
  const requestedVariation = context.variation || context.unit && context.unit.variation || null;
  const requestedVariationId = String(context.variationId || context.variation_id || "").trim();
  const unit = context.unit || selectedUnit(product, variations, requestedVariation, requestedVariationId);
  if (!product || !store || !unit) return unavailable("invalid_unit", unit);

  const storeId = recordString(store, "id");
  const storeStatus = recordString(store, "status").toLowerCase();
  if (!storeId || relationId(product, "store") !== storeId) return unavailable("tenant_mismatch", unit);
  if (!recordActive(store) || (storeStatus && storeStatus !== "active")) return unavailable("store_inactive", unit);
  if (!recordActive(product) || unit.active === false) return unavailable("product_inactive", unit);
  if (!taxonomyAvailable(product, store, context.category || null, context.subcategory || null)) {
    return unavailable("taxonomy_unavailable", unit);
  }

  const variation = unit.variation || null;
  if (usesVariations(product)) {
    if (!variation || relationId(variation, "product") !== recordString(product, "id") || !recordActive(variation)) {
      return unavailable("variation_unavailable", unit);
    }
  } else if (variation || unit.kind !== "product") {
    return unavailable("variation_forbidden", unit);
  }

  const price = priceWatch.effectiveCommercialPrice(product, variation);
  if (!(Number(price && price.effective) > 0)) return unavailable("price_unavailable", unit, { price });

  const stockRecord = variation || product;
  const tracksStock = recordValue(product, "track_stock") !== false;
  const preorder = recordBool(stockRecord, "allow_preorder");
  const stock = numberValue(stockRecord, "stock");
  const quantity = context.quantity === undefined ? 1 : Number(context.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return unavailable("invalid_quantity", unit, { price, stock, track_stock: tracksStock, preorder });
  }
  if (tracksStock && !preorder && (stock <= 0 || quantity > stock)) {
    return unavailable("stock_unavailable", unit, { price, stock, track_stock: tracksStock, preorder });
  }

  const effectiveDate = effectiveUnitExpirationDate(product, unit, variations);
  if (expirationEnabled(store) && effectiveDate) {
    if (effectiveDate <= havanaCivilDate(context.now)) {
      return unavailable("expired", unit, {
        price,
        stock,
        track_stock: tracksStock,
        preorder,
        effective_expiration_date: effectiveDate,
      });
    }
  }

  return {
    available: true,
    reason: "available",
    unit,
    price,
    stock,
    track_stock: tracksStock,
    preorder,
    effective_expiration_date: effectiveDate,
  };
}

module.exports = {
  buildProductUnits,
  effectiveUnitExpirationDate,
  evaluateUnitAvailability,
  isExpiredCivilDate,
  usesVariations,
  variationEffectiveStatus,
};
