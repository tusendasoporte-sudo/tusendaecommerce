package com.tusenda84.admin;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

final class AdminNotificationStore {
    static final String TRIGGER_FCM = "fcm";
    static final String TRIGGER_FOREGROUND = "foreground_poll";
    static final String TRIGGER_RESUME = "resume_sync";
    static final String TRIGGER_WORKMANAGER = "workmanager";
    private static final String PREFERENCES = "pz_admin_notifications_v2";
    private static final String DISPLAYED = "displayed";
    private static final String RECEIPTS = "receipts";
    private static final int MAX_DISPLAYED = 512;
    private static final int MAX_RECEIPTS = 250;
    private static final int RECEIPT_BATCH = 50;
    private static final Pattern RECORD_ID = Pattern.compile("^[a-z0-9]{15}$");
    private static final Set<String> STATES = immutableSet(
            "fcm_received", "native_delivered", "read"
    );
    private static final Set<String> TRIGGERS = immutableSet(
            TRIGGER_FCM, TRIGGER_FOREGROUND, TRIGGER_RESUME, TRIGGER_WORKMANAGER
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

    private AdminNotificationStore() {}

    static synchronized boolean wasDisplayed(Context context, String notificationId) {
        String id = validId(notificationId);
        if (id.isEmpty()) return false;
        JSONArray values = array(preferences(context).getString(DISPLAYED, "[]"));
        for (int index = 0; index < values.length(); index += 1) {
            if (id.equals(values.optString(index, ""))) return true;
        }
        return false;
    }

    static synchronized void markDisplayed(Context context, String notificationId) {
        String id = validId(notificationId);
        if (id.isEmpty()) return;
        JSONArray current = array(preferences(context).getString(DISPLAYED, "[]"));
        List<String> values = new ArrayList<>();
        for (int index = 0; index < current.length(); index += 1) {
            String value = validId(current.optString(index, ""));
            if (!value.isEmpty() && !value.equals(id) && !values.contains(value)) values.add(value);
        }
        values.add(id);
        JSONArray stored = new JSONArray();
        for (int index = Math.max(0, values.size() - MAX_DISPLAYED); index < values.size(); index += 1) {
            stored.put(values.get(index));
        }
        preferences(context).edit().putString(DISPLAYED, stored.toString()).apply();
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
        if (id.isEmpty() || !STATES.contains(normalizedState)
                || ("read".equals(normalizedState) && !normalizedTrigger.isEmpty())
                || ("fcm_received".equals(normalizedState) && !TRIGGER_FCM.equals(normalizedTrigger))
                || ("native_delivered".equals(normalizedState) && !TRIGGERS.contains(normalizedTrigger))) {
            return;
        }
        String key = id + ":" + normalizedState;
        JSONArray current = array(preferences(context).getString(RECEIPTS, "[]"));
        List<JSONObject> retained = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        boolean exists = false;
        for (int index = 0; index < current.length(); index += 1) {
            JSONObject item = current.optJSONObject(index);
            if (!validReceipt(item)) continue;
            String currentKey = item.optString("key", "");
            if (!seen.add(currentKey)) continue;
            retained.add(item);
            if (key.equals(currentKey)) exists = true;
        }
        if (!exists) {
            JSONObject receipt = new JSONObject();
            try {
                receipt.put("key", key);
                receipt.put("notification_id", id);
                receipt.put("state", normalizedState);
                receipt.put("occurred_at", Instant.now().toString());
                receipt.put("delivery_trigger", normalizedTrigger);
                retained.add(receipt);
            } catch (Exception ignored) {
                return;
            }
        }
        JSONArray stored = new JSONArray();
        for (int index = Math.max(0, retained.size() - MAX_RECEIPTS); index < retained.size(); index += 1) {
            stored.put(retained.get(index));
        }
        preferences(context).edit().putString(RECEIPTS, stored.toString()).apply();
    }

    static synchronized ReceiptBatch pendingBatch(Context context) {
        JSONArray current = array(preferences(context).getString(RECEIPTS, "[]"));
        JSONArray payload = new JSONArray();
        List<String> keys = new ArrayList<>();
        for (int index = 0; index < current.length() && payload.length() < RECEIPT_BATCH; index += 1) {
            JSONObject item = current.optJSONObject(index);
            if (!validReceipt(item)) continue;
            JSONObject receipt = new JSONObject();
            try {
                receipt.put("notification_id", item.optString("notification_id", ""));
                receipt.put("state", item.optString("state", ""));
                receipt.put("occurred_at", item.optString("occurred_at", ""));
                receipt.put("delivery_trigger", item.optString("delivery_trigger", ""));
                payload.put(receipt);
                keys.add(item.optString("key", ""));
            } catch (Exception ignored) {
            }
        }
        JSONObject body = new JSONObject();
        try { body.put("receipts", payload); }
        catch (Exception ignored) { return new ReceiptBatch("{}", Collections.emptyList(), 0); }
        return new ReceiptBatch(
                body.toString(),
                Collections.unmodifiableList(new ArrayList<>(keys)),
                keys.size()
        );
    }

    static synchronized void acknowledge(Context context, List<String> acknowledgedKeys) {
        if (acknowledgedKeys == null || acknowledgedKeys.isEmpty()) return;
        Set<String> acknowledged = new HashSet<>(acknowledgedKeys);
        JSONArray current = array(preferences(context).getString(RECEIPTS, "[]"));
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
        if (item == null || item.length() != 5) return false;
        String id = validId(item.optString("notification_id", ""));
        String state = item.optString("state", "");
        String trigger = item.optString("delivery_trigger", "");
        if (id.isEmpty() || !STATES.contains(state)
                || !item.optString("key", "").equals(id + ":" + state)) return false;
        if ("read".equals(state) && !trigger.isEmpty()) return false;
        if ("fcm_received".equals(state) && !TRIGGER_FCM.equals(trigger)) return false;
        if ("native_delivered".equals(state) && !TRIGGERS.contains(trigger)) return false;
        try {
            Instant.parse(item.optString("occurred_at", ""));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String validId(String value) {
        String id = value == null ? "" : value.trim();
        return RECORD_ID.matcher(id).matches() ? id : "";
    }

    private static JSONArray array(String value) {
        try { return new JSONArray(value == null ? "[]" : value); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static Set<String> immutableSet(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
