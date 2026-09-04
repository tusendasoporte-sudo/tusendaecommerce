/// <reference path="../pb_data/types.d.ts" />

const PROFILES = "admin_app_release_profiles";
const JOBS = "admin_app_build_jobs";
const EVENTS = "admin_app_release_events";
const RUNNERS = "admin_app_runner_agents";

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

function addField(collection, definition) {
  let existing = null;
  try { existing = collection.fields.getByName(definition.name); } catch (_) {}
  if (!existing) collection.fields.add(new Field(definition));
}

function rows(app, collection, filter) {
  try { return app.findRecordsByFilter(collection, filter || "", "+created", 500, 0) || []; }
  catch (_) { return []; }
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const profiles = app.findCollectionByNameOrId(PROFILES);
  const jobs = app.findCollectionByNameOrId(JOBS);

  addField(profiles, textField(
    "txt17884482001", "current_engine_version", 40, false, false,
    "^[0-9]+\\.[0-9]+\\.[0-9]+$"
  ));
  addField(profiles, textField(
    "txt17884482002", "current_engine_revision", 40, false, false,
    "^[a-f0-9]{40}$"
  ));

  addField(jobs, dateField("dat17884482003", "execution_authorized_at", false));
  addField(jobs, dateField("dat17884482004", "execution_authorized_until", false));
  addField(jobs, relationField("rel17884482005", "execution_authorized_by", users.id, true));
  addField(jobs, textField(
    "txt17884482006", "execution_runner_id", 100, false, false,
    "^[A-Za-z0-9._:-]+$"
  ));
  addField(jobs, jsonField("jsn17884482007", "execution_capabilities", false));
  app.save(profiles);
  app.save(jobs);

  let runners = null;
  try { runners = app.findCollectionByNameOrId(RUNNERS); } catch (_) {}
  if (!runners) {
    runners = new Collection({
      id: "pbc_1788448201",
      name: RUNNERS,
      type: "base",
      system: false,
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        idField("txt17884482011"),
        textField("txt17884482012", "runner_id", 100, true, false, "^[A-Za-z0-9._:-]{3,100}$"),
        textField("txt17884482013", "engine_version", 40, true, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
        textField("txt17884482014", "engine_revision", 40, true, false, "^[a-f0-9]{40}$"),
        selectField("sel17884482015", "mode", ["manual", "service"]),
        boolField("bol17884482016", "allow_firebase"),
        boolField("bol17884482017", "allow_signing"),
        boolField("bol17884482018", "workspace_clean"),
        dateField("dat17884482019", "last_seen_at", true),
        autoDateField("aut17884482020", "created", false),
        autoDateField("aut17884482021", "updated", true),
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_admin_app_runner_agents_id` ON `admin_app_runner_agents` (`runner_id`)",
        "CREATE INDEX `idx_admin_app_runner_agents_seen` ON `admin_app_runner_agents` (`last_seen_at`)",
      ],
    });
    app.save(runners);
  }

  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  action.values = Array.from(new Set([
    ...(action.values || []),
    "runner_authorized", "runner_reauthorized", "build_retried", "build_canceled", "candidate_discarded",
  ]));
  app.save(events);

  // Los previews del contrato anterior no fijaban el commit aprobado. Se cierran
  // para impedir que un runner v2 ejecute una configuración ambigua.
  for (const job of rows(app, JOBS, "status = 'preview' || status = 'queued' || status = 'claimed'")) {
    const status = String(job.get("status") || "");
    job.set("status", status === "preview" ? "canceled" : "needs_attention");
    job.set("failure_code", "admin_engine_v2_required");
    job.set("completed_at", new Date().toISOString());
    app.save(job);
  }
}, (app) => {
  const runnerRows = rows(app, RUNNERS, "");
  const authorizedJobs = rows(
    app,
    JOBS,
    "execution_authorized_at != '' || execution_runner_id != ''"
  );
  const v2Profiles = rows(
    app,
    PROFILES,
    "current_engine_version != '' || current_engine_revision != ''"
  );
  if (runnerRows.length || authorizedJobs.length || v2Profiles.length) {
    throw new Error("unsafe_rollback_admin_app_engine_v2_runner_control");
  }

  try { app.delete(app.findCollectionByNameOrId(RUNNERS)); } catch (_) {}

  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  const additions = new Set([
    "runner_authorized", "runner_reauthorized", "build_retried", "build_canceled", "candidate_discarded",
  ]);
  action.values = (action.values || []).filter((value) => !additions.has(value));
  app.save(events);

  const jobs = app.findCollectionByNameOrId(JOBS);
  for (const name of [
    "execution_authorized_at", "execution_authorized_until", "execution_authorized_by",
    "execution_runner_id", "execution_capabilities",
  ]) {
    try { jobs.fields.removeById(jobs.fields.getByName(name).id); } catch (_) {}
  }
  app.save(jobs);

  const profiles = app.findCollectionByNameOrId(PROFILES);
  for (const name of ["current_engine_version", "current_engine_revision"]) {
    try { profiles.fields.removeById(profiles.fields.getByName(name).id); } catch (_) {}
  }
  app.save(profiles);
});
