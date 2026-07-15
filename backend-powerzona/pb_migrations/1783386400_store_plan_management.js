/// <reference path="../pb_data/types.d.ts" />

const STORE_PERMANENT_FIELD_ID = "bool1783386401";
const AUDIT_PREVIOUS_PERMANENT_FIELD_ID = "bool1783386402";
const AUDIT_NEW_PERMANENT_FIELD_ID = "bool1783386403";
const PERMANENCE_ACTIONS = ["plan_made_permanent", "plan_made_temporary"];

function boolField(id, name) {
  return {
    default: false,
    hidden: false,
    id,
    name,
    presentable: false,
    required: false,
    system: false,
    type: "bool",
  };
}

function recordString(record, key) {
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

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

function listRecords(app, collection, filter) {
  const records = [];
  const limit = 200;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter(collection, filter || "", "id", limit, offset) || [];
    records.push(...batch);
    if (batch.length < limit) return records;
    offset += limit;
  }
}

function appendSelectValues(field, values) {
  const current = Array.isArray(field.values) ? field.values : [];
  field.values = [...current, ...values.filter((value) => !current.includes(value))];
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const audit = app.findCollectionByNameOrId("store_plan_audit");

  stores.fields.add(new Field(boolField(STORE_PERMANENT_FIELD_ID, "plan_is_permanent")));
  audit.fields.add(new Field(boolField(AUDIT_PREVIOUS_PERMANENT_FIELD_ID, "previous_is_permanent")));
  audit.fields.add(new Field(boolField(AUDIT_NEW_PERMANENT_FIELD_ID, "new_is_permanent")));

  const actionField = audit.fields.getByName("action");
  appendSelectValues(actionField, PERMANENCE_ACTIONS);
  app.save(stores);
  app.save(audit);

  const migratedAt = new Date().toISOString();
  listRecords(app, "stores", "").forEach((store) => {
    const isPowerZona = recordString(store, "slug").toLowerCase() === "powerzona";
    store.set("plan_is_permanent", isPowerZona);
    if (!isPowerZona) {
      app.save(store);
      return;
    }

    const previousPlan = recordString(store, "plan");
    const previousStartedAt = recordString(store, "plan_started_at");
    const previousExpiresAt = recordString(store, "plan_expires_at");
    const startedAt = previousStartedAt || recordString(store, "created") || migratedAt;

    store.set("plan", "premium");
    store.set("plan_started_at", startedAt);
    store.set("plan_expires_at", "");
    store.set("plan_duration_months", 0);
    store.set("plan_updated_by", "");
    store.set("plan_updated_at", migratedAt);
    app.save(store);

    const entry = new Record(audit, {});
    entry.set("store", store.id);
    entry.set("store_id_snapshot", String(store.id || "").slice(0, 15));
    entry.set("store_name_snapshot", recordString(store, "name").slice(0, 140));
    entry.set("store_slug_snapshot", recordString(store, "slug").slice(0, 80));
    entry.set("actor_name_snapshot", "Migración P7M2");
    entry.set("actor_role_snapshot", "system");
    entry.set("action", "plan_made_permanent");
    entry.set("previous_plan", ["free", "basic", "premium"].includes(previousPlan) ? previousPlan : "");
    entry.set("new_plan", "premium");
    entry.set("previous_started_at", previousStartedAt);
    entry.set("new_started_at", startedAt);
    entry.set("previous_expires_at", previousExpiresAt);
    entry.set("new_expires_at", "");
    entry.set("previous_is_permanent", false);
    entry.set("new_is_permanent", true);
    entry.set("duration_months", 0);
    entry.set("reason", "PowerZona configurada como Premium permanente por decisión oficial del proyecto.");
    app.save(entry);
  });
}, (app) => {
  const audit = app.findCollectionByNameOrId("store_plan_audit");
  PERMANENCE_ACTIONS.forEach((action) => {
    listRecords(app, "store_plan_audit", `action = "${action}"`).forEach((record) => app.delete(record));
  });

  const actionField = audit.fields.getByName("action");
  actionField.values = (Array.isArray(actionField.values) ? actionField.values : [])
    .filter((value) => !PERMANENCE_ACTIONS.includes(value));
  removeFieldByIdIfExists(audit, AUDIT_PREVIOUS_PERMANENT_FIELD_ID);
  removeFieldByIdIfExists(audit, AUDIT_NEW_PERMANENT_FIELD_ID);
  app.save(audit);

  const stores = app.findCollectionByNameOrId("stores");
  removeFieldByIdIfExists(stores, STORE_PERMANENT_FIELD_ID);
  app.save(stores);
});
