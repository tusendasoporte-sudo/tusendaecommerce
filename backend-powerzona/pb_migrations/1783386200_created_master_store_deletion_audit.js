/// <reference path="../pb_data/types.d.ts" />

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden) {
  return {
    autogeneratePattern: "", hidden: !!hidden, id, max, min: required ? 1 : 0,
    name, pattern: "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function relationField(id, name, collectionId) {
  return {
    cascadeDelete: false, collectionId, hidden: false, id, maxSelect: 1,
    minSelect: 0, name, presentable: false, required: false,
    system: false, type: "relation",
  };
}

function jsonField(id, name) {
  return {
    hidden: true, id, maxSize: 0, name, presentable: false,
    required: false, system: false, type: "json",
  };
}

function numberField(id, name) {
  return {
    hidden: false, id, max: null, min: 0, name, onlyInt: true,
    presentable: false, required: true, system: false, type: "number",
  };
}

function selectField(id, name, values) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: true, system: false, type: "select", values,
  };
}

function dateField(id, name) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: false, system: false, type: "date",
  };
}

function autoDateField(id, name) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: false,
    presentable: false, system: false, type: "autodate",
  };
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const collection = new Collection({
    id: "pbc_1783386200",
    name: "master_store_deletion_audit",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386200"),
      textField("text1783386201", "store_id_snapshot", 15, true, false),
      textField("text1783386202", "store_name_snapshot", 180, true, false),
      textField("text1783386203", "store_slug_snapshot", 100, true, false),
      relationField("relation1783386200", "actor", users.id),
      textField("text1783386204", "actor_name_snapshot", 160, false, false),
      textField("text1783386205", "actor_role_snapshot", 40, false, false),
      jsonField("json1783386200", "summary"),
      numberField("number1783386200", "total_records"),
      selectField("select1783386200", "status", ["completed", "failed"]),
      textField("text1783386206", "failure_code", 80, false, true),
      dateField("date1783386200", "completed_at"),
      autoDateField("autodate1783386200", "created"),
    ],
    indexes: [
      "CREATE INDEX `idx_master_store_deletion_audit_store_created` ON `master_store_deletion_audit` (`store_id_snapshot`, `created`)",
      "CREATE INDEX `idx_master_store_deletion_audit_actor_created` ON `master_store_deletion_audit` (`actor`, `created`)",
      "CREATE INDEX `idx_master_store_deletion_audit_status_created` ON `master_store_deletion_audit` (`status`, `created`)",
    ],
  });
  app.save(collection);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("master_store_deletion_audit"));
});
