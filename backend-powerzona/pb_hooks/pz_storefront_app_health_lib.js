/// <reference path="../pb_data/types.d.ts" />

"use strict";

const installationSecurity = typeof __hooks === "undefined"
  ? require("./pz_storefront_installations_lib.js")
  : require(`${__hooks}/pz_storefront_installations_lib.js`);

const INSTALLATIONS_COLLECTION = "storefront_installations";
const DIAGNOSTICS_COLLECTION = "storefront_installation_diagnostics";
const DELIVERIES_COLLECTION = "push_campaign_deliveries";
const MAX_INSTALLATIONS = 100;
const MAX_DIAGNOSTICS = 5000;
const MAX_DELIVERIES = 5000;
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 30 * FRESH_WINDOW_MS;
const DISPLAY_TIME_ZONE = "America/Havana";
const DELIVERY_TRIGGERS = Object.freeze([
  "fcm", "websocket_sync", "foreground_poll", "resume_sync", "workmanager",
  "native_sync_legacy", "unknown",
]);
const EVENT_TYPES = Object.freeze([
  "APP_STARTED",
  "INTERNET_AVAILABLE",
  "BACKEND_REACHABLE",
  "INSTALLATION_UUID_CREATED",
  "FIREBASE_INITIALIZED",
  "FID_CREATED",
  "FCM_TOKEN_CREATED",
  "INSTALLATION_REGISTER_REQUEST_SENT",
  "INSTALLATION_REGISTER_RESPONSE",
  "NOTIFICATION_PERMISSION_STATUS",
  "LAST_PUSH_RECEIVED",
  "LAST_ERROR",
]);
const HEALTH_STATES = Object.freeze(["healthy", "warning", "critical", "unknown", "inactive"]);

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

function laterIso() {
  let latest = null;
  for (const value of arguments) {
    const parsed = parsedDate(value);
    if (parsed && (!latest || parsed.getTime() > latest.getTime())) latest = parsed;
  }
  return latest ? latest.toISOString() : "";
}

function collectionReady(app, name) {
  try {
    const collection = app.findCollectionByNameOrId(name);
    return collection && collection.listRule === null && collection.viewRule === null;
  } catch (_) { return false; }
}

function records(app, collection, filter, sort, limit, offset, params) {
  try {
    return Array.from(app.findRecordsByFilter(
      collection,
      filter || "",
      sort || "id",
      Math.max(1, Number(limit) || 500),
      Math.max(0, Number(offset) || 0),
      params || {},
    ) || []);
  } catch (_) { return []; }
}

function recentDiagnostics(app, storeId, now) {
  const result = [];
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS).toISOString();
  for (let offset = 0; offset < MAX_DIAGNOSTICS; offset += 500) {
    const page = records(
      app,
      DIAGNOSTICS_COLLECTION,
      "store = {:store} && client_occurred_at >= {:since}",
      "-client_occurred_at,-id",
      Math.min(500, MAX_DIAGNOSTICS - offset),
      offset,
      { store: storeId, since },
    );
    result.push(...page.filter((record) => relationId(record, "store") === storeId));
    if (page.length < 500) break;
  }
  result.sort((left, right) => {
    const leftAt = parsedDate(recordString(left, "client_occurred_at"));
    const rightAt = parsedDate(recordString(right, "client_occurred_at"));
    return (rightAt ? rightAt.getTime() : 0) - (leftAt ? leftAt.getTime() : 0);
  });
  return result;
}

function recentDeliveries(app, storeId, now) {
  if (!collectionReady(app, DELIVERIES_COLLECTION)) return [];
  const result = [];
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS).toISOString();
  for (let offset = 0; offset < MAX_DELIVERIES; offset += 500) {
    const page = records(
      app,
      DELIVERIES_COLLECTION,
      'store = {:store} && created >= {:since} && (fcm_status = "received" || native_status = "delivered" || native_status = "read")',
      "-created,-id",
      Math.min(500, MAX_DELIVERIES - offset),
      offset,
      { store: storeId, since },
    );
    result.push(...page.filter((record) => relationId(record, "store") === storeId));
    if (page.length < 500) break;
  }
  return result;
}

