/// <reference path="../pb_data/types.d.ts" />

const AUDIT_ACTIONS = [
  "user_created",
  "user_updated",
  "password_changed",
  "sessions_revoked",
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

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");

  const audit = new Collection({
    id: "pbc_1783386500",
    name: "store_user_audit",
    type: "base",
    system: false,
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      idField("text1783386501"),
      relationField("relation1783386502", "store", stores.id),
      textField("text1783386503", "store_id_snapshot", 15, true),
      textField("text1783386504", "store_name_snapshot", 140, true),
      textField("text1783386505", "store_slug_snapshot", 80, true),
      relationField("relation1783386506", "target_user", users.id),
      textField("text1783386507", "target_user_id_snapshot", 15, true),
      relationField("relation1783386508", "actor", users.id),
      textField("text1783386509", "actor_name_snapshot", 160, true),
      textField("text1783386510", "actor_role_snapshot", 40, true),
      selectField("select1783386511", "action", AUDIT_ACTIONS, true),
      textField("text1783386512", "previous_email", 254, false),
      textField("text1783386513", "new_email", 254, false),
      textField("text1783386514", "previous_display_name", 140, false),
      textField("text1783386515", "new_display_name", 140, false),
      textField("text1783386516", "previous_phone", 60, false),
      textField("text1783386517", "new_phone", 60, false),
      selectField("select1783386518", "previous_role", ["store_admin", "store_staff"], false),
      selectField("select1783386519", "new_role", ["store_admin", "store_staff"], false),
      selectField("select1783386520", "previous_status", ["active", "suspended"], false),
      selectField("select1783386521", "new_status", ["active", "suspended"], false),
      {
        default: false, hidden: false, id: "bool1783386522", name: "sessions_revoked",
        presentable: false, required: false, system: false, type: "bool",
      },
      textField("text1783386523", "reason", 500, false),
      {
        hidden: false, id: "autodate1783386524", name: "created", onCreate: true,
        onUpdate: false, presentable: false, system: false, type: "autodate",
      },
    ],
    indexes: [
      "CREATE INDEX `idx_store_user_audit_store_created` ON `store_user_audit` (`store`, `created`)",
      "CREATE INDEX `idx_store_user_audit_target_created` ON `store_user_audit` (`target_user`, `created`)",
      "CREATE INDEX `idx_store_user_audit_actor_created` ON `store_user_audit` (`actor`, `created`)",
      "CREATE INDEX `idx_store_user_audit_action_created` ON `store_user_audit` (`action`, `created`)",
    ],
  });
  app.save(audit);

  users.listRule = null;
  users.viewRule = "@request.auth.id = id";
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;
  return app.save(users);
}, (app) => {
  try {
    app.delete(app.findCollectionByNameOrId("store_user_audit"));
  } catch (_) {}

  const users = app.findCollectionByNameOrId("users");
  users.listRule = '@request.auth.role = "master_admin"';
  users.viewRule = '@request.auth.id = id || @request.auth.role = "master_admin"';
  users.createRule = '@request.auth.role = "master_admin"';
  users.updateRule = '@request.auth.role = "master_admin"';
  users.deleteRule = '@request.auth.role = "master_admin"';
  return app.save(users);
});
