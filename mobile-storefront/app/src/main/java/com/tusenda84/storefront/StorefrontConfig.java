package com.tusenda84.storefront;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

final class StorefrontConfig {
    static final String REGISTER_PATH = "/api/storefront/v1/installations/register";
    static final String HEARTBEAT_PATH = "/api/storefront/v1/installations/heartbeat";
    static final String PERMISSION_PATH = "/api/storefront/v1/installations/permission";
    static final String DISABLE_PATH = "/api/storefront/v1/installations/disable";
    static final String BOOTSTRAP_PATH = "/api/storefront/v1/session/bootstrap";

    private StorefrontConfig() {}

    static String apiBaseUrl() {
        return normalizeHttpsOrigin(BuildConfig.API_BASE_URL);
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
            String host = clean(uri.getHost()).toLowerCase(Locale.ROOT);
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

    static boolean sameOrigin(String first, String second) {
        String left = normalizeUrlOrigin(first);
        String right = normalizeUrlOrigin(second);
        return !left.isEmpty() && left.equals(right);
    }

    private static String normalizeUrlOrigin(String raw) {
        try {
            URI uri = new URI(clean(raw));
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return "";
            int port = uri.getPort();
            if (port != -1 && port != 443) return "";
            return "https://" + uri.getHost().toLowerCase(Locale.ROOT);
        } catch (URISyntaxException error) {
            return "";
        }
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