function inferredDeliveryTrigger(record, fcmReceivedAt, displayedAt) {
  const stored = recordString(record, "delivery_trigger", 40);
  if (DELIVERY_TRIGGERS.includes(stored) && stored !== "unknown") return stored;
  const fcm = parsedDate(fcmReceivedAt);
  const displayed = parsedDate(displayedAt);
  if (fcm && (!displayed || fcm.getTime() <= displayed.getTime())) return "fcm";
  if (displayed) return "native_sync_legacy";
  return "unknown";
}

function deliverySnapshot(record) {
  if (!record) return null;
  const fcmReceivedAt = isoDate(recordString(record, "fcm_received_at", 40));
  const displayedAt = isoDate(
    recordString(record, "displayed_at", 40)
      || recordString(record, "native_delivered_at", 40),
  );
  const readAt = isoDate(recordString(record, "read_at", 40));
  if (!fcmReceivedAt && !displayedAt && !readAt) return null;
  const state = readAt ? "read" : displayedAt ? "displayed" : "received";
  return {
    state,
    delivery_trigger: inferredDeliveryTrigger(record, fcmReceivedAt, displayedAt),
    accepted_at: isoDate(recordString(record, "accepted_at", 40)),
    fcm_received_at: fcmReceivedAt,
    displayed_at: displayedAt,
    read_at: readAt,
  };
}

function latestDeliveryMap(deliveries, installationIds) {
  const accepted = new Set(installationIds);
  const result = new Map();
  const activityAt = (snapshot) => laterIso(snapshot && snapshot.displayed_at, snapshot && snapshot.fcm_received_at);
  deliveries.forEach((record) => {
    const installationId = relationId(record, "installation");
    if (!accepted.has(installationId)) return;
    const snapshot = deliverySnapshot(record);
    if (!snapshot) return;
    const existing = result.get(installationId);
    const nextAt = parsedDate(activityAt(snapshot));
    const existingAt = parsedDate(activityAt(existing));
    if (!existing || (nextAt && (!existingAt || nextAt.getTime() > existingAt.getTime()))) {
      result.set(installationId, snapshot);
    }
  });
  return result;
}

function eventSnapshot(record) {
  if (!record) return null;
  const result = recordString(record, "result", 20);
  const occurredAt = isoDate(recordString(record, "client_occurred_at", 40));
  if (!["started", "success", "failure", "skipped"].includes(result) || !occurredAt) return null;
  return {
    result,
    error_code: recordString(record, "error_code", 80),
    http_status: Math.min(599, recordNumber(record, "http_status")),
    latency_ms: Math.min(600000, recordNumber(record, "latency_ms")),
    occurred_at: occurredAt,
  };
}

function statusFromEvent(event, fallback) {
  if (!event) return fallback || "unknown";
  if (event.result === "success" || event.result === "started") return "healthy";
  if (event.result === "failure") return "critical";
  return "warning";
}

function statusAfterRecovery(event, fallback, recoveryAt) {
  if (event && event.result === "failure") {
    const failure = parsedDate(event.occurred_at);
    const recovery = parsedDate(recoveryAt);
    if (failure && recovery && recovery.getTime() > failure.getTime()) return "healthy";
  }
  return statusFromEvent(event, fallback);
}

function freshness(lastContactAt, now) {
  const parsed = parsedDate(lastContactAt);
  if (!parsed) return "unknown";
  const age = Math.max(0, now.getTime() - parsed.getTime());
  if (age <= FRESH_WINDOW_MS) return "healthy";
  if (age <= ACTIVE_WINDOW_MS) return "warning";
  return "unknown";
}

function supportReference(storeId, installationId, options) {
  const referenceFor = options && typeof options.referenceFor === "function"
    ? options.referenceFor
    : (resolvedStoreId, resolvedInstallationId) => installationSecurity.installationAdminReference(
      resolvedStoreId,
      resolvedInstallationId,
    );
  return text(referenceFor(storeId, installationId), 20);
}

