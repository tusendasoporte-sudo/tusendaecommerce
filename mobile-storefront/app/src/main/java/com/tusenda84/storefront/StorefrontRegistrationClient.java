package com.tusenda84.storefront;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.appcheck.AppCheckToken;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

final class StorefrontRegistrationClient {
    enum RegistrationOrigin {
        USER_ACTION,
        MESSAGING_CALLBACK
    }

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

    private static final Pattern CREDENTIAL_PATTERN = Pattern.compile("^pzs_v1_[a-f0-9]{64}$");
    private static final Pattern BOOTSTRAP_URL_PATTERN = Pattern.compile(
            "^https://[^/]+/api/storefront/v1/session/bootstrap/pzb_v1_[A-Za-z0-9]{48}$"
    );
    private static final Pattern SAFE_ERROR = Pattern.compile("^[a-z0-9_]{1,80}$");
    private static final int RESPONSE_LIMIT = 65_536;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private final Context context;

    StorefrontRegistrationClient(Context context) {
        this.context = context.getApplicationContext();
    }

    void register(Callback callback) {
        execute(callback, () -> registerInternal(false, RegistrationOrigin.USER_ACTION));
    }

    void registerFromMessagingCallback(Callback callback) {
        execute(callback, () -> registerInternal(false, RegistrationOrigin.MESSAGING_CALLBACK));
    }

    void rotateFidAndRegister(Callback callback) {
        execute(callback, () -> {
            if (!BuildConfig.ALLOW_STAGING_DESTRUCTIVE_TESTS) {
                return Result.fail("La rotación está deshabilitada en esta compilación.");
            }
            String credential = StorefrontInstallationStore.credential(context);
            if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");

            FirebaseMessaging messaging = FirebaseMessaging.getInstance();
            messaging.setAutoInitEnabled(false);
            Tasks.await(messaging.unregister(), 30, TimeUnit.SECONDS);
            Tasks.await(FirebaseInstallations.getInstance().delete(), 30, TimeUnit.SECONDS);
            messaging.setAutoInitEnabled(true);
            return registerInternal(true, RegistrationOrigin.USER_ACTION);
        });
    }

    void heartbeat(Callback callback) {
        execute(callback, () -> authenticatedPost(
                StorefrontConfig.HEARTBEAT_PATH,
                StorefrontRegistrationPayload.heartbeat(
                        BuildConfig.VERSION_NAME,
                        BuildConfig.VERSION_CODE,
                        androidVersion(),
                        deviceModel(),
                        locale(),
                        timezone()
                ),
                "Heartbeat aceptado."
        ));
    }

    void updatePermission(Callback callback) {
        execute(callback, () -> authenticatedPost(
                StorefrontConfig.PERMISSION_PATH,
                StorefrontRegistrationPayload.permission(permissionState()),
                "Permiso actualizado."
        ));
    }

    void bootstrap(Callback callback) {
        execute(callback, this::bootstrapInternal);
    }

    void disable(Callback callback) {
        execute(callback, () -> {
            Result result = authenticatedPost(
                    StorefrontConfig.DISABLE_PATH,
                    StorefrontRegistrationPayload.empty(),
                    "Instalación desactivada."
            );
            if (result.ok) StorefrontInstallationStore.clearCredential(context);
            return result;
        });
    }

