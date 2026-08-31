/// <reference path="../pb_data/types.d.ts" />

"use strict";

// Contrato central de C02. Las colecciones permanecen privadas (reglas REST
// null) y los gateways de C03+ deben llamar estas validaciones antes de guardar.
const STOREFRONT_PUSH_COLLECTIONS = Object.freeze([
  "storefront_app_configs",
  "storefront_installations",
  "storefront_web_sessions",
  "storefront_order_links",
  "push_media",
  "push_campaigns",
  "push_campaign_deliveries",
  "push_events",
  "push_daily_stats",
]);

const STOREFRONT_CUSTOMER_COLLECTIONS = Object.freeze([
  "storefront_installation_coupons",
]);

const ADMIN_PUSH_COLLECTIONS = Object.freeze([
  "store_push_devices",
  "store_notifications",
]);

const COLLECTION_STATES = Object.freeze({
  storefront_app_configs: Object.freeze(["draft", "active", "suspended", "retired"]),
  storefront_installations: Object.freeze(["active", "disabled", "invalid", "revoked"]),
  storefront_web_sessions: Object.freeze(["pending", "active", "consumed", "expired", "revoked"]),
  storefront_order_links: Object.freeze(["active", "revoked", "expired"]),
  storefront_installation_coupons: Object.freeze(["active", "used", "removed", "expired"]),
  push_media: Object.freeze(["active", "archived", "pending_delete"]),
  push_campaigns: Object.freeze([
    "draft", "scheduled", "processing", "sent", "partially_sent", "failed", "canceled", "paused_plan",
  ]),
  push_campaign_deliveries: Object.freeze([
    "pending", "claimed", "accepted", "failed_transient", "failed_permanent", "invalid_fid", "unknown", "canceled",
  ]),
  push_events: Object.freeze(["opened", "destination_viewed", "coupon_applied", "order_attributed"]),
});

const NOTIFICATION_PERMISSION_STATES = Object.freeze(["unknown", "granted", "denied"]);
const CAMPAIGN_AUDIENCE_TYPES = Object.freeze([
  "all_active", "active_7d", "active_30d", "app_version", "notification_permission", "country_region",
]);
const CAMPAIGN_TARGET_TYPES = Object.freeze([
  "home", "product", "category", "section", "order", "raffle", "coupon",
]);
const CAMPAIGN_TARGET_SECTIONS = Object.freeze(["search", "links", "gifts", "raffles", "checkout"]);

const RETENTION_POLICY = Object.freeze({
  installation_full_ip_days: 30,
  web_session_days_after_expiration: 30,
  delivery_days: 90,
  event_days: 90,
  campaign_days: 7,
  attribution_days: 7,
  campaign_technical_days: 90,
  campaign_quota_entry_days: 40,
  daily_aggregate_days: 90,
  private_inbox_days: 30,
});

const SENSITIVE_FIELDS = Object.freeze({
  storefront_app_configs: Object.freeze(["firebase_app_id"]),
  storefront_installations: Object.freeze([
    "fid", "fid_digest", "app_set_digest", "credential_digest", "last_ip_encrypted", "ip_delete_after",
  ]),
  storefront_web_sessions: Object.freeze(["session_digest"]),
  storefront_order_links: Object.freeze(["campaign_id_snapshot", "delivery_id_snapshot", "coupon_id_snapshot"]),
  storefront_installation_coupons: Object.freeze(["installation"]),
  push_media: Object.freeze([]),
  push_campaigns: Object.freeze(["lock_token", "audience_config"]),
  push_campaign_deliveries: Object.freeze([
    "claim_token", "firebase_message_id", "inbox_title", "inbox_body", "inbox_image_url",
  ]),
  push_events: Object.freeze(["idempotency_key", "metadata_json", "order", "coupon"]),
  push_daily_stats: Object.freeze([]),
});

const TENANT_RELATIONS = Object.freeze({
  storefront_app_configs: Object.freeze({}),
  storefront_installations: Object.freeze({ app_config: "storefront_app_configs" }),
  storefront_web_sessions: Object.freeze({ installation: "storefront_installations" }),
  storefront_order_links: Object.freeze({ installation: "storefront_installations", order: "orders" }),
  storefront_installation_coupons: Object.freeze({
    installation: "storefront_installations",
    coupon: "manual_coupons",
  }),
  push_media: Object.freeze({ created_by: "users" }),
  push_campaigns: Object.freeze({
    created_by: "users",
    media: "push_media",
    target_product: "products",
    target_category: "categories",
    target_order: "orders",
    target_raffle: "raffles",
    target_coupon: "manual_coupons",
  }),
  push_campaign_deliveries: Object.freeze({
    campaign: "push_campaigns",
    installation: "storefront_installations",
  }),
  push_events: Object.freeze({
    campaign: "push_campaigns",
    delivery: "push_campaign_deliveries",
    installation: "storefront_installations",
    order: "orders",
    coupon: "manual_coupons",
  }),
  push_daily_stats: Object.freeze({ campaign: "push_campaigns" }),
});

