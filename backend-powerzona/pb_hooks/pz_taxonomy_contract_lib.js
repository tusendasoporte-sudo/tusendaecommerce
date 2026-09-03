/// <reference path="../pb_data/types.d.ts" />

"use strict";

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const promoPlans = typeof __hooks === "undefined"
  ? require("./pz_promo_plan_lib.js")
  : require(`${__hooks}/pz_promo_plan_lib.js`);

const TAXONOMY_NAME_MAX_LENGTH = 120;
const TAXONOMY_SLUG_MAX_LENGTH = 160;
const TAXONOMY_ORDER_MAX = 1_000_000_000;
const TAXONOMY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SAFE_ERRORS = Object.freeze({
  taxonomy_management_unavailable: Object.freeze({
    status: 503,
    field: "store",
    message: "No se pudo validar la organización del catálogo. Intenta de nuevo.",
  }),
  taxonomy_capability_unavailable: Object.freeze({
    status: 403,
    field: "store",
    message: "La gestión de categorías no está disponible para esta tienda.",
  }),
  invalid_taxonomy_name: Object.freeze({
    status: 400,
    field: "name",
    message: "Escribe un nombre válido de hasta 120 caracteres.",
  }),
  invalid_taxonomy_slug: Object.freeze({
    status: 400,
    field: "slug",
    message: "La ruta debe usar solo letras minúsculas, números y guiones.",
  }),
  invalid_taxonomy_order: Object.freeze({
    status: 400,
    field: "order",
    message: "El orden debe ser un número entero válido.",
  }),
  taxonomy_store_immutable: Object.freeze({
    status: 409,
    field: "store",
    message: "No se puede trasladar una categoría o subcategoría a otra tienda.",
  }),
  taxonomy_duplicate_name: Object.freeze({
    status: 409,
    field: "name",
    message: "Ya existe un elemento con ese nombre en el mismo nivel del catálogo.",
  }),
  taxonomy_duplicate_slug: Object.freeze({
    status: 409,
    field: "slug",
    message: "Ya existe una ruta igual en esta tienda. Usa otro nombre.",
  }),
  invalid_subcategory_parent: Object.freeze({
    status: 400,
    field: "category",
    message: "La categoría padre no es válida para esta tienda.",
  }),
  subcategory_parent_has_products: Object.freeze({
    status: 409,
    field: "category",
    message: "No se puede mover esta subcategoría mientras tenga productos asignados.",
  }),
  invalid_product_category: Object.freeze({
    status: 400,
    field: "category",
    message: "La categoría seleccionada no pertenece a esta tienda.",
  }),
  invalid_product_subcategory: Object.freeze({
    status: 400,
    field: "subcategory",
    message: "La subcategoría seleccionada no pertenece a la categoría y tienda indicadas.",
  }),
  category_not_empty: Object.freeze({
    status: 409,
    field: "category",
    message: "La categoría tiene productos o subcategorías. Mueve o elimina su contenido primero.",
  }),
  subcategory_not_empty: Object.freeze({
    status: 409,
    field: "subcategory",
    message: "La subcategoría tiene productos. Muévelos a la categoría principal antes de eliminarla.",
  }),
});

class TaxonomyContractError extends Error {
  constructor(code) {
    const safeCode = Object.prototype.hasOwnProperty.call(SAFE_ERRORS, code)
      ? code
      : "taxonomy_management_unavailable";
    super(SAFE_ERRORS[safeCode].message);
    this.name = "TaxonomyContractError";
    this.code = safeCode;
  }
}

