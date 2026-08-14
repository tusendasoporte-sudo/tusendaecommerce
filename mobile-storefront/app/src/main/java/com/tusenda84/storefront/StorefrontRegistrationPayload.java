package com.tusenda84.storefront;

import java.util.regex.Pattern;

final class StorefrontRegistrationPayload {
    private static final Pattern FID = Pattern.compile("^[A-Za-z0-9_-]{16,255}$");
    private static final Pattern VERSION = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._+()-]{0,39}$");
    private static final Pattern ANDROID = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9 ._+()-]{0,39}$");
    private static final Pattern LOCALE = Pattern.compile("^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}$");
    private static final Pattern TIMEZONE = Pattern.compile("^(?:UTC|GMT|[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z0-9_+-]+){1,3})$");
    private static final Pattern CAMPAIGN = Pattern.compile("^[a-z0-9]{15}$");

    private StorefrontRegistrationPayload() {}

    static String register(
            String fid,
            String appVersion,
            int appVersionCode,
            String androidVersion,
            String deviceModel,
            String locale,
            String timezone,
            String permission
    ) {
        require(fid, 255, FID);
        require(appVersion, 40, VERSION);
        requireVersionCode(appVersionCode);
        require(androidVersion, 40, ANDROID);
        require(deviceModel, 120, null);
        require(locale, 35, LOCALE);
        require(timezone, 80, TIMEZONE);
        requirePermission(permission);
        return "{"
                + "\"fid\":" + quote(fid)
                + ",\"app_version\":" + quote(appVersion)
                + ",\"app_version_code\":" + appVersionCode
                + ",\"android_version\":" + quote(androidVersion)
                + ",\"device_model\":" + quote(deviceModel)
                + ",\"locale\":" + quote(locale)
                + ",\"timezone\":" + quote(timezone)
                + ",\"notification_permission\":" + quote(permission)
                + "}";
    }

    static String heartbeat(
            String appVersion,
            int appVersionCode,
            String androidVersion,
            String deviceModel,
            String locale,
            String timezone
    ) {
        require(appVersion, 40, VERSION);
        requireVersionCode(appVersionCode);
        require(androidVersion, 40, ANDROID);
        require(deviceModel, 120, null);
        require(locale, 35, LOCALE);
        require(timezone, 80, TIMEZONE);
        return "{"
                + "\"app_version\":" + quote(appVersion)
                + ",\"app_version_code\":" + appVersionCode
                + ",\"android_version\":" + quote(androidVersion)
                + ",\"device_model\":" + quote(deviceModel)
                + ",\"locale\":" + quote(locale)
                + ",\"timezone\":" + quote(timezone)
                + "}";
    }

    static String permission(String permission) {
        requirePermission(permission);
        return "{\"notification_permission\":" + quote(permission) + "}";
    }

    static String empty() {
        return "{}";
    }

    static String resolveCampaignTarget(String campaignId) {
        require(campaignId, 15, CAMPAIGN);
        return "{\"campaign_id\":" + quote(campaignId) + "}";
    }

    private static void require(String value, int max, Pattern pattern) {
        if (value == null || value.isEmpty() || !value.equals(value.trim()) || value.length() > max) {
            throw new IllegalArgumentException("invalid_payload");
        }
        for (int index = 0; index < value.length(); index += 1) {
            char current = value.charAt(index);
            if (Character.isISOControl(current)) throw new IllegalArgumentException("invalid_payload");
            if (Character.isHighSurrogate(current)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
                    throw new IllegalArgumentException("invalid_payload");
                }
                index += 1;
            } else if (Character.isLowSurrogate(current)) {
                throw new IllegalArgumentException("invalid_payload");
            }
        }
        if (pattern != null && !pattern.matcher(value).matches()) {
            throw new IllegalArgumentException("invalid_payload");
        }
    }

    private static void requireVersionCode(int value) {
        if (value < 1) throw new IllegalArgumentException("invalid_payload");
    }

    private static void requirePermission(String value) {
        if (!"unknown".equals(value) && !"granted".equals(value) && !"denied".equals(value)) {
            throw new IllegalArgumentException("invalid_payload");
        }
    }

    static String quote(String value) {
        StringBuilder result = new StringBuilder(value.length() + 2).append('"');
        for (int index = 0; index < value.length(); index += 1) {
            char current = value.charAt(index);
            switch (current) {
                case '"': result.append("\\\""); break;
                case '\\': result.append("\\\\"); break;
                case '\b': result.append("\\b"); break;
                case '\f': result.append("\\f"); break;
                case '\n': result.append("\\n"); break;
                case '\r': result.append("\\r"); break;
                case '\t': result.append("\\t"); break;
                default:
                    if (current < 0x20) result.append(String.format("\\u%04x", (int) current));
                    else result.append(current);
            }
        }
        return result.append('"').toString();
    }
}
