/// <reference path="../pb_data/types.d.ts" />

const ACTIVITY_COLLECTION = "store_activity_audit";
const REVIEW_COLLECTION = "store_activity_reviews";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const ORIGINS = Object.freeze(["store_admin", "master_admin", "system", "migration"]);
const MODULES = Object.freeze(["catalog", "orders", "shipping", "marketing", "operation", "security", "team", "settings", "plan", "activity"]);
const SEVERITIES = Object.freeze(["normal", "important", "critical"]);
const ACTOR_ROLES = Object.freeze(["master_admin", "store_admin", "store_staff", "system", "migration"]);
const PROHIBITED_KEY_PATTERN = /(password|secret|token|cookie|digest|hmac|cipher|private|metadata|payload|address|email|phone|customer_note|browser|user_agent|receipt|proof|binary|image_data|full_ip|ip_address|(^|_)ip($|_))/i;
// Event names may legitimately describe a password or token rotation. Reject
// secret-bearing components while keeping those non-secret action labels usable.
const SOURCE_KEY_PROHIBITED_PATTERN = /(secret|cookie|digest|hmac|cipher|private|metadata|payload|address|email|phone|customer_note|browser|user_agent|receipt|proof|binary|image_data|full_ip|ip_address|(^|_)ip($|_))/i;
const RELATION_VALUE_FIELDS = new Set([
  "category", "subcategory", "product", "order", "shipping_zone", "currency",
  "raffle", "gift", "related_products", "target_id", "default_currency",
]);
const FILE_VALUE_FIELDS = new Set(["images", "image", "attachment"]);
const STORE_SPECIALIZED_FIELDS = new Set([
  "plan", "plan_started_at", "plan_expires_at", "plan_duration_months",
  "plan_is_permanent", "free_trial_used", "primary_admin_user", "protected",
]);

