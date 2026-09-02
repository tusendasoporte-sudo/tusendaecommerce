package com.tusenda84.storefront;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;

import java.time.Instant;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

final class StorefrontRealtimeClient {
    interface Listener {
        void onSyncRequired();
    }

    private static final String LOG_TAG = "PZStorefrontRealtime";
    private static final Pattern RECORD_ID_PATTERN = Pattern.compile("^[a-z0-9]{15}$");
    private static final long[] RETRY_DELAYS_MS = {
            1_000L, 2_000L, 5_000L, 10_000L, 20_000L, 30_000L
    };
    private static final OkHttpClient SOCKET_CLIENT = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .pingInterval(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();

    private final Context context;
    private final StorefrontRegistrationClient registrationClient;
    private final Listener listener;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean enabled;
    private boolean ticketInFlight;
    private int generation;
    private int retryAttempt;
    private WebSocket socket;
    private final Runnable reconnect = this::startConnection;

    StorefrontRealtimeClient(
            Context context,
            StorefrontRegistrationClient registrationClient,
            Listener listener
    ) {
        this.context = context.getApplicationContext();
        this.registrationClient = registrationClient;
        this.listener = listener;
    }

    void connect() {
        main.post(() -> {
            enabled = true;
            main.removeCallbacks(reconnect);
            if (socket == null && !ticketInFlight) startConnection();
        });
    }

    void disconnect() {
        main.post(() -> {
            enabled = false;
            generation += 1;
            retryAttempt = 0;
            ticketInFlight = false;
            main.removeCallbacks(reconnect);
            WebSocket current = socket;
            socket = null;
            if (current != null) current.close(1000, "app_background");
        });
    }

    private void startConnection() {
        if (!enabled || socket != null || ticketInFlight) return;
        if (!StorefrontInstallationStore.hasCredential(context)) {
            scheduleReconnect();
            return;
        }
        ticketInFlight = true;
        int attemptGeneration = generation;
        registrationClient.requestRealtimeTicket(ticket -> {
            ticketInFlight = false;
            if (!enabled || generation != attemptGeneration) return;
            if (ticket == null) {
                StorefrontInstallationStore.recordRealtimeStatus(
                        context,
                        "unavailable",
                        Instant.now().toString()
                );
                scheduleReconnect();
                return;
            }
            Request request;
            try {
                request = new Request.Builder()
                        .url(ticket.webSocketUrl)
                        .header("Authorization", "Bearer " + ticket.ticket)
                        .header("Cache-Control", "no-store")
                        .build();
            } catch (RuntimeException error) {
                scheduleReconnect();
                return;
            }
            socket = SOCKET_CLIENT.newWebSocket(
                    request,
                    new SocketListener(attemptGeneration)
            );
        });
    }

    private void scheduleReconnect() {
        if (!enabled) return;
        main.removeCallbacks(reconnect);
        long base = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)];
        retryAttempt = Math.min(retryAttempt + 1, RETRY_DELAYS_MS.length - 1);
        long jittered = base * ThreadLocalRandom.current().nextInt(80, 121) / 100;
        main.postDelayed(reconnect, Math.max(500L, jittered));
    }

    private void handleOpen(WebSocket opened, int socketGeneration) {
        if (!enabled || generation != socketGeneration || socket != opened) {
            opened.close(1000, "stale_connection");
            return;
        }
        retryAttempt = 0;
        StorefrontInstallationStore.recordRealtimeStatus(
                context,
                "connected",
                Instant.now().toString()
        );
    }

    private void handleTerminated(WebSocket terminated, int socketGeneration, String reason) {
        if (generation != socketGeneration || socket != terminated) return;
        socket = null;
        if (!enabled) return;
        StorefrontInstallationStore.recordRealtimeStatus(
                context,
                "unavailable",
                Instant.now().toString()
        );
        Log.w(LOG_TAG, "connection_ended reason=" + reason);
        scheduleReconnect();
    }

    private void handleMessage(WebSocket source, int socketGeneration, String rawMessage) {
        if (!enabled || generation != socketGeneration || socket != source
                || rawMessage == null || rawMessage.length() > 2_048) return;
        JSONObject message;
        try {
            message = new JSONObject(rawMessage);
        } catch (Exception error) {
            source.close(1008, "invalid_event");
            return;
        }
        String type = message.optString("type", "");
        if ("ready".equals(type)) {
            if (!hasExactKeys(message, Set.of("type", "version", "server_time"))
                    || message.optInt("version", 0) != 1
                    || !validTimestamp(message.optString("server_time", ""))) {
                source.close(1008, "invalid_event");
            }
            return;
        }
        if (!"sync_required".equals(type)
                || !hasExactKeys(message, Set.of("type", "version", "cursor", "server_time"))
                || message.optInt("version", 0) != 1
                || !RECORD_ID_PATTERN.matcher(message.optString("cursor", "")).matches()
                || !validTimestamp(message.optString("server_time", ""))) {
            source.close(1008, "invalid_event");
            return;
        }
        listener.onSyncRequired();
    }

    private static boolean validTimestamp(String value) {
        try {
            Instant.parse(value);
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static boolean hasExactKeys(JSONObject source, Set<String> expected) {
        Set<String> actual = new HashSet<>();
        Iterator<String> keys = source.keys();
        while (keys.hasNext()) actual.add(keys.next());
        return actual.equals(expected);
    }

    private final class SocketListener extends WebSocketListener {
        private final int socketGeneration;

        SocketListener(int socketGeneration) {
            this.socketGeneration = socketGeneration;
        }

        @Override
        public void onOpen(WebSocket webSocket, Response response) {
            main.post(() -> handleOpen(webSocket, socketGeneration));
        }

        @Override
        public void onMessage(WebSocket webSocket, String text) {
            main.post(() -> handleMessage(webSocket, socketGeneration, text));
        }

        @Override
        public void onMessage(WebSocket webSocket, ByteString bytes) {
            webSocket.close(1003, "text_events_only");
        }

        @Override
        public void onClosed(WebSocket webSocket, int code, String reason) {
            main.post(() -> handleTerminated(webSocket, socketGeneration, "closed"));
        }

        @Override
        public void onFailure(WebSocket webSocket, Throwable error, Response response) {
            main.post(() -> handleTerminated(webSocket, socketGeneration, "transport"));
        }
    }
}
