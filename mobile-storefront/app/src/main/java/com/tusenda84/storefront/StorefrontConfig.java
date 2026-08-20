package com.tusenda84.storefront;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;

final class StorefrontConfig {
    static final String REGISTER_PATH = "/api/storefront/v1/installations/register";
    static final String HEARTBEAT_PATH = "/api/storefront/v1/installations/heartbeat";
    static final String PERMISSION_PATH = "/api/storefront/v1/installations/permission";
    static final String DISABLE_PATH = "/api/storefront/v1/installations/disable";
    static final String BOOTSTRAP_PATH = "/api/storefront/v1/session/bootstrap";
    static final String RESOLVE_TARGET_PATH = "/api/storefront/v1/campaigns/resolve-target";
    static final String EVENTS_PATH = "/api/storefront/v1/events";
    static final String UPDATE_POLICY_PATH = "/api/storefront/v1/updates/policy";
    static final String UPDATE_TICKET_PATH = "/api/storefront/v1/updates/ticket";

    private static final Pattern STORE_KEY = Pattern.compile("^[a-z0-9][a-z0-9-]{1,62}$");
    private static final Pattern APP_KEY = Pattern.compile("^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$");

    private StorefrontConfig() {}

    static String apiBaseUrl() {
        return normalizeHttpsOrigin(BuildConfig.API_BASE_URL);
    }

    static String storeKey() {
        return normalizeStoreKey(BuildConfig.STORE_KEY);
    }

    static String appKey() {
        return normalizeAppKey(BuildConfig.APP_KEY);
    }

    static String storeUrl() {
        return normalizeStoreUrl(BuildConfig.STORE_URL, storeKey());
    }

    static String displayName() {
        String value = clean(BuildConfig.APP_DISPLAY_NAME);
        if (value.isEmpty() || value.length() > 60 || containsControl(value)) return "Storefront";
        return value;
    }

    static String endpoint(String path) {
        String base = apiBaseUrl();
        if (base.isEmpty() || path == null || !path.startsWith("/")) return "";
        return base + path;
    }

    static String normalizeHttpsOrigin(String raw) {
        String value = clean(raw);
        if (value.isEmpty() || value.length() > 2048) return "";
        try {
            URI uri = new URI(value);
            String scheme = clean(uri.getScheme()).toLowerCase(Locale.ROOT);
            String host = normalizedHost(uri.getHost());
            String path = clean(uri.getRawPath());
            if (!"https".equals(scheme) || host.isEmpty() || uri.getRawUserInfo() != null) return "";
            if (uri.getPort() != -1 && uri.getPort() != 443) return "";
            if (!path.isEmpty() && !"/".equals(path)) return "";
            if (uri.getRawQuery() != null || uri.getRawFragment() != null) return "";
            return "https://" + host;
        } catch (URISyntaxException error) {
            return "";
        }
    }

    static String normalizeStoreKey(String raw) {
        String value = clean(raw).toLowerCase(Locale.ROOT);
        return STORE_KEY.matcher(value).matches() ? value : "";
    }

    static String normalizeAppKey(String raw) {
        String value = clean(raw).toLowerCase(Locale.ROOT);
        return APP_KEY.matcher(value).matches() ? value : "";
    }

    static String normalizeStoreUrl(String raw, String rawStoreKey) {
        String value = clean(raw);
        String key = normalizeStoreKey(rawStoreKey);
        if (value.isEmpty() || value.length() > 2048 || key.isEmpty()) return "";
        try {
            URI uri = new URI(value);
            String host = normalizedHost(uri.getHost());
            String expectedPath = "/t/" + key;
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host.isEmpty()) return "";
            if (uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return "";
            if (!expectedPath.equals(uri.getRawPath())) return "";
            if (uri.getRawQuery() != null || uri.getRawFragment() != null) return "";
            return "https://" + host + expectedPath;
        } catch (URISyntaxException error) {
            return "";
        }
    }

    static boolean sameOrigin(String first, String second) {
        String left = normalizeUrlOrigin(first);
        String right = normalizeUrlOrigin(second);
        return !left.isEmpty() && left.equals(right);
    }

    static boolean isConfigured() {
        return !appKey().isEmpty() && !storeKey().isEmpty() && !storeUrl().isEmpty();
    }

    private static String normalizeUrlOrigin(String raw) {
        try {
            URI uri = new URI(clean(raw));
            String host = normalizedHost(uri.getHost());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host.isEmpty() || uri.getRawUserInfo() != null) {
                return "";
            }
            int port = uri.getPort();
            if (port != -1 && port != 443) return "";
            return "https://" + host;
        } catch (URISyntaxException error) {
            return "";
        }
    }

    private static String normalizedHost(String value) {
        String host = clean(value).toLowerCase(Locale.ROOT);
        if (host.isEmpty() || host.endsWith(".") || containsControl(host)) return "";
        return host;
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