const COLLECTION_CONFIG = Object.freeze({
  stores: Object.freeze({
    module: "plan", resourceType: "store_plan", labelFields: ["name"],
    safeFields: ["name", "slug", "status", "featured", "featured_order", "plan", "plan_started_at", "plan_expires_at", "plan_duration_months", "plan_is_permanent", "free_trial_used", "protected"],
    criticalFields: ["status", "plan", "plan_started_at", "plan_expires_at", "plan_duration_months", "plan_is_permanent", "free_trial_used", "protected"],
  }),
  products: Object.freeze({
    module: "catalog", resourceType: "product", labelFields: ["name"],
    safeFields: ["name", "slug", "active", "visible", "visibility", "status", "featured", "featured_order", "category", "subcategory", "base_price_usd", "regular_price_usd", "offer_price_usd", "price", "price_usd", "cost_usd", "profit_margin", "is_offer", "stock", "track_stock", "allow_preorder", "expiration_date", "has_variations", "variation_view", "related_products", "images", "only_usd", "delivery_mode"],
    markerFields: ["description", "extra_info", "image_order", "internal_ref"],
    criticalFields: ["base_price_usd", "regular_price_usd", "offer_price_usd", "price", "price_usd", "stock", "active", "visible", "status"],
  }),
  product_variations: Object.freeze({
    module: "catalog", resourceType: "product_variation", labelFields: ["value", "variation_type"],
    safeFields: ["variation_type", "value", "active", "product", "price_usd", "cost_usd", "offer_price_usd", "is_offer", "stock", "sort_order", "allow_preorder", "expiration_date", "image"],
    markerFields: ["internal_ref"],
    criticalFields: ["price", "price_usd", "offer_price", "offer_price_usd", "stock", "active", "visible", "status"],
  }),
  categories: Object.freeze({
    module: "catalog", resourceType: "category", labelFields: ["name"],
    safeFields: ["name", "slug", "active", "featured_on_home", "featured_order", "order", "image"],
    markerFields: ["description"],
    criticalFields: ["active"],
  }),
  subcategories: Object.freeze({
    module: "catalog", resourceType: "subcategory", labelFields: ["name"],
    safeFields: ["name", "slug", "active", "category", "order", "image"],
    criticalFields: ["active"],
  }),
  orders: Object.freeze({
    module: "orders", resourceType: "order", labelFields: ["order_number"],
    safeFields: ["order_number", "status", "delivery_method", "shipping_zone", "shipping", "shipping_usd", "shipping_cup", "subtotal", "total", "usd_total", "stock_deducted", "delivered_at", "subtotal_original_usd", "discount_total_usd", "subtotal_after_discount_usd", "coupon_discount_usd", "shipping_original_usd", "shipping_discount_usd", "subtotal_before_manual_adjustments_usd", "manual_adjustment_total_usd", "subtotal_after_manual_adjustments_usd"],
    criticalFields: ["status", "shipping", "shipping_cup", "total", "usd_total", "manual_adjustment_total_usd"],
  }),
  order_items: Object.freeze({
    module: "orders", resourceType: "order_item", labelFields: ["product_name"],
    safeFields: ["order", "product_name", "variation_name", "quantity", "is_gift", "unit_price_usd", "unit_price_original_usd", "unit_price_final_usd", "line_subtotal_original_usd", "line_discount_usd", "line_subtotal_final_usd", "coupon_discount_usd", "has_manual_price_adjustment", "manual_final_unit_price_usd", "manual_adjustment_unit_usd", "manual_adjustment_total_usd", "manual_adjustment_reason_code", "manual_adjusted_at"],
    markerFields: ["manual_adjustment_reason_text"],
    criticalFields: ["quantity", "unit_price_final_usd", "has_manual_price_adjustment", "manual_final_unit_price_usd"],
  }),
  shipping_methods: Object.freeze({
    module: "shipping", resourceType: "shipping_method", labelFields: ["name"],
    safeFields: ["name", "active", "price", "price_usd", "price_cup", "order", "sort_order"],
    criticalFields: ["price", "price_usd", "price_cup", "active"],
  }),
  shipping_zones: Object.freeze({
    module: "shipping", resourceType: "shipping_zone", labelFields: ["name", "municipality"],
    safeFields: ["municipality", "zone", "active", "price_usd"],
    markerFields: ["note"],
    criticalFields: ["price_usd", "active"],
  }),
  automatic_promotions: Object.freeze({
    module: "marketing", resourceType: "promotion", labelFields: ["name", "title"],
    safeFields: ["name", "active", "type", "scope", "discount_type", "discount_value", "buy_qty", "pay_qty", "min_qty", "min_subtotal_usd", "product", "category", "subcategory", "starts_at", "ends_at", "badge_text", "priority", "stackable"],
    criticalFields: ["active", "discount_value", "buy_qty", "pay_qty", "min_qty", "min_subtotal_usd", "starts_at", "ends_at"],
  }),
  manual_coupons: Object.freeze({
    module: "marketing", resourceType: "coupon", labelFields: ["name", "code"],
    safeFields: ["name", "code", "active", "scope", "discount_type", "discount_value", "min_subtotal_usd", "product", "category", "subcategory", "starts_at", "ends_at", "unlimited_uses", "max_uses"],
    markerFields: ["customer_message"],
    criticalFields: ["active", "discount_value", "min_subtotal_usd", "max_uses"],
  }),
  gifts: Object.freeze({
    module: "marketing", resourceType: "gift", labelFields: ["name"],
    safeFields: ["name", "active", "stock", "min_order_usd", "sort_order", "image"],
    markerFields: ["description"],
    criticalFields: ["active", "stock", "min_order_usd"],
  }),
  raffles: Object.freeze({
    module: "marketing", resourceType: "raffle", labelFields: ["name", "title"],
    safeFields: ["title", "slug", "status", "visible", "starts_at", "closes_at", "draw_at", "winner_number", "no_winner_number", "result_published_at", "no_winner_expires_at", "finalized_at", "link_enabled", "show_in_store", "slot_number", "is_configured", "selection_manually_closed", "reset_at", "prizes_display_mode", "images", "whatsapp_group_invite_enabled"],
    markerFields: ["description", "conditions", "prizes_json", "winner_message", "store_featured_prize_ids", "whatsapp_group_invite_url"],
    markerAliases: { access_code: "access_configuration", access_code_hash: "access_configuration" },
    criticalFields: ["status", "visible", "draw_at", "winner_number", "no_winner_number", "prizes_json", "selection_manually_closed"],
  }),
  raffle_entries: Object.freeze({
    module: "marketing", resourceType: "raffle_entry", labelFields: [],
    safeFields: ["raffle", "status", "chosen_number", "cancelled_at", "can_reenter", "reentry_allowed_at"],
    markerFields: ["cancelled_reason"],
    criticalFields: ["status", "chosen_number"],
  }),
  reviews: Object.freeze({
    module: "operation", resourceType: "review", labelFields: [],
    safeFields: ["type", "status", "rating", "verified_purchase", "featured", "product", "order", "approved_at"],
    criticalFields: ["status"],
  }),
  store_visual_items: Object.freeze({
    module: "operation", resourceType: "visual_item", labelFields: ["title", "name"],
    safeFields: ["title", "active", "type", "action_type", "category", "sort_order", "image", "attachment"],
    markerFields: ["description", "button_text", "target_url", "whatsapp_message"],
    criticalFields: ["active", "action_type"],
  }),
  settings: Object.freeze({
    module: "settings", resourceType: "settings", labelFields: ["store_name"],
    safeFields: ["store_name", "active", "maintenance_mode", "default_currency", "order_prefix", "public_category_columns", "cover_mode", "business_types", "business_hours_mode", "allow_orders_when_closed", "reviews_enabled", "store_reviews_enabled", "product_reviews_enabled", "verified_order_reviews_enabled", "reviews_require_approval", "show_store_rating", "show_product_rating", "show_verified_badge", "review_request_delay_hours", "footer_link_1_active", "footer_link_2_active", "notifications_enabled", "notify_new_order", "notify_pending_order", "pending_order_hours", "notify_low_stock", "low_stock_threshold", "notify_out_of_stock", "notify_product_expiring", "product_expiring_days", "notify_promotion_expiring", "promotion_expiring_days", "notify_review_pending", "notification_priority_enabled", "notification_priority_important_min_usd", "notification_priority_critical_min_usd", "notification_show_order_subtotal", "notification_bell_priority_colors", "product_expiring_days_before", "product_expiring_critical_days", "notify_product_expired", "notify_variation_expiration", "notification_cleanup_enabled", "notification_cleanup_days", "analytics_cleanup_enabled", "analytics_retention_days", "analytics_heartbeat_enabled", "landing_qr_enabled", "landing_qr_title", "landing_qr_subtitle", "landing_qr_accent_color", "notify_expiration_alerts", "gifts_public_active", "gifts_public_title", "marketing_bar_active", "marketing_bar_theme", "marketing_bar_motion", "footer_title"],
    markerFields: ["store_description", "business_notes", "pickup_coordination_message", "business_hours", "welcome_text", "public_services_text", "reviews_text", "footer_text", "footer_contact_text", "footer_extra_text", "footer_link_1_label", "footer_link_1_url", "footer_link_2_label", "footer_link_2_url", "footer_social_links", "footer_trust_items", "shipping_delivery_info", "closed_message", "temporarily_closed_message", "review_whatsapp_message", "marketing_bar_text", "marketing_bar_button_text", "marketing_bar_url", "marketing_bar_items_json", "landing_qr_links", "cover_gallery_order", "cover_image", "logo_image", "cover_image_1", "cover_image_2", "cover_image_3", "cover_image_4", "cover_gallery", "gifts_public_image", "landing_qr_hero_image"],
    markerAliases: {
      whatsapp_number: "store_contact", address: "public_location", province: "public_location",
      municipality: "public_location", address_detail: "public_location",
    },
    criticalFields: ["active", "maintenance_mode", "default_currency", "allow_orders_when_closed", "landing_qr_enabled", "notifications_enabled"],
  }),
  currencies: Object.freeze({
    module: "settings", resourceType: "currency", labelFields: ["name", "code"],
    safeFields: ["name", "code", "symbol", "active", "is_default", "is_system", "is_base", "exchange_rate", "rate"],
    criticalFields: ["active", "is_default", "is_base", "exchange_rate", "rate"],
  }),
  store_security_settings: Object.freeze({
    module: "security", resourceType: "security_settings", labelFields: [],
    safeFields: ["enabled", "mode", "manual_blocking_enabled", "full_access_blocking_enabled", "permanent_blocks_enabled", "retention_days", "ip_visibility", "notify_blocked_attempts"],
    criticalFields: ["enabled", "mode", "manual_blocking_enabled", "full_access_blocking_enabled", "permanent_blocks_enabled", "ip_visibility"],
  }),
  store_security_blocks: Object.freeze({
    module: "security", resourceType: "security_block", labelFields: [],
    safeFields: ["status", "scope", "match_phone", "match_device", "match_ip", "match_mode", "duration", "starts_at", "expires_at", "revoked_at"],
    markerAliases: { reason_internal: "security_reason", revoke_reason: "security_reason" },
    criticalFields: ["status", "scope", "match_phone", "match_device", "match_ip", "match_mode", "expires_at", "revoked_at"],
  }),
});

