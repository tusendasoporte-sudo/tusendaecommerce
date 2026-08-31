/// <reference path="../pb_data/types.d.ts" />

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const DEFAULT_STORE_SLUG = "powerzona";
const AUDIT_COLLECTION = "master_store_deletion_audit";
const BATCH_SIZE = 200;
const MAX_BATCHES = 2500;
const STORES_PER_PAGE = 10;
const DELETABLE_STORE_ROLES = ["store_admin", "store_staff"];
const ALLOWED_RELATED_USER_ROLES = ["master_admin", "store_admin", "store_staff"];
const COUNT_KEYS = [
  "store_users", "products", "product_variations", "orders", "order_items", "gifts",
  "promotions", "coupons", "coupon_usages", "raffles", "raffle_entries", "reviews",
  "analytics_events", "store_notifications", "customers", "customer_phones",
  "customer_devices", "customer_links", "user_devices", "user_device_audit",
  "visitor_sessions", "visitor_pageviews",
  "security_events", "security_blocks", "security_audit", "security_settings",
  "activity_reviews", "activity_audit",
  "price_watches", "price_events", "master_notifications", "settings", "categories",
  "subcategories", "currencies", "shipping_zones", "visual_items",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "storefront_installation_coupons", "push_media", "push_campaigns",
  "push_campaign_deliveries", "push_events", "push_daily_stats",
  "admin_app_release_events", "admin_app_download_tickets", "admin_app_release_assignments",
  "promo_sites", "promo_entitlements", "promo_domain_bindings", "promo_drafts", "promo_media",
  "promo_revisions", "promo_revision_media_refs", "promo_publication_slots", "promo_publication_events",
  "promo_audit_events", "promo_analytics_events", "promo_analytics_daily", "promo_review_requests",
];
const DIRECT_STORE_COLLECTIONS = [
  "automatic_promotions", "categories", "currencies", "gifts", "manual_coupons",
  "master_notifications", "master_product_price_events", "master_product_watches", "orders",
  "products", "raffle_entries", "raffles", "reviews", "settings", "shipping_zones",
  "store_analytics_events", "store_customer_devices", "store_customer_links",
  "store_customer_phones", "store_customers", "store_notifications", "store_security_audit",
  "store_security_blocks", "store_security_events", "store_security_settings",
  "store_activity_reviews", "store_activity_audit",
  "store_user_device_audit", "store_user_devices",
  "store_visitor_pageviews", "store_visitor_sessions", "store_visual_items", "subcategories",
  "storefront_app_configs", "storefront_installations", "storefront_web_sessions",
  "storefront_order_links", "storefront_installation_coupons", "push_media", "push_campaigns",
  "push_campaign_deliveries", "push_events", "push_daily_stats",
  "admin_app_release_events", "admin_app_release_assignments",
  "users",
];
const LOG_MESSAGES = {
  PZ_MASTER_STORE_DELETE_PREVIEW_FAILED: "PowerZona master store deletion preview failed safely.",
  PZ_MASTER_STORE_DELETE_EXECUTE_FAILED: "PowerZona master store deletion execute failed safely.",
  PZ_MASTER_STORE_DELETE_INCOMPLETE: "PowerZona master store deletion was rolled back safely.",
  PZ_MASTER_STORE_DELETE_CROSS_REFERENCE: "PowerZona master store deletion found cross-store references.",
};

