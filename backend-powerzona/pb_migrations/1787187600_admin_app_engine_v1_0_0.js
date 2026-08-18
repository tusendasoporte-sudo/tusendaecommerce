/// <reference path="../pb_data/types.d.ts" />

const PROFILES = "admin_app_release_profiles";
const JOBS = "admin_app_build_jobs";
const EVENTS = "admin_app_release_events";
const ASSETS = "admin_app_brand_assets";
const MAX_BRAND_BYTES = 2 * 1024 * 1024;

function idField(id) {
  return { autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15, name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true, required: true, system: true, type: "text" };
}

function field(definition) { return definition; }

function relationField(id, name, collectionId, required, hidden) {
  return field({ cascadeDelete: false, collectionId, hidden: hidden === true, id, maxSelect: 1, minSelect: required ? 1 : 0, name, presentable: false, required: !!required, system: false, type: "relation" });
}

function textField(id, name, max, required, hidden, pattern) {
  return field({ autogeneratePattern: "", hidden: hidden === true, id, max, min: required ? 1 : 0, name, pattern: pattern || "", presentable: false, primaryKey: false, required: !!required, system: false, type: "text" });
}

function numberField(id, name, required, min, max) {
  return field({ hidden: false, id, max, min, name, onlyInt: true, presentable: false, required: !!required, system: false, type: "number" });
}

function selectField(id, name, values) {
  return field({ hidden: false, id, maxSelect: 1, name, presentable: false, required: true, system: false, type: "select", values });
}

function autoDateField(id, name, onUpdate) {
  return field({ hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate, presentable: false, system: false, type: "autodate" });
}

function hasRows(app, collection) {
  return (app.findRecordsByFilter(collection, "", "", 1, 0) || []).length > 0;
}

migrate((app) => {
  const profiles = app.findCollectionByNameOrId(PROFILES);
  const users = app.findCollectionByNameOrId("users");
  const jobs = app.findCollectionByNameOrId(JOBS);

  const assets = new Collection({
    id: "pbc_1787187601", name: ASSETS, type: "base", system: false,
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      idField("txt17871876101"),
      relationField("rel17871876102", "profile", profiles.id, true, true),
      selectField("sel17871876103", "kind", ["icon", "splash"]),
      field({ hidden: true, id: "file17871876104", maxSelect: 1, maxSize: MAX_BRAND_BYTES, mimeTypes: ["image/png"], name: "file", presentable: false, protected: true, required: true, system: false, thumbs: [], type: "file" }),
      textField("txt17871876105", "file_name", 180, true, false, "^[A-Za-z0-9._-]+$"),
      textField("txt17871876106", "sha256", 64, true, false, "^[a-f0-9]{64}$"),
      numberField("num17871876107", "bytes", true, 1, MAX_BRAND_BYTES),
      numberField("num17871876108", "width", true, 512, 2048),
      numberField("num17871876109", "height", true, 512, 2048),
      numberField("num17871876110", "revision", true, 1, 2147483647),
      selectField("sel17871876111", "status", ["active", "superseded"]),
      relationField("rel17871876112", "created_by", users.id, true, true),
      autoDateField("auto17871876113", "created", false),
    ],
    indexes: [
      "CREATE UNIQUE INDEX `idx_admin_app_brand_asset_revision` ON `admin_app_brand_assets` (`profile`, `kind`, `revision`)",
      "CREATE INDEX `idx_admin_app_brand_asset_status` ON `admin_app_brand_assets` (`profile`, `kind`, `status`, `created`)",
    ],
  });
  app.save(assets);

  profiles.fields.add(new Field(numberField("num17871876201", "last_allocated_version_code", false, 0, 2147483647)));
  profiles.fields.add(new Field(relationField("rel17871876202", "icon_asset", assets.id, false, true)));
  profiles.fields.add(new Field(relationField("rel17871876203", "splash_asset", assets.id, false, true)));
  profiles.fields.add(new Field(textField("txt17871876204", "splash_background_color", 7, false, false, "^#[A-F0-9]{6}$")));
  app.save(profiles);

  jobs.fields.add(new Field(textField("txt17871876301", "engine_name", 80, false, false)));
  jobs.fields.add(new Field(textField("txt17871876302", "engine_version", 20, false, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$")));
  jobs.fields.add(new Field(numberField("num17871876303", "engine_contract_version", false, 1, 2147483647)));
  jobs.fields.add(new Field(textField("txt17871876304", "engine_revision", 40, false, false, "^[a-f0-9]{40}$")));
  jobs.fields.add(new Field(relationField("rel17871876305", "icon_asset", assets.id, false, true)));
  jobs.fields.add(new Field(relationField("rel17871876306", "splash_asset", assets.id, false, true)));
  app.save(jobs);

  const eventCollection = app.findCollectionByNameOrId(EVENTS);
  const action = eventCollection.fields.getByName("action");
  const additions = ["configuration_updated", "brand_asset_updated", "release_published"];
  action.values = Array.from(new Set([...(action.values || []), ...additions]));
  app.save(eventCollection);

  const existingJobs = app.findRecordsByFilter(JOBS, "", "+created", 500, 0) || [];
  for (const job of existingJobs) {
    // Los trabajos anteriores quedan como historial del motor previo. Ningún runner
    // 1.0.0 puede reclamar un contrato cuya vista previa fue creada por ese motor.
    job.set("engine_name", "Tu Senda 84 Admin Engine");
    job.set("engine_version", "0.0.0");
    job.set("engine_contract_version", 1);
    const status = String(job.get("status") || "");
    if (status === "preview") {
      job.set("status", "canceled");
      job.set("failure_code", "engine_upgrade_required");
      job.set("completed_at", new Date().toISOString());
    } else if (status === "queued" || status === "claimed") {
      job.set("status", "needs_attention");
      job.set("failure_code", "engine_upgrade_required");
      job.set("completed_at", new Date().toISOString());
    }
    app.save(job);
  }

  const existingProfiles = app.findRecordsByFilter(PROFILES, "", "", 500, 0) || [];
  for (const profile of existingProfiles) {
    const confirmedCodes = existingJobs
      .filter((job) => String(job.get("profile") || "") === profile.id && String(job.get("confirmed_at") || ""))
      .map((job) => Number(job.get("version_code")) || 0);
    profile.set("last_allocated_version_code", Math.max(Number(profile.get("latest_version_code")) || 0, ...confirmedCodes));
    if (!String(profile.get("splash_background_color") || "")) profile.set("splash_background_color", "#FFFFFF");
    app.save(profile);
  }
}, (app) => {
  if (hasRows(app, ASSETS)) throw new Error("unsafe_rollback_admin_app_engine_brand_assets");
  const jobs = app.findRecordsByFilter(JOBS, "engine_version != ''", "", 1, 0) || [];
  if (jobs.length) throw new Error("unsafe_rollback_admin_app_engine_jobs");

  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  const remove = new Set(["configuration_updated", "brand_asset_updated", "release_published"]);
  action.values = (action.values || []).filter((value) => !remove.has(value));
  app.save(events);

  const jobsCollection = app.findCollectionByNameOrId(JOBS);
  ["txt17871876301", "txt17871876302", "num17871876303", "txt17871876304", "rel17871876305", "rel17871876306"].forEach((id) => jobsCollection.fields.removeById(id));
  app.save(jobsCollection);

  const profiles = app.findCollectionByNameOrId(PROFILES);
  ["num17871876201", "rel17871876202", "rel17871876203", "txt17871876204"].forEach((id) => profiles.fields.removeById(id));
  app.save(profiles);
  app.delete(app.findCollectionByNameOrId(ASSETS));
});
