package com.tusenda84.storefront;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

final class StorefrontNotificationStore {
    private static final String PREFERENCES = "pz_storefront_notifications_v1";
    private static final String DISPLAYED = "displayed";
    private static final String RECEIPTS = "receipts";
    private static final int MAX_DISPLAYED = 256;
    private static final int MAX_RECEIPTS = 250;
    private static final int RECEIPT_BATCH = 50;
    private static final long RECEIPT_RETENTION_SECONDS = 30L * 24L * 60L * 60L;
    private static final long FUTURE_TOLERANCE_SECONDS = 5L * 60L;
    private static final Pattern RECORD_ID = Pattern.compile("^[a-z0-9]{15}$");
    private static final Set<String> RECEIPT_STATES = Set.of(
            "fcm_received", "native_delivered", "read"
    );
    static final String TRIGGER_FCM = "fcm";
    static final String TRIGGER_WEBSOCKET_SYNC = "websocket_sync";
    static final String TRIGGER_FOREGROUND_POLL = "foreground_poll";
    static final String TRIGGER_RESUME_SYNC = "resume_sync";
    static final String TRIGGER_WORKMANAGER = "workmanager";
    private static final Set<String> DELIVERY_TRIGGERS = Set.of(
            TRIGGER_FCM,
            TRIGGER_WEBSOCKET_SYNC,
            TRIGGER_FOREGROUND_POLL,
            TRIGGER_RESUME_SYNC,
            TRIGGER_WORKMANAGER
    );

    static final class ReceiptBatch {
        final String body;
        final List<String> keys;
        final int count;

        ReceiptBatch(String body, List<String> keys, int count) {
            this.body = body;
            this.keys = keys;
            this.count = count;
        }
    }

    private StorefrontNotificationStore() {}

    static synchronized boolean wasDisplayed(Context context, String notificationId) {
        String id = validId(notificationId);
        if (id.isEmpty()) return false;
        JSONArray values = readArray(preferences(context).getString(DISPLAYED, "[]"));
        for (int index = 0; index < values.length(); index += 1) {
            if (id.equals(values.optString(index, ""))) return true;
        }
        return false;
    }

    static synchronized void markDisplayed(Context context, String notificationId) {
        String id = validId(notificationId);
        if (id.isEmpty()) return;
        JSONArray current = readArray(preferences(context).getString(DISPLAYED, "[]"));
        List<String> values = new ArrayList<>();
        for (int index = 0; index < current.length(); index += 1) {
            String item = validId(current.optString(index, ""));
            if (!item.isEmpty() && !id.equals(item) && !values.contains(item)) values.add(item);
        }
        values.add(id);
        int start = Math.max(0, values.size() - MAX_DISPLAYED);
        JSONArray stored = new JSONArray();
        for (int index = start; index < values.size(); index += 1) stored.put(values.get(index));
        preferences(context).edit().putString(DISPLAYED, stored.toString()).apply();
    }

    static void queueReceipt(Context context, String notificationId, String state) {
        queueReceipt(context, notificationId, state, "");
    }

    static synchronized void queueReceipt(
            Context context,
            String notificationId,
            String state,
            String deliveryTrigger
    ) {
        String id = validId(notificationId);
        String normalizedState = state == null ? "" : state.trim();
        String normalizedTrigger = deliveryTrigger == null ? "" : deliveryTrigger.trim();
        if (id.isEmpty() || !RECEIPT_STATES.contains(normalizedState)
                || !validDeliveryTrigger(normalizedState, normalizedTrigger)) return;
        String key = receiptKey(id, normalizedState);
        JSONArray current = readArray(preferences(context).getString(RECEIPTS, "[]"));
        List<JSONObject> values = new ArrayList<>();
        Set<String> retainedKeys = new HashSet<>();
        boolean alreadyQueued = false;
        for (int index = 0; index < current.length(); index += 1) {
            JSONObject item = current.optJSONObject(index);
            if (!validReceipt(item)) continue;
            String retainedKey = item.optString("key", "");
            if (!retainedKeys.add(retainedKey)) continue;
            values.add(item);
            if (key.equals(retainedKey)) alreadyQueued = true;
        }
        if (!alreadyQueued) {
            JSONObject receipt = new JSONObject();
            try {
                receipt.put("key", key);
                receipt.put("notification_id", id);
                receipt.put("state", normalizedState);
                receipt.put("occurred_at", Instant.now().toString());
                if (!normalizedTrigger.isEmpty()) {
                    receipt.put("delivery_trigger", normalizedTrigger);
                }
            } catch (Exception ignored) {
                return;
            }
            values.add(receipt);
        }
        int start = Math.max(0, values.size() - MAX_RECEIPTS);
        JSONArray stored = new JSONArray();
        for (int index = start; index < values.size(); index += 1) stored.put(values.get(index));
        preferences(context).edit().putString(RECEIPTS, stored.toString()).apply();
    }