function logDeletion(code) {
  try {
    $app.logger().error(LOG_MESSAGES[code] || LOG_MESSAGES.PZ_MASTER_STORE_DELETE_EXECUTE_FAILED, "code", code);
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

function recordBool(record, key) {
  if (!record) return false;
  try {
    return record.getBool(key) === true;
  } catch (_) {
    try {
      const value = record.get(key);
      return value === true || value === 1 || value === "1" || value === "true";
    } catch (_) {
      return false;
    }
  }
}

function boundedString(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function isValidRecordId(value) {
  return typeof value === "string" && RECORD_ID_PATTERN.test(value);
}

function isMasterRecord(record) {
  return recordString(record, "role") === "master_admin";
}

function isProtectedStore(store) {
  return recordBool(store, "protected") || recordString(store, "slug").toLowerCase() === DEFAULT_STORE_SLUG;
}

function findRecordByIdSafe(app, collection, id) {
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function queryRows(app, sql, bindings, model) {
  const rows = arrayOf(new DynamicModel(model));
  app.db().newQuery(sql).bind(bindings || {}).all(rows);
  return rows;
}

function queryOne(app, sql, bindings, model) {
  const rows = queryRows(app, sql, bindings, model);
  return rows.length ? rows[0] : null;
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function errorCode(error) {
  const explicit = boundedString(error && error.code, 80);
  if (explicit) return explicit;
  const message = boundedString(error && error.message, 120);
  const known = [
    "unauthorized", "store_not_found", "store_protected", "store_changed",
    "invalid_confirmation", "cross_store_reference_detected", "unsafe_related_user_role",
    "store_delete_incomplete",
  ];
  return known.includes(message) ? message : "";
}

function parsePreviewPayload(body) {
  if (!exactPayload(body, ["store_id"])) return null;
  const storeId = bodyValue(body, "store_id");
  if (!isValidRecordId(storeId)) return null;
  return { storeId };
}

function parseExecutePayload(body) {
  const keys = ["store_id", "expected_slug", "expected_updated", "confirmation"];
  if (!exactPayload(body, keys)) return null;
  const storeId = bodyValue(body, "store_id");
  const expectedSlug = bodyValue(body, "expected_slug");
  const expectedUpdated = bodyValue(body, "expected_updated");
  const confirmation = bodyValue(body, "confirmation");
  if (!isValidRecordId(storeId)) return null;
  if (typeof expectedSlug !== "string" || !expectedSlug || expectedSlug.length > 100) return null;
  if (typeof expectedUpdated !== "string" || expectedUpdated !== safeIsoDate(expectedUpdated)) return null;
  if (typeof confirmation !== "string" || !confirmation || confirmation.length > 110) return null;
  return { storeId, expectedSlug, expectedUpdated, confirmation };
}

function storeSnapshot(store) {
  return {
    id: isValidRecordId(store && store.id) ? store.id : "",
    name: boundedString(recordString(store, "name"), 180),
    slug: boundedString(recordString(store, "slug"), 100),
    status: boundedString(recordString(store, "status"), 40),
    updated: safeIsoDate(recordString(store, "updated")),
    protected: isProtectedStore(store),
  };
}

function buildCounts(app, storeId) {
  const row = queryOne(app, `
    WITH
      target_products AS (SELECT id FROM products WHERE store = {:storeId}),
      target_variations AS (
        SELECT v.id FROM product_variations v
        INNER JOIN target_products p ON p.id = v.product
      ),
      target_orders AS (SELECT id FROM orders WHERE store = {:storeId}),
      target_coupons AS (SELECT id FROM manual_coupons WHERE store = {:storeId}),
      target_raffles AS (SELECT id FROM raffles WHERE store = {:storeId}),
      target_sessions AS (SELECT id FROM store_visitor_sessions WHERE store = {:storeId}),
      target_users AS (
        SELECT id FROM users
        WHERE store = {:storeId} AND role IN ('store_admin', 'store_staff')
      ),
      target_user_devices AS (SELECT id FROM store_user_devices WHERE store = {:storeId}),
      target_storefront_apps AS (SELECT id FROM storefront_app_configs WHERE store = {:storeId}),
      target_installations AS (SELECT id FROM storefront_installations WHERE store = {:storeId}),
      target_push_campaigns AS (SELECT id FROM push_campaigns WHERE store = {:storeId}),
      target_push_deliveries AS (SELECT id FROM push_campaign_deliveries WHERE store = {:storeId})
    SELECT
      (SELECT COUNT(*) FROM target_users) AS storeUsers,
      (SELECT COUNT(*) FROM target_products) AS products,
      (SELECT COUNT(*) FROM target_variations) AS productVariations,
      (SELECT COUNT(*) FROM target_orders) AS orders,
      (SELECT COUNT(*) FROM order_items WHERE "order" IN (SELECT id FROM target_orders)) AS orderItems,
      (SELECT COUNT(*) FROM gifts WHERE store = {:storeId}) AS gifts,
      (SELECT COUNT(*) FROM automatic_promotions WHERE store = {:storeId}) AS promotions,
      (SELECT COUNT(*) FROM target_coupons) AS coupons,
      (SELECT COUNT(*) FROM manual_coupon_usages
        WHERE coupon IN (SELECT id FROM target_coupons) OR "order" IN (SELECT id FROM target_orders)) AS couponUsages,
      (SELECT COUNT(*) FROM target_raffles) AS raffles,
      (SELECT COUNT(*) FROM raffle_entries
        WHERE store = {:storeId} OR raffle IN (SELECT id FROM target_raffles)) AS raffleEntries,
      (SELECT COUNT(*) FROM reviews WHERE store = {:storeId}) AS reviews,
      (SELECT COUNT(*) FROM store_analytics_events WHERE store = {:storeId}) AS analyticsEvents,
      (SELECT COUNT(*) FROM store_notifications WHERE store = {:storeId}) AS storeNotifications,
      (SELECT COUNT(*) FROM store_customers WHERE store = {:storeId}) AS customers,
      (SELECT COUNT(*) FROM store_customer_phones WHERE store = {:storeId}) AS customerPhones,
      (SELECT COUNT(*) FROM store_customer_devices WHERE store = {:storeId}) AS customerDevices,
      (SELECT COUNT(*) FROM store_customer_links WHERE store = {:storeId}) AS customerLinks,
      (SELECT COUNT(*) FROM target_user_devices) AS userDevices,
      (SELECT COUNT(*) FROM store_user_device_audit WHERE store = {:storeId}) AS userDeviceAudit,
      (SELECT COUNT(*) FROM target_sessions) AS visitorSessions,
      (SELECT COUNT(*) FROM store_visitor_pageviews
        WHERE store = {:storeId} OR visitor_session IN (SELECT id FROM target_sessions)) AS visitorPageviews,
      (SELECT COUNT(*) FROM store_security_events WHERE store = {:storeId}) AS securityEvents,
      (SELECT COUNT(*) FROM store_security_blocks WHERE store = {:storeId}) AS securityBlocks,
      (SELECT COUNT(*) FROM store_security_audit WHERE store = {:storeId}) AS securityAudit,
      (SELECT COUNT(*) FROM store_security_settings WHERE store = {:storeId}) AS securitySettings,
      (SELECT COUNT(*) FROM store_activity_reviews WHERE store = {:storeId}) AS activityReviews,
      (SELECT COUNT(*) FROM store_activity_audit WHERE store = {:storeId}) AS activityAudit,
      (SELECT COUNT(*) FROM master_product_watches WHERE store = {:storeId}) AS priceWatches,
      (SELECT COUNT(*) FROM master_product_price_events
        WHERE store = {:storeId}
          OR watch IN (SELECT id FROM master_product_watches WHERE store = {:storeId})) AS priceEvents,
      (SELECT COUNT(*) FROM master_notifications
        WHERE store = {:storeId}
          OR (COALESCE(store, '') = '' AND product IN (SELECT id FROM target_products))
          OR (COALESCE(store, '') = '' AND recipient IN (SELECT id FROM target_users))) AS masterNotifications,
      (SELECT COUNT(*) FROM settings WHERE store = {:storeId}) AS settings,
      (SELECT COUNT(*) FROM categories WHERE store = {:storeId}) AS categories,
      (SELECT COUNT(*) FROM subcategories WHERE store = {:storeId}) AS subcategories,
      (SELECT COUNT(*) FROM currencies WHERE store = {:storeId}) AS currencies,
      (SELECT COUNT(*) FROM shipping_zones WHERE store = {:storeId}) AS shippingZones,
      (SELECT COUNT(*) FROM store_visual_items WHERE store = {:storeId}) AS visualItems,
      (SELECT COUNT(*) FROM target_storefront_apps) AS storefrontAppConfigs,
      (SELECT COUNT(*) FROM target_installations) AS storefrontInstallations,
      (SELECT COUNT(*) FROM storefront_web_sessions WHERE store = {:storeId}) AS storefrontWebSessions,
      (SELECT COUNT(*) FROM storefront_order_links WHERE store = {:storeId}) AS storefrontOrderLinks,
      (SELECT COUNT(*) FROM storefront_installation_coupons WHERE store = {:storeId}) AS storefrontInstallationCoupons,
      (SELECT COUNT(*) FROM push_media WHERE store = {:storeId}) AS pushMedia,
      (SELECT COUNT(*) FROM target_push_campaigns) AS pushCampaigns,
      (SELECT COUNT(*) FROM target_push_deliveries) AS pushCampaignDeliveries,
      (SELECT COUNT(*) FROM push_events WHERE store = {:storeId}) AS pushEvents,
      (SELECT COUNT(*) FROM push_daily_stats WHERE store = {:storeId}) AS pushDailyStats,
      (SELECT COUNT(*) FROM admin_app_release_events WHERE store = {:storeId}) AS adminAppReleaseEvents,
      (SELECT COUNT(*) FROM admin_app_download_tickets
        WHERE assignment IN (SELECT id FROM admin_app_release_assignments WHERE store = {:storeId})) AS adminAppDownloadTickets,
      (SELECT COUNT(*) FROM admin_app_release_assignments WHERE store = {:storeId}) AS adminAppReleaseAssignments
  `, { storeId }, {
    storeUsers: 0, products: 0, productVariations: 0, orders: 0, orderItems: 0,
    gifts: 0, promotions: 0, coupons: 0, couponUsages: 0, raffles: 0,
    raffleEntries: 0, reviews: 0, analyticsEvents: 0, storeNotifications: 0,
    customers: 0, customerPhones: 0, customerDevices: 0, customerLinks: 0,
    userDevices: 0, userDeviceAudit: 0,
    visitorSessions: 0, visitorPageviews: 0, securityEvents: 0, securityBlocks: 0,
    securityAudit: 0, securitySettings: 0, activityReviews: 0, activityAudit: 0,
    priceWatches: 0, priceEvents: 0,
    masterNotifications: 0, settings: 0, categories: 0, subcategories: 0,
    currencies: 0, shippingZones: 0, visualItems: 0,
    storefrontAppConfigs: 0, storefrontInstallations: 0, storefrontWebSessions: 0,
    storefrontOrderLinks: 0, storefrontInstallationCoupons: 0, pushMedia: 0, pushCampaigns: 0,
    pushCampaignDeliveries: 0, pushEvents: 0, pushDailyStats: 0,
    adminAppReleaseEvents: 0, adminAppDownloadTickets: 0, adminAppReleaseAssignments: 0,
  }) || {};
  const counts = {
    store_users: nonNegativeInteger(row.storeUsers),
    products: nonNegativeInteger(row.products),
    product_variations: nonNegativeInteger(row.productVariations),
    orders: nonNegativeInteger(row.orders),
    order_items: nonNegativeInteger(row.orderItems),
    gifts: nonNegativeInteger(row.gifts),
    promotions: nonNegativeInteger(row.promotions),
    coupons: nonNegativeInteger(row.coupons),
    coupon_usages: nonNegativeInteger(row.couponUsages),
    raffles: nonNegativeInteger(row.raffles),
    raffle_entries: nonNegativeInteger(row.raffleEntries),
    reviews: nonNegativeInteger(row.reviews),
    analytics_events: nonNegativeInteger(row.analyticsEvents),
    store_notifications: nonNegativeInteger(row.storeNotifications),
    customers: nonNegativeInteger(row.customers),
    customer_phones: nonNegativeInteger(row.customerPhones),
    customer_devices: nonNegativeInteger(row.customerDevices),
    customer_links: nonNegativeInteger(row.customerLinks),
    user_devices: nonNegativeInteger(row.userDevices),
    user_device_audit: nonNegativeInteger(row.userDeviceAudit),
    visitor_sessions: nonNegativeInteger(row.visitorSessions),
    visitor_pageviews: nonNegativeInteger(row.visitorPageviews),
    security_events: nonNegativeInteger(row.securityEvents),
    security_blocks: nonNegativeInteger(row.securityBlocks),
    security_audit: nonNegativeInteger(row.securityAudit),
    security_settings: nonNegativeInteger(row.securitySettings),
    activity_reviews: nonNegativeInteger(row.activityReviews),
    activity_audit: nonNegativeInteger(row.activityAudit),
    price_watches: nonNegativeInteger(row.priceWatches),
    price_events: nonNegativeInteger(row.priceEvents),
    master_notifications: nonNegativeInteger(row.masterNotifications),
    settings: nonNegativeInteger(row.settings),
    categories: nonNegativeInteger(row.categories),
    subcategories: nonNegativeInteger(row.subcategories),
    currencies: nonNegativeInteger(row.currencies),
    shipping_zones: nonNegativeInteger(row.shippingZones),
    visual_items: nonNegativeInteger(row.visualItems),
    storefront_app_configs: nonNegativeInteger(row.storefrontAppConfigs),
    storefront_installations: nonNegativeInteger(row.storefrontInstallations),
    storefront_web_sessions: nonNegativeInteger(row.storefrontWebSessions),
    storefront_order_links: nonNegativeInteger(row.storefrontOrderLinks),
    storefront_installation_coupons: nonNegativeInteger(row.storefrontInstallationCoupons),
    push_media: nonNegativeInteger(row.pushMedia),
    push_campaigns: nonNegativeInteger(row.pushCampaigns),
    push_campaign_deliveries: nonNegativeInteger(row.pushCampaignDeliveries),
    push_events: nonNegativeInteger(row.pushEvents),
    push_daily_stats: nonNegativeInteger(row.pushDailyStats),
    admin_app_release_events: nonNegativeInteger(row.adminAppReleaseEvents),
    admin_app_download_tickets: nonNegativeInteger(row.adminAppDownloadTickets),
    admin_app_release_assignments: nonNegativeInteger(row.adminAppReleaseAssignments),
  };
  const promoRow = queryOne(app, `
    WITH target_sites AS (SELECT id FROM promo_sites WHERE store = {:storeId})
    SELECT
      (SELECT COUNT(*) FROM target_sites) AS promoSites,
      (SELECT COUNT(*) FROM promo_site_entitlements WHERE site IN (SELECT id FROM target_sites)) AS promoEntitlements,
      (SELECT COUNT(*) FROM promo_domain_bindings WHERE site IN (SELECT id FROM target_sites)) AS promoDomainBindings,
      (SELECT COUNT(*) FROM promo_draft_documents WHERE site IN (SELECT id FROM target_sites)) AS promoDrafts,
      (SELECT COUNT(*) FROM promo_media_assets WHERE site IN (SELECT id FROM target_sites)) AS promoMedia,
      (SELECT COUNT(*) FROM promo_revisions WHERE site IN (SELECT id FROM target_sites)) AS promoRevisions,
      (SELECT COUNT(*) FROM promo_revision_media_refs WHERE site IN (SELECT id FROM target_sites)) AS promoRevisionMediaRefs,
      (SELECT COUNT(*) FROM promo_publication_slots WHERE site IN (SELECT id FROM target_sites)) AS promoPublicationSlots,
      (SELECT COUNT(*) FROM promo_publication_events WHERE site IN (SELECT id FROM target_sites)) AS promoPublicationEvents,
      (SELECT COUNT(*) FROM promo_audit_events WHERE site IN (SELECT id FROM target_sites)) AS promoAuditEvents,
      (SELECT COUNT(*) FROM promo_analytics_events WHERE site IN (SELECT id FROM target_sites)) AS promoAnalyticsEvents,
      (SELECT COUNT(*) FROM promo_analytics_daily WHERE site IN (SELECT id FROM target_sites)) AS promoAnalyticsDaily,
      (SELECT COUNT(*) FROM promo_review_requests WHERE site IN (SELECT id FROM target_sites) OR store = {:storeId}) AS promoReviewRequests
  `, { storeId }, {
    promoSites: 0, promoEntitlements: 0, promoDomainBindings: 0, promoDrafts: 0, promoMedia: 0,
    promoRevisions: 0, promoRevisionMediaRefs: 0, promoPublicationSlots: 0, promoPublicationEvents: 0,
    promoAuditEvents: 0, promoAnalyticsEvents: 0, promoAnalyticsDaily: 0, promoReviewRequests: 0,
  }) || {};
  counts.promo_sites = nonNegativeInteger(promoRow.promoSites);
  counts.promo_entitlements = nonNegativeInteger(promoRow.promoEntitlements);
  counts.promo_domain_bindings = nonNegativeInteger(promoRow.promoDomainBindings);
  counts.promo_drafts = nonNegativeInteger(promoRow.promoDrafts);
  counts.promo_media = nonNegativeInteger(promoRow.promoMedia);
  counts.promo_revisions = nonNegativeInteger(promoRow.promoRevisions);
  counts.promo_revision_media_refs = nonNegativeInteger(promoRow.promoRevisionMediaRefs);
  counts.promo_publication_slots = nonNegativeInteger(promoRow.promoPublicationSlots);
  counts.promo_publication_events = nonNegativeInteger(promoRow.promoPublicationEvents);
  counts.promo_audit_events = nonNegativeInteger(promoRow.promoAuditEvents);
  counts.promo_analytics_events = nonNegativeInteger(promoRow.promoAnalyticsEvents);
  counts.promo_analytics_daily = nonNegativeInteger(promoRow.promoAnalyticsDaily);
  counts.promo_review_requests = nonNegativeInteger(promoRow.promoReviewRequests);
  counts.total_records = COUNT_KEYS.reduce((total, key) => total + counts[key], 1);
  return counts;
}

function relatedUserSummary(app, storeId) {
  const rows = queryRows(app, `
    SELECT COALESCE(role, '') AS role, COUNT(*) AS roleCount
    FROM users
    WHERE store = {:storeId}
    GROUP BY COALESCE(role, '')
  `, { storeId }, { role: "", roleCount: 0 });
  let preservedMasters = 0;
  rows.forEach((row) => {
    const role = boundedString(row.role, 40);
    if (!ALLOWED_RELATED_USER_ROLES.includes(role)) throw codedError("unsafe_related_user_role");
    if (role === "master_admin") preservedMasters += nonNegativeInteger(row.roleCount);
  });
  return { preservedMasters };
}

function findCrossStoreReferences(app, storeId) {
  const rows = queryRows(app, `
    WITH
      target_products AS (SELECT id FROM products WHERE store = {:storeId}),
      target_variations AS (
        SELECT v.id FROM product_variations v
        INNER JOIN target_products p ON p.id = v.product
      ),
      target_categories AS (SELECT id FROM categories WHERE store = {:storeId}),
      target_subcategories AS (SELECT id FROM subcategories WHERE store = {:storeId}),
      target_gifts AS (SELECT id FROM gifts WHERE store = {:storeId}),
      target_orders AS (SELECT id FROM orders WHERE store = {:storeId}),
      target_coupons AS (SELECT id FROM manual_coupons WHERE store = {:storeId}),
      target_raffles AS (SELECT id FROM raffles WHERE store = {:storeId}),
      target_sessions AS (SELECT id FROM store_visitor_sessions WHERE store = {:storeId}),
      target_customers AS (SELECT id FROM store_customers WHERE store = {:storeId}),
      target_shipping AS (SELECT id FROM shipping_zones WHERE store = {:storeId}),
      target_currencies AS (SELECT id FROM currencies WHERE store = {:storeId}),
      target_watches AS (SELECT id FROM master_product_watches WHERE store = {:storeId}),
      target_storefront_apps AS (SELECT id FROM storefront_app_configs WHERE store = {:storeId}),
      target_installations AS (SELECT id FROM storefront_installations WHERE store = {:storeId}),
      target_push_media AS (SELECT id FROM push_media WHERE store = {:storeId}),
      target_push_campaigns AS (SELECT id FROM push_campaigns WHERE store = {:storeId}),
      target_push_deliveries AS (SELECT id FROM push_campaign_deliveries WHERE store = {:storeId}),
      target_users AS (
        SELECT id FROM users
        WHERE store = {:storeId} AND role IN ('store_admin', 'store_staff')
      ),
      target_user_devices AS (SELECT id FROM store_user_devices WHERE store = {:storeId})
    SELECT 'products' AS category, COUNT(DISTINCT p.id) AS referenceCount
      FROM products p
      WHERE COALESCE(p.store, '') != {:storeId}
        AND (
          p.category IN (SELECT id FROM target_categories)
          OR p.subcategory IN (SELECT id FROM target_subcategories)
          OR EXISTS (
            SELECT 1 FROM json_each(CASE WHEN json_valid(p.related_products) THEN p.related_products ELSE '[]' END) related
            WHERE related.value IN (SELECT id FROM target_products)
          )
        )
    UNION ALL
    SELECT 'automatic_promotions', COUNT(DISTINCT promotion.id)
      FROM automatic_promotions promotion
      WHERE COALESCE(promotion.store, '') != {:storeId}
        AND (
          promotion.product IN (SELECT id FROM target_products)
          OR promotion.category IN (SELECT id FROM target_categories)
          OR promotion.subcategory IN (SELECT id FROM target_subcategories)
        )
    UNION ALL
    SELECT 'manual_coupons', COUNT(DISTINCT coupon.id)
      FROM manual_coupons coupon
      WHERE COALESCE(coupon.store, '') != {:storeId}
        AND (
          coupon.product IN (SELECT id FROM target_products)
          OR coupon.category IN (SELECT id FROM target_categories)
          OR coupon.subcategory IN (SELECT id FROM target_subcategories)
        )
    UNION ALL
    SELECT 'orders', COUNT(DISTINCT target.id)
      FROM orders target
      WHERE COALESCE(target.store, '') != {:storeId}
        AND (
          target.shipping_zone IN (SELECT id FROM target_shipping)
          OR target.currency IN (SELECT id FROM target_currencies)
          OR target.customer IN (SELECT id FROM target_customers)
        )
    UNION ALL
    SELECT 'order_items', COUNT(DISTINCT item.id)
      FROM order_items item
      LEFT JOIN orders parent_order ON parent_order.id = item."order"
      WHERE COALESCE(parent_order.store, '') != {:storeId}
        AND (
          item.product IN (SELECT id FROM target_products)
          OR item.variation IN (SELECT id FROM target_variations)
          OR item.gift IN (SELECT id FROM target_gifts)
        )
    UNION ALL
    SELECT 'coupon_usages', COUNT(DISTINCT usage.id)
      FROM manual_coupon_usages usage
      LEFT JOIN manual_coupons coupon ON coupon.id = usage.coupon
      LEFT JOIN orders parent_order ON parent_order.id = usage."order"
      WHERE (coupon.store = {:storeId} AND parent_order.id != '' AND COALESCE(parent_order.store, '') != {:storeId})
         OR (parent_order.store = {:storeId} AND coupon.id != '' AND COALESCE(coupon.store, '') != {:storeId})
    UNION ALL
    SELECT 'raffle_entries', COUNT(DISTINCT entry.id)
      FROM raffle_entries entry
      LEFT JOIN raffles raffle ON raffle.id = entry.raffle
      WHERE (COALESCE(entry.store, '') != {:storeId} AND raffle.store = {:storeId})
         OR (entry.store = {:storeId} AND raffle.id != '' AND COALESCE(raffle.store, '') != {:storeId})
    UNION ALL
    SELECT 'reviews', COUNT(DISTINCT review.id)
      FROM reviews review
      WHERE COALESCE(review.store, '') != {:storeId}
        AND (review.product IN (SELECT id FROM target_products) OR review."order" IN (SELECT id FROM target_orders))
    UNION ALL
    SELECT 'settings', COUNT(DISTINCT config.id)
      FROM settings config
      WHERE COALESCE(config.store, '') != {:storeId}
        AND config.default_currency IN (SELECT id FROM target_currencies)
    UNION ALL
    SELECT 'subcategories', COUNT(DISTINCT child.id)
      FROM subcategories child
      WHERE COALESCE(child.store, '') != {:storeId}
        AND child.category IN (SELECT id FROM target_categories)
    UNION ALL
    SELECT 'visual_items', COUNT(DISTINCT visual.id)
      FROM store_visual_items visual
      WHERE COALESCE(visual.store, '') != {:storeId}
        AND visual.category IN (SELECT id FROM target_categories)
    UNION ALL
    SELECT 'customers', COUNT(DISTINCT customer.id)
      FROM store_customers customer
      WHERE COALESCE(customer.store, '') != {:storeId}
        AND (
          customer.last_order IN (SELECT id FROM target_orders)
          OR customer.merged_into IN (SELECT id FROM target_customers)
          OR customer.archived_by IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'customer_phones', COUNT(DISTINCT phone.id)
      FROM store_customer_phones phone
      WHERE COALESCE(phone.store, '') != {:storeId}
        AND phone.customer IN (SELECT id FROM target_customers)
    UNION ALL
    SELECT 'customer_devices', COUNT(DISTINCT device.id)
      FROM store_customer_devices device
      WHERE COALESCE(device.store, '') != {:storeId}
        AND device.customer IN (SELECT id FROM target_customers)
    UNION ALL
    SELECT 'customer_links', COUNT(DISTINCT link.id)
      FROM store_customer_links link
      WHERE COALESCE(link.store, '') != {:storeId}
        AND (
          link.canonical_customer IN (SELECT id FROM target_customers)
          OR link.linked_customer IN (SELECT id FROM target_customers)
          OR link.created_by IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'user_devices', COUNT(DISTINCT device.id)
      FROM store_user_devices device
      WHERE COALESCE(device.store, '') != {:storeId}
        AND device.user IN (SELECT id FROM target_users)
    UNION ALL
    SELECT 'user_device_audit', COUNT(DISTINCT audit.id)
      FROM store_user_device_audit audit
      WHERE COALESCE(audit.store, '') != {:storeId}
        AND (
          audit.target_user IN (SELECT id FROM target_users)
          OR audit.actor IN (SELECT id FROM target_users)
          OR audit.device IN (SELECT id FROM target_user_devices)
        )
    UNION ALL
    SELECT 'visitor_sessions', COUNT(DISTINCT session.id)
      FROM store_visitor_sessions session
      WHERE COALESCE(session.store, '') != {:storeId}
        AND session.customer IN (SELECT id FROM target_customers)
    UNION ALL
    SELECT 'visitor_pageviews', COUNT(DISTINCT pageview.id)
      FROM store_visitor_pageviews pageview
      WHERE COALESCE(pageview.store, '') != {:storeId}
        AND (
          pageview.visitor_session IN (SELECT id FROM target_sessions)
          OR pageview.customer IN (SELECT id FROM target_customers)
        )
    UNION ALL
    SELECT 'security_events', COUNT(DISTINCT event.id)
      FROM store_security_events event
      WHERE COALESCE(event.store, '') != {:storeId}
        AND (event.customer IN (SELECT id FROM target_customers) OR event."order" IN (SELECT id FROM target_orders))
    UNION ALL
    SELECT 'security_blocks', COUNT(DISTINCT block.id)
      FROM store_security_blocks block
      WHERE COALESCE(block.store, '') != {:storeId}
        AND (
          block.customer IN (SELECT id FROM target_customers)
          OR block.created_by IN (SELECT id FROM target_users)
          OR block.revoked_by IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'security_audit', COUNT(DISTINCT audit.id)
      FROM store_security_audit audit
      WHERE COALESCE(audit.store, '') != {:storeId}
        AND audit.actor IN (SELECT id FROM target_users)
    UNION ALL
    SELECT 'price_watches', COUNT(DISTINCT watch.id)
      FROM master_product_watches watch
      WHERE COALESCE(watch.store, '') != {:storeId}
        AND (
          watch.product IN (SELECT id FROM target_products)
          OR watch.created_by IN (SELECT id FROM target_users)
          OR watch.updated_by IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'price_events', COUNT(DISTINCT price_event.id)
      FROM master_product_price_events price_event
      WHERE COALESCE(price_event.store, '') != {:storeId}
        AND (
          price_event.watch IN (SELECT id FROM target_watches)
          OR price_event.product IN (SELECT id FROM target_products)
          OR price_event.variation IN (SELECT id FROM target_variations)
          OR price_event.actor IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'master_notifications', COUNT(DISTINCT notification.id)
      FROM master_notifications notification
      WHERE COALESCE(notification.store, '') NOT IN ('', {:storeId})
        AND (
          notification.product IN (SELECT id FROM target_products)
          OR notification.recipient IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'storefront_installations', COUNT(DISTINCT installation.id)
      FROM storefront_installations installation
      WHERE COALESCE(installation.store, '') != {:storeId}
        AND installation.app_config IN (SELECT id FROM target_storefront_apps)
    UNION ALL
    SELECT 'storefront_web_sessions', COUNT(DISTINCT session.id)
      FROM storefront_web_sessions session
      WHERE COALESCE(session.store, '') != {:storeId}
        AND session.installation IN (SELECT id FROM target_installations)
    UNION ALL
    SELECT 'storefront_order_links', COUNT(DISTINCT link.id)
      FROM storefront_order_links link
      WHERE COALESCE(link.store, '') != {:storeId}
        AND (
          link.installation IN (SELECT id FROM target_installations)
          OR link."order" IN (SELECT id FROM target_orders)
        )
    UNION ALL
    SELECT 'storefront_installation_coupons', COUNT(DISTINCT wallet.id)
      FROM storefront_installation_coupons wallet
      WHERE COALESCE(wallet.store, '') != {:storeId}
        AND (
          wallet.installation IN (SELECT id FROM target_installations)
          OR wallet.coupon IN (SELECT id FROM target_coupons)
        )
    UNION ALL
    SELECT 'push_campaigns', COUNT(DISTINCT campaign.id)
      FROM push_campaigns campaign
      WHERE COALESCE(campaign.store, '') != {:storeId}
        AND (
          campaign.media IN (SELECT id FROM target_push_media)
          OR campaign.target_product IN (SELECT id FROM target_products)
          OR campaign.target_category IN (SELECT id FROM target_categories)
          OR campaign.target_order IN (SELECT id FROM target_orders)
          OR campaign.target_raffle IN (SELECT id FROM target_raffles)
          OR campaign.target_coupon IN (SELECT id FROM target_coupons)
          OR campaign.created_by IN (SELECT id FROM target_users)
        )
    UNION ALL
    SELECT 'push_campaign_deliveries', COUNT(DISTINCT delivery.id)
      FROM push_campaign_deliveries delivery
      WHERE COALESCE(delivery.store, '') != {:storeId}
        AND (
          delivery.campaign IN (SELECT id FROM target_push_campaigns)
          OR delivery.installation IN (SELECT id FROM target_installations)
        )
    UNION ALL
    SELECT 'push_events', COUNT(DISTINCT event.id)
      FROM push_events event
      WHERE COALESCE(event.store, '') != {:storeId}
        AND (
          event.campaign IN (SELECT id FROM target_push_campaigns)
          OR event.delivery IN (SELECT id FROM target_push_deliveries)
          OR event.installation IN (SELECT id FROM target_installations)
          OR event."order" IN (SELECT id FROM target_orders)
          OR event.coupon IN (SELECT id FROM target_coupons)
        )
    UNION ALL
    SELECT 'push_daily_stats', COUNT(DISTINCT daily.id)
      FROM push_daily_stats daily
      WHERE COALESCE(daily.store, '') != {:storeId}
        AND daily.campaign IN (SELECT id FROM target_push_campaigns)
  `, { storeId }, { category: "", referenceCount: 0 });
  const references = {};
  rows.forEach((row) => {
    const category = boundedString(row.category, 60);
    const count = nonNegativeInteger(row.referenceCount);
    if (category && count > 0) references[category] = count;
  });
  return references;
}

function hasReferences(references) {
  return Object.keys(references || {}).length > 0;
}

function deleteByFilter(app, collection, filter, params) {
  let deleted = 0;
  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const records = app.findRecordsByFilter(collection, filter, "id", BATCH_SIZE, 0, params || {}) || [];
    if (!records.length) return deleted;
    records.forEach((record) => {
      app.delete(record);
      deleted += 1;
    });
  }
  throw codedError("store_delete_incomplete");
}

function deleteExpected(app, collection, filter, storeId, expected) {
  const deleted = deleteByFilter(app, collection, filter, { storeId });
  if (deleted !== expected) throw codedError("store_delete_incomplete");
  return deleted;
}

function cleanPreservedMasterUsers(app, storeId, expectedMasters) {
  let cleaned = 0;
  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const masters = app.findRecordsByFilter(
      "users",
      'store = {:storeId} && role = "master_admin"',
      "id",
      BATCH_SIZE,
      0,
      { storeId }
    ) || [];
    if (!masters.length) {
      if (cleaned !== expectedMasters) throw codedError("store_delete_incomplete");
      return cleaned;
    }
    masters.forEach((master) => {
      master.set("store", "");
      app.save(master);
      cleaned += 1;
    });
  }
  throw codedError("store_delete_incomplete");
}

function executeDeletionPlan(app, storeId, counts) {
  let deleted = 0;
  const masterNotificationsFilter = [
    'store = {:storeId}',
    '(store = "" && product.store = {:storeId})',
    '('
      + 'store = ""'
      + ' && recipient.store = {:storeId}'
      + ' && (recipient.role = "store_admin" || recipient.role = "store_staff")'
    + ')',
  ].join(' || ');

  // El grafo Promo se elimina explícitamente de hijos a padres. app.delete
  // conserva la eliminación física de los archivos de promo_media_assets.
  deleted += deleteExpected(app, "promo_analytics_daily", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_analytics_daily));
  deleted += deleteExpected(app, "promo_analytics_events", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_analytics_events));
  deleted += deleteExpected(app, "promo_audit_events", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_audit_events));
  deleted += deleteExpected(app, "promo_review_requests", "site.store = {:storeId} || store = {:storeId}", storeId, nonNegativeInteger(counts.promo_review_requests));
  deleted += deleteExpected(app, "promo_publication_events", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_publication_events));
  deleted += deleteExpected(app, "promo_revision_media_refs", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_revision_media_refs));
  deleted += deleteExpected(app, "promo_publication_slots", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_publication_slots));
  deleted += deleteExpected(app, "promo_revisions", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_revisions));
  deleted += deleteExpected(app, "promo_draft_documents", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_drafts));
  deleted += deleteExpected(app, "promo_domain_bindings", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_domain_bindings));
  deleted += deleteExpected(app, "promo_site_entitlements", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_entitlements));
  deleted += deleteExpected(app, "promo_media_assets", "site.store = {:storeId}", storeId, nonNegativeInteger(counts.promo_media));
  deleted += deleteExpected(app, "promo_sites", "store = {:storeId}", storeId, nonNegativeInteger(counts.promo_sites));

  // La familia pública se elimina de hijos a padres. No depende de cascadas y
  // nunca toca store_push_devices/store_notifications fuera de su inventario.
  deleted += deleteExpected(app, "admin_app_release_events", "store = {:storeId}", storeId, nonNegativeInteger(counts.admin_app_release_events));
  deleted += deleteExpected(app, "admin_app_download_tickets", "assignment.store = {:storeId}", storeId, nonNegativeInteger(counts.admin_app_download_tickets));
  deleted += deleteExpected(app, "admin_app_release_assignments", "store = {:storeId}", storeId, nonNegativeInteger(counts.admin_app_release_assignments));
  deleted += deleteExpected(app, "push_daily_stats", "store = {:storeId}", storeId, nonNegativeInteger(counts.push_daily_stats));
  deleted += deleteExpected(app, "push_events", "store = {:storeId}", storeId, nonNegativeInteger(counts.push_events));
  deleted += deleteExpected(app, "push_campaign_deliveries", "store = {:storeId}", storeId, nonNegativeInteger(counts.push_campaign_deliveries));
  deleted += deleteExpected(app, "storefront_installation_coupons", "store = {:storeId}", storeId, nonNegativeInteger(counts.storefront_installation_coupons));
  deleted += deleteExpected(app, "storefront_order_links", "store = {:storeId}", storeId, nonNegativeInteger(counts.storefront_order_links));
  deleted += deleteExpected(app, "storefront_web_sessions", "store = {:storeId}", storeId, nonNegativeInteger(counts.storefront_web_sessions));
  deleted += deleteExpected(app, "push_campaigns", "store = {:storeId}", storeId, nonNegativeInteger(counts.push_campaigns));
  deleted += deleteExpected(app, "push_media", "store = {:storeId}", storeId, nonNegativeInteger(counts.push_media));
  deleted += deleteExpected(app, "storefront_installations", "store = {:storeId}", storeId, nonNegativeInteger(counts.storefront_installations));
  deleted += deleteExpected(app, "storefront_app_configs", "store = {:storeId}", storeId, nonNegativeInteger(counts.storefront_app_configs));

  deleted += deleteExpected(
    app,
    "master_notifications",
    masterNotificationsFilter,
    storeId,
    counts.master_notifications
  );
  deleted += deleteExpected(app, "master_product_price_events", "store = {:storeId} || watch.store = {:storeId}", storeId, counts.price_events);
  deleted += deleteExpected(app, "master_product_watches", "store = {:storeId}", storeId, counts.price_watches);

  deleted += deleteExpected(app, "manual_coupon_usages", "coupon.store = {:storeId} || order.store = {:storeId}", storeId, counts.coupon_usages);
  deleted += deleteExpected(app, "store_activity_reviews", "store = {:storeId}", storeId, counts.activity_reviews);
  deleted += deleteExpected(app, "store_activity_audit", "store = {:storeId}", storeId, counts.activity_audit);
  deleted += deleteExpected(app, "order_items", "order.store = {:storeId}", storeId, counts.order_items);
  deleted += deleteExpected(app, "reviews", "store = {:storeId}", storeId, counts.reviews);
  deleted += deleteExpected(app, "product_variations", "product.store = {:storeId}", storeId, counts.product_variations);
  deleted += deleteExpected(app, "raffle_entries", "store = {:storeId} || raffle.store = {:storeId}", storeId, counts.raffle_entries);
  deleted += deleteExpected(app, "store_visitor_pageviews", "store = {:storeId} || visitor_session.store = {:storeId}", storeId, counts.visitor_pageviews);
  deleted += deleteExpected(app, "store_user_device_audit", "store = {:storeId}", storeId, counts.user_device_audit);
  deleted += deleteExpected(app, "store_user_devices", "store = {:storeId}", storeId, counts.user_devices);
  deleted += deleteExpected(app, "store_customer_links", "store = {:storeId}", storeId, counts.customer_links);
  deleted += deleteExpected(app, "store_customer_devices", "store = {:storeId}", storeId, counts.customer_devices);
  deleted += deleteExpected(app, "store_customer_phones", "store = {:storeId}", storeId, counts.customer_phones);
  deleted += deleteExpected(app, "store_security_events", "store = {:storeId}", storeId, counts.security_events);
  deleted += deleteExpected(app, "store_security_blocks", "store = {:storeId}", storeId, counts.security_blocks);
  deleted += deleteExpected(app, "store_security_audit", "store = {:storeId}", storeId, counts.security_audit);
  deleted += deleteExpected(app, "store_visitor_sessions", "store = {:storeId}", storeId, counts.visitor_sessions);
  deleted += deleteExpected(app, "store_notifications", "store = {:storeId}", storeId, counts.store_notifications);
  deleted += deleteExpected(app, "store_analytics_events", "store = {:storeId}", storeId, counts.analytics_events);

  deleted += deleteExpected(app, "automatic_promotions", "store = {:storeId}", storeId, counts.promotions);
  deleted += deleteExpected(app, "manual_coupons", "store = {:storeId}", storeId, counts.coupons);
  deleted += deleteExpected(app, "raffles", "store = {:storeId}", storeId, counts.raffles);
  deleted += deleteExpected(app, "gifts", "store = {:storeId}", storeId, counts.gifts);
  deleted += deleteExpected(app, "store_visual_items", "store = {:storeId}", storeId, counts.visual_items);

  deleted += deleteExpected(app, "orders", "store = {:storeId}", storeId, counts.orders);
  deleted += deleteExpected(app, "store_customers", "store = {:storeId}", storeId, counts.customers);

  deleted += deleteExpected(app, "products", "store = {:storeId}", storeId, counts.products);
  deleted += deleteExpected(app, "subcategories", "store = {:storeId}", storeId, counts.subcategories);
  deleted += deleteExpected(app, "categories", "store = {:storeId}", storeId, counts.categories);
  deleted += deleteExpected(app, "shipping_zones", "store = {:storeId}", storeId, counts.shipping_zones);
  deleted += deleteExpected(app, "settings", "store = {:storeId}", storeId, counts.settings);
  deleted += deleteExpected(app, "currencies", "store = {:storeId}", storeId, counts.currencies);
  deleted += deleteExpected(app, "store_security_settings", "store = {:storeId}", storeId, counts.security_settings);
  return deleted;
}

