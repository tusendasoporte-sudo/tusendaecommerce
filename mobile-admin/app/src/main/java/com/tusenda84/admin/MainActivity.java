package com.tusenda84.admin;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.SslErrorHandler;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.google.firebase.messaging.FirebaseMessaging;

import java.net.URISyntaxException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 301;
    private static final int STORAGE_PERMISSION_REQUEST = 302;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 303;
    private static final String ADMIN_BACK_SCRIPT =
            "(function(){try{"
                    + "var navigation=window.PZAdminBackNavigation;"
                    + "if(navigation&&typeof navigation.handle==='function'){return navigation.handle()===true;}"
                    + "var request=new CustomEvent('pz:admin-back-request',{cancelable:true,detail:{source:'android'}});"
                    + "return window.dispatchEvent(request)===false;"
                    + "}catch(error){return false;}})();";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorView;
    private TextView errorTitle;
    private TextView errorMessage;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PendingDownload pendingDownload;
    private boolean backNavigationPending;
    private long lastForegroundPushSyncStartedAt;
    private final ExecutorService pushRegistrationExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService adminUpdateExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();
        setContentView(createContentView());
        configureWebView();
        configureBackNavigation();
        try {
            PushRegistrationStore.localInstallationId(this);
        } catch (RuntimeException ignored) {
        }
        recordPushOpen(getIntent());

        if (savedInstanceState == null) {
            String pushTarget = resolvePushTarget(getIntent());
            if (pushTarget.isEmpty()) openAdminHome();
            else openInternalUrl(pushTarget);
        } else {
            webView.restoreState(savedInstanceState);
        }

        initializePushTransport();
    }

    private void configureWindow() {
        Window window = getWindow();
        window.setStatusBarColor(Color.WHITE);
        window.setNavigationBarColor(Color.WHITE);
        window.getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );
    }

    private View createContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.rgb(37, 99, 235)));
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3)
        );
        progressParams.gravity = Gravity.TOP;
        root.addView(progressBar, progressParams);

        errorView = createErrorView();
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        if (Build.VERSION.SDK_INT >= 35) {
            getWindow().setDecorFitsSystemWindows(false);
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

        return root;
    }

    private LinearLayout createErrorView() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setGravity(Gravity.CENTER);
        container.setPadding(dp(30), dp(30), dp(30), dp(30));
        container.setBackgroundColor(Color.WHITE);

        TextView badge = new TextView(this);
        badge.setText(R.string.brand_badge);
        badge.setGravity(Gravity.CENTER);
        badge.setTextColor(Color.WHITE);
        badge.setTextSize(24);
        badge.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        android.graphics.drawable.GradientDrawable badgeBackground = new android.graphics.drawable.GradientDrawable();
        badgeBackground.setColor(Color.rgb(15, 23, 42));
        badgeBackground.setCornerRadius(dp(18));
        badge.setBackground(badgeBackground);
        container.addView(badge, new LinearLayout.LayoutParams(dp(68), dp(68)));

        errorTitle = new TextView(this);
        errorTitle.setText(R.string.offline_title);
        errorTitle.setTextColor(Color.rgb(15, 23, 42));
        errorTitle.setTextSize(24);
        errorTitle.setGravity(Gravity.CENTER);
        errorTitle.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        titleParams.topMargin = dp(22);
        container.addView(errorTitle, titleParams);

        errorMessage = new TextView(this);
        errorMessage.setText(R.string.offline_message);
        errorMessage.setTextColor(Color.rgb(71, 85, 105));
        errorMessage.setTextSize(15);
        errorMessage.setGravity(Gravity.CENTER);
        errorMessage.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
                Math.min(getResources().getDisplayMetrics().widthPixels - dp(60), dp(430)),
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        messageParams.topMargin = dp(12);
        container.addView(errorMessage, messageParams);

        Button retryButton = new Button(this);
        retryButton.setText(R.string.retry);
        retryButton.setTextColor(Color.WHITE);
        retryButton.setTextSize(15);
        retryButton.setAllCaps(false);
        android.graphics.drawable.GradientDrawable buttonBackground = new android.graphics.drawable.GradientDrawable();
        buttonBackground.setColor(Color.rgb(15, 23, 42));
        buttonBackground.setCornerRadius(dp(10));
        retryButton.setBackground(buttonBackground);
        retryButton.setOnClickListener(view -> retry());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(dp(180), dp(52));
        buttonParams.topMargin = dp(24);
        container.addView(retryButton, buttonParams);

        return container;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(
                settings.getUserAgentString()
                        + " TuSenda84Admin/" + BuildConfig.VERSION_NAME.replace("-debug", "")
                        + " (" + BuildConfig.VERSION_CODE + "; " + BuildConfig.APPLICATION_ID + ")"
        );

        webView.setWebViewClient(new AdminWebViewClient());
        webView.setWebChromeClient(new AdminWebChromeClient());
        webView.setDownloadListener(new AdminDownloadListener());
        webView.addJavascriptInterface(new AdminPushBridge(this), "PZAndroidPush");
        webView.addJavascriptInterface(new AdminUpdateBridge(this), "PZAndroidUpdate");
        webView.setOverScrollMode(View.OVER_SCROLL_IF_CONTENT_SCROLLS);
    }

    private void openAdminHome() {
        openInternalUrl(BuildConfig.ADMIN_URL);
    }

    private void openInternalUrl(String url) {
        if (!isOnline()) {
            showError(
                    "Sin conexión",
                    "Comprueba tu conexión a internet para continuar administrando la tienda."
            );
            return;
        }
        hideError();
        webView.loadUrl(url);
    }

    String getPushPermissionState() {
        if (Build.VERSION.SDK_INT < 33
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        return PushRegistrationStore.wasPermissionRequested(this) ? "denied" : "prompt";
    }

    void emitPushStateToWeb() {
        if (webView == null) return;
        Uri current = Uri.parse(String.valueOf(webView.getUrl() == null ? "" : webView.getUrl()));
        if (!"https".equals(normalized(current.getScheme())) || !isAllowedWebHost(current.getHost())) return;

        try {
            String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
            String model = Build.MODEL == null ? "" : Build.MODEL.trim();
            String deviceLabel = manufacturer.isEmpty() || model.toLowerCase(Locale.ROOT).startsWith(manufacturer.toLowerCase(Locale.ROOT))
                    ? model
                    : (manufacturer + " " + model).trim();
            if (deviceLabel.isEmpty()) deviceLabel = "Android";
            JSONObject state = new JSONObject();
            state.put("permission", getPushPermissionState());
            state.put("installation_id", safeLocalInstallationId());
            state.put("firebase_installation_id", PushRegistrationStore.getInstallationId(this));
            state.put("credential_ready", PushRegistrationStore.hasCredential(this));
            state.put("notifications_enabled", PushRegistrationStore.notificationsEnabled(this));
            state.put("app_id", getPackageName());
            state.put("device_label", deviceLabel);
            state.put("os_version", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
            state.put("app_version", BuildConfig.VERSION_NAME);
            state.put("app_version_code", BuildConfig.VERSION_CODE);
            state.put("last_successful_sync", PushRegistrationStore.lastSuccessfulSync(this));
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('pz:android-push-state',{detail:" + state + "}));",
                    null
            );
        } catch (JSONException ignored) {}
    }

    void requestPushPermissionFromWeb() {
        PushRegistrationStore.setNotificationsEnabled(this, true);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            PushRegistrationStore.markPermissionRequested(this);
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
            );
            return;
        }
        enablePushRegistration();
    }

    void openNotificationSettings() {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallback.setData(Uri.parse("package:" + getPackageName()));
            startActivity(fallback);
        }
    }

    private void initializePushTransport() {
        if (!BuildConfig.FIREBASE_CONFIGURED) return;
        enablePushRegistration();
    }

    private void enablePushRegistration() {
        if (!BuildConfig.FIREBASE_CONFIGURED) return;
        pushRegistrationExecutor.execute(() -> {
            try {
                FirebaseMessaging messaging = FirebaseMessaging.getInstance();
                messaging.setAutoInitEnabled(true);
                messaging.register().addOnFailureListener(error ->
                        Toast.makeText(this, "No se pudo registrar este teléfono para avisos.", Toast.LENGTH_LONG).show()
                );
            } catch (RuntimeException error) {
                runOnUiThread(() -> Toast.makeText(
                        this,
                        "No se pudo registrar este teléfono para avisos.",
                        Toast.LENGTH_LONG
                ).show());
            }
        });
    }

    private String resolvePushTarget(Intent intent) {
        if (intent == null) return "";
        String target = intent.getStringExtra(PushNotifications.EXTRA_TARGET_URL);
        if (target == null || target.trim().isEmpty()) {
            target = intent.getStringExtra("target_url");
        }
        target = target == null ? "" : target.trim();
        if (target.isEmpty()) return "";

        Uri configured = Uri.parse(BuildConfig.ADMIN_URL);
        Uri candidate;
        if (target.startsWith("/")) {
            String origin = configured.getScheme() + "://" + configured.getEncodedAuthority();
            candidate = Uri.parse(origin + target);
        } else {
            candidate = Uri.parse(target);
        }

        if (!"https".equals(normalized(candidate.getScheme()))) return "";
        return isAllowedWebHost(candidate.getHost()) ? candidate.toString() : "";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recordPushOpen(intent);
        String target = resolvePushTarget(intent);
        if (!target.isEmpty()) openInternalUrl(target);
    }

    @Override
    protected void onResume() {
        super.onResume();
        syncAdminNotifications(AdminNotificationStore.TRIGGER_RESUME);
        emitPushStateToWeb();
    }

    private void configureBackNavigation() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    this::handleBackNavigation
            );
        }
    }

    private void retry() {
        if (!isOnline()) {
            Toast.makeText(this, "Todavía no hay conexión a internet.", Toast.LENGTH_SHORT).show();
            return;
        }
        hideError();
        String currentUrl = webView.getUrl();
        if (currentUrl == null || currentUrl.trim().isEmpty()) {
            openAdminHome();
        } else {
            webView.reload();
        }
    }

    private boolean isOnline() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return true;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void showError(String title, String message) {
        progressBar.setVisibility(View.GONE);
        errorTitle.setText(title);
        errorMessage.setText(message);
        webView.setVisibility(View.GONE);
        errorView.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        errorView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    private boolean handleNavigation(String rawUrl) {
        if (rawUrl == null || rawUrl.trim().isEmpty()) return true;
        Uri uri = Uri.parse(rawUrl);
        String scheme = normalized(uri.getScheme());

        if ("http".equals(scheme) || "https".equals(scheme)) {
            if (isAllowedWebHost(uri.getHost())) return false;
            openExternal(uri);
            return true;
        }

        if ("intent".equals(scheme)) {
            openIntentUrl(rawUrl);
            return true;
        }

        if ("tel".equals(scheme)
                || "mailto".equals(scheme)
                || "sms".equals(scheme)
                || "smsto".equals(scheme)
                || "geo".equals(scheme)
                || "market".equals(scheme)) {
            openExternal(uri);
            return true;
        }

        return !"about".equals(scheme);
    }

    private boolean isAllowedWebHost(String host) {
        String candidate = normalized(host);
        String configuredHost = normalized(Uri.parse(BuildConfig.ADMIN_URL).getHost());
        if (candidate.isEmpty() || configuredHost.isEmpty()) return false;
        if (candidate.equals(configuredHost)) return true;
        if (configuredHost.startsWith("www.")) {
            return candidate.equals(configuredHost.substring(4));
        }
        return candidate.equals("www." + configuredHost);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No hay una aplicación disponible para abrir este enlace.", Toast.LENGTH_LONG).show();
        }
    }

    private void openIntentUrl(String rawUrl) {
        try {
            Intent intent = Intent.parseUri(rawUrl, Intent.URI_INTENT_SCHEME);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setComponent(null);
            intent.setSelector(null);
            try {
                startActivity(intent);
                return;
            } catch (ActivityNotFoundException ignored) {
                String fallbackUrl = intent.getStringExtra("browser_fallback_url");
                if (fallbackUrl != null) openExternal(Uri.parse(fallbackUrl));
            }
        } catch (URISyntaxException ignored) {
            Toast.makeText(this, "El enlace externo no es válido.", Toast.LENGTH_SHORT).show();
        }
    }

    private void startFileChooser(Intent chooserIntent) {
        try {
            startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
        } catch (ActivityNotFoundException error) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
            Toast.makeText(this, "No hay un selector de archivos disponible.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    private void requestDownload(PendingDownload download) {
        if (Build.VERSION.SDK_INT <= 28
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = download;
            requestPermissions(
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    STORAGE_PERMISSION_REQUEST
            );
            return;
        }
        enqueueDownload(download);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            PushRegistrationStore.markPermissionRequested(this);
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                PushRegistrationStore.setNotificationsEnabled(this, true);
                enablePushRegistration();
                syncAdminNotifications(AdminNotificationStore.TRIGGER_RESUME);
                Toast.makeText(this, "Avisos de Android activados.", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Puedes activar los avisos desde los ajustes de Android.", Toast.LENGTH_LONG).show();
            }
            emitPushStateToWeb();
            return;
        }
        if (requestCode != STORAGE_PERMISSION_REQUEST || pendingDownload == null) return;
        PendingDownload download = pendingDownload;
        pendingDownload = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            enqueueDownload(download);
        } else {
            Toast.makeText(this, "Se necesita permiso de almacenamiento para descargar el archivo.", Toast.LENGTH_LONG).show();
        }
    }

    private void enqueueDownload(PendingDownload download) {
        if (!download.url.startsWith("http://") && !download.url.startsWith("https://")) {
            Toast.makeText(this, "Este archivo no se puede descargar desde la aplicación.", Toast.LENGTH_LONG).show();
            return;
        }

        try {
            String fileName = URLUtil.guessFileName(download.url, download.contentDisposition, download.mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(download.url));
            request.setTitle(fileName);
            request.setDescription("Descargando desde " + BuildConfig.APP_DISPLAY_NAME);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setMimeType(download.mimeType);
            request.addRequestHeader("User-Agent", download.userAgent);
            String cookies = CookieManager.getInstance().getCookie(download.url);
            if (cookies != null && !cookies.isEmpty()) request.addRequestHeader("Cookie", cookies);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("DownloadManager unavailable");
            manager.enqueue(request);
            Toast.makeText(this, "Descarga iniciada.", Toast.LENGTH_SHORT).show();
        } catch (RuntimeException error) {
            Toast.makeText(this, "No se pudo iniciar la descarga.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    private void navigateWebViewBackOrExit() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            finishAfterTransition();
        }
    }

    void emitAdminAppStateToWeb() {
        if (webView == null) return;
        Uri current = Uri.parse(String.valueOf(webView.getUrl() == null ? "" : webView.getUrl()));
        if (!"https".equals(normalized(current.getScheme())) || !isAllowedWebHost(current.getHost())) return;
        try {
            JSONObject state = new JSONObject();
            state.put("package_name", getPackageName());
            state.put("version_code", BuildConfig.VERSION_CODE);
            state.put("version_name", BuildConfig.VERSION_NAME.replace("-debug", ""));
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('pz:android-admin-app-state',{detail:" + state + "}));",
                    null
            );
        } catch (JSONException ignored) {}
    }

    void downloadVerifiedAdminUpdate(String rawUrl, String rawSha256, long versionCode, String packageName) {
        String url = rawUrl == null ? "" : rawUrl.trim();
        String sha256 = AdminUpdateContract.normalized(rawSha256);
        String expectedPackage = packageName == null ? "" : packageName.trim();
        if (!AdminUpdateContract.allowedDownloadUrl(url, BuildConfig.ADMIN_URL)
                || !AdminUpdateContract.validMetadata(sha256, versionCode, expectedPackage)) {
            Toast.makeText(this, "La actualización no tiene metadatos válidos.", Toast.LENGTH_LONG).show();
            return;
        }
        Toast.makeText(this, "Descargando y verificando la actualización…", Toast.LENGTH_SHORT).show();
        String updateUserAgent = webView.getSettings().getUserAgentString();
        String updateCookies = CookieManager.getInstance().getCookie(url);
        adminUpdateExecutor.execute(() -> {
            File output = null;
            HttpURLConnection connection = null;
            try {
                File directory = new File(getCacheDir(), "admin-updates");
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("update_directory_failed");
                File[] previousUpdates = directory.listFiles((parent, name) -> name.matches("mobile-admin-[0-9]+\\.apk"));
                if (previousUpdates != null) {
                    for (File previous : previousUpdates) {
                        if (!previous.delete()) throw new IllegalStateException("update_cleanup_failed");
                    }
                }
                output = new File(directory, "mobile-admin-" + versionCode + ".apk");
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(15_000);
                connection.setReadTimeout(120_000);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                connection.setRequestProperty("User-Agent", updateUserAgent);
                if (updateCookies != null && !updateCookies.isEmpty()) connection.setRequestProperty("Cookie", updateCookies);
                int responseCode = connection.getResponseCode();
                long declaredLength = connection.getContentLengthLong();
                if (responseCode != HttpURLConnection.HTTP_OK || declaredLength > AdminUpdateContract.MAX_APK_BYTES) {
                    throw new IllegalStateException("update_download_denied");
                }
                long total = 0;
                byte[] buffer = new byte[64 * 1024];
                try (InputStream input = connection.getInputStream(); FileOutputStream file = new FileOutputStream(output)) {
                    int read;
                    while ((read = input.read(buffer)) >= 0) {
                        if (read == 0) continue;
                        total += read;
                        if (total > AdminUpdateContract.MAX_APK_BYTES) throw new IllegalStateException("update_too_large");
                        file.write(buffer, 0, read);
                    }
                    file.getFD().sync();
                }
                if (total < 1 || (declaredLength >= 0 && total != declaredLength)) throw new IllegalStateException("update_size_mismatch");
                AdminApkVerifier.verify(this, output, sha256, versionCode, expectedPackage);
                File verified = output;
                runOnUiThread(() -> openVerifiedAdminUpdate(verified));
            } catch (Exception error) {
                if (output != null && output.exists()) output.delete();
                runOnUiThread(() -> Toast.makeText(
                        this,
                        "La actualización no superó la verificación. No se abrirá el instalador.",
                        Toast.LENGTH_LONG
                ).show());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    boolean completePushRegistration(String credential, String storeId) {
        try {
            PushRegistrationStore.saveCredential(this, credential, storeId);
        } catch (RuntimeException error) {
            return false;
        }
        AdminBackgroundSync.schedule(this);
        AdminNotificationClient client = new AdminNotificationClient(this);
        String firebaseInstallationId = PushRegistrationStore.getInstallationId(this);
        if (!firebaseInstallationId.isEmpty()) {
            client.enrichFirebase(firebaseInstallationId, result -> {
                syncAdminNotifications(AdminNotificationStore.TRIGGER_RESUME);
                emitPushStateToWeb();
            });
        } else {
            syncAdminNotifications(AdminNotificationStore.TRIGGER_RESUME);
            runOnUiThread(this::emitPushStateToWeb);
        }
        return true;
    }

    void setPushNotificationsEnabled(boolean enabled) {
        PushRegistrationStore.setNotificationsEnabled(this, enabled);
        AdminBackgroundSync.enqueueImmediate(this);
        runOnUiThread(this::emitPushStateToWeb);
    }

    synchronized void syncAdminNotifications(String deliveryTrigger) {
        if (!PushRegistrationStore.hasCredential(this)) return;
        long now = System.currentTimeMillis();
        if (AdminNotificationStore.TRIGGER_FOREGROUND.equals(deliveryTrigger)
                && now - lastForegroundPushSyncStartedAt < 60_000) return;
        if (AdminNotificationStore.TRIGGER_FOREGROUND.equals(deliveryTrigger)) {
            lastForegroundPushSyncStartedAt = now;
        }
        new AdminNotificationClient(this).syncNotifications(deliveryTrigger, result ->
                emitPushStateToWeb()
        );
    }

    private String safeLocalInstallationId() {
        try {
            return PushRegistrationStore.localInstallationId(this);
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private void recordPushOpen(Intent intent) {
        if (intent == null) return;
        String notificationId = intent.getStringExtra(PushNotifications.EXTRA_NOTIFICATION_ID);
        if (notificationId == null || notificationId.trim().isEmpty()) return;
        AdminNotificationStore.queueReceipt(this, notificationId, "read", "");
        AdminBackgroundSync.enqueueImmediate(this);
    }

    private void openVerifiedAdminUpdate(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "Autoriza a Mobile Admin para instalar esta actualización y vuelve a intentarlo.", Toast.LENGTH_LONG).show();
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
            startActivity(settings);
            return;
        }
        try {
            Uri content = FileProvider.getUriForFile(this, getPackageName() + ".admin_update_files", apk);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(content, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (RuntimeException error) {
            Toast.makeText(this, "Android no pudo abrir el instalador verificado.", Toast.LENGTH_LONG).show();
        }
    }

    private void handleBackNavigation() {
        if (errorView.getVisibility() == View.VISIBLE) {
            hideError();
            if (webView.getUrl() == null) openAdminHome();
            return;
        }
        if (backNavigationPending || webView == null) return;
        backNavigationPending = true;
        webView.evaluateJavascript(ADMIN_BACK_SCRIPT, result -> {
            backNavigationPending = false;
            if ("true".equalsIgnoreCase(String.valueOf(result))) return;
            navigateWebViewBackOrExit();
        });
    }

    @Override
    @SuppressLint("GestureBackNavigation")
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < 33) {
            handleBackNavigation();
        }
    }

    @Override
    protected void onDestroy() {
        pushRegistrationExecutor.shutdown();
        adminUpdateExecutor.shutdown();
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String normalized(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private final class AdminWebViewClient extends WebViewClient {
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
        public void onPageFinished(WebView view, String url) {
            progressBar.setVisibility(View.GONE);
            CookieManager.getInstance().flush();
            emitPushStateToWeb();
            emitAdminAppStateToWeb();
            syncAdminNotifications(AdminNotificationStore.TRIGGER_FOREGROUND);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            showError(
                    "No se pudo abrir el panel",
                    isOnline()
                            ? "El servicio no respondió. Inténtalo nuevamente en unos segundos."
                            : "Comprueba tu conexión a internet para continuar administrando la tienda."
            );
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            if (request.isForMainFrame() && errorResponse.getStatusCode() >= 500) {
                showError(
                        "Servicio temporalmente no disponible",
                        "El panel está tardando en responder. Inténtalo nuevamente en unos segundos."
                );
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, android.net.http.SslError error) {
            handler.cancel();
            showError(
                    "Conexión no segura",
                    "No fue posible verificar la seguridad del servidor. No ingreses tus credenciales."
            );
        }
    }

    private final class AdminWebChromeClient extends WebChromeClient {
        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            progressBar.setProgress(newProgress);
            progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
        }

        @Override
        public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams fileChooserParams
        ) {
            if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = callback;
            startFileChooser(fileChooserParams.createIntent());
            return true;
        }
    }

    private final class AdminDownloadListener implements DownloadListener {
        @Override
        public void onDownloadStart(
                String url,
                String userAgent,
                String contentDisposition,
                String mimeType,
                long contentLength
        ) {
            requestDownload(new PendingDownload(url, userAgent, contentDisposition, mimeType));
        }
    }

    private static final class PendingDownload {
        final String url;
        final String userAgent;
        final String contentDisposition;
        final String mimeType;

        PendingDownload(String url, String userAgent, String contentDisposition, String mimeType) {
            this.url = url == null ? "" : url;
            this.userAgent = userAgent == null ? "" : userAgent;
            this.contentDisposition = contentDisposition;
            this.mimeType = mimeType;
        }
    }
}
