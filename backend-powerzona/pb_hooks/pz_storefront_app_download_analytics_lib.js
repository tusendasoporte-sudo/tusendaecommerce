/// <reference path="../pb_data/types.d.ts" />

"use strict";

const EVENTS_COLLECTION = "storefront_app_download_events";
const ARTIFACTS_COLLECTION = "storefront_app_artifacts";
const PROFILES_COLLECTION = "storefront_app_build_profiles";
const INSTALLATIONS_COLLECTION = "storefront_installations";
const ACTIVE_INSTALLATION_WINDOW_DAYS = 30;
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const SOURCES = Object.freeze(["shared_link", "private_update", "master", "client_app"]);
const EVENT_TYPES = Object.freeze(["download_started", "download_verified", "version_activated"]);

function text(value, max) {
  try { return String(value === null || value === undefined ? "" : value).trim().slice(0, max || 500); }
  catch (_) { return ""; }
}

function recordValue(record, key) {
  if (!record) return undefined;
  try {
    const value = record.get(key);
    if (value !== undefined) return value;
  } catch (_) {}
  try { return record.getString(key); } catch (_) {}
  return record[key];
}

function recordString(record, key, max) {
  return text(recordValue(record, key), max || 4096);
}

function recordNumber(record, key) {
  const value = Number(recordValue(record, key));
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return text(value[0], 15);
  if (value && typeof value === "object") return text(value.id, 15);
  return text(value, 15);
}

function recordId(record) {
  return text(record && record.id || recordString(record, "id"), 15);
}

function parsedDate(value) {
  const parsed = new Date(String(value || "").trim());
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isoDate(value) {
  const parsed = parsedDate(value);
  return parsed ? parsed.toISOString() : "";
}

function findRecord(app, collection, id) {
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findFirst(app, collection, filter, params) {
  try { return app.findFirstRecordByFilter(collection, filter, params || {}); } catch (_) { return null; }
}

function records(app, collection, filter, sort, limit, offset, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter || "",
      sort || "id",
      Math.max(1, Math.min(Number(limit) || 500, 500)),
      Math.max(0, Number(offset) || 0),
      params || {},
    ) || []);
  } catch (_) { return []; }
}

function allRecords(app, collection, filter, sort, params) {
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const page = records(app, collection, filter, sort, 500, offset, params);
    result.push(...page);
    if (page.length < 500) return result;
  }
}

function collectionReady(app) {
  try {
    const collection = app.findCollectionByNameOrId(EVENTS_COLLECTION);
    return collection && collection.listRule === null && collection.viewRule === null;
  } catch (_) { return false; }
}

function validArtifactContext(app, artifact, installation) {
  const artifactId = recordId(artifact);
  const storeId = relationId(artifact, "store");
  const profileId = relationId(artifact, "profile");
  if (!RECORD_ID_PATTERN.test(artifactId) || !RECORD_ID_PATTERN.test(storeId)
    || !RECORD_ID_PATTERN.test(profileId) || recordString(artifact, "kind") !== "apk") return null;
  const profile = findRecord(app, PROFILES_COLLECTION, profileId);
  if (!profile || relationId(profile, "store") !== storeId) return null;
  const appConfigId = relationId(profile, "app_config");
  if (installation) {
    if (!RECORD_ID_PATTERN.test(recordId(installation))
      || relationId(installation, "store") !== storeId
      || (appConfigId && relationId(installation, "app_config") !== appConfigId)) return null;
  }
  return { artifactId, storeId, profileId, appConfigId, profile };
}

function eventKey(eventType, source, artifactId, installationId, occurredAt) {
  if (eventType === "download_started") {
    if (source === "private_update") return installationId ? `d:${source}:${artifactId}:${installationId}` : "";
    const minute = occurredAt.toISOString().slice(0, 16).replace(/[-:]/g, "");
    return `d:${source}:${artifactId}:${minute}`;
  }
  if (!installationId) return "";
  return `${eventType === "download_verified" ? "v" : "a"}:${artifactId}:${installationId}`;
}

function eventByKey(app, key) {
  if (!key) return null;
  return findFirst(app, EVENTS_COLLECTION, "event_key = {:eventKey}", { eventKey: key });
}

