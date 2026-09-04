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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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

    interface RealtimeTicketCallback {
        void complete(RealtimeTicket ticket);
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

    static final class RealtimeTicket {
        final String webSocketUrl;
        final String ticket;

        RealtimeTicket(String webSocketUrl, String ticket) {
            this.webSocketUrl = webSocketUrl;
            this.ticket = ticket;
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

    private interface RealtimeTicketOperation {
        RealtimeTicket run() throws Exception;
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
    private static final Pattern REALTIME_TICKET_PATTERN = Pattern.compile(
            "^pzrt_v1\\.[a-f0-9]{64}\\.[0-9]{10}\\.[0-9]{10}\\."
                    + "[A-Za-z0-9]{32}\\.[a-f0-9]{64}$"
    );
    private static final Set<String> NOTIFICATION_SYNC_TRIGGERS = Set.of(
            StorefrontNotificationStore.TRIGGER_WEBSOCKET_SYNC,
            StorefrontNotificationStore.TRIGGER_FOREGROUND_POLL,
            StorefrontNotificationStore.TRIGGER_RESUME_SYNC,
            StorefrontNotificationStore.TRIGGER_WORKMANAGER
    );
    private static final int RESPONSE_LIMIT = 65_536;
    private static final long APP_SET_TIMEOUT_SECONDS = 5;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final ExecutorService FIREBASE_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final ExecutorService DIAGNOSTICS_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean FIREBASE_ENRICHMENT_ACTIVE = new AtomicBoolean(false);
    private static final AtomicBoolean DIAGNOSTICS_UPLOAD_ACTIVE = new AtomicBoolean(false);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private final Context context;

    StorefrontRegistrationClient(Context context) {
        this.context = context.getApplicationContext();
    }

    void register(Callback callback) {
        executeCoreRegistration(callback, RegistrationOrigin.USER_ACTION);
    }

    void syncFromAppStart(Callback callback) {
        executeCoreRegistration(callback, RegistrationOrigin.APP_START);
    }

    void registerFromMessagingCallback(Callback callback) {
        executeCoreRegistration(callback, RegistrationOrigin.MESSAGING_CALLBACK);
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
            return registerFirebaseInternal(true, RegistrationOrigin.USER_ACTION);
        });
    }

    void heartbeat(Callback callback) {
        execute(callback, () -> {
            Result result = authenticatedPost(
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
            );
            if (result.ok) StorefrontInstallationStore.recordSuccessfulSync(context, Instant.now().toString());
            return result;
        });
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

    void flushDiagnostics(Callback callback) {
        execute(callback, this::flushDiagnosticsInternal);
    }

    void syncNotifications(String deliveryTrigger, Callback callback) {
        execute(callback, () -> syncNotificationsInternal(deliveryTrigger));
    }

    void flushNotificationReceipts(Callback callback) {
        execute(callback, this::flushNotificationReceiptsInternal);
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

    void requestRealtimeTicket(RealtimeTicketCallback callback) {
        executeRealtimeTicket(callback, this::realtimeTicketInternal);
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

    private void executeCoreRegistration(Callback callback, RegistrationOrigin origin) {
        execute(callback, () -> {
            Result core = registerCoreInternal();
            if (core.ok) {
                scheduleFirebaseEnrichment(origin);
                scheduleDiagnosticsUpload();
            }
            return core;
        });
    }

    private void scheduleFirebaseEnrichment(RegistrationOrigin origin) {
        if (!BuildConfig.FIREBASE_CONFIGURED
                || !FIREBASE_ENRICHMENT_ACTIVE.compareAndSet(false, true)) return;
        FIREBASE_EXECUTOR.execute(() -> {
            try {
                registerFirebaseInternal(false, origin);
            } catch (Exception error) {
                StorefrontDiagnostics.recordError(context, failureCode(error));
                logRegistration("firebase_enrichment_pending reason=" + failureCode(error));
            } finally {
                FIREBASE_ENRICHMENT_ACTIVE.set(false);
            }
        });
    }

    private void scheduleDiagnosticsUpload() {
        if (!DIAGNOSTICS_UPLOAD_ACTIVE.compareAndSet(false, true)) return;
        DIAGNOSTICS_EXECUTOR.execute(() -> {
            try {
                flushDiagnosticsInternal();
            } catch (Exception error) {
                logRegistration("diagnostics_pending reason=" + failureCode(error));
            } finally {
                DIAGNOSTICS_UPLOAD_ACTIVE.set(false);
            }
        });
    }

    private Result registerCoreInternal() throws Exception {
        Result readiness = coreReadiness();
        if (!readiness.ok) return readiness;
        String permission = permissionState();
        String body = StorefrontRegistrationPayload.coreRegister(
                StorefrontInstallationStore.installationId(context),
                StorefrontConfig.appKey(),
                BuildConfig.VERSION_NAME,
                BuildConfig.VERSION_CODE,
                androidVersion(),
                deviceModel(),
                locale(),
                timezone(),
                permission
        );
        String existingCredential = StorefrontInstallationStore.credential(context);
        StorefrontDiagnostics.record(
                context,
                StorefrontDiagnostics.INSTALLATION_REGISTER_REQUEST_SENT,
                "started",
                "",
                0,
                0
        );
        long startedAt = System.nanoTime();
        HttpResult response;
        try {
            response = post(StorefrontConfig.CORE_REGISTER_PATH, body, existingCredential, false);
            if (!existingCredential.isEmpty()
                    && response.status == HttpURLConnection.HTTP_UNAUTHORIZED
                    && "invalid_credential".equals(response.errorCode())) {
                StorefrontInstallationStore.clearCredential(context);
                response = post(StorefrontConfig.CORE_REGISTER_PATH, body, "", false);
            }
        } catch (Exception error) {
            long latency = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
            StorefrontDiagnostics.record(
                    context,
                    StorefrontDiagnostics.BACKEND_REACHABLE,
                    "failure",
                    failureCode(error),
                    0,
                    latency
            );
            StorefrontDiagnostics.record(
                    context,
                    StorefrontDiagnostics.INSTALLATION_REGISTER_RESPONSE,
                    "failure",
                    failureCode(error),
                    0,
                    latency
            );
            throw error;
        }
        long latency = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - startedAt);
        StorefrontDiagnostics.record(
                context,
                StorefrontDiagnostics.BACKEND_REACHABLE,
                "success",
                "",
                response.status,
                latency
        );
        if (!response.ok()) {
            Result rejected = failure(response);
            StorefrontDiagnostics.record(
                    context,
                    StorefrontDiagnostics.INSTALLATION_REGISTER_RESPONSE,
                    "failure",
                    response.errorCode(),
                    response.status,
                    latency
            );
            return rejected;
        }

        JSONObject payload = new JSONObject(response.body);
        String credential = payload.optString("credential", "");
        if (!hasExactKeys(payload, Set.of(
                "ok", "created", "credential", "firebase_enrichment_required"
        )) || !payload.optBoolean("ok", false)
                || !CREDENTIAL_PATTERN.matcher(credential).matches()) {
            StorefrontDiagnostics.record(
                    context,
                    StorefrontDiagnostics.INSTALLATION_REGISTER_RESPONSE,
                    "failure",
                    "invalid_gateway_response",
                    response.status,
                    latency
            );
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        StorefrontInstallationStore.saveCredential(context, credential);
        StorefrontInstallationStore.recordReportedPermission(context, permission);
        StorefrontInstallationStore.recordSuccessfulSync(context, Instant.now().toString());
        StorefrontDiagnostics.record(
                context,
                StorefrontDiagnostics.INSTALLATION_REGISTER_RESPONSE,
                "success",
                "",
                response.status,
                latency
        );
        return payload.optBoolean("created", false)
                ? Result.ok("Instalación registrada correctamente.")
                : Result.ok("Instalación sincronizada correctamente.");
    }

    private Result registerFirebaseInternal(
            boolean forceAppCheckRefresh,
            RegistrationOrigin origin
    ) throws Exception {
        logRegistration(
                "register_start origin=" + origin.name().toLowerCase(Locale.ROOT)
                        + " credential_present=" + StorefrontInstallationStore.hasCredential(context)
        );
        Result readiness = firebaseReadiness();
        if (!readiness.ok) {
            logRegistration("register_readiness_failed");
            return readiness;
        }

        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(true);
        if (shouldRequestMessagingRegistration(origin)) {
            Tasks.await(messaging.register(), 30, TimeUnit.SECONDS);
            StorefrontDiagnostics.record(
                    context,
                    StorefrontDiagnostics.FCM_TOKEN_CREATED,
                    "success",
                    "",
                    0,
                    0
            );
        }
        String fid = Tasks.await(FirebaseInstallations.getInstance().getId(), 30, TimeUnit.SECONDS);
        StorefrontDiagnostics.record(
                context,
                StorefrontDiagnostics.FID_CREATED,
                "success",
                "",
                0,
                0
        );
        AppSetIdInfo appSetInfo = null;
        try {
            appSetInfo = Tasks.await(
                    AppSet.getClient(context).getAppSetIdInfo(),
                    APP_SET_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS
            );
        } catch (Exception ignored) {
            // App Set ID mejora la correlación antifraude, pero no es un requisito de FCM.
        }
        String appSetId = clean(appSetInfo == null ? "" : appSetInfo.getId());
        if (!StorefrontRegistrationPayload.validOptionalAppSetId(appSetId)) appSetId = "";
        logRegistration(
                "register_identifiers_ready app_set_scope="
                        + (appSetInfo == null || appSetId.isEmpty()
                            ? "unavailable"
                            : String.valueOf(appSetInfo.getScope()))
        );
        String body = StorefrontRegistrationPayload.firebaseEnrichment(fid, appSetId);
        String existingCredential = StorefrontInstallationStore.credential(context);
        if (existingCredential.isEmpty()) return Result.fail("Primero registra la instalación.");
        HttpResult response = post(
                StorefrontConfig.FIREBASE_ENRICH_PATH,
                body,
                existingCredential,
                false
        );
        logRegistration("register_http_status=" + response.status);
        if (!response.ok()) {
            Result rejected = failure(response);
            logRegistration("register_rejected reason=" + rejected.message);
            return rejected;
        }

        JSONObject payload = new JSONObject(response.body);
        String credential = payload.optString("credential", "");
        if (!hasExactKeys(payload, Set.of(
                "ok", "firebase_registered", "fid_rotated", "credential"
        )) || !payload.optBoolean("ok", false)
                || !payload.optBoolean("firebase_registered", false)
                || !existingCredential.equals(credential)) {
            logRegistration("register_invalid_response");
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        boolean rotated = payload.optBoolean("fid_rotated", false);
        scheduleFirebaseTrustUpgrade(body, existingCredential, forceAppCheckRefresh);
        logRegistration("register_accepted fid_rotated=" + rotated);
        if (rotated) return Result.ok("FID rotado y registro actualizado sin exponer identificadores.");
        return Result.ok("Firebase quedó asociado como canal opcional.");
    }

    private void scheduleFirebaseTrustUpgrade(
            String body,
            String credential,
            boolean forceAppCheckRefresh
    ) {
        FIREBASE_EXECUTOR.execute(() -> {
            try {
                String token = appCheckToken(forceAppCheckRefresh);
                HttpResult response = postWithToken(
                        StorefrontConfig.FIREBASE_ENRICH_PATH,
                        body,
                        credential,
                        token
                );
                if (!response.ok()) return;
                JSONObject payload = new JSONObject(response.body);
                if (!hasExactKeys(payload, Set.of(
                        "ok", "firebase_registered", "fid_rotated", "credential"
                )) || !payload.optBoolean("ok", false)
                        || !payload.optBoolean("firebase_registered", false)
                        || !credential.equals(payload.optString("credential", ""))) return;
                logRegistration("register_app_check_ok");
            } catch (Exception error) {
                StorefrontDiagnostics.recordError(context, failureCode(error));
                logRegistration("firebase_attestation_optional reason=" + failureCode(error));
            }
        });
    }

    private Result authenticatedPost(String path, String body, String successMessage) throws Exception {
        Result readiness = coreReadiness();
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
        Result readiness = coreReadiness();
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
        Result readiness = coreReadiness();
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
        Result readiness = coreReadiness();
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
        Result readiness = coreReadiness();
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

    private RealtimeTicket realtimeTicketInternal() throws Exception {
        Result readiness = coreReadiness();
        if (!readiness.ok) return null;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return null;
        HttpResult response = post(
                StorefrontConfig.REALTIME_TICKET_PATH,
                StorefrontRegistrationPayload.empty(),
                credential,
                false
        );
        if (!response.ok()) return null;
        JSONObject root = new JSONObject(response.body);
        if (!hasExactKeys(root, Set.of("ok", "ticket", "expires_at", "websocket_url"))
                || !root.optBoolean("ok", false)) return null;
        String ticket = root.optString("ticket", "");
        String webSocketUrl = StorefrontConfig.normalizeWebSocketUrl(
                root.optString("websocket_url", "")
        );
        try {
            Instant.parse(root.optString("expires_at", ""));
        } catch (RuntimeException ignored) {
            return null;
        }
        if (!REALTIME_TICKET_PATTERN.matcher(ticket).matches() || webSocketUrl.isEmpty()) return null;
        return new RealtimeTicket(webSocketUrl, ticket);
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
        Result readiness = coreReadiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");
        java.util.List<StorefrontEventQueue.Event> events = StorefrontEventQueue.pending(context);
        if (events.isEmpty()) return Result.ok("No hay eventos pendientes.");
        int accepted = 0;
        for (StorefrontEventQueue.Event event : events) {
            HttpResult response = post(
                    StorefrontConfig.EVENTS_PATH,
                    StorefrontRegistrationPayload.event(event),
                    credential,
                    false
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
        return postRequest(path, body, credential, "");
    }

    private HttpResult postWithToken(
            String path,
            String body,
            String credential,
            String token
    ) throws Exception {
        if (token.length() < 32 || token.length() > 8192) {
            throw new IllegalStateException("app_check_unavailable");
        }
        return postRequest(path, body, credential, token);
    }

    private Result flushDiagnosticsInternal() throws Exception {
        Result readiness = coreReadiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");
        StorefrontDiagnostics.Batch batch = StorefrontDiagnostics.pendingBatch(context);
        if (batch.count < 1) return Result.ok("No hay diagnósticos pendientes.");
        HttpResult response = post(
                StorefrontConfig.DIAGNOSTICS_PATH,
                batch.body,
                credential,
                false
        );
        if (!response.ok()) return failure(response);
        JSONObject result = new JSONObject(response.body);
        int processed = result.optInt("accepted", -1) + result.optInt("duplicates", -1);
        if (!result.optBoolean("ok", false) || processed != batch.count) {
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        StorefrontDiagnostics.acknowledge(context, batch.keys);
        return Result.ok("Diagnósticos sincronizados.");
    }

    private Result syncNotificationsInternal(String deliveryTrigger) throws Exception {
        if (!NOTIFICATION_SYNC_TRIGGERS.contains(deliveryTrigger)) {
            return Result.fail("El origen de sincronización no es válido.");
        }
        Result readiness = coreReadiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");
        HttpResult response = post(
                StorefrontConfig.NOTIFICATIONS_SYNC_PATH,
                StorefrontRegistrationPayload.empty(),
                credential,
                false
        );
        if (!response.ok()) return failure(response);
        JSONObject body = new JSONObject(response.body);
        if (!hasExactKeys(body, Set.of("ok", "notifications", "server_time"))
                || !body.optBoolean("ok", false)) {
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        Instant serverTime;
        try { serverTime = Instant.parse(body.optString("server_time", "")); }
        catch (Exception ignored) { return Result.fail("El gateway devolvió una respuesta no válida."); }
        JSONArray notifications = body.optJSONArray("notifications");
        if (notifications == null || notifications.length() > 50) {
            return Result.fail("El gateway devolvió una respuesta no válida.");
        }
        int delivered = 0;
        for (int index = 0; index < notifications.length(); index += 1) {
            JSONObject item = notifications.optJSONObject(index);
            StorefrontPushPayload payload = StorefrontPushPayload.fromNativeJson(
                    item,
                    StorefrontConfig.appKey()
            );
            if (payload == null) return Result.fail("El gateway devolvió una notificación no válida.");
            try {
                if (!Instant.parse(item.optString("expires_at", "")).isAfter(serverTime)) continue;
            } catch (Exception ignored) {
                return Result.fail("El gateway devolvió una notificación no válida.");
            }
            if (StorefrontNotificationStore.wasDisplayed(context, payload.deliveryId)) {
                StorefrontNotificationStore.queueReceipt(
                        context,
                        payload.deliveryId,
                        "native_delivered",
                        deliveryTrigger
                );
                continue;
            }
            boolean posted = StorefrontNotifications.show(context, payload, payload.title, payload.body);
            if (!posted) continue;
            StorefrontNotificationStore.markDisplayed(context, payload.deliveryId);
            StorefrontNotificationStore.queueReceipt(
                    context,
                    payload.deliveryId,
                    "native_delivered",
                    deliveryTrigger
            );
            delivered += 1;
        }
        if (delivered > 0) {
            StorefrontDiagnostics.record(
                    context,
                    StorefrontDiagnostics.LAST_PUSH_RECEIVED,
                    "success",
                    "",
                    response.status,
                    0
            );
        }
        Result receipts = flushNotificationReceiptsInternal();
        if (!receipts.ok) return receipts;
        StorefrontInstallationStore.recordSuccessfulSync(context, Instant.now().toString());
        return Result.ok("Notificaciones nuevas: " + delivered + ".");
    }

    private Result flushNotificationReceiptsInternal() throws Exception {
        Result readiness = coreReadiness();
        if (!readiness.ok) return readiness;
        String credential = StorefrontInstallationStore.credential(context);
        if (credential.isEmpty()) return Result.fail("Primero registra la instalación.");
        int synchronizedCount = 0;
        for (int page = 0; page < 5; page += 1) {
            StorefrontNotificationStore.ReceiptBatch batch = StorefrontNotificationStore.pendingBatch(context);
            if (batch.count < 1) break;
            HttpResult response = post(
                    StorefrontConfig.NOTIFICATIONS_ACK_PATH,
                    batch.body,
                    credential,
                    false
            );
            if (!response.ok()) return failure(response);
            JSONObject body = new JSONObject(response.body);
            if (!hasExactKeys(body, Set.of("accepted", "duplicates", "ok"))
                    || !body.optBoolean("ok", false)) {
                return Result.fail("El gateway devolvió una respuesta no válida.");
            }
            int accepted = body.optInt("accepted", -1);
            int duplicates = body.optInt("duplicates", -1);
            if (accepted < 0 || duplicates < 0 || accepted + duplicates != batch.count) {
                return Result.fail("El gateway devolvió una respuesta no válida.");
            }
            StorefrontNotificationStore.acknowledge(context, batch.keys);
            synchronizedCount += batch.count;
        }
        return Result.ok("Confirmaciones sincronizadas: " + synchronizedCount + ".");
    }

    Result runDurableBackgroundSync() {
        try {
            Result core = registerCoreInternal();
            if (!core.ok) return core;
            Result notifications = syncNotificationsInternal(
                    StorefrontNotificationStore.TRIGGER_WORKMANAGER
            );
            try { flushDiagnosticsInternal(); } catch (Exception ignored) {}
            return notifications;
        } catch (Exception error) {
            StorefrontDiagnostics.recordError(context, failureCode(error));
            return Result.fail(safeFailure(error));
        }
    }

    private HttpResult postRequest(
            String path,
            String body,
            String credential,
            String token
    ) throws Exception {
        String endpoint = StorefrontConfig.endpoint(path);
        if (endpoint.isEmpty()) throw new IllegalStateException("api_not_configured");

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
            if (!token.isEmpty()) connection.setRequestProperty("X-Firebase-AppCheck", token);
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

    private Result firebaseReadiness() {
        if (!BuildConfig.FIREBASE_CONFIGURED) {
            return Result.fail("Firebase no está configurado en esta APK.");
        }
        return coreReadiness();
    }

    private static boolean hasExactKeys(JSONObject source, Set<String> expected) {
        if (source == null || source.length() != expected.size()) return false;
        Set<String> actual = new HashSet<>();
        source.keys().forEachRemaining(actual::add);
        return actual.equals(expected);
    }

    private Result coreReadiness() {
        if (StorefrontConfig.apiBaseUrl().isEmpty()) {
            return Result.fail("El origen HTTPS de la aplicación no está configurado.");
        }
        if (!StorefrontConfig.isConfigured()) {
            return Result.fail("La identidad pública de la aplicación no está configurada.");
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

    private static String failureCode(Throwable error) {
        String material = failureMaterial(error);
        if (material.contains("appcheck") || material.contains("app_check")
                || material.contains("playintegrity") || material.contains("attestation")
                || material.contains("attest") || material.contains("integrity")) {
            return "app_check_unavailable";
        }
        if (material.contains("firebaseinstallations") || material.contains("firebasemessaging")
                || material.contains("service_not_available")) return "firebase_unavailable";
        if (material.contains("unknownhost")) return "dns_unavailable";
        if (material.contains("ssl") || material.contains("certificate")) return "https_unavailable";
        if (material.contains("connectexception") || material.contains("sockettimeoutexception")) {
            return "backend_unreachable";
        }
        return "operation_failed";
    }

    private static String failureMaterial(Throwable error) {
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
        return diagnostic.toString().toLowerCase(Locale.ROOT);
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
                StorefrontDiagnostics.recordError(context, failureCode(error));
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

    private void executeRealtimeTicket(
            RealtimeTicketCallback callback,
            RealtimeTicketOperation operation
    ) {
        EXECUTOR.execute(() -> {
            RealtimeTicket ticket;
            try {
                ticket = operation.run();
            } catch (Exception error) {
                logRegistration("realtime_ticket_failed reason=" + safeFailure(error));
                ticket = null;
            }
            RealtimeTicket delivered = ticket;
            MAIN.post(() -> callback.complete(delivered));
        });
    }

    static String safeFailure(Throwable error) {
        String material = failureMaterial(error);
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
        Log.i(REGISTRATION_LOG_TAG, message);
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

        String errorCode() {
            try {
                String candidate = new JSONObject(body).optString("error", "");
                return SAFE_ERROR.matcher(candidate).matches() ? candidate : "request_failed";
            } catch (Exception ignored) {
                return "request_failed";
            }
        }
    }
}