function fail(code) {
  throw new TaxonomyContractError(code);
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function textValue(value) {
  try { return String(value === null || value === undefined ? "" : value).trim(); }
  catch (_) { return ""; }
}

function recordString(record, key) {
  return textValue(recordValue(record, key));
}

function recordId(record) {
  return textValue(record && (record.id || recordValue(record, "id")));
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return textValue(value[0] && value[0].id || value[0]);
  if (value && typeof value === "object") return textValue(value.id);
  return textValue(value);
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function normalizedTaxonomyName(value) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function validateTaxonomyName(value) {
  const name = textValue(value);
  if (!name
      || name.length > TAXONOMY_NAME_MAX_LENGTH
      || /[\u0000-\u001f\u007f]/.test(name)) {
    fail("invalid_taxonomy_name");
  }
  return name;
}

function validateTaxonomySlug(value) {
  const slug = textValue(value);
  if (!slug
      || slug.length > TAXONOMY_SLUG_MAX_LENGTH
      || !TAXONOMY_SLUG_PATTERN.test(slug)) {
    fail("invalid_taxonomy_slug");
  }
  return slug;
}

function validateTaxonomyOrder(value) {
  const order = Number(value);
  if (!Number.isSafeInteger(order) || order < 0 || order > TAXONOMY_ORDER_MAX) {
    fail("invalid_taxonomy_order");
  }
  return order;
}

function findRecord(app, collection, id) {
  if (!app || !id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecords(app, collection, filter, params, limit = 5000) {
  if (!app || typeof app.findRecordsByFilter !== "function") fail("taxonomy_management_unavailable");
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter,
      "id",
      limit,
      0,
      params || {},
    ) || []);
  } catch (_) {
    fail("taxonomy_management_unavailable");
  }
}

function assertTaxonomyCapability(app, store, capability) {
  if (!store || promoPlans.isPromoStore(app, store)) fail("taxonomy_capability_unavailable");
  const access = capabilities.resolveStoreCapabilityAccess(store, capability, { app });
  if (!access || access.allowed !== true) {
    if (access && ["capability_not_in_plan", "capability_not_enabled", "plan_expired"].includes(access.reason)) {
      fail("taxonomy_capability_unavailable");
    }
    fail("taxonomy_management_unavailable");
  }
}

function assertImmutableRelation(record, original, key, code) {
  if (!original || relationId(record, key) !== relationId(original, key)) fail(code);
}

function taxonomyFieldChanged(record, original, key, relation = false) {
  if (!original) return true;
  return relation
    ? relationId(record, key) !== relationId(original, key)
    : recordString(record, key) !== recordString(original, key);
}

function assertUniqueName(app, collection, record, storeId, parentId) {
  const currentId = recordId(record);
  const wanted = normalizedTaxonomyName(recordString(record, "name"));
  const filter = parentId === undefined
    ? "store = {:store}"
    : "store = {:store} && category = {:category}";
  const rows = findRecords(app, collection, filter, {
    store: storeId,
    ...(parentId === undefined ? {} : { category: parentId }),
  });
  if (rows.some((entry) => recordId(entry) !== currentId
      && normalizedTaxonomyName(recordString(entry, "name")) === wanted)) {
    fail("taxonomy_duplicate_name");
  }
}

function assertUniqueSlug(app, collection, record, storeId) {
  const currentId = recordId(record);
  const slug = recordString(record, "slug");
  const rows = findRecords(app, collection, "store = {:store} && slug = {:slug}", {
    store: storeId,
    slug,
  });
  if (rows.some((entry) => recordId(entry) !== currentId)) fail("taxonomy_duplicate_slug");
}

function validateCategoryMutation(app, record, mode) {
  const original = mode === "update" ? originalRecord(record) : null;
  const storeId = relationId(record, "store");
  if (!storeId) fail("taxonomy_management_unavailable");
  if (mode === "update") assertImmutableRelation(record, original, "store", "taxonomy_store_immutable");
  const store = findRecord(app, "stores", storeId);
  if (!store) fail("taxonomy_management_unavailable");
  assertTaxonomyCapability(app, store, "categories_enabled");

  if (mode === "create" || taxonomyFieldChanged(record, original, "name")) {
    validateTaxonomyName(recordValue(record, "name"));
    assertUniqueName(app, "categories", record, storeId);
  }
  if (mode === "create" || taxonomyFieldChanged(record, original, "slug")) {
    validateTaxonomySlug(recordValue(record, "slug"));
    assertUniqueSlug(app, "categories", record, storeId);
  }
  if (mode === "create" || taxonomyFieldChanged(record, original, "order")) {
    validateTaxonomyOrder(recordValue(record, "order"));
  }
  return true;
}

function validateSubcategoryMutation(app, record, mode) {
  const original = mode === "update" ? originalRecord(record) : null;
  const storeId = relationId(record, "store");
  const categoryId = relationId(record, "category");
  const parentChanged = mode === "update" && taxonomyFieldChanged(record, original, "category", true);
  if (!storeId) fail("taxonomy_management_unavailable");
  if (mode === "update") {
    assertImmutableRelation(record, original, "store", "taxonomy_store_immutable");
    if (parentChanged) {
      const assignedProducts = findRecords(
        app,
        "products",
        "store = {:store} && subcategory = {:subcategory}",
        { store: storeId, subcategory: recordId(record) },
        1,
      );
      if (assignedProducts.length) fail("subcategory_parent_has_products");
    }
  }
  const store = findRecord(app, "stores", storeId);
  if (!store) fail("taxonomy_management_unavailable");
  assertTaxonomyCapability(app, store, "subcategories_enabled");
  const category = findRecord(app, "categories", categoryId);
  if (!category || relationId(category, "store") !== storeId) fail("invalid_subcategory_parent");

  if (mode === "create" || parentChanged || taxonomyFieldChanged(record, original, "name")) {
    validateTaxonomyName(recordValue(record, "name"));
    assertUniqueName(app, "subcategories", record, storeId, categoryId);
  }
  if (mode === "create" || taxonomyFieldChanged(record, original, "slug")) {
    validateTaxonomySlug(recordValue(record, "slug"));
    assertUniqueSlug(app, "subcategories", record, storeId);
  }
  if (mode === "create" || taxonomyFieldChanged(record, original, "order")) {
    validateTaxonomyOrder(recordValue(record, "order"));
  }
  return true;
}

function validateProductTaxonomyMutation(app, record, mode) {
  const original = mode === "update" ? originalRecord(record) : null;
  const changed = mode === "create"
    || taxonomyFieldChanged(record, original, "store", true)
    || taxonomyFieldChanged(record, original, "category", true)
    || taxonomyFieldChanged(record, original, "subcategory", true);
  if (!changed) return true;

  const storeId = relationId(record, "store");
  const categoryId = relationId(record, "category");
  const subcategoryId = relationId(record, "subcategory");
  const store = findRecord(app, "stores", storeId);
  if (!store) fail("taxonomy_management_unavailable");
  if (!categoryId && subcategoryId) fail("invalid_product_subcategory");
  if (!categoryId) return true;

  assertTaxonomyCapability(app, store, "categories_enabled");
  const category = findRecord(app, "categories", categoryId);
  if (!category || relationId(category, "store") !== storeId) fail("invalid_product_category");
  if (!subcategoryId) return true;

  assertTaxonomyCapability(app, store, "subcategories_enabled");
  const subcategory = findRecord(app, "subcategories", subcategoryId);
  if (!subcategory
      || relationId(subcategory, "store") !== storeId
      || relationId(subcategory, "category") !== categoryId) {
    fail("invalid_product_subcategory");
  }
  return true;
}

function assertCategoryDeleteAllowed(app, record) {
  const categoryId = recordId(record);
  const storeId = relationId(record, "store");
  if (!categoryId || !storeId) fail("taxonomy_management_unavailable");
  const subcategories = findRecords(
    app,
    "subcategories",
    "store = {:store} && category = {:category}",
    { store: storeId, category: categoryId },
    1,
  );
  const products = findRecords(
    app,
    "products",
    "store = {:store} && category = {:category}",
    { store: storeId, category: categoryId },
    1,
  );
  if (subcategories.length || products.length) fail("category_not_empty");
  return true;
}

function assertSubcategoryDeleteAllowed(app, record) {
  const subcategoryId = recordId(record);
  const storeId = relationId(record, "store");
  if (!subcategoryId || !storeId) fail("taxonomy_management_unavailable");
  const products = findRecords(
    app,
    "products",
    "store = {:store} && subcategory = {:subcategory}",
    { store: storeId, subcategory: subcategoryId },
    1,
  );
  if (products.length) fail("subcategory_not_empty");
  return true;
}

function safeTaxonomyError(error) {
  const code = error && Object.prototype.hasOwnProperty.call(SAFE_ERRORS, error.code)
    ? error.code
    : "taxonomy_management_unavailable";
  const definition = SAFE_ERRORS[code];
  return Object.freeze({ code, ...definition });
}

function raiseTaxonomyError(error) {
  if (!(error instanceof TaxonomyContractError)
      && !Object.prototype.hasOwnProperty.call(SAFE_ERRORS, error && error.code)) {
    throw error;
  }
  const safe = safeTaxonomyError(error);
  if (typeof ApiError === "function" && typeof ValidationError === "function") {
    const data = {};
    data[safe.field] = new ValidationError(safe.code, safe.message);
    throw new ApiError(safe.status, safe.message, data);
  }
  throw error;
}

function runValidatedMutation(e, validator) {
  if (!e || !e.record || !e.app || typeof e.next !== "function") return e && e.next ? e.next() : undefined;
  try {
    validator(e.app, e.record);
    return e.next();
  } catch (error) {
    return raiseTaxonomyError(error);
  }
}

function handleCategoryMutation(e, mode) {
  return runValidatedMutation(e, (app, record) => validateCategoryMutation(app, record, mode));
}

function handleSubcategoryMutation(e, mode) {
  return runValidatedMutation(e, (app, record) => validateSubcategoryMutation(app, record, mode));
}

function handleProductTaxonomyMutation(e, mode) {
  return runValidatedMutation(e, (app, record) => validateProductTaxonomyMutation(app, record, mode));
}

function handleCategoryDelete(e) {
  return runValidatedMutation(e, assertCategoryDeleteAllowed);
}

function handleSubcategoryDelete(e) {
  return runValidatedMutation(e, assertSubcategoryDeleteAllowed);
}

module.exports = {
  SAFE_ERRORS,
  TAXONOMY_NAME_MAX_LENGTH,
  TAXONOMY_ORDER_MAX,
  TAXONOMY_SLUG_MAX_LENGTH,
  TaxonomyContractError,
  assertCategoryDeleteAllowed,
  assertSubcategoryDeleteAllowed,
  handleCategoryDelete,
  handleCategoryMutation,
  handleProductTaxonomyMutation,
  handleSubcategoryDelete,
  handleSubcategoryMutation,
  normalizedTaxonomyName,
  safeTaxonomyError,
  validateCategoryMutation,
  validateProductTaxonomyMutation,
  validateSubcategoryMutation,
  validateTaxonomyName,
  validateTaxonomyOrder,
  validateTaxonomySlug,
};
