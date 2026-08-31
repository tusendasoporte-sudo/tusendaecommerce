package com.tusenda84.storefront;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class StorefrontActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 601;
    private static final String ANALYTICS_LOG_TAG = "PZStorefrontAnalytics";

    private StorefrontRegistrationClient client;
    private WebView webView;
    private ProgressBar progressBar;
    private View splashView;
    private View offlineView;
    private TextView offlineTitle;
    private TextView offlineMessage;
    private View permissionCard;
    private TextView permissionMessage;
    private Button permissionAction;
    private boolean pageReady;
    private boolean registrationSyncInFlight;
    private boolean permissionSyncInFlight;
    private boolean sessionRefreshInFlight;
    private boolean updateCheckInFlight;
    private boolean updateDownloadInFlight;
    private boolean updatePromptVisible;
    private boolean initialNavigationDone;
    private boolean splashHidden;
    private long lastOptionalUpdateCode;
    private AlertDialog updateDialog;
    private File pendingVerifiedUpdate;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private int pushResolutionGeneration;
    private int pageLoadGeneration;
    private String pendingDeliveryId = "";
    private String pendingDestinationUrl = "";
    private String pendingReportedPath = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_Storefront);
        super.onCreate(savedInstanceState);
        configureWindow();
        setContentView(R.layout.activity_storefront);
        bindViews();
        configureInsets();
        configureWebView();
        configureBackNavigation();
        StorefrontNotifications.createChannels(this);
        client = new StorefrontRegistrationClient(this);

        findViewById(R.id.storefront_retry).setOnClickListener(view -> retry());
        findViewById(R.id.storefront_home).setOnClickListener(view -> openStoreHome());
        permissionAction.setOnClickListener(view -> handleNotificationAction());

        if (!StorefrontConfig.isConfigured()) {
            showError(
                    getString(R.string.configuration_error_title),
                    getString(R.string.configuration_error_message)
            );
            return;
        }

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            beginInitialNavigation(getIntent());
        } else {
            initialNavigationDone = true;
            syncInstallation();
            flushEvents();
            webView.post(() -> hideSplashAfterDraw(webView));
        }
    }

    private void configureWindow() {
        Window window = getWindow();
        window.setStatusBarColor(getColor(R.color.pz_brand_base_background));
        window.setNavigationBarColor(getColor(R.color.pz_brand_base_background));
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
    }

    private void bindViews() {
        webView = findViewById(R.id.storefront_webview);
        progressBar = findViewById(R.id.storefront_progress);
        splashView = findViewById(R.id.storefront_splash);
        offlineView = findViewById(R.id.storefront_offline);
        offlineTitle = findViewById(R.id.storefront_offline_title);
        offlineMessage = findViewById(R.id.storefront_offline_message);
        permissionCard = findViewById(R.id.notification_permission_card);
        permissionMessage = findViewById(R.id.notification_permission_message);
        permissionAction = findViewById(R.id.notification_permission_action);
    }

    private void configureInsets() {
        if (Build.VERSION.SDK_INT < 35) return;
        getWindow().setDecorFitsSystemWindows(false);
        View root = findViewById(R.id.storefront_root);
        root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
            Insets systemBars = windowInsets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
            );
            Insets keyboard = windowInsets.getInsets(WindowInsets.Type.ime());
            view.setPadding(
                    systemBars.left,
                    systemBars.top,
                    systemBars.right,
                    Math.max(systemBars.bottom, keyboard.bottom)
            );
            return windowInsets;
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setGeolocationEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setSafeBrowsingEnabled(true);
        settings.setSaveFormData(false);
        settings.setUserAgentString(
                settings.getUserAgentString()
                        + " TuSenda84Storefront/"
                        + BuildConfig.VERSION_NAME
                        + " ("
                        + StorefrontConfig.storeKey()
                        + ")"
        );

        webView.setWebViewClient(new StorefrontWebViewClient());
        webView.setWebChromeClient(new StorefrontWebChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (StorefrontDeepLink.classifyNavigation(url, StorefrontConfig.storeUrl())
                    == StorefrontDeepLink.NavigationDecision.INTERNAL) {
                openExternal(Uri.parse(url));
            } else {
                Toast.makeText(this, R.string.downloads_blocked, Toast.LENGTH_LONG).show();
            }
        });
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
    }

    private void syncInstallation() {
        if (registrationSyncInFlight
                || !BuildConfig.FIREBASE_CONFIGURED
                || StorefrontConfig.apiBaseUrl().isEmpty()) {
            updateNotificationCard();
            return;
        }
        registrationSyncInFlight = true;
        client.syncFromAppStart(result -> {
            registrationSyncInFlight = false;
            updateNotificationCard();
            if (result.ok) {
                refreshWebSession(null);
                checkForUpdates();
            }
        });
    }

    private void beginInitialNavigation(Intent intent) {
        new Handler(Looper.getMainLooper()).postDelayed(() -> completeInitialNavigation(intent), 4_000);
        if (!BuildConfig.FIREBASE_CONFIGURED || StorefrontConfig.apiBaseUrl().isEmpty()) {
            completeInitialNavigation(intent);
            return;
        }
        registrationSyncInFlight = true;
        client.syncFromAppStart(result -> {
            registrationSyncInFlight = false;
            updateNotificationCard();
            if (!result.ok) {
                completeInitialNavigation(intent);
                return;
            }
            checkForUpdates();
            refreshWebSession(sessionResult -> completeInitialNavigation(intent));
        });
    }

    private void checkForUpdates() {
        if (client == null || updateCheckInFlight || updateDownloadInFlight || updatePromptVisible
                || !"release".equals(BuildConfig.BUILD_TYPE)
                || !BuildConfig.FIREBASE_CONFIGURED
                || !StorefrontInstallationStore.hasCredential(this)) return;
        updateCheckInFlight = true;
        client.checkForUpdate(installSource(), policy -> {
            updateCheckInFlight = false;
            if (policy == null || !policy.available || policy.artifact == null
                    || isFinishing() || isDestroyed()) return;
            if (!policy.required && policy.artifact.versionCode <= lastOptionalUpdateCode) return;
            showUpdatePrompt(policy);
        });
    }

    private String installSource() {
        String installer = "";
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                installer = getPackageManager().getInstallSourceInfo(getPackageName()).getInstallingPackageName();
            } else {
                installer = getPackageManager().getInstallerPackageName(getPackageName());
            }
        } catch (Exception ignored) {}
        return "com.android.vending".equals(installer) ? "play" : "direct";
    }

    private void showUpdatePrompt(StorefrontRegistrationClient.UpdatePolicy policy) {
        if (updatePromptVisible || isFinishing() || isDestroyed()) return;
        updatePromptVisible = true;
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(policy.required ? R.string.update_required_title : R.string.update_available_title)
                .setMessage(getString(
                        policy.required ? R.string.update_required_message : R.string.update_available_message,
                        policy.artifact.versionName
                ))
                .setPositiveButton(R.string.update_now, null)
                .setCancelable(!policy.required);
        if (!policy.required) {
            builder.setNegativeButton(R.string.update_later, (dialog, which) -> {
                lastOptionalUpdateCode = policy.artifact.versionCode;
                dialog.dismiss();
            });
        }
        updateDialog = builder.create();
        updateDialog.setCanceledOnTouchOutside(false);
        updateDialog.setOnDismissListener(dialog -> {
            updatePromptVisible = false;
            updateDialog = null;
        });
        updateDialog.setOnShowListener(dialog -> updateDialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> beginUpdate(policy)));
        updateDialog.show();
    }

    private void beginUpdate(StorefrontRegistrationClient.UpdatePolicy policy) {
        if (updateDownloadInFlight) return;
        if ("play_store".equals(policy.deliveryMode)) {
            if (!policy.required && updateDialog != null) updateDialog.dismiss();
            openExternal(Uri.parse(policy.playStoreUrl));
            return;
        }
        if (!"private_apk".equals(policy.deliveryMode) || policy.artifact == null) {
            showUpdateFailure();
            return;
        }
        updateDownloadInFlight = true;
        if (updateDialog != null) {
            updateDialog.setCancelable(false);
            updateDialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
            Button later = updateDialog.getButton(AlertDialog.BUTTON_NEGATIVE);
            if (later != null) later.setEnabled(false);
        }
        Toast.makeText(this, R.string.update_downloading, Toast.LENGTH_SHORT).show();
        client.requestUpdateTicket(policy.artifact.id, ticket -> {
            if (ticket == null || !sameArtifact(policy.artifact, ticket.artifact)) {
                updateDownloadInFlight = false;
                showUpdateFailure();
                return;
            }
            downloadVerifiedUpdate(ticket);
        });
    }

    private static boolean sameArtifact(
            StorefrontRegistrationClient.UpdateArtifact expected,
            StorefrontRegistrationClient.UpdateArtifact actual
    ) {
        return expected != null && actual != null
                && expected.id.equals(actual.id)
                && expected.sha256.equalsIgnoreCase(actual.sha256)
                && expected.bytes == actual.bytes
                && expected.versionCode == actual.versionCode
                && expected.packageName.equals(actual.packageName);
    }

    private void downloadVerifiedUpdate(StorefrontRegistrationClient.UpdateTicket ticket) {
        updateExecutor.execute(() -> {
            File output = null;
            HttpURLConnection connection = null;
            try {
                File directory = new File(getCacheDir(), "storefront-updates");
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("update_directory_failed");
                }
                File[] previous = directory.listFiles((parent, name) -> name.matches("storefront-[0-9]+\\.apk"));
                if (previous != null) for (File file : previous) if (!file.delete()) {
                    throw new IllegalStateException("update_cleanup_failed");
                }
                output = new File(directory, "storefront-" + ticket.artifact.versionCode + ".apk");
                connection = (HttpURLConnection) new URL(ticket.downloadUrl).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(15_000);
                connection.setReadTimeout(120_000);
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                connection.setRequestProperty("Cache-Control", "no-store");
                int responseCode = connection.getResponseCode();
                long declaredLength = connection.getContentLengthLong();
                if (responseCode != HttpURLConnection.HTTP_OK
                        || declaredLength > StorefrontUpdateContract.MAX_APK_BYTES
                        || declaredLength >= 0 && declaredLength != ticket.artifact.bytes) {
                    throw new IllegalStateException("update_download_denied");
                }
                long total = 0;
                byte[] buffer = new byte[64 * 1024];
                try (InputStream input = connection.getInputStream();
                     FileOutputStream file = new FileOutputStream(output)) {
                    int read;
                    while ((read = input.read(buffer)) >= 0) {
                        if (read == 0) continue;
                        total += read;
                        if (total > StorefrontUpdateContract.MAX_APK_BYTES
                                || total > ticket.artifact.bytes) {
                            throw new IllegalStateException("update_too_large");
                        }
                        file.write(buffer, 0, read);
                    }
                    file.getFD().sync();
                }
                if (total != ticket.artifact.bytes) throw new IllegalStateException("update_size_mismatch");
                StorefrontApkVerifier.verify(
                        this,
                        output,
                        ticket.artifact.sha256,
                        ticket.artifact.versionCode,
                        ticket.artifact.packageName
                );
                client.reportUpdateVerified(ticket.artifact, result -> {
                    // La telemetría es deliberadamente no bloqueante: Android puede instalar aunque falle el reporte.
                });
                File verified = output;
                runOnUiThread(() -> {
                    updateDownloadInFlight = false;
                    if (updateDialog != null) updateDialog.dismiss();
                    openVerifiedUpdate(verified);
                });
            } catch (Exception error) {
                if (output != null && output.exists()) output.delete();
                runOnUiThread(() -> {
                    updateDownloadInFlight = false;
                    showUpdateFailure();
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void showUpdateFailure() {
        Toast.makeText(this, R.string.update_verification_failed, Toast.LENGTH_LONG).show();
        if (updateDialog != null) {
            Button update = updateDialog.getButton(AlertDialog.BUTTON_POSITIVE);
            if (update != null) update.setEnabled(true);
            Button later = updateDialog.getButton(AlertDialog.BUTTON_NEGATIVE);
            updateDialog.setCancelable(later != null);
            if (later != null) later.setEnabled(true);
        }
    }

    private void openVerifiedUpdate(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingVerifiedUpdate = apk;
            Toast.makeText(this, R.string.update_allow_installs, Toast.LENGTH_LONG).show();
            try {
                startActivity(new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + getPackageName())
                ));
            } catch (ActivityNotFoundException error) {
                pendingVerifiedUpdate = null;
                if (apk.exists()) apk.delete();
                Toast.makeText(this, R.string.update_installer_unavailable, Toast.LENGTH_LONG).show();
            }
            return;
        }
        pendingVerifiedUpdate = null;
        try {
            Uri content = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".storefront_update_files",
                    apk
            );
            Intent install = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(content, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (RuntimeException error) {
            if (apk.exists()) apk.delete();
            Toast.makeText(this, R.string.update_installer_unavailable, Toast.LENGTH_LONG).show();
        }
    }

    private void completeInitialNavigation(Intent intent) {
        if (initialNavigationDone || isFinishing() || isDestroyed()) return;
        initialNavigationDone = true;
        if (!openPushTarget(intent) && !openAppLink(intent)) openStoreHome();
        flushEvents();
    }

    private boolean openAppLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) return false;
        String target = intent.getData().toString();
        if (!StorefrontDeepLink.isAllowedInternalNavigation(target, StorefrontConfig.storeUrl())) return false;
        openInternalUrl(target);
        return true;
    }

    private void refreshWebSession(StorefrontRegistrationClient.Callback callback) {
        if (sessionRefreshInFlight || client == null
                || !StorefrontInstallationStore.hasCredential(this)) {
            if (callback != null) callback.complete(StorefrontRegistrationClient.Result.fail("session_unavailable"));
            return;
        }
        sessionRefreshInFlight = true;
        client.bootstrap(result -> {
            sessionRefreshInFlight = false;
            if (callback != null) callback.complete(result);
        });
    }

    private void flushEvents() {
        if (client == null || !StorefrontInstallationStore.hasCredential(this)) return;
        client.flushEvents(result -> logAnalytics(
                result.ok ? "analytics_flush_ok: " + result.message : "analytics_flush_failed"
        ));
    }

    private void syncPermissionIfChanged() {
        if (permissionSyncInFlight
                || client == null
                || !StorefrontInstallationStore.hasCredential(this)) {
            return;
        }
        String current = StorefrontRegistrationClient.permissionState(this);
        if (current.equals(StorefrontInstallationStore.lastReportedPermission(this))) return;
        permissionSyncInFlight = true;
        client.updatePermission(result -> {
            permissionSyncInFlight = false;
            updateNotificationCard();
        });
    }

    private void handleNotificationAction() {
        if (Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            updateNotificationCard();
            syncPermissionIfChanged();
            return;
        }
        if (StorefrontInstallationStore.wasNotificationPermissionRequested(this)) {
            openNotificationSettings();
            return;
        }
        StorefrontInstallationStore.markNotificationPermissionRequested(this);
        requestPermissions(
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST
        );
    }

    private void updateNotificationCard() {
        if (permissionCard == null
                || !pageReady
                || (!BuildConfig.FIREBASE_CONFIGURED && !BuildConfig.DEBUG)
                || Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            if (permissionCard != null) permissionCard.setVisibility(View.GONE);
            return;
        }
        boolean requested = StorefrontInstallationStore.wasNotificationPermissionRequested(this);
        permissionMessage.setText(requested
                ? R.string.notification_card_denied
                : R.string.notification_card_prompt);
        permissionAction.setText(requested
                ? R.string.notification_open_settings
                : R.string.notification_enable);
        permissionCard.setVisibility(View.VISIBLE);
    }

    private void openNotificationSettings() {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + getPackageName()));
            startActivity(fallback);
        }
    }

    private StorefrontPushPayload pushPayload(Intent intent) {
        return StorefrontPushPayload.fromIntent(intent, StorefrontConfig.appKey());
    }

    private boolean openPushTarget(Intent intent) {
        StorefrontPushPayload payload = pushPayload(intent);
        if (payload == null) return false;
        boolean explicitTap = StorefrontNotifications.isNotificationTap(intent);
        intent.removeExtra(StorefrontNotifications.NOTIFICATION_TAP);
        clearPendingDestination();
        if (explicitTap) {
            StorefrontEventQueue.enqueue(this, "opened", payload.deliveryId, "");
            flushEvents();
        }
        int generation = ++pushResolutionGeneration;
        if ("order".equals(payload.targetType)) {
            progressBar.setVisibility(View.VISIBLE);
            client.resolveCampaignTarget(payload.campaignId, result -> {
                if (generation != pushResolutionGeneration || isFinishing() || isDestroyed()) return;
                String target = result.ok ? result.targetUrl : StorefrontConfig.storeUrl();
                if (!result.ok) {
                    Toast.makeText(this, R.string.push_target_unavailable, Toast.LENGTH_LONG).show();
                } else if (explicitTap) {
                    expectDestination(payload.deliveryId, target, "__order_verified__");
                }
                openInternalUrl(target);
            });
            return true;
        }
        String target = StorefrontDeepLink.resolvePushTarget(
                StorefrontConfig.storeUrl(),
                StorefrontConfig.storeKey(),
                payload.targetType,
                payload.targetPath
        );
        if (explicitTap && !target.isEmpty()) {
            expectDestination(payload.deliveryId, target, StorefrontDeepLink.analyticsPath(target, StorefrontConfig.storeUrl()));
        }
        openInternalUrl(target.isEmpty() ? StorefrontConfig.storeUrl() : target);
        return true;
    }

    private void expectDestination(String deliveryId, String url, String reportedPath) {
        pendingDeliveryId = deliveryId == null ? "" : deliveryId;
        pendingDestinationUrl = url == null ? "" : url;
        pendingReportedPath = reportedPath == null ? "" : reportedPath;
    }

    private void clearPendingDestination() {
        pendingDeliveryId = "";
        pendingDestinationUrl = "";
        pendingReportedPath = "";
    }

    private void reportVisibleDestination(String visibleUrl) {
        if (pendingDeliveryId.isEmpty() || pendingDestinationUrl.isEmpty() || pendingReportedPath.isEmpty()) return;
        String expected = StorefrontDeepLink.analyticsPath(pendingDestinationUrl, StorefrontConfig.storeUrl());
        String visible = StorefrontDeepLink.analyticsPath(visibleUrl, StorefrontConfig.storeUrl());
        if (expected.isEmpty() || !expected.equals(visible)) return;
        boolean enqueued = StorefrontEventQueue.enqueue(
                this,
                "destination_viewed",
                pendingDeliveryId,
                pendingReportedPath
        );
        logAnalytics(enqueued ? "destination_viewed_queued" : "destination_viewed_not_queued");
        clearPendingDestination();
        flushEvents();
    }

    private void reportVisibleDestinationAfterDraw(WebView view, String finishedUrl) {
        if (pendingDeliveryId.isEmpty() || pendingDestinationUrl.isEmpty() || pendingReportedPath.isEmpty()) return;
        String expected = StorefrontDeepLink.analyticsPath(pendingDestinationUrl, StorefrontConfig.storeUrl());
        String finished = StorefrontDeepLink.analyticsPath(finishedUrl, StorefrontConfig.storeUrl());
        if (expected.isEmpty() || !expected.equals(finished)) return;
        view.postVisualStateCallback(System.nanoTime(), new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long requestId) {
                if (isFinishing() || isDestroyed()
                        || view != webView
                        || view.getVisibility() != View.VISIBLE
                        || offlineView.getVisibility() == View.VISIBLE) return;
                reportVisibleDestination(view.getUrl());
            }
        });
    }

    private void logAnalytics(String message) {
        if ("staging".equals(BuildConfig.BUILD_TYPE)) Log.i(ANALYTICS_LOG_TAG, message);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (!openPushTarget(intent)) openAppLink(intent);
    }

    private void openStoreHome() {
        openInternalUrl(StorefrontConfig.storeUrl());
    }

    private void openInternalUrl(String url) {
        if (!StorefrontDeepLink.isAllowedInternalNavigation(url, StorefrontConfig.storeUrl())) {
            Toast.makeText(this, R.string.blocked_navigation, Toast.LENGTH_LONG).show();
            return;
        }
        if (!isOnline()) {
            showError(getString(R.string.offline_title), getString(R.string.offline_message));
            return;
        }
        hideError();
        webView.loadUrl(url);
    }

    private boolean handleNavigation(String rawUrl) {
        StorefrontDeepLink.NavigationDecision decision = StorefrontDeepLink.classifyNavigation(
                rawUrl,
                StorefrontConfig.storeUrl()
        );
        if (decision == StorefrontDeepLink.NavigationDecision.INTERNAL) return false;
        if (decision == StorefrontDeepLink.NavigationDecision.EXTERNAL) {
            openExternal(Uri.parse(rawUrl));
        } else {
            Toast.makeText(this, R.string.blocked_navigation, Toast.LENGTH_LONG).show();
        }
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri)
                    .addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, R.string.external_app_unavailable, Toast.LENGTH_LONG).show();
        }
    }

    private void retry() {
        if (!isOnline()) {
            Toast.makeText(this, R.string.still_offline, Toast.LENGTH_SHORT).show();
            return;
        }
        String current = webView.getUrl();
        if (current == null
                || !StorefrontDeepLink.isAllowedInternalNavigation(current, StorefrontConfig.storeUrl())) {
            current = StorefrontConfig.storeUrl();
        }
        openInternalUrl(current);
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return true;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private boolean isVpnActive() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    }

    private void showConnectivityError() {
        if (!isOnline()) {
            showError(getString(R.string.offline_title), getString(R.string.offline_message));
        } else if (isVpnActive()) {
            showError(getString(R.string.vpn_error_title), getString(R.string.vpn_error_message));
        } else {
            showError(getString(R.string.service_error_title), getString(R.string.service_error_message));
        }
    }

    private void hideSplash() {
        if (splashHidden || splashView == null) return;
        splashHidden = true;
        splashView.animate()
                .alpha(0f)
                .setDuration(260)
                .withEndAction(() -> splashView.setVisibility(View.GONE))
                .start();
    }

    private void hideSplashAfterDraw(WebView view) {
        if (splashHidden || view == null || Build.VERSION.SDK_INT < 23) {
            hideSplash();
            return;
        }
        view.postVisualStateCallback(System.nanoTime(), new WebView.VisualStateCallback() {
            @Override
            public void onComplete(long requestId) {
                if (!isFinishing() && !isDestroyed() && offlineView.getVisibility() != View.VISIBLE) hideSplash();
            }
        });
    }

    private void showError(String title, String message) {
        pageLoadGeneration += 1;
        pageReady = false;
        hideSplash();
        progressBar.setVisibility(View.GONE);
        permissionCard.setVisibility(View.GONE);
        offlineTitle.setText(title);
        offlineMessage.setText(message);
        webView.setVisibility(View.INVISIBLE);
        offlineView.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        offlineView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        updateNotificationCard();
    }

    private void configureBackNavigation() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBackNavigation
            );
        }
    }

    private void handleBackNavigation() {
        if (offlineView.getVisibility() == View.VISIBLE && webView.getUrl() != null) {
            hideError();
            return;
        }
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            finishAfterTransition();
        }
    }

    @Override
    @SuppressLint("GestureBackNavigation")
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < 33) handleBackNavigation();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        Toast.makeText(
                this,
                granted ? R.string.notification_enabled : R.string.notification_denied,
                Toast.LENGTH_LONG
        ).show();
        updateNotificationCard();
        if (StorefrontInstallationStore.hasCredential(this)) syncPermissionIfChanged();
        else syncInstallation();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateNotificationCard();
        syncPermissionIfChanged();
        if (initialNavigationDone) refreshWebSession(null);
        flushEvents();
        if (pendingVerifiedUpdate != null) {
            File verified = pendingVerifiedUpdate;
            if (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls()) {
                openVerifiedUpdate(verified);
                return;
            }
            pendingVerifiedUpdate = null;
            if (verified.exists()) verified.delete();
        }
        checkForUpdates();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (updateDialog != null) updateDialog.dismiss();
        updateExecutor.shutdownNow();
        if (webView != null) {
            webView.stopLoading();
            webView.setDownloadListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private final class StorefrontWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            return handleNavigation(request.getUrl().toString());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(url);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            hideError();
            pageReady = false;
            int generation = ++pageLoadGeneration;
            progressBar.setVisibility(View.VISIBLE);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (generation == pageLoadGeneration && !pageReady
                        && !isFinishing() && !isDestroyed()
                        && offlineView.getVisibility() != View.VISIBLE) {
                    clearPendingDestination();
                    showConnectivityError();
                }
            }, 20_000);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            hideSplashAfterDraw(view);
            reportVisibleDestination(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
            pageReady = true;
            hideSplashAfterDraw(view);
            updateNotificationCard();
            reportVisibleDestinationAfterDraw(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            clearPendingDestination();
            showConnectivityError();
        }

        @Override
        public void onReceivedHttpError(
                WebView view,
                WebResourceRequest request,
                WebResourceResponse errorResponse
        ) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 400) {
                clearPendingDestination();
            }
            if (request.isForMainFrame()
                    && (errorResponse.getStatusCode() == 403 || errorResponse.getStatusCode() == 451)) {
                showConnectivityError();
            } else if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                showError(
                        getString(R.string.service_error_title),
                        getString(R.string.service_error_message)
                );
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            clearPendingDestination();
            showError(
                    getString(R.string.ssl_error_title),
                    getString(R.string.ssl_error_message)
            );
        }
    }

    private final class StorefrontWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onShowFileChooser(
                WebView webView,
                ValueCallback<Uri[]> filePathCallback,
                FileChooserParams fileChooserParams
        ) {
            filePathCallback.onReceiveValue(null);
            return true;
        }
    }
}