function verifyNoStoreOwnedRecords(app, storeId) {
  for (let index = 0; index < DIRECT_STORE_COLLECTIONS.length; index += 1) {
    const collection = DIRECT_STORE_COLLECTIONS[index];
    const row = queryOne(
      app,
      `SELECT COUNT(*) AS remaining FROM \`${collection}\` WHERE store = {:storeId}`,
      { storeId },
      { remaining: 0 }
    ) || {};
    if (nonNegativeInteger(row.remaining) !== 0) throw codedError("store_delete_incomplete");
  }
  const promoRemaining = queryOne(app, `
    SELECT COUNT(*) AS remaining FROM promo_sites WHERE store = {:storeId}
  `, { storeId }, { remaining: 0 }) || {};
  if (nonNegativeInteger(promoRemaining.remaining) !== 0) throw codedError("store_delete_incomplete");
}

function createCompletedAudit(app, store, actor, counts, preservedMasters, totalRecords) {
  const audit = new Record(app.findCollectionByNameOrId(AUDIT_COLLECTION), {});
  audit.set("store_id_snapshot", store.id);
  audit.set("store_name_snapshot", boundedString(recordString(store, "name"), 180));
  audit.set("store_slug_snapshot", boundedString(recordString(store, "slug"), 100));
  audit.set("actor", actor.id);
  audit.set("actor_name_snapshot", boundedString(recordString(actor, "display_name") || recordString(actor, "name"), 160));
  audit.set("actor_role_snapshot", "master_admin");
  audit.set("summary", {
    counts,
    preserved_master_users: preservedMasters,
    batch_size: BATCH_SIZE,
    inventory_version: "PZ-APP-C03-PROMO",
  });
  audit.set("total_records", totalRecords);
  audit.set("status", "completed");
  audit.set("failure_code", "");
  audit.set("completed_at", new Date().toISOString());
  app.save(audit);
}

