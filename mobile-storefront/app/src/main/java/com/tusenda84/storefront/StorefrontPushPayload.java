package com.tusenda84.storefront;

import android.content.Intent;
import android.os.Bundle;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class StorefrontPushPayload {
    static final String SCHEMA_VERSION = "schema_version";
    static final String CHANNEL = "channel";
    static final String STORE_KEY = "store_key";
    static final String CAMPAIGN_ID = "campaign_id";
    static final String TITLE = "title";
    static final String BODY = "body";
    static final String TARGET_TYPE = "target_type";
    static final String TARGET_PATH = "target_path";
    static final String IMAGE_URL = "image_url";

    private static final Set<String> TARGET_TYPES = Set.of(
            "home", "product", "category", "section", "order", "raffle", "coupon"
    );
    private static final Pattern CAMPAIGN = Pattern.compile("^[a-z0-9]{15}$");
    private static final Pattern HTTPS_IMAGE = Pattern.compile("^https://[^\\s]{1,2039}$");

    final String storeKey;
    final String campaignId;
    final String title;
    final String body;
    final String targetType;
    final String targetPath;
    final String imageUrl;

    private StorefrontPushPayload(
            String storeKey,
            String campaignId,
            String title,
            String body,
            String targetType,
            String targetPath,
            String imageUrl
    ) {
        this.storeKey = storeKey;
        this.campaignId = campaignId;
        this.title = title;
        this.body = body;
        this.targetType = targetType;
        this.targetPath = targetPath;
        this.imageUrl = imageUrl;
    }

    static StorefrontPushPayload fromMap(Map<String, String> source, String expectedStoreKey) {
        if (source == null) return null;
        String schemaVersion = clean(source.get(SCHEMA_VERSION));
        String channel = clean(source.get(CHANNEL));
        String storeKey = StorefrontConfig.normalizeStoreKey(source.get(STORE_KEY));
        String expected = StorefrontConfig.normalizeStoreKey(expectedStoreKey);
        String campaignId = clean(source.get(CAMPAIGN_ID));
        String title = clean(source.get(TITLE));
        String body = clean(source.get(BODY));
        String targetType = clean(source.get(TARGET_TYPE));
        String targetPath = clean(source.get(TARGET_PATH));
        String imageUrl = clean(source.get(IMAGE_URL));

        if (!"1".equals(schemaVersion) || !"storefront".equals(channel)) return null;
        if (expected.isEmpty() || !expected.equals(storeKey)) return null;
        if (!CAMPAIGN.matcher(campaignId).matches() || !TARGET_TYPES.contains(targetType)) return null;
        if (title.length() > 120 || body.length() > 1000) return null;
        if (targetPath.length() > 500 || containsControl(targetPath)) return null;
        if (!imageUrl.isEmpty() && (!HTTPS_IMAGE.matcher(imageUrl).matches() || containsControl(imageUrl))) return null;
        if (!"order".equals(targetType) && targetPath.isEmpty()) return null;
        return new StorefrontPushPayload(
                storeKey,
                campaignId,
                title,
                body,
                targetType,
                targetPath,
                imageUrl
        );
    }

    static StorefrontPushPayload fromIntent(Intent intent, String expectedStoreKey) {
        if (intent == null) return null;
        Bundle extras = intent.getExtras();
        if (extras == null) return null;
        Map<String, String> values = new HashMap<>();
        for (String key : expectedKeys()) {
            Object value = extras.get(key);
            if (value instanceof String) values.put(key, (String) value);
        }
        return fromMap(values, expectedStoreKey);
    }

    void putInto(Intent intent) {
        intent.putExtra(SCHEMA_VERSION, "1");
        intent.putExtra(CHANNEL, "storefront");
        intent.putExtra(STORE_KEY, storeKey);
        intent.putExtra(CAMPAIGN_ID, campaignId);
        intent.putExtra(TITLE, title);
        intent.putExtra(BODY, body);
        intent.putExtra(TARGET_TYPE, targetType);
        intent.putExtra(TARGET_PATH, targetPath);
        intent.putExtra(IMAGE_URL, imageUrl);
    }

    private static Set<String> expectedKeys() {
        return Collections.unmodifiableSet(Set.of(
                SCHEMA_VERSION,
                CHANNEL,
                STORE_KEY,
                CAMPAIGN_ID,
                TITLE,
                BODY,
                TARGET_TYPE,
                TARGET_PATH,
                IMAGE_URL
        ));
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
