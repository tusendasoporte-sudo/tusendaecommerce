package com.tusenda84.storefront;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

final class StorefrontDeepLink {
    enum NavigationDecision {
        INTERNAL,
        EXTERNAL,
        BLOCKED
    }

    private static final Set<String> EXTERNAL_SCHEMES = Set.of(
            "tel", "mailto", "sms", "smsto", "geo", "market"
    );
    private static final Set<String> SECTION_PATHS = Set.of(
            "/buscar", "/links", "/regalos", "/rifa", "/checkout"
    );
    private static final Pattern SLUG = Pattern.compile("^[a-z0-9][a-z0-9_-]{0,159}$");
    private static final Pattern ORDER_NUMBER_SEGMENT = Pattern.compile("^[A-Za-z0-9_-]{1,80}$");
    private static final Pattern RECEIPT_TOKEN_SEGMENT = Pattern.compile("^[A-Za-z0-9_-]{6,80}$");
    private static final Pattern COUPON_VALUE = Pattern.compile("^[A-Za-z0-9._~%+-]{1,160}$");

    private StorefrontDeepLink() {}

    static NavigationDecision classifyNavigation(String rawUrl, String configuredStoreUrl) {
        URI candidate = parseAbsoluteHttps(rawUrl);
        if (candidate != null) {
            return isAllowedInternalNavigation(candidate, configuredStoreUrl)
                    ? NavigationDecision.INTERNAL
                    : isSameConfiguredHost(candidate, configuredStoreUrl)
                    ? NavigationDecision.BLOCKED
                    : NavigationDecision.EXTERNAL;
        }

        String scheme = scheme(rawUrl);
        return EXTERNAL_SCHEMES.contains(scheme)
                ? NavigationDecision.EXTERNAL
                : NavigationDecision.BLOCKED;
    }

    static boolean isAllowedInternalNavigation(String rawUrl, String configuredStoreUrl) {
        URI candidate = parseAbsoluteHttps(rawUrl);
        return candidate != null && isAllowedInternalNavigation(candidate, configuredStoreUrl);
    }

    static String resolvePushTarget(
            String configuredStoreUrl,
            String rawStoreKey,
            String rawTargetType,
            String rawTargetPath
    ) {
        String key = StorefrontConfig.normalizeStoreKey(rawStoreKey);
        String home = StorefrontConfig.normalizeStoreUrl(configuredStoreUrl, key);
        String type = clean(rawTargetType).toLowerCase(Locale.ROOT);
        String targetPath = clean(rawTargetPath);
        if (home.isEmpty()) return "";
        if ("home".equals(type)) return targetPath.equals("/t/" + key) ? home : home;
        if ("order".equals(type)) return home; // El recibo se resuelve con credencial, nunca desde FCM.
        if (!isAllowedPushPath(type, targetPath, key)) return home;

        try {
            URI homeUri = new URI(home);
            return "https://" + homeUri.getHost().toLowerCase(Locale.ROOT) + targetPath;
        } catch (URISyntaxException error) {
            return home;
        }
    }

    static String resolveServerOrderTarget(String configuredStoreUrl, String rawTargetPath) {
        URI configured = parseAbsoluteHttps(configuredStoreUrl);
        String targetPath = clean(rawTargetPath);
        if (configured == null || targetPath.length() > 500 || !isReceiptPath(targetPath)) {
            return StorefrontConfig.normalizeStoreUrl(configuredStoreUrl, StorefrontConfig.storeKey());
        }
        return "https://" + configured.getHost().toLowerCase(Locale.ROOT) + targetPath;
    }

    static String analyticsPath(String rawUrl, String configuredStoreUrl) {
        URI candidate = parseAbsoluteHttps(rawUrl);
        if (candidate == null || !isAllowedInternalNavigation(candidate, configuredStoreUrl)
                || candidate.getRawFragment() != null) return "";
        String path = clean(candidate.getRawPath());
        String query = clean(candidate.getRawQuery());
        return query.isEmpty() ? path : path + "?" + query;
    }

    private static boolean isAllowedInternalNavigation(URI candidate, String configuredStoreUrl) {
        URI configured = parseAbsoluteHttps(configuredStoreUrl);
        if (configured == null || !isAllowedHost(candidate.getHost(), configured.getHost())) return false;
        if (candidate.getRawUserInfo() != null || (candidate.getPort() != -1 && candidate.getPort() != 443)) return false;
        String rawPath = clean(candidate.getRawPath());
        if (hasAmbiguousPath(rawPath)) return false;

        String storePrefix = clean(configured.getRawPath());
        if (rawPath.equals(storePrefix) || rawPath.startsWith(storePrefix + "/")) return true;
        return isReceiptPath(rawPath);
    }

