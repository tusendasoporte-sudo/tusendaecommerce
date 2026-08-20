/// <reference path="../pb_data/types.d.ts" />

const JOBS = "storefront_app_build_jobs";
const RUNNERS = "storefront_app_runner_agents";

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, max, required, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: !!required, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, hidden) {
  return {
    cascadeDelete: false, collectionId, hidden: hidden === true, id, maxSelect: 1,
    minSelect: 0, name, presentable: false, required: false, system: false, type: "relation",
  };
}

function selectField(id, name, values) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: true, system: false, type: "select", values,
  };
}

function boolField(id, name) {
  return {
    hidden: false, id, name, presentable: false, required: false,
    system: false, type: "bool",
  };
}

function jsonField(id, name, hidden) {
  return {
    hidden: hidden === true, id, maxSize: 2048, name, presentable: false,
    required: false, system: false, type: "json",
  };
}

function dateField(id, name, required) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

function addField(collection, field) {
  let existing = null;
  try { existing = collection.fields.getByName(field.name); } catch (_) {}
  if (!existing) collection.fields.add(new Field(field));
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const jobs = app.findCollectionByNameOrId(JOBS);
  addField(jobs, dateField("dat17873748001", "execution_authorized_at", false));
  addField(jobs, dateField("dat17873748002", "execution_authorized_until", false));
  addField(jobs, relationField("rel17873748003", "execution_authorized_by", users.id, true));
  addField(jobs, textField(
    "txt17873748004", "execution_runner_id", 100, false, false, "^[A-Za-z0-9._:-]+$"
  ));
  addField(jobs, jsonField("jsn17873748005", "execution_capabilities", false));
  app.save(jobs);

  let existing = null;
  try { existing = app.findCollectionByNameOrId(RUNNERS); } catch (_) {}
  if (!existing) {
    const runners = new Collection({
      id: "pbc_1787374801",
      name: RUNNERS,
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField("txt17873748011"),
        textField("txt17873748012", "runner_id", 100, true, false, "^[A-Za-z0-9._:-]{3,100}$"),
        textField("txt17873748013", "engine_version", 40, true, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
        textField("txt17873748014", "engine_revision", 40, true, false, "^[a-f0-9]{40}$"),
        selectField("sel17873748015", "mode", ["service", "manual"]),
        boolField("bol17873748016", "allow_firebase"),
        boolField("bol17873748017", "allow_signing"),
        boolField("bol17873748018", "workspace_clean"),
        dateField("dat17873748019", "last_seen_at", true),
        autoDateField("aut17873748020", "created", false),
        autoDateField("aut17873748021", "updated", true),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_storefront_app_runner_agents_id` ON `storefront_app_runner_agents` (`runner_id`)",
        "CREATE INDEX `idx_storefront_app_runner_agents_seen` ON `storefront_app_runner_agents` (`last_seen_at`)",
      ],
    });
    app.save(runners);
  }
}, (app) => {
  let runnerRows = [];
  let authorizedJobs = [];
  try { runnerRows = app.findRecordsByFilter(RUNNERS, "", "", 1, 0) || []; } catch (_) {}
  try {
    authorizedJobs = app.findRecordsByFilter(
      JOBS,
      "execution_authorized_at != '' || execution_runner_id != ''",
      "",
      1,
      0
    ) || [];
  } catch (_) {}
  if (runnerRows.length || authorizedJobs.length) throw new Error("unsafe_rollback_storefront_runner_remote_start");
  try { app.delete(app.findCollectionByNameOrId(RUNNERS)); } catch (_) {}
  const jobs = app.findCollectionByNameOrId(JOBS);
  for (const name of [
    "execution_authorized_at", "execution_authorized_until", "execution_authorized_by",
    "execution_runner_id", "execution_capabilities",
  ]) {
    try { jobs.fields.removeById(jobs.fields.getByName(name).id); } catch (_) {}
  }
  app.save(jobs);
});