    private Result registerInternal(
            boolean forceAppCheckRefresh,
            RegistrationOrigin origin
    ) throws Exception {
        Result readiness = readiness();
        if (!readiness.ok) return readiness;

        // Validate the real Play Integrity path before creating or refreshing Firebase identifiers.
        // The token remains in memory and is never rendered or logged.
        String attestationToken = appCheckToken(forceAppCheckRefresh);

        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(true);
        if (shouldRequestMessagingRegistration(origin)) {
            Tasks.await(messaging.register(), 30, TimeUnit.SECONDS);
        }
        String fid = Tasks.await(FirebaseInstallations.getInstance().getId(), 30, TimeUnit.SECONDS);
        String body = StorefrontRegistrationPayload.register(
                fid,
                BuildConfig.VERSION_NAME,
                BuildConfig.VERSION_CODE,
                androidVersion(),
                deviceModel(),
                locale(),
                timezone(),
                permissionState()
        );
        String existingCredential = StorefrontInstallationStore.credential(context);
        HttpResult response = postWithToken(
                StorefrontConfig.REGISTER_PATH,
                body,
                existingCredential,
                attestationToken
        );
        if (!response.ok()) return failure(response);

        JSONObject payload = new JSONObject(response.body);
        String credential = payload.optString("credential", "");
        if (!payload.optBoolean("ok", false) || !CREDENTIAL_PATTERN.matcher(credential).matches()) {
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        StorefrontInstallationStore.saveCredential(context, credential);
        boolean created = payload.optBoolean("created", false);
        boolean rotated = payload.optBoolean("fid_rotated", false);
        if (rotated) return Result.ok("FID rotado y registro actualizado sin exponer identificadores.");
        if (created) return Result.ok("Instalación creada correctamente.");
        return Result.ok("Registro repetido sin duplicar la instalación.");
    }

    private Result authenticatedPost(String path, String body, String successMessage) throws Exception {
        Result readiness = readiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");
        HttpResult response = post(path, body, credential, false);
        if (!response.ok()) return failure(response);
        JSONObject payload = new JSONObject(response.body);
        return payload.optBoolean("ok", false)
                ? Result.ok(successMessage)
                : Result.fail("El gateway devolvió una respuesta no válida.");
    }

    private Result bootstrapInternal() throws Exception {
        Result readiness = readiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");

        HttpResult response = post(
                StorefrontConfig.BOOTSTRAP_PATH,
                StorefrontRegistrationPayload.empty(),
                credential,
                false
        );
        if (!response.ok()) return failure(response);
        JSONObject payload = new JSONObject(response.body);
        String bootstrapUrl = payload.optString("bootstrap_url", "");
        if (!payload.optBoolean("ok", false)
                || !BOOTSTRAP_URL_PATTERN.matcher(bootstrapUrl).matches()
                || !StorefrontConfig.sameOrigin(bootstrapUrl, StorefrontConfig.apiBaseUrl())) {
            return Result.fail("El gateway devolvió un bootstrap no válido.");
        }
        return consumeBootstrap(bootstrapUrl);
    }

    private Result consumeBootstrap(String bootstrapUrl) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(bootstrapUrl).openConnection();
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(20_000);
            connection.setRequestProperty("Accept", "text/html,application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            int status = connection.getResponseCode();
            String location = clean(connection.getHeaderField("Location"));
            String cookie = clean(connection.getHeaderField("Set-Cookie"));
            if (status != 303 || !location.startsWith("/t/")
                    || !cookie.startsWith("pz_storefront_session=pzws_v1_")) {
                return Result.fail("El bootstrap no pudo consumirse de forma segura.");
            }
            return Result.ok("Bootstrap consumido una sola vez y cookie segura recibida.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private HttpResult post(
            String path,
            String body,
            String credential,
            boolean forceAppCheckRefresh
    ) throws Exception {
        return postWithToken(path, body, credential, appCheckToken(forceAppCheckRefresh));
    }

    private HttpResult postWithToken(
            String path,
            String body,
            String credential,
            String token
    ) throws Exception {
        String endpoint = StorefrontConfig.endpoint(path);
        if (endpoint.isEmpty()) throw new IllegalStateException("api_not_configured");
        if (token.length() < 32 || token.length() > 8192) {
            throw new IllegalStateException("app_check_unavailable");
        }

        HttpURLConnection connection = null;
        try {
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(30_000);
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("X-Firebase-AppCheck", token);
            if (!credential.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + credential);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
            int status = connection.getResponseCode();
            String responseBody = readBody(connection, status);
            return new HttpResult(status, responseBody);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String appCheckToken(boolean forceRefresh) throws Exception {
        AppCheckToken appCheckToken = Tasks.await(
                FirebaseAppCheck.getInstance().getAppCheckToken(forceRefresh),
                45,
                TimeUnit.SECONDS
        );
        String token = clean(appCheckToken == null ? "" : appCheckToken.getToken());
        if (token.length() < 32 || token.length() > 8192) {
            throw new IllegalStateException("app_check_unavailable");
        }
        return token;
    }

    private Result readiness() {
        if (!BuildConfig.FIREBASE_CONFIGURED) {
            return Result.fail("Firebase no está configurado en esta APK.");
        }
        if (StorefrontConfig.apiBaseUrl().isEmpty()) {
            return Result.fail("El origen HTTPS de staging no está configurado.");
        }
        return Result.ok("ready");
    }

    private Result failure(HttpResult response) {
        String code = "request_failed";
        try {
            String candidate = new JSONObject(response.body).optString("error", "");
            if (SAFE_ERROR.matcher(candidate).matches()) code = candidate;
        } catch (Exception ignored) {}
        return Result.fail("Solicitud rechazada (HTTP " + response.status + ", " + code + ").");
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

    private void execute(Callback callback, Operation operation) {
        EXECUTOR.execute(() -> {
            Result result;
            try {
                result = operation.run();
            } catch (Exception error) {
                result = Result.fail(safeFailure(error));
            }
            Result delivered = result;
            MAIN.post(() -> callback.complete(delivered));
        });
    }

    static String safeFailure(Throwable error) {
        StringBuilder diagnostic = new StringBuilder();
        Throwable current = error;
        for (int depth = 0; current != null && depth < 8; depth++) {
            diagnostic.append(' ')
                    .append(current.getClass().getName())
                    .append(' ')
                    .append(clean(current.getMessage()));
            Throwable next = current.getCause();
            if (next == current) break;
            current = next;
        }
        String material = diagnostic.toString().toLowerCase(Locale.ROOT);
        if (material.contains("appcheck")
                || material.contains("app_check")
                || material.contains("playintegrity")
                || material.contains("attestation")
                || material.contains("attest")
                || material.contains("integrity")) {
            return "App Check/Play Integrity no pudo emitir una atestación válida.";
        }
        if (material.contains("firebaseinstallations")
                || material.contains("firebasemessaging")
                || material.contains("service_not_available")) {
            return "Firebase no pudo registrar esta instalación.";
        }
        if (material.contains("unknownhost")
                || material.contains("connectexception")
                || material.contains("sockettimeoutexception")) {
            return "No fue posible conectar con los servicios de staging.";
        }
        return "La operación falló de forma segura. Revisa conectividad y configuración de staging.";
    }

    static boolean shouldRequestMessagingRegistration(RegistrationOrigin origin) {
        return origin == RegistrationOrigin.USER_ACTION;
    }

    static String permissionState(Context context) {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
                ? "granted"
                : "denied";
    }

    private String permissionState() {
        return permissionState(context);
    }

    static String normalizedTimezone(String raw) {
        String value = clean(raw);
        if (value.equals("UTC") || value.equals("GMT")
                || value.matches("[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+){1,3}")) {
            return value;
        }
        return "UTC";
    }

    private static String timezone() {
        return normalizedTimezone(TimeZone.getDefault().getID());
    }

    private static String locale() {
        String value = Locale.getDefault().toLanguageTag();
        return value.matches("[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}") ? value : "en-US";
    }

    private static String androidVersion() {
        String release = clean(Build.VERSION.RELEASE);
        if (!release.matches("[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,39}")) release = String.valueOf(Build.VERSION.SDK_INT);
        return release;
    }

    private static String deviceModel() {
        String manufacturer = clean(Build.MANUFACTURER);
        String model = clean(Build.MODEL);
        String combined = model.toLowerCase(Locale.ROOT).startsWith(manufacturer.toLowerCase(Locale.ROOT))
                ? model
                : clean(manufacturer + " " + model);
        if (combined.isEmpty()) return "Android device";
        return combined.length() > 120 ? combined.substring(0, 120).trim() : combined;
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
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
