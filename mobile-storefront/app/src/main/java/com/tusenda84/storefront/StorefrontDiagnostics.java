package com.tusenda84.storefront;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;
import org.json.JSONArray;

import java.time.Instant;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

final class StorefrontDiagnostics {
    static final String APP_STARTED = "APP_STARTED";
    static final String INTERNET_AVAILABLE = "INTERNET_AVAILABLE";
    static final String BACKEND_REACHABLE = "BACKEND_REACHABLE";
    static final String INSTALLATION_UUID_CREATED = "INSTALLATION_UUID_CREATED";
    static final String FIREBASE_INITIALIZED = "FIREBASE_INITIALIZED";
    static final String FID_CREATED = "FID_CREATED";
    static final String FCM_TOKEN_CREATED = "FCM_TOKEN_CREATED";
    static final String INSTALLATION_REGISTER_REQUEST_SENT = "INSTALLATION_REGISTER_REQUEST_SENT";
    static final String INSTALLATION_REGISTER_RESPONSE = "INSTALLATION_REGISTER_RESPONSE";
    static final String NOTIFICATION_PERMISSION_STATUS = "NOTIFICATION_PERMISSION_STATUS";
    static final String LAST_PUSH_RECEIVED = "LAST_PUSH_RECEIVED";
    static final String LAST_ERROR = "LAST_ERROR";

