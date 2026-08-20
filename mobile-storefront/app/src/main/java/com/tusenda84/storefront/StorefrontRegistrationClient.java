package com.tusenda84.storefront;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.CookieManager;

import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.appset.AppSet;
import com.google.android.gms.appset.AppSetIdInfo;
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
import java.time.Instant;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class StorefrontRegistrationClient {
    private static final String ANALYTICS_LOG_TAG = "PZStorefrontAnalytics";
    private static final String REGISTRATION_LOG_TAG = "PZStorefrontRegister";

    enum RegistrationOrigin {
        APP_START,
        USER_ACTION,
        MESSAGING_CALLBACK
    }

    interface Callback {
        void complete(Result result);
    }

    interface TargetCallback {
        void complete(TargetResult result);
    }

    interface UpdatePolicyCallback {
        void complete(UpdatePolicy policy);
    }

    interface UpdateTicketCallback {
        void complete(UpdateTicket ticket);
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

    static final class TargetResult {
        final boolean ok;
        final String targetUrl;

        private TargetResult(boolean ok, String targetUrl) {
            this.ok = ok;
            this.targetUrl = targetUrl;
        }

        static TargetResult ok(String targetUrl) {
            return new TargetResult(true, targetUrl);
        }

        static TargetResult fail() {
            return new TargetResult(false, "");
        }
    }

    static final class UpdateArtifact {
        final String id;
        final String fileName;
        final String sha256;
        final long bytes;
        final long versionCode;
        final String versionName;
        final String packageName;

        UpdateArtifact(String id, String fileName, String sha256, long bytes, long versionCode,
                       String versionName, String packageName) {
            this.id = id;
            this.fileName = fileName;
            this.sha256 = sha256;
            this.bytes = bytes;
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.packageName = packageName;
        }
    }

    static final class UpdatePolicy {
        final boolean available;
        final boolean required;
        final String deliveryMode;
        final String playStoreUrl;
        final UpdateArtifact artifact;

        UpdatePolicy(boolean available, boolean required, String deliveryMode,
                     String playStoreUrl, UpdateArtifact artifact) {
            this.available = available;
            this.required = required;
            this.deliveryMode = deliveryMode;
            this.playStoreUrl = playStoreUrl;
            this.artifact = artifact;
        }
    }

    static final class UpdateTicket {
        final String downloadUrl;
        final UpdateArtifact artifact;

        UpdateTicket(String downloadUrl, UpdateArtifact artifact) {
            this.downloadUrl = downloadUrl;
            this.artifact = artifact;
        }
    }

    private interface Operation {
        Result run() throws Exception;
    }

    private interface TargetOperation {
        TargetResult run() throws Exception;
    }

    private interface UpdatePolicyOperation {
        UpdatePolicy run() throws Exception;
    }

    private interface UpdateTicketOperation {
        UpdateTicket run() throws Exception;
    }

    private static final Pattern CREDENTIAL_PATTERN = Pattern.compile("^pzs_v1_[a-f0-9]{64}$");
    private static final Pattern BOOTSTRAP_URL_PATTERN = Pattern.compile(
            "^https://[^/]+/api/storefront/v1/session/bootstrap/pzb_v1_[A-Za-z0-9]{48}$"
    );
    private static final Pattern SESSION_COOKIE_PATTERN = Pattern.compile(
            "^pz_storefront_session=pzws_v1_[A-Za-z0-9]{64}$"
    );
    private static final Pattern SESSION_MAX_AGE_PATTERN = Pattern.compile(
            "(?:^|;)\\s*Max-Age=([0-9]{1,6})(?:;|$)",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern SAFE_ERROR = Pattern.compile("^[a-z0-9_]{1,80}$");
    private static final Pattern CAMPAIGN_PATTERN = Pattern.compile("^[a-z0-9]{15}$");
    private static final Pattern UPDATE_TICKET_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
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

    void syncFromAppStart(Callback callback) {
        execute(callback, () -> registerInternal(false, RegistrationOrigin.APP_START));
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
        execute(callback, () -> {
            String permission = permissionState();
            Result result = authenticatedPost(
                    StorefrontConfig.PERMISSION_PATH,
                    StorefrontRegistrationPayload.permission(permission),
                    "Permiso actualizado."
            );
            if (result.ok) StorefrontInstallationStore.recordReportedPermission(context, permission);
            return result;
        });
    }

    void bootstrap(Callback callback) {
        execute(callback, this::bootstrapInternal);
    }

    void flushEvents(Callback callback) {
        execute(callback, this::flushEventsInternal);
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

    void resolveCampaignTarget(String campaignId, TargetCallback callback) {
        executeTarget(callback, () -> resolveCampaignTargetInternal(campaignId));
    }

    void checkForUpdate(String installSource, UpdatePolicyCallback callback) {
        executeUpdatePolicy(callback, () -> updatePolicyInternal(installSource));
    }

    void requestUpdateTicket(String artifactId, UpdateTicketCallback callback) {
        executeUpdateTicket(callback, () -> updateTicketInternal(artifactId));
    }

    void reportUpdateVerified(UpdateArtifact artifact, Callback callback) {
        execute(callback, () -> {
            if (artifact == null) return Result.fail("Metadatos de actualización no disponibles.");
            return authenticatedPost(
                    StorefrontConfig.UPDATE_VERIFIED_PATH,
                    StorefrontUpdateContract.verifiedPayload(
                            artifact.id,
                            artifact.sha256,
                            artifact.bytes,
                            artifact.versionCode
                    ),
                    "Descarga verificada registrada."
            );
        });
    }

    private Result registerInternal(
            boolean forceAppCheckRefresh,
            RegistrationOrigin origin
    ) throws Exception {
        logRegistration(
                "register_start origin=" + origin.name().toLowerCase(Locale.ROOT)
                        + " credential_present=" + StorefrontInstallationStore.hasCredential(context)
        );
        Result readiness = readiness();
        if (!readiness.ok) {
            logRegistration("register_readiness_failed");
            return readiness;
        }

        // Validate the real Play Integrity path before creating or refreshing Firebase identifiers.
        // The token remains in memory and is never rendered or logged.
        String attestationToken = appCheckToken(forceAppCheckRefresh);
        logRegistration("register_app_check_ok");

        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(true);
        if (shouldRequestMessagingRegistration(origin)) {
            Tasks.await(messaging.register(), 30, TimeUnit.SECONDS);
        }
        String fid = Tasks.await(FirebaseInstallations.getInstance().getId(), 30, TimeUnit.SECONDS);
        AppSetIdInfo appSetInfo = Tasks.await(
                AppSet.getClient(context).getAppSetIdInfo(),
                30,
                TimeUnit.SECONDS
        );
        logRegistration("register_identifiers_ready app_set_scope=" + appSetInfo.getScope());
        String appSetId = appSetInfo.getId();
        String permission = permissionState();
        String invalidField = StorefrontRegistrationPayload.invalidRegisterField(
                fid,
                appSetId,
                BuildConfig.VERSION_NAME,
                BuildConfig.VERSION_CODE,
                androidVersion(),
                deviceModel(),
                locale(),
                timezone(),
                permission
        );
        logRegistration("register_payload_contract=" + (invalidField.isEmpty() ? "ok" : invalidField));
        String body = StorefrontRegistrationPayload.register(
                fid,
                appSetId,
                BuildConfig.VERSION_NAME,
                BuildConfig.VERSION_CODE,
                androidVersion(),
                deviceModel(),
                locale(),
                timezone(),
                permission
        );
        String existingCredential = StorefrontInstallationStore.credential(context);
        HttpResult response = postWithToken(
                StorefrontConfig.REGISTER_PATH,
                body,
                existingCredential,
                attestationToken
        );
        logRegistration("register_http_status=" + response.status);
        if (!response.ok()) {
            Result rejected = failure(response);
            logRegistration("register_rejected reason=" + rejected.message);
            return rejected;
        }

        JSONObject payload = new JSONObject(response.body);
        String credential = payload.optString("credential", "");
        if (!payload.optBoolean("ok", false) || !CREDENTIAL_PATTERN.matcher(credential).matches()) {
            logRegistration("register_invalid_response");
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        StorefrontInstallationStore.saveCredential(context, credential);
        StorefrontInstallationStore.recordReportedPermission(context, permission);
        boolean created = payload.optBoolean("created", false);
        boolean rotated = payload.optBoolean("fid_rotated", false);
        logRegistration("register_accepted created=" + created + " fid_rotated=" + rotated);
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

    private TargetResult resolveCampaignTargetInternal(String campaignId) throws Exception {
        Result readiness = readiness();
        if (!readiness.ok || !CAMPAIGN_PATTERN.matcher(clean(campaignId)).matches()) {
            return TargetResult.fail();
        }
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return TargetResult.fail();
        HttpResult response = post(
                StorefrontConfig.RESOLVE_TARGET_PATH,
                StorefrontRegistrationPayload.resolveCampaignTarget(campaignId),
                credential,
                false
        );
        if (!response.ok()) return TargetResult.fail();
        JSONObject payload = new JSONObject(response.body);
        if (!payload.optBoolean("ok", false) || !"order".equals(payload.optString("target_type", ""))) {
            return TargetResult.fail();
        }
        String targetUrl = StorefrontDeepLink.resolveServerOrderTarget(
                StorefrontConfig.storeUrl(),
                payload.optString("target_path", "")
        );
        return targetUrl.equals(StorefrontConfig.storeUrl())
                ? TargetResult.fail()
                : TargetResult.ok(targetUrl);
    }

    private UpdatePolicy updatePolicyInternal(String installSource) throws Exception {
        Result readiness = readiness();
        if (!readiness.ok || !("play".equals(installSource) || "direct".equals(installSource))) return null;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return null;
        HttpResult response = post(
                StorefrontConfig.UPDATE_POLICY_PATH,
                StorefrontUpdateContract.policyPayload(
                        context.getPackageName(),
                        BuildConfig.VERSION_CODE,
                        releaseVersionName(),
                        installSource
                ),
                credential,
                false
        );
        if (!response.ok()) return null;
        JSONObject root = new JSONObject(response.body);
        JSONObject policy = root.optJSONObject("policy");
        if (!root.optBoolean("ok", false) || policy == null
                || !context.getPackageName().equals(policy.optString("package_name", ""))
                || policy.optLong("current_version_code", 0) != BuildConfig.VERSION_CODE
                || !releaseVersionName().equals(policy.optString("current_version_name", ""))) return null;
        boolean available = policy.optBoolean("update_available", false);
        boolean required = policy.optBoolean("update_required", false);
        String deliveryMode = clean(policy.optString("delivery_mode", ""));
        String playStoreUrl = clean(policy.optString("play_store_url", ""));
        JSONObject rawArtifact = policy.optJSONObject("artifact");
        UpdateArtifact artifact = rawArtifact == null ? null : updateArtifact(rawArtifact);
        if (!("play_store".equals(deliveryMode) || "private_apk".equals(deliveryMode))
                || required && !available
                || available != (artifact != null)
                || available && artifact.versionCode <= BuildConfig.VERSION_CODE
                || "play_store".equals(deliveryMode) && !expectedPlayStoreUrl(playStoreUrl)
                || "private_apk".equals(deliveryMode) && !playStoreUrl.isEmpty()) return null;
        return new UpdatePolicy(available, required, deliveryMode, playStoreUrl, artifact);
    }

    private UpdateTicket updateTicketInternal(String artifactId) throws Exception {
        String requestedArtifactId = clean(artifactId);
        Result readiness = readiness();
        if (!readiness.ok || !CAMPAIGN_PATTERN.matcher(requestedArtifactId).matches()) return null;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return null;
        HttpResult response = post(
                StorefrontConfig.UPDATE_TICKET_PATH,
                StorefrontUpdateContract.ticketPayload(requestedArtifactId),
                credential,
                false
        );
        if (!response.ok()) return null;
        JSONObject root = new JSONObject(response.body);
        JSONObject rawArtifact = root.optJSONObject("artifact");
        UpdateArtifact artifact = rawArtifact == null ? null : updateArtifact(rawArtifact);
        String ticket = clean(root.optString("ticket", ""));
        String downloadUrl = clean(root.optString("download_url", ""));
        Instant expiresAt;
        try {
            expiresAt = Instant.parse(clean(root.optString("expires_at", "")));
        } catch (RuntimeException error) {
            return null;
        }
        Instant now = Instant.now();
        if (!root.optBoolean("ok", false) || artifact == null
                || !requestedArtifactId.equals(artifact.id)
                || artifact.versionCode <= BuildConfig.VERSION_CODE
                || !context.getPackageName().equals(artifact.packageName)
                || !UPDATE_TICKET_PATTERN.matcher(ticket).matches()
                || !expiresAt.isAfter(now) || expiresAt.isAfter(now.plusSeconds(5 * 60))
                || !StorefrontUpdateContract.allowedDownloadUrl(downloadUrl, StorefrontConfig.storeUrl())) return null;
        return new UpdateTicket(downloadUrl, artifact);
    }

    private UpdateArtifact updateArtifact(JSONObject artifact) {
        String id = clean(artifact.optString("id", ""));
        String fileName = clean(artifact.optString("file_name", ""));
        String sha256 = clean(artifact.optString("sha256", ""));
        long bytes = artifact.optLong("bytes", 0);
        long versionCode = artifact.optLong("version_code", 0);
        String versionName = clean(artifact.optString("version_name", ""));
        String packageName = clean(artifact.optString("package_name", ""));
        return StorefrontUpdateContract.validArtifact(
                id, fileName, sha256, bytes, versionCode, versionName, packageName
        ) ? new UpdateArtifact(id, fileName, sha256, bytes, versionCode, versionName, packageName) : null;
    }

    private boolean expectedPlayStoreUrl(String candidate) {
        return ("https://play.google.com/store/apps/details?id=" + context.getPackageName()).equals(candidate);
    }

    private static String releaseVersionName() {
        return clean(BuildConfig.VERSION_NAME).replaceFirst("-(?:debug|staging)$", "");
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
            String expectedLocation = new URL(StorefrontConfig.storeUrl()).getPath();
            if (status != 303 || !location.startsWith("/t/")
                    || !location.equals(expectedLocation)
                    || !validSessionCookie(cookie)) {
                return Result.fail("El bootstrap no pudo consumirse de forma segura.");
            }
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            cookieManager.setCookie(StorefrontConfig.storeUrl(), cookie);
            cookieManager.flush();
            return Result.ok("Bootstrap consumido una sola vez y sesión WebView instalada.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static boolean validSessionCookie(String rawCookie) {
        String cookie = clean(rawCookie);
        String cookiePair = clean(cookie.split(";", 2)[0]);
        if (!SESSION_COOKIE_PATTERN.matcher(cookiePair).matches()) return false;
        String normalized = cookie.toLowerCase(Locale.ROOT);
        if (!normalized.matches(".*(?:^|;)\\s*path=/\\s*(?:;|$).*")
                || !normalized.matches(".*(?:^|;)\\s*httponly\\s*(?:;|$).*")
                || !normalized.matches(".*(?:^|;)\\s*secure\\s*(?:;|$).*")
                || !normalized.matches(".*(?:^|;)\\s*samesite=lax\\s*(?:;|$).*")) return false;
        Matcher maxAge = SESSION_MAX_AGE_PATTERN.matcher(cookie);
        if (!maxAge.find()) return false;
        try {
            int seconds = Integer.parseInt(maxAge.group(1));
            return seconds > 0 && seconds <= 86_400;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private Result flushEventsInternal() throws Exception {
        Result readiness = readiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");
        java.util.List<StorefrontEventQueue.Event> events = StorefrontEventQueue.pending(context);
        if (events.isEmpty()) return Result.ok("No hay eventos pendientes.");
        String token = appCheckToken(false);
        int accepted = 0;
        for (StorefrontEventQueue.Event event : events) {
            HttpResult response = postWithToken(
                    StorefrontConfig.EVENTS_PATH,
                    StorefrontRegistrationPayload.event(event),
                    credential,
                    token
            );
            boolean recorded = false;
            if (response.ok()) {
                try { recorded = new JSONObject(response.body).optBoolean("ok", false); }
                catch (Exception ignored) {}
            }
            if ("staging".equals(BuildConfig.BUILD_TYPE)) {
                Log.i(
                        ANALYTICS_LOG_TAG,
                        "event=" + event.eventType
                                + " status=" + response.status
                                + " recorded=" + recorded
                );
            }
            if (recorded || response.status == 400 || response.status == 404 || response.status == 409) {
                StorefrontEventQueue.remove(context, event.key());
                if (recorded) accepted += 1;
            } else {
                StorefrontEventQueue.recordAttempt(context, event.key());
            }
        }
        return Result.ok("Eventos aceptados: " + accepted + ".");
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
            return Result.fail("El origen HTTPS de la aplicación no está configurado.");
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
                String safeReason = safeFailure(error);
                logRegistration("operation_failed reason=" + safeReason);
                result = Result.fail(safeReason);
            }
            Result delivered = result;
            MAIN.post(() -> callback.complete(delivered));
        });
    }

    private void executeTarget(TargetCallback callback, TargetOperation operation) {
        EXECUTOR.execute(() -> {
            TargetResult result;
            try {
                result = operation.run();
            } catch (Exception ignored) {
                result = TargetResult.fail();
            }
            TargetResult delivered = result;
            MAIN.post(() -> callback.complete(delivered));
        });
    }

    private void executeUpdatePolicy(UpdatePolicyCallback callback, UpdatePolicyOperation operation) {
        EXECUTOR.execute(() -> {
            UpdatePolicy policy;
            try {
                policy = operation.run();
            } catch (Exception error) {
                logRegistration("update_policy_failed reason=" + safeFailure(error));
                policy = null;
            }
            UpdatePolicy delivered = policy;
            MAIN.post(() -> callback.complete(delivered));
        });
    }

    private void executeUpdateTicket(UpdateTicketCallback callback, UpdateTicketOperation operation) {
        EXECUTOR.execute(() -> {
            UpdateTicket ticket;
            try {
                ticket = operation.run();
            } catch (Exception error) {
                logRegistration("update_ticket_failed reason=" + safeFailure(error));
                ticket = null;
            }
            UpdateTicket delivered = ticket;
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
            return "No fue posible conectar con los servicios de la aplicación.";
        }
        return "La operación falló de forma segura. Revisa la conectividad y la configuración de la aplicación.";
    }

    static boolean shouldRequestMessagingRegistration(RegistrationOrigin origin) {
        return origin != RegistrationOrigin.MESSAGING_CALLBACK;
    }

    static String permissionState(Context context) {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        return StorefrontInstallationStore.wasNotificationPermissionRequested(context)
                ? "denied"
                : "unknown";
    }

    private String permissionState() {
        return permissionState(context);
    }

    private static void logRegistration(String message) {
        if ("staging".equals(BuildConfig.BUILD_TYPE)) Log.i(REGISTRATION_LOG_TAG, message);
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
