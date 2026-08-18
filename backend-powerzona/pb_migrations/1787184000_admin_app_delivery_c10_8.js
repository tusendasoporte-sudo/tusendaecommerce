/// <reference path="../pb_data/types.d.ts" />

const MAX_APK_BYTES = 100 * 1024 * 1024;

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

function relationField(id, name, collectionId, required, hidden) {
  return {
    cascadeDelete: false, collectionId, hidden: hidden === true, id, maxSelect: 1,
    minSelect: required ? 1 : 0, name, presentable: false, required: !!required,
    system: false, type: "relation",
  };
}

function selectField(id, name, values, required, hidden) {
  return {
    hidden: hidden === true, id, maxSelect: 1, name, presentable: false,
    required: !!required, system: false, type: "select", values,
  };
}

function numberField(id, name, required, min, max) {
  return {
    hidden: false, id, max: max === undefined ? null : max, min: min === undefined ? null : min,
    name, onlyInt: true, presentable: false, required: !!required, system: false, type: "number",
  };
}

function dateField(id, name, required, hidden) {
  return {
    hidden: hidden === true, id, max: "", min: "", name, presentable: false,
    required: !!required, system: false, type: "date",
  };
}

function jsonField(id, name, maxSize, hidden) {
  return {
    hidden: hidden === true, id, maxSize, name, presentable: false,
    required: false, system: false, type: "json",
  };
}

function fileField(id, name) {
  return {
    hidden: true, id, maxSelect: 1, maxSize: MAX_APK_BYTES,
    mimeTypes: [
      "application/vnd.android.package-archive", "application/octet-stream", "application/zip",
      "application/json", "text/plain",
    ],
    name, presentable: false, protected: true, required: false, system: false,
    thumbs: [], type: "file",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: !!onUpdate,
    presentable: false, system: false, type: "autodate",
  };
}

function privateCollection(id, name, fields, indexes) {
  return new Collection({
    id, name, type: "base", system: false,
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields, indexes,
  });
}

function hasRows(app, collection) {
  const records = app.findRecordsByFilter(collection, "", "", 1, 0) || [];
  return records.length > 0;
}

