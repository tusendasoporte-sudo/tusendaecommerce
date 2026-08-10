/// <reference path="../pb_data/types.d.ts" />

const permissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);

const SELECTOR_PERMISSIONS = Object.freeze([
  "promotions.manage",
  "coupons.manage",
]);
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const PRODUCT_LIMIT = 200;
const MAX_SELECTOR_REFS = 100;
const PRODUCT_RESULT_LIMIT = PRODUCT_LIMIT + MAX_SELECTOR_REFS;
const DEFAULT_TAXONOMY_PER_PAGE = 100;
const MAX_TAXONOMY_PER_PAGE = 100;
const TAXONOMY_RESULT_LIMIT = MAX_SELECTOR_REFS + MAX_TAXONOMY_PER_PAGE + 1;

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  return String(value === null || value === undefined ? "" : value).trim();
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") {
    try {
      const value = body.get(key);
      if (value !== undefined) return value;
    } catch (_) {}
  }
  return body[key];
}

function parseSelectorsPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const keys = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  if (keys.some((key) => ![
    "refs", "search", "taxonomy_page", "taxonomy_per_page",
  ].includes(key))) return null;
  const result = {
    search: "",
    taxonomyPage: 1,
    taxonomyPerPage: DEFAULT_TAXONOMY_PER_PAGE,
  };
  if (keys.includes("search")) {
    const search = bodyValue(body, "search");
    if (typeof search !== "string") return null;
    const normalized = search.trim();
    if (normalized.length > 100 || /[\u0000-\u001f\u007f]/.test(normalized)) return null;
    result.search = normalized;
  }
  if (keys.includes("refs")) {
    const refs = bodyValue(body, "refs");
    if (!Array.isArray(refs) || refs.length > MAX_SELECTOR_REFS) return null;
    const normalizedRefs = [];
    for (const rawRef of refs) {
      if (typeof rawRef !== "string") return null;
      const ref = rawRef.trim();
      if (!RECORD_ID_PATTERN.test(ref)) return null;
      if (!normalizedRefs.includes(ref)) normalizedRefs.push(ref);
    }
    result.refs = normalizedRefs;
  }
  if (keys.includes("taxonomy_page")) {
    const page = bodyValue(body, "taxonomy_page");
    if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > 100000) return null;
    result.taxonomyPage = page;
  }
  if (keys.includes("taxonomy_per_page")) {
    const perPage = bodyValue(body, "taxonomy_per_page");
    if (typeof perPage !== "number" || !Number.isInteger(perPage)
      || perPage < 1 || perPage > MAX_TAXONOMY_PER_PAGE) return null;
    result.taxonomyPerPage = perPage;
  }
  return result;
}

