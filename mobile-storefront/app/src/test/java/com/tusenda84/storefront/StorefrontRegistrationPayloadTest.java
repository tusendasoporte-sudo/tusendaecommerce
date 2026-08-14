package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StorefrontRegistrationPayloadTest {
    @Test
    public void emitsExactRegisterContractWithoutSecretsBeyondFid() {
        String json = StorefrontRegistrationPayload.register(
                "abcdefghijklmnop",
                "0.1.0-staging",
                1,
                "16",
                "Google Pixel 9",
                "es-US",
                "America/New_York",
                "granted"
        );
        assertEquals(
                "{\"fid\":\"abcdefghijklmnop\",\"app_version\":\"0.1.0-staging\","
                        + "\"app_version_code\":1,\"android_version\":\"16\","
                        + "\"device_model\":\"Google Pixel 9\",\"locale\":\"es-US\","
                        + "\"timezone\":\"America/New_York\",\"notification_permission\":\"granted\"}",
                json
        );
        assertTrue(!json.contains("store_id") && !json.contains("credential") && !json.contains("ip"));
    }

    @Test
    public void emitsExactHeartbeatAndPermissionContracts() {
        assertEquals(
                "{\"app_version\":\"0.1.0-staging\",\"app_version_code\":1,"
                        + "\"android_version\":\"16\",\"device_model\":\"Pixel\","
                        + "\"locale\":\"en-US\",\"timezone\":\"UTC\"}",
                StorefrontRegistrationPayload.heartbeat("0.1.0-staging", 1, "16", "Pixel", "en-US", "UTC")
        );
        assertEquals(
                "{\"notification_permission\":\"denied\"}",
                StorefrontRegistrationPayload.permission("denied")
        );
        assertEquals("{}", StorefrontRegistrationPayload.empty());
    }

    @Test
    public void rejectsManipulatedOrOutOfContractValues() {
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.register(
                "short", "0.1.0", 1, "16", "Pixel", "en-US", "UTC", "granted"
        ));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.permission("allowed"));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.heartbeat(
                "0.1.0", 1, "16", "Pixel\nInjected", "en-US", "UTC"
        ));
    }

    @Test
    public void escapesJsonCharactersDeterministically() {
        assertEquals("\"PowerZona \\\"A\\\"\\\\B\"", StorefrontRegistrationPayload.quote("PowerZona \"A\"\\B"));
    }

    @Test
    public void classifiesNestedFailuresWithoutLeakingRawDetails() {
        RuntimeException integrity = new RuntimeException(
                "wrapper containing secret-material",
                new IllegalStateException("PlayIntegrity attestation rejected token=private")
        );
        assertEquals(
                "App Check/Play Integrity no pudo emitir una atestación válida.",
                StorefrontRegistrationClient.safeFailure(integrity)
        );

        RuntimeException network = new RuntimeException(
                "wrapper",
                new java.net.UnknownHostException("private.staging.example")
        );
        assertEquals(
                "No fue posible conectar con los servicios de staging.",
                StorefrontRegistrationClient.safeFailure(network)
        );
    }

    @Test
    public void messagingCallbackCannotRegisterMessagingAgain() {
        assertTrue(StorefrontRegistrationClient.shouldRequestMessagingRegistration(
                StorefrontRegistrationClient.RegistrationOrigin.APP_START
        ));
        assertTrue(StorefrontRegistrationClient.shouldRequestMessagingRegistration(
                StorefrontRegistrationClient.RegistrationOrigin.USER_ACTION
        ));
        assertTrue(!StorefrontRegistrationClient.shouldRequestMessagingRegistration(
                StorefrontRegistrationClient.RegistrationOrigin.MESSAGING_CALLBACK
        ));
    }
}
