package com.tusenda84.admin;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

final class AdminUpdateContract {
    static final long MAX_APK_BYTES = 100L * 1024L * 1024L;
    private static final Pattern SHA256 = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern PACKAGE = Pattern.compile("^[a-z][a-z0-9_]*(?:\\.[a-z][a-z0-9_]*)+$");

    private AdminUpdateContract() {}

    static boolean validMetadata(String sha256, long versionCode, String packageName) {
        return SHA256.matcher(normalized(sha256)).matches()
                && versionCode > 0
                && packageName != null
                && PACKAGE.matcher(packageName.trim()).matches();
    }

    static boolean allowedDownloadUrl(String candidate, String configuredAdminUrl) {
        try {
            URI download = URI.create(candidate == null ? "" : candidate.trim());
            URI configured = URI.create(configuredAdminUrl == null ? "" : configuredAdminUrl.trim());
            if (!"https".equalsIgnoreCase(download.getScheme()) || download.getUserInfo() != null
                    || download.getFragment() != null || download.getHost() == null) return false;
            return normalized(download.getHost()).equals(normalized(configured.getHost()))
                    && download.getPort() == configured.getPort()
                    && download.getPath() != null
                    && download.getPath().startsWith("/api/admin/mobile-app/download/");
        } catch (RuntimeException error) {
            return false;
        }
    }

    static String normalized(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