function text(value, max) {
  let result = "";
  try { result = String(value === null || value === undefined ? "" : value).trim(); } catch (_) {}
  return result.slice(0, Math.max(0, Number(max) || 0));
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  const value = recordValue(record, key);
  if (value && typeof value.string === "function") {
    try { return text(value.string(), max || 1000); } catch (_) {}
  }
  return text(value, max || 1000);
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return text(value[0] && value[0].id || value[0], 80);
  if (value && typeof value === "object") return text(value.id, 80);
  return text(value, 80);
}

function recordId(record) {
  return text(record && (record.id || recordString(record, "id", 80)), 80);
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function findRecord(app, collection, id) {
  if (!id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function collectionName(e, fallback) {
  if (fallback) return text(fallback, 80);
  try { return text(e.collection.name, 80); } catch (_) {}
  try { return text(e.record.collection().name, 80); } catch (_) {}
  return "";
}

function plainJson(value) {
  if (typeof value === "string" && value) {
    try { return JSON.parse(value); } catch (_) { return value; }
  }
  if (value && typeof value === "object" && typeof value.raw === "string") {
    try { return JSON.parse(value.raw); } catch (_) {}
  }
  return value;
}

function safeScalar(value) {
  const parsed = plainJson(value);
  if (parsed === null || parsed === undefined || parsed === "") return "";
  if (typeof parsed === "boolean") return parsed;
  if (typeof parsed === "number") return Number.isFinite(parsed) ? parsed : 0;
  if (typeof parsed === "string") return parsed.slice(0, 500);
  return undefined;
}

function sanitizeValue(value, depth) {
  const parsed = plainJson(value);
  if (parsed && typeof parsed === "object" && typeof parsed.string === "function") {
    try {
      const stringValue = text(parsed.string(), 500);
      return stringValue || undefined;
    } catch (_) {}
  }
  const scalar = safeScalar(parsed);
  if (scalar !== undefined) return scalar;
  if (depth > 1) return undefined;
  if (Array.isArray(parsed)) {
    return parsed.slice(0, 50).map((item) => sanitizeValue(item, depth + 1)).filter((item) => item !== undefined);
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const result = {};
  Object.keys(parsed).sort().slice(0, 50).forEach((key) => {
    if (!/^[a-z0-9_.-]{1,80}$/i.test(key) || PROHIBITED_KEY_PATTERN.test(key)) return;
    const safe = sanitizeValue(parsed[key], depth + 1);
    if (safe !== undefined) result[key] = safe;
  });
  return Object.keys(result).length ? result : undefined;
}

function sanitizeObject(input) {
  const parsed = plainJson(input);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return sanitizeValue(parsed, 0) || {};
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function shortFingerprint(value) {
  const source = stableValue(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeFieldValue(record, key) {
  const value = recordValue(record, key);
  if (FILE_VALUE_FIELDS.has(key)) {
    const parsed = plainJson(value);
    const count = Array.isArray(parsed) ? parsed.length : (value ? 1 : 0);
    return count || "";
  }
  // Relation ids are useful internally for tenant checks but must never be
  // rendered as before/after values. Preserve only assignment/cardinality.
  if (RELATION_VALUE_FIELDS.has(key)) {
    const parsed = plainJson(value);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).length || "";
    return value ? true : "";
  }
  return sanitizeValue(value, 0);
}

function comparisonFieldValue(record, key) {
  const value = plainJson(recordValue(record, key));
  if (!FILE_VALUE_FIELDS.has(key) && !RELATION_VALUE_FIELDS.has(key)) {
    return safeFieldValue(record, key);
  }
  const entries = (Array.isArray(value) ? value : (value ? [value] : []))
    .map((item) => {
      if (item && typeof item === "object") return text(item.id || item.name || item.value, 500);
      return text(item, 500);
    })
    .filter(Boolean);
  return {
    count: entries.length,
    // Used only while comparing and deriving the hidden source key. Raw
    // relation ids and filenames are never persisted in before/after values.
    fingerprint: shortFingerprint(entries),
  };
}

function comparisonSnapshotForRecord(record, config) {
  const result = {};
  if (!record || !config) return result;
  config.safeFields.forEach((key) => {
    if (PROHIBITED_KEY_PATTERN.test(key)) return;
    const value = comparisonFieldValue(record, key);
    if (value !== undefined) result[key] = value;
  });
  return result;
}

function snapshotForRecord(record, config) {
  const result = {};
  if (!record || !config) return result;
  config.safeFields.forEach((key) => {
    if (PROHIBITED_KEY_PATTERN.test(key)) return;
    const value = safeFieldValue(record, key);
    if (value !== undefined && value !== "") result[key] = value;
  });
  return result;
}

function valueEquals(left, right) {
  return stableValue(left) === stableValue(right);
}

function transitionMarker(key, current) {
  if (FILE_VALUE_FIELDS.has(key)) return current ? "Archivo actualizado" : "Archivo anterior";
  if (RELATION_VALUE_FIELDS.has(key)) return current ? "Asignación actualizada" : "Asignación anterior";
  return current ? "Valor actualizado" : "Valor anterior";
}

function changedSnapshots(previous, next, previousComparison, nextComparison) {
  const changed = [];
  const before = {};
  const after = {};
  const comparisonBefore = previousComparison || previous || {};
  const comparisonAfter = nextComparison || next || {};
  [...new Set([
    ...Object.keys(previous || {}), ...Object.keys(next || {}),
    ...Object.keys(comparisonBefore), ...Object.keys(comparisonAfter),
  ])].sort().forEach((key) => {
    if (valueEquals(comparisonBefore[key], comparisonAfter[key])) return;
    changed.push(key);
    const hasBefore = previous && Object.prototype.hasOwnProperty.call(previous, key);
    const hasAfter = next && Object.prototype.hasOwnProperty.call(next, key);
    if (hasBefore) before[key] = previous[key];
    if (hasAfter) after[key] = next[key];
    if (hasBefore && hasAfter && valueEquals(before[key], after[key])) {
      before[key] = transitionMarker(key, false);
      after[key] = transitionMarker(key, true);
    }
  });
  return { changed, previous: before, next: after };
}

function actorTemplate(app, storeId, actorId) {
  if (!RECORD_ID_PATTERN.test(storeId) || !RECORD_ID_PATTERN.test(actorId)) return "";
  try {
    const access = app.findFirstRecordByFilter(
      "store_user_access",
      "store = {:store} && user = {:user}",
      { store: storeId, user: actorId },
    );
    return recordString(access, "template_code", 80);
  } catch (_) { return ""; }
}

function actorValues(app, storeId, actor, requestedOrigin) {
  const role = recordString(actor, "role", 40);
  const actorId = recordId(actor);
  const systemOrigin = requestedOrigin === "migration" ? "migration" : "system";
  if (!actor || !["master_admin", "store_admin", "store_staff"].includes(role) || !actorId) {
    return {
      actor: "",
      actor_id_snapshot: systemOrigin,
      actor_name_snapshot: systemOrigin === "migration" ? "Migración" : "Sistema",
      actor_email_snapshot: "",
      actor_role_snapshot: systemOrigin,
      actor_template_snapshot: "",
      origin: systemOrigin,
    };
  }
  const origin = role === "master_admin" ? "master_admin" : "store_admin";
  return {
    actor: RECORD_ID_PATTERN.test(actorId) ? actorId : "",
    actor_id_snapshot: actorId,
    actor_name_snapshot: text(recordString(actor, "display_name", 160) || recordString(actor, "name", 160) || recordString(actor, "email", 160) || (role === "master_admin" ? "Master Admin" : "Usuario del equipo"), 160),
    actor_email_snapshot: text(recordString(actor, "email", 254).toLowerCase(), 254),
    actor_role_snapshot: role,
    actor_template_snapshot: actorTemplate(app, storeId, actorId),
    origin,
  };
}

function normalizeChangedFields(value, previous, next) {
  const explicit = Array.isArray(value) ? value : [];
  const fields = explicit.length ? explicit : [...new Set([...Object.keys(previous), ...Object.keys(next)])];
  return fields
    .map((field) => text(field, 80))
    .filter((field) => /^[a-z0-9_.-]+$/i.test(field) && !PROHIBITED_KEY_PATTERN.test(field))
    .slice(0, 50);
}

function buildActivityValues(app, input) {
  const values = input && typeof input === "object" ? input : {};
  const storeId = text(values.storeId || values.store_id || recordId(values.store), 15);
  if (!RECORD_ID_PATTERN.test(storeId)) throw new Error("activity_store_required");
  const moduleName = MODULES.includes(values.module) ? values.module : "operation";
  const severity = SEVERITIES.includes(values.severity) ? values.severity : "normal";
  const actor = actorValues(app, storeId, values.actor, ORIGINS.includes(values.origin) ? values.origin : "system");
  const previous = sanitizeObject(values.previousValues || values.previous_values || {});
  const next = sanitizeObject(values.newValues || values.new_values || {});
  const sourceKey = text(values.sourceEventKey || values.source_event_key, 255).replace(/\s+/g, "T");
  if (!sourceKey || SOURCE_KEY_PROHIBITED_PATTERN.test(sourceKey)) {
    throw new Error("activity_source_key_required");
  }
  const summary = text(values.summary, 500);
  if (!summary) throw new Error("activity_summary_required");
  return {
    store: storeId,
    ...actor,
    module: moduleName,
    action: text(values.action, 100) || "updated",
    severity,
    resource_type: text(values.resourceType || values.resource_type, 80) || moduleName,
    resource_id_snapshot: text(values.resourceId || values.resource_id_snapshot, 80),
    resource_label_snapshot: text(values.resourceLabel || values.resource_label_snapshot, 180),
    changed_fields_json: normalizeChangedFields(values.changedFields || values.changed_fields, previous, next),
    previous_values_json: previous,
    new_values_json: next,
    summary,
    source_event_key: sourceKey,
  };
}

function findActivityBySource(app, storeId, sourceKey) {
  try {
    return app.findFirstRecordByFilter(
      ACTIVITY_COLLECTION,
      "store = {:store} && source_event_key = {:source}",
      { store: storeId, source: sourceKey },
    );
  } catch (_) { return null; }
}

function createActivity(app, input) {
  const values = buildActivityValues(app, input);
  const existing = findActivityBySource(app, values.store, values.source_event_key);
  if (existing) return existing;
  const record = new Record(app.findCollectionByNameOrId(ACTIVITY_COLLECTION), {});
  Object.keys(values).forEach((key) => record.set(key, values[key]));
  try { app.save(record); }
  catch (error) {
    const duplicate = findActivityBySource(app, values.store, values.source_event_key);
    if (duplicate) return duplicate;
    throw error;
  }
  return record;
}

function recordStoreId(app, collection, record) {
  if (collection === "stores") return recordId(record || originalRecord(record));
  const direct = relationId(record, "store");
  if (direct) return direct;
  const original = originalRecord(record);
  const originalDirect = relationId(original, "store");
  if (originalDirect) return originalDirect;
  if (collection === "product_variations") {
    const product = findRecord(app, "products", relationId(record, "product") || relationId(original, "product"));
    return relationId(product, "store");
  }
  if (collection === "order_items") {
    const order = findRecord(app, "orders", relationId(record, "order") || relationId(original, "order"));
    return relationId(order, "store");
  }
  if (collection === "raffle_entries") {
    const raffle = findRecord(app, "raffles", relationId(record, "raffle") || relationId(original, "raffle"));
    return relationId(raffle, "store");
  }
  return "";
}

function resourceLabel(record, config) {
  for (const key of config.labelFields || []) {
    const label = recordString(record, key, 180);
    if (label) return label;
  }
  const defaults = {
    order_item: "Artículo del pedido",
    raffle_entry: "Participación de rifa",
    review: "Reseña",
    settings: "Ajustes de la tienda",
    security_settings: "Configuración de Seguridad",
    security_block: "Bloqueo de Seguridad",
  };
  return defaults[config.resourceType] || "Elemento administrativo";
}

function operationSummary(operation, config, label, changed) {
  if (operation === "create") return `Creó ${label}`;
  if (operation === "delete") return `Eliminó ${label}`;
  const friendly = {
    active: "visibilidad", visible: "visibilidad", status: "estado", stock: "stock",
    price: "precio", price_usd: "precio", base_price_usd: "precio", regular_price_usd: "precio",
    offer_price: "precio de oferta", offer_price_usd: "precio de oferta", expiration_date: "vencimiento",
    quantity: "cantidad", category: "categoría", subcategory: "subcategoría",
  };
  const labels = [...new Set(changed.map((key) => friendly[key] || key.replace(/_/g, " ")))].slice(0, 3);
  return labels.length ? `Cambió ${labels.join(", ")} de ${label}` : `Actualizó ${label}`;
}

function requestHeader(e, name) {
  try {
    const headers = e.requestInfo().headers || {};
    return text(headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()], 120);
  } catch (_) { return ""; }
}

function requestSourceKey(e, collection, operation, record, diff) {
  const explicit = requestHeader(e, "x-request-id") || requestHeader(e, "idempotency-key");
  const version = recordString(record, operation === "create" ? "created" : "updated", 60)
    || recordString(originalRecord(record), "updated", 60)
    || shortFingerprint(diff);
  const normalizedExplicit = explicit.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 100);
  const safeExplicit = PROHIBITED_KEY_PATTERN.test(normalizedExplicit) ? "" : normalizedExplicit;
  // Client request ids are only an auxiliary component. Server-derived record
  // version and diff fingerprint always participate so a reused header cannot
  // collapse two different committed changes into one audit event.
  return `rest:${collection}:${operation}:${recordId(record)}:${version || "unversioned"}:${shortFingerprint(diff)}:${safeExplicit}`.slice(0, 255);
}

function requestedMarkerFields(e, config) {
  const allowed = new Set((config && config.markerFields || []).filter((key) => (
    /^[a-z0-9_.-]{1,80}$/i.test(key) && !PROHIBITED_KEY_PATTERN.test(key)
  )));
  if (!allowed.size) return [];
  let body = null;
  try { body = e.requestInfo().body || null; } catch (_) {}
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const aliases = config && config.markerAliases && typeof config.markerAliases === "object"
    ? config.markerAliases
    : {};
  const fields = [];
  Object.keys(body).forEach((key) => {
    const candidate = allowed.has(key) ? key : text(aliases[key], 80);
    if (!candidate || !/^[a-z0-9_.-]{1,80}$/i.test(candidate) || PROHIBITED_KEY_PATTERN.test(candidate)) return;
    fields.push(candidate);
  });
  return [...new Set(fields)].slice(0, 50);
}

function requestBodyKeys(e) {
  let body = null;
  try { body = e.requestInfo().body || null; } catch (_) {}
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body).filter((key) => typeof body[key] !== "function");
}

function rejectDirectStoreSpecializedUpdate(e) {
  if (!requestBodyKeys(e).some((key) => STORE_SPECIALIZED_FIELDS.has(String(key).replace(/[+-]$/, "")))) return;
  rejectDirectActivityMutation(e);
}

function isAdministrativeActor(actor) {
  const role = recordString(actor, "role", 40);
  const status = recordString(actor, "status", 40).toLowerCase();
  return ["master_admin", "store_admin", "store_staff"].includes(role)
    && (role === "master_admin" || status === "active");
}

function createRecordMutationActivity(app, e, operation, collection, beforeRecord) {
  const config = COLLECTION_CONFIG[collection];
  if (!config || !isAdministrativeActor(e && e.auth)) return null;
  const record = e.record;
  const storeId = recordStoreId(app, collection, record || beforeRecord);
  if (!RECORD_ID_PATTERN.test(storeId)) throw new Error("activity_store_required");
  const before = operation === "create" ? {} : snapshotForRecord(beforeRecord || originalRecord(record), config);
  const after = operation === "delete" ? {} : snapshotForRecord(record, config);
  const comparisonBefore = operation === "create" ? {} : comparisonSnapshotForRecord(beforeRecord || originalRecord(record), config);
  const comparisonAfter = operation === "delete" ? {} : comparisonSnapshotForRecord(record, config);
  const diff = changedSnapshots(before, after, comparisonBefore, comparisonAfter);
  const markerFields = operation === "update" ? requestedMarkerFields(e, config) : [];
  const changedFields = [...new Set([...diff.changed, ...markerFields])].sort();
  if (operation === "update" && !changedFields.length) return null;
  const label = resourceLabel(operation === "delete" ? (beforeRecord || record) : record, config);
  const severity = changedFields.some((field) => (config.criticalFields || []).includes(field))
    || operation === "delete" ? "critical" : (operation === "create" ? "important" : "normal");
  return createActivity(app, {
    storeId,
    actor: e.auth,
    module: config.module,
    action: `${config.resourceType}_${operation === "create" ? "created" : operation === "delete" ? "deleted" : "updated"}`,
    severity,
    resourceType: config.resourceType,
    resourceId: recordId(record || beforeRecord),
    resourceLabel: label,
    changedFields,
    previousValues: diff.previous,
    newValues: diff.next,
    summary: operationSummary(operation, config, label, changedFields),
    sourceEventKey: requestSourceKey(e, collection, operation, record || beforeRecord, {
      ...diff,
      comparison: { previous: comparisonBefore, next: comparisonAfter },
      markerFields,
    }),
  });
}

function handleRecordMutationRequest(e, operation, explicitCollection) {
  const collection = collectionName(e, explicitCollection);
  if (!COLLECTION_CONFIG[collection] || !isAdministrativeActor(e && e.auth)) return e.next();
  if (collection === "stores" && operation === "update") rejectDirectStoreSpecializedUpdate(e);
  const before = operation === "create" ? null : (originalRecord(e.record) || e.record);
  let result;
  const originalApp = e.app;
  const run = (app) => {
    try { e.app = app; } catch (_) {}
    result = e.next();
    createRecordMutationActivity(app, e, operation, collection, before);
  };
  try {
    const alreadyTransactional = originalApp && typeof originalApp.isTransactional === "function"
      ? originalApp.isTransactional() === true
      : false;
    if (originalApp && typeof originalApp.runInTransaction === "function" && !alreadyTransactional) originalApp.runInTransaction(run);
    else run(originalApp);
    return result;
  } finally {
    try { e.app = originalApp; } catch (_) {}
  }
}

function rejectDirectActivityMutation(e) {
  const message = "The requested resource wasn't found.";
  if (typeof NotFoundError === "function") throw new NotFoundError(message);
  const error = new Error("not_found");
  error.code = "not_found";
  throw error;
}

function rejectDirectStoreDeletion(e) {
  return rejectDirectActivityMutation(e);
}

module.exports = {
  ACTIVITY_COLLECTION,
  REVIEW_COLLECTION,
  ACTOR_ROLES,
  COLLECTION_CONFIG,
  FILE_VALUE_FIELDS,
  MODULES,
  ORIGINS,
  PROHIBITED_KEY_PATTERN,
  RELATION_VALUE_FIELDS,
  SEVERITIES,
  STORE_SPECIALIZED_FIELDS,
  buildActivityValues,
  changedSnapshots,
  comparisonSnapshotForRecord,
  createActivity,
  createRecordMutationActivity,
  findActivityBySource,
  handleRecordMutationRequest,
  isAdministrativeActor,
  recordId,
  recordStoreId,
  recordString,
  recordValue,
  rejectDirectActivityMutation,
  rejectDirectStoreDeletion,
  rejectDirectStoreSpecializedUpdate,
  relationId,
  sanitizeObject,
  snapshotForRecord,
};