function handleStoreDeletePreview(e) {
  setPrivateHeaders(e);
  try {
    const info = e.requestInfo();
    if (!isMasterRecord(info && info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parsePreviewPayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const store = findRecordByIdSafe($app, "stores", parsed.storeId);
    if (!store) return e.json(404, { ok: false, error: "store_not_found" });
    if (isProtectedStore(store)) return e.json(409, { ok: false, error: "store_protected" });
    relatedUserSummary($app, parsed.storeId);
    const references = findCrossStoreReferences($app, parsed.storeId);
    if (hasReferences(references)) {
      logDeletion("PZ_MASTER_STORE_DELETE_CROSS_REFERENCE");
      return e.json(409, { ok: false, error: "cross_store_reference_detected", references });
    }
    const snapshot = storeSnapshot(store);
    return e.json(200, {
      ok: true,
      store: snapshot,
      confirmation_phrase: `ELIMINAR ${snapshot.slug}`,
      counts: buildCounts($app, parsed.storeId),
      warnings: [],
    });
  } catch (error) {
    if (errorCode(error) === "unsafe_related_user_role") {
      return e.json(409, { ok: false, error: "unsafe_related_user_role" });
    }
    logDeletion("PZ_MASTER_STORE_DELETE_PREVIEW_FAILED");
    return e.json(500, { ok: false, error: "preview_failed" });
  }
}

function handleStoreDeleteExecute(e) {
  setPrivateHeaders(e);
  const transactionState = { references: {}, result: null };
  try {
    const info = e.requestInfo();
    if (!isMasterRecord(info && info.auth)) return e.json(403, { ok: false, error: "unauthorized" });
    const parsed = parseExecutePayload(info.body || {});
    if (!parsed) return e.json(400, { ok: false, error: "invalid_payload" });
    const actorId = recordString(info.auth, "id");
    if (!isValidRecordId(actorId)) return e.json(403, { ok: false, error: "unauthorized" });

    $app.runInTransaction((txApp) => {
      const actor = findRecordByIdSafe(txApp, "users", actorId);
      if (!actor || !isMasterRecord(actor)) throw codedError("unauthorized");
      const store = findRecordByIdSafe(txApp, "stores", parsed.storeId);
      if (!store) throw codedError("store_not_found");
      if (isProtectedStore(store)) throw codedError("store_protected");
      const snapshot = storeSnapshot(store);
      if (snapshot.slug !== parsed.expectedSlug || snapshot.updated !== parsed.expectedUpdated) {
        throw codedError("store_changed");
      }
      if (parsed.confirmation !== `ELIMINAR ${snapshot.slug}`) throw codedError("invalid_confirmation");

      const relatedUsers = relatedUserSummary(txApp, parsed.storeId);
      const references = findCrossStoreReferences(txApp, parsed.storeId);
      if (hasReferences(references)) {
        transactionState.references = references;
        throw codedError("cross_store_reference_detected");
      }
      const counts = buildCounts(txApp, parsed.storeId);
      let deletedRecords = executeDeletionPlan(txApp, parsed.storeId, counts);
      const preservedMasters = cleanPreservedMasterUsers(txApp, parsed.storeId, relatedUsers.preservedMasters);
      deletedRecords += deleteExpected(
        txApp,
        "users",
        'store = {:storeId} && (role = "store_admin" || role = "store_staff")',
        parsed.storeId,
        counts.store_users
      );
      verifyNoStoreOwnedRecords(txApp, parsed.storeId);
      const remainingCounts = buildCounts(txApp, parsed.storeId);
      if (COUNT_KEYS.some((key) => remainingCounts[key] !== 0)) throw codedError("store_delete_incomplete");
      if (deletedRecords + 1 !== counts.total_records) throw codedError("store_delete_incomplete");

      createCompletedAudit(txApp, store, actor, counts, preservedMasters, deletedRecords + 1);
      txApp.delete(store);
      if (findRecordByIdSafe(txApp, "stores", parsed.storeId)) throw codedError("store_delete_incomplete");
      const remainingRow = queryOne(txApp, "SELECT COUNT(*) AS remainingStores FROM stores", {}, { remainingStores: 0 }) || {};
      const remainingStores = nonNegativeInteger(remainingRow.remainingStores);
      transactionState.result = {
        ok: true,
        deleted_store: { name: snapshot.name, slug: snapshot.slug },
        deleted_records: deletedRecords + 1,
        remaining_stores: remainingStores,
        suggested_page: Math.max(1, Math.ceil(remainingStores / STORES_PER_PAGE)),
      };
    });
    if (!transactionState.result) throw codedError("store_delete_incomplete");
    return e.json(200, transactionState.result);
  } catch (error) {
    const code = errorCode(error);
    if (code === "unauthorized") return e.json(403, { ok: false, error: "unauthorized" });
    if (code === "store_not_found") return e.json(404, { ok: false, error: "store_not_found" });
    if (code === "invalid_confirmation") return e.json(400, { ok: false, error: "invalid_confirmation" });
    if (code === "store_protected" || code === "store_changed" || code === "unsafe_related_user_role") {
      return e.json(409, { ok: false, error: code });
    }
    if (code === "cross_store_reference_detected") {
      logDeletion("PZ_MASTER_STORE_DELETE_CROSS_REFERENCE");
      return e.json(409, {
        ok: false,
        error: "cross_store_reference_detected",
        references: transactionState.references,
      });
    }
    if (code === "store_delete_incomplete") {
      logDeletion("PZ_MASTER_STORE_DELETE_INCOMPLETE");
      return e.json(500, { ok: false, error: "store_delete_incomplete" });
    }
    logDeletion("PZ_MASTER_STORE_DELETE_EXECUTE_FAILED");
    return e.json(500, { ok: false, error: "execute_failed" });
  }
}

module.exports = {
  COUNT_KEYS,
  DIRECT_STORE_COLLECTIONS,
  buildCounts,
  executeDeletionPlan,
  findCrossStoreReferences,
  handleStoreDeleteExecute,
  handleStoreDeletePreview,
  requireAuthenticatedUser,
  verifyNoStoreOwnedRecords,
};