function incrementEvent(app, event, occurredAt) {
  event.set("count", Math.min(2147483647, Math.max(1, recordNumber(event, "count")) + 1));
  event.set("occurred_at", occurredAt.toISOString());
  app.save(event);
  return event;
}

function recordEvent(app, values) {
  if (!collectionReady(app) || !SOURCES.includes(values && values.source)
    || !EVENT_TYPES.includes(values && values.eventType)) return null;
  const installation = values.installation || null;
  const context = validArtifactContext(app, values.artifact, installation);
  if (!context) return null;
  const installationId = installation ? recordId(installation) : "";
  if ((values.eventType === "download_verified" && (values.source !== "private_update" || !installationId))
    || (values.eventType === "version_activated" && (values.source !== "client_app" || !installationId))
    || (values.eventType === "download_started" && (values.source === "client_app"
      || (values.source === "private_update" && !installationId)))) return null;

  const occurredAt = values.now instanceof Date ? values.now : new Date(values.now || Date.now());
  if (!Number.isFinite(occurredAt.getTime())) return null;
  const key = eventKey(values.eventType, values.source, context.artifactId, installationId, occurredAt);
  if (!key) return null;
  const existing = eventByKey(app, key);
  if (existing) {
    return values.eventType === "download_started" ? incrementEvent(app, existing, occurredAt) : existing;
  }
  const event = new Record(app.findCollectionByNameOrId(EVENTS_COLLECTION), {});
  event.set("store", context.storeId);
  event.set("app_config", context.appConfigId || "");
  event.set("profile", context.profileId);
  event.set("artifact", context.artifactId);
  event.set("installation", installationId);
  event.set("event_key", key);
  event.set("source", values.source);
  event.set("event_type", values.eventType);
  event.set("version_code", recordNumber(values.artifact, "version_code"));
  event.set("version_name", recordString(values.artifact, "version_name", 40));
  event.set("bytes", recordNumber(values.artifact, "bytes"));
  event.set("count", 1);
  event.set("occurred_at", occurredAt.toISOString());
  try {
    app.save(event);
    return event;
  } catch (error) {
    const raced = eventByKey(app, key);
    if (raced) {
      return values.eventType === "download_started" ? incrementEvent(app, raced, occurredAt) : raced;
    }
    throw error;
  }
}

function recordDownloadStarted(app, artifact, source, installation, now) {
  return recordEvent(app, {
    artifact,
    installation: installation || null,
    source,
    eventType: "download_started",
    now,
  });
}

function recordDownloadVerified(app, artifact, installation, now) {
  return recordEvent(app, {
    artifact,
    installation,
    source: "private_update",
    eventType: "download_verified",
    now,
  });
}

function publishedArtifactForVersion(app, storeId, versionCode, versionName) {
  const candidates = records(
    app,
    ARTIFACTS_COLLECTION,
    "store = {:store} && kind = 'apk' && version_code = {:versionCode} && release_status = 'published'",
    "-published_at,-created",
    20,
    0,
    { store: storeId, versionCode },
  );
  return candidates.find((artifact) => recordString(artifact, "version_name", 40) === versionName
    && recordString(artifact, "lifecycle_status") !== "deleted") || null;
}

function recordVersionActivated(app, installation, now) {
  if (!collectionReady(app) || !installation || recordString(installation, "status") !== "active") return null;
  const storeId = relationId(installation, "store");
  const versionCode = recordNumber(installation, "app_version_code");
  const versionName = recordString(installation, "app_version", 40);
  if (!RECORD_ID_PATTERN.test(storeId) || versionCode < 1 || !versionName) return null;
  const artifact = publishedArtifactForVersion(app, storeId, versionCode, versionName);
  if (!artifact) return null;
  return recordEvent(app, {
    artifact,
    installation,
    source: "client_app",
    eventType: "version_activated",
    now,
  });
}

function bestEffort(action) {
  try { return action(); } catch (_) { return null; }
}

