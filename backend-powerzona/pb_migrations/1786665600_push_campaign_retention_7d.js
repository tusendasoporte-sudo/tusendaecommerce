/// <reference path="../pb_data/types.d.ts" />

const QUOTA_FIELD = "push_campaign_quota_state";
const QUOTA_FIELD_ID = "json17866656001";
const CAMPAIGN_RETENTION_DAYS = 7;
const LEGACY_CAMPAIGN_RETENTION_MONTHS = 24;
const QUOTA_ENTRY_RETENTION_DAYS = 40;
const ACTIVE_STATES = ["scheduled", "processing", "paused_plan"];
const TERMINAL_STATES = ["sent", "partially_sent", "failed", "canceled"];

function recordValue(record, key) {
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record && record[key];
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
}

function parsedDate(value) {
  const date = new Date(String(value || "").trim());
  return Number.isFinite(date.getTime()) ? date : null;
}

function addDays(value, days) {
  const date = parsedDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function addMonths(value, months) {
  const date = parsedDate(value);
  if (!date) return "";
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

function jsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; }
  }
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function fieldByName(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function forEachRecord(app, collection, callback) {
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const records = app.findRecordsByFilter(collection, "", "id", pageSize, offset, {}) || [];
    records.forEach(callback);
    if (records.length < pageSize) break;
  }
}

function retentionBase(campaign, now) {
  const status = recordString(campaign, "status");
  if (status === "draft") {
    return parsedDate(recordValue(campaign, "updated")) || parsedDate(recordValue(campaign, "created")) || now;
  }
  if (TERMINAL_STATES.includes(status)) {
    return parsedDate(recordValue(campaign, status === "canceled" ? "canceled_at" : "completed_at"))
      || parsedDate(recordValue(campaign, "updated"))
      || parsedDate(recordValue(campaign, "created"))
      || now;
  }
  return null;
}

migrate((app) => {
  const now = new Date();
  const quotaCutoff = now.getTime() - QUOTA_ENTRY_RETENTION_DAYS * 86_400_000;
  const stores = app.findCollectionByNameOrId("stores");
  if (!fieldByName(stores, QUOTA_FIELD)) {
    stores.fields.add(new Field({
      hidden: true,
      id: QUOTA_FIELD_ID,
      maxSize: 65536,
      name: QUOTA_FIELD,
      presentable: false,
      required: false,
      system: false,
      type: "json",
    }));
    app.save(stores);
  }

  const quotaByStore = {};
  forEachRecord(app, "push_campaigns", (campaign) => {
    const status = recordString(campaign, "status");
    const base = retentionBase(campaign, now);
    campaign.set("delete_after", ACTIVE_STATES.includes(status) || !base
      ? ""
      : addDays(base, CAMPAIGN_RETENTION_DAYS));
    app.save(campaign);

    const campaignId = String(campaign.id || recordString(campaign, "id"));
    const storeId = recordString(campaign, "store");
    const startedAt = parsedDate(recordValue(campaign, "started_at"));
    const timezone = recordString(campaign, "timezone");
    if (!/^[a-z0-9]{15}$/.test(campaignId)
      || !/^[a-z0-9]{15}$/.test(storeId)
      || !startedAt
      || startedAt.getTime() < quotaCutoff) return;
    if (!quotaByStore[storeId]) quotaByStore[storeId] = { timezone, starts: {} };
    if (!quotaByStore[storeId].timezone) quotaByStore[storeId].timezone = timezone;
    quotaByStore[storeId].starts[campaignId] = startedAt.toISOString();
  });

  Object.keys(quotaByStore).forEach((storeId) => {
    const store = app.findRecordById("stores", storeId);
    const existing = jsonObject(recordValue(store, QUOTA_FIELD));
    const existingStarts = existing.starts && typeof existing.starts === "object" && !Array.isArray(existing.starts)
      ? existing.starts
      : {};
    store.set(QUOTA_FIELD, {
      timezone: String(existing.timezone || quotaByStore[storeId].timezone || "").trim(),
      starts: { ...existingStarts, ...quotaByStore[storeId].starts },
    });
    app.save(store);
  });
}, (app) => {
  const stores = app.findCollectionByNameOrId("stores");
  forEachRecord(app, "stores", (store) => {
    const state = jsonObject(recordValue(store, QUOTA_FIELD));
    if (state.starts && Object.keys(state.starts).length) {
      throw new Error("unsafe_rollback_push_campaign_quota_state");
    }
  });

  const now = new Date();
  forEachRecord(app, "push_campaigns", (campaign) => {
    const base = retentionBase(campaign, now)
      || parsedDate(recordValue(campaign, "updated"))
      || parsedDate(recordValue(campaign, "created"))
      || now;
    campaign.set("delete_after", addMonths(base, LEGACY_CAMPAIGN_RETENTION_MONTHS));
    app.save(campaign);
  });
  const field = fieldByName(stores, QUOTA_FIELD);
  if (field) stores.fields.removeById(field.id);
  return app.save(stores);
});
