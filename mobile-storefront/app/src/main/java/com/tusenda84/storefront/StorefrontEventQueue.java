package com.tusenda84.storefront;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

final class StorefrontEventQueue {
    private static final String PREFERENCES = "pz_storefront_analytics_v1";
    private static final String EVENTS = "pending_events";
    static final int MAX_EVENTS = 64;
    static final int MAX_ATTEMPTS = 10;
    static final long MAX_AGE_MS = 7L * 24L * 60L * 60L * 1000L;
    private static final Pattern RECORD_ID = Pattern.compile("^[a-z0-9]{15}$");
    private static final Pattern STOREFRONT_PATH = Pattern.compile("^/t/[a-z0-9]+(?:-[a-z0-9]+)*(?:/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(?:\\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$");

    static final class Event {
        final String eventType;
        final String deliveryId;
        final String occurredAt;
        final String targetPath;
        final int attempts;

        Event(String eventType, String deliveryId, String occurredAt, String targetPath, int attempts) {
            this.eventType = eventType;
            this.deliveryId = deliveryId;
            this.occurredAt = occurredAt;
            this.targetPath = targetPath;
            this.attempts = attempts;
        }

        String key() {
            return eventType + ":" + deliveryId;
        }
    }

    private StorefrontEventQueue() {}

    static synchronized boolean enqueue(
            Context context,
            String eventType,
            String deliveryId,
            String targetPath
    ) {
        String safeTarget = targetPath == null ? "" : targetPath.trim();
        if (!validEvent(eventType, deliveryId, safeTarget)) return false;
        List<Event> events = read(context, System.currentTimeMillis());
        String key = eventType + ":" + deliveryId;
        for (Event event : events) if (event.key().equals(key)) return false;
        write(context, withEvent(events, new Event(
                eventType, deliveryId, Instant.now().toString(), safeTarget, 0
        )));
        return true;
    }

    static synchronized List<Event> pending(Context context) {
        List<Event> events = read(context, System.currentTimeMillis());
        write(context, events);
        return new ArrayList<>(events);
    }

    static synchronized void remove(Context context, String key) {
        write(context, withoutEvent(read(context, System.currentTimeMillis()), key));
    }

    static synchronized void recordAttempt(Context context, String key) {
        write(context, withRecordedAttempt(read(context, System.currentTimeMillis()), key));
    }

    static List<Event> withEvent(List<Event> source, Event incoming) {
        List<Event> next = new ArrayList<>(source == null ? java.util.Collections.emptyList() : source);
        if (incoming == null || !validEvent(incoming.eventType, incoming.deliveryId, incoming.targetPath)) return next;
        for (Event event : next) if (event.key().equals(incoming.key())) return next;
        next.add(incoming);
        while (next.size() > MAX_EVENTS) next.remove(0);
        return next;
    }

    static List<Event> withoutEvent(List<Event> source, String key) {
        List<Event> next = new ArrayList<>(source == null ? java.util.Collections.emptyList() : source);
        next.removeIf(event -> event.key().equals(key));
        return next;
    }

    static List<Event> withRecordedAttempt(List<Event> source, String key) {
        List<Event> next = new ArrayList<>();
        for (Event event : source == null ? java.util.Collections.<Event>emptyList() : source) {
            if (!event.key().equals(key)) {
                next.add(event);
            } else if (event.attempts + 1 < MAX_ATTEMPTS) {
                next.add(new Event(
                        event.eventType,
                        event.deliveryId,
                        event.occurredAt,
                        event.targetPath,
                        event.attempts + 1
                ));
            }
        }
        return next;
    }

    private static List<Event> read(Context context, long nowMs) {
        return decode(preferences(context).getString(EVENTS, "[]"), nowMs);
    }

    static List<Event> decode(String raw, long nowMs) {
        List<Event> result = new ArrayList<>();
        try {
            JSONArray source = new JSONArray(raw == null ? "[]" : raw);
            for (int index = 0; index < source.length(); index++) {
                JSONObject item = source.optJSONObject(index);
                if (item == null) continue;
                String type = item.optString("event_type", "");
                String delivery = item.optString("delivery_id", "");
                String occurred = item.optString("occurred_at", "");
                String target = item.optString("target_path", "");
                int attempts = item.optInt("attempts", 0);
                result.add(new Event(type, delivery, occurred, target, attempts));
            }
        } catch (Exception ignored) {}
        return pruned(result, nowMs);
    }

    static List<Event> pruned(List<Event> source, long nowMs) {
        List<Event> result = new ArrayList<>();
        for (Event event : source == null ? java.util.Collections.<Event>emptyList() : source) {
            Instant instant;
            try { instant = Instant.parse(event.occurredAt); } catch (Exception ignored) { continue; }
            if (nowMs - instant.toEpochMilli() >= MAX_AGE_MS
                    || event.attempts < 0 || event.attempts >= MAX_ATTEMPTS
                    || !validEvent(event.eventType, event.deliveryId, event.targetPath)) continue;
            result.add(new Event(
                    event.eventType,
                    event.deliveryId,
                    instant.toString(),
                    event.targetPath,
                    event.attempts
            ));
        }
        while (result.size() > MAX_EVENTS) result.remove(0);
        return result;
    }

    private static void write(Context context, List<Event> events) {
        preferences(context).edit().putString(EVENTS, encode(events)).apply();
    }

    static String encode(List<Event> events) {
        JSONArray target = new JSONArray();
        for (Event event : events == null ? java.util.Collections.<Event>emptyList() : events) {
            JSONObject item = new JSONObject();
            try {
                item.put("event_type", event.eventType);
                item.put("delivery_id", event.deliveryId);
                item.put("occurred_at", event.occurredAt);
                item.put("target_path", event.targetPath);
                item.put("attempts", event.attempts);
                target.put(item);
            } catch (Exception ignored) {}
        }
        return target.toString();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static boolean validEvent(String type, String deliveryId, String targetPath) {
        if (!("opened".equals(type) || "destination_viewed".equals(type))
                || deliveryId == null || !RECORD_ID.matcher(deliveryId).matches()) return false;
        String target = targetPath == null ? "" : targetPath;
        if (target.length() > 500 || !target.equals(target.trim())) return false;
        if ("opened".equals(type)) return target.isEmpty();
        return "__order_verified__".equals(target) || STOREFRONT_PATH.matcher(target).matches();
    }
}