function versionRow(versionCode, versionName, artifact) {
  return {
    artifact_id: recordId(artifact),
    version_code: versionCode,
    version_name: versionName || "Sin dato",
    release_status: recordString(artifact, "release_status", 20),
    update_delivery_status: recordString(artifact, "update_delivery_status", 20),
    shared_link_downloads: 0,
    private_update_downloads: 0,
    verified_updates: 0,
    activated_installations: 0,
    active_installations: 0,
    pending_installations: 0,
    master_downloads: 0,
    customer_downloads: 0,
    all_downloads: 0,
    last_activity_at: "",
  };
}

function laterIso(left, right) {
  const leftDate = parsedDate(left);
  const rightDate = parsedDate(right);
  if (!leftDate) return rightDate ? rightDate.toISOString() : "";
  if (!rightDate) return leftDate.toISOString();
  return (leftDate.getTime() >= rightDate.getTime() ? leftDate : rightDate).toISOString();
}

function buildDownloadAnalytics(app, storeIdValue, options) {
  const storeId = text(storeIdValue, 15);
  const includeMaster = Boolean(options && options.includeMaster);
  const now = options && options.now instanceof Date ? options.now : new Date();
  const periodStart = parsedDate(options && options.periodStart);
  const periodEnd = parsedDate(options && options.periodEnd) || now;
  const cutoff = new Date(now.getTime() - ACTIVE_INSTALLATION_WINDOW_DAYS * 86_400_000);
  const collectionAvailable = collectionReady(app);
  const artifactRows = allRecords(app, ARTIFACTS_COLLECTION, "store = {:store} && kind = 'apk'", "-version_code,-created", { store: storeId })
    .filter((artifact) => includeMaster
      ? recordString(artifact, "lifecycle_status") !== "staged"
      : recordString(artifact, "release_status") === "published");
  const installationRows = allRecords(app, INSTALLATIONS_COLLECTION, "store = {:store}", "id", { store: storeId });
  const activeInstallations = installationRows.filter((installation) => {
    const lastSeen = parsedDate(recordValue(installation, "last_seen_at"));
    return recordString(installation, "status") === "active" && lastSeen
      && lastSeen.getTime() >= cutoff.getTime() && lastSeen.getTime() <= now.getTime();
  });
  const eventRows = collectionAvailable
    ? allRecords(app, EVENTS_COLLECTION, "store = {:store}", "occurred_at,id", { store: storeId })
      .filter((event) => {
        const occurred = parsedDate(recordValue(event, "occurred_at"));
        return occurred && (!periodStart || occurred.getTime() >= periodStart.getTime())
          && occurred.getTime() <= periodEnd.getTime()
          && (includeMaster || recordString(event, "source") !== "master");
      })
    : [];
  const profile = findFirst(app, PROFILES_COLLECTION, "store = {:store}", { store: storeId });
  const rowsByVersion = new Map();
  const ensureVersion = (versionCode, versionName, artifact) => {
    if (!Number.isSafeInteger(versionCode) || versionCode < 1) return null;
    const artifactId = recordId(artifact);
    const existing = Array.from(rowsByVersion.values()).find((candidate) => candidate.version_code === versionCode);
    if (existing) {
      if (artifactId && !existing.artifact_id) {
        rowsByVersion.delete(`version:${versionCode}`);
        existing.artifact_id = artifactId;
        existing.release_status = recordString(artifact, "release_status", 20);
        existing.update_delivery_status = recordString(artifact, "update_delivery_status", 20);
        rowsByVersion.set(artifactId, existing);
      }
      return existing;
    }
    const key = artifactId || `version:${versionCode}`;
    if (!rowsByVersion.has(key)) rowsByVersion.set(key, versionRow(versionCode, versionName, artifact));
    return rowsByVersion.get(key);
  };
  artifactRows.forEach((artifact) => ensureVersion(
    recordNumber(artifact, "version_code"),
    recordString(artifact, "version_name", 40),
    artifact,
  ));
  if (profile) ensureVersion(
    recordNumber(profile, "current_version_code"),
    recordString(profile, "current_version_name", 40),
    null,
  );
  eventRows.forEach((event) => {
    const artifactId = relationId(event, "artifact");
    const artifact = artifactRows.find((candidate) => recordId(candidate) === artifactId)
      || findRecord(app, ARTIFACTS_COLLECTION, artifactId);
    const row = ensureVersion(recordNumber(event, "version_code"), recordString(event, "version_name", 40), artifact);
    if (!row) return;
    const type = recordString(event, "event_type");
    const source = recordString(event, "source");
    const count = Math.max(1, recordNumber(event, "count"));
    if (type === "download_started" && source === "shared_link") row.shared_link_downloads += count;
    if (type === "download_started" && source === "private_update") row.private_update_downloads += count;
    if (type === "download_started" && source === "master") row.master_downloads += count;
    if (type === "download_verified") row.verified_updates += count;
    if (type === "version_activated") row.activated_installations += count;
    row.last_activity_at = laterIso(row.last_activity_at, recordValue(event, "occurred_at"));
  });
  activeInstallations.forEach((installation) => {
    const versionCode = recordNumber(installation, "app_version_code");
    const versionName = recordString(installation, "app_version", 40);
    let row = Array.from(rowsByVersion.values()).find((candidate) => candidate.version_code === versionCode);
    if (!row) row = ensureVersion(versionCode, versionName, null);
    if (!row) return;
    row.active_installations += 1;
    row.last_activity_at = laterIso(row.last_activity_at, recordValue(installation, "last_seen_at"));
  });
  const publishedTarget = artifactRows
    .filter((artifact) => recordString(artifact, "release_status") === "published"
      && (recordString(artifact, "update_delivery_status") || "active") === "active")
    .sort((left, right) => recordNumber(right, "version_code") - recordNumber(left, "version_code"))[0] || null;
  const publishedTargetCode = recordNumber(publishedTarget, "version_code");
  for (const row of rowsByVersion.values()) {
    row.customer_downloads = row.shared_link_downloads + row.private_update_downloads;
    row.all_downloads = row.customer_downloads + (includeMaster ? row.master_downloads : 0);
    row.pending_installations = publishedTargetCode && row.version_code === publishedTargetCode
      ? activeInstallations.filter((installation) => recordNumber(installation, "app_version_code") < publishedTargetCode).length
      : 0;
    if (!includeMaster) row.master_downloads = 0;
  }
  const versions = Array.from(rowsByVersion.values())
    .sort((left, right) => right.version_code - left.version_code || right.artifact_id.localeCompare(left.artifact_id));
  const summary = versions.reduce((result, row) => ({
    shared_link_downloads: result.shared_link_downloads + row.shared_link_downloads,
    private_update_downloads: result.private_update_downloads + row.private_update_downloads,
    verified_updates: result.verified_updates + row.verified_updates,
    activated_installations: result.activated_installations + row.activated_installations,
    active_installations: result.active_installations + row.active_installations,
    pending_installations: result.pending_installations + row.pending_installations,
    master_downloads: result.master_downloads + row.master_downloads,
    customer_downloads: result.customer_downloads + row.customer_downloads,
    all_downloads: result.all_downloads + row.all_downloads,
    last_activity_at: laterIso(result.last_activity_at, row.last_activity_at),
  }), {
    shared_link_downloads: 0,
    private_update_downloads: 0,
    verified_updates: 0,
    activated_installations: 0,
    active_installations: 0,
    pending_installations: 0,
    master_downloads: 0,
    customer_downloads: 0,
    all_downloads: 0,
    last_activity_at: "",
  });
  return {
    available: collectionAvailable,
    generated_at: now.toISOString(),
    includes_master: includeMaster,
    active_estimate_window_days: ACTIVE_INSTALLATION_WINDOW_DAYS,
    summary,
    versions,
    measurement_note: includeMaster
      ? "Las solicitudes de clientes y las descargas de prueba Master se muestran por separado. Una descarga verificada no equivale a una instalación; la instalación se confirma cuando la nueva versión abre y se registra."
      : "Las descargas de prueba Master están excluidas. Una solicitud de enlace no confirma la instalación; las actualizaciones privadas se verifican en la app y la instalación se confirma al abrir la nueva versión.",
  };
}

module.exports = {
  ACTIVE_INSTALLATION_WINDOW_DAYS,
  ARTIFACTS_COLLECTION,
  EVENTS_COLLECTION,
  EVENT_TYPES,
  SOURCES,
  bestEffort,
  buildDownloadAnalytics,
  collectionReady,
  recordDownloadStarted,
  recordDownloadVerified,
  recordEvent,
  recordVersionActivated,
};
