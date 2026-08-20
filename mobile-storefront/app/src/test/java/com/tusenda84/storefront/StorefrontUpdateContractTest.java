package com.tusenda84.storefront;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StorefrontUpdateContractTest {
    private static final String ARTIFACT = "abcde12345fghij";
    private static final String TICKET = "Abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE";
    private static final String SHA = "a".repeat(64);

    @Test
    public void privateTicketAllowsOnlyProductionHostFamilyAndExactPath() {
        String path = "/api/pz/storefront-app-updates/" + ARTIFACT + "/" + TICKET + "/powerzona-11.apk";
        assertTrue(StorefrontUpdateContract.allowedDownloadUrl(
                "https://tusenda84.com" + path,
                "https://tusenda84.com/t/powerzona"
        ));
        assertTrue(StorefrontUpdateContract.allowedDownloadUrl(
                "https://downloads.tusenda84.com" + path,
                "https://tusenda84.com/t/powerzona"
        ));
        assertFalse(StorefrontUpdateContract.allowedDownloadUrl(
                "https://evil-tusenda84.com" + path,
                "https://tusenda84.com/t/powerzona"
        ));
        assertFalse(StorefrontUpdateContract.allowedDownloadUrl(
                "https://tusenda84.com" + path + "?reuse=1",
                "https://tusenda84.com/t/powerzona"
        ));
        assertFalse(StorefrontUpdateContract.allowedDownloadUrl(
                "http://tusenda84.com" + path,
                "https://tusenda84.com/t/powerzona"
        ));
    }

    @Test
    public void artifactMetadataIsBoundedAndStrict() {
        assertTrue(StorefrontUpdateContract.validArtifact(
                ARTIFACT, "powerzona-11.apk", SHA, 24_000_000, 11, "0.2.9", "com.tusenda84.powerzona"
        ));
        assertFalse(StorefrontUpdateContract.validArtifact(
                ARTIFACT, "../powerzona.apk", SHA, 24_000_000, 11, "0.2.9", "com.tusenda84.powerzona"
        ));
        assertFalse(StorefrontUpdateContract.validArtifact(
                ARTIFACT, "powerzona-11.apk", SHA, StorefrontUpdateContract.MAX_APK_BYTES + 1,
                11, "0.2.9", "com.tusenda84.powerzona"
        ));
    }

    @Test
    public void verifiedPayloadBindsArtifactHashSizeAndVersion() {
        String payload = StorefrontUpdateContract.verifiedPayload(ARTIFACT, SHA, 24_000_000, 11);
        assertTrue(payload.contains("\"artifact_id\":\"" + ARTIFACT + "\""));
        assertTrue(payload.contains("\"bytes\":24000000"));
        assertTrue(payload.contains("\"sha256\":\"" + SHA + "\""));
        assertTrue(payload.contains("\"version_code\":11"));
    }
}