    static synchronized ReceiptBatch pendingBatch(Context context) {
        JSONArray current = readArray(preferences(context).getString(RECEIPTS, "[]"));
        JSONArray payload = new JSONArray();
        JSONArray retained = new JSONArray();
        List<String> keys = new ArrayList<>();
        Instant now = Instant.now();
        for (int index = 0; index < current.length(); index += 1) {
            JSONObject item = current.optJSONObject(index);
            if (!validReceipt(item) || !withinRetention(item, now)) continue;
            retained.put(item);
            if (payload.length() >= RECEIPT_BATCH) continue;
            JSONObject receipt = new JSONObject();
            try {
                receipt.put("notification_id", item.optString("notification_id", ""));
                receipt.put("state", item.optString("state", ""));
                receipt.put("occurred_at", item.optString("occurred_at", ""));
                String deliveryTrigger = item.optString("delivery_trigger", "");
                if (!deliveryTrigger.isEmpty()) receipt.put("delivery_trigger", deliveryTrigger);
            } catch (Exception ignored) {
                continue;
            }
            payload.put(receipt);
            keys.add(item.optString("key", ""));
        }
        preferences(context).edit().putString(RECEIPTS, retained.toString()).apply();
        JSONObject body = new JSONObject();
        try { body.put("receipts", payload); }
        catch (Exception ignored) { return new ReceiptBatch("{}", List.of(), 0); }
        return new ReceiptBatch(body.toString(), List.copyOf(keys), keys.size());
    }

    static synchronized void acknowledge(Context context, List<String> acknowledgedKeys) {
        if (acknowledgedKeys == null || acknowledgedKeys.isEmpty()) return;
        Set<String> acknowledged = new HashSet<>(acknowledgedKeys);
        JSONArray current = readArray(preferences(context).getString(RECEIPTS, "[]"));
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < current.length(); index += 1) {
            JSONObject item = current.optJSONObject(index);
            if (validReceipt(item) && !acknowledged.contains(item.optString("key", ""))) {
                remaining.put(item);
            }
        }
        preferences(context).edit().putString(RECEIPTS, remaining.toString()).apply();
    }

    private static boolean validReceipt(JSONObject item) {
        if (item == null || (item.length() != 4 && item.length() != 5)) return false;
        if (item.length() == 5 && !item.has("delivery_trigger")) return false;
        String id = validId(item.optString("notification_id", ""));
        String state = item.optString("state", "");
        String key = item.optString("key", "");
        String occurredAt = item.optString("occurred_at", "");
        String deliveryTrigger = item.optString("delivery_trigger", "");
        if (id.isEmpty() || !RECEIPT_STATES.contains(state) || !receiptKey(id, state).equals(key)
                || !validDeliveryTrigger(state, deliveryTrigger)) return false;
        try { Instant.parse(occurredAt); return true; }
        catch (Exception ignored) { return false; }
    }

    static boolean validDeliveryTrigger(String state, String deliveryTrigger) {
        if (deliveryTrigger.isEmpty()) return true;
        if (!DELIVERY_TRIGGERS.contains(deliveryTrigger)) return false;
        if ("fcm_received".equals(state)) return TRIGGER_FCM.equals(deliveryTrigger);
        return !"read".equals(state);
    }

    private static boolean withinRetention(JSONObject item, Instant now) {
        try {
            Instant occurred = Instant.parse(item.optString("occurred_at", ""));
            return !occurred.isBefore(now.minusSeconds(RECEIPT_RETENTION_SECONDS))
                    && !occurred.isAfter(now.plusSeconds(FUTURE_TOLERANCE_SECONDS));
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String receiptKey(String notificationId, String state) {
        return notificationId + ":" + state;
    }

    private static String validId(String raw) {
        String value = raw == null ? "" : raw.trim();
        return RECORD_ID.matcher(value).matches() ? value : "";
    }

    private static JSONArray readArray(String raw) {
        try { return new JSONArray(raw == null ? "[]" : raw); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
