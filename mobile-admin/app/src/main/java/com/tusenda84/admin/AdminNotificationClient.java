package com.tusenda84.admin;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

final class AdminNotificationClient {
    private static final String SYNC_PATH = "/api/pz/admin-push/v2/notifications/sync";
    private static final String ACK_PATH = "/api/pz/admin-push/v2/notifications/ack";
    private static final String FIREBASE_PATH = "/api/pz/admin-push/v2/firebase";
    private static final int RESPONSE_LIMIT = 65_536;
    private static final Pattern SAFE_ERROR = Pattern.compile("^[a-z0-9_:-]{1,80}$");
    private static final Set<String> SYNC_TRIGGERS = immutableSet(
            AdminNotificationStore.TRIGGER_FOREGROUND,
            AdminNotificationStore.TRIGGER_RESUME,
            AdminNotificationStore.TRIGGER_WORKMANAGER
    );
    private static final Set<String> SYNC_RESPONSE_KEYS = immutableSet(
            "ok", "notifications", "server_time"
    );
    private static final Set<String> ACK_RESPONSE_KEYS = immutableSet(
            "ok", "accepted", "duplicates"
    );
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    interface Callback {
        void complete(Result result);
    }

    static final class Result {
        final boolean ok;
        final String message;

        private Result(boolean ok, String message) {
            this.ok = ok;
            this.message = message;
        }

        static Result ok(String message) {
            return new Result(true, message);
        }

        static Result fail(String message) {
            return new Result(false, message);
        }
    }

    private interface Operation {
        Result run() throws Exception;
    }

    private final Context context;

    AdminNotificationClient(Context context) {
        this.context = context.getApplicationContext();
    }

    void syncNotifications(String deliveryTrigger, Callback callback) {
        execute(callback, () -> syncInternal(deliveryTrigger));
    }

    void flushReceipts(Callback callback) {
        execute(callback, this::flushReceiptsInternal);
    }

    void enrichFirebase(String firebaseInstallationId, Callback callback) {
        execute(callback, () -> enrichFirebaseInternal(firebaseInstallationId));
    }

    Result runDurableBackgroundSync() {
        if (!PushRegistrationStore.hasCredential(context)) {
            return Result.ok("La instalación espera autenticación en el panel.");
        }
        try {
            return syncInternal(AdminNotificationStore.TRIGGER_WORKMANAGER);
        } catch (Exception error) {
            return Result.fail(safeFailure(error));
        }
    }

    private Result syncInternal(String deliveryTrigger) throws Exception {
        if (!SYNC_TRIGGERS.contains(deliveryTrigger)) {
            return Result.fail("Origen de sincronización inválido.");
        }
        String credential = PushRegistrationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("La instalación todavía no está vinculada.");
        JSONObject request = new JSONObject();
        request.put("delivery_trigger", deliveryTrigger);
        HttpResult response = post(SYNC_PATH, request.toString(), credential);
        if (!response.ok()) return rejected(response);
        JSONObject payload = new JSONObject(response.body);
        if (!hasExactKeys(payload, SYNC_RESPONSE_KEYS)
                || !payload.optBoolean("ok", false)) {
            return Result.fail("El servidor devolvió una respuesta no válida.");
        }
        Instant serverTime;
        try { serverTime = Instant.parse(payload.optString("server_time", "")); }
        catch (Exception ignored) { return Result.fail("El servidor devolvió una hora no válida."); }
        JSONArray notifications = payload.optJSONArray("notifications");
        if (notifications == null || notifications.length() > 50) {
            return Result.fail("El servidor devolvió demasiadas notificaciones.");
        }
        int delivered = 0;
        for (int index = 0; index < notifications.length(); index += 1) {
            AdminPushPayload notification = AdminPushPayload.fromSync(
                    notifications.optJSONObject(index),
                    serverTime
            );
            if (notification == null) return Result.fail("El servidor devolvió una notificación no válida.");
            if (!PushNotifications.show(context, notification)) continue;
            AdminNotificationStore.queueReceipt(
                    context,
                    notification.notificationId,
                    "native_delivered",
                    deliveryTrigger
            );
            delivered += 1;
        }
        Result receipts = flushReceiptsInternal();
        if (!receipts.ok) return receipts;
        PushRegistrationStore.recordSuccessfulSync(context, Instant.now().toString());
        return Result.ok("Notificaciones recuperadas: " + delivered + ".");
    }

