/// <reference path="../pb_data/types.d.ts" />

const CAMPAIGN_TIMEZONE = "America/Havana";
const QUOTA_FIELD = "push_campaign_quota_state";

function recordValue(record, key) {
  try { return record.get(key); } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record && record[key];
}

function recordString(record, key) {
  return String(recordValue(record, key) || "").trim();
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

function forEachRecord(app, collection, callback) {
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const records = app.findRecordsByFilter(collection, "", "id", pageSize, offset, {}) || [];
    records.forEach(callback);
    if (records.length < pageSize) break;
  }
}

migrate((app) => {
  forEachRecord(app, "push_campaigns", (campaign) => {
    if (recordString(campaign, "timezone") === CAMPAIGN_TIMEZONE) return;
    campaign.set("timezone", CAMPAIGN_TIMEZONE);
    app.save(campaign);
  });

  forEachRecord(app, "stores", (store) => {
    const state = jsonObject(recordValue(store, QUOTA_FIELD));
    const starts = state.starts && typeof state.starts === "object" && !Array.isArray(state.starts)
      ? state.starts
      : {};
    if (!state.timezone && Object.keys(starts).length === 0) return;
    store.set(QUOTA_FIELD, { ...state, timezone: CAMPAIGN_TIMEZONE, starts });
    app.save(store);
  });
}, (app) => {
  // La reversión conserva la zona canónica para no reinterpretar ni reiniciar cuotas históricas.
  return app;
});