    private static boolean isSameConfiguredHost(URI candidate, String configuredStoreUrl) {
        URI configured = parseAbsoluteHttps(configuredStoreUrl);
        return configured != null && isAllowedHost(candidate.getHost(), configured.getHost());
    }

    private static boolean isAllowedPushPath(String type, String targetPath, String key) {
        if (targetPath.isEmpty() || !targetPath.startsWith("/") || targetPath.length() > 500) return false;
        if (hasAmbiguousPath(targetPath)) return false;
        String path = pathOnly(targetPath);
        String query = queryOnly(targetPath);
        String base = "/t/" + key;
        if ("product".equals(type)) return query == null && singleSlug(path, base + "/producto/");
        if ("category".equals(type)) return query == null && singleSlug(path, base + "/categoria/");
        if ("section".equals(type)) {
            return query == null && path.startsWith(base) && SECTION_PATHS.contains(path.substring(base.length()));
        }
        if ("raffle".equals(type)) {
            return query == null && (path.equals(base + "/rifa") || singleSlug(path, base + "/rifa/"));
        }
        if ("coupon".equals(type)) {
            return path.equals(base) && validCouponQuery(query);
        }
        return false;
    }

    private static boolean singleSlug(String path, String prefix) {
        if (!path.startsWith(prefix)) return false;
        String value = path.substring(prefix.length());
        return !value.contains("/") && SLUG.matcher(value).matches();
    }

    private static boolean validCouponQuery(String query) {
        if (query == null || !query.startsWith("coupon=") || query.contains("&")) return false;
        String value = query.substring("coupon=".length());
        if (!COUPON_VALUE.matcher(value).matches()) return false;
        for (int index = 0; index < value.length(); index += 1) {
            if (value.charAt(index) == '%') {
                if (index + 2 >= value.length() || !isHex(value.charAt(index + 1)) || !isHex(value.charAt(index + 2))) {
                    return false;
                }
                index += 2;
            }
        }
        return true;
    }

    private static boolean isReceiptPath(String path) {
        String[] parts = path.split("/", -1);
        return parts.length == 4
                && parts[0].isEmpty()
                && "orden".equals(parts[1])
                && ORDER_NUMBER_SEGMENT.matcher(parts[2]).matches()
                && RECEIPT_TOKEN_SEGMENT.matcher(parts[3]).matches();
    }

    private static URI parseAbsoluteHttps(String raw) {
        String value = clean(raw);
        if (value.isEmpty() || value.length() > 2048) return null;
        try {
            URI uri = new URI(value);
            if (!uri.isAbsolute() || !"https".equalsIgnoreCase(uri.getScheme()) || clean(uri.getHost()).isEmpty()) {
                return null;
            }
            if (uri.getRawUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
            return uri;
        } catch (URISyntaxException error) {
            return null;
        }
    }

    private static boolean isAllowedHost(String candidateRaw, String configuredRaw) {
        String candidate = clean(candidateRaw).toLowerCase(Locale.ROOT);
        String configured = clean(configuredRaw).toLowerCase(Locale.ROOT);
        if (candidate.isEmpty() || configured.isEmpty()) return false;
        if (candidate.equals(configured)) return true;
        if (configured.startsWith("www.")) return candidate.equals(configured.substring(4));
        return candidate.equals("www." + configured);
    }

    private static String scheme(String rawUrl) {
        try {
            return clean(new URI(clean(rawUrl)).getScheme()).toLowerCase(Locale.ROOT);
        } catch (URISyntaxException error) {
            return "";
        }
    }

    private static boolean hasAmbiguousPath(String raw) {
        String lower = clean(raw).toLowerCase(Locale.ROOT);
        return lower.contains("\\")
                || lower.contains("%2f")
                || lower.contains("%5c")
                || lower.contains("/../")
                || lower.endsWith("/..")
                || lower.contains("/./")
                || lower.endsWith("/.");
    }

    private static String pathOnly(String targetPath) {
        int query = targetPath.indexOf('?');
        return query < 0 ? targetPath : targetPath.substring(0, query);
    }

    private static String queryOnly(String targetPath) {
        int query = targetPath.indexOf('?');
        return query < 0 ? null : targetPath.substring(query + 1);
    }

    private static boolean isHex(char value) {
        return (value >= '0' && value <= '9')
                || (value >= 'a' && value <= 'f')
                || (value >= 'A' && value <= 'F');
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
