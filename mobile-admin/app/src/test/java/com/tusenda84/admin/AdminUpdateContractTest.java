package com.tusenda84.admin;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class AdminUpdateContractTest {
    @Test
    public void metadataRequiresChecksumVersionAndPackage() {
        assertTrue(AdminUpdateContract.validMetadata("a".repeat(64), 4, "com.tusenda84.admin"));
        assertFalse(AdminUpdateContract.validMetadata("a".repeat(63), 4, "com.tusenda84.admin"));
        assertFalse(AdminUpdateContract.validMetadata("a".repeat(64), 0, "com.tusenda84.admin"));
        assertFalse(AdminUpdateContract.validMetadata("a".repeat(64), 4, "bad-package"));
    }

    @Test
    public void downloadMustUseConfiguredHttpsOriginAndPrivatePath() {
        String configured = "https://admin.example.test/admin";
        assertTrue(AdminUpdateContract.allowedDownloadUrl(
                "https://admin.example.test/api/admin/mobile-app/download/artifact/ticket/app.apk", configured));
        assertFalse(AdminUpdateContract.allowedDownloadUrl(
                "https://evil.example.test/api/admin/mobile-app/download/artifact/ticket/app.apk", configured));
        assertFalse(AdminUpdateContract.allowedDownloadUrl(
                "http://admin.example.test/api/admin/mobile-app/download/artifact/ticket/app.apk", configured));
        assertFalse(AdminUpdateContract.allowedDownloadUrl("https://admin.example.test/files/app.apk", configured));
    }
}
