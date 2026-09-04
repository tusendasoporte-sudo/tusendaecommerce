package com.tusenda84.admin;

import org.json.JSONObject;

import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class AdminPushPayload {
    private static final Pattern RECORD_ID = Pattern.compile("^[a-z0-9]{15}$");
    private static final Pattern TYPE = Pattern.compile("^[a-z0-9_]{1,80}$");
    private static final Set<String> PRIORITIES = immutableSet("normal", "important", "critical");
    private static final Set<String> FCM_KEYS = immutableSet(
            "notification_id", "store_id", "type", "title", "body", "target_url", "priority"
    );
    private static final Set<String> SYNC_KEYS = immutableSet(
            "notification_id", "schema_version", "channel", "store_id", "type",
            "title", "body", "target_url", "priority", "created_at", "expires_at"
    );

    final String notificationId;
    final String storeId;
    final String type;
    final String title;
    final String body;
    final String targetUrl;
    final String priority;

    private AdminPushPayload(
            String notificationId,
            String storeId,
            String type,
            String title,
            String body,
            String targetUrl,
            String priority
    ) {
        this.notificationId = notificationId;
        this.storeId = storeId;
        this.type = type;
        this.title = title;
        this.body = body;
        this.targetUrl = targetUrl;
        this.priority = priority;
    }

    static AdminPushPayload fromFcm(Map<String, String> source) {
        if (source == null || !source.keySet().equals(FCM_KEYS)) return null;
        return create(
                source.get("notification_id"),
                source.get("store_id"),
                source.get("type"),
                source.get("title"),
                source.get("body"),
                source.get("target_url"),
                source.get("priority")
        );
    }

    static AdminPushPayload fromSync(JSONObject source, Instant serverTime) {
        if (!hasExactKeys(source, SYNC_KEYS)
                || !"1".equals(source.optString("schema_version", ""))
                || !"admin".equals(source.optString("channel", ""))) return null;
        try {
            Instant createdAt = Instant.parse(source.optString("created_at", ""));
            Instant expiresAt = Instant.parse(source.optString("expires_at", ""));
            if (!expiresAt.isAfter(createdAt) || !expiresAt.isAfter(serverTime)) return null;
        } catch (Exception ignored) {
            return null;
        }
        return create(
                source.optString("notification_id", ""),
                source.optString("store_id", ""),
                source.optString("type", ""),
                source.optString("title", ""),
                source.optString("body", ""),
                source.optString("target_url", ""),
                source.optString("priority", "")
        );
    }

    private static AdminPushPayload create(
            String rawNotificationId,
            String rawStoreId,
            String rawType,
            String rawTitle,
            String rawBody,
            String rawTargetUrl,
            String rawPriority
    ) {
        String notificationId = clean(rawNotificationId);
        String storeId = clean(rawStoreId);
        String type = clean(rawType);
        String title = clean(rawTitle);
        String body = clean(rawBody);
        String targetUrl = clean(rawTargetUrl);
        String priority = clean(rawPriority);
        if (!RECORD_ID.matcher(notificationId).matches()
                || !RECORD_ID.matcher(storeId).matches()
                || !TYPE.matcher(type).matches()
                || title.isEmpty() || title.length() > 160 || containsControl(title)
                || body.isEmpty() || body.length() > 600 || containsControl(body)
                || targetUrl.length() > 500 || !targetUrl.startsWith("/") || targetUrl.startsWith("//")
                || containsControl(targetUrl)
                || !PRIORITIES.contains(priority)) return null;
        return new AdminPushPayload(
                notificationId,
                storeId,
                type,
                title,
                body,
                targetUrl,
                priority
        );
    }

    private static boolean hasExactKeys(JSONObject source, Set<String> expected) {
        if (source == null || source.length() != expected.size()) return false;
        Set<String> actual = new HashSet<>();
        Iterator<String> keys = source.keys();
        while (keys.hasNext()) actual.add(keys.next());
        return actual.equals(expected);
    }

    private static Set<String> immutableSet(String... values) {
        return Collections.unmodifiableSet(new HashSet<>(Arrays.asList(values)));
    }

    private static boolean containsControl(String value) {
        for (int index = 0; index < value.length(); index += 1) {
            if (Character.isISOControl(value.charAt(index))) return true;
        }
        return false;
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
