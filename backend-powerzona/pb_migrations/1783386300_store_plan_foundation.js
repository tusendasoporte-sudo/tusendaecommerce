/// <reference path="../pb_data/types.d.ts" />

const STORE_PLAN_FIELD_IDS = [
  "date1783386301",
  "date1783386302",
  "number1783386303",
  "bool1783386304",
  "relation1783386305",
  "date1783386306",
];

const PLAN_CODES = ["free", "basic", "premium"];
const PLAN_AUDIT_ACTIONS = [
  "legacy_initialized",
  "trial_started",
  "plan_assigned",
  "plan_changed",
  "plan_renewed",
  "plan_expiration_corrected",
  "plan_expired",
];

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required) {
  return {
    autogeneratePattern: "", hidden: false, id, max, min: required ? 1 : 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function dateField(id, name) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: false, system: false, type: "date",
  };
}

function relationField(id, name, collectionId) {
  return {
    cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1,
    minSelect: 0, name, presentable: false, required: false,
    system: false, type: "relation",
  };
}

function selectField(id, name, values, required) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function numberField(id, name) {
  return {
    hidden: false, id, max: 12, min: 0, name, onlyInt: true,
    presentable: false, required: false, system: false, type: "number",
  };
}

function listAllStores(app) {
  const records = [];
  const limit = 200;
  let offset = 0;
  while (true) {
    const batch = app.findRecordsByFilter("stores", "", "id", limit, offset);
    if (!batch || !batch.length) return records;
    records.push(...batch);
    if (batch.length < limit) return records;
    offset += limit;
  }
}

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");

  stores.fields.add(new Field(dateField("date1783386301", "plan_started_at")));
  stores.fields.add(new Field(dateField("date1783386302", "plan_expires_at")));
  stores.fields.add(new Field(numberField("number1783386303", "plan_duration_months")));
  stores.fields.add(new Field({
    default: false, hidden: false, id: "bool1783386304", name: "free_trial_used",
    presentable: false, required: false, system: false, type: "bool",
  }));
  stores.fields.add(new Field(relationField("relation1783386305", "plan_updated_by", users.id)));
  stores.fields.add(new Field(dateField("date1783386306", "plan_updated_at")));
  app.save(stores);

  const audit = new Collection({
    id: "pbc_1783386300",
    name: "store_plan_audit",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386310"),
      relationField("relation1783386311", "store", stores.id),
      textField("text1783386312", "store_id_snapshot", 15, true),
      textField("text1783386313", "store_name_snapshot", 140, true),
      textField("text1783386314", "store_slug_snapshot", 80, true),
      relationField("relation1783386315", "actor", users.id),
      textField("text1783386316", "actor_name_snapshot", 160, false),
      textField("text1783386317", "actor_role_snapshot", 40, false),
      selectField("select1783386318", "action", PLAN_AUDIT_ACTIONS, true),
      selectField("select1783386319", "previous_plan", PLAN_CODES, false),
      selectField("select1783386320", "new_plan", PLAN_CODES, false),
      dateField("date1783386321", "previous_started_at"),
      dateField("date1783386322", "new_started_at"),
      dateField("date1783386323", "previous_expires_at"),
      dateField("date1783386324", "new_expires_at"),
      numberField("number1783386325", "duration_months"),
      textField("text1783386326", "reason", 500, false),
      {
        hidden: false, id: "autodate1783386327", name: "created", onCreate: true,
        onUpdate: false, presentable: false, system: false, type: "autodate",
      },
    ],
    indexes: [
      "CREATE INDEX `idx_store_plan_audit_store_created` ON `store_plan_audit` (`store`, `created`)",
      "CREATE INDEX `idx_store_plan_audit_actor_created` ON `store_plan_audit` (`actor`, `created`)",
      "CREATE INDEX `idx_store_plan_audit_action_created` ON `store_plan_audit` (`action`, `created`)",
    ],
  });
  app.save(audit);

  listAllStores(app).forEach((store) => {
    store.set("plan_started_at", "");
    store.set("plan_expires_at", "");
    store.set("plan_duration_months", 0);
    store.set("free_trial_used", true);
    store.set("plan_updated_by", "");
    store.set("plan_updated_at", "");
    app.save(store);

    const legacyAudit = new Record(audit, {});
    const currentPlan = String(store.get("plan") || "");
    legacyAudit.set("store", store.id);
    legacyAudit.set("store_id_snapshot", store.id);
    legacyAudit.set("store_name_snapshot", String(store.get("name") || "").slice(0, 140));
    legacyAudit.set("store_slug_snapshot", String(store.get("slug") || "").slice(0, 80));
    legacyAudit.set("action", "legacy_initialized");
    legacyAudit.set("new_plan", PLAN_CODES.includes(currentPlan) ? currentPlan : "");
    legacyAudit.set("duration_months", 0);
    app.save(legacyAudit);
  });
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("store_plan_audit"));
  } catch (_) {}

  const stores = app.findCollectionByNameOrId("stores");
  STORE_PLAN_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(stores, id));
  return app.save(stores);
});