function latestEventMap(diagnostics, installationIds) {
  const accepted = new Set(installationIds);
  const result = new Map();
  diagnostics.forEach((record) => {
    const installationId = relationId(record, "installation");
    const eventType = recordString(record, "event_type", 50);
    if (!accepted.has(installationId) || !EVENT_TYPES.includes(eventType)) return;
    const key = `${installationId}:${eventType}`;
    const snapshot = eventSnapshot(record);
    if (snapshot && !result.has(key)) result.set(key, snapshot);
  });
  return result;
}

function installationSnapshot(record, events, delivery, now, storeId, options) {
  const id = recordId(record);
  const event = (type) => events.get(`${id}:${type}`) || null;
  const latest = {
    internet: event("INTERNET_AVAILABLE"),
    backend: event("BACKEND_REACHABLE"),
    registration: event("INSTALLATION_REGISTER_RESPONSE"),
    firebase: event("FIREBASE_INITIALIZED"),
    fcm: event("FCM_TOKEN_CREATED"),
    permission: event("NOTIFICATION_PERMISSION_STATUS"),
    push: event("LAST_PUSH_RECEIVED"),
    error: event("LAST_ERROR"),
  };
  const installationStatus = recordString(record, "status", 20);
  const lastSeenAt = isoDate(recordString(record, "last_seen_at", 40));
  const lastHeartbeatAt = isoDate(recordString(record, "last_heartbeat_at", 40));
  const lastContactAt = laterIso(lastHeartbeatAt, lastSeenAt);
  const freshnessStatus = freshness(lastContactAt, now);
  const monitored = Array.from(events.keys()).some((key) => key.startsWith(`${id}:`));
  const backendRecoveryAt = laterIso(
    lastHeartbeatAt,
    latest.backend && latest.backend.result === "success" ? latest.backend.occurred_at : "",
    latest.registration && latest.registration.result === "success" ? latest.registration.occurred_at : "",
  );
  const registrationRecoveryAt = laterIso(
    lastHeartbeatAt,
    latest.registration && latest.registration.result === "success" ? latest.registration.occurred_at : "",
  );
  const lastErrorActive = Boolean(latest.error && (!backendRecoveryAt
    || new Date(latest.error.occurred_at).getTime() > new Date(backendRecoveryAt).getTime()));
  const backendStatus = statusAfterRecovery(
    latest.backend,
    freshnessStatus === "healthy" ? "healthy" : "unknown",
    backendRecoveryAt,
  );
  const registrationStatus = statusAfterRecovery(
    latest.registration,
    installationStatus === "active" ? "healthy" : "unknown",
    registrationRecoveryAt,
  );
  const nativeSyncStatus = freshnessStatus;
  const storedFirebaseStatus = recordString(record, "firebase_status", 30);
  const firebaseStatus = ["unknown", "unavailable", "registering", "registered", "failed"].includes(storedFirebaseStatus)
    ? storedFirebaseStatus : "unknown";
  let healthStatus = "unknown";
  if (installationStatus !== "active") healthStatus = "inactive";
  else if (backendStatus === "critical" || registrationStatus === "critical" || lastErrorActive) healthStatus = "critical";
  else if (freshnessStatus === "healthy" && monitored) healthStatus = "healthy";
  else if (freshnessStatus === "healthy" || freshnessStatus === "warning") healthStatus = "warning";

  return {
    support_ref: supportReference(storeId, id, options),
    health_status: HEALTH_STATES.includes(healthStatus) ? healthStatus : "unknown",
    installation_status: ["active", "disabled", "invalid", "revoked"].includes(installationStatus)
      ? installationStatus : "invalid",
    monitoring_active: monitored,
    app_version: recordString(record, "app_version", 40),
    app_version_code: recordNumber(record, "app_version_code"),
    android_version: recordString(record, "android_version", 40),
    device_model: recordString(record, "device_model", 120) || "Dispositivo Android",
    locale: recordString(record, "locale", 35),
    timezone: recordString(record, "timezone", 80),
    country_code: recordString(record, "country_code", 2).toUpperCase(),
    region_code: recordString(record, "region_code", 80),
    notification_permission: ["unknown", "granted", "denied"].includes(recordString(record, "notification_permission", 20))
      ? recordString(record, "notification_permission", 20) : "unknown",
    identity_source: ["firebase_fid", "app_uuid", "migrated"].includes(recordString(record, "identity_source", 30))
      ? recordString(record, "identity_source", 30) : "migrated",
    trust_level: ["basic", "firebase_verified", "revoked"].includes(recordString(record, "trust_level", 30))
      ? recordString(record, "trust_level", 30) : "basic",
    firebase_status: firebaseStatus,
    firebase_synced_at: isoDate(recordString(record, "firebase_synced_at", 40)),
    fcm_registration_present: firebaseStatus === "registered" && Boolean(recordString(record, "fid_digest", 64)),
    first_seen_at: isoDate(recordString(record, "first_seen_at", 40)),
    last_seen_at: lastSeenAt,
    last_heartbeat_at: lastHeartbeatAt,
    last_contact_at: lastContactAt,
    backend_status: backendStatus,
    registration_status: registrationStatus,
    native_sync_status: nativeSyncStatus,
    last_push_at: laterIso(
      latest.push ? latest.push.occurred_at : "",
      delivery && delivery.fcm_received_at,
      delivery && delivery.displayed_at,
    ),
    last_delivery: delivery || null,
    last_error: latest.error ? {
      code: latest.error.error_code || "error_reported",
      occurred_at: latest.error.occurred_at,
      active: lastErrorActive,
    } : null,
    latest_events: latest,
  };
}

