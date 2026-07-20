/// <reference path="../pb_data/types.d.ts" />

const ACTIVITY_COLLECTION_ID = "pbc_1784595800";
const REVIEW_COLLECTION_ID = "pbc_1784595850";
const SECURITY_AUDIT_REVEAL_ACTION = "ip_information_revealed";
const SECURITY_AUDIT_MERGE_ACTION = "security_customer_identity_merged";
const SECURITY_AUDIT_C2_ACTIONS = [SECURITY_AUDIT_REVEAL_ACTION, SECURITY_AUDIT_MERGE_ACTION];

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: required === true, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required, hidden, cascadeDelete) {
  return {
    cascadeDelete: cascadeDelete === true, collectionId, hidden: hidden === true, id,
    maxSelect: 1, minSelect: required ? 1 : 0, name, presentable: false,
    required: required === true, system: false, type: "relation",
  };
}

function selectField(id, name, values, required, hidden) {
  return {
    hidden: hidden === true, id, maxSelect: 1, name, presentable: false,
    required: required === true, system: false, type: "select", values: values.slice(),
  };
}

function jsonField(id, name) {
  return {
    hidden: true, id, maxSize: 65536, name, presentable: false,
    required: false, system: false, type: "json",
  };
}

function dateField(id, name) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: false, system: false, type: "date",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: onUpdate === true,
    presentable: false, system: false, type: "autodate",
  };
}

function findCollectionSafe(app, name) {
  try { return app.findCollectionByNameOrId(name); } catch (_) { return null; }
}

function setSecurityActivityAuditActions(app, enabled) {
  const audit = findCollectionSafe(app, "store_security_audit");
  if (!audit) return;
  const action = audit.fields.getByName("action");
  const current = Array.isArray(action.values) ? action.values : [];
  const next = current.filter((value) => !SECURITY_AUDIT_C2_ACTIONS.includes(value));
  if (enabled) SECURITY_AUDIT_C2_ACTIONS.forEach((value) => next.push(value));
  action.values = next;
  app.save(audit);
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");

  setSecurityActivityAuditActions(app, true);

  if (!findCollectionSafe(app, "store_activity_audit")) {
    const activity = new Collection({
      id: ACTIVITY_COLLECTION_ID,
      name: "store_activity_audit",
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField("text1784595801"),
        relationField("relation1784595802", "store", stores.id, true, true, false),
        relationField("relation1784595803", "actor", users.id, false, true, false),
        textField("text1784595804", "actor_id_snapshot", 40, true, true),
        textField("text1784595805", "actor_name_snapshot", 160, true, false),
        textField("text1784595806", "actor_email_snapshot", 254, false, true),
        selectField("select1784595807", "actor_role_snapshot", ["master_admin", "store_admin", "store_staff", "system", "migration"], true, true),
        textField("text1784595808", "actor_template_snapshot", 80, false, true),
        selectField("select1784595809", "origin", ["store_admin", "master_admin", "system", "migration"], true, false),
        selectField("select1784595810", "module", ["catalog", "orders", "shipping", "marketing", "operation", "security", "team", "settings", "plan", "activity"], true, false),
        textField("text1784595811", "action", 100, true, false),
        selectField("select1784595812", "severity", ["normal", "important", "critical"], true, false),
        textField("text1784595813", "resource_type", 80, true, false),
        textField("text1784595814", "resource_id_snapshot", 80, false, true),
        textField("text1784595815", "resource_label_snapshot", 180, false, false),
        jsonField("json1784595816", "changed_fields_json"),
        jsonField("json1784595817", "previous_values_json"),
        jsonField("json1784595818", "new_values_json"),
        textField("text1784595819", "summary", 500, true, false),
        textField("text1784595820", "source_event_key", 255, true, true),
        autoDateField("autodate1784595821", "created", false),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_store_activity_source_unique` ON `store_activity_audit` (`store`, `source_event_key`)",
        "CREATE INDEX `idx_store_activity_store_created` ON `store_activity_audit` (`store`, `created`)",
        "CREATE INDEX `idx_store_activity_actor_created` ON `store_activity_audit` (`store`, `actor_id_snapshot`, `created`)",
        "CREATE INDEX `idx_store_activity_module_created` ON `store_activity_audit` (`store`, `module`, `created`)",
        "CREATE INDEX `idx_store_activity_resource_created` ON `store_activity_audit` (`store`, `resource_type`, `resource_id_snapshot`, `created`)",
        "CREATE INDEX `idx_store_activity_severity_created` ON `store_activity_audit` (`store`, `severity`, `created`)",
      ],
    });
    app.save(activity);
  }

  if (!findCollectionSafe(app, "store_activity_reviews")) {
    const activity = app.findCollectionByNameOrId("store_activity_audit");
    const reviews = new Collection({
      id: REVIEW_COLLECTION_ID,
      name: "store_activity_reviews",
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField("text1784595851"),
        relationField("relation1784595852", "store", stores.id, true, true, false),
        relationField("relation1784595853", "activity", activity.id, true, true, true),
        selectField("select1784595854", "status", ["pending", "reviewed", "requires_correction"], true, false),
        textField("text1784595855", "note", 1000, false, true),
        relationField("relation1784595856", "reviewed_by", users.id, false, true, false),
        textField("text1784595857", "reviewed_by_name_snapshot", 160, false, true),
        dateField("date1784595858", "reviewed_at"),
        autoDateField("autodate1784595859", "created", false),
        autoDateField("autodate1784595860", "updated", true),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_store_activity_reviews_activity_unique` ON `store_activity_reviews` (`activity`)",
        "CREATE INDEX `idx_store_activity_reviews_store_status` ON `store_activity_reviews` (`store`, `status`, `updated`)",
      ],
    });
    app.save(reviews);
  }
}, (app) => {
  const reviews = findCollectionSafe(app, "store_activity_reviews");
  if (reviews) app.delete(reviews);
  const activity = findCollectionSafe(app, "store_activity_audit");
  if (activity) app.delete(activity);
  setSecurityActivityAuditActions(app, false);
});