function setPrivateHeaders(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function requireAuthenticatedUser(e) {
  setPrivateHeaders(e);
  if (!e.auth) return e.json(403, { ok: false, error: "unauthorized" });
  return e.next();
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function headerValue(info, name) {
  const target = String(name || "").toLowerCase();
  const headers = info && info.headers || {};
  try {
    if (typeof headers.get === "function") return recordString({ value: headers.get(name) || headers.get(target) }, "value");
  } catch (_) {}
  const key = Object.keys(headers).find((candidate) => String(candidate).toLowerCase() === target);
  return key ? String(headers[key] || "").trim().slice(0, 80) : "";
}

function loadStoreContext(app, auth, supportStoreId) {
  const actorId = recordString(auth, "id");
  if (!RECORD_ID_PATTERN.test(actorId)) return null;
  const actor = findRecord(app, "users", actorId);
  if (!actor) return null;
  const role = recordString(actor, "role");
  const master = role === "master_admin" && recordString(actor, "status") === "active";
  const storeId = master ? String(supportStoreId || "").trim().slice(0, 15) : relationId(actor, "store");
  if ((!master && !["store_admin", "store_staff"].includes(role))
    || recordString(actor, "status") !== "active"
    || !RECORD_ID_PATTERN.test(storeId)) return null;
  const store = findRecord(app, "stores", storeId);
  if (!store || (!master && recordString(store, "status") !== "active")) return null;
  if (!master && permissions.isBlockedByPlan(app, actor, store)) return null;
  return { actor, store, storeId, master };
}

function hasSelectorPermission(app, context) {
  if (context && context.master) return true;
  return SELECTOR_PERMISSIONS.some((permission) => (
    permissions.hasStorePermission(app, context.actor, context.store, permission)
  ));
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function searchBindings(storeId, search, refs) {
  const escaped = String(search || "").toLowerCase().replace(/[\\%_]/g, "\\$&");
  return {
    storeId,
    hasSearch: escaped ? 1 : 0,
    search: `%${escaped}%`,
    refsJson: JSON.stringify(Array.isArray(refs) ? refs : []),
  };
}

function taxonomyBindings(storeId, search, refs, page, perPage) {
  const escaped = String(search || "").toLowerCase().replace(/[\\%_]/g, "\\$&");
  const offset = (page - 1) * perPage;
  return {
    storeId,
    hasSearch: escaped ? 1 : 0,
    search: `%${escaped}%`,
    refsJson: JSON.stringify(Array.isArray(refs) ? refs : []),
    taxonomyOffset: offset,
    taxonomyEnd: offset + perPage + 1,
  };
}

function safeText(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function safeSlug(value) {
  const slug = safeText(value, 120).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

function visibleValue(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function opaqueRef(value) {
  const ref = safeText(value, 15);
  return RECORD_ID_PATTERN.test(ref) ? ref : "";
}

function safeFileName(value) {
  const name = safeText(value, 220);
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) return "";
  return name;
}

function thumbnailUrl(collection, ref, value) {
  const file = safeFileName(value);
  if (!file || !opaqueRef(ref)) return "";
  return `/api/files/${collection}/${ref}/${encodeURIComponent(file)}?thumb=120x120`;
}

function publicPath(storeSlug, type, slug) {
  const safeStoreSlug = safeSlug(storeSlug);
  const safeEntitySlug = safeSlug(slug);
  if (!safeStoreSlug || !safeEntitySlug) return "";
  const segment = type === "product" ? "producto" : (type === "category" ? "categoria" : "subcategoria");
  return `/t/${safeStoreSlug}/${segment}/${safeEntitySlug}`;
}

function queryProducts(app, context, search, refs) {
  return queryRows(app, `
    /* pz-selector:products */
    WITH input_refs(ref) AS (
      SELECT CAST(value AS TEXT)
      FROM json_each({:refsJson})
      WHERE json_each.type = 'text'
    ), candidates AS (
      SELECT
        products.id AS ref,
        products.name AS name,
        products.slug AS slug,
        products.active AS visible,
        CASE
          WHEN json_valid(products.images) THEN COALESCE(json_extract(products.images, '$[0]'), '')
          ELSE ''
        END AS thumbnail,
        COALESCE(categories.id, '') AS categoryRef,
        COALESCE(categories.name, '') AS categoryName,
        COALESCE(subcategories.id, '') AS subcategoryRef,
        COALESCE(subcategories.name, '') AS subcategoryName,
        CASE WHEN EXISTS (
          SELECT 1 FROM input_refs WHERE input_refs.ref = products.id
        ) THEN 0 ELSE 1 END AS requestedPriority
      FROM products
      LEFT JOIN categories
        ON categories.id = products.category AND categories.store = products.store
      LEFT JOIN subcategories
        ON subcategories.id = products.subcategory AND subcategories.store = products.store
      WHERE products.store = {:storeId}
        AND (
          EXISTS (SELECT 1 FROM input_refs WHERE input_refs.ref = products.id)
          OR {:hasSearch} = 0
          OR LOWER(products.name) LIKE {:search} ESCAPE '\\'
          OR LOWER(products.slug) LIKE {:search} ESCAPE '\\'
          OR LOWER(COALESCE(categories.name, '')) LIKE {:search} ESCAPE '\\'
          OR LOWER(COALESCE(subcategories.name, '')) LIKE {:search} ESCAPE '\\'
        )
    ), ranked AS (
      SELECT
        candidates.*,
        ROW_NUMBER() OVER (
          PARTITION BY requestedPriority
          ORDER BY name COLLATE NOCASE ASC, ref ASC
        ) AS selectorRank
      FROM candidates
    )
    SELECT
      ref, name, slug, visible, thumbnail,
      categoryRef, categoryName, subcategoryRef, subcategoryName
    FROM ranked
    WHERE requestedPriority = 0 OR selectorRank <= ${PRODUCT_LIMIT}
    ORDER BY requestedPriority ASC, name COLLATE NOCASE ASC, ref ASC
    LIMIT ${PRODUCT_RESULT_LIMIT}
  `, searchBindings(context.storeId, search, refs), {
    ref: "",
    name: "",
    slug: "",
    visible: false,
    thumbnail: "",
    categoryRef: "",
    categoryName: "",
    subcategoryRef: "",
    subcategoryName: "",
  }).map((row) => {
    const ref = opaqueRef(row.ref);
    const slug = safeSlug(row.slug);
    return {
      ref,
      name: safeText(row.name, 160),
      slug,
      public_path: publicPath(recordString(context.store, "slug"), "product", slug),
      thumbnail_url: thumbnailUrl("products", ref, row.thumbnail),
      category_ref: opaqueRef(row.categoryRef),
      category_name: safeText(row.categoryName, 160),
      subcategory_ref: opaqueRef(row.subcategoryRef),
      subcategory_name: safeText(row.subcategoryName, 160),
      visible: visibleValue(row.visible),
    };
  }).filter((item) => item.ref && item.name);
}

function taxonomyPageResult(rows, perPage, mapper) {
  const requested = [];
  const regular = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const item = mapper(row);
    if (!item) return;
    if (Number(row.requestedPriority) === 0) requested.push(item);
    else regular.push(item);
  });
  return {
    items: [...requested, ...regular.slice(0, perPage)],
    hasMore: regular.length > perPage,
  };
}

function queryCategories(app, context, search, refs, page, perPage) {
  const rows = queryRows(app, `
    /* pz-selector:categories */
    WITH input_refs(ref) AS (
      SELECT CAST(value AS TEXT)
      FROM json_each({:refsJson})
      WHERE json_each.type = 'text'
    ), requested_categories(ref) AS (
      SELECT categories.id
      FROM categories
      INNER JOIN input_refs ON input_refs.ref = categories.id
      WHERE categories.store = {:storeId}
      UNION
      SELECT products.category
      FROM products
      INNER JOIN input_refs ON input_refs.ref = products.id
      WHERE products.store = {:storeId}
        AND TRIM(COALESCE(products.category, '')) <> ''
      UNION
      SELECT subcategories.category
      FROM subcategories
      INNER JOIN input_refs ON input_refs.ref = subcategories.id
      WHERE subcategories.store = {:storeId}
        AND TRIM(COALESCE(subcategories.category, '')) <> ''
    ), candidates AS (
      SELECT
        categories.id AS ref,
        categories.name AS name,
        categories.slug AS slug,
        categories.active AS visible,
        categories.image AS thumbnail,
        CASE WHEN EXISTS (
          SELECT 1 FROM requested_categories WHERE requested_categories.ref = categories.id
        ) THEN 0 ELSE 1 END AS requestedPriority
      FROM categories
      WHERE categories.store = {:storeId}
        AND (
          EXISTS (SELECT 1 FROM requested_categories WHERE requested_categories.ref = categories.id)
          OR {:hasSearch} = 0
          OR LOWER(categories.name) LIKE {:search} ESCAPE '\\'
          OR LOWER(categories.slug) LIKE {:search} ESCAPE '\\'
        )
    ), ranked AS (
      SELECT
        candidates.*,
        ROW_NUMBER() OVER (
          PARTITION BY requestedPriority
          ORDER BY name COLLATE NOCASE ASC, ref ASC
        ) AS selectorRank
      FROM candidates
    )
    SELECT ref, name, slug, visible, thumbnail, requestedPriority
    FROM ranked
    WHERE requestedPriority = 0 OR (
      selectorRank > {:taxonomyOffset} AND selectorRank <= {:taxonomyEnd}
    )
    ORDER BY requestedPriority ASC, name COLLATE NOCASE ASC, ref ASC
    LIMIT ${TAXONOMY_RESULT_LIMIT}
  `, taxonomyBindings(context.storeId, search, refs, page, perPage), {
    ref: "",
    name: "",
    slug: "",
    visible: false,
    thumbnail: "",
    requestedPriority: 1,
  });
  return taxonomyPageResult(rows, perPage, (row) => {
    const ref = opaqueRef(row.ref);
    const slug = safeSlug(row.slug);
    const item = {
      ref,
      name: safeText(row.name, 160),
      slug,
      public_path: publicPath(recordString(context.store, "slug"), "category", slug),
      thumbnail_url: thumbnailUrl("categories", ref, row.thumbnail),
      visible: visibleValue(row.visible),
    };
    return item.ref && item.name ? item : null;
  });
}

function querySubcategories(app, context, search, refs, page, perPage) {
  const rows = queryRows(app, `
    /* pz-selector:subcategories */
    WITH input_refs(ref) AS (
      SELECT CAST(value AS TEXT)
      FROM json_each({:refsJson})
      WHERE json_each.type = 'text'
    ), requested_subcategories(ref) AS (
      SELECT subcategories.id
      FROM subcategories
      INNER JOIN input_refs ON input_refs.ref = subcategories.id
      WHERE subcategories.store = {:storeId}
      UNION
      SELECT products.subcategory
      FROM products
      INNER JOIN input_refs ON input_refs.ref = products.id
      WHERE products.store = {:storeId}
        AND TRIM(COALESCE(products.subcategory, '')) <> ''
    ), candidates AS (
      SELECT
        subcategories.id AS ref,
        subcategories.name AS name,
        subcategories.slug AS slug,
        subcategories.active AS visible,
        COALESCE(categories.id, '') AS categoryRef,
        COALESCE(categories.name, '') AS categoryName,
        CASE WHEN EXISTS (
          SELECT 1 FROM requested_subcategories WHERE requested_subcategories.ref = subcategories.id
        ) THEN 0 ELSE 1 END AS requestedPriority
      FROM subcategories
      LEFT JOIN categories
        ON categories.id = subcategories.category AND categories.store = subcategories.store
      WHERE subcategories.store = {:storeId}
        AND (
          EXISTS (SELECT 1 FROM requested_subcategories WHERE requested_subcategories.ref = subcategories.id)
          OR {:hasSearch} = 0
          OR LOWER(subcategories.name) LIKE {:search} ESCAPE '\\'
          OR LOWER(subcategories.slug) LIKE {:search} ESCAPE '\\'
          OR LOWER(COALESCE(categories.name, '')) LIKE {:search} ESCAPE '\\'
        )
    ), ranked AS (
      SELECT
        candidates.*,
        ROW_NUMBER() OVER (
          PARTITION BY requestedPriority
          ORDER BY name COLLATE NOCASE ASC, ref ASC
        ) AS selectorRank
      FROM candidates
    )
    SELECT ref, name, slug, visible, categoryRef, categoryName, requestedPriority
    FROM ranked
    WHERE requestedPriority = 0 OR (
      selectorRank > {:taxonomyOffset} AND selectorRank <= {:taxonomyEnd}
    )
    ORDER BY requestedPriority ASC, name COLLATE NOCASE ASC, ref ASC
    LIMIT ${TAXONOMY_RESULT_LIMIT}
  `, taxonomyBindings(context.storeId, search, refs, page, perPage), {
    ref: "",
    name: "",
    slug: "",
    visible: false,
    categoryRef: "",
    categoryName: "",
    requestedPriority: 1,
  });
  return taxonomyPageResult(rows, perPage, (row) => {
    const ref = opaqueRef(row.ref);
    const slug = safeSlug(row.slug);
    const item = {
      ref,
      name: safeText(row.name, 160),
      slug,
      public_path: publicPath(recordString(context.store, "slug"), "subcategory", slug),
      thumbnail_url: "",
      category_ref: opaqueRef(row.categoryRef),
      category_name: safeText(row.categoryName, 160),
      visible: visibleValue(row.visible),
    };
    return item.ref && item.name ? item : null;
  });
}

function buildSelectors(
  app,
  context,
  search,
  refs,
  taxonomyPage = 1,
  taxonomyPerPage = DEFAULT_TAXONOMY_PER_PAGE,
) {
  // Keep the query order stable for observability and run the bounded product
  // lookup only on the first taxonomy page.
  const products = taxonomyPage === 1 ? queryProducts(app, context, search, refs) : [];
  const categoryPage = queryCategories(
    app, context, search, refs, taxonomyPage, taxonomyPerPage,
  );
  const subcategoryPage = querySubcategories(
    app, context, search, refs, taxonomyPage, taxonomyPerPage,
  );
  return {
    ok: true,
    // Product lookup is search-based and intentionally bounded. Taxonomy
    // pagination after page 1 must not retransmit the same product batch.
    products,
    categories: categoryPage.items,
    subcategories: subcategoryPage.items,
    taxonomy: {
      page: taxonomyPage,
      per_page: taxonomyPerPage,
      categories_has_more: categoryPage.hasMore,
      subcategories_has_more: subcategoryPage.hasMore,
      has_more: categoryPage.hasMore || subcategoryPage.hasMore,
    },
  };
}

function handleSelectors(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    const payload = parseSelectorsPayload(info && info.body || {});
    if (!payload) return e.json(400, { ok: false, error: "invalid_payload" });
    const app = e.app || $app;
    const context = loadStoreContext(app, info && info.auth, headerValue(info, "X-PZ-Support-Store"));
    if (!context) return e.json(403, { ok: false, error: "unauthorized" });
    if (!hasSelectorPermission(app, context)) {
      return e.json(403, { ok: false, error: "permission_denied" });
    }
    return e.json(200, buildSelectors(
      app,
      context,
      payload.search,
      payload.refs || [],
      payload.taxonomyPage,
      payload.taxonomyPerPage,
    ));
  } catch (_) {
    return e.json(500, { ok: false, error: "selectors_failed" });
  }
}

module.exports = {
  DEFAULT_TAXONOMY_PER_PAGE,
  MAX_SELECTOR_REFS,
  MAX_TAXONOMY_PER_PAGE,
  PRODUCT_LIMIT,
  SELECTOR_PERMISSIONS,
  buildSelectors,
  handleSelectors,
  hasSelectorPermission,
  loadStoreContext,
  parseSelectorsPayload,
  publicPath,
  requireAuthenticatedUser,
  taxonomyPageResult,
  thumbnailUrl,
};