migrate((app) => {
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const devices = app.findCollectionByNameOrId("store_user_devices");

  const profiles = privateCollection(
    "pbc_1787184001",
    "admin_app_release_profiles",
    [
      idField("txt17871840101"),
      selectField("sel17871840102", "channel", ["staging", "production"], true, false),
      textField("txt17871840103", "display_name", 120, true, false),
      textField("txt17871840104", "package_name", 190, true, false, "^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$"),
      textField("txt17871840105", "admin_url", 500, true, false, "^https://"),
      textField("txt17871840106", "firebase_project_id", 128, false, true, "^[a-z][a-z0-9-]{4,28}[a-z0-9]$"),
      textField("txt17871840107", "firebase_app_id", 255, false, true),
      textField("txt17871840108", "signing_cert_sha256", 95, false, true, "^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$"),
      numberField("num17871840109", "latest_version_code", false, 0, 2147483647),
      textField("txt17871840110", "latest_version_name", 40, false, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      numberField("num17871840111", "minimum_supported_version_code", false, 0, 2147483647),
      selectField("sel17871840112", "status", ["active", "paused", "withdrawn"], true, false),
      relationField("rel17871840113", "created_by", users.id, true, true),
      relationField("rel17871840114", "updated_by", users.id, true, true),
      autoDateField("auto17871840115", "created", false),
      autoDateField("auto17871840116", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_admin_app_release_profiles_channel` ON `admin_app_release_profiles` (`channel`)",
      "CREATE UNIQUE INDEX `idx_admin_app_release_profiles_package` ON `admin_app_release_profiles` (`package_name`, `channel`)",
    ]
  );
  app.save(profiles);

  const jobs = privateCollection(
    "pbc_1787184002",
    "admin_app_build_jobs",
    [
      idField("txt17871840201"),
      relationField("rel17871840202", "profile", profiles.id, true, false),
      selectField("sel17871840203", "operation", ["provision", "update"], true, false),
      selectField("sel17871840204", "status", ["preview", "queued", "claimed", "succeeded", "failed", "needs_attention", "canceled"], true, false),
      numberField("num17871840205", "version_code", true, 1, 2147483647),
      textField("txt17871840206", "version_name", 40, true, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      textField("txt17871840207", "preview_hash", 64, true, true, "^[a-f0-9]{64}$"),
      jsonField("json17871840208", "preview_json", 32768, true),
      dateField("date17871840209", "preview_expires_at", true, false),
      relationField("rel17871840210", "created_by", users.id, true, true),
      relationField("rel17871840211", "confirmed_by", users.id, false, true),
      dateField("date17871840212", "confirmed_at", false, false),
      textField("txt17871840213", "runner_id", 100, false, false, "^[A-Za-z0-9._:-]+$"),
      textField("txt17871840214", "failure_code", 80, false, false, "^[a-z0-9_:-]+$"),
      dateField("date17871840215", "started_at", false, false),
      dateField("date17871840216", "completed_at", false, false),
      autoDateField("auto17871840217", "created", false),
      autoDateField("auto17871840218", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_admin_app_build_jobs_preview` ON `admin_app_build_jobs` (`preview_hash`)",
      "CREATE INDEX `idx_admin_app_build_jobs_queue` ON `admin_app_build_jobs` (`status`, `created`)",
      "CREATE INDEX `idx_admin_app_build_jobs_profile_version` ON `admin_app_build_jobs` (`profile`, `version_code`)",
    ]
  );
  app.save(jobs);

  const artifacts = privateCollection(
    "pbc_1787184003",
    "admin_app_artifacts",
    [
      idField("txt17871840301"),
      relationField("rel17871840302", "profile", profiles.id, true, false),
      relationField("rel17871840303", "job", jobs.id, true, false),
      selectField("sel17871840304", "kind", ["apk", "checksums", "instructions", "build_manifest"], true, false),
      textField("txt17871840305", "file_name", 220, true, false, "^[A-Za-z0-9._-]+$"),
      fileField("file17871840306", "file"),
      textField("txt17871840307", "sha256", 64, true, false, "^[a-f0-9]{64}$"),
      numberField("num17871840308", "bytes", true, 1, MAX_APK_BYTES),
      numberField("num17871840309", "version_code", true, 1, 2147483647),
      textField("txt17871840310", "version_name", 40, true, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      selectField("sel17871840311", "lifecycle_status", ["staged", "available", "deleted"], true, false),
      autoDateField("auto17871840312", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `idx_admin_app_artifacts_job_kind` ON `admin_app_artifacts` (`job`, `kind`)",
      "CREATE INDEX `idx_admin_app_artifacts_profile_version` ON `admin_app_artifacts` (`profile`, `version_code`)",
    ]
  );
  app.save(artifacts);

  const assignments = privateCollection(
    "pbc_1787184004",
    "admin_app_release_assignments",
    [
      idField("txt17871840401"),
      relationField("rel17871840402", "profile", profiles.id, true, false),
      relationField("rel17871840403", "artifact", artifacts.id, true, false),
      relationField("rel17871840404", "store", stores.id, true, false),
      relationField("rel17871840405", "user", users.id, true, false),
      relationField("rel17871840406", "device", devices.id, true, false),
      selectField("sel17871840407", "stage", ["pilot", "gradual", "general"], true, false),
      numberField("num17871840408", "wave", false, 0, 1000000),
      selectField("sel17871840409", "status", ["active", "revoked"], true, false),
      textField("txt17871840410", "grant_digest", 64, true, true, "^[a-f0-9]{64}$"),
      numberField("num17871840411", "download_count", false, 0, 2147483647),
      dateField("date17871840412", "last_downloaded_at", false, false),
      numberField("num17871840413", "installed_version_code", false, 0, 2147483647),
      textField("txt17871840414", "installed_version_name", 40, false, false, "^[0-9]+\\.[0-9]+\\.[0-9]+$"),
      dateField("date17871840415", "installed_at", false, false),
      dateField("date17871840416", "validated_at", false, false),
      relationField("rel17871840417", "validated_by", users.id, false, true),
      relationField("rel17871840418", "created_by", users.id, true, true),
      dateField("date17871840419", "revoked_at", false, false),
      relationField("rel17871840420", "revoked_by", users.id, false, true),
      textField("txt17871840421", "revoke_reason", 500, false, false),
      autoDateField("auto17871840422", "created", false),
      autoDateField("auto17871840423", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `idx_admin_app_assignment_exact` ON `admin_app_release_assignments` (`artifact`, `user`, `device`)",
      "CREATE UNIQUE INDEX `idx_admin_app_assignment_grant` ON `admin_app_release_assignments` (`grant_digest`)",
      "CREATE INDEX `idx_admin_app_assignment_user_status` ON `admin_app_release_assignments` (`user`, `status`, `created`)",
      "CREATE INDEX `idx_admin_app_assignment_release_wave` ON `admin_app_release_assignments` (`artifact`, `stage`, `wave`)",
    ]
  );
  app.save(assignments);

  const tickets = privateCollection(
    "pbc_1787184005",
    "admin_app_download_tickets",
    [
      idField("txt17871840501"),
      relationField("rel17871840502", "assignment", assignments.id, true, true),
      relationField("rel17871840503", "artifact", artifacts.id, true, true),
      relationField("rel17871840504", "user", users.id, true, true),
      relationField("rel17871840505", "device", devices.id, true, true),
      textField("txt17871840506", "token_digest", 64, true, true, "^[a-f0-9]{64}$"),
      dateField("date17871840507", "expires_at", true, true),
      dateField("date17871840508", "used_at", false, true),
      autoDateField("auto17871840509", "created", false),
    ],
    [
      "CREATE UNIQUE INDEX `idx_admin_app_download_ticket_digest` ON `admin_app_download_tickets` (`token_digest`)",
      "CREATE INDEX `idx_admin_app_download_ticket_expiry` ON `admin_app_download_tickets` (`expires_at`, `used_at`)",
    ]
  );
  app.save(tickets);

  const events = privateCollection(
    "pbc_1787184006",
    "admin_app_release_events",
    [
      idField("txt17871840601"),
      relationField("rel17871840602", "profile", profiles.id, false, true),
      relationField("rel17871840603", "artifact", artifacts.id, false, true),
      relationField("rel17871840604", "assignment", assignments.id, false, true),
      relationField("rel17871840605", "store", stores.id, false, true),
      relationField("rel17871840606", "target_user", users.id, false, true),
      relationField("rel17871840607", "device", devices.id, false, true),
      relationField("rel17871840608", "actor", users.id, false, true),
      selectField("sel17871840609", "action", [
        "profile_created", "build_queued", "build_completed", "assignment_created",
        "download_ticket_created", "download_succeeded", "download_denied", "check_in",
        "pilot_validated", "release_promoted", "release_paused", "release_withdrawn",
        "minimum_version_changed", "assignment_revoked",
      ], true, false),
      selectField("sel17871840610", "outcome", ["allowed", "denied", "succeeded", "failed"], true, false),
      textField("txt17871840611", "reason", 120, false, false, "^[a-z0-9_:-]+$"),
      jsonField("json17871840612", "snapshot_json", 16384, true),
      autoDateField("auto17871840613", "created", false),
    ],
    [
      "CREATE INDEX `idx_admin_app_release_events_profile_created` ON `admin_app_release_events` (`profile`, `created`)",
      "CREATE INDEX `idx_admin_app_release_events_store_created` ON `admin_app_release_events` (`store`, `created`)",
      "CREATE INDEX `idx_admin_app_release_events_target_created` ON `admin_app_release_events` (`target_user`, `created`)",
    ]
  );
  app.save(events);
}, (app) => {
  const names = [
    "admin_app_release_events", "admin_app_download_tickets", "admin_app_release_assignments",
    "admin_app_artifacts", "admin_app_build_jobs", "admin_app_release_profiles",
  ];
  for (const name of names) {
    if (hasRows(app, name)) throw new Error("unsafe_rollback_admin_app_delivery_c10_8");
  }
  names.forEach((name) => app.delete(app.findCollectionByNameOrId(name)));
});