const UNOWNED_RELATIONS_ALLOWED = Object.freeze({
  push_media: Object.freeze(["created_by"]),
  push_campaigns: Object.freeze(["created_by"]),
});

class StorefrontPushSchemaError extends Error {
  constructor(code, field) {
    super(code);
    this.name = "StorefrontPushSchemaError";
    this.code = code;
    this.field = field || "";
  }
}

function safeText(value) {
  try { return String(value === null || value === undefined ? "" : value).trim(); } catch (_) { return ""; }
}

function recordValue(record, key) {
  if (!record) return undefined;
  try { if (typeof record.get === "function") return record.get(key); } catch (_) {}
  return record[key];
}

function relationIds(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean);
  const id = safeText(value && typeof value === "object" ? value.id : value);
  return id ? [id] : [];
}

function findRecord(app, collection, id) {
  if (!app || !collection || !id) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function recordStoreId(record) {
  return safeText(recordValue(record, "store"));
}

function isPrivateCollection(collectionName) {
  const name = safeText(collectionName);
  return STOREFRONT_PUSH_COLLECTIONS.includes(name) || STOREFRONT_CUSTOMER_COLLECTIONS.includes(name);
}

function isAdminPushCollection(collectionName) {
  return ADMIN_PUSH_COLLECTIONS.includes(safeText(collectionName));
}

function isValidState(collectionName, state) {
  const values = COLLECTION_STATES[safeText(collectionName)];
  return !!values && values.includes(safeText(state));
}

function assertValidState(collectionName, state) {
  if (!isValidState(collectionName, state)) throw new StorefrontPushSchemaError("invalid_state", "status");
  return true;
}

function assertCollectionRulesClosed(collection) {
  if (!collection) throw new StorefrontPushSchemaError("missing_collection");
  for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
    if (collection[key] !== null) throw new StorefrontPushSchemaError("collection_rule_not_closed", key);
  }
  return true;
}

function assertTenantIsolation(app, collectionName, record) {
  const name = safeText(collectionName);
  if (!isPrivateCollection(name)) throw new StorefrontPushSchemaError("unknown_collection");
  const storeId = recordStoreId(record);
  if (!storeId) throw new StorefrontPushSchemaError("missing_store", "store");

  const relations = TENANT_RELATIONS[name] || {};
  const allowUnowned = UNOWNED_RELATIONS_ALLOWED[name] || [];
  for (const [field, relatedCollection] of Object.entries(relations)) {
    for (const id of relationIds(record, field)) {
      const related = findRecord(app, relatedCollection, id);
      if (!related) throw new StorefrontPushSchemaError("missing_relation", field);
      const relatedStoreId = recordStoreId(related);
      if (!relatedStoreId && allowUnowned.includes(field)) continue;
      if (!relatedStoreId || relatedStoreId !== storeId) {
        throw new StorefrontPushSchemaError("cross_store_relation", field);
      }
    }
  }
  return true;
}

function assertCampaignTarget(campaign) {
  const targetType = safeText(recordValue(campaign, "target_type"));
  if (!CAMPAIGN_TARGET_TYPES.includes(targetType)) {
    throw new StorefrontPushSchemaError("invalid_campaign_target", "target_type");
  }
  const fields = {
    product: "target_product",
    category: "target_category",
    order: "target_order",
    raffle: "target_raffle",
    coupon: "target_coupon",
  };
  const selected = Object.entries(fields).filter(([, field]) => relationIds(campaign, field).length > 0);
  if (targetType === "home") {
    if (selected.length || safeText(recordValue(campaign, "target_section"))) {
      throw new StorefrontPushSchemaError("invalid_campaign_target", "target_type");
    }
    return true;
  }
  if (targetType === "section") {
    if (selected.length || !CAMPAIGN_TARGET_SECTIONS.includes(safeText(recordValue(campaign, "target_section")))) {
      throw new StorefrontPushSchemaError("invalid_campaign_target", "target_section");
    }
    return true;
  }
  if (selected.length !== 1 || selected[0][0] !== targetType || safeText(recordValue(campaign, "target_section"))) {
    throw new StorefrontPushSchemaError("invalid_campaign_target", fields[targetType] || "target_type");
  }
  return true;
}

module.exports = {
  ADMIN_PUSH_COLLECTIONS,
  CAMPAIGN_AUDIENCE_TYPES,
  CAMPAIGN_TARGET_SECTIONS,
  CAMPAIGN_TARGET_TYPES,
  COLLECTION_STATES,
  NOTIFICATION_PERMISSION_STATES,
  RETENTION_POLICY,
  SENSITIVE_FIELDS,
  STOREFRONT_CUSTOMER_COLLECTIONS,
  STOREFRONT_PUSH_COLLECTIONS,
  TENANT_RELATIONS,
  StorefrontPushSchemaError,
  assertCampaignTarget,
  assertCollectionRulesClosed,
  assertTenantIsolation,
  assertValidState,
  isAdminPushCollection,
  isPrivateCollection,
  isValidState,
  recordStoreId,
  relationIds,
};