    private static final String PREFERENCES = "pz_storefront_diagnostics_v1";
    private static final String LAST_ERROR_CODE = "last_error_code";
    private static final String LAST_ERROR_AT = "last_error_at";
    private static final String DNS_AVAILABLE = "dns_available";
    private static final String HTTPS_AVAILABLE = "https_available";
    private static final String PENDING_EVENTS = "pending_events";
    private static final int MAX_PENDING_EVENTS = 64;
    private static final long LOCAL_RETENTION_SECONDS = 30L * 24L * 60L * 60L;
    private static final long FUTURE_TOLERANCE_SECONDS = 5L * 60L;
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9._:-]{16,128}$");
    private static final Pattern SAFE_CODE = Pattern.compile("^[a-z0-9_:-]{1,80}$");

    private StorefrontDiagnostics() {}

    static synchronized void record(
            Context context,
            String event,
            String result,
            String error,
            int httpStatus,
            long latencyMs
    ) {
        String safeEvent = safeEvent(event);
        String safeResult = safeResult(result);
        String safeError = safeCode(error);
        if (safeEvent.isEmpty() || safeResult.isEmpty()) return;
        try {
            JSONObject value = new JSONObject();
            value.put("idempotency_key", UUID.randomUUID().toString());
            value.put("event_type", safeEvent);
            value.put("timestamp", Instant.now().toString());
            value.put("occurred_at", value.optString("timestamp", ""));
            value.put("result", safeResult);
            value.put("error_code", safeError);
            value.put("http_status", Math.max(0, Math.min(599, httpStatus)));
            value.put("latency_ms", Math.max(0, Math.min(600_000, latencyMs)));
            JSONArray queue = readQueue(context);
            queue.put(value);
            if (queue.length() > MAX_PENDING_EVENTS) {
                JSONArray trimmed = new JSONArray();
                for (int index = queue.length() - MAX_PENDING_EVENTS; index < queue.length(); index += 1) {
                    trimmed.put(queue.getJSONObject(index));
                }
                queue = trimmed;
            }
            SharedPreferences.Editor editor = preferences(context).edit()
                    .putString("event_" + safeEvent, value.toString())
                    .putString(PENDING_EVENTS, queue.toString());
            if ("failure".equals(safeResult) && !safeError.isEmpty()) {
                editor.putString(LAST_ERROR_CODE, safeError)
                        .putString(LAST_ERROR_AT, value.optString("timestamp", ""));
            }
            editor.apply();
        } catch (Exception ignored) {
            // El diagnóstico nunca puede impedir el funcionamiento de la tienda.
        }
    }

    static synchronized void recordError(Context context, String error) {
        record(context, LAST_ERROR, "failure", error, 0, 0);
    }

    static synchronized void recordNetworkProbe(Context context, boolean dns, boolean https) {
        preferences(context).edit()
                .putBoolean(DNS_AVAILABLE, dns)
                .putBoolean(HTTPS_AVAILABLE, https)
                .apply();
    }

    static synchronized JSONObject event(Context context, String event) {
        String raw = preferences(context).getString("event_" + safeEvent(event), "");
        try { return raw == null || raw.isEmpty() ? new JSONObject() : new JSONObject(raw); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    static synchronized String lastError(Context context) {
        return preferences(context).getString(LAST_ERROR_CODE, "");
    }

    static synchronized String lastErrorAt(Context context) {
        return preferences(context).getString(LAST_ERROR_AT, "");
    }

    static synchronized boolean dnsAvailable(Context context) {
        return preferences(context).getBoolean(DNS_AVAILABLE, false);
    }

    static synchronized boolean httpsAvailable(Context context) {
        return preferences(context).getBoolean(HTTPS_AVAILABLE, false);
    }

    static synchronized Batch pendingBatch(Context context) {
        JSONArray pending = readQueue(context);
        JSONArray selected = new JSONArray();
        JSONArray retained = new JSONArray();
        Set<String> keys = new HashSet<>();
        Instant now = Instant.now();
        for (int index = 0; index < pending.length(); index += 1) {
            JSONObject source = pending.optJSONObject(index);
            if (!validQueuedEvent(source, now)) continue;
            retained.put(source);
            if (selected.length() >= 32) continue;
            String key = source.optString("idempotency_key", "");
            JSONObject event = new JSONObject();
            try {
                event.put("idempotency_key", key);
                event.put("event_type", source.optString("event_type", ""));
                event.put("result", source.optString("result", ""));
                event.put("error_code", source.optString("error_code", ""));
                event.put("http_status", source.optInt("http_status", 0));
                event.put("latency_ms", source.optLong("latency_ms", 0));
                event.put("occurred_at", source.optString("occurred_at", ""));
                selected.put(event);
                keys.add(key);
            } catch (Exception ignored) {}
        }
        preferences(context).edit().putString(PENDING_EVENTS, retained.toString()).apply();
        JSONObject body = new JSONObject();
        try { body.put("events", selected); } catch (Exception ignored) {}
        return new Batch(body.toString(), keys, selected.length());
    }

    static synchronized void acknowledge(Context context, Set<String> keys) {
        if (keys == null || keys.isEmpty()) return;
        JSONArray pending = readQueue(context);
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < pending.length(); index += 1) {
            JSONObject event = pending.optJSONObject(index);
            if (event == null || keys.contains(event.optString("idempotency_key", ""))) continue;
            remaining.put(event);
        }
        preferences(context).edit().putString(PENDING_EVENTS, remaining.toString()).apply();
    }

    private static JSONArray readQueue(Context context) {
        String raw = preferences(context).getString(PENDING_EVENTS, "[]");
        try { return new JSONArray(raw == null ? "[]" : raw); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static boolean validQueuedEvent(JSONObject value, Instant now) {
        if (value == null || value.length() != 8) return false;
        String key = value.optString("idempotency_key", "");
        String event = value.optString("event_type", "");
        String result = value.optString("result", "");
        String error = value.optString("error_code", "");
        String timestamp = value.optString("timestamp", "");
        String occurredAt = value.optString("occurred_at", "");
        if (!IDEMPOTENCY_KEY.matcher(key).matches()
                || !event.equals(safeEvent(event))
                || !result.equals(safeResult(result))
                || (!error.isEmpty() && !error.equals(safeCode(error)))
                || !timestamp.equals(occurredAt)
                || value.optInt("http_status", -1) < 0
                || value.optInt("http_status", -1) > 599
                || value.optLong("latency_ms", -1) < 0
                || value.optLong("latency_ms", -1) > 600_000) return false;
        try {
            Instant occurred = Instant.parse(occurredAt);
            return !occurred.isBefore(now.minusSeconds(LOCAL_RETENTION_SECONDS))
                    && !occurred.isAfter(now.plusSeconds(FUTURE_TOLERANCE_SECONDS));
        } catch (Exception ignored) {
            return false;
        }
    }

    static final class Batch {
        final String body;
        final Set<String> keys;
        final int count;

        Batch(String body, Set<String> keys, int count) {
            this.body = body;
            this.keys = keys;
            this.count = count;
        }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static String safeEvent(String value) {
        String event = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        switch (event) {
            case APP_STARTED:
            case INTERNET_AVAILABLE:
            case BACKEND_REACHABLE:
            case INSTALLATION_UUID_CREATED:
            case FIREBASE_INITIALIZED:
            case FID_CREATED:
            case FCM_TOKEN_CREATED:
            case INSTALLATION_REGISTER_REQUEST_SENT:
            case INSTALLATION_REGISTER_RESPONSE:
            case NOTIFICATION_PERMISSION_STATUS:
            case LAST_PUSH_RECEIVED:
            case LAST_ERROR:
                return event;
            default:
                return "";
        }
    }

    private static String safeResult(String value) {
        String result = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        return "started".equals(result) || "success".equals(result)
                || "failure".equals(result) || "skipped".equals(result) ? result : "";
    }

    static String safeCode(String value) {
        String code = value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9_:-]+", "_");
        if (code.length() > 80) code = code.substring(0, 80);
        return SAFE_CODE.matcher(code).matches() ? code : "";
    }
}