function service(key, label, status, importance, detail, checkedAt, metrics) {
  return {
    key,
    label,
    status: ["healthy", "warning", "critical", "unknown"].includes(status) ? status : "unknown",
    importance,
    detail: text(detail, 240),
    checked_at: isoDate(checkedAt),
    metrics: metrics || {},
  };
}

function coverageState(devices, key) {
  const counts = { healthy: 0, warning: 0, critical: 0, unknown: 0 };
  devices.forEach((device) => {
    const value = ["healthy", "warning", "critical"].includes(device[key]) ? device[key] : "unknown";
    counts[value] += 1;
  });
  let status = "unknown";
  if (devices.length && counts.critical > 0 && counts.healthy === 0) status = "critical";
  else if (devices.length && (counts.critical > 0 || counts.warning > 0 || counts.unknown > 0)) status = "warning";
  else if (devices.length && counts.healthy === devices.length) status = "healthy";
  return { status, counts };
}

function realtimeHealthUrl(value) {
  const match = text(value, 300).match(/^wss:\/\/([a-z0-9.-]+(?::[0-9]{1,5})?)\/v1\/connect$/i);
  return match ? `https://${match[1].toLowerCase()}/healthz` : "";
}

function realtimeProbe(now, options) {
  const settings = options && typeof options === "object" ? options : {};
  const getenv = typeof settings.getenv === "function" ? settings.getenv
    : (typeof $os !== "undefined" && $os && typeof $os.getenv === "function" ? $os.getenv.bind($os) : () => "");
  const send = typeof settings.realtimeSend === "function" ? settings.realtimeSend
    : (typeof $http !== "undefined" && $http && typeof $http.send === "function" ? $http.send.bind($http) : null);
  const url = realtimeHealthUrl(getenv("PZ_STOREFRONT_REALTIME_PUBLIC_URL"));
  if (!url) return service(
    "realtime", "WebSocket", "warning", "accelerator",
    "El gateway WebSocket no está configurado; FCM y la sincronización nativa continúan disponibles.",
    now, { configured: false, connections: 0, latency_ms: 0 },
  );
  if (!send) return service(
    "realtime", "WebSocket", "unknown", "accelerator",
    "No fue posible ejecutar la comprobación en vivo del gateway.",
    now, { configured: true, connections: 0, latency_ms: 0 },
  );
  const started = Date.now();
  try {
    const response = send({ url, method: "GET", headers: { accept: "application/json" }, timeout: 3 });
    const latency = Math.max(0, Math.min(600000, Date.now() - started));
    const connections = Number(response && response.json && response.json.connections);
    if (Number(response && response.statusCode) === 200 && response.json && response.json.ok === true
      && Number.isSafeInteger(connections) && connections >= 0) {
      return service(
        "realtime", "WebSocket", "healthy", "accelerator",
        `Gateway respondió desde el backend; ${connections} conexión${connections === 1 ? "" : "es"} activa${connections === 1 ? "" : "s"} al comprobar.`,
        now, { configured: true, connections, latency_ms: latency },
      );
    }
    return service(
      "realtime", "WebSocket", "warning", "accelerator",
      "El gateway no respondió correctamente; la cola nativa y FCM mantienen el respaldo.",
      now, { configured: true, connections: 0, latency_ms: latency },
    );
  } catch (_) {
    return service(
      "realtime", "WebSocket", "warning", "accelerator",
      "El gateway no respondió; la cola nativa y FCM mantienen el respaldo.",
      now, { configured: true, connections: 0, latency_ms: Math.max(0, Math.min(600000, Date.now() - started)) },
    );
  }
}

