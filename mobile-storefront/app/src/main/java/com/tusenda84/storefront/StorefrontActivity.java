package com.tusenda84.storefront;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
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

public final class StorefrontActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 601;
    private static final String ANALYTICS_LOG_TAG = "PZStorefrontAnalytics";

    private StorefrontRegistrationClient client;
    private WebView webView;
    private ProgressBar progressBar;
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
    private boolean initialNavigationDone;
    private int pushResolutionGeneration;
    private String pendingDeliveryId = "";
    private String pendingDestinationUrl = "";
    private String pendingReportedPath = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_PowerZonaStorefront);
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
            if (result.ok) refreshWebSession(null);
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
            refreshWebSession(sessionResult -> completeInitialNavigation(intent));
        });
    }

    private void completeInitialNavigation(Intent intent) {
        if (initialNavigationDone || isFinishing() || isDestroyed()) return;
        initialNavigationDone = true;
        if (!openPushTarget(intent)) openStoreHome();
        flushEvents();
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
        openPushTarget(intent);
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

    private void showError(String title, String message) {
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
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
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
            progressBar.setVisibility(View.VISIBLE);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            reportVisibleDestination(url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
            pageReady = true;
            updateNotificationCard();
            reportVisibleDestinationAfterDraw(view, url);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            clearPendingDestination();
            showError(
                    isOnline() ? getString(R.string.service_error_title) : getString(R.string.offline_title),
                    isOnline() ? getString(R.string.service_error_message) : getString(R.string.offline_message)
            );
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
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
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
