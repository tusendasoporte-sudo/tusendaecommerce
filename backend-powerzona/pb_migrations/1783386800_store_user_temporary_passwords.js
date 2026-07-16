/// <reference path="../pb_data/types.d.ts" />

const PREVIOUS_ACTIONS = [
  "user_created",
  "user_updated",
  "password_changed",
  "sessions_revoked",
  "self_password_changed",
];

const TEMPORARY_PASSWORD_ACTIONS = [
  "temporary_password_issued",
  "forced_password_changed",
];

const USER_FIELD_IDS = [
  "bool1783386801",
  "date1783386802",
  "date1783386803",
];

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

function deleteTemporaryPasswordAudits(app) {
  while (true) {
    const records = app.findRecordsByFilter(
      "store_user_audit",
      "action = {:issued} || action = {:changed}",
      "id",
      200,
      0,
      {
        issued: TEMPORARY_PASSWORD_ACTIONS[0],
        changed: TEMPORARY_PASSWORD_ACTIONS[1],
      }
    ) || [];
    if (!records.length) return;
    records.forEach((record) => app.delete(record));
  }
}

function removeFieldByIdIfExists(collection, id) {
  try {
    collection.fields.removeById(id);
  } catch (_) {}
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new Field({
    default: false,
    hidden: false,
    id: USER_FIELD_IDS[0],
    name: "must_change_password",
    presentable: false,
    required: false,
    system: false,
    type: "bool",
  }));
  users.fields.add(new Field({
    hidden: true,
    id: USER_FIELD_IDS[1],
    max: "",
    min: "",
    name: "temporary_password_issued_at",
    presentable: false,
    required: false,
    system: false,
    type: "date",
  }));
  users.fields.add(new Field({
    hidden: true,
    id: USER_FIELD_IDS[2],
    max: "",
    min: "",
    name: "temporary_password_expires_at",
    presentable: false,
    required: false,
    system: false,
    type: "date",
  }));
  app.save(users);
  app.db().newQuery(`
    UPDATE users
    SET must_change_password = 0,
        temporary_password_issued_at = '',
        temporary_password_expires_at = ''
  `).execute();

  const audit = app.findCollectionByNameOrId("store_user_audit");
  replaceActionField(audit, [...PREVIOUS_ACTIONS, ...TEMPORARY_PASSWORD_ACTIONS]);
  return app.save(audit);
}, (app) => {
  deleteTemporaryPasswordAudits(app);

  const audit = app.findCollectionByNameOrId("store_user_audit");
  replaceActionField(audit, PREVIOUS_ACTIONS);
  app.save(audit);

  const users = app.findCollectionByNameOrId("users");
  USER_FIELD_IDS.forEach((id) => removeFieldByIdIfExists(users, id));
  return app.save(users);
});