    private Result flushReceiptsInternal() throws Exception {
        String credential = PushRegistrationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("La instalación todavía no está vinculada.");
        int synchronizedCount = 0;
        for (int page = 0; page < 5; page += 1) {
            AdminNotificationStore.ReceiptBatch batch = AdminNotificationStore.pendingBatch(context);
            if (batch.count < 1) break;
            HttpResult response = post(ACK_PATH, batch.body, credential);
            if (!response.ok()) return rejected(response);
            JSONObject payload = new JSONObject(response.body);
            if (!hasExactKeys(payload, ACK_RESPONSE_KEYS)
                    || !payload.optBoolean("ok", false)) {
                return Result.fail("El servidor rechazó las confirmaciones.");
            }
            int accepted = payload.optInt("accepted", -1);
            int duplicates = payload.optInt("duplicates", -1);
            if (accepted < 0 || duplicates < 0 || accepted + duplicates != batch.count) {
                return Result.fail("El servidor devolvió un conteo no válido.");
            }
            AdminNotificationStore.acknowledge(context, batch.keys);
            synchronizedCount += batch.count;
        }
        return Result.ok("Confirmaciones sincronizadas: " + synchronizedCount + ".");
    }

    private Result enrichFirebaseInternal(String firebaseInstallationId) throws Exception {
        String fid = firebaseInstallationId == null ? "" : firebaseInstallationId.trim();
        if (!fid.matches("^[A-Za-z0-9_-]{16,255}$")) {
            return Result.fail("La identidad Firebase no es válida.");
        }
        String credential = PushRegistrationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("La instalación todavía no está vinculada.");
        JSONObject body = new JSONObject();
        body.put("firebase_installation_id", fid);
        HttpResult response = post(FIREBASE_PATH, body.toString(), credential);
        return response.ok() ? Result.ok("Firebase sincronizado.") : rejected(response);
    }

    private HttpResult post(String path, String body, String credential) throws Exception {
        String endpoint = endpoint(path);
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Authorization", "Bearer " + credential);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            int status = connection.getResponseCode();
            String responseBody = readBody(connection, status);
            if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
                PushRegistrationStore.clearCredential(context);
            }
            return new HttpResult(status, responseBody);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String endpoint(String path) {
        Uri configured = Uri.parse(BuildConfig.API_BASE_URL);
        String scheme = configured.getScheme() == null
                ? ""
                : configured.getScheme().toLowerCase(Locale.ROOT);
        String host = configured.getHost() == null
                ? ""
                : configured.getHost().toLowerCase(Locale.ROOT);
        String authority = configured.getEncodedAuthority();
        String configuredPath = configured.getEncodedPath();
        boolean secure = "https".equals(scheme);
        boolean localDebug = BuildConfig.DEBUG
                && "http".equals(scheme)
                && ("localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host));
        if ((!secure && !localDebug)
                || host.isEmpty()
                || authority == null
                || authority.isEmpty()
                || configured.getUserInfo() != null
                || configured.getQuery() != null
                || configured.getFragment() != null
                || (configuredPath != null && !configuredPath.isEmpty() && !"/".equals(configuredPath))
                || path == null
                || !path.startsWith("/api/pz/admin-push/")) {
            throw new IllegalStateException("api_not_configured");
        }
        return scheme + "://" + authority + path;
    }

    private Result rejected(HttpResult response) {
        String code = "request_failed";
        try {
            String candidate = new JSONObject(response.body).optString("error", "");
            if (SAFE_ERROR.matcher(candidate).matches()) code = candidate;
        } catch (Exception ignored) {
        }
        return Result.fail("Solicitud rechazada (HTTP " + response.status + ", " + code + ").");
    }

    private void execute(Callback callback, Operation operation) {
        EXECUTOR.execute(() -> {
            Result result;
            try { result = operation.run(); }
            catch (Exception error) { result = Result.fail(safeFailure(error)); }
            Result delivered = result;
            MAIN.post(() -> {
                if (callback != null) callback.complete(delivered);
            });
        });
    }

    private static String readBody(HttpURLConnection connection, int status) throws Exception {
        InputStream source = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        if (source == null) return "";
        try (InputStream input = source; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > RESPONSE_LIMIT) throw new IllegalStateException("response_too_large");
                output.write(buffer, 0, read);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static boolean hasExactKeys(JSONObject source, Set<String> expected) {
        if (source == null || source.length() != expected.size()) return false;
        Set<String> actual = new HashSet<>();
        Iterator<String> keys = source.keys();
        while (keys.hasNext()) actual.add(keys.next());
        return actual.equals(expected);
    }

    private static Set<String> immutableSet(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    private static String safeFailure(Throwable error) {
        String value = String.valueOf(
                error == null ? "" : error.getMessage()
        ).toLowerCase(Locale.ROOT);
        if (value.contains("unknownhost") || value.contains("connect")
                || value.contains("timeout")) return "No fue posible conectar con el servidor.";
        if (value.contains("ssl") || value.contains("certificate")) {
            return "No fue posible verificar la conexión segura.";
        }
        return "La sincronización de avisos falló de forma segura.";
    }

    private static final class HttpResult {
        final int status;
        final String body;

        HttpResult(int status, String body) {
            this.status = status;
            this.body = body == null ? "" : body;
        }

        boolean ok() {
            return status >= 200 && status < 300;
        }
    }
}