function updateService(now, appState) {
  const state = appState && typeof appState === "object" ? appState : {};
  const profile = state.profile && typeof state.profile === "object" ? state.profile : null;
  const artifacts = Array.isArray(state.artifacts) ? state.artifacts : [];
  const policy = state.update_policy && typeof state.update_policy === "object" ? state.update_policy : {};
  const published = artifacts.find((artifact) => artifact && artifact.kind === "apk"
    && artifact.release_status === "published" && artifact.lifecycle_status === "available") || null;
  if (!profile) return service(
    "updates", "Actualizaciones", "unknown", "core",
    "La app todavía no está aprovisionada.", now,
    { published_version_code: 0, minimum_supported_version_code: 0 },
  );
  const releaseState = text(policy.release_state, 20);
  const minimum = Number(policy.minimum_supported_version_code) || 0;
  const publishedCode = Number(published && published.version_code) || 0;
  if (!published || releaseState === "withdrawn" || profile.downloads_allowed === false) return service(
    "updates", "Actualizaciones", "warning", "core",
    "No hay una APK pública disponible para el sistema de actualización.", now,
    { published_version_code: publishedCode, minimum_supported_version_code: minimum },
  );
  if (releaseState === "paused") return service(
    "updates", "Actualizaciones", "warning", "core",
    "La versión pública existe, pero las descargas están pausadas.", now,
    { published_version_code: publishedCode, minimum_supported_version_code: minimum },
  );
  if (minimum > publishedCode) return service(
    "updates", "Actualizaciones", "critical", "core",
    "La versión mínima configurada supera a la APK publicada.", now,
    { published_version_code: publishedCode, minimum_supported_version_code: minimum },
  );
  return service(
    "updates", "Actualizaciones", "healthy", "core",
    `APK ${text(published.version_name, 40)} (${publishedCode}) disponible para actualización.`, now,
    { published_version_code: publishedCode, minimum_supported_version_code: minimum },
  );
}

