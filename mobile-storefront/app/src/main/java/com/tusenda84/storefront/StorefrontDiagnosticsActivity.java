package com.tusenda84.storefront;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONObject;

import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

public final class StorefrontDiagnosticsActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TextView report;
    private Button probeButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setTitle("Diagnóstico de soporte");

        int padding = Math.round(20 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("Diagnóstico privado de la aplicación");
        title.setTextSize(22);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        content.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        TextView note = new TextView(this);
        note.setText("Esta pantalla no muestra credenciales, FID ni tokens completos.");
        note.setTextSize(14);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        noteParams.topMargin = padding / 2;
        content.addView(note, noteParams);

        report = new TextView(this);
        report.setTextSize(15);
        report.setTextIsSelectable(true);
        report.setLineSpacing(0, 1.15f);
        LinearLayout.LayoutParams reportParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        reportParams.topMargin = padding;
        content.addView(report, reportParams);

        probeButton = new Button(this);
        probeButton.setText("Probar DNS/HTTPS y actualizar");
        probeButton.setAllCaps(false);
        probeButton.setOnClickListener(view -> probeNetwork());
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        buttonParams.topMargin = padding;
        content.addView(probeButton, buttonParams);

        Button closeButton = new Button(this);
        closeButton.setText("Volver");
        closeButton.setAllCaps(false);
        closeButton.setOnClickListener(view -> finish());
        content.addView(closeButton, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        setContentView(scroll);
        refreshReport();
        probeNetwork();
    }

    private void probeNetwork() {
        probeButton.setEnabled(false);
        executor.execute(() -> {
            boolean dns = false;
            boolean https = false;
            HttpURLConnection connection = null;
            try {
                URL url = new URL(StorefrontConfig.storeUrl());
                InetAddress[] addresses = InetAddress.getAllByName(url.getHost());
                dns = addresses.length > 0;
                if (dns) {
                    connection = (HttpURLConnection) url.openConnection();
                    if (!(connection instanceof HttpsURLConnection)) throw new IllegalStateException("https_required");
                    connection.setRequestMethod("HEAD");
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(10_000);
                    connection.setReadTimeout(10_000);
                    connection.setRequestProperty("Cache-Control", "no-store");
                    int status = connection.getResponseCode();
                    https = status >= 100 && status <= 599;
                }
            } catch (Exception ignored) {
                // El informe conserva únicamente el resultado, nunca nombres internos ni excepciones.
            } finally {
                if (connection != null) connection.disconnect();
            }
            StorefrontDiagnostics.recordNetworkProbe(this, dns, https);
            runOnUiThread(() -> {
                probeButton.setEnabled(true);
                refreshReport();
            });
        });
    }

    @SuppressLint("SetTextI18n")
    private void refreshReport() {
        JSONObject registration = StorefrontDiagnostics.event(
                this,
                StorefrontDiagnostics.INSTALLATION_REGISTER_RESPONSE
        );
        JSONObject firebase = StorefrontDiagnostics.event(this, StorefrontDiagnostics.FIREBASE_INITIALIZED);
        JSONObject fid = StorefrontDiagnostics.event(this, StorefrontDiagnostics.FID_CREATED);
        JSONObject fcm = StorefrontDiagnostics.event(this, StorefrontDiagnostics.FCM_TOKEN_CREATED);
        JSONObject push = StorefrontDiagnostics.event(this, StorefrontDiagnostics.LAST_PUSH_RECEIVED);
        JSONObject backend = StorefrontDiagnostics.event(this, StorefrontDiagnostics.BACKEND_REACHABLE);
        StringBuilder value = new StringBuilder();
        line(value, "API disponible", success(backend) ? "Sí" : "No confirmado");
        line(value, "Última respuesta API", eventSummary(backend));
        line(value, "DNS disponible", StorefrontDiagnostics.dnsAvailable(this) ? "Sí" : "No confirmado");
        line(value, "HTTPS disponible", StorefrontDiagnostics.httpsAvailable(this) ? "Sí" : "No confirmado");
        line(value, "installation_id", localInstallationId());
        line(value, "Registro backend", success(registration) && StorefrontInstallationStore.hasCredential(this)
                ? "Registrado" : "Pendiente");
        line(value, "Firebase disponible", success(firebase) ? "Sí" : "No/Pendiente");
        line(value, "FID", success(fid) ? "Presente" : "No presente");
        line(value, "Registro FCM (FID)", success(fcm) ? "Presente" : "No presente");
        line(value, "Permiso de notificaciones", StorefrontRegistrationClient.permissionState(this));
        line(value, "Última sincronización", orPending(StorefrontInstallationStore.lastSuccessfulSync(this)));
        line(value, "Último estado WebSocket", realtimeSummary());
        line(value, "Último push", orPending(push.optString("timestamp", "")));
        line(value, "Último error", StorefrontDiagnostics.lastError(this).isEmpty()
                ? "Ninguno registrado"
                : StorefrontDiagnostics.lastError(this) + " · " + StorefrontDiagnostics.lastErrorAt(this));
        line(value, "Versión", BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")");
        report.setText(value.toString());
    }

    private static boolean success(JSONObject value) {
        return "success".equals(value.optString("result", ""));
    }

    private static String orPending(String value) {
        return value == null || value.isEmpty() ? "Pendiente" : value;
    }

    private String localInstallationId() {
        try { return StorefrontInstallationStore.installationId(this); }
        catch (RuntimeException ignored) { return "No disponible"; }
    }

    private String realtimeSummary() {
        String status = StorefrontInstallationStore.lastRealtimeStatus(this);
        String timestamp = StorefrontInstallationStore.lastRealtimeStatusAt(this);
        if (status.isEmpty()) return "Pendiente";
        return ("connected".equals(status) ? "Conectado" : "No disponible")
                + (timestamp.isEmpty() ? "" : " · " + timestamp);
    }

    private static String eventSummary(JSONObject value) {
        if (value == null || value.length() == 0) return "Pendiente";
        int status = value.optInt("http_status", 0);
        long latency = value.optLong("latency_ms", 0);
        String result = value.optString("result", "");
        String error = value.optString("error_code", "");
        StringBuilder summary = new StringBuilder();
        summary.append(status > 0 ? "HTTP " + status : "Sin respuesta HTTP")
                .append(" · ").append(latency).append(" ms")
                .append(" · ").append(result.isEmpty() ? "sin resultado" : result);
        if (!error.isEmpty()) summary.append(" · ").append(error);
        String timestamp = value.optString("timestamp", "");
        if (!timestamp.isEmpty()) summary.append(" · ").append(timestamp);
        return summary.toString();
    }

    private static void line(StringBuilder target, String label, String value) {
        if (target.length() > 0) target.append("\n\n");
        target.append(label).append(":\n").append(value);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
