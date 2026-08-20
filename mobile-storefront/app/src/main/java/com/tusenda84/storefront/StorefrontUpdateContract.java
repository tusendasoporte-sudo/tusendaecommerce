package com.tusenda84.storefront;

import org.json.JSONObject;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

final class StorefrontUpdateContract {
    static final long MAX_APK_BYTES = 100L * 1024L * 1024L;
    private static final Pattern RECORD_ID = Pattern.compile("^[a-z0-9]{15}$");
    private static final Pattern SHA256 = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern PACKAGE = Pattern.compile("^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$");
    private static final Pattern VERSION = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._+()-]{0,39}$");

    private StorefrontUpdateContract() {}

    static String policyPayload(String packageName, long versionCode, String versionName, String installSource) {
        try {
            return new JSONObject()
                    .put("package_name", packageName)
                    .put("version_code", versionCode)
                    .put("version_name", versionName)
                    .put("install_source", installSource)
                    .toString();
        } catch (Exception error) {
            throw new IllegalStateException("update_payload_invalid", error);
        }
    }

    static String ticketPayload(String artifactId) {
        try {
            return new JSONObject().put("artifact_id", artifactId).toString();
        } catch (Exception error) {
            throw new IllegalStateException("update_payload_invalid", error);
        }
    }

    static String verifiedPayload(String artifactId, String sha256, long bytes, long versionCode) {
        String safeArtifactId = clean(artifactId);
        String safeSha256 = normalized(sha256);
        if (!RECORD_ID.matcher(safeArtifactId).matches() || !SHA256.matcher(safeSha256).matches()
                || bytes < 1 || bytes > MAX_APK_BYTES || versionCode < 1 || versionCode > Integer.MAX_VALUE) {
            throw new IllegalStateException("update_payload_invalid");
        }
        return "{"
                + "\"artifact_id\":\"" + safeArtifactId + "\""
                + ",\"bytes\":" + bytes
                + ",\"sha256\":\"" + safeSha256 + "\""
                + ",\"version_code\":" + versionCode
                + "}";
    }

    static boolean validArtifact(String id, String fileName, String sha256, long bytes,
                                 long versionCode, String versionName, String packageName) {
        return RECORD_ID.matcher(clean(id)).matches()
                && clean(fileName).matches("^[A-Za-z0-9._-]+\\.apk$")
                && SHA256.matcher(normalized(sha256)).matches()
                && bytes > 0 && bytes <= MAX_APK_BYTES
                && versionCode > 0
                && VERSION.matcher(clean(versionName)).matches()
                && PACKAGE.matcher(clean(packageName)).matches();
    }

    static boolean validMetadata(String sha256, long versionCode, String packageName) {
        return SHA256.matcher(normalized(sha256)).matches()
                && versionCode > 0
                && PACKAGE.matcher(clean(packageName)).matches();
    }

    static boolean allowedDownloadUrl(String candidate, String storeUrl) {
        try {
            URI download = URI.create(clean(candidate));
            URI store = URI.create(clean(storeUrl));
            String downloadHost = normalized(download.getHost());
            String storeHost = normalized(store.getHost());
            if (!"https".equalsIgnoreCase(download.getScheme()) || download.getRawUserInfo() != null
                    || download.getRawQuery() != null || download.getRawFragment() != null
                    || downloadHost.isEmpty() || storeHost.isEmpty()
                    || (download.getPort() != -1 && download.getPort() != 443)
                    || !(downloadHost.equals(storeHost) || downloadHost.endsWith("." + storeHost))) return false;
            return download.getPath() != null
                    && download.getPath().matches("^/api/pz/storefront-app-updates/[a-z0-9]{15}/[A-Za-z0-9_-]{43}/[A-Za-z0-9._-]+\\.apk$");
        } catch (RuntimeException error) {
            return false;
        }
    }

    static String normalized(String value) {
        return clean(value).toLowerCase(Locale.ROOT);
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