function buildStorefrontAppHealth(app, storeId, options) {
  const settings = options && typeof options === "object" ? options : {};
  const now = settings.now instanceof Date ? settings.now : new Date(settings.now || Date.now());
  if (!Number.isFinite(now.getTime()) || !collectionReady(app, INSTALLATIONS_COLLECTION)
    || !collectionReady(app, DIAGNOSTICS_COLLECTION)) {
    return {
      available: false,
      generated_at: Number.isFinite(now.getTime()) ? now.toISOString() : new Date().toISOString(),
      display_time_zone: DISPLAY_TIME_ZONE,
      overall_status: "unknown",
      fresh_window_hours: 24,
      retention_days: 30,
      summary: {
        total: 0, active: 0, recent: 0, healthy: 0, warning: 0, critical: 0,
        unknown: 0, monitored: 0, firebase_registered: 0, fcm_registered: 0,
        notification_granted: 0, notification_denied: 0, push_fcm: 0, push_native: 0,
        push_unknown: 0,
      },
      services: [],
      installations: [],
      privacy_note: "La telemetría privada todavía no está disponible.",
    };
  }

  const installationRecords = records(
    app,
    INSTALLATIONS_COLLECTION,
    "store = {:store}",
    "-last_seen_at,-id",
    MAX_INSTALLATIONS,
    0,
    { store: storeId },
  ).filter((record) => relationId(record, "store") === storeId);
  const installationIds = installationRecords.map(recordId).filter(Boolean);
  const events = latestEventMap(recentDiagnostics(app, storeId, now), installationIds);
  const deliveries = latestDeliveryMap(recentDeliveries(app, storeId, now), installationIds);
  const installations = installationRecords.map((record) => installationSnapshot(
    record,
    events,
    deliveries.get(recordId(record)) || null,
    now,
    storeId,
    settings,
  ));
  const recent = installations.filter((item) => item.installation_status === "active"
    && parsedDate(item.last_contact_at)
    && now.getTime() - parsedDate(item.last_contact_at).getTime() <= ACTIVE_WINDOW_MS);
  const backendCoverage = coverageState(recent, "backend_status");
  const registrationCoverage = coverageState(recent, "registration_status");
  const nativeCoverage = coverageState(recent, "native_sync_status");
  const firebaseRegistered = recent.filter((item) => item.firebase_status === "registered").length;
  const fcmRegistered = recent.filter((item) => item.fcm_registration_present).length;
  const granted = recent.filter((item) => item.notification_permission === "granted").length;
  const denied = recent.filter((item) => item.notification_permission === "denied").length;
  const pushes = recent.filter((item) => parsedDate(item.last_push_at)).length;
  const fcmPushes = recent.filter((item) => item.last_delivery
    && item.last_delivery.delivery_trigger === "fcm").length;
  const nativePushes = recent.filter((item) => item.last_delivery
    && ["websocket_sync", "foreground_poll", "resume_sync", "workmanager", "native_sync_legacy"]
      .includes(item.last_delivery.delivery_trigger)).length;
  const unknownPushes = Math.max(0, pushes - fcmPushes - nativePushes);
  const activeErrors = recent.filter((item) => item.last_error && item.last_error.active).length;
  const checkedAt = now.toISOString();
  const services = [
    service(
      "api", "API y PocketBase", "healthy", "core",
      "El backend respondió esta consulta autenticada del Master.", checkedAt,
      { responding: true, recent_devices: recent.length },
    ),
    service(
      "client_connectivity", "Conectividad de la APK", backendCoverage.status, "core",
      recent.length ? `${backendCoverage.counts.healthy} de ${recent.length} instalaciones recientes confirman acceso al backend.`
        : "Aún no hay instalaciones recientes para medir conectividad.",
      laterIso(...recent.map((item) => item.latest_events.backend && item.latest_events.backend.occurred_at), checkedAt),
      { total: recent.length, ...backendCoverage.counts },
    ),
    service(
      "registration", "Registro de instalaciones", registrationCoverage.status, "core",
      recent.length ? `${registrationCoverage.counts.healthy} de ${recent.length} instalaciones recientes están registradas.`
        : "Aún no hay instalaciones recientes para validar el registro.",
      laterIso(...recent.map((item) => item.latest_events.registration && item.latest_events.registration.occurred_at), checkedAt),
      { total: recent.length, ...registrationCoverage.counts },
    ),
    service(
      "native_sync", "Sincronización nativa", nativeCoverage.status, "core",
      recent.length ? `${nativeCoverage.counts.healthy} de ${recent.length} instalaciones reportaron actividad durante las últimas 24 horas.`
        : "Aún no hay heartbeats recientes.",
      laterIso(...recent.map((item) => item.last_heartbeat_at), checkedAt),
      { total: recent.length, ...nativeCoverage.counts },
    ),
    service(
      "firebase_fcm", "Firebase y FCM", !recent.length ? "unknown"
        : firebaseRegistered === recent.length && fcmRegistered === recent.length ? "healthy" : "warning",
      "optional",
      recent.length ? `${firebaseRegistered} con Firebase y ${fcmRegistered} con registro FCM (FID) de ${recent.length}; el registro propio y la cola nativa no dependen de ellos.`
        : "Sin instalaciones recientes para medir Firebase o FCM.",
      laterIso(...recent.map((item) => item.firebase_synced_at), checkedAt),
      { total: recent.length, firebase_registered: firebaseRegistered, fcm_registered: fcmRegistered },
    ),
    service(
      "notification_permission", "Permiso de notificaciones", !recent.length ? "unknown"
        : granted === recent.length ? "healthy" : "warning",
      "user_setting",
      recent.length ? `${granted} concedidos, ${denied} denegados y ${recent.length - granted - denied} sin confirmar.`
        : "Sin instalaciones recientes para medir el permiso.",
      laterIso(...recent.map((item) => item.latest_events.permission && item.latest_events.permission.occurred_at), checkedAt),
      { total: recent.length, granted, denied, unknown: Math.max(0, recent.length - granted - denied) },
    ),
    service(
      "push_receipts", "Recepción de campañas", pushes > 0 ? "healthy" : "unknown", "observability",
      pushes > 0 ? `${pushes} instalaciones recientes confirmaron recepción: ${fcmPushes} por FCM, ${nativePushes} por el sistema resiliente y ${unknownPushes} sin canal concluyente.`
        : "No hay recepción reciente registrada; puede significar que no se envió una campaña de prueba.",
      laterIso(...recent.map((item) => item.last_push_at), checkedAt),
      {
        total: recent.length,
        received: pushes,
        fcm: fcmPushes,
        native: nativePushes,
        unknown: unknownPushes,
      },
    ),
    service(
      "errors", "Errores de la APK", activeErrors > 0 ? "warning" : recent.length ? "healthy" : "unknown", "observability",
      activeErrors > 0 ? `${activeErrors} instalaciones mantienen un error posterior a su última recuperación.`
        : recent.length ? "No hay errores activos en las instalaciones recientes." : "Sin telemetría reciente para evaluar errores.",
      laterIso(...recent.map((item) => item.last_error && item.last_error.occurred_at), checkedAt),
      { total: recent.length, active_errors: activeErrors },
    ),
    realtimeProbe(now, settings),
    updateService(now, settings.appState),
  ];

  const coreServices = services.filter((item) => item.importance === "core" && item.key !== "api");
  let overallStatus = "healthy";
  if (!recent.length) overallStatus = "unknown";
  else if (coreServices.some((item) => item.status === "critical")) overallStatus = "critical";
  else if (coreServices.some((item) => item.status !== "healthy")
    || services.some((item) => item.importance === "accelerator" && item.status === "warning")) overallStatus = "warning";

  return {
    available: true,
    generated_at: checkedAt,
    display_time_zone: DISPLAY_TIME_ZONE,
    overall_status: overallStatus,
    fresh_window_hours: 24,
    retention_days: 30,
    summary: {
      total: installations.length,
      active: installations.filter((item) => item.installation_status === "active").length,
      recent: recent.length,
      healthy: installations.filter((item) => item.health_status === "healthy").length,
      warning: installations.filter((item) => item.health_status === "warning").length,
      critical: installations.filter((item) => item.health_status === "critical").length,
      unknown: installations.filter((item) => item.health_status === "unknown").length,
      monitored: installations.filter((item) => item.monitoring_active).length,
      firebase_registered: installations.filter((item) => item.firebase_status === "registered").length,
      fcm_registered: installations.filter((item) => item.fcm_registration_present).length,
      notification_granted: installations.filter((item) => item.notification_permission === "granted").length,
      notification_denied: installations.filter((item) => item.notification_permission === "denied").length,
      push_fcm: fcmPushes,
      push_native: nativePushes,
      push_unknown: unknownPushes,
    },
    services,
    installations,
    privacy_note: "Se muestran referencias de soporte y estados técnicos. UUID, FID, tokens, credenciales e IP permanecen ocultos.",
  };
}

module.exports = {
  ACTIVE_WINDOW_MS,
  DELIVERIES_COLLECTION,
  DIAGNOSTICS_COLLECTION,
  DISPLAY_TIME_ZONE,
  FRESH_WINDOW_MS,
  INSTALLATIONS_COLLECTION,
  buildStorefrontAppHealth,
  realtimeHealthUrl,
};
