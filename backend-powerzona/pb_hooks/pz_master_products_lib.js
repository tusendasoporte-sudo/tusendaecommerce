/// <reference path="../pb_data/types.d.ts" />

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PAGE_SIZE = 10;
const MAX_VARIATIONS = 500;
const PRODUCT_STATUSES = [
  "all",
  "visible",
  "hidden",
  "out_of_stock",
  "low_stock",
  "with_variations",
  "without_variations",
  "featured",
  "offer",
  "preorder",
];
const PRODUCT_SORTS = [
  "updated_desc",
  "created_desc",
  "name_asc",
  "name_desc",
  "stock_asc",
  "stock_desc",
  "price_asc",
  "price_desc",
];
const PRODUCT_WATCH_FILTERS = ["all", "active", "paused", "none"];
const LOG_MESSAGES = {
  PZ_MASTER_PRODUCTS_LIST_FAILED: "PowerZona master products list failed safely.",
  PZ_MASTER_PRODUCTS_QUERY_FAILED: "PowerZona master products query failed safely.",
  PZ_MASTER_PRODUCT_DETAIL_FAILED: "PowerZona master product detail failed safely.",
  PZ_MASTER_PRODUCT_QUERY_FAILED: "PowerZona master product query failed safely.",
};

function logMasterProducts(code) {
  try {
    $app.logger().error(
      LOG_MESSAGES[code] || LOG_MESSAGES.PZ_MASTER_PRODUCTS_LIST_FAILED,
      "code",
      code
    );
  } catch (_) {}
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function recordString(record, key) {
  if (!record) return "";
  try {
    return String(record.getString(key) || "").trim();
  } catch (_) {
    try {
      return String(record.get(key) || "").trim();
    } catch (_) {
      return "";
    }
  }
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function bodyKeys(body) {
  if (!body || typeof body !== "object") return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function exactPayload(body, allowedKeys) {
  const keys = bodyKeys(body).sort();
  const expected = allowedKeys.slice().sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isValidRecordId(value) {
  return RECORD_ID_PATTERN.test(String(value || "").trim());
}

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function booleanValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function safeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function safeSlug(value) {
  const slug = boundedString(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function safeFilename(value) {
  const filename = String(value || "").trim();
  if (!filename || filename.length > 180) return "";
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) return "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename) ? filename : "";
}

function parseStringArray(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

function orderedImages(filesValue, orderValue) {
  const files = parseStringArray(filesValue).map(safeFilename).filter(Boolean);
  const order = parseStringArray(orderValue).map(safeFilename).filter(Boolean);
  const result = [];
  order.concat(files).forEach((filename) => {
    if (files.includes(filename) && !result.includes(filename) && result.length < 4) result.push(filename);
  });
  return result;
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(named, key)) return named[key];
    if (key[0] !== "#") return " ";
    const hexadecimal = key[1] === "x";
    const number = parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isFinite(number) || number <= 0 || number > 0x10ffff) return " ";
    try {
      return String.fromCodePoint(number);
    } catch (_) {
      return " ";
    }
  });
}

function safeDescription(value) {
  const raw = String(value || "")
    .replace(/<(script|style|template|iframe)[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeHtmlEntities(raw)
    .replace(/[\t\r ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 6000);
}

function safeExtraInfo(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, 3).map((item) => ({
    label: boundedString(item && item.label, 80),
    value: boundedString(item && item.value, 180),
  })).filter((item) => item.label && item.value);
}

function normalizeDeliveryMode(value) {
  const mode = boundedString(value, 20).toLowerCase();
  return ["delivery", "pickup", "both"].includes(mode) ? mode : "both";
}

function isMasterRequest(info) {
  return recordString(info && info.auth, "role") === "master_admin";
}

function findRecordByIdSafe(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function queryRows(app, sql, bindings, model, logCode) {
  const rows = arrayOf(new DynamicModel(model));
  try {
    app.db().newQuery(sql).bind(bindings || {}).all(rows);
    return rows;
  } catch (error) {
    logMasterProducts(logCode);
    throw error;
  }
}

function queryOne(app, sql, bindings, model, logCode) {
  const rows = queryRows(app, sql, bindings, model, logCode);
  return rows.length ? rows[0] : null;
}

function parseListPayload(body) {
  const keys = ["store_id", "page", "status", "search", "category_id", "subcategory_id", "sort", "watch"];
  if (!exactPayload(body, keys)) return null;
  const storeId = bodyValue(body, "store_id");
  const page = bodyValue(body, "page");
  const status = bodyValue(body, "status");
  const search = bodyValue(body, "search");
  const categoryId = bodyValue(body, "category_id");
  const subcategoryId = bodyValue(body, "subcategory_id");
  const sort = bodyValue(body, "sort");
  const watch = bodyValue(body, "watch");
  if (typeof storeId !== "string" || !isValidRecordId(storeId)) return null;
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1) return null;
  if (typeof status !== "string" || !PRODUCT_STATUSES.includes(status)) return null;
  if (typeof search !== "string" || search.length > 100) return null;
  if (typeof categoryId !== "string" || (categoryId && !isValidRecordId(categoryId))) return null;
  if (typeof subcategoryId !== "string" || (subcategoryId && !isValidRecordId(subcategoryId))) return null;
  if (typeof sort !== "string" || !PRODUCT_SORTS.includes(sort)) return null;
  if (typeof watch !== "string" || !PRODUCT_WATCH_FILTERS.includes(watch)) return null;
  return {
    storeId: storeId.trim(),
    page,
    status,
    search: search.trim(),
    categoryId: categoryId.trim(),
    subcategoryId: subcategoryId.trim(),
    sort,
    watch,
  };
}

function parseDetailPayload(body) {
  if (!exactPayload(body, ["store_id", "product_id"])) return null;
  const storeId = bodyValue(body, "store_id");
  const productId = bodyValue(body, "product_id");
  if (typeof storeId !== "string" || !isValidRecordId(storeId)) return null;
  if (typeof productId !== "string" || !isValidRecordId(productId)) return null;
  return { storeId: storeId.trim(), productId: productId.trim() };
}

function storeResponse(record) {
  return {
    id: recordString(record, "id"),
    name: boundedString(recordString(record, "name"), 160) || "Tienda",
    slug: safeSlug(recordString(record, "slug")),
    status: recordString(record, "status").toLowerCase() === "active" ? "active" : "suspended",
  };
}

const PRODUCT_STATE_CTE = `
  WITH variation_stats AS (
    SELECT
      product AS productId,
      COUNT(*) AS variationCount,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS activeVariationCount,
      COALESCE(SUM(CASE WHEN stock > 0 THEN stock ELSE 0 END), 0) AS allVariationsStock,
      COALESCE(SUM(CASE WHEN active = 1 AND stock > 0 THEN stock ELSE 0 END), 0) AS activeVariationsStock,
      MAX(CASE WHEN active = 1 AND stock > 0 THEN 1 ELSE 0 END) AS activeVariationInStock,
      MAX(CASE WHEN active = 1 AND allow_preorder = 1 THEN 1 ELSE 0 END) AS activeVariationPreorder,
      MAX(CASE WHEN is_offer = 1 AND offer_price_usd > 0 AND price_usd > offer_price_usd THEN 1 ELSE 0 END) AS anyVariationOffer,
      MIN(CASE WHEN active = 1 AND price_usd > 0 THEN
        CASE WHEN is_offer = 1 AND offer_price_usd > 0 AND offer_price_usd < price_usd THEN offer_price_usd ELSE price_usd END
      END) AS activeMinPrice,
      MAX(CASE WHEN active = 1 AND price_usd > 0 THEN
        CASE WHEN is_offer = 1 AND offer_price_usd > 0 AND offer_price_usd < price_usd THEN offer_price_usd ELSE price_usd END
      END) AS activeMaxPrice,
      MIN(CASE WHEN price_usd > 0 THEN
        CASE WHEN is_offer = 1 AND offer_price_usd > 0 AND offer_price_usd < price_usd THEN offer_price_usd ELSE price_usd END
      END) AS allMinPrice,
      MAX(CASE WHEN price_usd > 0 THEN
        CASE WHEN is_offer = 1 AND offer_price_usd > 0 AND offer_price_usd < price_usd THEN offer_price_usd ELSE price_usd END
      END) AS allMaxPrice
    FROM product_variations
    GROUP BY product
  ), resolved AS (
    SELECT
      p.id AS productId,
      p.name AS name,
      p.slug AS slug,
      p.active AS active,
      p.featured AS featured,
      p.has_variations AS storedHasVariations,
      p.track_stock AS trackStock,
      p.stock AS storedStock,
      p.allow_preorder AS productPreorder,
      p.base_price_usd AS basePriceUsd,
      p.regular_price_usd AS regularPriceUsd,
      p.offer_price_usd AS offerPriceUsd,
      p.is_offer AS productIsOffer,
      p.category AS categoryId,
      p.subcategory AS subcategoryId,
      p.delivery_mode AS deliveryMode,
      p.only_usd AS onlyUsd,
      p.expiration_date AS expirationDate,
      p.internal_ref AS internalRef,
      p.images AS imagesRaw,
      p.image_order AS imageOrderRaw,
      p.created AS created,
      p.updated AS updated,
      COALESCE(NULLIF((SELECT low_stock_threshold FROM settings WHERE store = p.store LIMIT 1), 0), 3) AS lowStockThreshold,
      COALESCE(mpw.status, 'none') AS watchStatus,
      COALESCE(mpw.started_at, '') AS watchStartedAt,
      COALESCE(c.name, '') AS categoryName,
      COALESCE(c.slug, '') AS categorySlug,
      COALESCE(c.active, 0) AS joinedCategoryActive,
      COALESCE(sc.name, '') AS subcategoryName,
      COALESCE(sc.slug, '') AS subcategorySlug,
      COALESCE(sc.active, 0) AS joinedSubcategoryActive,
      CASE WHEN TRIM(COALESCE(p.category, '')) = '' THEN 1 ELSE COALESCE(c.active, 0) END AS categoryActive,
      CASE WHEN TRIM(COALESCE(p.subcategory, '')) = '' THEN 1 ELSE COALESCE(sc.active, 0) END AS subcategoryActive,
      CASE WHEN COALESCE(p.has_variations, 0) = 1 OR COALESCE(vs.variationCount, 0) > 0 THEN 1 ELSE 0 END AS hasVariations,
      COALESCE(vs.variationCount, 0) AS variationCount,
      COALESCE(vs.activeVariationCount, 0) AS activeVariationCount,
      COALESCE(vs.allVariationsStock, 0) AS allVariationsStock,
      COALESCE(vs.activeVariationsStock, 0) AS activeVariationsStock,
      COALESCE(vs.activeVariationInStock, 0) AS activeVariationInStock,
      COALESCE(vs.activeVariationPreorder, 0) AS activeVariationPreorder,
      COALESCE(vs.activeMinPrice, vs.allMinPrice, 0) AS minVariationPriceUsd,
      COALESCE(vs.activeMaxPrice, vs.allMaxPrice, 0) AS maxVariationPriceUsd,
      CASE WHEN COALESCE(vs.activeVariationCount, 0) > 0 THEN 0 ELSE CASE WHEN COALESCE(vs.variationCount, 0) > 0 THEN 1 ELSE 0 END END AS variationPriceFallback,
      CASE
        WHEN COALESCE(p.is_offer, 0) = 1
          AND COALESCE(p.offer_price_usd, 0) > 0
          AND (COALESCE(p.regular_price_usd, 0) > COALESCE(p.offer_price_usd, 0)
            OR COALESCE(p.base_price_usd, 0) > COALESCE(p.offer_price_usd, 0))
        THEN 1 ELSE 0
      END AS validProductOffer,
      CASE
        WHEN COALESCE(p.is_offer, 0) = 1
          AND COALESCE(p.offer_price_usd, 0) > 0
          AND (COALESCE(p.regular_price_usd, 0) > COALESCE(p.offer_price_usd, 0)
            OR COALESCE(p.base_price_usd, 0) > COALESCE(p.offer_price_usd, 0))
        THEN p.offer_price_usd
        WHEN COALESCE(p.base_price_usd, 0) > 0 THEN p.base_price_usd
        ELSE COALESCE(p.regular_price_usd, 0)
      END AS currentPriceUsd,
      CASE WHEN COALESCE(vs.anyVariationOffer, 0) = 1 THEN 1 ELSE 0 END AS anyVariationOffer
    FROM products p
    LEFT JOIN variation_stats vs ON vs.productId = p.id
    LEFT JOIN categories c ON c.id = p.category AND c.store = p.store
    LEFT JOIN subcategories sc ON sc.id = p.subcategory AND sc.store = p.store
    LEFT JOIN master_product_watches mpw ON mpw.store = p.store AND mpw.product_id_snapshot = p.id
    WHERE p.store = {:storeId}
  ), states AS (
    SELECT
      resolved.*,
      CASE WHEN active = 1 AND categoryActive = 1 AND subcategoryActive = 1 AND {:storeActive} = 1 THEN 1 ELSE 0 END AS publiclyVisible,
      CASE
        WHEN active != 1 THEN 'product_hidden'
        WHEN categoryActive != 1 THEN 'category_hidden'
        WHEN subcategoryActive != 1 THEN 'subcategory_hidden'
        WHEN {:storeActive} != 1 THEN 'store_suspended'
        ELSE 'visible'
      END AS visibilityReason,
      CASE
        WHEN trackStock != 1 THEN 'untracked'
        WHEN hasVariations = 1 AND activeVariationInStock = 1 THEN 'available'
        WHEN hasVariations = 1 AND activeVariationInStock != 1 AND (productPreorder = 1 OR activeVariationPreorder = 1) THEN 'preorder'
        WHEN hasVariations = 1 THEN 'out_of_stock'
        WHEN storedStock > 0 THEN 'available'
        WHEN productPreorder = 1 THEN 'preorder'
        ELSE 'out_of_stock'
      END AS inventoryState,
      CASE
        WHEN trackStock = 1 AND hasVariations = 1 AND activeVariationsStock <= 0 THEN 1
        WHEN trackStock = 1 AND hasVariations != 1 AND storedStock <= 0 THEN 1
        ELSE 0
      END AS noRealStock,
      CASE WHEN productPreorder = 1 OR activeVariationPreorder = 1 THEN 1 ELSE 0 END AS preorderCapable,
      CASE WHEN validProductOffer = 1 OR anyVariationOffer = 1 THEN 1 ELSE 0 END AS effectiveOffer,
      CASE WHEN hasVariations = 1 THEN COALESCE(minVariationPriceUsd, currentPriceUsd) ELSE currentPriceUsd END AS effectiveSortPrice,
      CASE WHEN hasVariations = 1 THEN activeVariationsStock ELSE storedStock END AS effectiveSortStock
    FROM resolved
  )
`;

function categoryRows(app, storeId) {
  return queryRows(app, `
    SELECT id AS categoryId, name AS name, slug AS slug, active AS active
    FROM categories
    WHERE store = {:storeId}
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `, { storeId }, { categoryId: "", name: "", slug: "", active: false }, "PZ_MASTER_PRODUCTS_QUERY_FAILED")
    .map((row) => ({
      id: isValidRecordId(row.categoryId) ? String(row.categoryId) : "",
      name: boundedString(row.name, 160) || "Categoría",
      slug: safeSlug(row.slug),
      active: booleanValue(row.active),
    })).filter((row) => row.id);
}

function subcategoryRows(app, storeId) {
  return queryRows(app, `
    SELECT id AS subcategoryId, category AS categoryId, name AS name, slug AS slug, active AS active
    FROM subcategories
    WHERE store = {:storeId}
    ORDER BY name COLLATE NOCASE ASC, id ASC
  `, { storeId }, { subcategoryId: "", categoryId: "", name: "", slug: "", active: false }, "PZ_MASTER_PRODUCTS_QUERY_FAILED")
    .map((row) => ({
      id: isValidRecordId(row.subcategoryId) ? String(row.subcategoryId) : "",
      category_id: isValidRecordId(row.categoryId) ? String(row.categoryId) : "",
      name: boundedString(row.name, 160) || "Subcategoría",
      slug: safeSlug(row.slug),
      active: booleanValue(row.active),
    })).filter((row) => row.id);
}

function selectedFiltersAreValid(payload, categories, subcategories) {
  const category = payload.categoryId ? categories.find((item) => item.id === payload.categoryId) : null;
  const subcategory = payload.subcategoryId ? subcategories.find((item) => item.id === payload.subcategoryId) : null;
  if (payload.categoryId && !category) return false;
  if (payload.subcategoryId && !subcategory) return false;
  if (category && subcategory && subcategory.category_id !== category.id) return false;
  return true;
}

function escapeLike(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function listWhere(payload) {
  const clauses = [];
  if (payload.status === "visible") clauses.push("publiclyVisible = 1");
  if (payload.status === "hidden") clauses.push("publiclyVisible != 1");
  if (payload.status === "out_of_stock") clauses.push("noRealStock = 1");
  if (payload.status === "low_stock") clauses.push("trackStock = 1 AND effectiveSortStock > 0 AND effectiveSortStock <= lowStockThreshold");
  if (payload.status === "with_variations") clauses.push("hasVariations = 1");
  if (payload.status === "without_variations") clauses.push("hasVariations != 1");
  if (payload.status === "featured") clauses.push("featured = 1");
  if (payload.status === "offer") clauses.push("effectiveOffer = 1");
  if (payload.status === "preorder") clauses.push("preorderCapable = 1");
  if (payload.search) {
    clauses.push("(LOWER(name) LIKE {:searchPattern} ESCAPE '\\' OR LOWER(slug) LIKE {:searchPattern} ESCAPE '\\' OR LOWER(internalRef) LIKE {:searchPattern} ESCAPE '\\')");
  }
  if (payload.categoryId) clauses.push("categoryId = {:categoryId}");
  if (payload.subcategoryId) clauses.push("subcategoryId = {:subcategoryId}");
  if (payload.watch === "active") clauses.push("watchStatus = 'active'");
  if (payload.watch === "paused") clauses.push("watchStatus = 'paused'");
  if (payload.watch === "none") clauses.push("watchStatus = 'none'");
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function listBindings(payload, storeActive) {
  return {
    storeId: payload.storeId,
    storeActive: storeActive ? 1 : 0,
    searchPattern: `%${escapeLike(payload.search.toLowerCase())}%`,
    categoryId: payload.categoryId,
    subcategoryId: payload.subcategoryId,
  };
}

function sortSql(sort) {
  return {
    updated_desc: "datetime(updated) DESC, name COLLATE NOCASE ASC, productId ASC",
    created_desc: "datetime(created) DESC, name COLLATE NOCASE ASC, productId ASC",
    name_asc: "name COLLATE NOCASE ASC, productId ASC",
    name_desc: "name COLLATE NOCASE DESC, productId ASC",
    stock_asc: "effectiveSortStock ASC, name COLLATE NOCASE ASC, productId ASC",
    stock_desc: "effectiveSortStock DESC, name COLLATE NOCASE ASC, productId ASC",
    price_asc: "effectiveSortPrice ASC, name COLLATE NOCASE ASC, productId ASC",
    price_desc: "effectiveSortPrice DESC, name COLLATE NOCASE ASC, productId ASC",
  }[sort] || "datetime(updated) DESC, name COLLATE NOCASE ASC, productId ASC";
}

function summaryRow(app, bindings) {
  const row = queryOne(app, `${PRODUCT_STATE_CTE}
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(publiclyVisible), 0) AS publiclyVisible,
      COALESCE(SUM(CASE WHEN active != 1 OR categoryActive != 1 OR subcategoryActive != 1 THEN 1 ELSE 0 END), 0) AS hidden,
      COALESCE(SUM(noRealStock), 0) AS outOfStock,
      COALESCE(SUM(hasVariations), 0) AS withVariations,
      COALESCE(SUM(CASE WHEN featured = 1 THEN 1 ELSE 0 END), 0) AS featured,
      COALESCE(SUM(effectiveOffer), 0) AS offers,
      COALESCE(SUM(preorderCapable), 0) AS preorder
    FROM states
  `, bindings, {
    total: 0,
    publiclyVisible: 0,
    hidden: 0,
    outOfStock: 0,
    withVariations: 0,
    featured: 0,
    offers: 0,
    preorder: 0,
  }, "PZ_MASTER_PRODUCTS_QUERY_FAILED") || {};
  return {
    total: nonNegativeInteger(row.total),
    publicly_visible: nonNegativeInteger(row.publiclyVisible),
    hidden: nonNegativeInteger(row.hidden),
    out_of_stock: nonNegativeInteger(row.outOfStock),
    with_variations: nonNegativeInteger(row.withVariations),
    featured: nonNegativeInteger(row.featured),
    offers: nonNegativeInteger(row.offers),
    preorder: nonNegativeInteger(row.preorder),
  };
}

function relationSummary(id, name, slug, active, fallbackName) {
  if (!isValidRecordId(id) || !boundedString(name, 160)) return null;
  return {
    id: String(id),
    name: boundedString(name, 160) || fallbackName,
    slug: safeSlug(slug),
    active: booleanValue(active),
  };
}

function mapListItem(row) {
  const images = orderedImages(row.imagesRaw, row.imageOrderRaw);
  const hasVariations = booleanValue(row.hasVariations);
  return {
    id: isValidRecordId(row.productId) ? String(row.productId) : "",
    name: boundedString(row.name, 180) || "Producto",
    slug: safeSlug(row.slug),
    active: booleanValue(row.active),
    category_active: booleanValue(row.categoryActive),
    subcategory_active: booleanValue(row.subcategoryActive),
    publicly_visible: booleanValue(row.publiclyVisible),
    visibility_reason: boundedString(row.visibilityReason, 40),
    featured: booleanValue(row.featured),
    has_variations: hasVariations,
    variation_count: nonNegativeInteger(row.variationCount),
    active_variation_count: nonNegativeInteger(row.activeVariationCount),
    track_stock: booleanValue(row.trackStock),
    stored_stock: finiteNumber(row.storedStock),
    all_variations_stock: finiteNumber(row.allVariationsStock),
    active_variations_stock: finiteNumber(row.activeVariationsStock),
    allow_preorder: booleanValue(row.preorderCapable),
    inventory_state: boundedString(row.inventoryState, 30),
    base_price_usd: finiteNumber(row.basePriceUsd),
    regular_price_usd: finiteNumber(row.regularPriceUsd),
    offer_price_usd: finiteNumber(row.offerPriceUsd),
    is_offer: booleanValue(row.effectiveOffer),
    current_price_usd: finiteNumber(row.currentPriceUsd),
    min_variation_price_usd: hasVariations && row.minVariationPriceUsd != null ? finiteNumber(row.minVariationPriceUsd) : null,
    max_variation_price_usd: hasVariations && row.maxVariationPriceUsd != null ? finiteNumber(row.maxVariationPriceUsd) : null,
    variation_price_fallback: booleanValue(row.variationPriceFallback),
    category: relationSummary(row.categoryId, row.categoryName, row.categorySlug, row.joinedCategoryActive, "Categoría"),
    subcategory: relationSummary(row.subcategoryId, row.subcategoryName, row.subcategorySlug, row.joinedSubcategoryActive, "Subcategoría"),
    delivery_mode: normalizeDeliveryMode(row.deliveryMode),
    only_usd: booleanValue(row.onlyUsd),
    expiration_date: safeIsoDate(row.expirationDate),
    internal_ref: boundedString(row.internalRef, 160),
    primary_image: images[0] || "",
    created: safeIsoDate(row.created),
    updated: safeIsoDate(row.updated),
    watch_status: ["active", "paused"].includes(String(row.watchStatus || "")) ? String(row.watchStatus) : "none",
    watch_started_at: safeIsoDate(row.watchStartedAt),
  };
}

function listProducts(app, payload, storeActive) {
  const bindings = listBindings(payload, storeActive);
  const where = listWhere(payload);
  const count = queryOne(app, `${PRODUCT_STATE_CTE}
    SELECT COUNT(*) AS totalItems FROM states ${where}
  `, bindings, { totalItems: 0 }, "PZ_MASTER_PRODUCTS_QUERY_FAILED") || {};
  const totalItems = nonNegativeInteger(count.totalItems);
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const page = Math.min(payload.page, totalPages);
  const pageBindings = Object.assign({}, bindings, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const model = {
    productId: "", name: "", slug: "", active: false, featured: false,
    trackStock: false, storedStock: 0, basePriceUsd: 0, regularPriceUsd: 0,
    offerPriceUsd: 0, categoryId: "", subcategoryId: "", deliveryMode: "",
    onlyUsd: false, expirationDate: "", internalRef: "", imagesRaw: "", imageOrderRaw: "",
    created: "", updated: "", watchStatus: "", watchStartedAt: "", categoryName: "", categorySlug: "", joinedCategoryActive: false,
    subcategoryName: "", subcategorySlug: "", joinedSubcategoryActive: false,
    categoryActive: false, subcategoryActive: false, hasVariations: false, variationCount: 0,
    activeVariationCount: 0, allVariationsStock: 0, activeVariationsStock: 0,
    minVariationPriceUsd: 0, maxVariationPriceUsd: 0, variationPriceFallback: false,
    currentPriceUsd: 0, publiclyVisible: false, visibilityReason: "", inventoryState: "",
    noRealStock: false, preorderCapable: false, effectiveOffer: false,
  };
  const items = queryRows(app, `${PRODUCT_STATE_CTE}
    SELECT * FROM states
    ${where}
    ORDER BY ${sortSql(payload.sort)}
    LIMIT {:limit} OFFSET {:offset}
  `, pageBindings, model, "PZ_MASTER_PRODUCTS_QUERY_FAILED").map(mapListItem).filter((item) => item.id);
  return {
    page,
    per_page: PAGE_SIZE,
    total_items: totalItems,
    total_pages: totalPages,
    items,
  };
}

function handleStoreProducts(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const payload = parseListPayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });

    const storeRecord = findRecordByIdSafe($app, "stores", payload.storeId);
    if (!storeRecord) return e.json(404, { ok: false, error: "store_not_found" });
    const store = storeResponse(storeRecord);
    const categories = categoryRows($app, payload.storeId);
    const subcategories = subcategoryRows($app, payload.storeId);
    if (!selectedFiltersAreValid(payload, categories, subcategories)) {
      return e.json(400, { ok: false, error: "invalid_payload" });
    }
    const bindings = listBindings(payload, store.status === "active");
    return e.json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      store,
      summary: summaryRow($app, bindings),
      filters: { categories, subcategories },
      page: listProducts($app, payload, store.status === "active"),
    });
  } catch (_) {
    logMasterProducts("PZ_MASTER_PRODUCTS_LIST_FAILED");
    return e.json(500, { ok: false, error: "products_failed" });
  }
}

function detailProductRow(app, storeId, productId, storeActive) {
  return queryOne(app, `
    SELECT
      p.id AS productId,
      p.name AS name,
      p.slug AS slug,
      p.description AS descriptionRaw,
      p.images AS imagesRaw,
      p.image_order AS imageOrderRaw,
      p.active AS active,
      p.featured AS featured,
      p.featured_order AS featuredOrder,
      p.category AS categoryId,
      p.subcategory AS subcategoryId,
      p.base_price_usd AS basePriceUsd,
      p.regular_price_usd AS regularPriceUsd,
      p.offer_price_usd AS offerPriceUsd,
      p.is_offer AS isOffer,
      p.stock AS stock,
      p.track_stock AS trackStock,
      p.has_variations AS hasVariations,
      p.variation_view AS variationView,
      p.allow_preorder AS allowPreorder,
      p.only_usd AS onlyUsd,
      p.delivery_mode AS deliveryMode,
      p.expiration_date AS expirationDate,
      p.internal_ref AS internalRef,
      p.extra_info AS extraInfoRaw,
      p.related_products AS relatedProductsRaw,
      p.created AS created,
      p.updated AS updated,
      COALESCE(c.name, '') AS categoryName,
      COALESCE(c.slug, '') AS categorySlug,
      COALESCE(c.active, 0) AS joinedCategoryActive,
      COALESCE(sc.name, '') AS subcategoryName,
      COALESCE(sc.slug, '') AS subcategorySlug,
      COALESCE(sc.active, 0) AS joinedSubcategoryActive,
      CASE WHEN TRIM(COALESCE(p.category, '')) = '' THEN 1 ELSE COALESCE(c.active, 0) END AS categoryActive,
      CASE WHEN TRIM(COALESCE(p.subcategory, '')) = '' THEN 1 ELSE COALESCE(sc.active, 0) END AS subcategoryActive,
      CASE
        WHEN p.active != 1 THEN 'product_hidden'
        WHEN TRIM(COALESCE(p.category, '')) != '' AND COALESCE(c.active, 0) != 1 THEN 'category_hidden'
        WHEN TRIM(COALESCE(p.subcategory, '')) != '' AND COALESCE(sc.active, 0) != 1 THEN 'subcategory_hidden'
        WHEN {:storeActive} != 1 THEN 'store_suspended'
        ELSE 'visible'
      END AS visibilityReason,
      CASE
        WHEN p.active = 1
          AND (TRIM(COALESCE(p.category, '')) = '' OR COALESCE(c.active, 0) = 1)
          AND (TRIM(COALESCE(p.subcategory, '')) = '' OR COALESCE(sc.active, 0) = 1)
          AND {:storeActive} = 1
        THEN 1 ELSE 0
      END AS publiclyVisible
    FROM products p
    LEFT JOIN categories c ON c.id = p.category AND c.store = p.store
    LEFT JOIN subcategories sc ON sc.id = p.subcategory AND sc.store = p.store
    WHERE p.id = {:productId} AND p.store = {:storeId}
    LIMIT 1
  `, { storeId, productId, storeActive: storeActive ? 1 : 0 }, {
    productId: "", name: "", slug: "", descriptionRaw: "", imagesRaw: "", imageOrderRaw: "",
    active: false, featured: false, featuredOrder: 0, categoryId: "", subcategoryId: "",
    basePriceUsd: 0, regularPriceUsd: 0, offerPriceUsd: 0, isOffer: false, stock: 0,
    trackStock: false, hasVariations: false, variationView: "", allowPreorder: false,
    onlyUsd: false, deliveryMode: "", expirationDate: "", internalRef: "", extraInfoRaw: "",
    relatedProductsRaw: "", created: "", updated: "", categoryName: "", categorySlug: "",
    joinedCategoryActive: false, subcategoryName: "", subcategorySlug: "", joinedSubcategoryActive: false,
    categoryActive: false, subcategoryActive: false, visibilityReason: "", publiclyVisible: false,
  }, "PZ_MASTER_PRODUCT_QUERY_FAILED");
}

function validOffer(regularValue, offerValue, enabled) {
  const regular = finiteNumber(regularValue);
  const offer = finiteNumber(offerValue);
  return booleanValue(enabled) && regular > 0 && offer > 0 && offer < regular;
}

function variationRows(app, productId) {
  const count = queryOne(app, `
    SELECT COUNT(*) AS total FROM product_variations WHERE product = {:productId}
  `, { productId }, { total: 0 }, "PZ_MASTER_PRODUCT_QUERY_FAILED") || {};
  const total = nonNegativeInteger(count.total);
  const rows = queryRows(app, `
    SELECT
      id AS variationId,
      variation_type AS variationType,
      value AS value,
      active AS active,
      price_usd AS priceUsd,
      offer_price_usd AS offerPriceUsd,
      is_offer AS isOffer,
      stock AS stock,
      allow_preorder AS allowPreorder,
      internal_ref AS internalRef,
      sort_order AS sortOrder,
      expiration_date AS expirationDate,
      image AS imageRaw,
      created AS created,
      updated AS updated
    FROM product_variations
    WHERE product = {:productId}
    ORDER BY sort_order ASC, datetime(created) ASC, id ASC
    LIMIT {:limit}
  `, { productId, limit: MAX_VARIATIONS }, {
    variationId: "", variationType: "", value: "", active: false, priceUsd: 0,
    offerPriceUsd: 0, isOffer: false, stock: 0, allowPreorder: false,
    internalRef: "", sortOrder: 0, expirationDate: "", imageRaw: "", created: "", updated: "",
  }, "PZ_MASTER_PRODUCT_QUERY_FAILED").map((row) => {
    const regular = finiteNumber(row.priceUsd);
    const offer = finiteNumber(row.offerPriceUsd);
    const offerActive = validOffer(regular, offer, row.isOffer);
    const stock = finiteNumber(row.stock);
    const preorder = booleanValue(row.allowPreorder);
    const type = boundedString(row.variationType, 100);
    const value = boundedString(row.value, 120);
    const images = parseStringArray(row.imageRaw).map(safeFilename).filter(Boolean);
    return {
      id: isValidRecordId(row.variationId) ? String(row.variationId) : "",
      variation_type: type,
      value,
      label: type && value ? `${type}: ${value}`.slice(0, 220) : value || type || "Variación",
      active: booleanValue(row.active),
      price_usd: regular,
      offer_price_usd: offer,
      is_offer: offerActive,
      current_price_usd: offerActive ? offer : regular,
      stock,
      allow_preorder: preorder,
      inventory_state: stock > 0 ? "available" : preorder ? "preorder" : "out_of_stock",
      internal_ref: boundedString(row.internalRef, 160),
      sort_order: finiteNumber(row.sortOrder),
      expiration_date: safeIsoDate(row.expirationDate),
      image: images[0] || "",
      created: safeIsoDate(row.created),
      updated: safeIsoDate(row.updated),
    };
  }).filter((row) => row.id);
  return { total, truncated: total > MAX_VARIATIONS, rows };
}

function relatedRows(app, storeId, storeActive, ids) {
  const safeIds = ids.filter(isValidRecordId).slice(0, 4);
  if (!safeIds.length) return [];
  const padded = safeIds.concat(["", "", "", ""]).slice(0, 4);
  const rows = queryRows(app, `
    SELECT
      p.id AS productId,
      p.name AS name,
      p.slug AS slug,
      p.active AS active,
      p.images AS imagesRaw,
      p.image_order AS imageOrderRaw,
      CASE
        WHEN p.active = 1
          AND (TRIM(COALESCE(p.category, '')) = '' OR COALESCE(c.active, 0) = 1)
          AND (TRIM(COALESCE(p.subcategory, '')) = '' OR COALESCE(sc.active, 0) = 1)
          AND {:storeActive} = 1
        THEN 1 ELSE 0
      END AS publiclyVisible
    FROM products p
    LEFT JOIN categories c ON c.id = p.category AND c.store = p.store
    LEFT JOIN subcategories sc ON sc.id = p.subcategory AND sc.store = p.store
    WHERE p.store = {:storeId}
      AND (p.id = {:id0} OR p.id = {:id1} OR p.id = {:id2} OR p.id = {:id3})
  `, {
    storeId,
    storeActive: storeActive ? 1 : 0,
    id0: padded[0], id1: padded[1], id2: padded[2], id3: padded[3],
  }, {
    productId: "", name: "", slug: "", active: false, imagesRaw: "", imageOrderRaw: "", publiclyVisible: false,
  }, "PZ_MASTER_PRODUCT_QUERY_FAILED");
  const byId = new Map(rows.map((row) => [String(row.productId || ""), row]));
  return safeIds.map((id) => byId.get(id)).filter(Boolean).map((row) => ({
    id: String(row.productId),
    name: boundedString(row.name, 180) || "Producto",
    slug: safeSlug(row.slug),
    active: booleanValue(row.active),
    publicly_visible: booleanValue(row.publiclyVisible),
    primary_image: orderedImages(row.imagesRaw, row.imageOrderRaw)[0] || "",
  }));
}

function mapProductDetail(row, variationsTotal, relatedProductCount) {
  const base = finiteNumber(row.basePriceUsd);
  const regular = finiteNumber(row.regularPriceUsd) > 0 ? finiteNumber(row.regularPriceUsd) : base;
  const offer = finiteNumber(row.offerPriceUsd);
  const offerActive = validOffer(Math.max(regular, base), offer, row.isOffer);
  const variationView = boundedString(row.variationView, 20).toLowerCase();
  return {
    id: String(row.productId),
    name: boundedString(row.name, 180) || "Producto",
    slug: safeSlug(row.slug),
    description_text: safeDescription(row.descriptionRaw),
    images: orderedImages(row.imagesRaw, row.imageOrderRaw),
    active: booleanValue(row.active),
    category_active: booleanValue(row.categoryActive),
    subcategory_active: booleanValue(row.subcategoryActive),
    publicly_visible: booleanValue(row.publiclyVisible),
    visibility_reason: boundedString(row.visibilityReason, 40),
    featured: booleanValue(row.featured),
    featured_order: finiteNumber(row.featuredOrder),
    category: relationSummary(row.categoryId, row.categoryName, row.categorySlug, row.joinedCategoryActive, "Categoría"),
    subcategory: relationSummary(row.subcategoryId, row.subcategoryName, row.subcategorySlug, row.joinedSubcategoryActive, "Subcategoría"),
    base_price_usd: base,
    regular_price_usd: regular,
    offer_price_usd: offer,
    is_offer: offerActive,
    current_price_usd: offerActive ? offer : base,
    stock: finiteNumber(row.stock),
    track_stock: booleanValue(row.trackStock),
    has_variations: booleanValue(row.hasVariations) || variationsTotal > 0,
    variation_view: ["buttons", "dropdown", "checkbox"].includes(variationView) ? variationView : "buttons",
    allow_preorder: booleanValue(row.allowPreorder),
    only_usd: booleanValue(row.onlyUsd),
    delivery_mode: normalizeDeliveryMode(row.deliveryMode),
    expiration_date: safeIsoDate(row.expirationDate),
    internal_ref: boundedString(row.internalRef, 160),
    extra_info: safeExtraInfo(row.extraInfoRaw),
    created: safeIsoDate(row.created),
    updated: safeIsoDate(row.updated),
    related_product_count: nonNegativeInteger(relatedProductCount),
  };
}

function handleStoreProductDetail(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRequest(info)) return e.json(403, { ok: false, error: "unauthorized" });
    const payload = parseDetailPayload(info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });

    const storeRecord = findRecordByIdSafe($app, "stores", payload.storeId);
    if (!storeRecord) return e.json(404, { ok: false, error: "store_not_found" });
    const store = storeResponse(storeRecord);
    const row = detailProductRow($app, payload.storeId, payload.productId, store.status === "active");
    if (!row || !isValidRecordId(row.productId)) {
      return e.json(404, { ok: false, error: "product_not_found" });
    }
    const variations = variationRows($app, payload.productId);
    const relatedIds = parseStringArray(row.relatedProductsRaw).filter(isValidRecordId).slice(0, 4);
    const related = relatedRows($app, payload.storeId, store.status === "active", relatedIds);
    return e.json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      store,
      product: mapProductDetail(row, variations.total, related.length),
      variations: variations.rows,
      variations_truncated: variations.truncated,
      variations_total: variations.total,
      related_products: related,
    });
  } catch (_) {
    logMasterProducts("PZ_MASTER_PRODUCT_DETAIL_FAILED");
    return e.json(500, { ok: false, error: "product_failed" });
  }
}

module.exports = {
  handleStoreProductDetail,
  handleStoreProducts,
  requireAuthenticatedUser,
};
