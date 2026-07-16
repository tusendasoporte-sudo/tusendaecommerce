/// <reference path="../pb_data/types.d.ts" />

const PREVIOUS_ACTIONS = [
  "user_created",
  "user_updated",
  "password_changed",
  "sessions_revoked",
  "self_password_changed",
  "temporary_password_issued",
  "forced_password_changed",
];

const DELETION_ACTION = "user_deleted";

function replaceActionField(audit, values) {
  audit.fields.addAt(10, new Field({
    hidden: false,
    id: "select1783386511",
    maxSelect: 1,
    name: "action",
    presentable: false,
    required: true,
    system: false,
    type: "select",
    values: values.slice(),
  }));
}

function deleteDeletionAudits(app) {
  while (true) {
    const records = app.findRecordsByFilter(
      "store_user_audit",
      "action = {:action}",
      "id",
      200,
      0,
      { action: DELETION_ACTION }
    ) || [];
    if (!records.length) return;
    records.forEach((record) => app.delete(record));
  }
}

migrate((app) => {
  const audit = app.findCollectionByNameOrId("store_user_audit");
  replaceActionField(audit, [...PREVIOUS_ACTIONS, DELETION_ACTION]);
  return app.save(audit);
}, (app) => {
  deleteDeletionAudits(app);
  const audit = app.findCollectionByNameOrId("store_user_audit");
  replaceActionField(audit, PREVIOUS_ACTIONS);
  return app.save(audit);
});
