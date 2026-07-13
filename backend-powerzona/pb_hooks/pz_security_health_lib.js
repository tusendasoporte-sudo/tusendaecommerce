/// <reference path="../pb_data/types.d.ts" />

const {
  getSecuritySecretStatus,
} = require(`${__hooks}/pz_security_secret_contract.js`);

const REQUIRED_COLLECTIONS = [
  "store_security_settings",
  "store_customers",
  "store_security_events",
  "store_visitor_sessions",
  "store_visitor_pageviews",
];
const RUNTIME_LOG_MESSAGES = {
  PZ_SEC_RUNTIME_READY: "PowerZona security runtime ready.",
  PZ_SEC_RUNTIME_HMAC_MISSING: "PowerZona security runtime HMAC missing.",
  PZ_SEC_RUNTIME_AES_MISSING: "PowerZona security runtime AES missing.",
  PZ_SEC_RUNTIME_SCHEMA_INCOMPLETE: "PowerZona security runtime schema incomplete.",
};

function valueToString(value) {
  if (Array.isArray(value)) return value.length ? valueToString(value[0]) : "";
  if (value && typeof value === "object" && value.id) return String(value.id || "");
  return String(value || "");
}

function getString(record, key) {
  try {
    return valueToString(record.getString(key));
  } catch (_) {
    try {
      return valueToString(record.get(key));
    } catch (_) {
      return "";
    }
  }
}

function setNoStore(e) {
  try {
    const headers = e.response.header();
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Pragma", "no-cache");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  } catch (_) {}
}

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function collectionHasField(app, collectionName, fieldName) {
  const collection = findCollectionSafe(app, collectionName);
  if (!collection) return false;
  try {
    return !!collection.fields.getByName(fieldName);
  } catch (_) {
    return false;
  }
}

function hasCollections(app, names) {
  return names.every((name) => Boolean(findCollectionSafe(app, name)));
}

function hasActiveFullIpSecuritySettings(app) {
  try {
    const settings = app.findRecordsByFilter(
      "store_security_settings",
      'enabled = true && mode != "disabled" && ip_visibility = "full"',
      "",
      1,
      0,
      {}
    ) || [];
    return settings.length > 0;
  } catch (_) {
    return false;
  }
}

function buildSecurityHealth(app) {
  const secrets = getSecuritySecretStatus();
  const securitySettingsReady = Boolean(findCollectionSafe(app, "store_security_settings"));
  const customersReady = Boolean(findCollectionSafe(app, "store_customers"));
  const securityEventsReady = Boolean(findCollectionSafe(app, "store_security_events"));
  const visitorSessionsReady = Boolean(findCollectionSafe(app, "store_visitor_sessions"));
  const visitorPageviewsReady = Boolean(findCollectionSafe(app, "store_visitor_pageviews"));
  const ordersIdentityFieldsReady = collectionHasField(app, "orders", "customer")
    && collectionHasField(app, "orders", "security_registered_at");

  const identityCollectionsReady = securitySettingsReady && customersReady && securityEventsReady;
  const visitorCollectionsReady = visitorSessionsReady && visitorPageviewsReady;
  const schemaReady = hasCollections(app, REQUIRED_COLLECTIONS) && ordersIdentityFieldsReady;
  const fullIpRequired = hasActiveFullIpSecuritySettings(app);
  const fullIpReady = fullIpRequired ? Boolean(secrets.hmac_ready && secrets.aes_ready) : true;

  return {
    ok: Boolean(secrets.hmac_ready && schemaReady && fullIpReady),
    hmac_identity_ready: secrets.hmac_ready,
    hmac_monitoring_ready: secrets.hmac_ready,
    aes_identity_ready: secrets.aes_ready,
    aes_monitoring_ready: secrets.aes_ready,
    security_settings_ready: securitySettingsReady,
    customers_ready: customersReady,
    security_events_ready: securityEventsReady,
    visitor_sessions_ready: visitorSessionsReady,
    visitor_pageviews_ready: visitorPageviewsReady,
    identity_collections_ready: identityCollectionsReady,
    visitor_collections_ready: visitorCollectionsReady,
    orders_identity_fields_ready: ordersIdentityFieldsReady,
    full_ip_required: fullIpRequired,
    full_ip_ready: fullIpReady,
  };
}

function logSecurityRuntimeStatus(app) {
  try {
    const health = buildSecurityHealth(app);
    const hmacReady = Boolean(health.hmac_identity_ready && health.hmac_monitoring_ready);
    const aesReady = Boolean(health.aes_identity_ready && health.aes_monitoring_ready);
    const schemaReady = Boolean(
      health.security_settings_ready
        && health.customers_ready
        && health.security_events_ready
        && health.visitor_sessions_ready
        && health.visitor_pageviews_ready
        && health.orders_identity_fields_ready
    );
    let code = "PZ_SEC_RUNTIME_READY";

    if (!hmacReady) code = "PZ_SEC_RUNTIME_HMAC_MISSING";
    else if (!schemaReady) code = "PZ_SEC_RUNTIME_SCHEMA_INCOMPLETE";
    else if (health.full_ip_required && !aesReady) code = "PZ_SEC_RUNTIME_AES_MISSING";

    const logger = app.logger();
    const message = RUNTIME_LOG_MESSAGES[code] || RUNTIME_LOG_MESSAGES.PZ_SEC_RUNTIME_SCHEMA_INCOMPLETE;
    const args = [
      message,
      "code",
      code,
      "hmac_ready",
      hmacReady,
      "aes_ready",
      aesReady,
      "schema_ready",
      schemaReady,
    ];

    if (code === "PZ_SEC_RUNTIME_READY" && typeof logger.info === "function") {
      logger.info.apply(logger, args);
    } else {
      logger.warn.apply(logger, args);
    }
  } catch (_) {}
}

function handleSecurityHealth(e) {
  setNoStore(e);

  try {
    const info = e.requestInfo();
    const auth = info.auth;
    if (getString(auth, "role") !== "master_admin") {
      return e.json(403, { ok: false, error: "unauthorized" });
    }

    return e.json(200, buildSecurityHealth($app));
  } catch (_) {
    return e.json(500, {
      ok: false,
      hmac_identity_ready: false,
      hmac_monitoring_ready: false,
      aes_identity_ready: false,
      aes_monitoring_ready: false,
      security_settings_ready: false,
      customers_ready: false,
      security_events_ready: false,
      visitor_sessions_ready: false,
      visitor_pageviews_ready: false,
      identity_collections_ready: false,
      visitor_collections_ready: false,
      orders_identity_fields_ready: false,
      full_ip_ready: false,
    });
  }
}

module.exports = {
  handleSecurityHealth,
  logSecurityRuntimeStatus,
  _test: {
    buildSecurityHealth,
    hasActiveFullIpSecuritySettings,
  },
};
